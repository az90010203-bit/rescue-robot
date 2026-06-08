import { useRef } from "react";
import {
  buildReadFeedbackFrame,
  calculateWheelTurnDelta,
  parseServoFeedback,
  type InboundMessage,
  type ServoProfile
} from "@adapters/hardware/protocol";
import type { WheelTurnProgress, WheelTurnRuntime } from "@app/appModel";

interface StartWheelTurnMonitorOptions {
  key: string;
  servo: ServoProfile;
  targetTurns: number;
  effectiveSpeedRaw: number;
  pause: () => Promise<void>;
  onComplete?: () => Promise<void>;
  onFailure?: () => Promise<void>;
}

interface UseServoWheelTurnRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  rememberServoFeedback: (feedback: InboundMessage & { type: "servo.feedback" }) => void;
  sendServoFrame: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<any>;
  setWheelTurnProgress: (updater: (current: Record<string, WheelTurnProgress>) => Record<string, WheelTurnProgress>) => void;
}

export function useServoWheelTurnRuntime({
  addSystemLog,
  rememberServoFeedback,
  sendServoFrame,
  setWheelTurnProgress
}: UseServoWheelTurnRuntimeOptions) {
  const wheelTurnTimerRef = useRef<Record<string, number>>({});
  const wheelTurnStateRef = useRef<Record<string, WheelTurnRuntime>>({});

  function cancelWheelTurnMonitor(key?: string) {
    if (key === undefined) {
      for (const timer of Object.values(wheelTurnTimerRef.current)) {
        window.clearInterval(timer);
      }
      wheelTurnTimerRef.current = {};
      wheelTurnStateRef.current = {};
      setWheelTurnProgress((current) =>
        Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, running: false }]))
      );
      return;
    }

    const timer = wheelTurnTimerRef.current[key];
    if (timer !== undefined) {
      window.clearInterval(timer);
      delete wheelTurnTimerRef.current[key];
    }
    delete wheelTurnStateRef.current[key];
    setWheelTurnProgress((current) => {
      const progress = current[key];
      return progress ? { ...current, [key]: { ...progress, running: false } } : current;
    });
  }

  function cancelServoLinkageWheelTurnMonitors(groupId: string) {
    const prefix = `linkage:${groupId}:`;
    for (const key of Object.keys(wheelTurnTimerRef.current)) {
      if (key.startsWith(prefix)) {
        cancelWheelTurnMonitor(key);
      }
    }
    for (const key of Object.keys(wheelTurnStateRef.current)) {
      if (key.startsWith(prefix)) {
        cancelWheelTurnMonitor(key);
      }
    }
  }

  async function startWheelTurnMonitor(options: StartWheelTurnMonitorOptions) {
    cancelWheelTurnMonitor(options.key);
    if (!Number.isFinite(options.targetTurns) || options.targetTurns <= 0 || options.effectiveSpeedRaw === 0) {
      addSystemLog("logs.wheelTurnsInvalid", "warn");
      return false;
    }

    const packet = await sendServoFrame(buildReadFeedbackFrame(options.servo.id), 140, false);
    if (!packet || packet.status !== 0) {
      addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
      await (options.onFailure ?? options.pause)();
      return false;
    }

    const feedback = parseServoFeedback(packet);
    rememberServoFeedback(feedback);
    if (feedback.positionRaw === undefined) {
      addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
      await (options.onFailure ?? options.pause)();
      return false;
    }

    wheelTurnStateRef.current[options.key] = {
      servo: options.servo,
      previousRaw: feedback.positionRaw,
      completedTurns: 0,
      targetTurns: options.targetTurns,
      speedRaw: options.effectiveSpeedRaw,
      polling: false,
      pause: options.pause,
      onComplete: options.onComplete,
      onFailure: options.onFailure
    };
    setWheelTurnProgress((current) => ({
      ...current,
      [options.key]: { completedTurns: 0, targetTurns: options.targetTurns, running: true }
    }));
    wheelTurnTimerRef.current[options.key] = window.setInterval(() => {
      void pollWheelTurnProgress(options.key);
    }, 180);
    return true;
  }

  async function pollWheelTurnProgress(key: string) {
    const runtime = wheelTurnStateRef.current[key];
    if (!runtime || runtime.polling) {
      return;
    }

    runtime.polling = true;
    try {
      const packet = await sendServoFrame(buildReadFeedbackFrame(runtime.servo.id), 120, false);
      if (!packet || packet.status !== 0) {
        cancelWheelTurnMonitor(key);
        addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
        await (runtime.onFailure ?? runtime.pause)();
        return;
      }

      const feedback = parseServoFeedback(packet);
      rememberServoFeedback(feedback);
      if (feedback.positionRaw === undefined || runtime.previousRaw === undefined) {
        cancelWheelTurnMonitor(key);
        addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
        await (runtime.onFailure ?? runtime.pause)();
        return;
      }

      runtime.completedTurns += calculateWheelTurnDelta(runtime.previousRaw, feedback.positionRaw, runtime.speedRaw);
      runtime.previousRaw = feedback.positionRaw;
      setWheelTurnProgress((current) => ({
        ...current,
        [key]: {
          completedTurns: Math.min(runtime.completedTurns, runtime.targetTurns),
          targetTurns: runtime.targetTurns,
          running: true
        }
      }));

      if (runtime.completedTurns >= runtime.targetTurns) {
        cancelWheelTurnMonitor(key);
        setWheelTurnProgress((current) => ({
          ...current,
          [key]: {
            completedTurns: runtime.targetTurns,
            targetTurns: runtime.targetTurns,
            running: false
          }
        }));
        await (runtime.onComplete ?? runtime.pause)();
        addSystemLog("logs.wheelTurnsComplete");
      }
    } finally {
      const current = wheelTurnStateRef.current[key];
      if (current) {
        current.polling = false;
      }
    }
  }

  return {
    cancelServoLinkageWheelTurnMonitors,
    cancelWheelTurnMonitor,
    startWheelTurnMonitor
  };
}
