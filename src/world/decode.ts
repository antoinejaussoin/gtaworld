import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import type { DecodedFeature, PropMap } from "./types";
import { mvtToMercator, tileBounds, type TileId } from "./project";

const KEEP_LAYERS = new Set([
  "water",
  "waterway",
  "water_name",
  "landcover",
  "landuse",
  "park",
  "transportation",
  "transportation_name",
  "building",
  "poi",
  "aeroway",
]);

export function decodeTile(buffer: Uint8Array | ArrayBuffer, id: TileId): DecodedFeature[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength === 0) return [];
  let tile: VectorTile;
  try {
    tile = new VectorTile(new Pbf(bytes));
  } catch {
    return [];
  }
  const bounds = tileBounds(id);
  const features: DecodedFeature[] = [];
  for (const name of Object.keys(tile.layers)) {
    if (!KEEP_LAYERS.has(name)) continue;
    const layer = tile.layers[name];
    const extent = layer.extent || 4096;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      if (feature.type !== 1 && feature.type !== 2 && feature.type !== 3) continue;
      let geometry;
      try {
        geometry = mvtToMercator(feature.loadGeometry(), bounds, extent);
      } catch {
        continue;
      }
      features.push({
        layer: name,
        type: feature.type,
        properties: feature.properties as PropMap,
        geometry,
      });
    }
  }
  return features;
}
