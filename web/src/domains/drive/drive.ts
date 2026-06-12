import { MotorTarget, clamp, normalizeMotorChannel } from "@adapters/hardware/protocol";

export type DriveBase = "tracked" | "mecanum";
export type DriveWheel = "leftTrack" | "rightTrack" | "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

export interface DriveInputState {
  forward: number;
  strafe: number;
  turn: number;
  cameraPan: number;
  cameraTilt: number;
  stop: boolean;
}

export interface DriveChannelConfig {
  leftTrack: string;
  rightTrack: string;
  frontLeft: string;
  frontRight: string;
  rearLeft: string;
  rearRight: string;
}

export type DriveDirectionConfig = Partial<Record<DriveWheel, 1 | -1>>;

export interface DriveMixOptions {
  channels?: DriveChannelConfig;
  directions?: DriveDirectionConfig;
  speedLimitPercent?: number;
}

export const DEFAULT_DRIVE_CHANNELS: DriveChannelConfig = {
  leftTrack: "M5",
  rightTrack: "M6",
  frontLeft: "M3",
  frontRight: "M1",
  rearLeft: "M4",
  rearRight: "M2"
};

export const ZERO_DRIVE_INPUT: DriveInputState = {
  forward: 0,
  strafe: 0,
  turn: 0,
  cameraPan: 0,
  cameraTilt: 0,
  stop: false
};

export function mixTrackedDrive(
  input: Pick<DriveInputState, "forward" | "turn">,
  options: DriveMixOptions = {}
): MotorTarget[] {
  const channels = options.channels ?? DEFAULT_DRIVE_CHANNELS;
  const speeds = normalizeWheelSpeeds({
    leftTrack: clampAxis(input.forward) + clampAxis(input.turn),
    rightTrack: clampAxis(input.forward) - clampAxis(input.turn)
  });

  return [
    buildTarget("leftTrack", channels.leftTrack, speeds.leftTrack, options),
    buildTarget("rightTrack", channels.rightTrack, speeds.rightTrack, options)
  ];
}

export function mixMecanumDrive(
  input: Pick<DriveInputState, "forward" | "strafe" | "turn">,
  options: DriveMixOptions = {}
): MotorTarget[] {
  const channels = options.channels ?? DEFAULT_DRIVE_CHANNELS;
  const forward = clampAxis(input.forward);
  const strafe = clampAxis(input.strafe);
  const turn = clampAxis(input.turn);
  const speeds = normalizeWheelSpeeds({
    frontLeft: forward + strafe + turn,
    frontRight: forward - strafe - turn,
    rearLeft: forward - strafe + turn,
    rearRight: forward + strafe - turn
  });

  return [
    buildTarget("frontLeft", channels.frontLeft, speeds.frontLeft, options),
    buildTarget("frontRight", channels.frontRight, speeds.frontRight, options),
    buildTarget("rearLeft", channels.rearLeft, speeds.rearLeft, options),
    buildTarget("rearRight", channels.rearRight, speeds.rearRight, options)
  ];
}

export function mixDriveTargets(base: DriveBase, input: DriveInputState, options: DriveMixOptions = {}): MotorTarget[] {
  return base === "tracked" ? mixTrackedDrive(input, options) : mixMecanumDrive(input, options);
}

export function applyDeadzone(value: number, deadzone: number): number {
  const normalizedDeadzone = clamp(Math.abs(deadzone), 0, 0.95);
  const normalizedValue = clampAxis(value);
  if (Math.abs(normalizedValue) <= normalizedDeadzone) {
    return 0;
  }

  const sign = Math.sign(normalizedValue);
  return sign * ((Math.abs(normalizedValue) - normalizedDeadzone) / (1 - normalizedDeadzone));
}

export function combineDriveInputs(primary: DriveInputState, secondary: DriveInputState): DriveInputState {
  return {
    forward: dominantAxis(primary.forward, secondary.forward),
    strafe: dominantAxis(primary.strafe, secondary.strafe),
    turn: dominantAxis(primary.turn, secondary.turn),
    cameraPan: dominantAxis(primary.cameraPan, secondary.cameraPan),
    cameraTilt: dominantAxis(primary.cameraTilt, secondary.cameraTilt),
    stop: primary.stop || secondary.stop
  };
}

function buildTarget(wheel: DriveWheel, channel: string, unitSpeed: number, options: DriveMixOptions): MotorTarget {
  const direction = options.directions?.[wheel] ?? 1;
  const speedLimit = clamp(options.speedLimitPercent ?? 100, 0, 100);
  return {
    channel: normalizeMotorChannel(channel),
    speedPercent: roundSpeed(unitSpeed * direction * speedLimit)
  };
}

function normalizeWheelSpeeds<T extends string>(speeds: Record<T, number>): Record<T, number> {
  const maxMagnitude = Math.max(1, ...Object.values(speeds).map((value) => Math.abs(Number(value))));
  const normalized = {} as Record<T, number>;
  for (const [key, value] of Object.entries(speeds) as [T, number][]) {
    normalized[key] = clampAxis(value / maxMagnitude);
  }
  return normalized;
}

function clampAxis(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function dominantAxis(a: number, b: number): number {
  const normalizedA = clampAxis(a);
  const normalizedB = clampAxis(b);
  return Math.abs(normalizedA) >= Math.abs(normalizedB) ? normalizedA : normalizedB;
}

function roundSpeed(value: number): number {
  return Object.is(value, -0) ? 0 : Math.round(value);
}
