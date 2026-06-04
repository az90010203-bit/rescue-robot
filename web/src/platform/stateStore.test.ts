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
      piHelperReady: true,
      piConnectionReady: true,
      piTarget: "pi@raspberrypi.local",
      piLastExitCode: 0,
      piLastOutput: "ok",
      firmwareHelperReady: true,
      firmwareBoard: "arduino-uno",
      selectedFirmwarePort: "COM6",
      firmwareStatus: "compiled",
      firmwareHexSizeBytes: 1024,
      activeGamepad: {
        index: 0,
        id: "Xbox Wireless Controller",
        axes: 4,
        buttons: 17,
        mapping: "standard",
        axesValues: [0, -0.5, 0.2, 0],
        pressedButtons: [0, 5],
        input: { forward: 0.5, strafe: 0, turn: 0.2, cameraPan: 1, cameraTilt: 0, stop: false }
      },
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
    expect(state["camera:secondary"]).toMatchObject({
      deviceId: "camera:secondary",
      status: "standby",
      values: {
        sourceId: "secondary",
        devicePath: "/dev/video1",
        port: 8081
      }
    });
    expect(state["pi:main"]).toMatchObject({
      status: "online",
      values: {
        target: "pi@raspberrypi.local",
        helperReady: true,
        lastExitCode: 0,
        lastOutput: "ok"
      }
    });
    expect(state["firmware:local"]).toMatchObject({
      status: "online",
      values: {
        board: "arduino-uno",
        port: "COM6",
        status: "compiled",
        hexSizeBytes: 1024
      }
    });
    expect(state["gamepad:active"]).toMatchObject({
      status: "online",
      values: {
        connected: true,
        id: "Xbox Wireless Controller",
        mapping: "standard",
        axesValues: "0 -0.5 0.2 0",
        pressedButtons: "0, 5",
        forward: 0.5,
        turn: 0.2,
        cameraPan: 1,
        stop: false
      }
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
      firmwareBusy: true,
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
    expect(state["firmware:local"].status).toBe("standby");
    expect(state["gamepad:active"]).toMatchObject({
      status: "offline",
      values: {
        connected: false,
        id: null
      }
    });
  });
});
