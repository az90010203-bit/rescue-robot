import { describe, expect, it } from "vitest";
import { createDefaultArmConfig, DEFAULT_CAMERA_CONFIG } from "../lib/storage";
import { createPlatformDevices } from "./deviceModel";

describe("platform device model", () => {
  it("maps existing servo, motor, camera, and arm config into devices", () => {
    const devices = createPlatformDevices({
      servos: [{ id: 22, name: "ID22" }],
      motors: [{ channel: "m1", name: "Left Track", pwmPin: "D5", in1Pin: "D4", in2Pin: "D7" }],
      cameraConfig: DEFAULT_CAMERA_CONFIG,
      armConfig: createDefaultArmConfig([{ id: 22, name: "ID22" }]),
      servoFeedback: {},
      motorFeedback: {},
      connected: false,
      connectionMode: null,
      cameraReady: false
    });

    expect(devices.map((device) => device.id)).toEqual(["servo:22", "motor:M1", "camera:main", "robot-arm:main"]);
    expect(devices[0]).toMatchObject({
      type: "servo",
      driverId: "driver.feetech-servo",
      transportId: "transport.web-serial",
      status: "offline"
    });
    expect(devices[1].capabilities[0].features).toContain("pwm_control");
  });

  it("marks devices with feedback as online", () => {
    const devices = createPlatformDevices({
      servos: [{ id: 22, name: "ID22" }],
      motors: [{ channel: "M1", name: "Left Track" }],
      cameraConfig: DEFAULT_CAMERA_CONFIG,
      armConfig: createDefaultArmConfig([]),
      servoFeedback: {
        22: { type: "servo.feedback", seq: 1, id: 22, positionRaw: 2048 }
      },
      motorFeedback: {
        M1: { type: "motor.feedback", seq: 2, channel: "M1", commandedSpeedPercent: 50 }
      },
      connected: true,
      connectionMode: "servo-bus",
      cameraReady: false
    });

    expect(devices.find((device) => device.id === "servo:22")?.status).toBe("online");
    expect(devices.find((device) => device.id === "motor:M1")?.status).toBe("online");
  });
});
