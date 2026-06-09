import { MutableRefObject } from "react";
import { FeetechStatusPacket, ServoProfile, MotorStopMode, PcCommand, TORQUE_ENABLE_ADDR, applyServoWheelDirection, buildEepromLockFrame, buildMotorConfigCommand, buildMotorSetCommand, buildMotorStopCommand, buildPingFrame, buildReadFeedbackFrame, buildReadRegisterFrame, buildServoIdWriteFrame, buildTorqueFrame, parseServoFeedback, servoLogicalToPhysicalAngle, toHex } from "@adapters/hardware/protocol";
import { PlatformCommand, PlatformCommandResult, platformCommandEventType, validatePlatformCommand } from "@platform/commands";
import { PlatformEventBus } from "@platform/events";
import { InboundMessage } from "@adapters/hardware/protocol";

interface UsePlatformCommandsOptions {
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  nextSeq: () => number;
  platformEventBusRef: MutableRefObject<PlatformEventBus>;
  rememberServoFeedback: (feedback: InboundMessage & { type: "servo.feedback" }) => void;
  sendMotorCommand: (command: PcCommand, options?: { log?: boolean; retryCount?: number }) => Promise<boolean>;
  sendAboardBridgeMotorCommand?: (command: PcCommand, options?: { log?: boolean }) => Promise<boolean>;
  sendServoFrames: (frames: number[] | number[][], timeoutMs?: number) => Promise<ReturnType<typeof parseServoFeedback> extends never ? never : any>;
  sendServoFrameUnlocked: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<FeetechStatusPacket | null>;
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
  sendAboardBridgeMotorCommand,
  sendMotorCommand,
  sendServoFrameUnlocked,
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
        const expected = Boolean(command.payload.enabled) ? 1 : 0;
        const response = await enqueueServoSerialTask(async () => {
          const writePacket = await sendServoFrameUnlocked(buildTorqueFrame(servoId, Boolean(command.payload.enabled)), 120, true);
          let verifyPacket = await sendServoFrameUnlocked(buildReadRegisterFrame(servoId, TORQUE_ENABLE_ADDR, 1), 180, true);
          if (!torqueVerifyPacketHasValue(verifyPacket)) {
            await sleepMs(80);
            verifyPacket = await sendServoFrameUnlocked(buildReadRegisterFrame(servoId, TORQUE_ENABLE_ADDR, 1), 220, true);
          }
          const actual = verifyPacket?.params[0];
          return {
            actual,
            expected,
            ok: verifyPacket?.status === 0 && actual === expected,
            verifyPacket,
            writePacket
          };
        });
        const result: PlatformCommandResult = {
          commandId: command.id,
          deviceId: command.targetDeviceId,
          status: response.ok ? "sent" : response.verifyPacket ? "failed" : "timeout",
          message: response.ok
            ? `ID${servoId} torque=${response.actual}`
            : `ID${servoId} torque verify failed: expected ${expected}, got ${torqueVerifyValueLabel(response.verifyPacket, response.actual)}`,
          response
        };
        emitPlatformCommandResult(command, result);
        return result;
      }

      if (command.type === "servo.set_id") {
        const oldId = Number(command.targetDeviceId.replace("servo:", ""));
        const newId = Number(command.payload.newId);
        const response = await enqueueServoSerialTask(async () => {
          const steps: Array<{ label: string; tx: string; rx: string | null; status: number | null }> = [];
          async function sendStep(label: string, frame: number[], waitMs = 160) {
            const packet = await sendServoFrameUnlocked(frame, waitMs, true);
            steps.push({ label, tx: toHex(frame), rx: packet ? packetToHex(packet) : null, status: packet?.status ?? null });
            return packet;
          }

          const oldPing = await sendStep(`Ping old ID ${oldId}`, buildPingFrame(oldId), 180);
          if (!packetOk(oldPing)) {
            return { ok: false, oldId, newId, stage: "old-ping", steps };
          }

          const unlock = await sendStep(`Unlock EEPROM ID ${oldId}`, buildEepromLockFrame(oldId, false));
          if (unlock && unlock.status !== 0) {
            return { ok: false, oldId, newId, stage: "unlock", steps };
          }

          const write = await sendStep(`Write ID ${oldId} -> ${newId}`, buildServoIdWriteFrame(oldId, newId));
          if (write && write.status !== 0) {
            return { ok: false, oldId, newId, stage: "write-id", steps };
          }

          const lock = await sendStep(`Lock EEPROM ID ${newId}`, buildEepromLockFrame(newId, true));
          if (lock && lock.status !== 0) {
            return { ok: false, oldId, newId, stage: "lock", steps };
          }

          const newPing = await sendStep(`Ping new ID ${newId}`, buildPingFrame(newId), 220);
          return { ok: packetOk(newPing), oldId, newId, stage: packetOk(newPing) ? "complete" : "new-ping", steps };
        });
        const result: PlatformCommandResult = {
          commandId: command.id,
          deviceId: command.targetDeviceId,
          status: response.ok ? "sent" : response.stage === "old-ping" || response.stage === "new-ping" ? "timeout" : "failed",
          message: response.ok ? `servo ID changed ${oldId} -> ${newId}` : `servo ID change failed at ${response.stage}`,
          response
        };
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
      const sendSelectedMotorCommand = sendAboardBridgeMotorCommand ?? sendMotorCommand;
      if (command.type === "motor.set_speed") {
        const response = await sendSelectedMotorCommand(buildMotorSetCommand(nextSeq(), {
          channel,
          speedPercent: Number(command.payload.speedPercent),
          stopMode: command.payload.stopMode as MotorStopMode | undefined,
          closedLoop: typeof command.payload.closedLoop === "boolean" ? command.payload.closedLoop : undefined,
          targetRpm: typeof command.payload.targetRpm === "number" ? command.payload.targetRpm : undefined
        }));
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: response ? "sent" : "timeout", response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.stop") {
        const response = await sendSelectedMotorCommand(buildMotorStopCommand(nextSeq(), { channel, stopMode: command.payload.stopMode as MotorStopMode | undefined }));
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: response ? "sent" : "timeout", response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.read_feedback") {
        const response = await sendSelectedMotorCommand({ type: "motor.read", seq: nextSeq(), channel });
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: response ? "sent" : "timeout", response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.configure") {
        const response = await sendSelectedMotorCommand(buildMotorConfigCommand(nextSeq(), {
          channel,
          driver: "tb6618",
          pwmPin: String(command.payload.pwmPin),
          in1Pin: String(command.payload.in1Pin),
          in2Pin: String(command.payload.in2Pin),
          enablePin: typeof command.payload.enablePin === "string" ? command.payload.enablePin : undefined,
          sensorPin: typeof command.payload.sensorPin === "string" ? command.payload.sensorPin : undefined,
          encoderAPin: typeof command.payload.encoderAPin === "string" ? command.payload.encoderAPin : undefined,
          encoderBPin: typeof command.payload.encoderBPin === "string" ? command.payload.encoderBPin : undefined,
          closedLoop: typeof command.payload.closedLoop === "boolean" ? command.payload.closedLoop : undefined,
          maxRpm: typeof command.payload.maxRpm === "number" ? command.payload.maxRpm : undefined,
          encoderTicksPerRev: typeof command.payload.encoderTicksPerRev === "number" ? command.payload.encoderTicksPerRev : undefined
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

function packetOk(packet: FeetechStatusPacket | null): boolean {
  return Boolean(packet && packet.status === 0);
}

function torqueVerifyPacketHasValue(packet: FeetechStatusPacket | null): boolean {
  return Boolean(packet && packet.status === 0 && packet.params.length >= 1);
}

function torqueVerifyValueLabel(packet: FeetechStatusPacket | null, actual: number | undefined): string {
  if (!packet) {
    return "no response";
  }
  if (packet.status !== 0) {
    return `status ${packet.status}`;
  }
  return actual === undefined ? "no register value" : String(actual);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function packetToHex(packet: FeetechStatusPacket): string {
  return toHex([0xff, 0xff, packet.id, packet.params.length + 2, packet.status, ...packet.params, packet.checksum]);
}
