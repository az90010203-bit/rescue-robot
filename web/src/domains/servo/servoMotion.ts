export type ServoSmoothPreset = "soft" | "standard" | "fast";

export interface ServoMotionConfig {
  tickMs: number;
  positionDegPerSec: number;
  positionMinMs: number;
  positionMaxMs: number;
  positionDeadbandDeg: number;
  wheelRawPerSec: number;
  wheelMinMs: number;
  wheelMaxMs: number;
  wheelDeadbandRaw: number;
}

export interface ServoMotionSample {
  elapsedMs: number;
  progress: number;
  value: number;
}

export const SERVO_SMOOTH_PRESETS: Record<ServoSmoothPreset, ServoMotionConfig> = {
  soft: {
    tickMs: 50,
    positionDegPerSec: 90,
    positionMinMs: 360,
    positionMaxMs: 2600,
    positionDeadbandDeg: 0.4,
    wheelRawPerSec: 800,
    wheelMinMs: 220,
    wheelMaxMs: 1600,
    wheelDeadbandRaw: 3
  },
  standard: {
    tickMs: 40,
    positionDegPerSec: 180,
    positionMinMs: 220,
    positionMaxMs: 1800,
    positionDeadbandDeg: 0.5,
    wheelRawPerSec: 1600,
    wheelMinMs: 120,
    wheelMaxMs: 1200,
    wheelDeadbandRaw: 4
  },
  fast: {
    tickMs: 30,
    positionDegPerSec: 360,
    positionMinMs: 120,
    positionMaxMs: 900,
    positionDeadbandDeg: 0.8,
    wheelRawPerSec: 3200,
    wheelMinMs: 80,
    wheelMaxMs: 700,
    wheelDeadbandRaw: 6
  }
};

export function smoothStepQuintic(progress: number): number {
  const u = clamp(progress, 0, 1);
  return u * u * u * (10 + u * (-15 + u * 6));
}

export function resolveServoMotionConfig(preset: ServoSmoothPreset): ServoMotionConfig {
  return SERVO_SMOOTH_PRESETS[preset] ?? SERVO_SMOOTH_PRESETS.standard;
}

export function createPositionTrajectory(fromDeg: number, toDeg: number, config: ServoMotionConfig): ServoMotionSample[] {
  return createTrajectory({
    from: fromDeg,
    to: toDeg,
    tickMs: config.tickMs,
    unitsPerSecond: config.positionDegPerSec,
    minMs: config.positionMinMs,
    maxMs: config.positionMaxMs,
    deadband: config.positionDeadbandDeg
  });
}

export function createWheelSpeedTrajectory(fromRaw: number, toRaw: number, config: ServoMotionConfig): ServoMotionSample[] {
  return createTrajectory({
    from: fromRaw,
    to: toRaw,
    tickMs: config.tickMs,
    unitsPerSecond: config.wheelRawPerSec,
    minMs: config.wheelMinMs,
    maxMs: config.wheelMaxMs,
    deadband: config.wheelDeadbandRaw
  });
}

export function nextMotionGeneration(current: number | undefined): number {
  return (current ?? 0) + 1;
}

export function isCurrentMotionGeneration(current: number | undefined, expected: number): boolean {
  return current === expected;
}

interface CreateTrajectoryOptions {
  from: number;
  to: number;
  tickMs: number;
  unitsPerSecond: number;
  minMs: number;
  maxMs: number;
  deadband: number;
}

function createTrajectory(options: CreateTrajectoryOptions): ServoMotionSample[] {
  const from = finiteOrZero(options.from);
  const to = finiteOrZero(options.to);
  const delta = to - from;
  const distance = Math.abs(delta);

  if (distance <= Math.max(0, options.deadband)) {
    return [{ elapsedMs: 0, progress: 1, value: to }];
  }

  const durationMs = calculateDurationMs(distance, options.unitsPerSecond, options.minMs, options.maxMs);
  const tickMs = Math.max(1, Math.round(options.tickMs));
  const steps = Math.max(1, Math.ceil(durationMs / tickMs));
  const samples: ServoMotionSample[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;
    samples.push({
      elapsedMs: Math.round(progress * durationMs),
      progress,
      value: index === steps ? to : from + delta * smoothStepQuintic(progress)
    });
  }

  return samples;
}

function calculateDurationMs(distance: number, unitsPerSecond: number, minMs: number, maxMs: number): number {
  const rawDuration = (distance / Math.max(1, unitsPerSecond)) * 1000;
  return clamp(rawDuration, minMs, maxMs);
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
