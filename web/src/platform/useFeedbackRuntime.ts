import {
  normalizeMotorChannel,
  rawToAngleDeg,
  type InboundMessage
} from "@adapters/hardware/protocol";
import { isSerialClientError } from "@adapters/web-serial/serial";
import type { MotorFeedbackMap, ServoFeedbackMap } from "@app/appModel";

interface UseFeedbackRuntimeOptions {
  addLog: (source: "rx" | "tx" | "system", message: string, level?: any) => void;
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  lastServoPhysicalAngleRef: { current: Record<number, number> };
  lastServoWheelSpeedRef: { current: Record<number, number> };
  platformEventBusRef: { current: { emit: (event: any) => void } };
  queueTelemetry: (entry: { category: string; targetId: string; payload: Record<string, unknown> }) => void;
  setMotorFeedback: (updater: (current: MotorFeedbackMap) => MotorFeedbackMap) => void;
  setServoFeedback: (updater: (current: ServoFeedbackMap) => ServoFeedbackMap) => void;
}

export function useFeedbackRuntime({
  addLog,
  addSystemLog,
  lastServoPhysicalAngleRef,
  lastServoWheelSpeedRef,
  platformEventBusRef,
  queueTelemetry,
  setMotorFeedback,
  setServoFeedback
}: UseFeedbackRuntimeOptions) {
  function rememberServoFeedback(feedback: InboundMessage & { type: "servo.feedback" }) {
    setServoFeedback((current) => ({ ...current, [feedback.id]: feedback }));
    platformEventBusRef.current.emit({
      type: "servo.feedback",
      level: "info",
      source: `servo:${feedback.id}`,
      payload: { ...feedback }
    });
    if (feedback.positionRaw !== undefined) {
      lastServoPhysicalAngleRef.current[feedback.id] = rawToAngleDeg(feedback.positionRaw);
    }
    if (feedback.speedRaw !== undefined) {
      lastServoWheelSpeedRef.current[feedback.id] = feedback.speedRaw;
    }
    queueTelemetry({
      category: "servo",
      targetId: String(feedback.id),
      payload: feedback as unknown as Record<string, unknown>
    });
  }

  function rememberMotorFeedback(message: InboundMessage & { type: "motor.feedback" }) {
    const channel = normalizeMotorChannel(message.channel);
    setMotorFeedback((current) => ({ ...current, [channel]: message }));
    platformEventBusRef.current.emit({
      type: "motor.feedback",
      level: "info",
      source: `motor:${channel}`,
      payload: { ...message, channel }
    });
    queueTelemetry({
      category: "motor",
      targetId: channel,
      payload: { ...message, channel }
    });
  }

  function addErrorLog(error: unknown, fallbackKey: string) {
    if (isSerialClientError(error)) {
      addSystemLog(`serial.errors.${error.code}`, "error");
      return;
    }
    if (error instanceof Error && error.message) {
      addLog("system", error.message, "error");
      return;
    }
    addSystemLog(fallbackKey, "error");
  }

  return {
    addErrorLog,
    rememberMotorFeedback,
    rememberServoFeedback
  };
}
