import { closestOnPolyline, pointAlong, polylineLength, type Vec } from "../world/geometry";
import type { PedSpawn } from "../world/types";

export interface Ped {
  id: string;
  tileKey: string;
  path: Vec[];
  pathLength: number;
  distance: number;
  dir: 1 | -1;
  speed: number;
  color: string;
  x: number;
  y: number;
  knock: number;
  vx: number;
  vy: number;
}

export function pedFromSpawn(spawn: PedSpawn, tileKey: string): Ped {
  const at = pointAlong(spawn.path, spawn.distance);
  return {
    id: spawn.id,
    tileKey,
    path: spawn.path,
    pathLength: polylineLength(spawn.path),
    distance: spawn.distance,
    dir: spawn.dir,
    speed: spawn.speed,
    color: spawn.color,
    x: at.x,
    y: at.y,
    knock: 0,
    vx: 0,
    vy: 0,
  };
}

export function stepPed(ped: Ped, dt: number, threat: { x: number; y: number; vx: number; vy: number } | null): void {
  if (ped.knock > 0) {
    ped.knock -= dt;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;
    const damp = Math.max(0, 1 - 3 * dt);
    ped.vx *= damp;
    ped.vy *= damp;
    if (ped.knock <= 0 && ped.path.length > 1) {
      const back = closestOnPolyline(ped.x, ped.y, ped.path);
      ped.distance = back.along;
      ped.x = back.x;
      ped.y = back.y;
    }
    return;
  }

  ped.distance += ped.dir * ped.speed * dt;
  if (ped.distance >= ped.pathLength) {
    ped.distance = ped.pathLength;
    ped.dir = -1;
  } else if (ped.distance <= 0) {
    ped.distance = 0;
    ped.dir = 1;
  }
  const at = pointAlong(ped.path, ped.distance);
  ped.x = at.x;
  ped.y = at.y;

  if (!threat) return;
  const dx = ped.x - threat.x;
  const dy = ped.y - threat.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  if (dist >= 1.2) return;
  const pen = 1.2 - dist;
  ped.x += (dx / dist) * pen;
  ped.y += (dy / dist) * pen;
  const impact = Math.hypot(threat.vx, threat.vy);
  if (impact > 3.5) {
    ped.knock = 0.55;
    ped.vx = threat.vx * 0.8 + (dx / dist) * 2;
    ped.vy = threat.vy * 0.8 + (dy / dist) * 2;
  }
}
