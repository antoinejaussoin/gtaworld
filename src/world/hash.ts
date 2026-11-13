export function hashParts(parts: (string | number)[]): number {
  let h = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable hash of a footprint. Coordinates are quantized to centimeters. */
export function hashGeometry(points: { x: number; y: number }[]): number {
  const parts: number[] = [];
  const count = Math.min(points.length, 8);
  for (let i = 0; i < count; i++) {
    parts.push(Math.round(points[i].x * 100), Math.round(points[i].y * 100));
  }
  return hashParts(parts);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
