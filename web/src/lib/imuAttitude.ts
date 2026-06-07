import type { ImuRawVector, InboundMessage } from "./protocol";

export const IMU_ACCEL_LSB_PER_G = 4096;
export const IMU_GYRO_LSB_PER_DPS = 16.4;
export const IMU_CALIBRATION_DURATION_MS = 8000;

const RAD_TO_DEG = 180 / Math.PI;
const ZERO_VECTOR: ImuVector = { x: 0, y: 0, z: 0 };
const UNIT_VECTOR: ImuVector = { x: 1, y: 1, z: 1 };

export type ImuFeedback = Extract<InboundMessage, { type: "imu.feedback" }>;
export type ImuCalibrationStatus = "idle" | "calibrating" | "calibrated";

export interface ImuVector {
  x: number;
  y: number;
  z: number;
}

export interface ImuCalibration {
  active: boolean;
  calibrated: boolean;
  sampleCount: number;
  startedAtMs?: number;
  completedAtMs?: number;
  min: ImuVector;
  max: ImuVector;
  offset: ImuVector;
  scale: ImuVector;
}

export interface ImuAttitude {
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number | null;
  accelG: ImuVector;
  gyroDps: ImuVector;
  mag: ImuVector | null;
  calibrated: boolean;
  receivedAtMs: number;
  sampleMs?: number;
}

export function createDefaultImuCalibration(): ImuCalibration {
  return {
    active: false,
    calibrated: false,
    sampleCount: 0,
    min: { ...ZERO_VECTOR },
    max: { ...ZERO_VECTOR },
    offset: { ...ZERO_VECTOR },
    scale: { ...UNIT_VECTOR }
  };
}

export function beginImuCalibration(nowMs = Date.now()): ImuCalibration {
  return {
    ...createDefaultImuCalibration(),
    active: true,
    startedAtMs: nowMs
  };
}

export function imuCalibrationStatus(calibration: ImuCalibration): ImuCalibrationStatus {
  if (calibration.active) {
    return "calibrating";
  }
  return calibration.calibrated ? "calibrated" : "idle";
}

export function updateImuCalibration(
  calibration: ImuCalibration,
  magRaw: ImuRawVector,
  nowMs = Date.now(),
  durationMs = IMU_CALIBRATION_DURATION_MS
): ImuCalibration {
  if (!calibration.active) {
    return calibration;
  }

  const sampleCount = calibration.sampleCount + 1;
  const first = sampleCount === 1;
  const min = first ? copyVector(magRaw) : minVector(calibration.min, magRaw);
  const max = first ? copyVector(magRaw) : maxVector(calibration.max, magRaw);
  const offset = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2
  };
  const halfRange = {
    x: Math.max(1, (max.x - min.x) / 2),
    y: Math.max(1, (max.y - min.y) / 2),
    z: Math.max(1, (max.z - min.z) / 2)
  };
  const averageHalfRange = (halfRange.x + halfRange.y + halfRange.z) / 3;
  const done = calibration.startedAtMs !== undefined && nowMs - calibration.startedAtMs >= durationMs;

  return {
    active: !done,
    calibrated: done,
    startedAtMs: calibration.startedAtMs,
    completedAtMs: done ? nowMs : calibration.completedAtMs,
    sampleCount,
    min,
    max,
    offset,
    scale: {
      x: averageHalfRange / halfRange.x,
      y: averageHalfRange / halfRange.y,
      z: averageHalfRange / halfRange.z
    }
  };
}

export function calculateImuAttitude(feedback: ImuFeedback, calibration: ImuCalibration, receivedAtMs = Date.now()): ImuAttitude | null {
  if (!feedback.accelRaw || !feedback.gyroRaw) {
    return null;
  }

  const accelG = scaleVector(feedback.accelRaw, IMU_ACCEL_LSB_PER_G);
  const gyroDps = scaleVector(feedback.gyroRaw, IMU_GYRO_LSB_PER_DPS);
  const rollRad = Math.atan2(accelG.y, accelG.z);
  const pitchRad = Math.atan2(-accelG.x, Math.sqrt(accelG.y * accelG.y + accelG.z * accelG.z));
  const mag = feedback.magRaw ? applyCalibration(feedback.magRaw, calibration) : null;

  return {
    rollDeg: rollRad * RAD_TO_DEG,
    pitchDeg: pitchRad * RAD_TO_DEG,
    yawDeg: mag ? tiltCompensatedYawDeg(mag, rollRad, pitchRad) : null,
    accelG,
    gyroDps,
    mag,
    calibrated: calibration.calibrated,
    receivedAtMs,
    sampleMs: feedback.sampleMs
  };
}

export function normalizeDeg(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function tiltCompensatedYawDeg(mag: ImuVector, rollRad: number, pitchRad: number): number {
  const cosPitch = Math.cos(pitchRad);
  const sinPitch = Math.sin(pitchRad);
  const cosRoll = Math.cos(rollRad);
  const sinRoll = Math.sin(rollRad);
  const xh = mag.x * cosPitch + mag.z * sinPitch;
  const yh = mag.x * sinRoll * sinPitch + mag.y * cosRoll - mag.z * sinRoll * cosPitch;
  return normalizeDeg(Math.atan2(-yh, xh) * RAD_TO_DEG);
}

function applyCalibration(value: ImuRawVector, calibration: ImuCalibration): ImuVector {
  return {
    x: (value.x - calibration.offset.x) * calibration.scale.x,
    y: (value.y - calibration.offset.y) * calibration.scale.y,
    z: (value.z - calibration.offset.z) * calibration.scale.z
  };
}

function copyVector(value: ImuRawVector): ImuVector {
  return { x: value.x, y: value.y, z: value.z };
}

function scaleVector(value: ImuRawVector, divisor: number): ImuVector {
  return {
    x: value.x / divisor,
    y: value.y / divisor,
    z: value.z / divisor
  };
}

function minVector(left: ImuVector, right: ImuRawVector): ImuVector {
  return {
    x: Math.min(left.x, right.x),
    y: Math.min(left.y, right.y),
    z: Math.min(left.z, right.z)
  };
}

function maxVector(left: ImuVector, right: ImuRawVector): ImuVector {
  return {
    x: Math.max(left.x, right.x),
    y: Math.max(left.y, right.y),
    z: Math.max(left.z, right.z)
  };
}
