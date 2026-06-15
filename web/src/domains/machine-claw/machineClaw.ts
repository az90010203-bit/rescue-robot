import {
  DEFAULT_WHEEL_SPEED_LIMIT,
  calculateWheelTurnDelta,
  clamp,
  type InboundMessage,
  type PcCommand
} from "@adapters/hardware/protocol";

export const MACHINE_CLAW_SERVO_IDS = {
  pitchLeft: 21,
  claw: 22,
  pitchRight: 23
} as const;

export const MACHINE_CLAW_SERVO_ID_LIST = [
  MACHINE_CLAW_SERVO_IDS.pitchLeft,
  MACHINE_CLAW_SERVO_IDS.claw,
  MACHINE_CLAW_SERVO_IDS.pitchRight
] as const;

export const MACHINE_CLAW_MIN_TURNS = 0.01;
export const MACHINE_CLAW_MAX_TURNS = 999;
export const MACHINE_CLAW_MAX_ACC = 254;
export const MACHINE_CLAW_MAX_PROTECTION_CURRENT_MA = 5000;
export const MACHINE_CLAW_MAX_PROTECTION_LOAD_PERCENT = 100;
export const MACHINE_CLAW_MAX_PROTECTION_TEMPERATURE_C = 100;
export const MACHINE_CLAW_MIN_PROTECTION_STALL_MS = 120;
export const MACHINE_CLAW_MAX_PROTECTION_STALL_MS = 3000;
export const MACHINE_CLAW_MAX_PROTECTION_RAW_DELTA = 64;

export interface MachineClawTestConfig {
  pitchSpeedRaw: number;
  rotationSpeedRaw: number;
  rotationClawSpeedRaw: number;
  clawSpeedRaw: number;
  acc: number;
  pitchReverse: boolean;
  rotationReverse: boolean;
  rotationClawReverse: boolean;
  clawReverse: boolean;
  openTurns: number;
  closeTurns: number;
  pitchLimitTurns: number;
  rotationLimitTurns: number;
  protectionEnabled: boolean;
  protectionCurrentMa: number;
  protectionLoadPercent: number;
  protectionTemperatureC: number;
  protectionStallMs: number;
  protectionMinRawDelta: number;
}

export type MachineClawConfigPatch = Partial<MachineClawTestConfig>;
export type MachineClawDirection = "positive" | "negative";
export type MachineClawClawDirection = "open" | "close";
export type MachineClawRunAction =
  | "idle"
  | "pitch-positive"
  | "pitch-negative"
  | "rotation-positive"
  | "rotation-negative"
  | "claw-open"
  | "claw-close"
  | "stopping"
  | "error";

export interface MachineClawTurnProgress {
  completedTurns: number;
  targetTurns: number;
  running: boolean;
}

export const DEFAULT_MACHINE_CLAW_TEST_CONFIG: MachineClawTestConfig = {
  pitchSpeedRaw: 300,
  rotationSpeedRaw: 300,
  rotationClawSpeedRaw: 120,
  clawSpeedRaw: 220,
  acc: 50,
  pitchReverse: false,
  rotationReverse: false,
  rotationClawReverse: false,
  clawReverse: false,
  openTurns: 1,
  closeTurns: 1,
  pitchLimitTurns: 1,
  rotationLimitTurns: 1,
  protectionEnabled: true,
  protectionCurrentMa: 1200,
  protectionLoadPercent: 80,
  protectionTemperatureC: 70,
  protectionStallMs: 450,
  protectionMinRawDelta: 2
};

export function normalizeMachineClawTestConfig(value: unknown): MachineClawTestConfig {
  const draft = isRecord(value) ? value : {};
  return {
    pitchSpeedRaw: normalizeWheelSpeed(draft.pitchSpeedRaw, DEFAULT_MACHINE_CLAW_TEST_CONFIG.pitchSpeedRaw),
    rotationSpeedRaw: normalizeWheelSpeed(draft.rotationSpeedRaw, DEFAULT_MACHINE_CLAW_TEST_CONFIG.rotationSpeedRaw),
    rotationClawSpeedRaw: normalizeWheelSpeed(draft.rotationClawSpeedRaw, DEFAULT_MACHINE_CLAW_TEST_CONFIG.rotationClawSpeedRaw),
    clawSpeedRaw: normalizeWheelSpeed(draft.clawSpeedRaw, DEFAULT_MACHINE_CLAW_TEST_CONFIG.clawSpeedRaw),
    acc: normalizeInteger(draft.acc, DEFAULT_MACHINE_CLAW_TEST_CONFIG.acc, 0, MACHINE_CLAW_MAX_ACC),
    pitchReverse: draft.pitchReverse === true,
    rotationReverse: draft.rotationReverse === true,
    rotationClawReverse: draft.rotationClawReverse === true,
    clawReverse: draft.clawReverse === true,
    openTurns: normalizeTurns(draft.openTurns, DEFAULT_MACHINE_CLAW_TEST_CONFIG.openTurns),
    closeTurns: normalizeTurns(draft.closeTurns, DEFAULT_MACHINE_CLAW_TEST_CONFIG.closeTurns),
    pitchLimitTurns: normalizeTurns(draft.pitchLimitTurns, DEFAULT_MACHINE_CLAW_TEST_CONFIG.pitchLimitTurns),
    rotationLimitTurns: normalizeTurns(draft.rotationLimitTurns, DEFAULT_MACHINE_CLAW_TEST_CONFIG.rotationLimitTurns),
    protectionEnabled: draft.protectionEnabled !== false,
    protectionCurrentMa: normalizeInteger(
      draft.protectionCurrentMa,
      DEFAULT_MACHINE_CLAW_TEST_CONFIG.protectionCurrentMa,
      0,
      MACHINE_CLAW_MAX_PROTECTION_CURRENT_MA
    ),
    protectionLoadPercent: normalizeInteger(
      draft.protectionLoadPercent,
      DEFAULT_MACHINE_CLAW_TEST_CONFIG.protectionLoadPercent,
      0,
      MACHINE_CLAW_MAX_PROTECTION_LOAD_PERCENT
    ),
    protectionTemperatureC: normalizeInteger(
      draft.protectionTemperatureC,
      DEFAULT_MACHINE_CLAW_TEST_CONFIG.protectionTemperatureC,
      0,
      MACHINE_CLAW_MAX_PROTECTION_TEMPERATURE_C
    ),
    protectionStallMs: normalizeInteger(
      draft.protectionStallMs,
      DEFAULT_MACHINE_CLAW_TEST_CONFIG.protectionStallMs,
      MACHINE_CLAW_MIN_PROTECTION_STALL_MS,
      MACHINE_CLAW_MAX_PROTECTION_STALL_MS
    ),
    protectionMinRawDelta: normalizeInteger(
      draft.protectionMinRawDelta,
      DEFAULT_MACHINE_CLAW_TEST_CONFIG.protectionMinRawDelta,
      0,
      MACHINE_CLAW_MAX_PROTECTION_RAW_DELTA
    )
  };
}

export function normalizeMachineClawConfigPatch(current: MachineClawTestConfig, patch: MachineClawConfigPatch): MachineClawTestConfig {
  return normalizeMachineClawTestConfig({ ...current, ...patch });
}

export function buildMachineClawPitchCommands(config: MachineClawTestConfig, direction: MachineClawDirection, nextSeq: () => number): PcCommand[] {
  const signedSpeed = signedDirectionSpeed(config.pitchSpeedRaw, direction, config.pitchReverse);
  return [
    buildMachineClawSpeedCommand(nextSeq(), MACHINE_CLAW_SERVO_IDS.pitchLeft, signedSpeed, config.acc, true),
    buildMachineClawSpeedCommand(nextSeq(), MACHINE_CLAW_SERVO_IDS.pitchRight, -signedSpeed, config.acc, true)
  ];
}

export function buildMachineClawRotationCommands(config: MachineClawTestConfig, direction: MachineClawDirection, nextSeq: () => number): PcCommand[] {
  const pairSpeed = signedDirectionSpeed(config.rotationSpeedRaw, direction, config.rotationReverse);
  const clawFollowSpeed = signedDirectionSpeed(config.rotationClawSpeedRaw, direction, config.rotationClawReverse);
  return [
    buildMachineClawSpeedCommand(nextSeq(), MACHINE_CLAW_SERVO_IDS.pitchLeft, pairSpeed, config.acc, true),
    buildMachineClawSpeedCommand(nextSeq(), MACHINE_CLAW_SERVO_IDS.pitchRight, pairSpeed, config.acc, true),
    buildMachineClawSpeedCommand(nextSeq(), MACHINE_CLAW_SERVO_IDS.claw, clawFollowSpeed, config.acc, true)
  ];
}

export function buildMachineClawClawCommand(config: MachineClawTestConfig, direction: MachineClawClawDirection, nextSeq: () => number): PcCommand {
  const signedSpeed = signedDirectionSpeed(config.clawSpeedRaw, direction === "open" ? "positive" : "negative", config.clawReverse);
  return buildMachineClawSpeedCommand(nextSeq(), MACHINE_CLAW_SERVO_IDS.claw, signedSpeed, config.acc, true);
}

export function buildMachineClawStopCommands(nextSeq: () => number, ids: readonly number[] = MACHINE_CLAW_SERVO_ID_LIST): PcCommand[] {
  return ids.map((id) => buildMachineClawSpeedCommand(nextSeq(), id, 0, DEFAULT_MACHINE_CLAW_TEST_CONFIG.acc, false));
}

export function buildMachineClawReadCommand(seq: number, id: number = MACHINE_CLAW_SERVO_IDS.claw): PcCommand {
  return {
    type: "servo.read",
    seq,
    id
  };
}

export function machineClawFeedbackPositionRaw(response: InboundMessage | null | undefined, id = MACHINE_CLAW_SERVO_IDS.claw): number | null {
  if (response?.type !== "servo.feedback" || response.id !== id || typeof response.positionRaw !== "number" || !Number.isFinite(response.positionRaw)) {
    return null;
  }
  return response.positionRaw;
}

export function nextMachineClawTurnProgress(
  previousRaw: number,
  currentRaw: number,
  speedRaw: number,
  progress: MachineClawTurnProgress
): MachineClawTurnProgress {
  const completedTurns = Math.min(
    progress.targetTurns,
    progress.completedTurns + calculateWheelTurnDelta(previousRaw, currentRaw, speedRaw)
  );
  return {
    completedTurns,
    targetTurns: progress.targetTurns,
    running: completedTurns < progress.targetTurns
  };
}

export function machineClawTargetTurns(config: MachineClawTestConfig, direction: MachineClawClawDirection): number {
  return direction === "open" ? config.openTurns : config.closeTurns;
}

export function machineClawActionKey(prefix: "pitch" | "rotation", direction: MachineClawDirection): MachineClawRunAction {
  return `${prefix}-${direction}`;
}

export function machineClawClawActionKey(direction: MachineClawClawDirection): MachineClawRunAction {
  return direction === "open" ? "claw-open" : "claw-close";
}

function buildMachineClawSpeedCommand(seq: number, id: number, speedRaw: number, acc: number, setupWheelMode: boolean): PcCommand {
  return {
    type: "servo.speed",
    seq,
    setupWheelMode,
    targets: [
      {
        id,
        speedRaw,
        acc
      }
    ]
  };
}

function signedDirectionSpeed(speedRaw: number, direction: MachineClawDirection, reverse: boolean) {
  const magnitude = normalizeWheelSpeed(speedRaw, 0);
  const sign = direction === "positive" ? 1 : -1;
  return magnitude * (reverse ? -sign : sign);
}

function normalizeWheelSpeed(value: unknown, fallback: number): number {
  return normalizeInteger(value, fallback, 0, DEFAULT_WHEEL_SPEED_LIMIT);
}

function normalizeTurns(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(clamp(numeric, MACHINE_CLAW_MIN_TURNS, MACHINE_CLAW_MAX_TURNS) * 100) / 100;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.round(clamp(numeric, min, max));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
