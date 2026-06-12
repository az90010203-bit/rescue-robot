import { describe, expect, it } from "vitest";
import {
  LineDelimitedJsonParser,
  ROBOMASTER_A_BOARD_GPIO_OPTIONS,
  angleDegToRaw,
  applyServoWheelDirection,
  buildDebugSetCommand,
  buildInstructionFrame,
  buildMecanumTargetCommand,
  buildMotorConfigCommand,
  buildMotorSetCommand,
  buildMotorStopCommand,
  buildMotorTargetCommand,
  buildReadRegisterFrame,
  buildServoMoveCommand,
  buildServoSpeedCommand,
  buildServoIdChangeFrames,
  buildWriteRegisterFrame,
  buildWritePositionFrame,
  buildWriteSpeedFrames,
  calculateWheelTurnDelta,
  servoLogicalToPhysicalAngle,
  servoLogicalToPhysicalAngleWithReverse,
  feetechChecksum,
  isMotorDebugDisabledError,
  isMotorPcCommand,
  isServoDebugDisabledError,
  normalizeMotorChannel,
  normalizeMotorPin,
  parseFeetechStatusPacket,
  parseFeetechStatusPackets,
  parseServoFeedback,
  rawToAngleDeg,
  requiresMotorDirectionDeadtime,
  roboMasterAPinAliasForMotorPin,
  servoPhysicalToLogicalAngle,
  servoPhysicalToLogicalAngleWithReverse,
  toHex,
  withCommandSeq
} from "@adapters/hardware/protocol";

describe("feetech protocol helpers", () => {
  it("builds the manual's position write example frame", () => {
    const frame = buildWritePositionFrame({ id: 1, angleDeg: 180, speedRaw: 1000 });

    expect(toHex(frame)).toBe("FF FF 01 09 03 2A 00 08 00 00 E8 03 D5");
  });

  it("builds a packet checksum over ID through params", () => {
    expect(feetechChecksum([0x01, 0x09, 0x03, 0x2a, 0x00, 0x08, 0x00, 0x00, 0xe8, 0x03])).toBe(0xd5);
    expect(toHex(buildInstructionFrame(1, 1))).toBe("FF FF 01 02 01 FB");
  });

  it("builds Feetech register and physical ID write frames", () => {
    expect(toHex(buildWriteRegisterFrame(9, 0x37, [0]))).toBe("FF FF 09 04 03 37 00 B8");
    expect(toHex(buildReadRegisterFrame(11, 0x28, 1))).toBe("FF FF 0B 04 02 28 01 C5");
    expect(buildServoIdChangeFrames(9, 12).map(toHex)).toEqual([
      "FF FF 09 02 01 F3",
      "FF FF 09 04 03 37 00 B8",
      "FF FF 09 04 03 05 0C DE",
      "FF FF 0C 04 03 37 01 B4",
      "FF FF 0C 02 01 F0"
    ]);
  });

  it("converts 0-360 degrees into the 0-4095 STS/SCS position range", () => {
    expect(angleDegToRaw(0)).toBe(0);
    expect(angleDegToRaw(90)).toBe(1024);
    expect(angleDegToRaw(180)).toBe(2048);
    expect(angleDegToRaw(360)).toBe(4095);
    expect(rawToAngleDeg(0)).toBe(0);
    expect(Math.round(rawToAngleDeg(2048))).toBe(180);
    expect(rawToAngleDeg(4095)).toBe(360);
  });

  it("maps logical servo angles through limits and reverse direction", () => {
    expect(servoLogicalToPhysicalAngle({ id: 1, name: "J1", minDeg: 180, maxDeg: 360, direction: 1 }, 0)).toBe(180);
    expect(servoLogicalToPhysicalAngle({ id: 1, name: "J1", minDeg: 180, maxDeg: 360, direction: 1 }, 180)).toBe(360);
    expect(servoLogicalToPhysicalAngle({ id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 }, 0)).toBe(180);
    expect(servoLogicalToPhysicalAngle({ id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 }, 180)).toBe(0);
    expect(servoPhysicalToLogicalAngle({ id: 1, name: "J1", minDeg: 180, maxDeg: 360, direction: 1 }, 180)).toBe(0);
    expect(servoPhysicalToLogicalAngle({ id: 1, name: "J1", minDeg: 180, maxDeg: 360, direction: 1 }, 360)).toBe(180);
    expect(servoPhysicalToLogicalAngle({ id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 }, 180)).toBe(0);
    expect(servoPhysicalToLogicalAngle({ id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 }, 0)).toBe(180);
  });

  it("combines permanent and temporary reverse for position and wheel speed", () => {
    const reversedServo = { id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 as const };

    expect(servoLogicalToPhysicalAngleWithReverse(reversedServo, 45, false)).toBe(135);
    expect(servoLogicalToPhysicalAngleWithReverse(reversedServo, 45, true)).toBe(45);
    expect(servoPhysicalToLogicalAngleWithReverse(reversedServo, 135, false)).toBe(45);
    expect(servoPhysicalToLogicalAngleWithReverse(reversedServo, 45, true)).toBe(45);
    expect(applyServoWheelDirection(reversedServo, 300, false)).toBe(-300);
    expect(applyServoWheelDirection(reversedServo, 300, true)).toBe(300);
  });

  it("accumulates wheel turns across raw position wraparound", () => {
    expect(calculateWheelTurnDelta(4000, 100, 300)).toBeCloseTo(196 / 4096, 5);
    expect(calculateWheelTurnDelta(100, 4000, -300)).toBeCloseTo(196 / 4096, 5);
    expect(calculateWheelTurnDelta(1000, 1100, 300)).toBeCloseTo(100 / 4096, 5);
  });

  it("builds wheel mode speed write frames like SMS_STS::WriteSpe", () => {
    expect(buildWriteSpeedFrames({ id: 22, speedRaw: 300, acc: 50 }).map(toHex)).toEqual([
      "FF FF 16 04 03 29 32 87",
      "FF FF 16 05 03 2E 2C 01 86"
    ]);
    expect(buildWriteSpeedFrames({ id: 21, speedRaw: 300, acc: 50 }).map(toHex)).toEqual([
      "FF FF 15 04 03 29 32 88",
      "FF FF 15 05 03 2E 2C 01 87"
    ]);
    expect(buildWriteSpeedFrames({ id: 21, speedRaw: -300, acc: 50 }).map(toHex)).toEqual([
      "FF FF 15 04 03 29 32 88",
      "FF FF 15 05 03 2E 2C 81 07"
    ]);
  });

  it("parses Feetech status and feedback packets", () => {
    const packet = parseFeetechStatusPacket([0xff, 0xff, 0x16, 0x11, 0x00, 0x34, 0x04, 0x32, 0x00, 0x1e, 0x04, 0x79, 0x1e, 0x00, 0x00, 0x01, 0x9b, 0x03, 0x00, 0x00, 0x16]);

    expect(packet?.id).toBe(22);
    expect(packet?.status).toBe(0);
    expect(parseServoFeedback(packet!)).toMatchObject({
      type: "servo.feedback",
      id: 22,
      positionRaw: 1076,
      positionDeg: expect.closeTo(94.59, 2),
      speedRaw: 50,
      speedRpm: 36.62,
      loadRaw: -30,
      loadPercent: -3,
      voltageRaw: 121,
      voltageV: 12.1,
      temperatureC: 30,
      moving: true,
      currentRaw: 0,
      currentMa: 0
    });
  });

  it("parses every valid status packet from a combined serial read", () => {
    const packets = parseFeetechStatusPackets([
      0xff, 0xff, 0x0a, 0x02, 0x00, 0xf3,
      0xff, 0xff, 0x09, 0x02, 0x00, 0xf4
    ]);

    expect(packets.map((packet) => packet.id)).toEqual([10, 9]);
    expect(parseFeetechStatusPacket([
      0xff, 0xff, 0x0a, 0x02, 0x00, 0xf3,
      0xff, 0xff, 0x09, 0x02, 0x00, 0xf4
    ])?.id).toBe(10);
  });
});

describe("pc json protocol", () => {
  it("builds servo.move commands with validation", () => {
    expect(buildServoMoveCommand(7, { id: 2, name: "J2", angleDeg: 45, speedRaw: 500, acc: 20 })).toEqual({
      type: "servo.move",
      seq: 7,
      sync: false,
      targets: [{ id: 2, name: "J2", angleDeg: 45, speedRaw: 500, acc: 20 }]
    });
  });

  it("builds signed servo.speed commands for wheel mode", () => {
    expect(buildServoSpeedCommand(9, { id: 21, name: "J21", speedRaw: -300, acc: 50 })).toEqual({
      type: "servo.speed",
      seq: 9,
      setupWheelMode: true,
      targets: [{ id: 21, name: "J21", speedRaw: -300, acc: 50 }]
    });
  });

  it("builds synchronized servo.move commands for camera gimbals", () => {
    expect(
      buildServoMoveCommand(
        11,
        [
          { id: 1, name: "Camera Pan", angleDeg: 95, speedRaw: 800, acc: 30 },
          { id: 2, name: "Camera Tilt", angleDeg: 85, speedRaw: 800, acc: 30 }
        ],
        true
      )
    ).toEqual({
      type: "servo.move",
      seq: 11,
      sync: true,
      targets: [
        { id: 1, name: "Camera Pan", angleDeg: 95, speedRaw: 800, acc: 30 },
        { id: 2, name: "Camera Tilt", angleDeg: 85, speedRaw: 800, acc: 30 }
      ]
    });
  });

  it("parses fragmented newline-delimited responses", () => {
    const parser = new LineDelimitedJsonParser();

    expect(parser.push('{"type":"ack","seq":1')).toEqual([]);
    expect(parser.push(',"message":"ok"}\n{"type":"servo.feedback","seq":2,"id":1}\n')).toEqual([
      { type: "ack", seq: 1, message: "ok" },
      { type: "servo.feedback", seq: 2, id: 1 }
    ]);
  });

  it("preserves RoboMaster A encoder diagnostics in motor feedback", () => {
    const parser = new LineDelimitedJsonParser();

    expect(parser.push('{"type":"motor.feedback","seq":8,"channel":"M1","encoderTicks":128,"pulseHz":64,"encoderA":1,"encoderB":0,"encoderDelta":4,"encoderDirection":"forward","sampleMs":12345}\n')).toEqual([
      {
        type: "motor.feedback",
        seq: 8,
        channel: "M1",
        encoderTicks: 128,
        pulseHz: 64,
        encoderA: 1,
        encoderB: 0,
        encoderDelta: 4,
        encoderDirection: "forward",
        sampleMs: 12345
      }
    ]);
  });

  it("preserves RoboMaster A IMU feedback fields", () => {
    const parser = new LineDelimitedJsonParser();

    expect(
      parser.push(
        '{"type":"imu.feedback","seq":12,"ready":true,"mpuWhoAmI":112,"istWhoAmI":16,"accelRaw":{"x":10,"y":20,"z":4096},"gyroRaw":{"x":1,"y":2,"z":3},"magRaw":{"x":-30,"y":40,"z":50},"tempRaw":256,"sampleMs":1234}\n'
      )
    ).toEqual([
      {
        type: "imu.feedback",
        seq: 12,
        ready: true,
        mpuWhoAmI: 112,
        istWhoAmI: 16,
        accelRaw: { x: 10, y: 20, z: 4096 },
        gyroRaw: { x: 1, y: 2, z: 3 },
        magRaw: { x: -30, y: 40, z: 50 },
        tempRaw: 256,
        sampleMs: 1234
      }
    ]);
  });
});

describe("pwm motor json protocol", () => {
  it("builds motor debug handshake commands and identifies retryable debug errors", () => {
    expect(buildDebugSetCommand(5, "motor", true)).toEqual({
      type: "debug.set",
      seq: 5,
      enabled: true,
      module: "motor"
    });

    const command = buildMotorConfigCommand(6, { channel: "M1", pwmPin: "D5", in1Pin: "D4", in2Pin: "D7" });
    expect(isMotorPcCommand(command)).toBe(true);
    expect(withCommandSeq(command, 9)).toEqual({ ...command, seq: 9 });
    expect(isMotorDebugDisabledError({ type: "error", seq: 6, command: "motor.config", code: "debug_disabled", message: "enable debug mode before motor commands" })).toBe(true);
    expect(isMotorDebugDisabledError({ type: "error", seq: 7, command: "servo.move", code: "debug_disabled", message: "debug disabled" })).toBe(false);
    expect(isServoDebugDisabledError({ type: "error", seq: 8, command: "servo.move", code: "debug_disabled", message: "enable debug mode before servo commands" })).toBe(true);
    expect(isServoDebugDisabledError({ type: "error", seq: 9, command: "servo.group_move", code: "debug_disabled", message: "debug disabled" })).toBe(true);
    expect(isServoDebugDisabledError({ type: "error", seq: 10, command: "motor.set", code: "debug_disabled", message: "debug disabled" })).toBe(false);
  });

  it("builds motor.config commands for TB6618 board-side pin mapping", () => {
    expect(buildMotorConfigCommand(6, { channel: "m1", pwmPin: "d5", in1Pin: "d4", in2Pin: "d7", enablePin: "d10", sensorPin: "d2", encoderAPin: "pa0", encoderBPin: "pa1", closedLoop: true, maxRpm: 6000, encoderTicksPerRev: 52 })).toEqual({
      type: "motor.config",
      seq: 6,
      channel: "M1",
      driver: "tb6618",
      closedLoop: true,
      maxRpm: 6000,
      encoderTicksPerRev: 52,
      pins: {
        pwm: "D5",
        in1: "D4",
        in2: "D7",
        enable: "D10",
        sensor: "D2",
        encoderA: "PA0",
        encoderB: "PA1"
      }
    });
  });

  it("resolves RoboMaster Type A board silk labels into STM32 pins", () => {
    expect(normalizeMotorChannel("A")).toBe("A");
    expect(normalizeMotorPin("S", "pwmPin", "M1")).toBe("PA0");
    expect(normalizeMotorPin("V", "pwmPin", "M4")).toBe("PA3");
    expect(normalizeMotorPin("F", "pwmPin", "M1")).toBe("PD14");
    expect(normalizeMotorPin("H", "pwmPin", "M6")).toBe("PD12");
    expect(normalizeMotorPin("J2", "in1Pin", "M1")).toBe("PE4");
    expect(normalizeMotorPin("K2", "in2Pin", "M1")).toBe("PE12");
    expect(normalizeMotorPin("H", "enablePin", "M1")).toBe("PD12");
    expect(normalizeMotorPin("Q2")).toBe("PI9");
    expect(normalizeMotorPin("CAN1_TX")).toBe("PD1");
    expect(normalizeMotorPin("IMU_INT")).toBe("PE1");
  });

  it("displays RoboMaster Type A GPIO pins as board silk labels", () => {
    expect(roboMasterAPinAliasForMotorPin("PA0", "pwmPin", "M1")).toBe("S");
    expect(roboMasterAPinAliasForMotorPin("PA3", "pwmPin", "M4")).toBe("V");
    expect(roboMasterAPinAliasForMotorPin("PD14", "pwmPin", "M1")).toBe("F");
    expect(roboMasterAPinAliasForMotorPin("PD12", "pwmPin", "M6")).toBe("H");
    expect(roboMasterAPinAliasForMotorPin("PE4", "in1Pin", "M1")).toBe("J2");
    expect(roboMasterAPinAliasForMotorPin("PE12", "in2Pin", "M1")).toBe("K2");
    expect(roboMasterAPinAliasForMotorPin("PD12", "enablePin", "M1")).toBe("H");
    expect(roboMasterAPinAliasForMotorPin("PD1")).toBe("CAN1_TX");
  });

  it("exports RoboMaster Type A GPIO select options without power-only labels", () => {
    expect(ROBOMASTER_A_BOARD_GPIO_OPTIONS).toContainEqual({ label: "S", value: "PA0" });
    expect(ROBOMASTER_A_BOARD_GPIO_OPTIONS).toContainEqual({ label: "J2", value: "PE4" });
    expect(ROBOMASTER_A_BOARD_GPIO_OPTIONS).toContainEqual({ label: "K2", value: "PE12" });
    expect(ROBOMASTER_A_BOARD_GPIO_OPTIONS.some((option) => option.label === "R1" || option.label === "R2")).toBe(false);
  });

  it("keeps legacy sensor-only motor.config mappings compatible", () => {
    expect(buildMotorConfigCommand(7, { channel: "m1", pwmPin: "d5", in1Pin: "d4", in2Pin: "d7", sensorPin: "d2" })).toEqual({
      type: "motor.config",
      seq: 7,
      channel: "M1",
      driver: "tb6618",
      pins: {
        pwm: "D5",
        in1: "D4",
        in2: "D7",
        sensor: "D2"
      }
    });
  });

  it("builds motor.config from RoboMaster Type A board silk aliases", () => {
    expect(buildMotorConfigCommand(8, { channel: "M1", pwmPin: "S", in1Pin: "L2", in2Pin: "K2", enablePin: "H", encoderAPin: "J2", encoderBPin: "I2" })).toEqual({
      type: "motor.config",
      seq: 8,
      channel: "M1",
      driver: "tb6618",
      pins: {
        pwm: "PA0",
        in1: "PB0",
        in2: "PE12",
        enable: "PD12",
        encoderA: "PE4",
        encoderB: "PF0"
      }
    });
  });

  it("builds motor.config from RoboMaster Type A GPIO option values", () => {
    expect(buildMotorConfigCommand(9, { channel: "M1", pwmPin: "PA0", in1Pin: "PB0", in2Pin: "PE12", enablePin: "PD12", encoderAPin: "PE4", encoderBPin: "PF0" })).toEqual({
      type: "motor.config",
      seq: 9,
      channel: "M1",
      driver: "tb6618",
      pins: {
        pwm: "PA0",
        in1: "PB0",
        in2: "PE12",
        enable: "PD12",
        encoderA: "PE4",
        encoderB: "PF0"
      }
    });
  });

  it("rejects incomplete motor.config mappings", () => {
    expect(() => buildMotorConfigCommand(1, { channel: "M1", pwmPin: "", in1Pin: "D4", in2Pin: "D7" })).toThrow("pwmPin");
    expect(() => buildMotorConfigCommand(1, { channel: "M1", pwmPin: "D5", in1Pin: "", in2Pin: "D7" })).toThrow("in1Pin");
    expect(() => buildMotorConfigCommand(1, { channel: "M1", pwmPin: "D5", in1Pin: "D4", in2Pin: "" })).toThrow("in2Pin");
  });

  it("builds motor.set commands with signed speed", () => {
    expect(buildMotorSetCommand(8, { channel: "m1", speedPercent: -50, closedLoop: true, targetRpm: 1200 })).toEqual({
      type: "motor.set",
      seq: 8,
      channel: "M1",
      speedPercent: -50,
      stopMode: "coast",
      closedLoop: true,
      targetRpm: 1200
    });
  });

  it("rejects invalid motor.set values", () => {
    expect(() => buildMotorSetCommand(1, { channel: "", speedPercent: 20 })).toThrow("motor channel");
    expect(() => buildMotorSetCommand(1, { channel: "M1", speedPercent: -101 })).toThrow("speedPercent");
    expect(() => buildMotorSetCommand(1, { channel: "M1", speedPercent: 101 })).toThrow("speedPercent");
  });

  it("builds motor.target commands with signed speed", () => {
    expect(buildMotorTargetCommand(11, { channel: "m2", speedPercent: 35, stopMode: "brake", closedLoop: true, targetRpm: 900 })).toEqual({
      type: "motor.target",
      seq: 11,
      channel: "M2",
      speedPercent: 35,
      stopMode: "brake",
      closedLoop: true,
      targetRpm: 900
    });
  });

  it("builds semantic mecanum target commands", () => {
    expect(buildMecanumTargetCommand(12, { forward: 0.5, strafe: -0.25, turn: 1.5, speedLimitPercent: 130, stopMode: "brake" })).toEqual({
      type: "mecanum.target",
      seq: 12,
      forward: 0.5,
      strafe: -0.25,
      turn: 1,
      speedLimitPercent: 100,
      stopMode: "brake"
    });
  });

  it("builds motor.stop commands for one channel or all channels", () => {
    expect(buildMotorStopCommand(9, { channel: "m2", stopMode: "brake" })).toEqual({
      type: "motor.stop",
      seq: 9,
      channel: "M2",
      stopMode: "brake"
    });

    expect(buildMotorStopCommand(10, { all: true })).toEqual({
      type: "motor.stop",
      seq: 10,
      all: true,
      stopMode: "coast"
    });
  });

  it("detects motor direction changes that need a safety deadtime", () => {
    expect(requiresMotorDirectionDeadtime(50, -50)).toBe(true);
    expect(requiresMotorDirectionDeadtime(-40, 30)).toBe(true);
    expect(requiresMotorDirectionDeadtime(0, 50)).toBe(false);
    expect(requiresMotorDirectionDeadtime(50, 80)).toBe(false);
    expect(requiresMotorDirectionDeadtime(50, 0)).toBe(false);
    expect(requiresMotorDirectionDeadtime(undefined, -30)).toBe(false);
  });
});
