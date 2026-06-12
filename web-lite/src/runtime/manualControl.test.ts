import { describe, expect, it } from "vitest";
import { ROBOT_PROFILE } from "../robotProfile";
import {
  buildLiteCanJogCommand,
  buildLiteMecanumStopCommand,
  buildLiteMecanumTargetCommand,
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

  it("reads the fixed XInput gamepad layout and exposes a full control snapshot", () => {
    const gamepad = {
      axes: [0.4, -0.8, 0, 0],
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
      lb: true,
      lt: true
    });
    expect(snapshotFromLiteGamepad(state)).toMatchObject({
      mecanum: { forward: 1, strafe: 0, turn: 0 },
      tracked: { forward: 0.8, turn: 0.4 },
      canJog: { front: 0, rear: 0 }
    });
  });
});
