export interface Vec {
  x: number;
  y: number;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function bboxOfPoints(points: Vec[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function bboxOfRings(rings: Vec[][]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function ringArea(ring: Vec[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return area / 2;
}

/** Split a tile polygon into outer rings plus holes, using winding in y-up meters. */
export function polygonParts(rings: Vec[][]): Vec[][][] {
  const usable = rings.filter((ring) => ring.length >= 3);
  if (usable.length === 0) return [];
  const areas = usable.map(ringArea);
  let maxAbs = 0;
  let outerPositive = true;
  for (const area of areas) {
    const abs = Math.abs(area);
    if (abs > maxAbs) {
      maxAbs = abs;
      outerPositive = area >= 0;
    }
  }
  const parts: Vec[][][] = [];
  let current: Vec[][] | null = null;
  for (let i = 0; i < usable.length; i++) {
    const isOuter = outerPositive ? areas[i] >= 0 : areas[i] < 0;
    if (isOuter || current === null) {
      current = [usable[i]];
      parts.push(current);
    } else {
      current.push(usable[i]);
    }
  }
  return parts;
}

export function pointInRing(x: number, y: number, ring: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const crosses = yi > y !== yj > y;
    if (crosses) {
      const xCross = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xCross) inside = !inside;
    }
  }
  return inside;
}

export function pointInRings(x: number, y: number, rings: Vec[][]): boolean {
  if (rings.length === 0 || rings[0].length < 3) return false;
  if (!pointInRing(x, y, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (rings[i].length >= 3 && pointInRing(x, y, rings[i])) return false;
  }
  return true;
}

export function polylineLength(points: Vec[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

export interface PolylineHit {
  x: number;
  y: number;
  distance: number;
  heading: number;
  along: number;
}

export function closestOnPolyline(px: number, py: number, points: Vec[]): PolylineHit {
  const fallback = points[0] ?? { x: px, y: py };
  let best: PolylineHit = {
    x: fallback.x,
    y: fallback.y,
    distance: Infinity,
    heading: 0,
    along: 0,
  };
  let walked = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const segLen = Math.sqrt(len2);
    let t = 0;
    if (len2 > 1e-12) {
      t = clamp(((px - a.x) * dx + (py - a.y) * dy) / len2, 0, 1);
    }
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const distance = Math.hypot(px - x, py - y);
    if (distance < best.distance) {
      best = { x, y, distance, heading: Math.atan2(dy, dx), along: walked + segLen * t };
    }
    walked += segLen;
  }
  return best;
}

export function pointAlong(points: Vec[], distance: number): { x: number; y: number; heading: number } {
  if (points.length === 0) return { x: 0, y: 0, heading: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, heading: 0 };
  let remain = Math.max(0, distance);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen >= remain || i === points.length - 2) {
      const t = segLen > 1e-8 ? clamp(remain / segLen, 0, 1) : 0;
      return { x: a.x + dx * t, y: a.y + dy * t, heading: Math.atan2(dy, dx) };
    }
    remain -= segLen;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, heading: 0 };
}

export interface Sample {
  x: number;
  y: number;
  heading: number;
  along: number;
}

export function walkSamples(points: Vec[], spacing: number, inset: number): Sample[] {
  const total = polylineLength(points);
  if (total < inset * 2 + 1 || spacing <= 0) return [];
  const out: Sample[] = [];
  for (let along = inset; along <= total - inset + 1e-6; along += spacing) {
    const p = pointAlong(points, along);
    out.push({ x: p.x, y: p.y, heading: p.heading, along });
  }
  return out;
}

/** Offset a polyline to its left (positive) or right (negative) in y-up space. */
export function offsetPolyline(points: Vec[], dist: number): Vec[] {
  if (points.length < 2 || dist === 0) return points.map((p) => ({ x: p.x, y: p.y }));
  const out: Vec[] = [];
  for (let i = 0; i < points.length; i++) {
    let nx = 0;
    let ny = 0;
    if (i > 0) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const len = Math.hypot(dx, dy) || 1;
      nx += -dy / len;
      ny += dx / len;
    }
    if (i < points.length - 1) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.hypot(dx, dy) || 1;
      nx += -dy / len;
      ny += dx / len;
    }
    const len = Math.hypot(nx, ny) || 1;
    out.push({ x: points[i].x + (nx / len) * dist, y: points[i].y + (ny / len) * dist });
  }
  return out;
}
