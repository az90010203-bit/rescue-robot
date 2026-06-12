import { describe, expect, it } from "vitest";
import { angleDegToRaw } from "@adapters/hardware/protocol";
import { servoRealtimeFeedbackFromResponse } from "@app/servoRealtimeFeedback";

describe("servoRealtimeFeedbackFromResponse", () => {
  it("accepts semantic Pi bridge feedback with raw position", () => {
    const feedback = servoRealtimeFeedbackFromResponse({
      type: "servo.feedback",
      seq: 12,
      id: 9,
      positionRaw: angleDegToRaw(190),
      moving: false
    });

    expect(feedback?.id).toBe(9);
    expect(feedback?.positionDeg).toBeCloseTo(190, 1);
    expect(feedback?.moving).toBe(false);
  });

  it("accepts legacy Feetech status packets", () => {
    const feedback = servoRealtimeFeedbackFromResponse({
      id: 9,
      status: 0,
      params: [0x80, 0x07, 0, 0, 40, 0, 120, 29, 0, 0, 0, 0, 0, 0, 0],
      checksum: 0
    });

    expect(feedback?.id).toBe(9);
    expect(feedback?.positionDeg).toBeCloseTo(168.79, 1);
  });
});
