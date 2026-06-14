import { describe, expect, it } from "vitest";
import { ROBOT_PROFILE } from "../robotProfile";
import {
  buildLiteCanJogCommand,
  buildLiteMecanumStopCommand,
  buildLiteMecanumTargetCommand,
  buildLitePwmMotorConfigCommand,
  buildLitePwmMotorSetCommand,
  buildLitePwmMotorStopAllCommand,
  buildLitePwmMotorStopCommand,
  buildLiteTrackedStopCommands,
  buildLiteTrackedTargetCommands,
  createCanJogAngles,
  liteGamepadStateFromGamepad,
  mecanumInputFromDpad,
  snapshotFromLiteGamepad,
  trackedInputFromStick
} from "./manualControl";

describe("web-lite manual control runtime", () => {
  it("maps D-pad directions to a mecanum target and stop command", () => {
    const input = mecanumInputFromDpad({ up: true, down: false, left: true, right: false });

    expect(input).toEqual({ forward: 0.71, strafe: -0.71, turn: 0 });
    expect(buildLiteMecanumTargetCommand(10, input, ROBOT_PROFILE.drive)).toMatchObject({
      type: "mecanum.target",
      seq: 10,
      forward: 0.71,
      strafe: -0.71,
      turn: 0,
      speedLimitPercent: 35,
      stopMode: "brake"
    });
    expect(buildLiteMecanumStopCommand(11, ROBOT_PROFILE.drive)).toEqual({
      type: "mecanum.stop",
      seq: 11,
      stopMode: "brake"
    });
  });

  it("maps the left stick to M5/M6 tracked motor targets and stops", () => {
    const input = trackedInputFromStick(0.5, 1);

    expect(buildLiteTrackedTargetCommands(20, input, ROBOT_PROFILE.drive)).toEqual([
      { type: "motor.target", seq: 20, channel: "M5", speedPercent: 35, stopMode: "brake" },
      { type: "motor.target", seq: 21, channel: "M6", speedPercent: 12, stopMode: "brake" }
    ]);
    expect(buildLiteTrackedStopCommands(30, ROBOT_PROFILE.drive)).toEqual([
      { type: "motor.stop", seq: 30, channel: "M5", stopMode: "brake" },
      { type: "motor.stop", seq: 31, channel: "M6", stopMode: "brake" }
    ]);
  });

  it("builds direct PWM speed commands for every fixed M1-M6 motor", () => {
    expect(ROBOT_PROFILE.motors.map((motor) => motor.channel)).toEqual(["M1", "M2", "M3", "M4", "M5", "M6"]);
    expect(buildLitePwmMotorConfigCommand(32, ROBOT_PROFILE.motors[0])).toEqual({
      type: "motor.config",
      seq: 32,
      channel: "M1",
      driver: "tb6618",
      closedLoop: false,
      pins: {
        pwm: "PD14",
        in1: "PB1",
        in2: "PC0",
        enable: "PI0",
        encoderA: "PC1",
        encoderB: "PA4"
      }
    });
    expect(buildLitePwmMotorSetCommand(33, "m6", -37.7, "brake")).toEqual({
      type: "motor.set",
      seq: 33,
      channel: "M6",
      speedPercent: -38,
      stopMode: "brake",
      closedLoop: false
    });
    expect(buildLitePwmMotorSetCommand(34, "M2", 140, "brake")).toMatchObject({ channel: "M2", speedPercent: 100 });
    expect(buildLitePwmMotorStopCommand(35, "M5", "brake")).toEqual({
      type: "motor.stop",
      seq: 35,
      channel: "M5",
      stopMode: "brake"
    });
    expect(buildLitePwmMotorStopAllCommand(36, "brake")).toEqual({
      type: "motor.stop",
      seq: 36,
      all: true,
      stopMode: "brake"
    });
  });

  it("builds conservative CAN position jog group moves for fixed front and rear pairs", () => {
    const angles = createCanJogAngles(ROBOT_PROFILE.can.servos);
    const front = buildLiteCanJogCommand(40, angles, "front", 1, ROBOT_PROFILE.canJog, ROBOT_PROFILE.can.servos);
    const rear = buildLiteCanJogCommand(41, front.angles, "rear", -1, ROBOT_PROFILE.canJog, ROBOT_PROFILE.can.servos);

    expect(front.angles).toMatchObject({ "4": 181, "1": 51 });
    expect(front.command).toMatchObject({
      type: "can_servo.group_move",
      seq: 40,
      speed: 300,
      targets: [expect.objectContaining({ id: 4 }), expect.objectContaining({ id: 1 })]
    });
    expect(rear.angles).toMatchObject({ "3": 179, "2": 49 });
    expect(rear.command).toMatchObject({
      type: "can_servo.group_move",
      seq: 41,
      speed: 300,
      targets: [expect.objectContaining({ id: 3 }), expect.objectContaining({ id: 2 })]
    });
  });

  it("keeps paired CAN jogs synchronized when one servo reaches its limit", () => {
    const nearLimit = { "4": 220, "1": 99.5, "3": 180, "2": 50 };
    const front = buildLiteCanJogCommand(42, nearLimit, "front", 1, ROBOT_PROFILE.canJog, ROBOT_PROFILE.can.servos);
    const atLimit = buildLiteCanJogCommand(43, front.angles, "front", 1, ROBOT_PROFILE.canJog, ROBOT_PROFILE.can.servos);

    expect(front.angles).toMatchObject({ "4": 220.5, "1": 100 });
    expect(atLimit.angles).toMatchObject({ "4": 220.5, "1": 100 });
  });

  it("lets each CAN servo direction setting flip its emitted raw jog target", () => {
    const baseAngles = createCanJogAngles(ROBOT_PROFILE.can.servos);
    const forward = buildLiteCanJogCommand(44, baseAngles, "front", 1, ROBOT_PROFILE.canJog, [
      { ...ROBOT_PROFILE.can.servos[3], direction: 1 },
      { ...ROBOT_PROFILE.can.servos[0], direction: 1 }
    ]);
    const reversed = buildLiteCanJogCommand(45, baseAngles, "front", 1, ROBOT_PROFILE.canJog, [
      { ...ROBOT_PROFILE.can.servos[3], direction: -1 },
      { ...ROBOT_PROFILE.can.servos[0], direction: 1 }
    ]);

    const forwardId4 = forward.command.targets?.find((target) => target.id === 4)?.position;
    const reversedId4 = reversed.command.targets?.find((target) => target.id === 4)?.position;
    expect(forwardId4).toBeGreaterThan(16384);
    expect(reversedId4).toBeLessThan(16384);
  });

  it("reads the fixed XInput gamepad layout and exposes a full control snapshot", () => {
    const gamepad = {
      axes: [0.4, -0.8, 0.6, -0.7],
      buttons: Array.from({ length: 16 }, (_, index) => ({
        pressed: index === 12 || index === 4,
        touched: false,
        value: index === 6 ? 0.8 : index === 12 || index === 4 ? 1 : 0
      }))
    } as unknown as Gamepad;
    const state = liteGamepadStateFromGamepad(gamepad, 0.12);

    expect(state).toMatchObject({
      dpadUp: true,
      leftX: 0.4,
      leftY: 0.8,
      rightX: 0.6,
      rightY: 0.7,
      lb: true,
      lt: true
    });
    expect(snapshotFromLiteGamepad(state)).toMatchObject({
      mecanum: { forward: 1, strafe: 0, turn: 0 },
      tracked: { forward: 0.8, turn: 0.4 },
      arm: { forward: 0.7, lift: 0.6 },
      canJog: { front: 0, rear: 0 }
    });
  });

  it("accepts common generic USB gamepads that expose D-pad and triggers as axes", () => {
    const gamepad = {
      axes: [0, 0, 0, 0, 1, 1, -1, 1],
      buttons: Array.from({ length: 12 }, () => ({
        pressed: false,
        touched: false,
        value: 0
      }))
    } as unknown as Gamepad;
    const state = liteGamepadStateFromGamepad(gamepad, 0.12);

    expect(state).toMatchObject({
      dpadDown: true,
      dpadLeft: true,
      lt: true,
      rt: true
    });
    expect(snapshotFromLiteGamepad(state)).toMatchObject({
      mecanum: { forward: -0.71, strafe: -0.71, turn: 0 },
      canJog: { front: -1, rear: -1 }
    });
  });

  it("treats Chrome generic hat-axis idle as neutral and decodes real hat directions", () => {
    const makeGamepad = (hatValue: number) => ({
      axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, hatValue],
      buttons: Array.from({ length: 4 }, () => ({
        pressed: false,
        touched: false,
        value: 0
      }))
    }) as unknown as Gamepad;

    expect(liteGamepadStateFromGamepad(makeGamepad(3.285714), 0.12)).toMatchObject({
      dpadUp: false,
      dpadDown: false,
      dpadLeft: false,
      dpadRight: false
    });
    expect(liteGamepadStateFromGamepad(makeGamepad(-1), 0.12)).toMatchObject({ dpadUp: true });
    expect(liteGamepadStateFromGamepad(makeGamepad(0.714286), 0.12)).toMatchObject({ dpadLeft: true });
  });
});
