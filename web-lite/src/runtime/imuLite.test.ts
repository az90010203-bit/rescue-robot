import { describe, expect, it } from "vitest";
import type { AboardCommandResult } from "./bridgeClient";
import { buildLiteImuReadCommand, createLiteImuSnapshot, liteImuFeedbackFromResult } from "./imuLite";

describe("web-lite IMU runtime", () => {
  it("builds the semantic A-board IMU read command", () => {
    expect(buildLiteImuReadCommand(42)).toEqual({ type: "imu.read", seq: 42 });
  });

  it("extracts the latest IMU feedback from an A-board result", () => {
    const result: AboardCommandResult = {
      ok: true,
      messages: [
        { type: "ack", seq: 1 },
        { type: "imu.feedback", seq: 1, ready: false, error: "warming" },
        { type: "imu.feedback", seq: 2, ready: true, mpuWhoAmI: 0x70, istWhoAmI: 0x10 }
      ]
    };

    expect(liteImuFeedbackFromResult(result)).toMatchObject({
      ready: true,
      seq: 2,
      mpuWhoAmI: 0x70
    });
  });

  it("calculates roll, pitch, and gyro values for the operator panel", () => {
    const snapshot = createLiteImuSnapshot({
      type: "imu.feedback",
      seq: 7,
      ready: true,
      accelRaw: { x: 0, y: 0, z: 4096 },
      gyroRaw: { x: 16.4, y: -32.8, z: 0 },
      mpuWhoAmI: 0x70,
      sampleMs: 123
    }, 1000);

    expect(snapshot.attitude?.rollDeg).toBeCloseTo(0, 1);
    expect(snapshot.attitude?.pitchDeg).toBeCloseTo(0, 1);
    expect(snapshot.attitude?.gyroDps).toMatchObject({ x: 1, y: -2, z: 0 });
    expect(snapshot.receivedAtMs).toBe(1000);
  });
});
