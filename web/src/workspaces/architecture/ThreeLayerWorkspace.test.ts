import { describe, expect, it } from "vitest";
import { angleDegToRaw } from "@adapters/hardware/protocol";
import { servoFeedbackFromResponse } from "@workspaces/architecture/ThreeLayerWorkspace";

describe("ThreeLayerWorkspace servo feedback helpers", () => {
  it("normalizes semantic Pi bridge feedback raw position to degrees", () => {
    const feedback = servoFeedbackFromResponse({
      type: "servo.feedback",
      seq: 91,
      id: 9,
      positionRaw: angleDegToRaw(190),
      temperatureC: 29,
      moving: false
    });

    expect(feedback?.positionRaw).toBe(angleDegToRaw(190));
    expect(feedback?.positionDeg).toBeCloseTo(190, 1);
    expect(feedback?.temperatureC).toBe(29);
    expect(feedback?.moving).toBe(false);
  });
});
