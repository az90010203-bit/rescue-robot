import {
  buildModeFrame,
  buildReadFeedbackFrame,
  buildTorqueFrame,
  buildWheelModeSetupFrames,
  buildWritePositionFrame,
  buildWriteSpeedFrames,
  parseServoFeedback,
  rawToAngleDeg,
  type InboundMessage,
  type ServoProfile
} from "@adapters/hardware/protocol";
import { WHEEL_SLIDER_CENTER_DEG } from "@domains/servo/servoWheelSlider";
import {
  calculateServoLinkageTargets,
  calculateServoLinkageWheelTargets,
  type ServoLinkageGroup,
  type ServoLinkageWheelTarget
} from "@adapters/persistence/storage";
import { singleWheelTurnProgressKey, type ServoCommandState } from "@app/appModel";

interface UseServoPauseRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cancelLiveAngleMove: (id?: number) => void;
  cancelLiveWheelMove: (id?: number) => void;
  cancelServoLinkageMove: (id?: string) => void;
  cancelServoLinkageWheelTurnMonitors: (groupId: string) => void;
  cancelServoMotionForLinkage: (id: string, status?: any) => void;
  cancelServoMotionForServo: (id: number, status?: any) => void;
  cancelServoSafetyMonitor: (id?: number) => void;
  cancelWheelTurnMonitor: (key?: string) => void;
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  lastServoPhysicalAngleRef: { current: Record<number, number> };
  lastServoWheelSpeedRef: { current: Record<number, number> };
  livePositionModeServoRef: { current: Set<number> };
  rememberServoFeedback: (feedback: InboundMessage & { type: "servo.feedback" }) => void;
  sendServoFrameUnlocked: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<any>;
  sendServoFrames: (frames: number[] | number[][], waitMs?: number) => Promise<any>;
  servoBusReady: boolean;
  servos: ServoProfile[];
  setLinkageWheelDirectionByGroup: (updater: (current: Record<string, any>) => Record<string, any>) => void;
  updateServoCommandField: <K extends keyof ServoCommandState>(id: number, field: K, value: ServoCommandState[K]) => void;
}

export function useServoPauseRuntime({
  addSystemLog,
  cancelLiveAngleMove,
  cancelLiveWheelMove,
  cancelServoLinkageMove,
  cancelServoLinkageWheelTurnMonitors,
  cancelServoMotionForLinkage,
  cancelServoMotionForServo,
  cancelServoSafetyMonitor,
  cancelWheelTurnMonitor,
  enqueueServoSerialTask,
  lastServoPhysicalAngleRef,
  lastServoWheelSpeedRef,
  livePositionModeServoRef,
  rememberServoFeedback,
  sendServoFrameUnlocked,
  sendServoFrames,
  servoBusReady,
  servos,
  setLinkageWheelDirectionByGroup,
  updateServoCommandField
}: UseServoPauseRuntimeOptions) {
  async function holdServoAtCurrentPosition(servo: ServoProfile, speedRaw: number, acc: number | undefined, logFrame = true) {
    const packet = await sendServoFrames(buildReadFeedbackFrame(servo.id), logFrame ? 180 : 120);
    if (!packet || packet.status !== 0) {
      addSystemLog("logs.pauseReadFailed", "warn");
      return false;
    }

    const feedback = parseServoFeedback(packet);
    rememberServoFeedback(feedback);
    if (feedback.positionRaw === undefined) {
      addSystemLog("logs.pauseReadFailed", "warn");
      return false;
    }

    await sendServoFrames([
      buildTorqueFrame(servo.id, false),
      buildModeFrame(servo.id, "servo"),
      buildTorqueFrame(servo.id, true),
      buildWritePositionFrame({
        id: servo.id,
        name: servo.name,
        angleDeg: rawToAngleDeg(feedback.positionRaw),
        speedRaw,
        acc
      })
    ]);
    lastServoPhysicalAngleRef.current[servo.id] = rawToAngleDeg(feedback.positionRaw);
    lastServoWheelSpeedRef.current[servo.id] = 0;
    livePositionModeServoRef.current.add(servo.id);
    return true;
  }

  async function pauseWheelServo(servo: ServoProfile, state: ServoCommandState) {
    const acc = state.acc.trim() === "" ? undefined : Number(state.acc);
    await sendServoFrames([
      ...buildWheelModeSetupFrames(servo.id),
      ...buildWriteSpeedFrames({
        id: servo.id,
        name: servo.name,
        speedRaw: 0,
        acc
      })
    ]);
    livePositionModeServoRef.current.delete(servo.id);
    lastServoWheelSpeedRef.current[servo.id] = 0;
    updateServoCommandField(servo.id, "wheelSliderDeg", String(WHEEL_SLIDER_CENTER_DEG));
  }

  async function pauseServoLinkageWheelTargets(targets: ServoLinkageWheelTarget[]) {
    await enqueueServoSerialTask(async () => {
      for (const target of targets) {
        for (const frame of [
          ...buildWheelModeSetupFrames(target.servoId),
          ...buildWriteSpeedFrames({
            id: target.servoId,
            name: target.name,
            speedRaw: 0,
            acc: target.acc
          })
        ]) {
          await sendServoFrameUnlocked(frame, 60, true);
        }
        livePositionModeServoRef.current.delete(target.servoId);
        lastServoWheelSpeedRef.current[target.servoId] = 0;
      }
    });
  }

  async function pauseServo(servo: ServoProfile, state: ServoCommandState) {
    try {
      cancelLiveAngleMove(servo.id);
      cancelLiveWheelMove(servo.id);
      cancelServoSafetyMonitor(servo.id);
      cancelServoMotionForServo(servo.id, "paused");
      cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));
      if (state.mode === "wheel") {
        await pauseWheelServo(servo, state);
      } else {
        const speedValue = Number(state.speedRaw);
        const acc = state.acc.trim() === "" ? undefined : Number(state.acc);
        await holdServoAtCurrentPosition(servo, Number.isFinite(speedValue) && speedValue >= 0 ? speedValue : 300, acc);
      }
      addSystemLog("logs.servoPaused");
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function pauseServoLinkageGroup(group: ServoLinkageGroup) {
    cancelServoLinkageMove(group.id);
    cancelServoMotionForLinkage(group.id, "paused");
    cancelServoLinkageWheelTurnMonitors(group.id);
    for (const member of group.members) {
      cancelServoSafetyMonitor(member.servoId);
    }
    if (group.mode === "wheel") {
      const targets = calculateServoLinkageWheelTargets(group, servos, "clockwise");
      if (targets.length === 0) {
        addSystemLog("logs.linkageNoTargets", "warn");
        return;
      }

      if (!servoBusReady) {
        addSystemLog("logs.servoBusRequired", "warn");
        return;
      }

      await pauseServoLinkageWheelTargets(targets);
      setLinkageWheelDirectionByGroup((current) => ({ ...current, [group.id]: "paused" }));
      addSystemLog("logs.linkagePaused");
      return;
    }

    const targets = calculateServoLinkageTargets(group, servos);
    if (targets.length === 0) {
      addSystemLog("logs.linkageNoTargets", "warn");
      return;
    }

    for (const target of targets) {
      await holdServoAtCurrentPosition(target.servo, target.speedRaw, target.acc);
    }
    addSystemLog("logs.linkagePaused");
  }

  return {
    holdServoAtCurrentPosition,
    pauseServo,
    pauseServoLinkageGroup,
    pauseServoLinkageWheelTargets,
    pauseWheelServo
  };
}
