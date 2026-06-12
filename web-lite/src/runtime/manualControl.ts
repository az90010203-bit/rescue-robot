import {
  asmgMdLogicalAngleToPositionRaw,
  buildAsmgMdGroupMoveCommand,
  normalizeAsmgMdServoProfile,
  type AsmgMdServoProfile
} from "@adapters/hardware/asmgMdCanServo";
import {
  buildMecanumTargetCommand,
  buildMotorStopCommand,
  buildMotorTargetCommand,
  clamp,
  servoLogicalSpan,
  type PcCommand
} from "@adapters/hardware/protocol";
import type { LiteCanJogProfile, LiteDriveProfile } from "../robotProfile";

export type LiteCanJogGroup = "front" | "rear";
export type LiteCanJogDirection = -1 | 0 | 1;

export interface LiteDpadInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface LiteTrackedInput {
  forward: number;
  turn: number;
}

export interface LiteGamepadState {
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  leftX: number;
  leftY: number;
  lb: boolean;
  lt: boolean;
  rb: boolean;
  rt: boolean;
  stop: boolean;
}

export interface ManualControlSnapshot {
  mecanum: {
    forward: number;
    strafe: number;
    turn: number;
  };
  tracked: LiteTrackedInput;
  canJog: {
    front: LiteCanJogDirection;
    rear: LiteCanJogDirection;
  };
  stop: boolean;
}

export const ZERO_LITE_GAMEPAD_STATE: LiteGamepadState = {
  dpadUp: false,
  dpadDown: false,
  dpadLeft: false,
  dpadRight: false,
  leftX: 0,
  leftY: 0,
  lb: false,
  lt: false,
  rb: false,
  rt: false,
  stop: false
};

export function liteGamepadStateFromGamepad(gamepad: Gamepad | null | undefined, deadzone = 0.12): LiteGamepadState {
  if (!gamepad) {
    return ZERO_LITE_GAMEPAD_STATE;
  }
  return {
    dpadUp: gamepadButtonPressed(gamepad, 12),
    dpadDown: gamepadButtonPressed(gamepad, 13),
    dpadLeft: gamepadButtonPressed(gamepad, 14),
    dpadRight: gamepadButtonPressed(gamepad, 15),
    leftX: readGamepadAxis(gamepad, 0, false, deadzone),
    leftY: readGamepadAxis(gamepad, 1, true, deadzone),
    lb: gamepadButtonPressed(gamepad, 4),
    lt: gamepadButtonPressed(gamepad, 6),
    rb: gamepadButtonPressed(gamepad, 5),
    rt: gamepadButtonPressed(gamepad, 7),
    stop: gamepadButtonPressed(gamepad, 0)
  };
}

export function snapshotFromLiteGamepad(state: LiteGamepadState): ManualControlSnapshot {
  const mecanum = mecanumInputFromDpad({
    up: state.dpadUp,
    down: state.dpadDown,
    left: state.dpadLeft,
    right: state.dpadRight
  });
  const tracked = trackedInputFromStick(state.leftX, state.leftY);
  return {
    mecanum,
    tracked,
    canJog: {
      front: canJogDirectionFromButtons(state.lb, state.lt),
      rear: canJogDirectionFromButtons(state.rb, state.rt)
    },
    stop: state.stop
  };
}

export function mecanumInputFromDpad(input: LiteDpadInput): ManualControlSnapshot["mecanum"] {
  const forward = buttonAxis(input.up, input.down);
  const strafe = buttonAxis(input.right, input.left);
  const magnitude = Math.hypot(forward, strafe);
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  return {
    forward: roundUnit(forward * scale),
    strafe: roundUnit(strafe * scale),
    turn: 0
  };
}

export function trackedInputFromStick(leftX: number, leftY: number): LiteTrackedInput {
  return {
    forward: clampUnit(leftY),
    turn: clampUnit(leftX)
  };
}

export function canJogDirectionFromButtons(positive: boolean, negative: boolean): LiteCanJogDirection {
  return (positive === negative ? 0 : positive ? 1 : -1) as LiteCanJogDirection;
}

export function hasMecanumMotion(input: Pick<ManualControlSnapshot["mecanum"], "forward" | "strafe" | "turn">): boolean {
  return Math.abs(input.forward) > 0 || Math.abs(input.strafe) > 0 || Math.abs(input.turn) > 0;
}

export function hasTrackedMotion(input: LiteTrackedInput): boolean {
  return Math.abs(input.forward) > 0 || Math.abs(input.turn) > 0;
}

export function buildLiteMecanumTargetCommand(seq: number, input: ManualControlSnapshot["mecanum"], profile: LiteDriveProfile): PcCommand {
  return buildMecanumTargetCommand(seq, {
    forward: input.forward,
    strafe: input.strafe,
    turn: input.turn,
    speedLimitPercent: profile.speedLimitPercent,
    stopMode: profile.stopMode
  });
}

export function buildLiteMecanumStopCommand(seq: number, profile: LiteDriveProfile): PcCommand {
  return {
    type: "mecanum.stop",
    seq,
    stopMode: profile.stopMode
  };
}

export function buildLiteTrackedTargetCommands(seqStart: number, input: LiteTrackedInput, profile: LiteDriveProfile): PcCommand[] {
  const speeds = mixTrackedSpeeds(input, profile.speedLimitPercent);
  return [
    buildMotorTargetCommand(seqStart, {
      channel: profile.tracked.left,
      speedPercent: speeds.left,
      stopMode: profile.stopMode
    }),
    buildMotorTargetCommand(seqStart + 1, {
      channel: profile.tracked.right,
      speedPercent: speeds.right,
      stopMode: profile.stopMode
    })
  ];
}

export function buildLiteTrackedStopCommands(seqStart: number, profile: LiteDriveProfile): PcCommand[] {
  return [
    buildMotorStopCommand(seqStart, { channel: profile.tracked.left, stopMode: profile.stopMode }),
    buildMotorStopCommand(seqStart + 1, { channel: profile.tracked.right, stopMode: profile.stopMode })
  ];
}

export function createCanJogAngles(servos: AsmgMdServoProfile[]): Record<string, number> {
  return Object.fromEntries(servos.map((servo) => [String(servo.id), servoLogicalCenter(servo)]));
}

export function buildLiteCanJogCommand(
  seq: number,
  currentAngles: Record<string, number>,
  group: LiteCanJogGroup,
  direction: Exclude<LiteCanJogDirection, 0>,
  profile: LiteCanJogProfile,
  servos: AsmgMdServoProfile[]
): { command: PcCommand; angles: Record<string, number> } {
  const ids = group === "front" ? profile.frontIds : profile.rearIds;
  const byId = new Map(servos.map((servo) => [servo.id, normalizeAsmgMdServoProfile(servo)]));
  const angles = { ...currentAngles };
  const targets = ids.map((id) => {
    const servo = byId.get(id);
    if (!servo) {
      throw new RangeError(`CAN servo ID ${id} is not in the fixed profile`);
    }
    const nextAngle = clampCanLogicalAngle(servo, (angles[String(id)] ?? servoLogicalCenter(servo)) + direction * profile.stepDeg);
    angles[String(id)] = nextAngle;
    return {
      id: servo.id,
      position: asmgMdLogicalAngleToPositionRaw(servo, nextAngle)
    };
  });
  return {
    command: buildAsmgMdGroupMoveCommand(seq, targets, profile.speedRaw),
    angles
  };
}

export function canJogGroupLabel(group: LiteCanJogGroup, profile: LiteCanJogProfile): string {
  const ids = group === "front" ? profile.frontIds : profile.rearIds;
  return ids.map((id) => `ID${id}`).join(" / ");
}

function mixTrackedSpeeds(input: LiteTrackedInput, speedLimitPercent: number): { left: number; right: number } {
  const raw = {
    left: clampUnit(input.forward) + clampUnit(input.turn),
    right: clampUnit(input.forward) - clampUnit(input.turn)
  };
  const maxMagnitude = Math.max(1, Math.abs(raw.left), Math.abs(raw.right));
  return {
    left: roundSpeed((raw.left / maxMagnitude) * speedLimitPercent),
    right: roundSpeed((raw.right / maxMagnitude) * speedLimitPercent)
  };
}

function gamepadButtonPressed(gamepad: Gamepad, index: number): boolean {
  const button = gamepad.buttons[index];
  return Boolean(button?.pressed || (button?.value ?? 0) > 0.15);
}

function readGamepadAxis(gamepad: Gamepad, index: number, invert: boolean, deadzone: number): number {
  const raw = gamepad.axes[index] ?? 0;
  const value = invert ? -raw : raw;
  return Math.abs(value) <= Math.max(0, deadzone) ? 0 : roundUnit(value);
}

function buttonAxis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function clampCanLogicalAngle(servo: AsmgMdServoProfile, value: number): number {
  return clamp(Number.isFinite(value) ? value : servoLogicalCenter(servo), 0, servoLogicalSpan(servo));
}

function servoLogicalCenter(servo: AsmgMdServoProfile): number {
  return servoLogicalSpan(servo) / 2;
}

function roundUnit(value: number): number {
  const rounded = Math.round(clampUnit(value) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundSpeed(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}
