import { describe, expect, it } from "vitest";
import { hashGeometry } from "../src/world/hash";
import { roadProfile } from "../src/world/roads";
import { roofColor } from "../src/world/style";

describe("road profile", () => {
  it("uses real-world default widths", () => {
    expect(roadProfile({ class: "motorway" }).width).toBe(11);
    expect(roadProfile({ class: "trunk" }).width).toBe(10);
    expect(roadProfile({ class: "primary" }).width).toBe(9);
    expect(roadProfile({ class: "secondary" }).width).toBe(7.5);
    expect(roadProfile({ class: "tertiary" }).width).toBe(6.5);
    expect(roadProfile({ class: "minor", subclass: "residential" }).width).toBe(5.5);
    expect(roadProfile({ class: "service" }).width).toBe(3.5);
  });

  it("leaves footways off the driveable network and slows unpaved roads", () => {
    const footway = roadProfile({ class: "path", subclass: "footway" });
    expect(footway.driveable).toBe(false);
    expect(footway.walkable).toBe(true);
    expect(roadProfile({ class: "secondary", surface: "unpaved" }).speedFactor).toBe(0.55);
    expect(roadProfile({ class: "primary", brunnel: "bridge" }).bridge).toBe(true);
    expect(roadProfile({ class: "primary", brunnel: "tunnel" }).tunnel).toBe(true);
    expect(roadProfile({ class: "rail", subclass: "rail" }).railway).toBe(true);
    expect(roadProfile({ class: "rail", subclass: "rail" }).driveable).toBe(false);
  });
});

describe("stable colours", () => {
  it("hashes footprints that round to the same centimeter to the same roof", () => {
    const a = [{ x: 1.004, y: 2 }, { x: 3, y: 4 }];
    const b = [{ x: 1.001, y: 2 }, { x: 3.004, y: 4.001 }];
    expect(hashGeometry(a)).toBe(hashGeometry(b));
    expect(roofColor(undefined, a)).toBe(roofColor(undefined, b));
    expect(roofColor("#336699", a)).toBe("#336699");
    expect(roofColor("red", a)).toBe("#a33b32");
    expect(roofColor("white", a)).not.toBe("#f4f1ea");
  });
});
