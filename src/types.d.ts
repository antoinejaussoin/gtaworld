declare module "pbf" {
  export default class Pbf {
    constructor(buf?: ArrayBuffer | Uint8Array);
  }
}

declare module "@mapbox/vector-tile" {
  export class VectorTile {
    constructor(pbf: unknown);
    layers: Record<string, VectorTileLayer>;
  }

  export class VectorTileLayer {
    name: string;
    extent: number;
    length: number;
    feature(i: number): VectorTileFeature;
  }

  export class VectorTileFeature {
    type: 1 | 2 | 3;
    properties: Record<string, string | number | boolean>;
    loadGeometry(): { x: number; y: number }[][];
  }
}
