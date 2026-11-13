import { describe, expect, it } from "vitest";
import { ORIGIN_SHIFT, lonLatToMercator, lonLatToTile, mercatorToLonLat, mercatorToTile, tileBounds } from "../src/world/project";

describe("web mercator", () => {
  it("puts the origin at 0,0 and the antimeridian at the projection edge", () => {
    const origin = lonLatToMercator(0, 0);
    expect(origin.x).toBeCloseTo(0, 8);
    expect(origin.y).toBeCloseTo(0, 8);
    expect(lonLatToMercator(180, 0).x).toBeCloseTo(ORIGIN_SHIFT, 6);
  });

  it("round-trips a London coordinate and lands in the known zoom-14 tile", () => {
    const london = { lon: -0.1278, lat: 51.5074 };
    const merc = lonLatToMercator(london.lon, london.lat);
    expect(merc.x).toBeCloseTo(-14226.630923380362, 4);
    expect(merc.y).toBeCloseTo(6711542.475587636, 3);
    const back = mercatorToLonLat(merc.x, merc.y);
    expect(back.lon).toBeCloseTo(london.lon, 8);
    expect(back.lat).toBeCloseTo(london.lat, 8);

    const tile = { z: 14, x: 8186, y: 5448 };
    expect(lonLatToTile(london.lon, london.lat, 14)).toEqual(tile);
    expect(mercatorToTile(merc.x, merc.y, 14)).toEqual(tile);
    const bounds = tileBounds(tile);
    expect(merc.x).toBeGreaterThan(bounds.minX);
    expect(merc.x).toBeLessThan(bounds.maxX);
    expect(merc.y).toBeGreaterThan(bounds.minY);
    expect(merc.y).toBeLessThan(bounds.maxY);
  });

  it("indexes a point just north-east of the origin into zoom 1", () => {
    expect(lonLatToTile(1, 1, 1)).toEqual({ z: 1, x: 1, y: 0 });
  });
});
