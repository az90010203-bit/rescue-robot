export type ServoSafetyPreset = "relaxed" | "standard" | "sensitive";
export type ServoSafetyMotionMode = "position" | "wheel";
export type ServoSafetyTriggerReason = "stall" | "load" | "current" | "temperature";

export interface ServoSafetyConfig {
  pollMs: number;
  startGraceMs: number;
  stallMs: number;
  minProgressRaw: number;
  minSpeedRaw: number;
  targetToleranceRaw: number;
  loadLimitRaw: number;
  currentLimitRaw: number;
  temperatureLimitC: number;
  overLimitMs: number;
}

export interface ServoSafetyFeedback {
  positionRaw?: number;
  speedRaw?: number;
  loadRaw?: number;
  currentRaw?: number;
  temperatureC?: number;
  moving?: boolean;
}

export interface ServoSafetyRuntime {
  mode: ServoSafetyMotionMode;
  startedAt: number;
  lastProgressAt: number;
  targetPositionRaw?: number;
  targetSpeedRaw?: number;
  lastPositionRaw?: number;
  overloadSince?: number;
  overcurrentSince?: number;
}

export interface ServoSafetyTarget {
  mode: ServoSafetyMotionMode;
  targetPositionRaw?: number;
  targetSpeedRaw?: number;
}

export interface ServoSafetyEvaluation {
  runtime: ServoSafetyRuntime;
  trigger?: ServoSafetyTriggerReason;
  settled: boolean;
}

const RAW_POSITION_RANGE = 4096;

const SERVO_SAFETY_CONFIGS: Record<ServoSafetyPreset, ServoSafetyConfig> = {
  relaxed: {
    pollMs: 200,
    startGraceMs: 650,
    stallMs: 900,
    minProgressRaw: 2,
    minSpeedRaw: 6,
    targetToleranceRaw: 12,
    loadLimitRaw: 850,
    currentLimitRaw: 1100,
    temperatureLimitC: 78,
    overLimitMs: 420
  },
  standard: {
    pollMs: 160,
    startGraceMs: 500,
    stallMs: 600,
    minProgressRaw: 3,
    minSpeedRaw: 8,
    targetToleranceRaw: 8,
    loadLimitRaw: 700,
    currentLimitRaw: 900,
    temperatureLimitC: 70,
    overLimitMs: 320
  },
  sensitive: {
    pollMs: 120,
    startGraceMs: 350,
    stallMs: 420,
    minProgressRaw: 4,
    minSpeedRaw: 10,
    targetToleranceRaw: 6,
    loadLimitRaw: 550,
    currentLimitRaw: 700,
    temperatureLimitC: 62,
    overLimitMs: 240
  }
};

export function resolveServoSafetyConfig(preset: ServoSafetyPreset): ServoSafetyConfig {
  return SERVO_SAFETY_CONFIGS[preset] ?? SERVO_SAFETY_CONFIGS.standard;
}

export function createServoSafetyRuntime(target: ServoSafetyTarget, nowMs: number): ServoSafetyRuntime {
  return {
    mode: target.mode,
    startedAt: nowMs,
    lastProgressAt: nowMs,
    targetPositionRaw: finiteOrUndefined(target.targetPositionRaw),
    targetSpeedRaw: finiteOrUndefined(target.targetSpeedRaw)
  };
}

export function updateServoSafetyTarget(runtime: ServoSafetyRuntime, target: ServoSafetyTarget): ServoSafetyRuntime {
  return {
    ...runtime,
    mode: target.mode,
    targetPositionRaw: finiteOrUndefined(target.targetPositionRaw),
    targetSpeedRaw: finiteOrUndefined(target.targetSpeedRaw)
  };
}

export function evaluateServoSafety(
  runtime: ServoSafetyRuntime,
  feedback: ServoSafetyFeedback,
  nowMs: number,
  config: ServoSafetyConfig
): ServoSafetyEvaluation {
  const next: ServoSafetyRuntime = { ...runtime };
  const load = absoluteFinite(feedback.loadRaw);
  const current = absoluteFinite(feedback.currentRaw);
  const temperature = finiteOrUndefined(feedback.temperatureC);

  if (temperature !== undefined && temperature >= config.temperatureLimitC) {
    return { runtime: next, trigger: "temperature", settled: false };
  }

  next.overloadSince = limitSince(load, config.loadLimitRaw, runtime.overloadSince, nowMs);
  if (next.overloadSince !== undefined && nowMs - next.overloadSince >= config.overLimitMs) {
    return { runtime: next, trigger: "load", settled: false };
  }

  next.overcurrentSince = limitSince(current, config.currentLimitRaw, runtime.overcurrentSince, nowMs);
  if (next.overcurrentSince !== undefined && nowMs - next.overcurrentSince >= config.overLimitMs) {
    return { runtime: next, trigger: "current", settled: false };
  }

  const positionRaw = finiteOrUndefined(feedback.positionRaw);
  if (positionRaw !== undefined) {
    if (next.lastPositionRaw === undefined) {
      next.lastPositionRaw = positionRaw;
      next.lastProgressAt = nowMs;
    } else if (rawCircularDistance(next.lastPositionRaw, positionRaw) >= config.minProgressRaw) {
      next.lastPositionRaw = positionRaw;
      next.lastProgressAt = nowMs;
    }
  }

  if (runtime.mode === "wheel" && absoluteFinite(feedback.speedRaw) !== undefined && absoluteFinite(feedback.speedRaw)! >= config.minSpeedRaw) {
    next.lastProgressAt = nowMs;
  }

  const settled = isServoSafetySettled(next, feedback, config);
  if (settled || nowMs - next.startedAt < config.startGraceMs || !isServoSafetyTargetActive(next, feedback, config)) {
    return { runtime: next, settled };
  }

  if (nowMs - next.lastProgressAt >= config.stallMs) {
    return { runtime: next, trigger: "stall", settled: false };
  }

  return { runtime: next, settled: false };
}

export function isServoSafetyTargetActive(runtime: ServoSafetyRuntime, feedback: ServoSafetyFeedback, config: ServoSafetyConfig): boolean {
  if (runtime.mode === "wheel") {
    return absoluteFinite(runtime.targetSpeedRaw) !== undefined && absoluteFinite(runtime.targetSpeedRaw)! >= config.minSpeedRaw;
  }

  const target = finiteOrUndefined(runtime.targetPositionRaw);
  const position = finiteOrUndefined(feedback.positionRaw);
  return target !== undefined && (position === undefined || rawCircularDistance(position, target) > config.targetToleranceRaw);
}

export function isServoSafetySettled(runtime: ServoSafetyRuntime, feedback: ServoSafetyFeedback, config: ServoSafetyConfig): boolean {
  if (runtime.mode === "wheel") {
    return absoluteFinite(runtime.targetSpeedRaw) === undefined || absoluteFinite(runtime.targetSpeedRaw)! < config.minSpeedRaw;
  }

  const target = finiteOrUndefined(runtime.targetPositionRaw);
  const position = finiteOrUndefined(feedback.positionRaw);
  return target !== undefined && position !== undefined && rawCircularDistance(position, target) <= config.targetToleranceRaw;
}

function limitSince(value: number | undefined, limit: number, previous: number | undefined, nowMs: number): number | undefined {
  if (value === undefined || value < limit) {
    return undefined;
  }
  return previous ?? nowMs;
}

function rawCircularDistance(from: number, to: number): number {
  const direct = Math.abs(from - to);
  return Math.min(direct, RAW_POSITION_RANGE - direct);
}

function absoluteFinite(value: number | undefined): number | undefined {
  const finite = finiteOrUndefined(value);
  return finite === undefined ? undefined : Math.abs(finite);
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
