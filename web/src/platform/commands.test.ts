import { describe, expect, it } from "vitest";
import {
  createPlatformCommand,
  platformCommandEventType,
  resolvePlatformCommandTarget,
  validatePlatformCommand
} from "@platform/commands";

describe("platform commands", () => {
  it("accepts valid servo and motor commands", () => {
    expect(validatePlatformCommand(createPlatformCommand("servo.ping", "servo:22"))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("servo.set_torque", "servo:22", { enabled: true }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("servo.set_id", "servo:22", { newId: 23, confirmSingleServo: true }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 45, stopMode: "brake", closedLoop: true, targetRpm: 1200 }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("motor.configure", "motor:M1", { pwmPin: "D5", in1Pin: "D4", in2Pin: "D7", closedLoop: true, maxRpm: 6000, encoderTicksPerRev: 52 }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("mecanum-drive.set_velocity", "mecanum-drive:base", { forward: 0.4, strafe: 0.2, turn: -0.1, speedLimitPercent: 70, stopMode: "brake" }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("mecanum-drive.stop", "mecanum-drive:base", { stopMode: "brake" }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      pcCommands: [{ type: "can_servo.group_move", seq: 1, targets: [{ id: 1, position: 8192 }], speed: 300 }]
    }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("servo-preset.run", "servo-preset:ready", {
      pcCommands: [
        { type: "servo.move", seq: 2, sync: true, targets: [{ id: 7, angleDeg: 120, speedRaw: 500, acc: 20 }] },
        { type: "can_servo.group_move", seq: 3, targets: [{ id: 1, position: 8192 }], speed: 300 }
      ]
    }))).toBeNull();
  });

  it("rejects unknown targets and missing payload", () => {
    expect(validatePlatformCommand(createPlatformCommand("servo.ping", "camera:main"))).toContain("requires a servo target");
    expect(validatePlatformCommand(createPlatformCommand("servo.ping", "unknown:main"))).toContain("unsupported");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_position", "servo:22", { angleDeg: 90 }))).toBe("servo.set_position requires angleDeg and speedRaw");
    expect(validatePlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1"))).toBe("motor.set_speed requires speedPercent");
  });

  it("rejects non-finite and out-of-range numeric payloads", () => {
    expect(validatePlatformCommand(createPlatformCommand("servo.set_position", "servo:22", { angleDeg: Number.NaN, speedRaw: 800 }))).toBe("servo.set_position angleDeg must be 0-360");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_position", "servo:22", { angleDeg: 90, speedRaw: 5000 }))).toBe("servo.set_position speedRaw must be an integer from 0 to 4095");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_speed", "servo:22", { speedRaw: Infinity }))).toBe("servo.set_speed speedRaw must be an integer from -4095 to 4095");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_id", "servo:22", { newId: 254, confirmSingleServo: true }))).toBe("servo.set_id requires newId from 0 to 253");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_id", "servo:22", { newId: 22, confirmSingleServo: true }))).toBe("servo.set_id newId must be different from current ID");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_id", "servo:22", { newId: 23 }))).toBe("servo.set_id requires confirming only one servo is connected");
    expect(validatePlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 101 }))).toBe("motor.set_speed speedPercent must be from -100 to 100");
    expect(validatePlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 10, targetRpm: 0 }))).toBe("motor.set_speed targetRpm must be an integer from 1 to 30000");
    expect(validatePlatformCommand(createPlatformCommand("motor.configure", "motor:M1", { pwmPin: "D5", in1Pin: "D4", in2Pin: "D7", encoderTicksPerRev: -1 }))).toBe("motor.configure encoderTicksPerRev must be an integer from 1 to 100000");
    expect(validatePlatformCommand(createPlatformCommand("mecanum-drive.set_velocity", "mecanum-drive:base", { forward: 2, strafe: 0, turn: 0 }))).toBe("mecanum-drive.set_velocity forward must be from -1 to 1");
    expect(validatePlatformCommand(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", { positions: { servo1: 90 } }))).toBe("can-servo-group.set_positions requires pcCommands");
    expect(validatePlatformCommand(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      pcCommands: [{ type: "can_servo.move", seq: 1, id: 1, position: 8192, speed: 300 }]
    }))).toBe("can-servo-group.set_positions pcCommands must be CAN servo commands");
    expect(validatePlatformCommand(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      pcCommands: [{ type: "can_servo.config", seq: 1, bitrateKbps: 250 }]
    }))).toBe("can-servo-group.set_positions requires a group_move pcCommand");
    expect(validatePlatformCommand(createPlatformCommand("servo-preset.run", "servo-preset:ready"))).toBe("servo-preset.run requires pcCommands");
    expect(validatePlatformCommand(createPlatformCommand("servo-preset.run", "servo-preset:ready", {
      pcCommands: [{ type: "can_servo.move", seq: 1, id: 1, position: 8192, speed: 300 }]
    }))).toBe("servo-preset.run pcCommands must be servo.move or CAN group commands");
    expect(validatePlatformCommand(createPlatformCommand("servo-preset.run", "servo-preset:ready", {
      pcCommands: [{ type: "can_servo.config", seq: 1, bitrateKbps: 250 }]
    }))).toBe("servo-preset.run requires a motion pcCommand");
  });

  it("resolves target capability from device id", () => {
    expect(resolvePlatformCommandTarget(createPlatformCommand("servo.ping", "servo:22"))).toEqual({
      deviceId: "servo:22",
      capability: "servo"
    });
    expect(resolvePlatformCommandTarget(createPlatformCommand("motor.stop", "motor:M1"))).toEqual({
      deviceId: "motor:M1",
      capability: "motor"
    });
    expect(resolvePlatformCommandTarget(createPlatformCommand("firmware.helper.check", "firmware:local"))).toEqual({
      deviceId: "firmware:local",
      capability: "firmware"
    });
    expect(resolvePlatformCommandTarget(createPlatformCommand("ai-vision.helper.check", "ai-vision:local"))).toEqual({
      deviceId: "ai-vision:local",
      capability: "ai-vision"
    });
    expect(resolvePlatformCommandTarget(createPlatformCommand("mecanum-drive.stop", "mecanum-drive:base"))).toEqual({
      deviceId: "mecanum-drive:base",
      capability: "mecanum-drive"
    });
    expect(resolvePlatformCommandTarget(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw", {
      pcCommands: [{ type: "can_servo.group_move", seq: 1, targets: [{ id: 1, position: 8192 }], speed: 300 }]
    }))).toEqual({
      deviceId: "can-servo-group:claw",
      capability: "can-servo-group"
    });
    expect(resolvePlatformCommandTarget(createPlatformCommand("servo-preset.run", "servo-preset:ready", {
      pcCommands: [{ type: "servo.move", seq: 1, sync: true, targets: [{ id: 7, angleDeg: 90, speedRaw: 300 }] }]
    }))).toEqual({
      deviceId: "servo-preset:ready",
      capability: "servo"
    });
  });

  it("accepts platform commands for camera, arm, raspberry pi, and firmware", () => {
    expect(validatePlatformCommand(createPlatformCommand("camera.set_gimbal", "camera:main", { panAngleDeg: 90, tiltAngleDeg: 110 }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("robot-arm.set_pose", "robot-arm:main", { joints: [] }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("pi.exec", "pi:main", { command: "python3 main.py" }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("firmware.upload", "firmware:local", { port: "COM6" }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("ai-vision.helper.check", "ai-vision:local"))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("ai-vision.analyze", "ai-vision:local", { sourceId: "main", streamUrl: "http://127.0.0.1:8080/stream" }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("ai-vision.samples.capture", "ai-vision:local", { sourceId: "main", streamUrl: "http://127.0.0.1:8080/stream", label: "competition_mannequin" }))).toBeNull();
  });

  it("rejects incomplete platform commands for new capabilities", () => {
    expect(validatePlatformCommand(createPlatformCommand("camera.set_gimbal", "camera:main", { panAngleDeg: 90 }))).toBe("camera.set_gimbal requires panAngleDeg and tiltAngleDeg");
    expect(validatePlatformCommand(createPlatformCommand("robot-arm.set_pose", "robot-arm:main"))).toBe("robot-arm.set_pose requires joints");
    expect(validatePlatformCommand(createPlatformCommand("pi.upload_file", "pi:main"))).toBe("pi.upload_file requires file");
    expect(validatePlatformCommand(createPlatformCommand("firmware.upload", "firmware:local"))).toBe("firmware.upload requires port");
    expect(validatePlatformCommand(createPlatformCommand("ai-vision.analyze", "ai-vision:local", { sourceId: "main" }))).toBe("ai-vision.analyze requires streamUrl");
    expect(validatePlatformCommand(createPlatformCommand("ai-vision.samples.capture", "ai-vision:local", { sourceId: "main", streamUrl: "http://127.0.0.1:8080/stream", label: "" }))).toBe("ai-vision.samples.capture label must be a non-empty string");
    expect(validatePlatformCommand(createPlatformCommand("can-servo-group.set_positions", "can-servo-group:claw"))).toBe("can-servo-group.set_positions requires pcCommands");
  });

  it("generates stable command event names", () => {
    expect(platformCommandEventType("sent")).toBe("platform.command.sent");
    expect(platformCommandEventType("skipped")).toBe("platform.command.skipped");
    expect(platformCommandEventType("failed")).toBe("platform.command.failed");
    expect(platformCommandEventType("timeout")).toBe("platform.command.timeout");
  });
});
