import { useRef } from "react";
import {
  ACC_ADDR,
  FEEDBACK_READ_LENGTH,
  FEETECH_PING,
  FEETECH_READ,
  FEETECH_WRITE,
  GOAL_POSITION_ADDR,
  GOAL_SPEED_ADDR,
  MODE_ADDR,
  PRESENT_POSITION_ADDR,
  TORQUE_ENABLE_ADDR,
  decodeSigned15Bit,
  feetechChecksum,
  parseFeetechStatusPacket,
  rawToAngleDeg,
  toHex,
  type FeetechStatusPacket
} from "@adapters/hardware/protocol";
import type { WebSerialClient } from "@adapters/web-serial/serial";
import type { ConnectionMode } from "@app/appModel";
import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";

export interface ServoFrameSendOptions {
  ackDrainMs?: number;
  coalesceKey?: string;
  minIntervalMs?: number;
  policy?: "latest";
}

interface UseServoSerialTransportOptions {
  addErrorLog: (error: unknown, fallbackKey: string) => void;
  addLog: (source: "rx" | "tx" | "system", message: string, level?: any) => void;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  piServoBridgeConnected?: boolean;
  seqRef: { current: number };
  sendPiServoBridgeCommand?: (command: PcCommand, waitMs: number, options?: ServoFrameSendOptions) => Promise<InboundMessage | null>;
  serialRef: { current: WebSerialClient | null };
  servoSerialQueueRef: { current: Promise<void> };
}

export function useServoSerialTransport({
  addErrorLog,
  addLog,
  piServoBridgeConnected,
  seqRef,
  sendPiServoBridgeCommand,
  servoSerialQueueRef
}: UseServoSerialTransportOptions) {
  const servoSerialQueueDepthRef = useRef(0);
  const servoSerialInFlightRef = useRef(false);
  const pendingWheelSpeedAccByServoRef = useRef<Record<number, number>>({});

  function nextSeq() {
    return seqRef.current++;
  }

  function enqueueServoSerialTask<T>(task: () => Promise<T>): Promise<T> {
    servoSerialQueueDepthRef.current += 1;
    const runTask = async () => {
      servoSerialQueueDepthRef.current = Math.max(0, servoSerialQueueDepthRef.current - 1);
      servoSerialInFlightRef.current = true;
      try {
        return await task();
      } finally {
        servoSerialInFlightRef.current = false;
      }
    };
    const run = servoSerialQueueRef.current.then(runTask, runTask);
    servoSerialQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function getServoSerialQueueStatus() {
    return {
      queueDepth: servoSerialQueueDepthRef.current,
      inFlight: servoSerialInFlightRef.current
    };
  }

  async function sendServoFrameUnlocked(frame: number[], waitMs = 80, logFrame = true, options?: ServoFrameSendOptions) {
    if (piServoBridgeConnected && sendPiServoBridgeCommand) {
      const translated = legacyFrameToServoCommand(frame, nextSeq, pendingWheelSpeedAccByServoRef.current);
      if (translated?.packet) {
        if (logFrame) {
          addLog("tx", toHex(frame));
          addLog("rx", JSON.stringify({ type: "ack", seq: 0, command: "servo.acc" }));
        }
        return translated.packet;
      }
      if (translated?.command) {
        try {
          if (logFrame) {
            addLog("tx", toHex(frame));
          }
          const response = await sendPiServoBridgeCommand(translated.command, waitMs, options);
          if (response && logFrame) {
            addLog("rx", JSON.stringify(response));
          }
          return servoCommandResponseToPacket(frame, translated.command, response);
        } catch (error) {
          addErrorLog(error, "logs.serialDisconnected");
          return null;
        }
      }
    }

    addLog("system", "Pi servo bridge semantic command endpoint required", "warn");
    return null;
  }

  async function sendServoCommandUnlocked(command: PcCommand, waitMs = 80, logCommand = true, options?: ServoFrameSendOptions) {
    if (piServoBridgeConnected && sendPiServoBridgeCommand) {
      try {
        if (logCommand) {
          addLog("tx", JSON.stringify(command));
        }
        const response = await sendPiServoBridgeCommand(command, waitMs, options);
        if (response && logCommand) {
          addLog("rx", JSON.stringify(response));
        }
        return response;
      } catch (error) {
        addErrorLog(error, "logs.serialDisconnected");
        return null;
      }
    }

    addLog("system", "Pi servo bridge command endpoint required", "warn");
    return null;
  }

  async function sendServoCommand(command: PcCommand, waitMs = 80, logCommand = true, options?: ServoFrameSendOptions) {
    return enqueueServoSerialTask(() => sendServoCommandUnlocked(command, waitMs, logCommand, options));
  }

  async function sendServoFrame(frame: number[], waitMs = 80, logFrame = true, options?: ServoFrameSendOptions) {
    return enqueueServoSerialTask(() => sendServoFrameUnlocked(frame, waitMs, logFrame, options));
  }

  async function sendServoFrames(frames: number[] | number[][], waitMs = 80) {
    const list = Array.isArray(frames[0]) ? (frames as number[][]) : [frames as number[]];
    let lastPacket: ReturnType<typeof parseFeetechStatusPacket> = null;
    return enqueueServoSerialTask(async () => {
      for (const frame of list) {
        lastPacket = await sendServoFrameUnlocked(frame, waitMs);
      }
      return lastPacket;
    });
  }

  function sleepMs(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }

  function servoBusConnected() {
    return Boolean(piServoBridgeConnected && sendPiServoBridgeCommand);
  }

  return {
    enqueueServoSerialTask,
    getServoSerialQueueStatus,
    nextSeq,
    sendServoCommand,
    sendServoCommandUnlocked,
    sendServoFrame,
    sendServoFrames,
    sendServoFrameUnlocked,
    servoBusConnected,
    sleepMs
  };
}

type LegacyServoFrameTranslation = { command: PcCommand; packet?: never } | { command?: never; packet: FeetechStatusPacket };

function legacyFrameToServoCommand(frame: number[], nextSeq: () => number, pendingWheelSpeedAccByServo: Record<number, number>): LegacyServoFrameTranslation | null {
  const parsed = parseLegacyFeetechInstructionFrame(frame);
  if (!parsed) {
    return null;
  }

  const { id, instruction, params } = parsed;
  if (instruction === FEETECH_PING && params.length === 0) {
    return { command: { type: "servo.ping", seq: nextSeq(), id } };
  }
  if (instruction === FEETECH_READ && params.length === 2 && params[0] === PRESENT_POSITION_ADDR && params[1] === FEEDBACK_READ_LENGTH) {
    return { command: { type: "servo.read", seq: nextSeq(), id } };
  }
  if (instruction !== FEETECH_WRITE || params.length < 2) {
    return null;
  }

  const address = params[0];
  if (address === TORQUE_ENABLE_ADDR && params.length === 2) {
    return { command: { type: "servo.torque", seq: nextSeq(), id, enabled: params[1] !== 0 } };
  }
  if (address === MODE_ADDR && params.length === 2) {
    return { command: { type: "servo.mode", seq: nextSeq(), id, mode: params[1] === 1 ? "wheel" : "position" } };
  }
  if (address === ACC_ADDR && params.length === 2) {
    pendingWheelSpeedAccByServo[id] = params[1];
    return { packet: { id, status: 0, params: [], checksum: 0 } };
  }
  if (address === GOAL_SPEED_ADDR && params.length === 3) {
    const acc = pendingWheelSpeedAccByServo[id];
    delete pendingWheelSpeedAccByServo[id];
    return {
      command: {
        type: "servo.speed",
        seq: nextSeq(),
        setupWheelMode: false,
        targets: [{ id, speedRaw: decodeSigned15Bit(params[1], params[2]), acc }]
      }
    };
  }
  if (address === ACC_ADDR && params.length >= 8) {
    return {
      command: {
        type: "servo.move",
        seq: nextSeq(),
        sync: false,
        targets: [{ id, angleDeg: rawToAngleDeg(readU16Le(params[2], params[3])), speedRaw: readU16Le(params[6], params[7]), acc: params[1] }]
      }
    };
  }
  if (address === GOAL_POSITION_ADDR && params.length >= 7) {
    return {
      command: {
        type: "servo.move",
        seq: nextSeq(),
        sync: false,
        targets: [{ id, angleDeg: rawToAngleDeg(readU16Le(params[1], params[2])), speedRaw: readU16Le(params[5], params[6]) }]
      }
    };
  }
  return null;
}

function parseLegacyFeetechInstructionFrame(frame: number[]): { id: number; instruction: number; params: number[] } | null {
  if (frame.length < 6 || frame[0] !== 0xff || frame[1] !== 0xff) {
    return null;
  }
  const id = frame[2];
  const length = frame[3];
  const instruction = frame[4];
  if (!Number.isInteger(id) || id < 0 || id > 253 || length !== frame.length - 4) {
    return null;
  }
  const body = frame.slice(2, -1);
  if (feetechChecksum(body) !== frame[frame.length - 1]) {
    return null;
  }
  return { id, instruction, params: frame.slice(5, -1) };
}

function servoCommandResponseToPacket(frame: number[], command: PcCommand, response: InboundMessage | null): FeetechStatusPacket | null {
  if (!response || response.type === "error") {
    return null;
  }
  if (response.type === "servo.feedback") {
    return servoFeedbackToPacket(response);
  }
  return { id: servoIdFromCommand(command, frame), status: 0, params: [], checksum: 0 };
}

function servoFeedbackToPacket(feedback: InboundMessage & { type: "servo.feedback" }): FeetechStatusPacket {
  const params = new Array(15).fill(0);
  writeU16Le(params, 0, feedback.positionRaw ?? 0);
  writeU16Le(params, 2, feedback.speedRaw ?? 0);
  writeU16Le(params, 4, feedback.loadRaw ?? 0);
  params[6] = clampByte(feedback.voltageRaw ?? 0);
  params[7] = clampByte(feedback.temperatureC ?? 0);
  params[10] = feedback.moving ? 1 : 0;
  writeU16Le(params, 13, feedback.currentRaw ?? 0);
  return { id: feedback.id, status: 0, params, checksum: 0 };
}

function servoIdFromCommand(command: PcCommand, frame: number[]): number {
  if (typeof command.id === "number") {
    return command.id;
  }
  if (Array.isArray(command.targets) && typeof command.targets[0] === "object" && command.targets[0] !== null && typeof (command.targets[0] as { id?: unknown }).id === "number") {
    return (command.targets[0] as { id: number }).id;
  }
  return Number.isInteger(frame[2]) ? frame[2] : 0;
}

function readU16Le(low: number, high: number): number {
  return ((high & 0xff) << 8) | (low & 0xff);
}

function writeU16Le(bytes: number[], offset: number, value: number) {
  const word = Math.max(0, Math.min(0xffff, Math.round(Number.isFinite(value) ? value : 0)));
  bytes[offset] = word & 0xff;
  bytes[offset + 1] = (word >> 8) & 0xff;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(0xff, Math.round(Number.isFinite(value) ? value : 0)));
}
