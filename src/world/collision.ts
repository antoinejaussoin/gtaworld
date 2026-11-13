import { bboxOfPoints, closestOnPolyline, pointInRings, type BBox, type Vec } from "./geometry";
import type { Road, StrokeLine, TileWorld } from "./types";

export interface Solid {
  kind: "building" | "water";
  rings?: Vec[][];
  capsule?: { ax: number; ay: number; bx: number; by: number; radius: number };
  bbox: BBox;
}

export interface CircleHit {
  x: number;
  y: number;
  blocked: boolean;
  building: boolean;
  water: boolean;
}

export interface Surface {
  onRoad: boolean;
  speedFactor: number;
  maxSpeed: number;
  roadClass: string;
  bridge: boolean;
}

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  width: number;
  bridge: boolean;
  driveable: boolean;
  walkable: boolean;
  speedFactor: number;
  maxSpeed: number;
  roadClass: string;
}

const CELL = 16;

function keysForBBox(box: BBox, pad = 0): string[] {
  const keys: string[] = [];
  const x0 = Math.floor((box.minX - pad) / CELL);
  const x1 = Math.floor((box.maxX + pad) / CELL);
  const y0 = Math.floor((box.minY - pad) / CELL);
  const y1 = Math.floor((box.maxY + pad) / CELL);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) keys.push(`${x},${y}`);
  }
  return keys;
}

function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { x: number; y: number; distance: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-12) t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { x, y, distance: Math.hypot(px - x, py - y) };
}

function ringEdges(ring: Vec[]): { ax: number; ay: number; bx: number; by: number }[] {
  const edges: { ax: number; ay: number; bx: number; by: number }[] = [];
  if (ring.length < 2) return edges;
  const closed = ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y;
  const count = closed ? ring.length - 1 : ring.length;
  for (let i = 0; i < count; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % count];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
    edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  }
  return edges;
}

export function pushOutOfSolids(x: number, y: number, radius: number, solids: Solid[], ignoreWater: boolean): CircleHit {
  let cx = x;
  let cy = y;
  let building = false;
  let water = false;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const solid of solids) {
      if (ignoreWater && solid.kind === "water") continue;
      if (cx < solid.bbox.minX - radius || cx > solid.bbox.maxX + radius || cy < solid.bbox.minY - radius || cy > solid.bbox.maxY + radius) {
        continue;
      }
      if (solid.capsule) {
        const cap = solid.capsule;
        const hit = closestOnSegment(cx, cy, cap.ax, cap.ay, cap.bx, cap.by);
        const limit = radius + cap.radius;
        if (hit.distance >= limit) continue;
        let nx = cx - hit.x;
        let ny = cy - hit.y;
        let nl = Math.hypot(nx, ny);
        if (nl < 1e-6) {
          nx = -(cap.by - cap.ay);
          ny = cap.bx - cap.ax;
          nl = Math.hypot(nx, ny) || 1;
        }
        const pen = limit - hit.distance;
        cx += (nx / nl) * pen;
        cy += (ny / nl) * pen;
        water = true;
        moved = true;
        continue;
      }
      if (!solid.rings) continue;
      const inside = pointInRings(cx, cy, solid.rings);
      let best: { dist: number; x: number; y: number } | null = null;
      for (const ring of solid.rings) {
        for (const edge of ringEdges(ring)) {
          const hit = closestOnSegment(cx, cy, edge.ax, edge.ay, edge.bx, edge.by);
          if (!best || hit.distance < best.dist) best = { dist: hit.distance, x: hit.x, y: hit.y };
        }
      }
      if (!best) continue;
      if (!inside && best.dist >= radius) continue;
      let nx = cx - best.x;
      let ny = cy - best.y;
      let nl = Math.hypot(nx, ny);
      if (nl < 1e-6) {
        nx = 1;
        ny = 0;
        nl = 1;
      } else if (inside) {
        nx = -nx;
        ny = -ny;
      }
      const pen = inside ? radius + best.dist : radius - best.dist;
      if (pen <= 0) continue;
      cx += (nx / nl) * pen;
      cy += (ny / nl) * pen;
      if (solid.kind === "building") building = true;
      else water = true;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: cx, y: cy, blocked: building || water, building, water };
}

export function onBridge(x: number, y: number, roads: Road[], extra = 1.2): boolean {
  for (const road of roads) {
    if (!road.bridge || !road.walkable) continue;
    const hit = closestOnPolyline(x, y, road.points);
    if (hit.distance <= road.width / 2 + extra) return true;
  }
  return false;
}

export function roadSurface(x: number, y: number, roads: Road[]): Surface {
  let best: { distance: number; road: Road } | null = null;
  for (const road of roads) {
    if (!road.driveable) continue;
    const hit = closestOnPolyline(x, y, road.points);
    const limit = road.width / 2 + 1.5;
    if (hit.distance <= limit && (!best || hit.distance < best.distance)) best = { distance: hit.distance, road };
  }
  if (!best) return { onRoad: false, speedFactor: 1, maxSpeed: 8, roadClass: "", bridge: false };
  return {
    onRoad: true,
    speedFactor: best.road.speedFactor,
    maxSpeed: best.road.maxSpeed,
    roadClass: best.road.roadClass,
    bridge: best.road.bridge,
  };
}

export function nearestDriveable(x: number, y: number, roads: Road[], maxDistance: number): { x: number; y: number; heading: number } | null {
  let best: { x: number; y: number; heading: number; distance: number } | null = null;
  for (const road of roads) {
    if (!road.driveable) continue;
    const hit = closestOnPolyline(x, y, road.points);
    if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) {
      best = { x: hit.x, y: hit.y, heading: hit.heading, distance: hit.distance };
    }
  }
  return best;
}

function addIndex(grid: Map<string, number[]>, keys: string[], index: number): void {
  for (const key of keys) {
    const list = grid.get(key);
    if (list) list.push(index);
    else grid.set(key, [index]);
  }
}

export class CollisionWorld {
  /** Mercator units per real metre at the player. Road widths are stored in real metres. */
  scale = 1;
  private solids: Solid[] = [];
  private largeSolids: Solid[] = [];
  private segments: Segment[] = [];
  private solidGrid = new Map<string, number[]>();
  private segmentGrid = new Map<string, number[]>();

  rebuild(tiles: TileWorld[]): void {
    this.solids = [];
    this.largeSolids = [];
    this.segments = [];
    this.solidGrid = new Map();
    this.segmentGrid = new Map();
    for (const tile of tiles) {
      for (const poly of tile.polygons) {
        if (poly.kind !== "building" && poly.kind !== "water") continue;
        const solid: Solid = { kind: poly.kind, rings: poly.rings, bbox: poly.bbox };
        const span = Math.max(poly.bbox.maxX - poly.bbox.minX, poly.bbox.maxY - poly.bbox.minY);
        if (span > 400) {
          this.largeSolids.push(solid);
          continue;
        }
        const index = this.solids.push(solid) - 1;
        addIndex(this.solidGrid, keysForBBox(poly.bbox), index);
      }
      for (const stroke of tile.strokes) {
        if (!stroke.blocking) continue;
        this.addWaterway(stroke);
      }
      for (const road of tile.roads) this.addRoad(road);
    }
  }

  private addWaterway(stroke: StrokeLine): void {
    const radius = stroke.width / 2;
    for (let i = 0; i < stroke.points.length - 1; i++) {
      const a = stroke.points[i];
      const b = stroke.points[i + 1];
      const bbox = {
        minX: Math.min(a.x, b.x) - radius,
        minY: Math.min(a.y, b.y) - radius,
        maxX: Math.max(a.x, b.x) + radius,
        maxY: Math.max(a.y, b.y) + radius,
      };
      const solid: Solid = {
        kind: "water",
        capsule: { ax: a.x, ay: a.y, bx: b.x, by: b.y, radius },
        bbox,
      };
      const index = this.solids.push(solid) - 1;
      addIndex(this.solidGrid, keysForBBox(bbox), index);
    }
  }

  private addRoad(road: Road): void {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const segment: Segment = {
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        width: road.width,
        bridge: road.bridge,
        driveable: road.driveable,
        walkable: road.walkable,
        speedFactor: road.speedFactor,
        maxSpeed: road.maxSpeed,
        roadClass: road.roadClass,
      };
      const index = this.segments.push(segment) - 1;
      const box = bboxOfPoints([a, b]);
      addIndex(this.segmentGrid, keysForBBox(box, road.width / 2 + 2), index);
    }
  }

  private solidsNear(x: number, y: number, radius: number): Solid[] {
    const seen = new Set<number>();
    const out: Solid[] = [...this.largeSolids];
    const reach = Math.ceil(radius / CELL) + 1;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        const list = this.solidGrid.get(`${cx + dx},${cy + dy}`);
        if (!list) continue;
        for (const index of list) {
          if (seen.has(index)) continue;
          seen.add(index);
          out.push(this.solids[index]);
        }
      }
    }
    return out;
  }

  private segmentsNear(x: number, y: number, radius: number): Segment[] {
    const seen = new Set<number>();
    const out: Segment[] = [];
    const reach = Math.max(1, Math.ceil(radius / CELL));
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        const list = this.segmentGrid.get(`${cx + dx},${cy + dy}`);
        if (!list) continue;
        for (const index of list) {
          if (seen.has(index)) continue;
          seen.add(index);
          out.push(this.segments[index]);
        }
      }
    }
    return out;
  }

  bridgeAt(x: number, y: number): boolean {
    for (const segment of this.segmentsNear(x, y, 20 * this.scale)) {
      if (!segment.bridge || !segment.walkable) continue;
      const hit = closestOnSegment(x, y, segment.ax, segment.ay, segment.bx, segment.by);
      if (hit.distance <= (segment.width / 2 + 1.2) * this.scale) return true;
    }
    return false;
  }

  surfaceAt(x: number, y: number): Surface {
    let best: { distance: number; segment: Segment } | null = null;
    for (const segment of this.segmentsNear(x, y, 18 * this.scale)) {
      if (!segment.driveable) continue;
      const hit = closestOnSegment(x, y, segment.ax, segment.ay, segment.bx, segment.by);
      const limit = (segment.width / 2 + 1.5) * this.scale;
      if (hit.distance <= limit && (!best || hit.distance < best.distance)) best = { distance: hit.distance, segment };
    }
    if (!best) return { onRoad: false, speedFactor: 1, maxSpeed: 8, roadClass: "", bridge: false };
    return {
      onRoad: true,
      speedFactor: best.segment.speedFactor,
      maxSpeed: best.segment.maxSpeed,
      roadClass: best.segment.roadClass,
      bridge: best.segment.bridge,
    };
  }

  resolve(x: number, y: number, radius: number): CircleHit {
    const ignoreWater = this.bridgeAt(x, y);
    const solids = this.solidsNear(x, y, Math.max(radius, 8 * this.scale)).map((solid) => this.scaledSolid(solid));
    return pushOutOfSolids(x, y, radius, solids, ignoreWater);
  }

  private scaledSolid(solid: Solid): Solid {
    if (!solid.capsule || this.scale === 1) return solid;
    const radius = solid.capsule.radius * this.scale;
    return {
      ...solid,
      capsule: { ...solid.capsule, radius },
      bbox: {
        minX: solid.bbox.minX - radius,
        minY: solid.bbox.minY - radius,
        maxX: solid.bbox.maxX + radius,
        maxY: solid.bbox.maxY + radius,
      },
    };
  }
}

export function pushCircles(
  x: number,
  y: number,
  radius: number,
  circles: { x: number; y: number; r: number }[],
): { x: number; y: number; hit: boolean } {
  let cx = x;
  let cy = y;
  let hit = false;
  for (const circle of circles) {
    let dx = cx - circle.x;
    let dy = cy - circle.y;
    let dist = Math.hypot(dx, dy);
    const min = radius + circle.r;
    if (dist >= min) continue;
    if (dist < 1e-6) {
      dx = 1;
      dy = 0;
      dist = 1;
    }
    const pen = min - dist;
    cx += (dx / dist) * pen;
    cy += (dy / dist) * pen;
    hit = true;
  }
  return { x: cx, y: cy, hit };
}

export function coveredByWater(x: number, y: number, tile: TileWorld): boolean {
  if (onBridge(x, y, tile.roads)) return false;
  for (const poly of tile.polygons) {
    if (poly.kind !== "water") continue;
    if (x < poly.bbox.minX || x > poly.bbox.maxX || y < poly.bbox.minY || y > poly.bbox.maxY) continue;
    if (pointInRings(x, y, poly.rings)) return true;
  }
  for (const stroke of tile.strokes) {
    if (stroke.kind !== "waterway" || !stroke.blocking) continue;
    const hit = closestOnPolyline(x, y, stroke.points);
    if (hit.distance <= stroke.width / 2) return true;
  }
  return false;
}
