import { calculateWheelTurnDelta, type InboundMessage } from "@adapters/hardware/protocol";
import type { MachineClawTestConfig } from "@domains/machine-claw/machineClaw";

export type MachineClawProtectionReason =
  | "current"
  | "feedback"
  | "load"
  | "stall"
  | "temperature"
  | "turnLimit";

export interface MachineClawProtectionTrip {
  detail: string;
  id: number;
  limit?: number;
  reason: MachineClawProtectionReason;
  value?: number;
}

export interface MachineClawProtectionServoRuntime {
  completedTurns: number;
  id: number;
  lastRawChangedAtMs: number;
  previousRaw: number;
  speedRaw: number;
  startedAtMs: number;
  targetTurns: number | null;
}

export interface MachineClawProtectionEvaluation {
  runtime: MachineClawProtectionServoRuntime;
  trip: MachineClawProtectionTrip | null;
}

export function createMachineClawProtectionServoRuntime(
  id: number,
  positionRaw: number,
  speedRaw: number,
  nowMs: number,
  targetTurns: number | null = null
): MachineClawProtectionServoRuntime {
  return {
    completedTurns: 0,
    id,
    lastRawChangedAtMs: nowMs,
    previousRaw: positionRaw,
    speedRaw,
    startedAtMs: nowMs,
    targetTurns
  };
}

export function evaluateMachineClawProtectionFeedback(
  runtime: MachineClawProtectionServoRuntime,
  feedback: InboundMessage | null | undefined,
  config: MachineClawTestConfig,
  nowMs: number
): MachineClawProtectionEvaluation {
  if (feedback?.type !== "servo.feedback" || feedback.id !== runtime.id) {
    return {
      runtime,
      trip: protectionTrip(runtime.id, "feedback", "missing feedback")
    };
  }

  const positionRaw = finiteNumber(feedback.positionRaw);
  if (positionRaw === null) {
    return {
      runtime,
      trip: protectionTrip(runtime.id, "feedback", "missing positionRaw")
    };
  }

  const rawDelta = Math.abs(positionRaw - runtime.previousRaw);
  const movedEnough = rawDelta >= config.protectionMinRawDelta;
  const measuredTurns = runtime.completedTurns + calculateWheelTurnDelta(runtime.previousRaw, positionRaw, runtime.speedRaw);
  const completedTurns = runtime.targetTurns === null ? measuredTurns : Math.min(runtime.targetTurns, measuredTurns);
  const nextRuntime: MachineClawProtectionServoRuntime = {
    ...runtime,
    completedTurns,
    lastRawChangedAtMs: movedEnough ? nowMs : runtime.lastRawChangedAtMs,
    previousRaw: positionRaw
  };

  if (nextRuntime.targetTurns !== null && nextRuntime.completedTurns >= nextRuntime.targetTurns) {
    return {
      runtime: nextRuntime,
      trip: protectionTrip(runtime.id, "turnLimit", `${nextRuntime.completedTurns.toFixed(2)} turns`, nextRuntime.completedTurns, nextRuntime.targetTurns)
    };
  }

  if (!config.protectionEnabled) {
    return { runtime: nextRuntime, trip: null };
  }

  const currentMa = finiteNumber(feedback.currentMa);
  if (currentMa !== null && currentMa >= config.protectionCurrentMa) {
    return {
      runtime: nextRuntime,
      trip: protectionTrip(runtime.id, "current", `${Math.round(currentMa)} mA`, currentMa, config.protectionCurrentMa)
    };
  }

  const loadPercent = finiteNumber(feedback.loadPercent);
  if (loadPercent !== null && Math.abs(loadPercent) >= config.protectionLoadPercent) {
    return {
      runtime: nextRuntime,
      trip: protectionTrip(runtime.id, "load", `${Math.round(Math.abs(loadPercent))}%`, Math.abs(loadPercent), config.protectionLoadPercent)
    };
  }

  const temperatureC = finiteNumber(feedback.temperatureC);
  if (temperatureC !== null && temperatureC >= config.protectionTemperatureC) {
    return {
      runtime: nextRuntime,
      trip: protectionTrip(runtime.id, "temperature", `${Math.round(temperatureC)} C`, temperatureC, config.protectionTemperatureC)
    };
  }

  const speedActive = Math.abs(runtime.speedRaw) > 0;
  const stallWindowMs = Math.max(0, config.protectionStallMs);
  const pastStartGrace = nowMs - runtime.startedAtMs >= stallWindowMs;
  const rawStayedStill = nowMs - nextRuntime.lastRawChangedAtMs >= stallWindowMs;
  if (speedActive && pastStartGrace && rawStayedStill) {
    return {
      runtime: nextRuntime,
      trip: protectionTrip(runtime.id, "stall", `${rawDelta.toFixed(0)} raw`, rawDelta, config.protectionMinRawDelta)
    };
  }

  return { runtime: nextRuntime, trip: null };
}

function protectionTrip(
  id: number,
  reason: MachineClawProtectionReason,
  detail: string,
  value?: number,
  limit?: number
): MachineClawProtectionTrip {
  return {
    detail,
    id,
    limit,
    reason,
    value
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
