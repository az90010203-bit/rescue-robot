import { describe, expect, it, vi } from "vitest";
import { asmgMdDegreesToPositionRaw } from "@adapters/hardware/asmgMdCanServo";
import { createAppPlatformCommandDispatcher } from "@app/appPlatformCommandBridge";
import { createPlatformCommand, type PlatformCommand, type PlatformCommandResult } from "@platform/commands";

function createOptions(overrides: Record<string, unknown> = {}) {
  const sentBatches: unknown[][] = [];
  const sentCanCommands: unknown[] = [];
  const sentCanOptions: unknown[] = [];
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
      sendAboardCommand: vi.fn(async (command: { seq?: number }, options?: unknown) => {
        sentCanCommands.push(command);
        sentCanOptions.push(options);
        return { ok: true, messages: [{ type: "ack", seq: command.seq ?? 0 }] };
      }),
      sendCameraGimbalMove: vi.fn(),
      sendAboardMotionBatch: vi.fn(async (commands: unknown[]) => {
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
    sentCanCommands,
    sentCanOptions,
  };
}

describe("app platform A-board semantic bridge", () => {
  it("expands tracked drive velocity to M5 and M6 motor commands with component config", async () => {
    const { options, sentBatches } = createOptions({
      components: [
        {
          id: "tracked",
          kind: "tracked-drive",
          name: "Tracked Base",
          config: {
            closedLoop: true,
            maxRpm: 6000,
            encoderTicksPerRev: 52,
            tracks: { leftTrack: "motor:m5", rightTrack: "motor:m6" },
            directions: { leftTrack: 1, rightTrack: 1 },
          },
        },
      ],
      pluginInstances: [
        motorPlugin("motor:m5", "M5", { pwmPin: "PH10", in1Pin: "PA0", in2Pin: "PA1", enablePin: "PH12", encoderAPin: "PA2", encoderBPin: "PA3" }),
        motorPlugin("motor:m6", "M6", { pwmPin: "PD12", in1Pin: "PF1", in2Pin: "PE5", enablePin: "PI0", encoderAPin: "PE6", encoderBPin: "PC2" }),
      ],
    });
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("tracked-drive.set_velocity", "tracked-drive:tracked", {
      forward: 1,
      turn: 0,
      speedLimitPercent: 40,
      stopMode: "brake",
    }));

    expect(result.status).toBe("sent");
    expect(sentBatches).toEqual([
      [
        expect.objectContaining({ type: "motor.config", seq: 10, channel: "M5", closedLoop: true, maxRpm: 6000, encoderTicksPerRev: 52 }),
        expect.objectContaining({ type: "motor.config", seq: 11, channel: "M6", closedLoop: true, maxRpm: 6000, encoderTicksPerRev: 52 }),
        { type: "motor.set", seq: 12, channel: "M5", speedPercent: 40, stopMode: "brake", closedLoop: true },
        { type: "motor.set", seq: 13, channel: "M6", speedPercent: 40, stopMode: "brake", closedLoop: true },
      ],
    ]);
  });

  it("expands tracked drive stop to M5 and M6 motor stops", async () => {
    const { options, sentBatches } = createOptions({
      components: [
        {
          id: "tracked",
          kind: "tracked-drive",
          name: "Tracked Base",
          config: {
            closedLoop: true,
            tracks: { leftTrack: "motor:m5", rightTrack: "motor:m6" },
            directions: { leftTrack: 1, rightTrack: 1 },
          },
        },
      ],
      pluginInstances: [
        motorPlugin("motor:m5", "M5", { pwmPin: "PH10", in1Pin: "PA0", in2Pin: "PA1" }),
        motorPlugin("motor:m6", "M6", { pwmPin: "PD12", in1Pin: "PF1", in2Pin: "PE5" }),
      ],
    });
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("tracked-drive.stop", "tracked-drive:tracked", { stopMode: "brake" }));

    expect(result.status).toBe("sent");
    expect(sentBatches).toEqual([[
      { type: "motor.set", seq: 10, channel: "M5", speedPercent: 0, stopMode: "brake", closedLoop: true },
      { type: "motor.set", seq: 11, channel: "M6", speedPercent: 0, stopMode: "brake", closedLoop: true },
    ]]);
  });

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

  it("sends precompiled CAN servo group JSON without rebuilding it", async () => {
    const pcCommands = [
      { type: "can_servo.config", seq: 30, bitrateKbps: 250 },
      {
        type: "can_servo.group_move",
        seq: 31,
        targets: [
          { id: 1, position: asmgMdDegreesToPositionRaw(60) },
          { id: 2, position: asmgMdDegreesToPositionRaw(90) },
          { id: 3, position: asmgMdDegreesToPositionRaw(90) },
          { id: 4, position: asmgMdDegreesToPositionRaw(180) },
        ],
        speed: 300,
      },
    ];
    const { options, sentBatches, sentCanCommands } = createOptions({
      components: [
        {
          id: "claw",
          kind: "can-servo-group",
          name: "Claw",
          config: {},
        },
      ],
    });
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      pcCommands,
    }));

    expect(result.status).toBe("sent");
    expect(sentCanCommands).toEqual(pcCommands);
    expect(sentBatches).toEqual([]);
  });

  it("sends live CAN servo group moves through the non-exclusive latest-wins path", async () => {
    const pcCommands = [
      {
        type: "can_servo.group_move",
        seq: 41,
        targets: [
          { id: 1, position: asmgMdDegreesToPositionRaw(60) },
          { id: 2, position: asmgMdDegreesToPositionRaw(90) },
          { id: 3, position: asmgMdDegreesToPositionRaw(120) },
          { id: 4, position: asmgMdDegreesToPositionRaw(180) },
        ],
        speed: 300,
      },
    ];
    const { options, sentCanCommands, sentCanOptions } = createOptions({
      components: [
        {
          id: "claw",
          kind: "can-servo-group",
          name: "Claw",
          config: {},
        },
      ],
    });
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      live: true,
      log: false,
      pcCommands,
    }));

    expect(result.status).toBe("sent");
    expect(sentCanCommands).toEqual(pcCommands);
    expect(sentCanOptions).toEqual([{ log: false, exclusive: false, timeoutMs: 220 }]);
  });

  it("keeps live CAN servo group moves ready when the A-board accepted the latest target", async () => {
    const pcCommands = [
      {
        type: "can_servo.group_move",
        seq: 51,
        targets: [
          { id: 1, position: asmgMdDegreesToPositionRaw(60) },
          { id: 2, position: asmgMdDegreesToPositionRaw(90) },
          { id: 3, position: asmgMdDegreesToPositionRaw(120) },
          { id: 4, position: asmgMdDegreesToPositionRaw(180) },
        ],
        speed: 300,
      },
    ];
    const { options } = createOptions({
      components: [
        {
          id: "claw",
          kind: "can-servo-group",
          name: "Claw",
          config: {},
        },
      ],
      sendAboardCommand: vi.fn(async (command: { seq?: number }) => ({
        accepted: true,
        ok: false,
        messages: [{ type: "scheduler.feedback", seq: command.seq ?? 0, command: "can_servo.group_move", accepted: true }],
      })),
    });
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      live: true,
      log: false,
      pcCommands,
    }));

    expect(result.status).toBe("sent");
  });

  it("rejects CAN servo group commands that were not compiled by the component", async () => {
    const { options, sentBatches, sentCanCommands } = createOptions({
      components: [
        {
          id: "claw",
          kind: "can-servo-group",
          name: "Claw",
          config: {},
        },
      ],
    });
    const dispatch = createAppPlatformCommandDispatcher(options as never);

    const result = await dispatch(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      positions: { servo1: 50, servo2: 30, servo3: 90, servo4: 180 },
    }));

    expect(result.status).toBe("failed");
    expect(result.message).toBe("CAN servo group command requires compiled pcCommands");
    expect(sentCanCommands).toEqual([]);
    expect(sentBatches).toEqual([]);
  });
});

function motorPlugin(id: string, channel: string, config: Record<string, string>) {
  return {
    id,
    name: channel,
    type: "motor",
    catalogItemId: null,
    brand: "WHEELTEC",
    model: "G513XL",
    driverId: "driver.tb6618-motor",
    transportId: "transport.controller-json",
    capabilities: [{ id: "motor", features: ["pwm_control", "encoder_feedback"] }],
    config: { channel, ...config },
    tags: [],
  };
}
