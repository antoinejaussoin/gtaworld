import { TILE_ZOOM } from "./config";

export const EARTH_RADIUS_M = 6378137;
export const ORIGIN_SHIFT = Math.PI * EARTH_RADIUS_M;

export interface TileId {
  z: number;
  x: number;
  y: number;
}

export interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function lonLatToMercator(lon: number, lat: number): { x: number; y: number } {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = EARTH_RADIUS_M * lon * (Math.PI / 180);
  const y = EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
  return { x, y };
}

export function mercatorToLonLat(x: number, y: number): { lon: number; lat: number } {
  const lon = (x / EARTH_RADIUS_M) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS_M)) - Math.PI / 2) * (180 / Math.PI);
  return { lon, lat };
}

export function normalizeTile(z: number, x: number, y: number): TileId {
  const n = 2 ** z;
  const nx = ((x % n) + n) % n;
  const ny = Math.min(n - 1, Math.max(0, y));
  return { z, x: nx, y: ny };
}

export function lonLatToTile(lon: number, lat: number, z = TILE_ZOOM): TileId {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return normalizeTile(z, x, y);
}

export function mercatorToTile(x: number, y: number, z = TILE_ZOOM): TileId {
  const n = 2 ** z;
  const world = ORIGIN_SHIFT * 2;
  const tx = Math.floor(((x + ORIGIN_SHIFT) / world) * n);
  const ty = Math.floor(((ORIGIN_SHIFT - y) / world) * n);
  return normalizeTile(z, tx, ty);
}

export function tileBounds(id: TileId): TileBounds {
  const n = 2 ** id.z;
  const size = (ORIGIN_SHIFT * 2) / n;
  const minX = -ORIGIN_SHIFT + id.x * size;
  const maxY = ORIGIN_SHIFT - id.y * size;
  return { minX, maxX: minX + size, maxY, minY: maxY - size };
}

export function tileKey(id: TileId): string {
  return `${id.z}/${id.x}/${id.y}`;
}

export function parseTileKey(key: string): TileId {
  const [z, x, y] = key.split("/").map(Number);
  return { z, x, y };
}

export function tileChebyshev(a: TileId, b: TileId): number {
  const n = 2 ** a.z;
  let dx = Math.abs(a.x - b.x);
  dx = Math.min(dx, n - dx);
  return Math.max(dx, Math.abs(a.y - b.y));
}

/** Map vector-tile coordinates (y down) into Web Mercator meters (y up). */
export function mvtToMercator(
  rings: { x: number; y: number }[][],
  bounds: TileBounds,
  extent: number,
): { x: number; y: number }[][] {
  const sx = (bounds.maxX - bounds.minX) / extent;
  const sy = (bounds.maxY - bounds.minY) / extent;
  return rings.map((ring) =>
    ring.map((p) => ({
      x: bounds.minX + p.x * sx,
      y: bounds.maxY - p.y * sy,
    })),
  );
}

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${ns}   ${Math.abs(lon).toFixed(4)}° ${ew}`;
}
