import {
  angleDegToRaw,
  clamp,
  clampServoLogicalAngle,
  normalizeServoProfile,
  servoLogicalToPhysicalAngleWithReverse,
  type ServoProfile
} from "@adapters/hardware/protocol";
import type { ArmConfig } from "@adapters/persistence/storage";
import type { ArmMotionTarget } from "@app/appModel";
import { createPositionTrajectory, resolveServoMotionConfig, smoothStepQuintic, type ServoSmoothPreset } from "@domains/servo/servoMotion";

interface UseArmMotionRuntimeOptions {
  addLog: (source: "rx" | "tx" | "system", message: string, level?: any) => void;
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  beginServoSafetyMonitor: (options: any) => void;
  bumpServoMotionGeneration: (key: string) => number;
  cancelServoMotionForArm: (status?: any) => void;
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  getPositionMotionStartAngle: (servo: ServoProfile, targetPhysicalAngle: number, reverse?: boolean) => number;
  isServoMotionCurrent: (key: string, generation: number) => boolean;
  motionKeyForArm: () => string;
  pauseArm: () => Promise<void>;
  servoBusConnected: () => boolean;
  servoSmoothPreset: ServoSmoothPreset;
  servoSmoothingEnabled: boolean;
  servos: ServoProfile[];
  setServoMotionStatus: (ids: number[], status: any) => void;
  sleepMs: (ms: number) => Promise<void>;
  writeServoPositionUnlocked: (options: {
    servo: ServoProfile;
    physicalAngleDeg: number;
    speedRaw: number;
    acc: number | undefined;
    live?: boolean;
    waitMs: number;
    logFrame: boolean;
    setupMode?: boolean;
  }) => Promise<any>;
}

const ARM_LIVE_SPEED_RAW_LIMIT = 450;
const ARM_LIVE_ACC_LIMIT = 18;

export function useArmMotionRuntime({
  addLog,
  addSystemLog,
  beginServoSafetyMonitor,
  bumpServoMotionGeneration,
  cancelServoMotionForArm,
  enqueueServoSerialTask,
  getPositionMotionStartAngle,
  isServoMotionCurrent,
  motionKeyForArm,
  pauseArm,
  servoBusConnected,
  servoSmoothPreset,
  servoSmoothingEnabled,
  servos,
  setServoMotionStatus,
  sleepMs,
  writeServoPositionUnlocked
}: UseArmMotionRuntimeOptions) {
  function armMotionServoProfiles(extraServos: ServoProfile[] = []) {
    const byId = new Map<number, ServoProfile>();
    for (const servo of [...servos, ...extraServos]) {
      byId.set(servo.id, normalizeServoProfile(servo));
    }
    return Array.from(byId.values()).sort((a, b) => a.id - b.id);
  }

  function calculateArmMotionTargets(config: ArmConfig, extraServos: ServoProfile[] = []): ArmMotionTarget[] {
    const servoById = new Map(armMotionServoProfiles(extraServos).map((servo) => [servo.id, servo]));
    return config.joints
      .filter((joint) => joint.enabled)
      .map((joint) => {
        const servo = servoById.get(joint.servoId);
        if (!servo) {
          return null;
        }
        const logicalAngleDeg = clampServoLogicalAngle(servo, joint.angleDeg);
        const physicalAngleDeg = servoLogicalToPhysicalAngleWithReverse(servo, logicalAngleDeg, joint.reverse);
        return {
          joint,
          servo,
          servoId: servo.id,
          logicalAngleDeg,
          physicalAngleDeg,
          speedRaw: clamp(Math.round(joint.speedRaw), 0, 4095),
          acc: clamp(Math.round(joint.acc), 0, 254),
          reverse: joint.reverse
        };
      })
      .filter((target): target is ArmMotionTarget => target !== null);
  }

  function armLiveSpeedRaw(speedRaw: number) {
    return clamp(Math.round(speedRaw), 0, ARM_LIVE_SPEED_RAW_LIMIT);
  }

  function armLiveAcc(acc: number | undefined) {
    return clamp(Math.round(acc ?? ARM_LIVE_ACC_LIMIT), 0, ARM_LIVE_ACC_LIMIT);
  }

  async function runArmPositionMotion(config: ArmConfig, live = false, extraServos: ServoProfile[] = []) {
    const targets = calculateArmMotionTargets(config, extraServos);

    if (targets.length === 0) {
      if (!live) {
        addSystemLog("logs.armNoTargets", "warn");
      }
      return false;
    }

    if (!servoBusConnected()) {
      if (!live) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }

    const ids = targets.map((target) => target.servoId);
    if (!servoSmoothingEnabled || live) {
      cancelServoMotionForArm("idle");
      await enqueueServoSerialTask(async () => {
        for (const target of targets) {
          await writeServoPositionUnlocked({
            servo: target.servo,
            physicalAngleDeg: target.physicalAngleDeg,
            speedRaw: live ? armLiveSpeedRaw(target.speedRaw) : target.speedRaw,
            acc: live ? armLiveAcc(target.acc) : target.acc,
            waitMs: live ? 12 : 80,
            logFrame: !live,
            live
          });
        }
      });
      for (const target of targets) {
        beginServoSafetyMonitor({
          servo: target.servo,
          mode: "position",
          targetPositionRaw: angleDegToRaw(target.physicalAngleDeg),
          affectedServoIds: ids,
          reset: !live,
          stop: () => pauseArm()
        });
      }
      if (!live) {
        addSystemLog("logs.armCommandSent");
      }
      return true;
    }

    const key = motionKeyForArm();
    const generation = bumpServoMotionGeneration(key);
    const motionConfig = resolveServoMotionConfig(servoSmoothPreset);
    const motionTargets = targets.map((target) => {
      const start = getPositionMotionStartAngle(target.servo, target.physicalAngleDeg, target.reverse);
      return { ...target, start, delta: target.physicalAngleDeg - start };
    });
    const maxDistance = Math.max(...motionTargets.map((target) => Math.abs(target.delta)), 0);
    const samples = createPositionTrajectory(0, maxDistance, motionConfig);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus(ids, "smoothing");
    for (const target of motionTargets) {
      beginServoSafetyMonitor({
        servo: target.servo,
        mode: "position",
        targetPositionRaw: angleDegToRaw(target.physicalAngleDeg),
        affectedServoIds: ids,
        reset: !live,
        stop: () => pauseArm()
      });
    }
    if (!live) {
      addLog("system", "arm smooth position start");
    }

    try {
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const progress = smoothStepQuintic(samplesToSend[index].progress);
        await enqueueServoSerialTask(async () => {
          for (const target of motionTargets) {
            await writeServoPositionUnlocked({
              servo: target.servo,
              physicalAngleDeg: target.start + target.delta * progress,
              speedRaw: target.speedRaw,
              acc: target.acc,
              waitMs: live ? 12 : 30,
              logFrame: false,
              live
            });
          }
        });
        if (index < samplesToSend.length - 1) {
          await sleepMs(motionConfig.tickMs);
        }
      }

      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus(ids, "idle");
        if (!live) {
          addSystemLog("logs.armCommandSent");
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForArm("idle");
        if (!live) {
          addSystemLog("logs.commandInvalid", "error");
        }
      }
      return false;
    }
  }

  return {
    calculateArmMotionTargets,
    runArmPositionMotion
  };
}
