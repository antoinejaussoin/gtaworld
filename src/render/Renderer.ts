import { roadPaint } from "../world/buildWorld";
import { isPedestrianWay } from "../world/roads";
import { GROUND } from "../world/style";
import { CAR_LENGTH_M, CAR_WIDTH_M, VIEW_WIDTH_M } from "../world/config";
import { bboxIntersects, type BBox, type Vec } from "../world/geometry";
import { formatLatLon, tileBounds, type TileId } from "../world/project";
import type { ParkedCar, Poi, TileWorld } from "../world/types";

const BUCKET = 128;
const LARGE = 256;

const ORDER_BUILDING = 13;
const ORDER_COUNT = 16;

export interface Hud {
  speed: number;
  unit: "mph" | "km/h";
  hits: number;
  misses: number;
  waiting: number;
  lon: number;
  lat: number;
  loading: boolean;
  camera: "north" | "follow";
  mode: "foot" | "car";
}

interface Glyph {
  path: Path2D;
  ridge?: Path2D;
  wall?: string;
  bbox: BBox;
  order: number;
  color: string;
  mode: "fill" | "stroke";
  width: number;
  height: number;
  shadowDx: number;
  shadowDy: number;
  stamp: number;
}

interface CachedTile {
  originX: number;
  originY: number;
  buckets: Map<string, Glyph[]>;
  large: Glyph[];
}

function ridgePath(ring: Vec[], originX: number, originY: number): Path2D | null {
  const closed = ring.length > 2 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y;
  const count = closed ? ring.length - 1 : ring.length;
  if (count < 3) return null;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < count; i++) {
    cx += ring[i].x;
    cy += ring[i].y;
  }
  cx /= count;
  cy /= count;
  let bestLen = 0;
  let angle = 0;
  for (let i = 0; i < count; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % count];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  const span = Math.max(2.4, bestLen * 0.62);
  const dx = Math.cos(angle) * span * 0.5;
  const dy = Math.sin(angle) * span * 0.5;
  const path = new Path2D();
  path.moveTo(cx - dx - originX, cy - dy - originY);
  path.lineTo(cx + dx - originX, cy + dy - originY);
  return path;
}

function linePath(points: Vec[], originX: number, originY: number): Path2D {
  const path = new Path2D();
  path.moveTo(points[0].x - originX, points[0].y - originY);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i].x - originX, points[i].y - originY);
  return path;
}

function ringPath(rings: Vec[][], originX: number, originY: number): Path2D {
  const path = new Path2D();
  for (const ring of rings) {
    if (ring.length < 2) continue;
    path.moveTo(ring[0].x - originX, ring[0].y - originY);
    for (let i = 1; i < ring.length; i++) path.lineTo(ring[i].x - originX, ring[i].y - originY);
    path.closePath();
  }
  return path;
}

function bake(world: TileWorld): CachedTile {
  const originX = world.bounds.minX;
  const originY = world.bounds.minY;
  const cached: CachedTile = { originX, originY, buckets: new Map(), large: [] };
  const add = (glyph: Glyph) => {
    const width = glyph.bbox.maxX - glyph.bbox.minX;
    const height = glyph.bbox.maxY - glyph.bbox.minY;
    if (!Number.isFinite(width) || width > LARGE || height > LARGE) {
      cached.large.push(glyph);
      return;
    }
    const x0 = Math.floor(glyph.bbox.minX / BUCKET);
    const x1 = Math.floor(glyph.bbox.maxX / BUCKET);
    const y0 = Math.floor(glyph.bbox.minY / BUCKET);
    const y1 = Math.floor(glyph.bbox.maxY / BUCKET);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const list = cached.buckets.get(key);
        if (list) list.push(glyph);
        else cached.buckets.set(key, [glyph]);
      }
    }
  };

  for (const poly of world.polygons) {
    const order =
      poly.kind === "water" ? 0
      : poly.kind === "landuse" ? 1
      : poly.kind === "landcover" ? 2
      : poly.kind === "park" ? 3
      : poly.kind === "paved" ? 4
      : poly.kind === "aeroway" ? 5
      : ORDER_BUILDING;
    const span = Math.max(poly.bbox.maxX - poly.bbox.minX, poly.bbox.maxY - poly.bbox.minY);
    const house = poly.kind === "building" && poly.height < 16 && span < 120;
    const shadow = poly.kind === "building" ? Math.min(poly.height, 70) * 0.42 : 0;
    add({
      path: ringPath(poly.rings, originX, originY),
      ridge: house ? ridgePath(poly.rings[0], originX, originY) ?? undefined : undefined,
      wall: poly.kind === "building" ? (house ? "#3c322b" : "#3a4048") : undefined,
      bbox: poly.bbox,
      order,
      color: poly.color,
      mode: "fill",
      width: 0,
      height: poly.height,
      shadowDx: shadow * 0.75,
      shadowDy: -shadow * 0.75,
      stamp: 0,
    });
  }

  for (const stroke of world.strokes) {
    const order = stroke.kind === "waterway" ? 6 : stroke.kind === "railway" ? 7 : 5;
    add({
      path: linePath(stroke.points, originX, originY),
      bbox: stroke.bbox,
      order,
      color: stroke.color,
      mode: "stroke",
      width: stroke.width,
      height: 0,
      shadowDx: 0,
      shadowDy: 0,
      stamp: 0,
    });
  }

  for (const road of world.roads) {
    if (isPedestrianWay(road.roadClass, road.subclass)) continue;
    const paint = roadPaint(road);
    const path = linePath(road.points, originX, originY);
    let casingOrder = 10;
    let fillOrder = 11;
    if (road.tunnel) {
      casingOrder = 8;
      fillOrder = 9;
    } else if (road.bridge) {
      casingOrder = 14;
      fillOrder = 15;
    } else if (road.roadClass === "path") {
      casingOrder = 12;
      fillOrder = 12;
    }
    if (road.roadClass !== "path") {
      add({
        path,
        bbox: road.bbox,
        order: casingOrder,
        color: paint.casing,
        mode: "stroke",
        width: paint.casingWidth,
        height: 0,
        shadowDx: 0,
        shadowDy: 0,
        stamp: 0,
      });
    }
    add({
      path,
      bbox: road.bbox,
      order: fillOrder,
      color: paint.fill,
      mode: "stroke",
      width: road.width,
      height: 0,
      shadowDx: 0,
      shadowDy: 0,
      stamp: 0,
    });
  }

  return cached;
}

function setTileTransform(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  camX: number,
  camY: number,
  canvas: HTMLCanvasElement,
  rot: number,
  scale: number,
): void {
  const ox = originX - camX;
  const oy = originY - camY;
  const ppm = canvas.width / (VIEW_WIDTH_M * scale);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const a = ppm * cos;
  const c = -ppm * sin;
  const b = -ppm * sin;
  const d = -ppm * cos;
  ctx.setTransform(a, b, c, d, canvas.width / 2 + a * ox + c * oy, canvas.height / 2 + b * ox + d * oy);
}

function projectPoint(
  x: number,
  y: number,
  camX: number,
  camY: number,
  canvas: HTMLCanvasElement,
  rot: number,
  scale: number,
): { sx: number; sy: number } {
  const dx = x - camX;
  const dy = y - camY;
  const ppm = canvas.width / (VIEW_WIDTH_M * scale);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    sx: canvas.width / 2 + ppm * (cos * dx - sin * dy),
    sy: canvas.height / 2 - ppm * (sin * dx + cos * dy),
  };
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  heading: number,
  color: string,
  scale: number,
): void {
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const rx = -fy;
  const ry = fx;
  const halfLength = (CAR_LENGTH_M / 2) * scale;
  const halfWidth = (CAR_WIDTH_M / 2) * scale;
  const corner = (along: number, side: number) => ({
    x: x + fx * along + rx * side,
    y: y + fy * along + ry * side,
  });
  const body = [
    corner(halfLength, halfWidth),
    corner(halfLength, -halfWidth),
    corner(-halfLength, -halfWidth),
    corner(-halfLength, halfWidth),
  ];
  ctx.beginPath();
  ctx.moveTo(body[0].x, body[0].y);
  for (let i = 1; i < body.length; i++) ctx.lineTo(body[i].x, body[i].y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.16 * scale;
  ctx.strokeStyle = "#17191c";
  ctx.stroke();
  const glass = [
    corner(halfLength * 0.55, halfWidth * 0.7),
    corner(halfLength * 0.55, -halfWidth * 0.7),
    corner(halfLength * 0.1, -halfWidth * 0.7),
    corner(halfLength * 0.1, halfWidth * 0.7),
  ];
  ctx.beginPath();
  ctx.moveTo(glass[0].x, glass[0].y);
  for (let i = 1; i < glass.length; i++) ctx.lineTo(glass[i].x, glass[i].y);
  ctx.closePath();
  ctx.fillStyle = "rgba(186, 214, 222, 0.92)";
  ctx.fill();
}

function drawWalker(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, scale: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 1.5 * scale, 0, Math.PI * 2);
  ctx.lineWidth = 0.18 * scale;
  ctx.strokeStyle = "#241c08";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 0.45 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#f0d34a";
  ctx.fill();
  ctx.lineWidth = 0.12 * scale;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(heading) * 0.72 * scale, y + Math.sin(heading) * 0.72 * scale);
  ctx.lineTo(x + Math.cos(heading + 2.4) * 0.22 * scale, y + Math.sin(heading + 2.4) * 0.22 * scale);
  ctx.lineTo(x + Math.cos(heading - 2.4) * 0.22 * scale, y + Math.sin(heading - 2.4) * 0.22 * scale);
  ctx.closePath();
  ctx.fill();
}

export class Renderer {
  private readonly cache = new Map<string, CachedTile>();
  private stamp = 1;
  dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  draw(args: {
    worlds: TileWorld[];
    missing: { id: TileId; failed: boolean }[];
    cars: ParkedCar[];
    peds: { x: number; y: number; color: string }[];
    player: { mode: "foot" | "car"; x: number; y: number; heading: number; color: string };
    camX: number;
    camY: number;
    rot: number;
    scale: number;
    hud: Hud;
  }): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx || this.canvas.width < 2 || this.canvas.height < 2) return;
    this.sync(args.worlds);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    this.drawHatches(ctx, args.missing, args.camX, args.camY, args.rot, args.scale);
    this.drawWorld(ctx, args.worlds, args.camX, args.camY, args.rot, args.scale);
    this.drawActors(ctx, args);
    this.drawLabels(ctx, args);
    this.drawHud(ctx, args);
  }

  private token(world: TileWorld): string {
    return `${world.key}:${world.buildingSource}`;
  }

  private sync(worlds: TileWorld[]): void {
    const live = new Set<string>();
    for (const world of worlds) {
      const token = this.token(world);
      live.add(token);
      if (!this.cache.has(token)) this.cache.set(token, bake(world));
    }
    for (const key of this.cache.keys()) {
      if (!live.has(key)) this.cache.delete(key);
    }
  }

  private drawHatches(
    ctx: CanvasRenderingContext2D,
    missing: { id: TileId; failed: boolean }[],
    camX: number,
    camY: number,
    rot: number,
    scale: number,
  ): void {
    if (missing.length === 0) return;
    setTileTransform(ctx, camX, camY, camX, camY, this.canvas, rot, scale);
    for (const tile of missing) {
      const bounds = tileBounds(tile.id);
      const x = bounds.minX - camX;
      const y = bounds.minY - camY;
      const w = bounds.maxX - bounds.minX;
      const h = bounds.maxY - bounds.minY;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.fillStyle = tile.failed ? "rgba(120, 48, 36, 0.28)" : "rgba(40, 42, 28, 0.16)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = tile.failed ? "rgba(90, 32, 24, 0.45)" : "rgba(60, 55, 30, 0.35)";
      ctx.lineWidth = 1.4 * scale;
      const step = 22;
      for (let i = -h; i < w; i += step) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i + h, y + h);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawWorld(
    ctx: CanvasRenderingContext2D,
    worlds: TileWorld[],
    camX: number,
    camY: number,
    rot: number,
    scale: number,
  ): void {
    const halfW = (VIEW_WIDTH_M * scale) / 2;
    const halfH = halfW * (this.canvas.height / Math.max(1, this.canvas.width));
    const reach = Math.hypot(halfW, halfH) + 30 * scale;
    const view: BBox = { minX: camX - reach, minY: camY - reach, maxX: camX + reach, maxY: camY + reach };
    const x0 = Math.floor(view.minX / BUCKET);
    const x1 = Math.floor(view.maxX / BUCKET);
    const y0 = Math.floor(view.minY / BUCKET);
    const y1 = Math.floor(view.maxY / BUCKET);
    this.stamp += 1;
    const stamp = this.stamp;
    const buildings: { tile: CachedTile; glyph: Glyph }[] = [];

    const consider = (tile: CachedTile, glyph: Glyph, order: number) => {
      if (glyph.order !== order || glyph.stamp === stamp) return;
      if (!bboxIntersects(glyph.bbox, view)) return;
      glyph.stamp = stamp;
      if (order === ORDER_BUILDING) buildings.push({ tile, glyph });
      else this.paint(ctx, glyph, scale);
    };

    for (let order = 0; order < ORDER_COUNT; order++) {
      for (const world of worlds) {
        const tile = this.cache.get(this.token(world));
        if (!tile) continue;
        setTileTransform(ctx, tile.originX, tile.originY, camX, camY, this.canvas, rot, scale);
        for (const glyph of tile.large) consider(tile, glyph, order);
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            const list = tile.buckets.get(`${x},${y}`);
            if (!list) continue;
            for (const glyph of list) consider(tile, glyph, order);
          }
        }
      }
    }

    buildings.sort((a, b) => a.glyph.height - b.glyph.height);
    for (const item of buildings) {
      setTileTransform(ctx, item.tile.originX, item.tile.originY, camX, camY, this.canvas, rot, scale);
      ctx.save();
      ctx.translate(item.glyph.shadowDx * scale, item.glyph.shadowDy * scale);
      ctx.fillStyle = "rgba(36, 28, 20, 0.42)";
      ctx.fill(item.glyph.path, "evenodd");
      ctx.restore();
    }
    for (const item of buildings) {
      setTileTransform(ctx, item.tile.originX, item.tile.originY, camX, camY, this.canvas, rot, scale);
      ctx.lineJoin = "miter";
      ctx.lineWidth = 2.4 * scale;
      ctx.strokeStyle = item.glyph.wall ?? "#3c322b";
      ctx.stroke(item.glyph.path);
      ctx.fillStyle = item.glyph.color;
      ctx.fill(item.glyph.path, "evenodd");
      if (item.glyph.ridge) {
        ctx.lineWidth = 0.85 * scale;
        ctx.strokeStyle = "rgba(255, 244, 230, 0.55)";
        ctx.stroke(item.glyph.ridge);
      }
    }
  }

  private paint(ctx: CanvasRenderingContext2D, glyph: Glyph, scale: number): void {
    if (glyph.mode === "fill") {
      ctx.fillStyle = glyph.color;
      ctx.fill(glyph.path, "evenodd");
      return;
    }
    ctx.strokeStyle = glyph.color;
    ctx.lineWidth = glyph.width * scale;
    ctx.stroke(glyph.path);
  }

  private drawActors(
    ctx: CanvasRenderingContext2D,
    args: {
      cars: ParkedCar[];
      peds: { x: number; y: number; color: string }[];
      player: { mode: "foot" | "car"; x: number; y: number; heading: number; color: string };
      camX: number;
      camY: number;
      rot: number;
      scale: number;
    },
  ): void {
    setTileTransform(ctx, args.camX, args.camY, args.camX, args.camY, this.canvas, args.rot, args.scale);
    const reach = 140 * args.scale;
    for (const ped of args.peds) {
      const dx = ped.x - args.camX;
      const dy = ped.y - args.camY;
      if (dx * dx + dy * dy > reach * reach) continue;
      ctx.beginPath();
      ctx.arc(dx, dy, 0.32 * args.scale, 0, Math.PI * 2);
      ctx.fillStyle = ped.color;
      ctx.fill();
      ctx.lineWidth = 0.08 * args.scale;
      ctx.strokeStyle = "#241f1a";
      ctx.stroke();
    }
    for (const car of args.cars) {
      drawVehicle(ctx, car.x - args.camX, car.y - args.camY, car.heading, car.color, args.scale);
    }
    if (args.player.mode === "car") {
      drawVehicle(ctx, args.player.x - args.camX, args.player.y - args.camY, args.player.heading, args.player.color, args.scale);
    } else {
      drawWalker(ctx, args.player.x - args.camX, args.player.y - args.camY, args.player.heading, args.scale);
    }
  }

  private drawLabels(
    ctx: CanvasRenderingContext2D,
    args: { worlds: TileWorld[]; camX: number; camY: number; rot: number; scale: number },
  ): void {
    const labels: { sx: number; sy: number; text: string; water: boolean }[] = [];
    const pois: { sx: number; sy: number; poi: Poi }[] = [];
    const labelReach = 120 * args.scale;
    const poiReach = 130 * args.scale;
    for (const world of args.worlds) {
      for (const label of world.labels) {
        const dx = label.x - args.camX;
        const dy = label.y - args.camY;
        if (dx * dx + dy * dy > labelReach * labelReach) continue;
        const p = projectPoint(label.x, label.y, args.camX, args.camY, this.canvas, args.rot, args.scale);
        labels.push({ sx: p.sx, sy: p.sy, text: label.text, water: label.kind === "water" });
      }
      for (const poi of world.pois) {
        const dx = poi.x - args.camX;
        const dy = poi.y - args.camY;
        if (dx * dx + dy * dy > poiReach * poiReach) continue;
        const p = projectPoint(poi.x, poi.y, args.camX, args.camY, this.canvas, args.rot, args.scale);
        pois.push({ sx: p.sx, sy: p.sy, poi });
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `${12 * this.dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const seen = new Set<string>();
    for (const label of labels) {
      const key = label.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > 10) break;
      ctx.lineWidth = 3 * this.dpr;
      ctx.strokeStyle = "rgba(28, 30, 22, 0.75)";
      ctx.strokeText(label.text, label.sx, label.sy);
      ctx.fillStyle = label.water ? "#e7f4f8" : "#f7f3ea";
      ctx.fillText(label.text, label.sx, label.sy);
    }
    for (const mark of pois.slice(0, 16)) {
      const letter = mark.poi.kind === "fuel" ? "F" : mark.poi.kind === "parking" ? "P" : "S";
      ctx.beginPath();
      ctx.arc(mark.sx, mark.sy, 9 * this.dpr, 0, Math.PI * 2);
      ctx.fillStyle = mark.poi.kind === "fuel" ? "#e2b33c" : "#f4f0e6";
      ctx.fill();
      ctx.fillStyle = "#241c08";
      ctx.font = `700 ${11 * this.dpr}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(letter, mark.sx, mark.sy + this.dpr);
    }
  }

  private drawHud(
    ctx: CanvasRenderingContext2D,
    args: {
      worlds: TileWorld[];
      player: { x: number; y: number; heading: number };
      camX: number;
      camY: number;
      scale: number;
      hud: Hud;
    },
  ): void {
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(22, 24, 18, 0.72)";
    roundRect(ctx, 14, 14, 150, 78, 12);
    ctx.fill();
    ctx.fillStyle = "#f6f1e4";
    ctx.font = "700 36px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(String(Math.round(Math.abs(args.hud.speed))), 26, 20);
    ctx.font = "600 14px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(args.hud.unit, 108, 40);
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#d9d0bc";
    ctx.fillText(args.hud.mode === "car" ? "driving" : "on foot", 26, 64);

    ctx.fillStyle = "rgba(22, 24, 18, 0.72)";
    roundRect(ctx, 14, height - 78, Math.min(520, width - 200), 62, 12);
    ctx.fill();
    ctx.fillStyle = "#f6f1e4";
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("WASD move   E car   Shift handbrake   C camera   K unit   Esc map", 26, height - 66);
    ctx.fillStyle = "#d9d0bc";
    ctx.fillText("© OpenStreetMap  © OpenFreeMap", 26, height - 44);
    ctx.fillText(
      `${args.hud.hits} from cache · ${args.hud.misses} downloaded${args.hud.waiting ? ` · ${args.hud.waiting} waiting` : ""}`,
      26,
      height - 26,
    );

    ctx.textAlign = "right";
    ctx.fillStyle = "#f6f1e4";
    ctx.fillText(formatLatLon(args.hud.lat, args.hud.lon), width - 24, 18);
    ctx.fillStyle = "#d9d0bc";
    ctx.fillText(args.hud.camera === "north" ? "camera north" : "camera follows", width - 24, 36);

    this.drawMinimap(ctx, width, height, args);
    if (args.hud.loading) {
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(22, 24, 18, 0.8)";
      roundRect(ctx, width / 2 - 110, height / 2 - 22, 220, 44, 12);
      ctx.fill();
      ctx.fillStyle = "#f6f1e4";
      ctx.font = "600 16px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("Loading streets…", width / 2, height / 2 - 8);
    }
  }

  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    args: { worlds: TileWorld[]; player: { x: number; y: number; heading: number }; scale: number },
  ): void {
    const size = 150;
    const x0 = width - size - 16;
    const y0 = height - size - 16;
    ctx.fillStyle = "rgba(22, 24, 18, 0.78)";
    roundRect(ctx, x0, y0, size, size, 12);
    ctx.fill();
    const span = 900 * args.scale;
    const scale = (size - 16) / span;
    const cx = x0 + size / 2;
    const cy = y0 + size / 2;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x0 + 4, y0 + 4, size - 8, size - 8, 8);
    ctx.clip();
    for (const world of args.worlds) {
      const left = cx + (world.bounds.minX - args.player.x) * scale;
      const top = cy - (world.bounds.maxY - args.player.y) * scale;
      const w = (world.bounds.maxX - world.bounds.minX) * scale;
      const h = (world.bounds.maxY - world.bounds.minY) * scale;
      ctx.fillStyle = "rgba(179, 176, 122, 0.85)";
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = "rgba(42, 44, 32, 0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, w, h);
    }
    ctx.fillStyle = "#f0d34a";
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#f6f1e4";
    ctx.font = "700 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", cx, y0 + 8);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
