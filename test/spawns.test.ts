import { describe, expect, it } from "vitest";
import { buildTileWorld } from "../src/world/buildWorld";
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
});
