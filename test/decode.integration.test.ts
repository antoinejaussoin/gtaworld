import { describe, expect, it } from "vitest";
import { buildTileWorld } from "../src/world/buildWorld";
import { tileUrl } from "../src/world/config";
import { decodeTile } from "../src/world/decode";
import { lonLatToTile } from "../src/world/project";

describe("pinned snapshot", () => {
  it("turns a real London tile into the same streets twice", async () => {
    const id = lonLatToTile(-0.1278, 51.5074, 14);
    const response = await fetch(tileUrl(id.z, id.x, id.y));
    expect(response.ok, `tile ${id.z}/${id.x}/${id.y} status ${response.status}`).toBe(true);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const features = decodeTile(bytes, id);
    const first = buildTileWorld(id, features);
    const second = buildTileWorld(id, features);
    const buildings = first.polygons.filter((poly) => poly.kind === "building").length;
    const driveable = first.roads.filter((road) => road.driveable).length;
    const classes = [...new Set(first.roads.map((road) => road.roadClass))].sort().join(",");
    expect(buildings, `buildings=${buildings} driveable=${driveable} parked=${first.parked.length} classes=${classes}`).toBeGreaterThan(20);
    expect(first.parked.length, classes).toBeGreaterThan(0);
    expect(driveable).toBeGreaterThan(10);
    expect(second.parked).toEqual(first.parked);
    expect(second.pedestrians).toEqual(first.pedestrians);
    expect(second.roads.map((road) => [road.roadClass, road.width, road.points.length])).toEqual(
      first.roads.map((road) => [road.roadClass, road.width, road.points.length]),
    );
  });
});
