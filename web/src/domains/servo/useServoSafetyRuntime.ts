import { buildReadFeedbackFrame, parseServoFeedback, type ServoProfile } from "@adapters/hardware/protocol";
import {
  createServoSafetyRuntime,
  evaluateServoSafety,
  resolveServoSafetyConfig,
  updateServoSafetyTarget,
  type ServoSafetyMotionMode,
  type ServoSafetyPreset,
  type ServoSafetyTriggerReason
} from "@domains/servo/servoSafety";
import type { ServoSafetyDisplayStatus, ServoSafetyMonitor, ServoSafetyStatusMap } from "@app/appModel";

interface UseServoSafetyRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  rememberServoFeedback: (feedback: any) => void;
  sendServoFrame: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<any>;
  servoBusConnected: () => boolean;
  servoSafetyMonitorRef: { current: Record<number, ServoSafetyMonitor> };
  servoSafetySettingsRef: { current: { enabled: boolean; preset: ServoSafetyPreset } };
  servoSafetyTimerRef: { current: Record<number, number> };
  servos: ServoProfile[];
  setServoSafetyStatusById: (updater: ServoSafetyStatusMap | ((current: ServoSafetyStatusMap) => ServoSafetyStatusMap)) => void;
  t: (key: string) => string;
}

interface BeginServoSafetyMonitorOptions {
  affectedServoIds?: number[];
  mode: ServoSafetyMotionMode;
  reset?: boolean;
  servo: ServoProfile;
  stop: () => Promise<void>;
  targetPositionRaw?: number;
  targetSpeedRaw?: number;
}

export function useServoSafetyRuntime({
  addSystemLog,
  rememberServoFeedback,
  sendServoFrame,
  servoBusConnected,
  servoSafetyMonitorRef,
  servoSafetySettingsRef,
  servoSafetyTimerRef,
  servos,
  setServoSafetyStatusById,
  t
}: UseServoSafetyRuntimeOptions) {
  function setServoSafetyStatus(ids: number[], status: ServoSafetyDisplayStatus) {
    if (ids.length === 0) {
      return;
    }

    setServoSafetyStatusById((current) => {
      const next = { ...current };
      for (const id of ids) {
        if (status.state === "idle") {
          delete next[id];
        } else {
          next[id] = status;
        }
      }
      return next;
    });
  }

  function cancelServoSafetyMonitor(id?: number, status: ServoSafetyDisplayStatus = { state: "idle" }) {
    if (id === undefined) {
      for (const timer of Object.values(servoSafetyTimerRef.current)) {
        window.clearTimeout(timer);
      }
      servoSafetyTimerRef.current = {};
      servoSafetyMonitorRef.current = {};
      setServoSafetyStatusById(status.state === "idle" ? {} : (Object.fromEntries(servos.map((servo) => [servo.id, status])) as ServoSafetyStatusMap));
      return;
    }

    const timer = servoSafetyTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete servoSafetyTimerRef.current[id];
    }
    delete servoSafetyMonitorRef.current[id];
    setServoSafetyStatus([id], status);
  }

  function beginServoSafetyMonitor(options: BeginServoSafetyMonitorOptions) {
    const settings = servoSafetySettingsRef.current;
    if (!settings.enabled || !servoBusConnected()) {
      return;
    }

    const now = Date.now();
    const target = {
      mode: options.mode,
      targetPositionRaw: options.targetPositionRaw,
      targetSpeedRaw: options.targetSpeedRaw
    };
    const existing = servoSafetyMonitorRef.current[options.servo.id];
    const monitor: ServoSafetyMonitor =
      existing ?? {
        servo: options.servo,
        runtime: createServoSafetyRuntime(target, now),
        affectedServoIds: options.affectedServoIds ?? [options.servo.id],
        stop: options.stop,
        polling: false
      };

    monitor.servo = options.servo;
    monitor.runtime = existing && !options.reset ? updateServoSafetyTarget(existing.runtime, target) : createServoSafetyRuntime(target, now);
    monitor.affectedServoIds = options.affectedServoIds ?? [options.servo.id];
    monitor.stop = options.stop;
    servoSafetyMonitorRef.current[options.servo.id] = monitor;
    setServoSafetyStatus([options.servo.id], { state: "monitoring" });
    scheduleServoSafetyPoll(options.servo.id, resolveServoSafetyConfig(settings.preset).pollMs);
  }

  function scheduleServoSafetyPoll(id: number, delayMs?: number) {
    if (!servoSafetyMonitorRef.current[id] || servoSafetyTimerRef.current[id] !== undefined) {
      return;
    }

    const config = resolveServoSafetyConfig(servoSafetySettingsRef.current.preset);
    servoSafetyTimerRef.current[id] = window.setTimeout(() => {
      delete servoSafetyTimerRef.current[id];
      void pollServoSafetyMonitor(id);
    }, delayMs ?? config.pollMs);
  }

  async function pollServoSafetyMonitor(id: number) {
    const monitor = servoSafetyMonitorRef.current[id];
    if (!monitor || monitor.polling) {
      return;
    }
    if (!servoSafetySettingsRef.current.enabled || !servoBusConnected()) {
      cancelServoSafetyMonitor(id);
      return;
    }

    monitor.polling = true;
    try {
      const packet = await sendServoFrame(buildReadFeedbackFrame(id), 120, false);
      if (!servoSafetyMonitorRef.current[id] || servoSafetyMonitorRef.current[id] !== monitor) {
        return;
      }
      if (!packet || packet.status !== 0) {
        return;
      }

      const feedback = parseServoFeedback(packet);
      rememberServoFeedback(feedback);

      const result = evaluateServoSafety(monitor.runtime, feedback, Date.now(), resolveServoSafetyConfig(servoSafetySettingsRef.current.preset));
      monitor.runtime = result.runtime;
      if (result.trigger) {
        await triggerServoSafetyStop(id, result.trigger);
        return;
      }
      if (result.settled) {
        cancelServoSafetyMonitor(id);
      }
    } finally {
      const current = servoSafetyMonitorRef.current[id];
      if (current) {
        current.polling = false;
        scheduleServoSafetyPoll(id);
      }
    }
  }

  async function triggerServoSafetyStop(id: number, reason: ServoSafetyTriggerReason) {
    const monitor = servoSafetyMonitorRef.current[id];
    if (!monitor) {
      return;
    }

    const affectedServoIds = monitor.affectedServoIds;
    const stop = monitor.stop;
    for (const affectedId of affectedServoIds) {
      cancelServoSafetyMonitor(affectedId, { state: "stopped", reason });
    }
    addSystemLog("logs.servoSafetyStopped", "error", { id, reason: t(`safety.reasons.${reason}`) });
    try {
      await stop();
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      setServoSafetyStatus(affectedServoIds, { state: "stopped", reason });
    }
  }

  return {
    beginServoSafetyMonitor,
    cancelServoSafetyMonitor
  };
}
