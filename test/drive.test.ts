import { describe, expect, it } from "vitest";
import { stepDrive } from "../src/game/drive";

describe("arcade driving", () => {
  it("accelerates and then settles toward the road's speed cap", () => {
    const moving = stepDrive(0, 0, 0.5, {
      throttle: true,
      brake: false,
      steer: 0,
      handbrake: false,
      cap: 30,
    });
    expect(moving.speed).toBeGreaterThan(4);

    const capped = stepDrive(40, 0, 1, {
      throttle: true,
      brake: false,
      steer: 0,
      handbrake: false,
      cap: 13,
    });
    expect(capped.speed).toBeLessThan(25);
    expect(capped.speed).toBeGreaterThanOrEqual(13);
  });
});
