import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";
import { calculateImuAttitude, createDefaultImuCalibration, type ImuAttitude } from "@domains/drive/imuAttitude";
import type { AboardCommandResult } from "./bridgeClient";

export type LiteImuFeedback = Extract<InboundMessage, { type: "imu.feedback" }>;

export interface LiteImuSnapshot {
  attitude: ImuAttitude | null;
  feedback: LiteImuFeedback;
  receivedAtMs: number;
}

export function buildLiteImuReadCommand(seq: number): PcCommand {
  return { type: "imu.read", seq };
}

export function liteImuFeedbackFromResult(result: AboardCommandResult | null | undefined): LiteImuFeedback | null {
  if (!result) {
    return null;
  }
  for (let index = result.messages.length - 1; index >= 0; index -= 1) {
    const message = result.messages[index];
    if (message.type === "imu.feedback") {
      return message;
    }
  }
  return null;
}

export function createLiteImuSnapshot(feedback: LiteImuFeedback, receivedAtMs = Date.now()): LiteImuSnapshot {
  return {
    attitude: calculateImuAttitude(feedback, createDefaultImuCalibration(), receivedAtMs),
    feedback,
    receivedAtMs
  };
}
