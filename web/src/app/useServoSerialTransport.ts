import { parseFeetechStatusPacket, toHex } from "../lib/protocol";
import type { WebSerialClient } from "../lib/serial";
import type { ConnectionMode } from "./appModel";

interface UseServoSerialTransportOptions {
  addErrorLog: (error: unknown, fallbackKey: string) => void;
  addLog: (source: "rx" | "tx" | "system", message: string, level?: any) => void;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  piServoBridgeConnected?: boolean;
  seqRef: { current: number };
  sendPiServoBridgeFrame?: (frame: number[], waitMs: number) => Promise<number[]>;
  serialRef: { current: WebSerialClient | null };
  servoSerialQueueRef: { current: Promise<void> };
}

export function useServoSerialTransport({
  addErrorLog,
  addLog,
  connected,
  connectionMode,
  piServoBridgeConnected,
  seqRef,
  sendPiServoBridgeFrame,
  serialRef,
  servoSerialQueueRef
}: UseServoSerialTransportOptions) {
  function nextSeq() {
    return seqRef.current++;
  }

  function enqueueServoSerialTask<T>(task: () => Promise<T>): Promise<T> {
    const run = servoSerialQueueRef.current.then(task, task);
    servoSerialQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function sendServoFrameUnlocked(frame: number[], waitMs = 80, logFrame = true) {
    const webSerialServoConnected = Boolean(serialRef.current && connected && connectionMode === "servo-bus");
    if (!webSerialServoConnected && piServoBridgeConnected && sendPiServoBridgeFrame) {
      try {
        if (logFrame) {
          addLog("tx", toHex(frame));
        }
        const rx = await sendPiServoBridgeFrame(frame, waitMs);
        if (rx.length > 0 && logFrame) {
          addLog("rx", toHex(rx));
        }
        return parseFeetechStatusPacket(rx);
      } catch (error) {
        addErrorLog(error, "logs.serialDisconnected");
        return null;
      }
    }

    if (!webSerialServoConnected || !serialRef.current) {
      addLog("system", "Servo bus connection required", "warn");
      return null;
    }

    try {
      serialRef.current.clearBinaryBuffer();
      await serialRef.current.sendBytes(frame);
      if (logFrame) {
        addLog("tx", toHex(frame));
      }
      const rx = await serialRef.current.readBufferedBytes(waitMs);
      if (rx.length > 0 && logFrame) {
        addLog("rx", toHex(rx));
      }
      return parseFeetechStatusPacket(rx);
    } catch (error) {
      addErrorLog(error, "logs.serialDisconnected");
      return null;
    }
  }

  async function sendServoFrame(frame: number[], waitMs = 80, logFrame = true) {
    return enqueueServoSerialTask(() => sendServoFrameUnlocked(frame, waitMs, logFrame));
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
    return Boolean(serialRef.current && connected && connectionMode === "servo-bus") || Boolean(piServoBridgeConnected && sendPiServoBridgeFrame);
  }

  return {
    enqueueServoSerialTask,
    nextSeq,
    sendServoFrame,
    sendServoFrames,
    sendServoFrameUnlocked,
    servoBusConnected,
    sleepMs
  };
}
