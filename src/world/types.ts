import type { BBox, Vec } from "./geometry";
import type { TileBounds, TileId } from "./project";

export type PropMap = Record<string, string | number | boolean>;

export interface DecodedFeature {
  layer: string;
  type: 1 | 2 | 3;
  properties: PropMap;
  geometry: Vec[][];
}

export interface Road {
  points: Vec[];
  width: number;
  driveable: boolean;
  walkable: boolean;
  speedFactor: number;
  maxSpeed: number;
  bridge: boolean;
  tunnel: boolean;
  layer: number;
  roadClass: string;
  subclass: string;
  bbox: BBox;
}

export interface PolyShape {
  rings: Vec[][];
  kind: "water" | "landcover" | "landuse" | "park" | "building" | "aeroway" | "paved";
  cls: string;
  color: string;
  height: number;
  bbox: BBox;
}

export interface StrokeLine {
  points: Vec[];
  width: number;
  color: string;
  blocking: boolean;
  bbox: BBox;
  kind: "waterway" | "railway" | "aeroway";
}

export interface ParkedCar {
  id: string;
  x: number;
  y: number;
  heading: number;
  color: string;
}

export interface PedSpawn {
  id: string;
  path: Vec[];
  distance: number;
  dir: 1 | -1;
  speed: number;
  color: string;
}

export interface MapLabel {
  x: number;
  y: number;
  text: string;
  kind: "road" | "water";
}

export interface Poi {
  x: number;
  y: number;
  kind: "fuel" | "parking" | "station";
  name: string;
}

export interface TileWorld {
  key: string;
  id: TileId;
  bounds: TileBounds;
  /** "map" is the vector-tile sample. "osm" is the full building footprints. */
  buildingSource: "map" | "osm";
  roads: Road[];
  polygons: PolyShape[];
  strokes: StrokeLine[];
  parked: ParkedCar[];
  pedestrians: PedSpawn[];
  labels: MapLabel[];
  pois: Poi[];
}
