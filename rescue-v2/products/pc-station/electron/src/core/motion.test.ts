import { describe, expect, it } from "vitest";

import {
  SPEED_MODES,
  computeMecanumTarget,
  computeTrackedTarget,
  nextSpeedLevel
} from "./motion";

describe("motion mapping", () => {
  it("normalizes combined mecanum axes to one unit of operator intent", () => {
    expect(computeMecanumTarget(new Set(["forward", "right", "turn-left"]))).toEqual({
      forwardMilli: 333,
      strafeMilli: 333,
      turnMilli: -333
    });
  });

  it("cancels opposing mecanum controls", () => {
    expect(
      computeMecanumTarget(new Set(["forward", "backward", "left", "right"]))
    ).toEqual({
      forwardMilli: 0,
      strafeMilli: 0,
      turnMilli: 0
    });
  });

  it("maps tracked controls independently", () => {
    expect(
      computeTrackedTarget(new Set(["left-forward", "right-backward"]))
    ).toEqual({
      leftMilli: 1000,
      rightMilli: -1000
    });
  });

  it("cycles the three controller-compatible speed modes", () => {
    expect(SPEED_MODES.map((mode) => [mode.name, mode.mecanum, mode.tracked])).toEqual([
      ["CRUISE MODE", 30, 30],
      ["TURBO MODE", 50, 60],
      ["HYPER MODE", 70, 100]
    ]);
    expect(nextSpeedLevel(0)).toBe(1);
    expect(nextSpeedLevel(2)).toBe(0);
    expect(nextSpeedLevel(null)).toBe(0);
  });
});
