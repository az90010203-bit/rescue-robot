import { angleDegToRaw, servoLogicalToPhysicalAngleWithReverse, type ServoProfile } from "@adapters/hardware/protocol";
import { createPositionTrajectory, createWheelSpeedTrajectory, resolveServoMotionConfig, smoothStepQuintic, type ServoSmoothPreset } from "@domains/servo/servoMotion";
import { calculateServoLinkageTargets, calculateServoLinkageWheelTargets, type ServoLinkageGroup, type ServoLinkageWheelDirection } from "@adapters/persistence/storage";
import { singleWheelTurnProgressKey, type ServoCommandState } from "@app/appModel";
type ServoStatus = "idle" | "paused" | "smoothing"; type PositionWrite = { servo: ServoProfile; physicalAngleDeg: number; speedRaw: number; acc: number | undefined; waitMs: number; logFrame: boolean };
type WheelWrite = { servo: ServoProfile; speedRaw: number; acc: number | undefined; setupMode: boolean; waitMs: number; logFrame: boolean }; interface UseServoMotionRuntimeOptions {
  addLog: (source: "rx" | "tx" | "system", message: string, level?: any) => void;
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  beginServoSafetyMonitor: (options: any) => void;
  bumpServoMotionGeneration: (key: string) => number;
  cancelLiveAngleMove: (id?: number) => void;
  cancelServoLinkageMove: (id?: string) => void;
  cancelServoLinkageWheelTurnMonitors: (groupId: string) => void;
  cancelServoMotionForLinkage: (id: string, status?: ServoStatus) => void;
  cancelServoMotionForServo: (id: number, status?: ServoStatus) => void;
  cancelServoSafetyMonitor: (id?: number) => void;
  cancelWheelTurnMonitor: (key?: string) => void;
  enqueueServoSerialTask: <T>(task: () => Promise<T>) => Promise<T>;
  getPositionMotionStartAngle: (servo: ServoProfile, targetPhysicalAngle: number, reverse?: boolean) => number;
  getWheelMotionStartSpeed: (id: number) => number;
  isServoMotionCurrent: (key: string, generation: number) => boolean;
  motionKeyForLinkage: (id: string) => string;
  motionKeyForServo: (id: number) => string;
  pauseServo: (servo: ServoProfile, state: ServoCommandState) => Promise<void>;
  pauseServoLinkageGroup: (group: ServoLinkageGroup) => Promise<void>;
  servoBusConnected: () => boolean;
  servoSmoothPreset: ServoSmoothPreset;
  servoSmoothingEnabled: boolean;
  servos: ServoProfile[];
  setServoMotionStatus: (ids: number[], status: ServoStatus) => void;
  sleepMs: (ms: number) => Promise<void>;
  syncServoLinkageTargetsToCommands: (group: ServoLinkageGroup) => void;
  syncServoLinkageWheelTargetsToCommands: (group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) => void;
  writeServoPositionUnlocked: (options: PositionWrite) => Promise<any>;
  writeServoWheelSpeedUnlocked: (options: WheelWrite) => Promise<any>;
}
export function useServoMotionRuntime({
  addLog,
  addSystemLog,
  beginServoSafetyMonitor,
  bumpServoMotionGeneration,
  cancelLiveAngleMove,
  cancelServoLinkageMove,
  cancelServoLinkageWheelTurnMonitors,
  cancelServoMotionForLinkage,
  cancelServoMotionForServo,
  cancelServoSafetyMonitor,
  cancelWheelTurnMonitor,
  enqueueServoSerialTask,
  getPositionMotionStartAngle,
  getWheelMotionStartSpeed,
  isServoMotionCurrent,
  motionKeyForLinkage,
  motionKeyForServo,
  pauseServo,
  pauseServoLinkageGroup,
  servoBusConnected,
  servoSmoothPreset,
  servoSmoothingEnabled,
  servos,
  setServoMotionStatus,
  sleepMs,
  syncServoLinkageTargetsToCommands,
  syncServoLinkageWheelTargetsToCommands,
  writeServoPositionUnlocked,
  writeServoWheelSpeedUnlocked
}: UseServoMotionRuntimeOptions) {
  function parseServoAcc(state: ServoCommandState) {
    return state.acc.trim() === "" ? undefined : Number(state.acc);
  }
  async function runServoPositionMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    logicalAngleDeg: number,
    options: { live?: boolean } = {}
  ) {
    const live = options.live ?? false;
    const speedValue = Number(state.speedRaw);
    const acc = parseServoAcc(state);
    const targetPhysicalAngle = servoLogicalToPhysicalAngleWithReverse(servo, logicalAngleDeg, state.reverse);
    cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));
    if (!servoBusConnected()) {
      if (!live) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }
    if (!servoSmoothingEnabled) {
      cancelServoMotionForServo(servo.id, "idle");
      const sent = await enqueueServoSerialTask(() =>
        writeServoPositionUnlocked({
          servo,
          physicalAngleDeg: targetPhysicalAngle,
          speedRaw: speedValue,
          acc,
          waitMs: live ? 12 : 80,
          logFrame: !live
        })
      );
      if (sent) {
        beginServoSafetyMonitor({
          servo,
          mode: "position",
          targetPositionRaw: angleDegToRaw(targetPhysicalAngle),
          reset: !live,
          stop: () => pauseServo(servo, state)
        });
      }
      return sent;
    }
    const key = motionKeyForServo(servo.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const startPhysicalAngle = getPositionMotionStartAngle(servo, targetPhysicalAngle, state.reverse);
    const samples = createPositionTrajectory(startPhysicalAngle, targetPhysicalAngle, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus([servo.id], "smoothing");
    beginServoSafetyMonitor({
      servo,
      mode: "position",
      targetPositionRaw: angleDegToRaw(targetPhysicalAngle),
      reset: !live,
      stop: () => pauseServo(servo, state)
    });
    if (!live) {
      addLog("system", `ID${servo.id} smooth position ${startPhysicalAngle.toFixed(1)} -> ${targetPhysicalAngle.toFixed(1)}`);
    }
    try {
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const sample = samplesToSend[index];
        const sent = await enqueueServoSerialTask(() =>
          writeServoPositionUnlocked({
            servo,
            physicalAngleDeg: sample.value,
            speedRaw: speedValue,
            acc,
            waitMs: live ? 12 : 30,
            logFrame: false
          })
        );
        if (!sent || !isServoMotionCurrent(key, generation)) {
          if (!sent) {
            cancelServoSafetyMonitor(servo.id);
          }
          return false;
        }
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }
      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus([servo.id], "idle");
        if (!live) {
          addLog("system", `ID${servo.id} smooth position complete`);
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForServo(servo.id, "idle");
        addSystemLog("logs.commandInvalid", "error");
      }
      return false;
    }
  }
  async function runServoWheelMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    effectiveWheelSpeed: number,
    options: { live?: boolean; log?: boolean } = {}
  ) {
    const live = options.live ?? false;
    const log = options.log ?? true;
    const acc = parseServoAcc(state);
    cancelLiveAngleMove(servo.id);
    if (!servoBusConnected()) {
      if (log) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }
    if (!servoSmoothingEnabled) {
      cancelServoMotionForServo(servo.id, "idle");
      const sent = await enqueueServoSerialTask(() =>
        writeServoWheelSpeedUnlocked({
          servo,
          speedRaw: effectiveWheelSpeed,
          acc,
          setupMode: true,
          waitMs: 60,
          logFrame: log
        })
      );
      if (sent) {
        beginServoSafetyMonitor({
          servo,
          mode: "wheel",
          targetSpeedRaw: effectiveWheelSpeed,
          reset: !live,
          stop: () => pauseServo(servo, state)
        });
      }
      return sent;
    }
    const key = motionKeyForServo(servo.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const startSpeed = getWheelMotionStartSpeed(servo.id);
    const samples = createWheelSpeedTrajectory(startSpeed, effectiveWheelSpeed, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus([servo.id], "smoothing");
    beginServoSafetyMonitor({
      servo,
      mode: "wheel",
      targetSpeedRaw: effectiveWheelSpeed,
      reset: !live,
      stop: () => pauseServo(servo, state)
    });
    if (log) {
      addLog("system", `ID${servo.id} smooth speed ${Math.round(startSpeed)} -> ${Math.round(effectiveWheelSpeed)}`);
    }
    try {
      await enqueueServoSerialTask(() =>
        writeServoWheelSpeedUnlocked({
          servo,
          speedRaw: startSpeed,
          acc,
          setupMode: true,
          waitMs: 30,
          logFrame: false
        })
      );
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const sample = samplesToSend[index];
        const sent = await enqueueServoSerialTask(() =>
          writeServoWheelSpeedUnlocked({
            servo,
            speedRaw: Math.round(sample.value),
            acc,
            setupMode: false,
            waitMs: 24,
            logFrame: false
          })
        );
        if (!sent || !isServoMotionCurrent(key, generation)) {
          if (!sent) {
            cancelServoSafetyMonitor(servo.id);
          }
          return false;
        }
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }
      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus([servo.id], "idle");
        if (log) {
          addLog("system", `ID${servo.id} smooth speed complete`);
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForServo(servo.id, "idle");
        addSystemLog("logs.commandInvalid", "error");
      }
      return false;
    }
  }
  async function runServoLinkagePositionMotion(group: ServoLinkageGroup, live = false) {
    const targets = calculateServoLinkageTargets(group, servos);
    syncServoLinkageTargetsToCommands(group);
    if (targets.length === 0) {
      if (!live) {
        addSystemLog("logs.linkageNoTargets", "warn");
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
    if (!servoSmoothingEnabled) {
      cancelServoMotionForLinkage(group.id, "idle");
      await enqueueServoSerialTask(async () => {
        for (const target of targets) {
          await writeServoPositionUnlocked({
            servo: target.servo,
            physicalAngleDeg: target.physicalAngleDeg,
            speedRaw: target.speedRaw,
            acc: target.acc,
            waitMs: live ? 12 : 80,
            logFrame: !live
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
          stop: () => pauseServoLinkageGroup(group)
        });
      }
      if (!live) {
        addSystemLog("logs.linkageCommandSent");
      }
      return true;
    }
    const key = motionKeyForLinkage(group.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const motionTargets = targets.map((target) => {
      const start = getPositionMotionStartAngle(target.servo, target.physicalAngleDeg, target.reverse);
      return { ...target, start, delta: target.physicalAngleDeg - start };
    });
    const maxDistance = Math.max(...motionTargets.map((target) => Math.abs(target.delta)), 0);
    const samples = createPositionTrajectory(0, maxDistance, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus(ids, "smoothing");
    for (const target of motionTargets) {
      beginServoSafetyMonitor({
        servo: target.servo,
        mode: "position",
        targetPositionRaw: angleDegToRaw(target.physicalAngleDeg),
        affectedServoIds: ids,
        reset: !live,
        stop: () => pauseServoLinkageGroup(group)
      });
    }
    if (!live) {
      addLog("system", `${group.name || group.id} smooth linkage start`);
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
              logFrame: false
            });
          }
        });
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }
      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus(ids, "idle");
        if (!live) {
          addSystemLog("logs.linkageCommandSent");
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForLinkage(group.id, "idle");
        if (!live) {
          addSystemLog("logs.commandInvalid", "error");
        }
      }
      return false;
    }
  }
  async function runServoLinkageWheelMotion(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) {
    const targets = calculateServoLinkageWheelTargets(group, servos, direction);
    syncServoLinkageWheelTargetsToCommands(group, direction);
    cancelServoLinkageMove(group.id);
    cancelServoLinkageWheelTurnMonitors(group.id);
    if (targets.length === 0) {
      addSystemLog("logs.linkageNoTargets", "warn");
      return false;
    }
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }
    const ids = targets.map((target) => target.servoId);
    if (!servoSmoothingEnabled) {
      cancelServoMotionForLinkage(group.id, "idle");
      await enqueueServoSerialTask(async () => {
        for (const target of targets) {
          await writeServoWheelSpeedUnlocked({
            servo: target.servo,
            speedRaw: target.effectiveSpeedRaw,
            acc: target.acc,
            setupMode: true,
            waitMs: 60,
            logFrame: true
          });
        }
      });
      for (const target of targets) {
        beginServoSafetyMonitor({
          servo: target.servo,
          mode: "wheel",
          targetSpeedRaw: target.effectiveSpeedRaw,
          affectedServoIds: ids,
          reset: true,
          stop: () => pauseServoLinkageGroup(group)
        });
      }
      addSystemLog("logs.linkageCommandSent");
      return true;
    }
    const key = motionKeyForLinkage(group.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const motionTargets = targets.map((target) => {
      const start = getWheelMotionStartSpeed(target.servoId);
      return { ...target, start, delta: target.effectiveSpeedRaw - start };
    });
    const maxDelta = Math.max(...motionTargets.map((target) => Math.abs(target.delta)), 0);
    const samples = createWheelSpeedTrajectory(0, maxDelta, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus(ids, "smoothing");
    for (const target of motionTargets) {
      beginServoSafetyMonitor({
        servo: target.servo,
        mode: "wheel",
        targetSpeedRaw: target.effectiveSpeedRaw,
        affectedServoIds: ids,
        reset: true,
        stop: () => pauseServoLinkageGroup(group)
      });
    }
    addLog("system", `${group.name || group.id} smooth wheel ${direction}`);
    try {
      await enqueueServoSerialTask(async () => {
        for (const target of motionTargets) {
          await writeServoWheelSpeedUnlocked({
            servo: target.servo,
            speedRaw: target.start,
            acc: target.acc,
            setupMode: true,
            waitMs: 30,
            logFrame: false
          });
        }
      });
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const progress = smoothStepQuintic(samplesToSend[index].progress);
        await enqueueServoSerialTask(async () => {
          for (const target of motionTargets) {
            await writeServoWheelSpeedUnlocked({
              servo: target.servo,
              speedRaw: Math.round(target.start + target.delta * progress),
              acc: target.acc,
              setupMode: false,
              waitMs: 24,
              logFrame: false
            });
          }
        });
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }
      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus(ids, "idle");
        addSystemLog("logs.linkageCommandSent");
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForLinkage(group.id, "idle");
        addSystemLog("logs.commandInvalid", "error");
      }
      return false;
    }
  }
  return {
    runServoLinkagePositionMotion,
    runServoLinkageWheelMotion,
    runServoPositionMotion,
    runServoWheelMotion
  };
}



