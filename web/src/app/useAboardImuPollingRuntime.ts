import { useEffect, useRef } from "react";
import type { PcCommand } from "@adapters/hardware/protocol";
import { isPiRemoteError } from "@adapters/pi/piRemote";
import type { AboardBridgeCommandResult } from "@adapters/pi/piAboardBridge";
import type { AppSection } from "@app/appModel";

const A_BOARD_IMU_POLL_BASE_MS = 500;
const A_BOARD_IMU_POLL_BACKOFF_MS = [A_BOARD_IMU_POLL_BASE_MS, 1000, 2000];
const A_BOARD_IMU_BUSY_RETRY_MS = 120;
const A_BOARD_IMU_TIMEOUT_MS = 700;

interface UseAboardImuPollingRuntimeOptions {
  aBoardBridgeConnected: boolean;
  aBoardRuntimeBusy: () => boolean;
  activeSection: AppSection;
  host: string;
  sendAboardCommand: (command: PcCommand, options?: { log?: boolean; timeoutMs?: number }) => Promise<AboardBridgeCommandResult | null>;
  seqRef: { current: number };
  setABoardImuError: (message: string | null) => void;
}

export function useAboardImuPollingRuntime({
  aBoardBridgeConnected,
  aBoardRuntimeBusy,
  activeSection,
  host,
  sendAboardCommand,
  seqRef,
  setABoardImuError
}: UseAboardImuPollingRuntimeOptions) {
  const pollInFlightRef = useRef(false);
  const pollFailureCountRef = useRef(0);
  const runtimeBusyRef = useRef(aBoardRuntimeBusy);
  const sendCommandRef = useRef(sendAboardCommand);
  const setErrorRef = useRef(setABoardImuError);

  runtimeBusyRef.current = aBoardRuntimeBusy;
  sendCommandRef.current = sendAboardCommand;
  setErrorRef.current = setABoardImuError;

  useEffect(() => {
    if (activeSection !== "console" || !aBoardBridgeConnected) {
      pollInFlightRef.current = false;
      pollFailureCountRef.current = 0;
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    function pollDelayMs() {
      return A_BOARD_IMU_POLL_BACKOFF_MS[Math.min(Math.max(0, pollFailureCountRef.current), A_BOARD_IMU_POLL_BACKOFF_MS.length - 1)];
    }
    function scheduleNextPoll(delayMs = pollDelayMs()) {
      if (cancelled) {
        return;
      }
      timer = window.setTimeout(() => {
        void pollAboardImu();
      }, delayMs);
    }
    async function pollAboardImu() {
      if (cancelled || pollInFlightRef.current) {
        scheduleNextPoll();
        return;
      }
      if (runtimeBusyRef.current()) {
        scheduleNextPoll(A_BOARD_IMU_BUSY_RETRY_MS);
        return;
      }
      pollInFlightRef.current = true;
      const command: PcCommand = { type: "imu.read", seq: seqRef.current++ };
      let succeeded = false;
      let busy = false;
      try {
        const result = await sendCommandRef.current(command, { log: false, timeoutMs: A_BOARD_IMU_TIMEOUT_MS });
        if (cancelled || !result) {
          return;
        }
        if (result.busy) {
          busy = true;
          return;
        }
        let hasImuFeedback = false;
        let hasError = false;
        for (const message of result.messages) {
          if (message.type === "imu.feedback") {
            hasImuFeedback = true;
            succeeded = true;
          } else if (message.type === "error") {
            hasError = true;
            setErrorRef.current(message.message);
          }
        }
        if (!hasImuFeedback && !hasError) {
          setErrorRef.current("A board IMU did not return feedback");
        }
      } catch (error) {
        if (!cancelled) {
          const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : "A board IMU read failed";
          setErrorRef.current(message);
        }
      } finally {
        pollInFlightRef.current = false;
        if (busy) {
          scheduleNextPoll(A_BOARD_IMU_BUSY_RETRY_MS);
          return;
        }
        pollFailureCountRef.current = succeeded ? 0 : Math.min(pollFailureCountRef.current + 1, A_BOARD_IMU_POLL_BACKOFF_MS.length - 1);
        scheduleNextPoll();
      }
    }

    void pollAboardImu();
    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [aBoardBridgeConnected, activeSection, host, seqRef]);
}
