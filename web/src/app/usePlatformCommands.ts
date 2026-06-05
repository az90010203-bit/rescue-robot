import { MutableRefObject } from "react";
import { ServoProfile, MotorStopMode, PcCommand, applyServoWheelDirection, buildMotorConfigCommand, buildMotorSetCommand, buildMotorStopCommand, buildPingFrame, buildReadFeedbackFrame, buildTorqueFrame, parseServoFeedback, servoLogicalToPhysicalAngle } from "../lib/protocol";
import { PlatformCommand, PlatformCommandResult, platformCommandEventType, validatePlatformCommand } from "../platform/commands";
import { PlatformEventBus } from "../platform/events";
import { InboundMessage } from "../lib/protocol";

interface UsePlatformCommandsOptions {
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  nextSeq: () => number;
  platformEventBusRef: MutableRefObject<PlatformEventBus>;
  rememberServoFeedback: (feedback: InboundMessage & { type: "servo.feedback" }) => void;
  sendMotorCommand: (command: PcCommand, options?: { log?: boolean; retryCount?: number }) => Promise<boolean>;
  sendServoFrames: (frames: number[] | number[][], timeoutMs?: number) => Promise<ReturnType<typeof parseServoFeedback> extends never ? never : any>;
  servos: ServoProfile[];
  writeServoPositionUnlocked: (options: {
    acc: number | undefined;
    logFrame: boolean;
    physicalAngleDeg: number;
    servo: ServoProfile;
    speedRaw: number;
    waitMs: number;
  }) => Promise<unknown>;
  writeServoWheelSpeedUnlocked: (options: {
    acc: number | undefined;
    logFrame: boolean;
    servo: ServoProfile;
    setupMode: boolean;
    speedRaw: number;
    waitMs: number;
  }) => Promise<unknown>;
}

export function usePlatformCommands({
  enqueueServoSerialTask,
  nextSeq,
  platformEventBusRef,
  rememberServoFeedback,
  sendMotorCommand,
  sendServoFrames,
  servos,
  writeServoPositionUnlocked,
  writeServoWheelSpeedUnlocked
}: UsePlatformCommandsOptions) {
  function emitPlatformCommandResult(command: PlatformCommand, result: PlatformCommandResult) {
    platformEventBusRef.current.emit({
      type: platformCommandEventType(result.status),
      level: result.status === "sent" ? "info" : result.status === "skipped" || result.status === "timeout" ? "warn" : "error",
      source: command.targetDeviceId,
      payload: {
        commandId: command.id,
        commandType: command.type,
        status: result.status,
        message: result.message ?? null
      }
    });
  }

  function servoForPlatformCommand(command: PlatformCommand): ServoProfile | null {
    const servoId = Number(command.targetDeviceId.replace("servo:", ""));
    return servos.find((servo) => servo.id === servoId) ?? null;
  }

  async function dispatchPlatformCommand(command: PlatformCommand): Promise<PlatformCommandResult> {
    const validationError = validatePlatformCommand(command);
    if (validationError) {
      const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: "failed", message: validationError };
      emitPlatformCommandResult(command, result);
      return result;
    }

    try {
      if (command.type === "servo.ping") {
        const servoId = Number(command.targetDeviceId.replace("servo:", ""));
        const packet = await sendServoFrames(buildPingFrame(servoId), 140);
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: packet ? "sent" : "timeout", response: packet ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }

      if (command.type === "servo.read_feedback") {
        const servoId = Number(command.targetDeviceId.replace("servo:", ""));
        const packet = await sendServoFrames(buildReadFeedbackFrame(servoId), 180);
        if (packet?.status === 0) {
          rememberServoFeedback(parseServoFeedback(packet));
        }
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: packet ? "sent" : "timeout", response: packet ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }

      if (command.type === "servo.set_torque") {
        const servoId = Number(command.targetDeviceId.replace("servo:", ""));
        const packet = await sendServoFrames(buildTorqueFrame(servoId, Boolean(command.payload.enabled)));
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: packet ? "sent" : "timeout", response: packet ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }

      if (command.type === "servo.set_position") {
        const servoId = Number(command.targetDeviceId.replace("servo:", ""));
        const servo = servoForPlatformCommand(command);
        if (!servo) {
          const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: "failed", message: `servo ${servoId} is not configured` };
          emitPlatformCommandResult(command, result);
          return result;
        }
        const sent = await enqueueServoSerialTask(() =>
          writeServoPositionUnlocked({
            servo,
            physicalAngleDeg: servoLogicalToPhysicalAngle(servo, Number(command.payload.angleDeg)),
            speedRaw: Number(command.payload.speedRaw),
            acc: typeof command.payload.acc === "number" ? command.payload.acc : undefined,
            waitMs: 80,
            logFrame: true
          })
        );
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: sent ? "sent" : "timeout", response: sent ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }

      if (command.type === "servo.set_speed") {
        const servoId = Number(command.targetDeviceId.replace("servo:", ""));
        const servo = servoForPlatformCommand(command);
        if (!servo) {
          const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: "failed", message: `servo ${servoId} is not configured` };
          emitPlatformCommandResult(command, result);
          return result;
        }
        const sent = await enqueueServoSerialTask(() =>
          writeServoWheelSpeedUnlocked({
            servo,
            speedRaw: applyServoWheelDirection(servo, Number(command.payload.speedRaw)),
            acc: typeof command.payload.acc === "number" ? command.payload.acc : undefined,
            setupMode: true,
            waitMs: 60,
            logFrame: true
          })
        );
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: sent ? "sent" : "timeout", response: sent ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }

      const channel = command.targetDeviceId.replace("motor:", "");
      if (command.type === "motor.set_speed") {
        const response = await sendMotorCommand(buildMotorSetCommand(nextSeq(), { channel, speedPercent: Number(command.payload.speedPercent), stopMode: command.payload.stopMode as MotorStopMode | undefined }));
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: response ? "sent" : "timeout", response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.stop") {
        const response = await sendMotorCommand(buildMotorStopCommand(nextSeq(), { channel, stopMode: command.payload.stopMode as MotorStopMode | undefined }));
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: response ? "sent" : "timeout", response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.read_feedback") {
        const response = await sendMotorCommand({ type: "motor.read", seq: nextSeq(), channel });
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: response ? "sent" : "timeout", response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.configure") {
        const response = await sendMotorCommand(buildMotorConfigCommand(nextSeq(), {
          channel,
          driver: "tb6618",
          pwmPin: String(command.payload.pwmPin),
          in1Pin: String(command.payload.in1Pin),
          in2Pin: String(command.payload.in2Pin),
          enablePin: typeof command.payload.enablePin === "string" ? command.payload.enablePin : undefined,
          sensorPin: typeof command.payload.sensorPin === "string" ? command.payload.sensorPin : undefined
        }));
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: response ? "sent" : "timeout", response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
    } catch (error) {
      const result: PlatformCommandResult = {
        commandId: command.id,
        deviceId: command.targetDeviceId,
        status: "failed",
        message: error instanceof Error && error.message ? error.message : "platform command failed"
      };
      emitPlatformCommandResult(command, result);
      return result;
    }

    return { commandId: command.id, deviceId: command.targetDeviceId, status: "skipped", message: "platform command was not handled" };
  }

  return { dispatchPlatformCommand, emitPlatformCommandResult };
}
