import { useRef } from "react";
import { parseFeetechStatusPacket, toHex } from "@adapters/hardware/protocol";
import type { WebSerialClient } from "@adapters/web-serial/serial";
import type { ConnectionMode } from "@app/appModel";

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
  sendPiServoBridgeFrame?: (frame: number[], waitMs: number, options?: ServoFrameSendOptions) => Promise<number[]>;
  serialRef: { current: WebSerialClient | null };
  servoSerialQueueRef: { current: Promise<void> };
}

export function useServoSerialTransport({
  addErrorLog,
  addLog,
  piServoBridgeConnected,
  seqRef,
  sendPiServoBridgeFrame,
  servoSerialQueueRef
}: UseServoSerialTransportOptions) {
  const servoSerialQueueDepthRef = useRef(0);
  const servoSerialInFlightRef = useRef(false);

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
    if (piServoBridgeConnected && sendPiServoBridgeFrame) {
      try {
        if (logFrame) {
          addLog("tx", toHex(frame));
        }
        const rx = await sendPiServoBridgeFrame(frame, waitMs, options);
        if (rx.length > 0 && logFrame) {
          addLog("rx", toHex(rx));
        }
        return parseFeetechStatusPacket(rx);
      } catch (error) {
        addErrorLog(error, "logs.serialDisconnected");
        return null;
      }
    }

    addLog("system", "Pi servo bridge connection required", "warn");
    return null;
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
    return Boolean(piServoBridgeConnected && sendPiServoBridgeFrame);
  }

  return {
    enqueueServoSerialTask,
    getServoSerialQueueStatus,
    nextSeq,
    sendServoFrame,
    sendServoFrames,
    sendServoFrameUnlocked,
    servoBusConnected,
    sleepMs
  };
}
