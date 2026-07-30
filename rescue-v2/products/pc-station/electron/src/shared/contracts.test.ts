import { describe, expect, it } from "vitest";

import {
  cameraHealthSchema,
  capabilityInvocationSchema,
  motionIntentSchema,
  speedLimitsSchema
} from "./contracts";

describe("IPC contracts", () => {
  it("accepts bounded mecanum intent", () => {
    expect(
      motionIntentSchema.parse({
        mode: "mecanum",
        forwardMilli: 1000,
        strafeMilli: -1000,
        turnMilli: 0,
        speedLimitPercent: 70
      })
    ).toMatchObject({ mode: "mecanum", speedLimitPercent: 70 });
  });

  it("rejects motion outside hardware-independent limits", () => {
    expect(() =>
      motionIntentSchema.parse({
        mode: "tracked",
        leftMilli: 1001,
        rightMilli: 0,
        speedLimitPercent: 30
      })
    ).toThrow();
  });

  it("accepts only known capability payloads", () => {
    expect(
      capabilityInvocationSchema.parse({
        name: "gimbal",
        body: {
          action: "jog",
          axis: "pan",
          direction: -1,
          stepDeg: 5
        }
      })
    ).toMatchObject({ name: "gimbal" });
    expect(() =>
      capabilityInvocationSchema.parse({
        name: "gimbal",
        body: { action: "shell", command: "whoami" }
      })
    ).toThrow();
  });

  it("preserves current mecanum and tracked speed bounds", () => {
    expect(
      speedLimitsSchema.parse({ mecanumPercent: 70, trackedPercent: 100 })
    ).toEqual({ mecanumPercent: 70, trackedPercent: 100 });
    expect(() =>
      speedLimitsSchema.parse({ mecanumPercent: 100, trackedPercent: 100 })
    ).toThrow();
  });

  it("parses the camera telemetry required by the operator HUD", () => {
    const health = cameraHealthSchema.parse({
      ok: true,
      format: "H.264",
      codec: "avc1.640028",
      width: 1920,
      height: 1080,
      actualFps: 29.9,
      actualBitrateKbps: 6000,
      frameAgeMs: 22,
      reconnectCount: 0,
      degraded: false,
      powerWarning: false,
      audioAvailable: true,
      lastError: null
    });
    expect(health.frameAgeMs).toBe(22);
    expect(health.audioAvailable).toBe(true);
  });
});
