import { describe, expect, it, vi } from "vitest";
import { asmgMdDegreesToPositionRaw } from "@adapters/hardware/asmgMdCanServo";
import { createAppPlatformCommandDispatcher } from "@app/appPlatformCommandBridge";
import { createPlatformCommand, type PlatformCommand, type PlatformCommandResult } from "@platform/commands";

function createOptions(overrides: Record<string, unknown> = {}) {
  const sentBatches: unknown[][] = [];
  let seq = 10;
  return {
    options: {
      activeCameraSource: { id: "main", label: "Main", devicePath: "/dev/video0", port: 8080, streamUrl: "" },
      armConfig: { joints: [] },
      armTeachStatus: { recording: false, playing: false },
      cameraConfig: { streamUrl: "", videoSources: [], activeVideoSourceId: "main", videoLayout: "single" },
      centerCamera: vi.fn(),
      checkFirmwareHelper: vi.fn(),
      checkAiVisionHelper: vi.fn(),
      analyzeAiVision: vi.fn(),
      captureAiVisionSample: vi.fn(),
      checkRaspberryPiCamera: vi.fn(),
      compileArduinoFirmware: vi.fn(),
      components: [
        {
          id: "base",
          kind: "mecanum-drive",
          name: "Mecanum Base",
          config: {
            closedLoop: true,
            maxRpm: 6000,
            encoderTicksPerRev: 52,
            wheels: { frontLeft: "motor:m1", rearLeft: "motor:m2", rearRight: "motor:m3", frontRight: "motor:m4" },
            directions: { frontLeft: 1, rearLeft: 1, rearRight: 1, frontRight: 1 },
          },
        },
      ],
      dispatchPlatformCommand: vi.fn(async (command: PlatformCommand): Promise<PlatformCommandResult> => ({
        commandId: command.id,
        deviceId: command.targetDeviceId,
        status: "skipped",
        message: "platform command was not handled",
      })),
      emitPlatformCommandResult: vi.fn(),
      execRaspberryPiCommandWith: vi.fn(),
      firmwareBoard: "",
      firmwarePorts: [],
      installRaspberryPiCameraTools: vi.fn(),
      nextSeq: () => seq++,
      pauseArm: vi.fn(),
      pauseArmForConfig: vi.fn(),
      piRemoteFile: null,
      piRemoteForm: { host: "pi.local", username: "robot1", password: "", command: "", remotePath: "" },
      playArmTeachTrack: vi.fn(),
      pluginInstances: [],
      refreshFirmwarePorts: vi.fn(),
      resetCameraSourceRuntime: vi.fn(),
      selectedArmTeachTrack: null,
      selectedFirmwarePort: "",
      sendArmPoseForConfig: vi.fn(),
      sendCameraGimbalMove: vi.fn(),
      sendMotorCommandBatch: vi.fn(async (commands: unknown[]) => {
        sentBatches.push(commands);
        return true;
      }),
      servos: [],
      setSelectedFirmwarePort: vi.fn(),
      setupRaspberryPiWorkspace: vi.fn(),
      startArmTeachRecording: vi.fn(),
      startRaspberryPiCameraStream: vi.fn(),
      stopArmTeachRecording: vi.fn(),
      stopMode: "coast",
      stopRaspberryPiCameraStream: vi.fn(),
      t: (key: string) => key,
      testRaspberryPiConnection: vi.fn(),
      uploadAndExecRaspberryPiFileWith: vi.fn(),
      uploadCompiledArduinoFirmware: vi.fn(),
      uploadRaspberryPiFileWith: vi.fn(),
      ...overrides,
    },
    sentBatches,
  };
}

describe("app platform A-board semantic bridge", () => {
  it("sends one semantic mecanum target instead of expanding wheel commands", async () => {
    const { options, sentBatches } = createOptions();
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("mecanum-drive.set_velocity", "mecanum-drive:base", {
      forward: 0.4,
      strafe: -0.2,
      turn: 0.1,
      speedLimitPercent: 65,
      stopMode: "brake",
    }));

    expect(result.status).toBe("sent");
    expect(sentBatches).toEqual([
      [
        {
          type: "mecanum.target",
          seq: 10,
          forward: 0.4,
          strafe: -0.2,
          turn: 0.1,
          speedLimitPercent: 65,
          stopMode: "brake",
        },
      ],
    ]);
  });

  it("sends one semantic mecanum stop command", async () => {
    const { options, sentBatches } = createOptions();
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("mecanum-drive.stop", "mecanum-drive:base", { stopMode: "brake" }));

    expect(result.status).toBe("sent");
    expect(sentBatches).toEqual([[{ type: "mecanum.stop", seq: 10, stopMode: "brake" }]]);
  });

  it("sends CAN servo group targets through plugin limits and direction", async () => {
    const plugins = [
      canServo("can-a", 1, { minDeg: 10, maxDeg: 110 }),
      canServo("can-b", 2, { minDeg: 20, maxDeg: 120, direction: -1 }),
      canServo("can-c", 3),
      canServo("can-d", 4),
    ];
    const { options, sentBatches } = createOptions({
      components: [
        {
          id: "claw",
          kind: "can-servo-group",
          name: "Claw",
          config: {
            servos: { servo1: "can-a", servo2: "can-b", servo3: "can-c", servo4: "can-d" },
          },
        },
      ],
      pluginInstances: plugins,
    });
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      positions: { servo1: 50, servo2: 30, servo3: 90, servo4: 180 },
      speedRaw: 300,
    }));

    expect(result.status).toBe("sent");
    expect(sentBatches).toEqual([[
      { type: "can_servo.config", seq: 10, bitrateKbps: 250 },
      {
        type: "can_servo.group_move",
        seq: 11,
        targets: [
          { id: 1, position: asmgMdDegreesToPositionRaw(60) },
          { id: 2, position: asmgMdDegreesToPositionRaw(90) },
          { id: 3, position: asmgMdDegreesToPositionRaw(90) },
          { id: 4, position: asmgMdDegreesToPositionRaw(180) },
        ],
        speed: 300,
      },
    ]]);
  });
});

function canServo(id: string, servoId: number, config: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    type: "servo",
    catalogItemId: "catalog.asme.asme-se-can-servo",
    brand: "ASME",
    model: "ASME-SE",
    driverId: "driver.asme-can-servo",
    transportId: "transport.a-board-can1",
    capabilities: [{ id: "servo", features: ["can1"] }],
    config: { servoId, bitrateKbps: 250, canBus: "CAN1", minDeg: 0, maxDeg: 360, direction: 1, ...config },
    tags: [],
  };
}
