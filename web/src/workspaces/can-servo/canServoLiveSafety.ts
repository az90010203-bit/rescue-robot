import type { PcCommand } from "@adapters/hardware/protocol";
import {
  ASMG_MD_POSITION_STEPS_PER_TURN,
  type AsmgMdBaudKbps,
  type AsmgMdParsedFrame,
  buildAsmgMdCanConfigCommand,
  buildAsmgMdReadPositionCurrentCommand
} from "@adapters/hardware/asmgMdCanServo";

export const CAN_SERVO_LIVE_FEEDBACK_MAX_AGE_MS = 1500;
export const CAN_SERVO_STALL_CHECK_INTERVAL_MS = 200;
export const CAN_SERVO_STALL_GRACE_MS = 800;
export const CAN_SERVO_STALL_TARGET_DELTA_RAW = 256;
export const CAN_SERVO_STALL_PROGRESS_DELTA_RAW = 64;
export const CAN_SERVO_STALL_CURRENT_RAW = 120;
export const CAN_SERVO_STALL_FEEDBACK_LOSS_LIMIT = 3;

export interface CanServoLiveFeedback {
  servoId: number;
  position: number;
  current: number | null;
  atMs: number;
}

export type CanServoLiveStopReason = "none" | "stalled" | "feedback-lost";

export interface CanServoLiveTarget {
  targetPosition: number;
  commandAtMs: number;
  baselinePosition: number;
}

export interface CanServoLiveStopAssessment {
  reason: CanServoLiveStopReason;
  shouldStop: boolean;
}

export function buildCanServoLivePrimeCommands(
  nextSeq: () => number,
  options: { autoConfigure: boolean; bitrateKbps: AsmgMdBaudKbps; servoId: number }
): PcCommand[] {
  const commands: PcCommand[] = [];
  if (options.autoConfigure) {
    commands.push(buildAsmgMdCanConfigCommand(nextSeq(), options.bitrateKbps));
  }
  commands.push(buildAsmgMdReadPositionCurrentCommand(nextSeq(), options.servoId));
  return commands;
}

export function findLatestCanServoPositionCurrentFeedback(parsed: AsmgMdParsedFrame[], servoId: number, atMs: number): CanServoLiveFeedback | null {
  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    const frame = parsed[index];
    if (frame.kind !== "positionCurrent" || frame.servoId !== servoId || typeof frame.currentPosition !== "number") {
      continue;
    }
    return {
      servoId,
      position: frame.currentPosition,
      current: typeof frame.current === "number" ? frame.current : null,
      atMs
    };
  }
  return null;
}

export function isCanServoLiveFeedbackFresh(feedback: CanServoLiveFeedback | null, nowMs: number, maxAgeMs = CAN_SERVO_LIVE_FEEDBACK_MAX_AGE_MS): boolean {
  return feedback !== null && nowMs - feedback.atMs <= maxAgeMs;
}

export function normalizeCanServoStallCurrentThreshold(value: number, fallback = CAN_SERVO_STALL_CURRENT_RAW): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(0xffff, Math.max(0, Math.round(value)));
}

export function assessCanServoLiveStop(input: {
  protectionEnabled: boolean;
  target: CanServoLiveTarget | null;
  latestFeedback: CanServoLiveFeedback | null;
  lostFeedbackCount: number;
  nowMs: number;
  currentThreshold: number;
  graceMs?: number;
  targetDeltaRaw?: number;
  progressDeltaRaw?: number;
  feedbackLossLimit?: number;
}): CanServoLiveStopAssessment {
  if (!input.protectionEnabled || input.target === null) {
    return noLiveStop();
  }
  const feedbackLossLimit = input.feedbackLossLimit ?? CAN_SERVO_STALL_FEEDBACK_LOSS_LIMIT;
  if (input.lostFeedbackCount >= feedbackLossLimit) {
    return { shouldStop: true, reason: "feedback-lost" };
  }
  if (input.latestFeedback === null) {
    return noLiveStop();
  }
  const graceMs = input.graceMs ?? CAN_SERVO_STALL_GRACE_MS;
  if (input.nowMs - input.target.commandAtMs < graceMs) {
    return noLiveStop();
  }
  const targetDeltaRaw = input.targetDeltaRaw ?? CAN_SERVO_STALL_TARGET_DELTA_RAW;
  if (canServoCircularDistanceRaw(input.target.baselinePosition, input.target.targetPosition) <= targetDeltaRaw) {
    return noLiveStop();
  }
  const progressDeltaRaw = input.progressDeltaRaw ?? CAN_SERVO_STALL_PROGRESS_DELTA_RAW;
  if (canServoCircularDistanceRaw(input.target.baselinePosition, input.latestFeedback.position) >= progressDeltaRaw) {
    return noLiveStop();
  }
  if (input.latestFeedback.current === null || input.latestFeedback.current < input.currentThreshold) {
    return noLiveStop();
  }
  return { shouldStop: true, reason: "stalled" };
}

export function canServoCircularDistanceRaw(a: number, b: number): number {
  const rawDelta = Math.abs(Math.round(a) - Math.round(b)) % ASMG_MD_POSITION_STEPS_PER_TURN;
  return Math.min(rawDelta, ASMG_MD_POSITION_STEPS_PER_TURN - rawDelta);
}

function noLiveStop(): CanServoLiveStopAssessment {
  return { shouldStop: false, reason: "none" };
}
