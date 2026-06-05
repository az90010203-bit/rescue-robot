import {
  applyServoWheelDirection,
  buildWheelModeSetupFrames,
  buildWriteSpeedFrames,
  parseFeetechStatusPacket,
  type ServoProfile
} from "../../lib/protocol";
import { WHEEL_SLIDER_CENTER_DEG, normalizeWheelMaxSpeedRaw, wheelSliderToCommandSpeedRaw } from "../../lib/servoWheelSlider";
import { calculateServoLinkageWheelTargets, type ServoLinkageGroup, type ServoLinkageWheelDirection } from "../../lib/storage";
import { createPlatformCommand } from "../../platform/commands";
import { linkageWheelTurnProgressKey, singleWheelTurnProgressKey, type ServoCommandState } from "../../app/appModel";

interface UseServoActionsRuntimeOptions {
  addLog: (source: "rx" | "tx" | "system", message: string, level?: any) => void;
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cancelLiveAngleMove: (id?: number) => void;
  cancelLiveWheelMove: (id?: number) => void;
  cancelServoMotionForServo: (id: number, status?: any) => void;
  cancelServoSafetyMonitor: (id?: number) => void;
  cancelWheelTurnMonitor: (key?: string) => void;
  connected: boolean;
  connectionMode: string | null;
  dispatchPlatformCommand: (command: any) => Promise<any>;
  lastServoWheelSpeedRef: { current: Record<number, number> };
  livePositionModeServoRef: { current: Set<number> };
  pauseServoLinkageGroup: (group: ServoLinkageGroup) => Promise<void>;
  pauseServoLinkageWheelTargets: (targets: any[]) => Promise<void>;
  pauseWheelServo: (servo: ServoProfile, state: ServoCommandState) => Promise<void>;
  runServoLinkagePositionMotion: (group: ServoLinkageGroup, live?: boolean) => Promise<unknown>;
  runServoLinkageWheelMotion: (group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) => Promise<unknown>;
  runServoPositionMotion: (servo: ServoProfile, state: ServoCommandState, angle: number) => Promise<unknown>;
  runServoWheelMotion: (servo: ServoProfile, state: ServoCommandState, speed: number, options?: { live?: boolean; log?: boolean }) => Promise<unknown>;
  servos: ServoProfile[];
  setLinkageWheelDirectionByGroup: (updater: (current: Record<string, any>) => Record<string, any>) => void;
  startWheelTurnMonitor: (options: any) => Promise<boolean>;
  updateServoCommandField: <K extends keyof ServoCommandState>(id: number, field: K, value: ServoCommandState[K]) => void;
  sendServoFrames: (frames: number[] | number[][], waitMs?: number) => Promise<any>;
}

export function useServoActionsRuntime({
  addLog,
  addSystemLog,
  cancelLiveAngleMove,
  cancelLiveWheelMove,
  cancelServoMotionForServo,
  cancelServoSafetyMonitor,
  cancelWheelTurnMonitor,
  connected,
  connectionMode,
  dispatchPlatformCommand,
  lastServoWheelSpeedRef,
  livePositionModeServoRef,
  pauseServoLinkageGroup,
  pauseServoLinkageWheelTargets,
  pauseWheelServo,
  runServoLinkagePositionMotion,
  runServoLinkageWheelMotion,
  runServoPositionMotion,
  runServoWheelMotion,
  servos,
  setLinkageWheelDirectionByGroup,
  startWheelTurnMonitor,
  updateServoCommandField,
  sendServoFrames
}: UseServoActionsRuntimeOptions) {
  async function sendMoveForServo(servo: ServoProfile, state: ServoCommandState, options: { live?: boolean } = {}) {
    try {
      const live = options.live ?? false;
      const wheelMaxSpeedRaw = normalizeWheelMaxSpeedRaw(Number(state.speedRaw));
      const wheelSliderDeg = state.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : Number(state.wheelSliderDeg);
      const commandWheelSpeedRaw = wheelSliderToCommandSpeedRaw(wheelSliderDeg, wheelMaxSpeedRaw);
      const effectiveWheelSpeed = applyServoWheelDirection(servo, commandWheelSpeedRaw, state.reverse);
      const sent =
        state.mode === "wheel"
          ? await runServoWheelMotion(servo, { ...state, speedRaw: String(wheelMaxSpeedRaw) }, effectiveWheelSpeed, { live, log: !live })
          : await runServoPositionMotion(servo, state, Number(state.angleDeg));

      if (!sent) {
        return;
      }
      if (connected && connectionMode === "servo-bus" && state.mode === "wheel") {
        if (state.wheelTurnsEnabled && effectiveWheelSpeed !== 0) {
          await startWheelTurnMonitor({
            key: singleWheelTurnProgressKey(servo.id),
            servo,
            targetTurns: Number(state.wheelTurnsTarget),
            effectiveSpeedRaw: effectiveWheelSpeed,
            pause: () => pauseWheelServo(servo, state)
          });
        } else {
          cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));
        }
      }
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function sendServoLinkageGroup(group: ServoLinkageGroup, live = false) {
    if (group.mode !== "position") {
      await sendServoLinkageWheelGroup(group, "clockwise");
      return;
    }
    await runServoLinkagePositionMotion(group, live);
  }

  async function sendServoLinkageWheelGroup(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) {
    const targets = calculateServoLinkageWheelTargets(group, servos, direction);

    try {
      const sent = await runServoLinkageWheelMotion(group, direction);
      if (!sent) {
        return;
      }

      setLinkageWheelDirectionByGroup((current) => ({ ...current, [group.id]: direction }));
      if (group.wheelTurnLimitEnabled) {
        const targetTurns = direction === "clockwise" ? group.wheelClockwiseTurnsTarget : group.wheelCounterclockwiseTurnsTarget;
        for (const target of targets) {
          const started = await startWheelTurnMonitor({
            key: linkageWheelTurnProgressKey(group.id, target.servoId),
            servo: target.servo,
            targetTurns,
            effectiveSpeedRaw: target.effectiveSpeedRaw,
            pause: () => pauseServoLinkageWheelTargets([target]),
            onComplete: () => pauseServoLinkageGroup(group),
            onFailure: () => pauseServoLinkageGroup(group)
          });
          if (!started) {
            break;
          }
        }
      }
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function stopServo(servo: ServoProfile, state: ServoCommandState) {
    try {
      cancelLiveAngleMove(servo.id);
      cancelLiveWheelMove(servo.id);
      cancelServoSafetyMonitor(servo.id);
      cancelServoMotionForServo(servo.id, "paused");
      await sendServoFrames([
        ...buildWheelModeSetupFrames(servo.id),
        ...buildWriteSpeedFrames({
          id: servo.id,
          name: servo.name,
          speedRaw: 0,
          acc: state.acc.trim() === "" ? undefined : Number(state.acc)
        })
      ]);
      livePositionModeServoRef.current.delete(servo.id);
      lastServoWheelSpeedRef.current[servo.id] = 0;
      updateServoCommandField(servo.id, "wheelSliderDeg", String(WHEEL_SLIDER_CENTER_DEG));
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function pingServo(servo: ServoProfile) {
    const result = await dispatchPlatformCommand(createPlatformCommand("servo.ping", `servo:${servo.id}`));
    const packet = result.response as ReturnType<typeof parseFeetechStatusPacket>;
    if (packet?.status === 0) {
      addLog("system", `ID${servo.id} ping ok`);
    } else if (packet) {
      addLog("system", `ID${servo.id} ping status=${packet.status}`, "warn");
    } else {
      addLog("system", `ID${servo.id} ping no response`, "warn");
    }
  }

  async function readServo(servo: ServoProfile) {
    const result = await dispatchPlatformCommand(createPlatformCommand("servo.read_feedback", `servo:${servo.id}`));
    const packet = result.response as ReturnType<typeof parseFeetechStatusPacket>;
    if (!packet) {
      addLog("system", `ID${servo.id} read no response`, "warn");
      return;
    }
    if (packet.status !== 0) {
      addLog("system", `ID${servo.id} read status error ${packet.status}`, "warn");
      return;
    }
  }

  async function setTorqueForServo(servo: ServoProfile, enabled: boolean) {
    await dispatchPlatformCommand(createPlatformCommand("servo.set_torque", `servo:${servo.id}`, { enabled }));
    if (!enabled) {
      cancelLiveAngleMove(servo.id);
      cancelLiveWheelMove(servo.id);
      cancelServoSafetyMonitor(servo.id);
      cancelServoMotionForServo(servo.id, "idle");
      cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));
      livePositionModeServoRef.current.delete(servo.id);
    }
  }

  return {
    pingServo,
    readServo,
    sendMoveForServo,
    sendServoLinkageGroup,
    sendServoLinkageWheelGroup,
    setTorqueForServo,
    stopServo
  };
}
