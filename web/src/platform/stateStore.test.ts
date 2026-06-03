import { describe, expect, it } from "vitest";
import { createDefaultArmConfig, DEFAULT_CAMERA_CONFIG } from "../lib/storage";
import { createPlatformStateSnapshot } from "./stateStore";

describe("platform state store", () => {
  it("maps servo and motor feedback into normalized device state", () => {
    const state = createPlatformStateSnapshot({
      servoFeedback: {
        22: {
          type: "servo.feedback",
          seq: 1,
          id: 22,
          positionRaw: 1000,
          speedRaw: 120,
          voltageRaw: 74,
          temperatureC: 32,
          moving: true
        }
      },
      motorFeedback: {
        M1: {
          type: "motor.feedback",
          seq: 2,
          channel: "m1",
          commandedSpeedPercent: 40,
          dutyPercent: 38,
          direction: "forward",
          encoderTicks: 12
        }
      },
      cameraConfig: DEFAULT_CAMERA_CONFIG,
      armConfig: createDefaultArmConfig([]),
      connected: true,
      connectionMode: "controller",
      updatedAt: 100
    });

    expect(state["servo:22"]).toMatchObject({
      deviceId: "servo:22",
      status: "online",
      values: {
        positionRaw: 1000,
        speedRaw: 120,
        voltageRaw: 74,
        temperatureC: 32,
        moving: true
      },
      updatedAt: 100
    });
    expect(state["motor:M1"].values).toMatchObject({
      channel: "M1",
      commandedSpeedPercent: 40,
      dutyPercent: 38,
      direction: "forward",
      encoderTicks: 12
    });
  });

  it("includes serial connection state even without telemetry", () => {
    const state = createPlatformStateSnapshot({
      servoFeedback: {},
      motorFeedback: {},
      cameraConfig: DEFAULT_CAMERA_CONFIG,
      armConfig: createDefaultArmConfig([]),
      connected: false,
      connectionMode: null,
      updatedAt: 200
    });

    expect(state["connection:serial"]).toMatchObject({
      status: "offline",
      values: {
        connected: false,
        mode: null
      },
      updatedAt: 200
    });
  });
});
