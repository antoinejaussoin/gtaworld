/** Pinned OpenFreeMap planet. Bump this to pick up a newer OpenStreetMap extract. */
export const SNAPSHOT = "20261101_080013_pt";

export const TILE_ZOOM = 14;
export const VIEW_WIDTH_M = 160;
export const MAX_IN_FLIGHT = 4;
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_BYTES = 200 * 1024 * 1024;
export const USER_AGENT = "gtaworld/0.1 (top-down real-world drive)";
export const KEEP_TILE_RADIUS = 2;

export const CAR_LENGTH_M = 4.2;
export const CAR_WIDTH_M = 1.8;
export const WALK_SPEED_MPS = 1.7;
export const MPS_TO_MPH = 2.2369362920544;

export const ROAD_WIDTH_M: Record<string, number> = {
  motorway: 11,
  trunk: 10,
  primary: 9,
  secondary: 7.5,
  tertiary: 6.5,
  minor: 5.5,
  service: 3.5,
  track: 3.5,
  raceway: 10,
  busway: 7,
  bus_guideway: 7,
  path: 1.6,
};

export const ROAD_MAX_SPEED_MPS: Record<string, number> = {
  motorway: 42,
  trunk: 34,
  primary: 26,
  secondary: 20,
  tertiary: 16,
  minor: 13,
  service: 9,
  track: 11,
  raceway: 42,
  busway: 16,
  bus_guideway: 16,
  path: 4,
};

export function tileUrl(z: number, x: number, y: number): string {
  return `https://tiles.openfreemap.org/planet/${SNAPSHOT}/${z}/${x}/${y}.pbf`;
}

export function cacheKey(z: number, x: number, y: number): string {
  return `${SNAPSHOT}/${z}/${x}/${y}`;
}
