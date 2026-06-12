import type { PointerEvent as ReactPointerEvent } from "react";
import {
  armJointLocalEndDirectionDeg,
  calculateArmDragAngle,
  DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
  normalizeArmConfig,
  type ArmConfig,
  type ArmJointConfig,
  type ArmSegmentPose
} from "@adapters/persistence/storage";
import { clamp, normalizeServoProfile, servoLogicalSpan, type ServoProfile } from "@adapters/hardware/protocol";
import { updateArmJointNumberValue, type ArmJointNumberField } from "@domains/arm/armConfigEditing";

const ARM_LIVE_COMMAND_DELAY_MS = 180;

interface UseArmRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  armConfig: ArmConfig;
  armLiveSendingRef: { current: boolean };
  armLiveTimerRef: { current: number | undefined };
  armSegmentPoses: ArmSegmentPose[];
  cancelArmLiveMove: () => void;
  draggingArmJointIdRef: { current: string | null };
  pendingArmConfigRef: { current: ArmConfig | null };
  prepareServoPositionMode: (servo: ServoProfile, options?: { logFrame?: boolean; waitMs?: number }) => Promise<unknown>;
  runArmPositionMotion: (config: ArmConfig, live?: boolean) => Promise<unknown>;
  servoBusConnected: () => boolean;
  servoSerialQueueBusy: () => boolean;
  servos: ServoProfile[];
  setArmConfig: (value: ArmConfig | ((current: ArmConfig) => ArmConfig)) => void;
}

export function useArmRuntime({
  addSystemLog,
  armConfig,
  armLiveSendingRef,
  armLiveTimerRef,
  armSegmentPoses,
  cancelArmLiveMove,
  draggingArmJointIdRef,
  pendingArmConfigRef,
  prepareServoPositionMode,
  runArmPositionMotion,
  servoBusConnected,
  servoSerialQueueBusy,
  servos,
  setArmConfig
}: UseArmRuntimeOptions) {
  function updateArmConfigState(updater: (current: ArmConfig) => ArmConfig, live = false) {
    setArmConfig((current) => {
      const next = normalizeArmConfig(updater(current), servos);
      if (live && next.liveDragEnabled) {
        scheduleArmLiveMove(next);
      }
      return next;
    });
  }

  function armServoForJoint(joint: ArmJointConfig) {
    return servos.find((servo) => servo.id === joint.servoId);
  }

  function applyArmConfig(config: ArmConfig, live = false) {
    updateArmConfigState((current) => ({ ...config, liveDragEnabled: current.liveDragEnabled }), live);
  }

  function nextArmJointName(joints: ArmJointConfig[]) {
    const names = new Set(joints.map((joint) => joint.name.trim().toLowerCase()));
    for (let index = 1; index <= 99; index += 1) {
      const name = `Joint ${index}`;
      if (!names.has(name.toLowerCase())) {
        return name;
      }
    }
    return `Joint ${joints.length + 1}`;
  }

  function addArmJoint() {
    const usedServoIds = new Set(armConfig.joints.map((joint) => joint.servoId));
    const servo = servos.find((item) => !usedServoIds.has(item.id));
    if (!servo) {
      addSystemLog("logs.armNoAvailableServo", "warn");
      return;
    }

    const normalizedServo = normalizeServoProfile(servo);
    const neutralDeg = clamp(90, 0, servoLogicalSpan(normalizedServo));
    const id = `arm-joint-${Date.now().toString(36)}`;
    const joint: ArmJointConfig = {
      id,
      name: nextArmJointName(armConfig.joints),
      servoId: normalizedServo.id,
      lengthPx: 88,
      angleDeg: neutralDeg,
      neutralDeg,
      speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
      acc: 30,
      reverse: false,
      enabled: true,
      shapeSegments: [{ id: "main", name: "主段", lengthPx: 88, directionDeg: 0 }],
      childFrameOffsetDeg: 0
    };
    updateArmConfigState((current) => ({ ...current, joints: [...current.joints, joint], selectedJointId: id }));
  }

  function removeArmJoint(id: string) {
    updateArmConfigState((current) => {
      const joints = current.joints.filter((joint) => joint.id !== id);
      return {
        ...current,
        joints,
        selectedJointId: current.selectedJointId === id ? joints[0]?.id ?? null : current.selectedJointId
      };
    });
  }

  function moveArmJoint(id: string, delta: number) {
    updateArmConfigState((current) => {
      const index = current.joints.findIndex((joint) => joint.id === id);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.joints.length) {
        return current;
      }
      const joints = [...current.joints];
      const [joint] = joints.splice(index, 1);
      joints.splice(nextIndex, 0, joint);
      return { ...current, joints };
    });
  }

  function updateArmJoint(id: string, updater: (joint: ArmJointConfig) => ArmJointConfig, live = false) {
    updateArmConfigState(
      (current) => ({
        ...current,
        selectedJointId: id,
        joints: current.joints.map((joint) => (joint.id === id ? updater(joint) : joint))
      }),
      live
    );
  }

  function updateArmJointNumber(id: string, field: ArmJointNumberField, value: string, live = false) {
    if (value.trim() === "") {
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    updateArmJoint(
      id,
      (joint) => {
        const servo = armServoForJoint(joint);
        return updateArmJointNumberValue(joint, field, numericValue, servo);
      },
      live
    );
  }

  function updateArmJointServo(id: string, servoId: number) {
    const servo = servos.find((item) => item.id === servoId);
    if (!servo) {
      return;
    }
    const normalizedServo = normalizeServoProfile(servo);
    const neutralDeg = clamp(90, 0, servoLogicalSpan(normalizedServo));
    updateArmJoint(id, (joint) => ({
      ...joint,
      servoId: normalizedServo.id,
      angleDeg: clamp(joint.angleDeg, 0, servoLogicalSpan(normalizedServo)),
      neutralDeg: clamp(Number.isFinite(joint.neutralDeg) ? joint.neutralDeg : neutralDeg, 0, servoLogicalSpan(normalizedServo))
    }));
  }

  function setArmLiveDragEnabled(enabled: boolean) {
    if (!enabled) {
      cancelArmLiveMove();
    } else if (servoBusConnected()) {
      const enabledServoIds = new Set(armConfig.joints.filter((joint) => joint.enabled).map((joint) => joint.servoId));
      for (const servo of servos) {
        if (enabledServoIds.has(servo.id)) {
          void prepareServoPositionMode(servo, { waitMs: 40, logFrame: false });
        }
      }
    }
    updateArmConfigState((current) => ({ ...current, liveDragEnabled: enabled }));
  }

  function scheduleArmLiveMove(config: ArmConfig) {
    if (!config.liveDragEnabled || !servoBusConnected()) {
      return;
    }
    pendingArmConfigRef.current = config;
    if (armLiveTimerRef.current !== undefined || armLiveSendingRef.current) {
      return;
    }
    armLiveTimerRef.current = window.setTimeout(() => {
      armLiveTimerRef.current = undefined;
      void flushArmLiveMove();
    }, ARM_LIVE_COMMAND_DELAY_MS);
  }

  async function flushArmLiveMove() {
    if (armLiveSendingRef.current) {
      return;
    }
    const pending = pendingArmConfigRef.current;
    if (!pending || !pending.liveDragEnabled || !servoBusConnected()) {
      pendingArmConfigRef.current = null;
      return;
    }
    if (servoSerialQueueBusy()) {
      armLiveTimerRef.current = window.setTimeout(() => {
        armLiveTimerRef.current = undefined;
        void flushArmLiveMove();
      }, ARM_LIVE_COMMAND_DELAY_MS);
      return;
    }
    pendingArmConfigRef.current = null;

    armLiveSendingRef.current = true;
    try {
      await runArmPositionMotion(pending, true);
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      armLiveSendingRef.current = false;
      if (pendingArmConfigRef.current && armLiveTimerRef.current === undefined) {
        armLiveTimerRef.current = window.setTimeout(() => {
          armLiveTimerRef.current = undefined;
          void flushArmLiveMove();
        }, ARM_LIVE_COMMAND_DELAY_MS);
      }
    }
  }

  function handleArmJointDrag(joint: ArmJointConfig, pointer: { x: number; y: number }) {
    const jointIndex = armConfig.joints.findIndex((item) => item.id === joint.id);
    const servo = armServoForJoint(joint);
    if (jointIndex < 0 || !servo) {
      return;
    }

    const previousPose = jointIndex > 0 ? armSegmentPoses[jointIndex - 1] : undefined;
    const currentPose = armSegmentPoses[jointIndex];
    const anchor = currentPose ? { x: currentPose.startX, y: currentPose.startY } : { x: 300, y: 250 };
    const nextAngle = calculateArmDragAngle({
      anchor,
      pointer,
      parentGlobalDeg: previousPose?.childFrameDeg ?? armConfig.baseDirectionDeg ?? 0,
      neutralDeg: joint.neutralDeg,
      servoSpanDeg: servoLogicalSpan(servo),
      currentAngleDeg: joint.angleDeg,
      localEndDirectionDeg: armJointLocalEndDirectionDeg(joint)
    });
    updateArmJointNumber(joint.id, "angleDeg", String(nextAngle), true);
  }

  function armSvgPoint(event: ReactPointerEvent<SVGElement>) {
    const svg = event.currentTarget instanceof SVGSVGElement ? event.currentTarget : event.currentTarget.ownerSVGElement;
    if (!svg) {
      return { x: 300, y: 250 };
    }
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 600,
      y: ((event.clientY - rect.top) / rect.height) * 420
    };
  }

  function handleArmPointerDown(event: ReactPointerEvent<SVGElement>, joint: ArmJointConfig) {
    event.preventDefault();
    draggingArmJointIdRef.current = joint.id;
    setArmConfig((current) => ({ ...current, selectedJointId: joint.id }));
    handleArmJointDrag(joint, armSvgPoint(event));
  }

  function handleArmPointerMove(event: ReactPointerEvent<SVGElement>) {
    const jointId = draggingArmJointIdRef.current;
    if (!jointId) {
      return;
    }
    const joint = armConfig.joints.find((item) => item.id === jointId);
    if (!joint) {
      return;
    }
    handleArmJointDrag(joint, armSvgPoint(event));
  }

  function handleArmPointerEnd() {
    draggingArmJointIdRef.current = null;
  }

  return {
    addArmJoint,
    applyArmConfig,
    armServoForJoint,
    flushArmLiveMove,
    handleArmPointerDown,
    handleArmPointerEnd,
    handleArmPointerMove,
    moveArmJoint,
    removeArmJoint,
    setArmLiveDragEnabled,
    updateArmJoint,
    updateArmJointNumber,
    updateArmJointServo
  };
}
