import { describe, expect, it } from "vitest";
import { buildTileWorld } from "../src/world/buildWorld";
import { isPedestrianWay } from "../src/world/roads";
import type { DecodedFeature } from "../src/world/types";

const tile = { z: 14, x: 1, y: 1 };

function road(points: { x: number; y: number }[]): DecodedFeature {
  return {
    layer: "transportation",
    type: 2,
    properties: { class: "minor", subclass: "residential" },
    geometry: [points],
  };
}

describe("deterministic spawns", () => {
  it("parks the same cars and pedestrians when the same road is built twice", () => {
    const features = [road([{ x: 0, y: 0 }, { x: 200, y: 0 }])];
    const first = buildTileWorld(tile, features);
    const second = buildTileWorld(tile, features);
    expect(first.parked).toHaveLength(10);
    expect(second.parked).toEqual(first.parked);
    expect(second.pedestrians).toEqual(first.pedestrians);
    expect(first.pedestrians.length).toBeGreaterThan(0);
    expect(first.roads[0]?.width).toBe(5.5);
    expect(first.roads[0]?.driveable).toBe(true);
  });

  it("keeps building footprints and drops pedestrian paths", () => {
    const features: DecodedFeature[] = [
      road([{ x: 0, y: 0 }, { x: 80, y: 0 }]),
      {
        layer: "transportation",
        type: 2,
        properties: { class: "path", subclass: "footway" },
        geometry: [[{ x: 0, y: 8 }, { x: 80, y: 8 }]],
      },
      {
        layer: "building",
        type: 3,
        properties: { render_height: 9 },
        geometry: [[
          { x: 10, y: 12 },
          { x: 22, y: 12 },
          { x: 22, y: 20 },
          { x: 10, y: 20 },
        ]],
      },
    ];
    const world = buildTileWorld(tile, features);
    expect(world.roads.some((item) => isPedestrianWay(item.roadClass, item.subclass))).toBe(false);
    expect(world.polygons.filter((item) => item.kind === "building")).toHaveLength(1);
  });
});
