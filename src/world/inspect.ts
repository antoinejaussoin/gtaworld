import { buildTileWorld } from "./buildWorld";
import type { TileCache } from "./cache";
import { TILE_ZOOM } from "./config";
import { coveredByWater } from "./collision";
import { decodeTile } from "./decode";
import { lonLatToMercator, lonLatToTile } from "./project";
import { loadTileBytes } from "./stream";

export type PinCheck = "ok" | "water" | "error";

export async function inspectPin(lon: number, lat: number, cache: TileCache): Promise<PinCheck> {
  const id = lonLatToTile(lon, lat, TILE_ZOOM);
  try {
    const { bytes } = await loadTileBytes(id, cache);
    const world = buildTileWorld(id, decodeTile(bytes, id));
    const point = lonLatToMercator(lon, lat);
    return coveredByWater(point.x, point.y, world) ? "water" : "ok";
  } catch {
    return "error";
  }
}
