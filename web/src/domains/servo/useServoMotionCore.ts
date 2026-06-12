import {
  DEFAULT_WHEEL_SPEED_LIMIT,
  buildModeFrame,
  buildServoMoveCommand,
  buildServoSpeedCommand,
  buildTorqueFrame,
  buildWheelModeSetupFrames,
  buildWritePositionFrame,
  buildWriteSpeedFrames,
  clamp,
  normalizeServoProfile,
  rawToAngleDeg,
  servoLogicalToPhysicalAngleWithReverse,
  servoPhysicalToLogicalAngleWithReverse,
  type InboundMessage,
  type PcCommand,
  type ServoProfile
} from "@adapters/hardware/protocol";
import { isCurrentMotionGeneration, nextMotionGeneration } from "@domains/servo/servoMotion";
import type {
  ServoFeedbackMap,
  ServoMotionDisplayStatus,
  ServoMotionStatusMap
} from "@app/appModel";
import type { ArmConfig, ServoLinkageGroup } from "@adapters/persistence/storage";

type ServoGroupPositionTarget = { servo: ServoProfile; physicalAngleDeg: number; speedRaw: number; acc: number | undefined };
type ServoLiveSendOptions = { ackDrainMs?: number; coalesceKey?: string; minIntervalMs?: number; policy?: "latest" };

interface UseServoMotionCoreOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  armConfig: ArmConfig;
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  lastServoPhysicalAngleRef: { current: Record<number, number> };
  lastServoWheelSpeedRef: { current: Record<number, number> };
  livePositionModeServoRef: { current: Set<number> };
  wheelModeServoRef: { current: Set<number> };
  nextSeq: () => number;
  sendServoCommandUnlocked?: (command: PcCommand, waitMs?: number, logCommand?: boolean, options?: ServoLiveSendOptions) => Promise<InboundMessage | null>;
  sendServoFrameUnlocked: (frame: number[], waitMs?: number, logFrame?: boolean, options?: ServoLiveSendOptions) => Promise<any>;
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
  wheelModeServoRef,
  nextSeq,
  sendServoCommandUnlocked,
  sendServoFrameUnlocked,
  servoBusConnected,
  servoFeedback,
  servoLinkageGroupsRef,
  servoMotionGenerationRef,
  setServoMotionStatusById
}: UseServoMotionCoreOptions) {
  const LIVE_POSITION_MIN_INTERVAL_MS = 40;
  const LIVE_POSITION_ACK_DRAIN_MS = 4;

  function livePositionOptions(coalesceKey: string): ServoLiveSendOptions {
    return {
      policy: "latest",
      coalesceKey,
      minIntervalMs: LIVE_POSITION_MIN_INTERVAL_MS,
      ackDrainMs: LIVE_POSITION_ACK_DRAIN_MS
    };
  }

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

  async function prepareServoPositionModeUnlocked(options: {
    logFrame: boolean;
    servo: ServoProfile;
    waitMs: number;
  }) {
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    if (livePositionModeServoRef.current.has(options.servo.id)) {
      return true;
    }

    if (sendServoCommandUnlocked) {
      const response = await sendServoCommandUnlocked({ type: "servo.mode", seq: nextSeq(), id: options.servo.id, mode: "position" }, options.waitMs, options.logFrame);
      if (!response || response.type === "error") {
        return false;
      }
      livePositionModeServoRef.current.add(options.servo.id);
      wheelModeServoRef.current.delete(options.servo.id);
      return true;
    }

    await sendServoFrameUnlocked(buildTorqueFrame(options.servo.id, false), options.waitMs, options.logFrame);
    await sendServoFrameUnlocked(buildModeFrame(options.servo.id, "servo"), options.waitMs, options.logFrame);
    await sendServoFrameUnlocked(buildTorqueFrame(options.servo.id, true), options.waitMs, options.logFrame);
    livePositionModeServoRef.current.add(options.servo.id);
    wheelModeServoRef.current.delete(options.servo.id);
    return true;
  }

  async function writeServoPositionUnlocked(options: {
    acc: number | undefined;
    live?: boolean;
    logFrame: boolean;
    physicalAngleDeg: number;
    servo: ServoProfile;
    setupMode?: boolean;
    speedRaw: number;
    waitMs: number;
  }) {
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    const shouldSetupMode = options.setupMode ?? options.live !== true;
    if (shouldSetupMode && !livePositionModeServoRef.current.has(options.servo.id)) {
      const prepared = await prepareServoPositionModeUnlocked({
        servo: options.servo,
        waitMs: options.waitMs,
        logFrame: options.logFrame
      });
      if (!prepared) {
        return false;
      }
    }

    const liveOptions = options.live ? livePositionOptions(`servo:${options.servo.id}:position`) : undefined;

    if (sendServoCommandUnlocked) {
      const response = await sendServoCommandUnlocked(
        buildServoMoveCommand(nextSeq(), {
          id: options.servo.id,
          name: options.servo.name,
          angleDeg: options.physicalAngleDeg,
          speedRaw: options.speedRaw,
          acc: options.acc
        }),
        options.waitMs,
        options.logFrame,
        liveOptions
      );
      if (!options.live && (!response || response.type === "error")) {
        return false;
      }
    } else {
      await sendServoFrameUnlocked(
        buildWritePositionFrame({
          id: options.servo.id,
          name: options.servo.name,
          angleDeg: options.physicalAngleDeg,
          speedRaw: options.speedRaw,
          acc: options.acc
        }),
        options.waitMs,
        options.logFrame,
        liveOptions
      );
    }
    lastServoPhysicalAngleRef.current[options.servo.id] = options.physicalAngleDeg;
    livePositionModeServoRef.current.add(options.servo.id);
    wheelModeServoRef.current.delete(options.servo.id);
    return true;
  }

  async function writeServoGroupPositionUnlocked(options: {
    coalesceKey?: string;
    live?: boolean;
    logFrame: boolean;
    setupMode?: boolean;
    targets: ServoGroupPositionTarget[];
    waitMs: number;
  }) {
    if (options.targets.length === 0) {
      return false;
    }
    if (options.targets.length === 1) {
      const [target] = options.targets;
      return writeServoPositionUnlocked({
        servo: target.servo,
        physicalAngleDeg: target.physicalAngleDeg,
        speedRaw: target.speedRaw,
        acc: target.acc,
        waitMs: options.waitMs,
        logFrame: options.logFrame,
        live: options.live,
        setupMode: options.setupMode
      });
    }
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    const shouldSetupMode = options.setupMode ?? options.live !== true;
    if (shouldSetupMode) {
      for (const target of options.targets) {
        if (livePositionModeServoRef.current.has(target.servo.id)) {
          continue;
        }
        const prepared = await prepareServoPositionModeUnlocked({
          servo: target.servo,
          waitMs: options.waitMs,
          logFrame: options.logFrame
        });
        if (!prepared) {
          return false;
        }
      }
    }

    if (!sendServoCommandUnlocked) {
      for (const target of options.targets) {
        const sent = await writeServoPositionUnlocked({
          servo: target.servo,
          physicalAngleDeg: target.physicalAngleDeg,
          speedRaw: target.speedRaw,
          acc: target.acc,
          waitMs: options.waitMs,
          logFrame: options.logFrame,
          live: options.live,
          setupMode: false
        });
        if (!sent && !options.live) {
          return false;
        }
      }
      return true;
    }

    const response = await sendServoCommandUnlocked(
      buildServoMoveCommand(
        nextSeq(),
        options.targets.map((target) => ({
          id: target.servo.id,
          name: target.servo.name,
          angleDeg: target.physicalAngleDeg,
          speedRaw: target.speedRaw,
          acc: target.acc
        })),
        true
      ),
      options.waitMs,
      options.logFrame,
      options.live ? livePositionOptions(options.coalesceKey ?? "servo:group:position") : undefined
    );
    if (!options.live && (!response || response.type === "error")) {
      return false;
    }
    for (const target of options.targets) {
      lastServoPhysicalAngleRef.current[target.servo.id] = target.physicalAngleDeg;
      livePositionModeServoRef.current.add(target.servo.id);
      wheelModeServoRef.current.delete(target.servo.id);
    }
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

    const shouldSetupMode = options.setupMode && !wheelModeServoRef.current.has(options.servo.id);
    if (sendServoCommandUnlocked) {
      const response = await sendServoCommandUnlocked(
        buildServoSpeedCommand(nextSeq(), { id: options.servo.id, name: options.servo.name, speedRaw: options.speedRaw, acc: options.acc }, shouldSetupMode),
        options.waitMs,
        options.logFrame
      );
      if (!response || response.type === "error") {
        return false;
      }
    } else if (shouldSetupMode) {
      for (const frame of buildWheelModeSetupFrames(options.servo.id)) {
        await sendServoFrameUnlocked(frame, options.waitMs, options.logFrame);
      }

      for (const frame of buildWriteSpeedFrames({ id: options.servo.id, name: options.servo.name, speedRaw: options.speedRaw, acc: options.acc })) {
        await sendServoFrameUnlocked(frame, options.waitMs, options.logFrame);
      }
    } else {
      for (const frame of buildWriteSpeedFrames({ id: options.servo.id, name: options.servo.name, speedRaw: options.speedRaw, acc: options.acc })) {
        await sendServoFrameUnlocked(frame, options.waitMs, options.logFrame);
      }
    }
    livePositionModeServoRef.current.delete(options.servo.id);
    wheelModeServoRef.current.add(options.servo.id);
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
    prepareServoPositionModeUnlocked,
    writeServoGroupPositionUnlocked,
    writeServoPositionUnlocked,
    writeServoWheelSpeedUnlocked
  };
}
