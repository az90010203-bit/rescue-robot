import type { MutableRefObject } from "react";
import type { WebSerialClient } from "../lib/serial";
import {
  MOTOR_DIRECTION_DEADTIME_MS,
  buildDebugSetCommand,
  buildMotorStopCommand,
  isMotorDebugDisabledError,
  isMotorPcCommand,
  normalizeMotorChannel,
  requiresMotorDirectionDeadtime,
  withCommandSeq,
  type InboundMessage,
  type PcCommand
} from "../lib/protocol";
import type { PlatformEventBus } from "../platform/events";
import { debugModuleFor, type ActiveModule, type ConnectionMode, type LogEntry, type LogValues, type MotorDebugHandshakeStatus, type MotorErrorDisplay, type PendingCommandResponse, type PendingDebugSet } from "./appModel";

interface UseMotorSerialRuntimeOptions {
  addErrorLog: (error: unknown, fallbackKey: string) => void;
  addLog: (direction: LogEntry["direction"], text: string, level?: LogEntry["level"]) => void;
  addSystemLog: (messageKey: string, level?: LogEntry["level"], values?: LogValues) => void;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  lastMotorSpeedByChannelRef: MutableRefObject<Record<string, number>>;
  motorDebugHandshakePromiseRef: MutableRefObject<Promise<boolean> | null>;
  motorDebugHandshakeStatusRef: MutableRefObject<MotorDebugHandshakeStatus>;
  motorSerialQueueRef: MutableRefObject<Promise<unknown>>;
  motors: Array<{ channel: string }>;
  nextSeq: () => number;
  pendingCommandResponseBySeqRef: MutableRefObject<Map<number, PendingCommandResponse>>;
  pendingDebugSetBySeqRef: MutableRefObject<Map<number, PendingDebugSet>>;
  platformEventBusRef: MutableRefObject<PlatformEventBus>;
  serialRef: MutableRefObject<WebSerialClient | null>;
  setDebugEnabled: (enabled: boolean) => void;
  setLastMotorError: (error: MotorErrorDisplay | null) => void;
  setMotorDebugHandshakeStatusState: (status: MotorDebugHandshakeStatus) => void;
}

type MotorSerialWriteOptions = { log?: boolean };
type MotorSerialBatchOptions = MotorSerialWriteOptions & { shouldRun?: () => boolean };
type MotorSerialCommandOptions = MotorSerialWriteOptions & { retryCount?: number };

function sleepMs(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useMotorSerialRuntime({
  addErrorLog,
  addLog,
  addSystemLog,
  connected,
  connectionMode,
  lastMotorSpeedByChannelRef,
  motorDebugHandshakePromiseRef,
  motorDebugHandshakeStatusRef,
  motorSerialQueueRef,
  motors,
  nextSeq,
  pendingCommandResponseBySeqRef,
  pendingDebugSetBySeqRef,
  platformEventBusRef,
  serialRef,
  setDebugEnabled,
  setLastMotorError,
  setMotorDebugHandshakeStatusState
}: UseMotorSerialRuntimeOptions) {
  function controllerSerialClient(options: MotorSerialWriteOptions = {}): WebSerialClient | null {
    if (!serialRef.current || !connected) {
      if (options.log !== false) {
        addSystemLog("logs.serialDisconnected", "warn");
      }
      return null;
    }
    if (connectionMode === "servo-bus") {
      if (options.log !== false) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return null;
    }
    return serialRef.current;
  }

  async function send(value: unknown, options: MotorSerialWriteOptions = {}) {
    const client = controllerSerialClient(options);
    if (!client) {
      return false;
    }

    try {
      await client.sendJson(value);
      if (options.log !== false) {
        addLog("tx", JSON.stringify(value));
      }
      return true;
    } catch (error) {
      addErrorLog(error, "logs.serialDisconnected");
      return false;
    }
  }

  function setMotorDebugHandshakeStatus(status: MotorDebugHandshakeStatus) {
    motorDebugHandshakeStatusRef.current = status;
    setMotorDebugHandshakeStatusState(status);
  }

  function clearPendingCommandResponses() {
    for (const pending of pendingCommandResponseBySeqRef.current.values()) {
      window.clearTimeout(pending.timer);
      pending.resolve(null);
    }
    pendingCommandResponseBySeqRef.current.clear();
  }

  function resetMotorDebugHandshake(clearError = true) {
    motorDebugHandshakePromiseRef.current = null;
    pendingDebugSetBySeqRef.current.clear();
    clearPendingCommandResponses();
    motorSerialQueueRef.current = Promise.resolve();
    setMotorDebugHandshakeStatus("unknown");
    if (clearError) {
      setLastMotorError(null);
    }
  }

  function handleMotorFirmwareReadyLog() {
    motorDebugHandshakePromiseRef.current = null;
    setMotorDebugHandshakeStatus("unknown");
  }

  function resolvePendingCommandResponse(message: InboundMessage) {
    const pending = pendingCommandResponseBySeqRef.current.get(message.seq ?? -1);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timer);
    pendingCommandResponseBySeqRef.current.delete(message.seq ?? -1);
    pending.resolve(message);
  }

  function waitForCommandResponse(command: PcCommand, timeoutMs = 900) {
    return new Promise<InboundMessage | null>((resolve) => {
      const timer = window.setTimeout(() => {
        pendingCommandResponseBySeqRef.current.delete(command.seq);
        resolve(null);
      }, timeoutMs);
      pendingCommandResponseBySeqRef.current.set(command.seq, {
        command: command.type,
        resolve,
        timer
      });
    });
  }

  function clearPendingCommandResponse(command: PcCommand) {
    const pending = pendingCommandResponseBySeqRef.current.get(command.seq);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timer);
    pendingCommandResponseBySeqRef.current.delete(command.seq);
  }

  async function writeCommandAndWait(command: PcCommand, options: MotorSerialWriteOptions = {}) {
    const client = controllerSerialClient(options);
    if (!client) {
      return null;
    }

    const responsePromise = waitForCommandResponse(command);
    try {
      await client.sendJson(command);
      if (options.log !== false) {
        addLog("tx", JSON.stringify(command));
      }
    } catch (error) {
      clearPendingCommandResponse(command);
      addErrorLog(error, "logs.serialDisconnected");
      return null;
    }

    const response = await responsePromise;
    if (!response && options.log !== false) {
      addSystemLog("logs.motorCommandTimeout", "warn", { command: command.type });
    }
    return response;
  }

  async function writeCommandsAndWait(commands: PcCommand[], options: MotorSerialWriteOptions = {}) {
    const client = controllerSerialClient(options);
    if (!client) {
      return commands.map(() => null);
    }

    const responsePromises = commands.map((command) => waitForCommandResponse(command));
    try {
      for (const command of commands) {
        await client.sendJson(command);
        if (options.log !== false) {
          addLog("tx", JSON.stringify(command));
        }
      }
    } catch (error) {
      for (const command of commands) {
        clearPendingCommandResponse(command);
      }
      addErrorLog(error, "logs.serialDisconnected");
      return commands.map(() => null);
    }

    const responses = await Promise.all(responsePromises);
    if (options.log !== false) {
      for (const [index, response] of responses.entries()) {
        if (!response) {
          addSystemLog("logs.motorCommandTimeout", "warn", { command: commands[index].type });
        }
      }
    }
    return responses;
  }

  function enqueueMotorSerialTask<T>(task: () => Promise<T>): Promise<T> {
    const run = motorSerialQueueRef.current.then(task, task);
    motorSerialQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function writeDebugSetToClient(client: WebSerialClient, module: ActiveModule, enabled: boolean, options: MotorSerialWriteOptions = {}) {
    const debugModule = debugModuleFor(module);
    const command = buildDebugSetCommand(nextSeq(), debugModule, enabled);
    pendingDebugSetBySeqRef.current.set(command.seq, { module: debugModule, enabled });

    if (debugModule === "motor") {
      setMotorDebugHandshakeStatus(enabled ? "syncing" : "unknown");
      if (enabled) {
        setLastMotorError(null);
      }
    }

    const responsePromise = waitForCommandResponse(command);
    try {
      await client.sendJson(command);
      if (options.log !== false) {
        addLog("tx", JSON.stringify(command));
      }
    } catch (error) {
      const pending = pendingCommandResponseBySeqRef.current.get(command.seq);
      if (pending) {
        window.clearTimeout(pending.timer);
        pendingCommandResponseBySeqRef.current.delete(command.seq);
      }
      pendingDebugSetBySeqRef.current.delete(command.seq);
      if (debugModule === "motor" && enabled) {
        setMotorDebugHandshakeStatus("error");
      }
      addErrorLog(error, "logs.serialDisconnected");
      return false;
    }

    const response = await responsePromise;
    return response?.type === "ack";
  }

  async function sendDebugSet(module: ActiveModule, enabled: boolean, options: MotorSerialWriteOptions = {}) {
    const client = controllerSerialClient(options);
    if (!client) {
      return false;
    }
    if (debugModuleFor(module) === "motor") {
      return enqueueMotorSerialTask(() => writeDebugSetToClient(client, module, enabled, options));
    }
    return writeDebugSetToClient(client, module, enabled, options);
  }

  async function ensureMotorDebugModeUnlocked(options: MotorSerialWriteOptions = {}) {
    const client = controllerSerialClient(options);
    if (!client) {
      return false;
    }
    if (motorDebugHandshakeStatusRef.current === "ready") {
      return true;
    }
    if (motorDebugHandshakeStatusRef.current === "syncing") {
      return motorDebugHandshakePromiseRef.current ? motorDebugHandshakePromiseRef.current : true;
    }

    setDebugEnabled(true);
    const promise = writeDebugSetToClient(client, "motor", true, options).finally(() => {
      motorDebugHandshakePromiseRef.current = null;
    });
    motorDebugHandshakePromiseRef.current = promise;
    return promise;
  }

  function rememberMotorCommandSuccess(command: PcCommand) {
    if (command.type === "motor.set" && typeof command.channel === "string" && typeof command.speedPercent === "number") {
      lastMotorSpeedByChannelRef.current[normalizeMotorChannel(command.channel)] = command.speedPercent;
      return;
    }
    if (command.type === "motor.stop") {
      if (command.all) {
        for (const motor of motors) {
          lastMotorSpeedByChannelRef.current[normalizeMotorChannel(motor.channel)] = 0;
        }
      } else if (typeof command.channel === "string") {
        lastMotorSpeedByChannelRef.current[normalizeMotorChannel(command.channel)] = 0;
      }
    }
  }

  async function sendMotorCommandFrameUnlocked(command: PcCommand, options: MotorSerialWriteOptions = {}, retryCount = 0): Promise<boolean> {
    const response = await writeCommandAndWait(command, options);
    if (!response) {
      return false;
    }
    if (isMotorDebugDisabledError(response) && retryCount < 1) {
      if (options.log !== false) {
        addSystemLog("logs.motorDebugAutoRecover", "warn");
      }
      setMotorDebugHandshakeStatus("unknown");
      const ready = await ensureMotorDebugModeUnlocked(options);
      if (!ready) {
        setMotorDebugHandshakeStatus("error");
        return false;
      }
      return sendMotorCommandFrameUnlocked(withCommandSeq(command, nextSeq()), options, retryCount + 1);
    }
    if (response.type === "error") {
      recordMotorError(response);
      if (isMotorDebugDisabledError(response)) {
        setMotorDebugHandshakeStatus("error");
        addSystemLog("logs.motorDebugRetryFailed", "error");
      }
      return false;
    }

    rememberMotorCommandSuccess(command);
    return true;
  }

  async function sendMotorCommandFramesUnlocked(commands: PcCommand[], options: MotorSerialWriteOptions = {}, retryCount = 0): Promise<number> {
    if (commands.length === 0) {
      return 0;
    }

    const responses = await writeCommandsAndWait(commands, options);
    if (responses.every((response) => response === null)) {
      return 0;
    }

    if (responses.some((response) => response !== null && isMotorDebugDisabledError(response)) && retryCount < 1) {
      if (options.log !== false) {
        addSystemLog("logs.motorDebugAutoRecover", "warn");
      }
      setMotorDebugHandshakeStatus("unknown");
      const ready = await ensureMotorDebugModeUnlocked(options);
      if (!ready) {
        setMotorDebugHandshakeStatus("error");
        return 0;
      }
      return sendMotorCommandFramesUnlocked(
        commands.map((command) => withCommandSeq(command, nextSeq())),
        options,
        retryCount + 1
      );
    }

    let sentCount = 0;
    for (const [index, response] of responses.entries()) {
      if (!response) {
        continue;
      }
      if (response.type === "error") {
        recordMotorError(response);
        if (isMotorDebugDisabledError(response)) {
          setMotorDebugHandshakeStatus("error");
          addSystemLog("logs.motorDebugRetryFailed", "error");
        }
        continue;
      }

      rememberMotorCommandSuccess(commands[index]);
      sentCount += 1;
    }
    return sentCount;
  }

  function motorSetDirectionChange(command: PcCommand) {
    if (command.type !== "motor.set" || typeof command.channel !== "string" || typeof command.speedPercent !== "number") {
      return null;
    }

    const channel = normalizeMotorChannel(command.channel);
    const previousSpeed = lastMotorSpeedByChannelRef.current[channel];
    return requiresMotorDirectionDeadtime(previousSpeed, command.speedPercent)
      ? { channel, previousSpeed: previousSpeed ?? 0, nextSpeed: command.speedPercent }
      : null;
  }

  async function sendMotorCommandBatchUnlocked(commands: PcCommand[], options: MotorSerialBatchOptions = {}) {
    const motorCommands = commands.filter(isMotorPcCommand);
    if (motorCommands.length === 0) {
      return false;
    }
    if (options.shouldRun && !options.shouldRun()) {
      return false;
    }

    const ready = await ensureMotorDebugModeUnlocked(options);
    if (!ready) {
      return false;
    }
    if (options.shouldRun && !options.shouldRun()) {
      return false;
    }

    const directionChanges: Array<{ command: PcCommand; change: { channel: string; previousSpeed: number; nextSpeed: number } }> = [];
    for (const command of motorCommands) {
      const change = motorSetDirectionChange(command);
      if (change) {
        directionChanges.push({ command, change });
      }
    }

    if (directionChanges.length > 0) {
      const stopCommands: PcCommand[] = [];
      for (const { change } of directionChanges) {
        if (options.shouldRun && !options.shouldRun()) {
          return false;
        }
        if (options.log !== false) {
          addSystemLog("logs.motorDirectionDeadtime", "info", { channel: change.channel });
        }
        stopCommands.push(buildMotorStopCommand(nextSeq(), { channel: change.channel, stopMode: "coast" }));
      }
      const stoppedCount = await sendMotorCommandFramesUnlocked(stopCommands, options);
      if (stoppedCount < stopCommands.length) {
        return false;
      }
      await sleepMs(MOTOR_DIRECTION_DEADTIME_MS);
      if (options.shouldRun && !options.shouldRun()) {
        return false;
      }
    }

    if (options.shouldRun && !options.shouldRun()) {
      return false;
    }
    const sentCount = await sendMotorCommandFramesUnlocked(motorCommands, options);
    return sentCount > 0;
  }

  async function sendMotorCommandBatch(commands: PcCommand[], options: MotorSerialBatchOptions = {}) {
    return enqueueMotorSerialTask(() => sendMotorCommandBatchUnlocked(commands, options));
  }

  async function sendMotorCommand(command: PcCommand, options: MotorSerialCommandOptions = {}) {
    if (!isMotorPcCommand(command)) {
      return send(command, options);
    }
    setLastMotorError(null);
    return sendMotorCommandBatch([command], options);
  }

  function recordMotorError(message: InboundMessage & { type: "error" }) {
    setLastMotorError({
      command: message.command,
      code: message.code,
      message: message.message
    });
  }

  function handleAckMessage(message: InboundMessage & { type: "ack" }) {
    resolvePendingCommandResponse(message);
    const pendingDebugSet = pendingDebugSetBySeqRef.current.get(message.seq);
    if (pendingDebugSet) {
      pendingDebugSetBySeqRef.current.delete(message.seq);
      if (pendingDebugSet.module === "motor") {
        setMotorDebugHandshakeStatus(pendingDebugSet.enabled ? "ready" : "unknown");
        if (pendingDebugSet.enabled) {
          setLastMotorError(null);
        }
      }
    }

    if (message.command?.startsWith("motor.")) {
      setLastMotorError(null);
    }
  }

  function handleErrorMessage(message: InboundMessage & { type: "error" }) {
    resolvePendingCommandResponse(message);
    platformEventBusRef.current.emit({
      type: "command.error",
      level: "error",
      source: message.command ?? "controller",
      payload: { ...message }
    });
    const pendingDebugSet = pendingDebugSetBySeqRef.current.get(message.seq);
    if (pendingDebugSet) {
      pendingDebugSetBySeqRef.current.delete(message.seq);
      if (pendingDebugSet.module === "motor" && pendingDebugSet.enabled) {
        setMotorDebugHandshakeStatus("error");
        recordMotorError(message);
      }
      return;
    }

    if (isMotorDebugDisabledError(message)) {
      recordMotorError(message);
      setMotorDebugHandshakeStatus("unknown");
      return;
    }

    if (message.command?.startsWith("motor.")) {
      recordMotorError(message);
    }
  }

  return {
    enqueueMotorSerialTask,
    handleAckMessage,
    handleErrorMessage,
    handleMotorFirmwareReadyLog,
    resetMotorDebugHandshake,
    resolvePendingCommandResponse,
    send,
    sendDebugSet,
    sendMotorCommand,
    sendMotorCommandBatch,
    sendMotorCommandBatchUnlocked,
    sendMotorCommandFrameUnlocked,
    sendMotorCommandFramesUnlocked,
    setMotorDebugHandshakeStatus,
    writeDebugSetToClient
  };
}
