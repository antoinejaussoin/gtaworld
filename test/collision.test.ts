import { describe, expect, it } from "vitest";
import { buildTileWorld } from "../src/world/buildWorld";
import { CollisionWorld, coveredByWater, pushOutOfSolids, type Solid } from "../src/world/collision";
import { pointInRings } from "../src/world/geometry";
import type { DecodedFeature } from "../src/world/types";

const square: Solid = {
  kind: "building",
  rings: [[
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]],
  bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
};

describe("collision", () => {
  it("pushes a circle out of a building and leaves a clear circle alone", () => {
    const hit = pushOutOfSolids(10.4, 5, 1, [square], false);
    expect(hit.building).toBe(true);
    expect(hit.x).toBeGreaterThan(10.9);
    expect(hit.y).toBeCloseTo(5, 1);
    expect(pointInRings(hit.x, hit.y, square.rings ?? [])).toBe(false);

    const inside = pushOutOfSolids(9.2, 5, 1, [square], false);
    expect(inside.building).toBe(true);
    expect(pointInRings(inside.x, inside.y, square.rings ?? [])).toBe(false);

    const clear = pushOutOfSolids(14, 5, 1, [square], false);
    expect(clear.blocked).toBe(false);
    expect(clear.x).toBeCloseTo(14, 5);
    expect(clear.y).toBeCloseTo(5, 5);
  });

  it("lets a bridge stay drivable across water", () => {
    const features: DecodedFeature[] = [
      {
        layer: "water",
        type: 3,
        properties: { class: "river" },
        geometry: [[
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 20 },
          { x: 0, y: 20 },
        ]],
      },
      {
        layer: "transportation",
        type: 2,
        properties: { class: "primary", brunnel: "bridge" },
        geometry: [[
          { x: 0, y: 10 },
          { x: 40, y: 10 },
        ]],
      },
    ];
    const world = buildTileWorld({ z: 14, x: 0, y: 0 }, features);
    const collision = new CollisionWorld();
    collision.rebuild([world]);

    expect(coveredByWater(20, 10, world)).toBe(false);
    expect(coveredByWater(20, 2, world)).toBe(true);

    const onBridge = collision.resolve(20, 10, 1);
    expect(onBridge.water).toBe(false);
    expect(onBridge.x).toBeCloseTo(20, 4);
    expect(onBridge.y).toBeCloseTo(10, 4);
    const surface = collision.surfaceAt(20, 10);
    expect(surface.onRoad).toBe(true);
    expect(surface.bridge).toBe(true);
    expect(surface.roadClass).toBe("primary");

    const inWater = collision.resolve(20, 2, 1);
    expect(inWater.water).toBe(true);
    expect(pointInRings(inWater.x, inWater.y, world.polygons[0]?.rings ?? [])).toBe(false);
  });
});
