import { MutableRefObject } from "react";
import { FeetechStatusPacket, ServoProfile, MotorStopMode, PcCommand, TORQUE_ENABLE_ADDR, applyServoWheelDirection, buildEepromLockFrame, buildMotorConfigCommand, buildMotorSetCommand, buildMotorStopCommand, buildPingFrame, buildReadFeedbackFrame, buildReadRegisterFrame, buildServoIdWriteFrame, buildTorqueFrame, parseServoFeedback, servoLogicalToPhysicalAngle, toHex, type ServoTarget } from "@adapters/hardware/protocol";
import { PlatformCommand, PlatformCommandResult, platformCommandEventType, validatePlatformCommand } from "@platform/commands";
import { PlatformEventBus } from "@platform/events";
import { InboundMessage } from "@adapters/hardware/protocol";

interface UsePlatformCommandsOptions {
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  nextSeq: () => number;
  platformEventBusRef: MutableRefObject<PlatformEventBus>;
  rememberServoFeedback: (feedback: InboundMessage & { type: "servo.feedback" }) => void;
  sendAboardCommand: (command: PcCommand, options?: { log?: boolean; timeoutMs?: number; exclusive?: boolean }) => Promise<{ ok?: boolean; busy?: boolean; messages?: InboundMessage[] } | null>;
  sendServoCommand?: (command: PcCommand, waitMs?: number, logCommand?: boolean) => Promise<InboundMessage | null>;
  sendServoFrames: (frames: number[] | number[][], timeoutMs?: number) => Promise<ReturnType<typeof parseServoFeedback> extends never ? never : any>;
  sendServoFrameUnlocked: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<FeetechStatusPacket | null>;
  servos: ServoProfile[];
  writeServoPositionUnlocked: (options: {
    acc: number | undefined;
    live?: boolean;
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
  sendAboardCommand,
  sendServoCommand,
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

  async function sendServoMovePcCommand(pcCommand: PcCommand): Promise<{ status: PlatformCommandResult["status"]; response?: unknown; message?: string }> {
    if (sendServoCommand) {
      const bridgeResponse = await sendServoCommand(pcCommand, 240, true);
      const bridgeStatus = servoResponseStatus(bridgeResponse);
      if (bridgeStatus === "sent") {
        return { status: "sent", response: bridgeResponse ?? undefined };
      }
      if (bridgeResponse?.type === "error") {
        return { status: "failed", response: bridgeResponse, message: bridgeResponse.message };
      }
    }

    const targets = servoMoveTargetsFromCommand(pcCommand);
    const sent = await enqueueServoSerialTask(async () => {
      const results: unknown[] = [];
      for (const target of targets) {
        const servo = servos.find((item) => item.id === target.id);
        if (!servo) {
          throw new Error(`servo ${target.id} is not configured`);
        }
        results.push(await writeServoPositionUnlocked({
          servo,
          physicalAngleDeg: servoLogicalToPhysicalAngle(servo, target.angleDeg),
          speedRaw: target.speedRaw,
          acc: target.acc,
          waitMs: 60,
          logFrame: true
        }));
      }
      return results;
    });
    return sent.every(Boolean)
      ? { status: "sent", response: sent }
      : { status: "timeout", response: sent, message: "servo preset move timed out" };
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
        if (sendServoCommand) {
          const response = await sendServoCommand({ type: "servo.ping", seq: nextSeq(), id: servoId }, 140, true);
          const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: servoResponseStatus(response), response: response ?? undefined };
          emitPlatformCommandResult(command, result);
          return result;
        }
        const packet = await sendServoFrames(buildPingFrame(servoId), 140);
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: packet ? "sent" : "timeout", response: packet ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }

      if (command.type === "servo.read_feedback") {
        const servoId = Number(command.targetDeviceId.replace("servo:", ""));
        if (sendServoCommand) {
          const response = await sendServoCommand({ type: "servo.read", seq: nextSeq(), id: servoId }, 180, true);
          if (response?.type === "servo.feedback") {
            rememberServoFeedback(response);
          }
          const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: servoResponseStatus(response), response: response ?? undefined };
          emitPlatformCommandResult(command, result);
          return result;
        }
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
        if (sendServoCommand) {
          const response = await sendServoCommand({ type: "servo.torque", seq: nextSeq(), id: servoId, enabled: Boolean(command.payload.enabled) }, 180, true);
          const status = servoResponseStatus(response);
          const result: PlatformCommandResult = {
            commandId: command.id,
            deviceId: command.targetDeviceId,
            status,
            message: status === "sent" ? `ID${servoId} torque=${expected}` : `ID${servoId} torque command failed`,
            response: response ?? undefined
          };
          emitPlatformCommandResult(command, result);
          return result;
        }
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
        if (sendServoCommand) {
          const response = await sendServoCommand({ type: "servo.set_id", seq: nextSeq(), oldId, newId }, 800, true);
          const status = servoResponseStatus(response);
          const result: PlatformCommandResult = {
            commandId: command.id,
            deviceId: command.targetDeviceId,
            status,
            message: status === "sent" ? `servo ID changed ${oldId} -> ${newId}` : `servo ID change failed ${oldId} -> ${newId}`,
            response: response ?? undefined
          };
          emitPlatformCommandResult(command, result);
          return result;
        }
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
            live: command.payload.live === true,
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

      if (command.type === "servo-preset.run") {
        const pcCommands = command.payload.pcCommands as PcCommand[];
        const responses: unknown[] = [];
        for (const pcCommand of pcCommands) {
          if (pcCommand.type === "servo.move") {
            const servoResult = await sendServoMovePcCommand(pcCommand);
            responses.push(servoResult.response);
            if (servoResult.status !== "sent") {
              const result: PlatformCommandResult = {
                commandId: command.id,
                deviceId: command.targetDeviceId,
                status: servoResult.status,
                message: servoResult.message,
                response: { pcCommands, responses }
              };
              emitPlatformCommandResult(command, result);
              return result;
            }
            continue;
          }
          if (pcCommand.type === "can_servo.config" || pcCommand.type === "can_servo.group_move") {
            const response = await sendAboardCommand(pcCommand, { log: command.payload.log !== false });
            responses.push(response);
            const status = aboardResponseStatus(pcCommand, response);
            if (status !== "sent") {
              const result: PlatformCommandResult = {
                commandId: command.id,
                deviceId: command.targetDeviceId,
                status,
                message: "servo preset CAN command was not accepted",
                response: { pcCommands, responses }
              };
              emitPlatformCommandResult(command, result);
              return result;
            }
          }
        }
        const result: PlatformCommandResult = {
          commandId: command.id,
          deviceId: command.targetDeviceId,
          status: "sent",
          response: { pcCommands, responses }
        };
        emitPlatformCommandResult(command, result);
        return result;
      }

      const channel = command.targetDeviceId.replace("motor:", "");
      if (command.type === "motor.set_speed") {
        const motorCommand = buildMotorSetCommand(nextSeq(), {
          channel,
          speedPercent: Number(command.payload.speedPercent),
          stopMode: command.payload.stopMode as MotorStopMode | undefined,
          closedLoop: typeof command.payload.closedLoop === "boolean" ? command.payload.closedLoop : undefined,
          targetRpm: typeof command.payload.targetRpm === "number" ? command.payload.targetRpm : undefined
        });
        const response = await sendAboardCommand(motorCommand);
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: aboardResponseStatus(motorCommand, response), response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.stop") {
        const motorCommand = buildMotorStopCommand(nextSeq(), { channel, stopMode: command.payload.stopMode as MotorStopMode | undefined });
        const response = await sendAboardCommand(motorCommand);
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: aboardResponseStatus(motorCommand, response), response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.read_feedback") {
        const motorCommand: PcCommand = { type: "motor.read", seq: nextSeq(), channel };
        const response = await sendAboardCommand(motorCommand);
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: aboardResponseStatus(motorCommand, response), response: response ?? undefined };
        emitPlatformCommandResult(command, result);
        return result;
      }
      if (command.type === "motor.configure") {
        const motorCommand = buildMotorConfigCommand(nextSeq(), {
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
        });
        const response = await sendAboardCommand(motorCommand);
        const result: PlatformCommandResult = { commandId: command.id, deviceId: command.targetDeviceId, status: aboardResponseStatus(motorCommand, response), response: response ?? undefined };
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

function servoResponseStatus(response: InboundMessage | null): PlatformCommandResult["status"] {
  if (!response) {
    return "timeout";
  }
  return response.type === "error" ? "failed" : "sent";
}

function aboardResponseStatus(command: PcCommand, response: { ok?: boolean; busy?: boolean; messages?: InboundMessage[] } | null): PlatformCommandResult["status"] {
  if (!response) {
    return "timeout";
  }
  if (response.messages?.some((message) => message.type === "error")) {
    return "failed";
  }
  if (response.busy) {
    return "timeout";
  }
  return response.ok || response.messages?.some((message) => message.seq === command.seq) ? "sent" : "timeout";
}

function servoMoveTargetsFromCommand(command: PcCommand): ServoTarget[] {
  const targets = Array.isArray(command.targets) ? command.targets : [];
  return targets.map((target) => {
    const item = target as Partial<ServoTarget>;
    return {
      id: Number(item.id),
      name: item.name,
      angleDeg: Number(item.angleDeg),
      speedRaw: Number(item.speedRaw),
      acc: typeof item.acc === "number" ? item.acc : undefined
    };
  });
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
