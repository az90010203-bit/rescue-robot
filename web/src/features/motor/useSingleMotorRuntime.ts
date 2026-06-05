import {
  buildMotorSetCommand,
  buildMotorStopCommand,
  clamp,
  normalizeMotorChannel,
  type PcCommand
} from "../../lib/protocol";
import { createPlatformCommand } from "../../platform/commands";
import type { PendingSingleMotorMove } from "../../app/appModel";

interface UseSingleMotorRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cancelMotorLinkageMove: (id?: string) => void;
  cancelMotorLinkageMovesForChannels: (channels: string[]) => void;
  cancelSingleMotorMove: (channel?: string) => void;
  connected: boolean;
  connectionMode: string | null;
  dispatchPlatformCommand: (command: any) => Promise<{ status: string }>;
  lastDriveCommandRef: { current: string };
  motorSpeed: string;
  pendingSingleMotorMoveRef: { current: PendingSingleMotorMove | null };
  selectedMotor: { channel: string } | undefined;
  sendMotorCommand: (command: PcCommand, options?: { log?: boolean; retryCount?: number }) => Promise<boolean>;
  sendMotorCommandBatch: (commands: PcCommand[], options?: { log?: boolean; shouldRun?: () => boolean }) => Promise<boolean>;
  serialRef: { current: unknown };
  setMotorSpeed: (value: string) => void;
  singleMotorGenerationRef: { current: number };
  singleMotorLiveSendingRef: { current: boolean };
  singleMotorLiveTimerRef: { current: number | undefined };
  stopMode: "coast" | "brake";
  nextSeq: () => number;
}

export function useSingleMotorRuntime({
  addSystemLog,
  cancelMotorLinkageMove,
  cancelMotorLinkageMovesForChannels,
  cancelSingleMotorMove,
  connected,
  connectionMode,
  dispatchPlatformCommand,
  lastDriveCommandRef,
  motorSpeed,
  nextSeq,
  pendingSingleMotorMoveRef,
  selectedMotor,
  sendMotorCommand,
  sendMotorCommandBatch,
  serialRef,
  setMotorSpeed,
  singleMotorGenerationRef,
  singleMotorLiveSendingRef,
  singleMotorLiveTimerRef,
  stopMode
}: UseSingleMotorRuntimeOptions) {
  function updateSingleMotorSpeed(value: string, live = false) {
    setMotorSpeed(value);
    const speedPercent = Number(value);
    if (!live) {
      if (selectedMotor) {
        cancelSingleMotorMove(selectedMotor.channel);
      }
      return;
    }
    if (!selectedMotor || !Number.isFinite(speedPercent)) {
      return;
    }

    scheduleSingleMotorMove(selectedMotor.channel, speedPercent);
  }

  function scheduleSingleMotorMove(channel: string, speedPercent: number) {
    const normalizedChannel = normalizeMotorChannel(channel);
    cancelMotorLinkageMovesForChannels([normalizedChannel]);
    pendingSingleMotorMoveRef.current = {
      channel: normalizedChannel,
      speedPercent: clamp(speedPercent, -100, 100),
      stopMode,
      generation: singleMotorGenerationRef.current
    };
    if (singleMotorLiveTimerRef.current !== undefined || singleMotorLiveSendingRef.current) {
      return;
    }

    singleMotorLiveTimerRef.current = window.setTimeout(() => {
      singleMotorLiveTimerRef.current = undefined;
      void flushSingleMotorMove();
    }, 60);
  }

  async function flushSingleMotorMove() {
    if (singleMotorLiveSendingRef.current) {
      return;
    }

    const pending = pendingSingleMotorMoveRef.current;
    pendingSingleMotorMoveRef.current = null;
    if (!pending || !connected || connectionMode === "servo-bus") {
      return;
    }

    singleMotorLiveSendingRef.current = true;
    try {
      await sendMotorCommandBatch(
        [buildMotorSetCommand(nextSeq(), { channel: pending.channel, speedPercent: pending.speedPercent, stopMode: pending.stopMode })],
        {
          log: false,
          shouldRun: () => singleMotorGenerationRef.current === pending.generation
        }
      );
    } finally {
      singleMotorLiveSendingRef.current = false;
      if (pendingSingleMotorMoveRef.current && singleMotorLiveTimerRef.current === undefined) {
        singleMotorLiveTimerRef.current = window.setTimeout(() => {
          singleMotorLiveTimerRef.current = undefined;
          void flushSingleMotorMove();
        }, 60);
      }
    }
  }

  async function sendMotorSet() {
    if (!selectedMotor) {
      addSystemLog("logs.selectMotorFirst", "warn");
      return;
    }

    try {
      cancelSingleMotorMove(selectedMotor.channel);
      cancelMotorLinkageMovesForChannels([selectedMotor.channel]);
      const result = await dispatchPlatformCommand(createPlatformCommand("motor.set_speed", `motor:${selectedMotor.channel}`, { speedPercent: Number(motorSpeed), stopMode }));
      if (result.status !== "sent") {
        addSystemLog("logs.motorCommandInvalid", "error");
      }
    } catch {
      addSystemLog("logs.motorCommandInvalid", "error");
    }
  }

  async function stopMotor() {
    if (!selectedMotor) {
      return;
    }
    cancelSingleMotorMove(selectedMotor.channel);
    cancelMotorLinkageMovesForChannels([selectedMotor.channel]);
    await dispatchPlatformCommand(createPlatformCommand("motor.stop", `motor:${selectedMotor.channel}`, { stopMode }));
    setMotorSpeed("0");
  }

  async function stopAllMotors(quiet = false) {
    lastDriveCommandRef.current = "";
    cancelSingleMotorMove();
    cancelMotorLinkageMove();
    if (quiet && (!serialRef.current || !connected || connectionMode === "servo-bus")) {
      setMotorSpeed("0");
      return;
    }
    await sendMotorCommand(buildMotorStopCommand(nextSeq(), { all: true, stopMode }), { log: !quiet });
    setMotorSpeed("0");
  }

  async function readMotor() {
    if (!selectedMotor) {
      return;
    }
    await dispatchPlatformCommand(createPlatformCommand("motor.read_feedback", `motor:${selectedMotor.channel}`));
  }

  return {
    flushSingleMotorMove,
    readMotor,
    scheduleSingleMotorMove,
    sendMotorSet,
    stopAllMotors,
    stopMotor,
    updateSingleMotorSpeed
  };
}
