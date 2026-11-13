import { Renderer } from "../render/Renderer";
import type { TileCache } from "../world/cache";
import { CollisionWorld, nearestDriveable, pushCircles } from "../world/collision";
import { MPS_TO_KMH, MPS_TO_MPH, TILE_ZOOM, WALK_SPEED_MPS, type SpeedUnit } from "../world/config";
import { lonLatToMercator, mercatorToLonLat, mercatorToTile, mercatorUnitsPerGroundMeter, tileKey, type TileId } from "../world/project";
import { TileStream } from "../world/stream";
import type { ParkedCar } from "../world/types";
import { stepDrive } from "./drive";
import { Input } from "./input";
import { pedFromSpawn, stepPed, type Ped } from "./peds";

export class Game {
  private readonly input = new Input();
  private readonly renderer: Renderer;
  private readonly stream: TileStream;
  private readonly collision = new CollisionWorld();
  private collisionStamp = "";
  private raf = 0;
  private last = 0;
  private running = false;
  private snapped = false;
  private mode: "foot" | "car" = "foot";
  private x: number;
  private y: number;
  private heading = Math.PI / 2;
  private speed = 0;
  private vx = 0;
  private vy = 0;
  private camX: number;
  private camY: number;
  private camera: "north" | "follow" = "north";
  private carId = "";
  private carColor = "#d8a12e";
  private readonly taken = new Set<string>();
  private loose: ParkedCar[] = [];
  private peds: Ped[] = [];
  private scale = 1;
  private unit: SpeedUnit = readSpeedUnit();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    cache: TileCache,
    lon: number,
    lat: number,
    private readonly onExit: () => void,
  ) {
    const start = lonLatToMercator(lon, lat);
    this.x = start.x;
    this.y = start.y;
    this.camX = start.x;
    this.camY = start.y;
    this.stream = new TileStream(cache);
    this.renderer = new Renderer(canvas);
  }

  start(): void {
    this.running = true;
    this.input.attach();
    this.canvas.addEventListener("click", this.onClick);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.stream.update(this.x, this.y, 0, 0);
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    this.canvas.removeEventListener("click", this.onClick);
    window.removeEventListener("resize", this.resize);
  }

  private readonly resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.renderer.dpr = dpr;
  };

  private readonly onClick = (event: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x >= 14 && x <= 190 && y >= 14 && y <= 100) this.toggleUnit();
  };

  private updateScale(): void {
    this.scale = mercatorUnitsPerGroundMeter(mercatorToLonLat(this.x, this.y).lat);
    this.collision.scale = this.scale;
  }

  private toggleUnit(): void {
    this.unit = this.unit === "mph" ? "kmh" : "mph";
    try {
      localStorage.setItem("gtaworld.speedUnit", this.unit);
    } catch {
      // Private browsing can block storage. The choice still lasts for this drive.
    }
  }

  private tick(dt: number): void {
    this.resize();
    if (this.input.edge("Escape")) {
      this.stop();
      this.onExit();
      return;
    }
    if (this.input.edge("KeyC")) this.camera = this.camera === "north" ? "follow" : "north";
    if (this.input.edge("KeyK")) this.toggleUnit();
    this.updateScale();
    if (this.input.edge("KeyE")) {
      if (this.mode === "car") this.exitCar();
      else this.enterCar();
    }

    this.stream.update(this.x, this.y, this.vx, this.vy);
    this.syncCollision();
    this.syncPeds();
    this.trySnap();

    const prevX = this.x;
    const prevY = this.y;
    if (this.snapped && dt > 0) {
      if (this.mode === "car") this.stepCar(dt);
      else this.stepFoot(dt);
    }
    if (dt > 0) {
      this.vx = (this.x - prevX) / dt;
      this.vy = (this.y - prevY) / dt;
    }

    const threat = { x: this.x, y: this.y, vx: this.vx, vy: this.vy };
    for (const ped of this.peds) {
      const near = Math.hypot(ped.x - this.x, ped.y - this.y) < 30 * this.scale || ped.knock > 0;
      stepPed(ped, dt, near ? threat : null, this.scale);
    }
    this.loose = this.loose.filter((car) => Math.hypot(car.x - this.x, car.y - this.y) < 2500 * this.scale);

    const follow = 1 - Math.exp(-6 * Math.max(dt, 0.001));
    this.camX += (this.x - this.camX) * follow;
    this.camY += (this.y - this.camY) * follow;

    const geo = mercatorToLonLat(this.x, this.y);
    const center = mercatorToTile(this.x, this.y, TILE_ZOOM);
    this.renderer.draw({
      worlds: [...this.stream.worlds.values()],
      missing: this.missingTiles(),
      cars: this.visibleCars(),
      peds: this.peds,
      player: { mode: this.mode, x: this.x, y: this.y, heading: this.heading, color: this.carColor },
      camX: this.camX,
      camY: this.camY,
      rot: this.camera === "follow" ? Math.PI / 2 - this.heading : 0,
      scale: this.scale,
      hud: {
        speed: (Math.abs(this.speed) / this.scale) * (this.unit === "mph" ? MPS_TO_MPH : MPS_TO_KMH),
        unit: this.unit === "mph" ? "mph" : "km/h",
        hits: this.stream.hits,
        misses: this.stream.misses,
        waiting: this.stream.waiting,
        lon: geo.lon,
        lat: geo.lat,
        loading: !this.snapped && !this.stream.isFailed(center),
        camera: this.camera,
        mode: this.mode,
      },
    });
    this.input.endFrame();
  }

  private syncCollision(): void {
    const stamp = `${this.stream.revision}|${[...this.stream.worlds.keys()].sort().join("|")}`;
    if (stamp === this.collisionStamp) return;
    this.collisionStamp = stamp;
    this.collision.rebuild([...this.stream.worlds.values()]);
    const resolved = this.collision.resolve(this.x, this.y, (this.mode === "car" ? 0.95 : 0.4) * this.scale);
    if (resolved.blocked) {
      this.x = resolved.x;
      this.y = resolved.y;
    }
  }

  private syncPeds(): void {
    const live = new Set(this.stream.worlds.keys());
    this.peds = this.peds.filter((ped) => {
      const world = this.stream.worlds.get(ped.tileKey);
      return world !== undefined && world.buildingSource === ped.source && live.has(ped.tileKey);
    });
    const have = new Set(this.peds.map((ped) => ped.id));
    for (const world of this.stream.worlds.values()) {
      for (const spawn of world.pedestrians) {
        if (have.has(spawn.id)) continue;
        this.peds.push(pedFromSpawn(spawn, world.key, world.buildingSource));
        have.add(spawn.id);
      }
    }
  }

  private trySnap(): void {
    if (this.snapped) return;
    const id = mercatorToTile(this.x, this.y, TILE_ZOOM);
    if (!this.stream.worlds.has(tileKey(id))) {
      if (this.stream.isFailed(id)) this.snapped = true;
      return;
    }
    const pinX = this.x;
    const pinY = this.y;
    let nearestCar: ParkedCar | null = null;
    let nearestDistance = 80 * this.scale;
    for (const world of this.stream.worlds.values()) {
      for (const car of world.parked) {
        const distance = Math.hypot(car.x - pinX, car.y - pinY);
        if (distance < nearestDistance) {
          nearestCar = car;
          nearestDistance = distance;
        }
      }
    }
    if (nearestCar) {
      const angles = [nearestCar.heading + Math.PI / 2, nearestCar.heading - Math.PI / 2, nearestCar.heading + Math.PI];
      const beside = 2.4 * this.scale;
      this.x = nearestCar.x + Math.cos(angles[0]) * beside;
      this.y = nearestCar.y + Math.sin(angles[0]) * beside;
      for (const angle of angles) {
        const spotX = nearestCar.x + Math.cos(angle) * beside;
        const spotY = nearestCar.y + Math.sin(angle) * beside;
        const clear = this.collision.resolve(spotX, spotY, 0.35 * this.scale);
        if (!clear.blocked) {
          this.x = spotX;
          this.y = spotY;
          break;
        }
      }
      this.heading = nearestCar.heading;
    } else {
      const roads = [...this.stream.worlds.values()].flatMap((world) => world.roads);
      const snap = nearestDriveable(pinX, pinY, roads, 80 * this.scale);
      if (snap) {
        this.x = snap.x;
        this.y = snap.y;
        this.heading = snap.heading;
      }
    }
    const resolved = this.collision.resolve(this.x, this.y, 0.4 * this.scale);
    this.x = resolved.x;
    this.y = resolved.y;
    this.camX = this.x;
    this.camY = this.y;
    this.snapped = true;
  }

  private stepFoot(dt: number): void {
    let mx = 0;
    let my = 0;
    if (this.input.forward) my += 1;
    if (this.input.back) my -= 1;
    if (this.input.right) mx += 1;
    if (this.input.left) mx -= 1;
    const length = Math.hypot(mx, my);
    if (length === 0) {
      this.speed = 0;
      return;
    }
    mx /= length;
    my /= length;
    this.heading = Math.atan2(my, mx);
    this.speed = WALK_SPEED_MPS * this.scale;
    const moved = this.moveBody(this.x + mx * this.speed * dt, this.y + my * this.speed * dt, this.heading, 0.35 * this.scale, 0, null);
    this.x = moved.x;
    this.y = moved.y;
  }

  private stepCar(dt: number): void {
    const surface = this.collision.surfaceAt(this.x, this.y);
    const cap = surface.onRoad ? surface.maxSpeed * surface.speedFactor : 8;
    const steer = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const next = stepDrive(this.speed / this.scale, this.heading, dt, {
      throttle: this.input.forward,
      brake: this.input.back,
      steer,
      handbrake: this.input.handbrake,
      cap,
    });
    this.speed = next.speed * this.scale;
    this.heading = next.heading;
    const proposedX = this.x + Math.cos(this.heading) * this.speed * dt;
    const proposedY = this.y + Math.sin(this.heading) * this.speed * dt;
    const moved = this.moveBody(proposedX, proposedY, this.heading, 0.95 * this.scale, 1.15 * this.scale, this.carId);
    if (moved.hit) {
      const fixX = moved.x - proposedX;
      const fixY = moved.y - proposedY;
      const along = fixX * Math.cos(this.heading) + fixY * Math.sin(this.heading);
      if (along * Math.sign(this.speed || 1) < -0.001) this.speed *= 0.35;
      else this.speed *= 0.8;
    }
    this.x = moved.x;
    this.y = moved.y;
  }

  private moveBody(
    x: number,
    y: number,
    heading: number,
    radius: number,
    offset: number,
    ignoreCar: string | null,
  ): { x: number; y: number; hit: boolean } {
    const fx = Math.cos(heading);
    const fy = Math.sin(heading);
    const points = offset === 0 ? [{ x, y }] : [
      { x: x + fx * offset, y: y + fy * offset },
      { x: x - fx * offset, y: y - fy * offset },
    ];
    let hit = false;
    const resolved = points.map((point) => {
      let next = this.collision.resolve(point.x, point.y, radius);
      if (next.blocked) hit = true;
      const cars = this.avoidCars(next.x, next.y, radius, ignoreCar);
      if (cars.hit) hit = true;
      next = this.collision.resolve(cars.x, cars.y, radius);
      if (next.blocked) hit = true;
      return next;
    });
    if (resolved.length === 1) return { x: resolved[0].x, y: resolved[0].y, hit };
    return { x: (resolved[0].x + resolved[1].x) / 2, y: (resolved[0].y + resolved[1].y) / 2, hit };
  }

  private avoidCars(x: number, y: number, radius: number, ignoreCar: string | null): { x: number; y: number; hit: boolean } {
    const circles: { x: number; y: number; r: number }[] = [];
    for (const car of this.iterCars()) {
      if (car.id === ignoreCar) continue;
      if (Math.abs(car.x - x) > 6 * this.scale || Math.abs(car.y - y) > 6 * this.scale) continue;
      circles.push({ x: car.x, y: car.y, r: 1.15 * this.scale });
    }
    return pushCircles(x, y, radius, circles);
  }

  private iterCars(): ParkedCar[] {
    const cars = [...this.loose];
    for (const world of this.stream.worlds.values()) {
      for (const car of world.parked) {
        if (!this.taken.has(car.id)) cars.push(car);
      }
    }
    return cars;
  }

  private visibleCars(): ParkedCar[] {
    const cars: ParkedCar[] = [];
    for (const car of this.iterCars()) {
      if (Math.hypot(car.x - this.camX, car.y - this.camY) < 160 * this.scale) cars.push(car);
    }
    return cars;
  }

  private enterCar(): void {
    let best: ParkedCar | null = null;
    let bestDistance = 3.2 * this.scale;
    for (const car of this.iterCars()) {
      const distance = Math.hypot(car.x - this.x, car.y - this.y);
      if (distance < bestDistance) {
        best = car;
        bestDistance = distance;
      }
    }
    if (!best) return;
    this.taken.add(best.id);
    this.loose = this.loose.filter((car) => car.id !== best?.id);
    this.mode = "car";
    this.carId = best.id;
    this.carColor = best.color;
    this.x = best.x;
    this.y = best.y;
    this.heading = best.heading;
    this.speed = 0;
  }

  private exitCar(): void {
    const left = this.heading + Math.PI / 2;
    const spot = {
      x: this.x + Math.cos(left) * 2.1 * this.scale,
      y: this.y + Math.sin(left) * 2.1 * this.scale,
    };
    const resolved = this.collision.resolve(spot.x, spot.y, 0.35 * this.scale);
    this.loose.push({ id: this.carId, x: this.x, y: this.y, heading: this.heading, color: this.carColor });
    this.mode = "foot";
    this.x = resolved.x;
    this.y = resolved.y;
    this.speed = 0;
  }

  debugState(): {
    x: number;
    y: number;
    heading: number;
    mode: "foot" | "car";
    speed: number;
    hits: number;
    misses: number;
    snapped: boolean;
    cars: number;
    parked: number;
    waiting: number;
    revision: number;
    buildings: number;
    nearestCar: { x: number; y: number; distance: number } | null;
    blocker: { direction: string; kind: "building" | "water" } | null;
  } {
    let nearestCar: { x: number; y: number; distance: number } | null = null;
    for (const car of this.iterCars()) {
      const distance = Math.hypot(car.x - this.x, car.y - this.y);
      if (!nearestCar || distance < nearestCar.distance) nearestCar = { x: car.x, y: car.y, distance };
    }
    const directions: [string, number, number][] = [
      ["east", 1, 0],
      ["north", 0, 1],
      ["west", -1, 0],
      ["south", 0, -1],
    ];
    let blocker: { direction: string; kind: "building" | "water" } | null = null;
    for (const distance of [3, 6, 10, 16, 24, 36]) {
      for (const [direction, dx, dy] of directions) {
        const hit = this.collision.resolve(this.x + dx * distance * this.scale, this.y + dy * distance * this.scale, 0.35 * this.scale);
        if (hit.building || hit.water) {
          blocker = { direction, kind: hit.building ? "building" : "water" };
          break;
        }
      }
      if (blocker) break;
    }
    return {
      x: this.x,
      y: this.y,
      heading: this.heading,
      mode: this.mode,
      speed: this.speed,
      hits: this.stream.hits,
      misses: this.stream.misses,
      snapped: this.snapped,
      cars: this.visibleCars().length,
      parked: this.iterCars().length,
      waiting: this.stream.waiting,
      revision: this.stream.revision,
      buildings: [...this.stream.worlds.values()].reduce(
        (count, world) => count + world.polygons.filter((poly) => poly.kind === "building").length,
        0,
      ),
      nearestCar,
      blocker,
    };
  }

  private missingTiles(): { id: TileId; failed: boolean }[] {
    const missing: { id: TileId; failed: boolean }[] = [];
    for (const id of this.stream.wanted(this.x, this.y, this.vx, this.vy)) {
      if (this.stream.worlds.has(tileKey(id))) continue;
      missing.push({ id, failed: this.stream.isFailed(id) });
    }
    return missing;
  }
}

function readSpeedUnit(): SpeedUnit {
  try {
    return localStorage.getItem("gtaworld.speedUnit") === "kmh" ? "kmh" : "mph";
  } catch {
    return "mph";
  }
}
