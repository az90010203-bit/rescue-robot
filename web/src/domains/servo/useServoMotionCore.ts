import {
  DEFAULT_WHEEL_SPEED_LIMIT,
  buildModeFrame,
  buildTorqueFrame,
  buildWheelModeSetupFrames,
  buildWritePositionFrame,
  buildWriteSpeedFrames,
  clamp,
  normalizeServoProfile,
  rawToAngleDeg,
  servoLogicalToPhysicalAngleWithReverse,
  servoPhysicalToLogicalAngleWithReverse,
  type ServoProfile
} from "@adapters/hardware/protocol";
import { isCurrentMotionGeneration, nextMotionGeneration } from "@domains/servo/servoMotion";
import type {
  ServoFeedbackMap,
  ServoMotionDisplayStatus,
  ServoMotionStatusMap
} from "@app/appModel";
import type { ArmConfig, ServoLinkageGroup } from "@adapters/persistence/storage";

interface UseServoMotionCoreOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  armConfig: ArmConfig;
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  lastServoPhysicalAngleRef: { current: Record<number, number> };
  lastServoWheelSpeedRef: { current: Record<number, number> };
  livePositionModeServoRef: { current: Set<number> };
  sendServoFrameUnlocked: (frame: number[], waitMs?: number, logFrame?: boolean) => Promise<any>;
  servoBusConnected: () => boolean;
  servoFeedback: ServoFeedbackMap;
  servoLinkageGroupsRef: { current: ServoLinkageGroup[] };
  servoMotionGenerationRef: { current: Record<string, number> };
  setServoMotionStatusById: (updater: ServoMotionStatusMap | ((current: ServoMotionStatusMap) => ServoMotionStatusMap)) => void;
}

export function useServoMotionCore({
  addSystemLog,
  armConfig,
  enqueueServoSerialTask,
  lastServoPhysicalAngleRef,
  lastServoWheelSpeedRef,
  livePositionModeServoRef,
  sendServoFrameUnlocked,
  servoBusConnected,
  servoFeedback,
  servoLinkageGroupsRef,
  servoMotionGenerationRef,
  setServoMotionStatusById
}: UseServoMotionCoreOptions) {
  function motionKeyForServo(id: number): string {
    return `servo:${id}`;
  }

  function motionKeyForLinkage(id: string): string {
    return `linkage:${id}`;
  }

  function motionKeyForArm(): string {
    return "arm";
  }

  function setServoMotionStatus(ids: number[], status: ServoMotionDisplayStatus) {
    if (ids.length === 0) {
      return;
    }
    setServoMotionStatusById((current) => {
      const next = { ...current };
      for (const id of ids) {
        next[id] = status;
      }
      return next;
    });
  }

  function bumpServoMotionGeneration(key: string) {
    const generation = nextMotionGeneration(servoMotionGenerationRef.current[key]);
    servoMotionGenerationRef.current[key] = generation;
    return generation;
  }

  function isServoMotionCurrent(key: string, generation: number) {
    return isCurrentMotionGeneration(servoMotionGenerationRef.current[key], generation);
  }

  function cancelServoMotion(key?: string, status: ServoMotionDisplayStatus = "idle") {
    if (key === undefined) {
      for (const currentKey of Object.keys(servoMotionGenerationRef.current)) {
        bumpServoMotionGeneration(currentKey);
      }
      setServoMotionStatusById((current) => Object.fromEntries(Object.keys(current).map((id) => [id, status])) as ServoMotionStatusMap);
      return;
    }
    bumpServoMotionGeneration(key);
  }

  function cancelServoMotionForServo(id: number, status: ServoMotionDisplayStatus = "idle") {
    cancelServoMotion(motionKeyForServo(id));
    if (armConfig.joints.some((joint) => joint.servoId === id)) {
      cancelServoMotion(motionKeyForArm());
    }
    for (const group of servoLinkageGroupsRef.current) {
      if (group.members.some((member) => member.servoId === id)) {
        cancelServoMotion(motionKeyForLinkage(group.id));
      }
    }
    setServoMotionStatus([id], status);
  }

  function cancelServoMotionForLinkage(groupId: string, status: ServoMotionDisplayStatus = "idle") {
    cancelServoMotion(motionKeyForLinkage(groupId));
    const group = servoLinkageGroupsRef.current.find((item) => item.id === groupId);
    setServoMotionStatus(group?.members.map((member) => member.servoId) ?? [], status);
  }

  function cancelServoMotionForArm(status: ServoMotionDisplayStatus = "idle") {
    cancelServoMotion(motionKeyForArm());
    setServoMotionStatus(armConfig.joints.map((joint) => joint.servoId), status);
  }

  function feedbackPhysicalAngle(servoId: number) {
    const positionRaw = servoFeedback[servoId]?.positionRaw;
    return positionRaw === undefined ? undefined : rawToAngleDeg(positionRaw);
  }

  function getPositionMotionStartAngle(servo: ServoProfile, targetPhysicalAngle: number, reverse = false) {
    const normalized = normalizeServoProfile(servo);
    const lastSent = lastServoPhysicalAngleRef.current[servo.id];
    if (Number.isFinite(lastSent)) {
      return clamp(lastSent!, normalized.minDeg!, normalized.maxDeg!);
    }
    const feedbackAngle = feedbackPhysicalAngle(servo.id);
    const start = Number.isFinite(feedbackAngle)
      ? servoLogicalToPhysicalAngleWithReverse(servo, servoPhysicalToLogicalAngleWithReverse(servo, feedbackAngle!, reverse), reverse)
      : targetPhysicalAngle;
    return clamp(Number.isFinite(start) ? start! : targetPhysicalAngle, normalized.minDeg!, normalized.maxDeg!);
  }

  function getWheelMotionStartSpeed(servoId: number) {
    const lastSent = lastServoWheelSpeedRef.current[servoId];
    if (Number.isFinite(lastSent)) {
      return clamp(Math.round(lastSent!), -DEFAULT_WHEEL_SPEED_LIMIT, DEFAULT_WHEEL_SPEED_LIMIT);
    }
    const feedbackSpeed = servoFeedback[servoId]?.speedRaw;
    return Number.isFinite(feedbackSpeed) ? clamp(Math.round(feedbackSpeed!), -DEFAULT_WHEEL_SPEED_LIMIT, DEFAULT_WHEEL_SPEED_LIMIT) : 0;
  }

  async function writeServoPositionUnlocked(options: {
    acc: number | undefined;
    logFrame: boolean;
    physicalAngleDeg: number;
    servo: ServoProfile;
    speedRaw: number;
    waitMs: number;
  }) {
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    if (!livePositionModeServoRef.current.has(options.servo.id)) {
      await sendServoFrameUnlocked(buildTorqueFrame(options.servo.id, false), options.waitMs, options.logFrame);
      await sendServoFrameUnlocked(buildModeFrame(options.servo.id, "servo"), options.waitMs, options.logFrame);
      await sendServoFrameUnlocked(buildTorqueFrame(options.servo.id, true), options.waitMs, options.logFrame);
      livePositionModeServoRef.current.add(options.servo.id);
    }

    await sendServoFrameUnlocked(
      buildWritePositionFrame({
        id: options.servo.id,
        name: options.servo.name,
        angleDeg: options.physicalAngleDeg,
        speedRaw: options.speedRaw,
        acc: options.acc
      }),
      options.waitMs,
      options.logFrame
    );
    lastServoPhysicalAngleRef.current[options.servo.id] = options.physicalAngleDeg;
    lastServoWheelSpeedRef.current[options.servo.id] = 0;
    return true;
  }

  async function writeServoWheelSpeedUnlocked(options: {
    acc: number | undefined;
    logFrame: boolean;
    servo: ServoProfile;
    setupMode: boolean;
    speedRaw: number;
    waitMs: number;
  }) {
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    if (options.setupMode) {
      for (const frame of buildWheelModeSetupFrames(options.servo.id)) {
        await sendServoFrameUnlocked(frame, options.waitMs, options.logFrame);
      }
    }

    for (const frame of buildWriteSpeedFrames({ id: options.servo.id, name: options.servo.name, speedRaw: options.speedRaw, acc: options.acc })) {
      await sendServoFrameUnlocked(frame, options.waitMs, options.logFrame);
    }
    livePositionModeServoRef.current.delete(options.servo.id);
    lastServoWheelSpeedRef.current[options.servo.id] = options.speedRaw;
    return true;
  }

  return {
    bumpServoMotionGeneration,
    cancelServoMotion,
    cancelServoMotionForArm,
    cancelServoMotionForLinkage,
    cancelServoMotionForServo,
    enqueueServoSerialTask,
    getPositionMotionStartAngle,
    getWheelMotionStartSpeed,
    isServoMotionCurrent,
    motionKeyForArm,
    motionKeyForLinkage,
    motionKeyForServo,
    setServoMotionStatus,
    writeServoPositionUnlocked,
    writeServoWheelSpeedUnlocked
  };
}
