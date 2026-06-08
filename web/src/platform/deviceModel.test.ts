import { describe, expect, it } from "vitest";
import { createDefaultArmConfig, DEFAULT_CAMERA_CONFIG } from "@adapters/persistence/storage";
import { createPlatformDevices } from "@platform/deviceModel";

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
      cameraReady: false,
      piHelperReady: true,
      piConnectionReady: false,
      piTarget: "pi@raspberrypi.local",
      firmwareHelperReady: true,
      firmwareStatus: "idle",
      selectedFirmwarePort: "COM6",
      firmwareBoard: "arduino-uno"
    });

    expect(devices.map((device) => device.id)).toEqual(["servo:22", "motor:M1", "camera:main", "camera:secondary", "robot-arm:main", "pi:main", "firmware:local", "gamepad:active"]);
    expect(devices[0]).toMatchObject({
      type: "servo",
      driverId: "driver.feetech-servo",
      transportId: "transport.web-serial",
      status: "offline"
    });
    expect(devices[1].capabilities[0].features).toContain("pwm_control");
    expect(devices.find((device) => device.id === "robot-arm:main")).toMatchObject({
      driverId: "driver.robot-arm-composite"
    });
    expect(devices.find((device) => device.id === "camera:secondary")).toMatchObject({
      type: "camera",
      driverId: "driver.secondary-camera",
      metadata: {
        sourceId: "secondary",
        devicePath: "/dev/video1",
        port: 8081
      }
    });
    expect(devices.find((device) => device.id === "pi:main")).toMatchObject({
      type: "raspberry-pi",
      status: "standby"
    });
    expect(devices.find((device) => device.id === "firmware:local")).toMatchObject({
      type: "firmware",
      status: "online"
    });
    expect(devices.find((device) => device.id === "gamepad:active")).toMatchObject({
      type: "gamepad",
      status: "offline",
      driverId: "driver.browser-gamepad",
      transportId: "transport.browser-gamepad-api"
    });
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
      cameraReady: false,
      piConnectionReady: true,
      firmwareBusy: true,
      activeGamepad: {
        index: 0,
        id: "Xbox Wireless Controller",
        axes: 4,
        buttons: 17,
        mapping: "standard",
        axesValues: [0, -0.5, 0.2, 0],
        pressedButtons: [0],
        input: { forward: 0.5, strafe: 0, turn: 0.2, stop: true }
      }
    });

    expect(devices.find((device) => device.id === "servo:22")?.status).toBe("online");
    expect(devices.find((device) => device.id === "motor:M1")?.status).toBe("online");
    expect(devices.find((device) => device.id === "pi:main")?.status).toBe("online");
    expect(devices.find((device) => device.id === "firmware:local")?.status).toBe("standby");
    expect(devices.find((device) => device.id === "gamepad:active")).toMatchObject({
      status: "online",
      metadata: {
        id: "Xbox Wireless Controller",
        axes: 4,
        buttons: 17,
        forward: 0.5,
        stop: true
      }
    });
  });
});
