import { normalizeMotorChannel, type ServoProfile } from "../lib/protocol";
import type {
  PendingLiveAngleMove,
  PendingLiveWheelMove,
  PendingSingleMotorMove,
  ServoMotionDisplayStatus
} from "./appModel";
import type { MotorLinkageGroup, ServoLinkageGroup } from "../lib/storage";

interface UseAppCancellationRuntimeOptions {
  armLiveTimerRef: { current: number | undefined };
  cancelServoMotionForArm: (status?: ServoMotionDisplayStatus) => void;
  cancelServoMotionForLinkage: (id: string, status?: ServoMotionDisplayStatus) => void;
  cancelServoMotionForServo: (id: number, status?: ServoMotionDisplayStatus) => void;
  linkageLiveTimerRef: { current: Record<string, number> };
  liveAngleTimerRef: { current: Record<number, number> };
  liveWheelTimerRef: { current: Record<number, number> };
  motorLinkageGenerationRef: { current: Record<string, number> };
  motorLinkageGroupsRef: { current: MotorLinkageGroup[] };
  motorLinkageLiveTimerRef: { current: Record<string, number> };
  pendingArmConfigRef: { current: unknown };
  pendingLinkageMoveRef: { current: Record<string, ServoLinkageGroup> };
  pendingLiveAngleRef: { current: Record<number, PendingLiveAngleMove> };
  pendingLiveWheelRef: { current: Record<number, PendingLiveWheelMove> };
  pendingMotorLinkageMoveRef: { current: Record<string, MotorLinkageGroup> };
  pendingSingleMotorMoveRef: { current: PendingSingleMotorMove | null };
  servoLinkageGroupsRef: { current: ServoLinkageGroup[] };
  servos: ServoProfile[];
  singleMotorGenerationRef: { current: number };
  singleMotorLiveTimerRef: { current: number | undefined };
}

export function useAppCancellationRuntime({
  armLiveTimerRef,
  cancelServoMotionForArm,
  cancelServoMotionForLinkage,
  cancelServoMotionForServo,
  linkageLiveTimerRef,
  liveAngleTimerRef,
  liveWheelTimerRef,
  motorLinkageGenerationRef,
  motorLinkageGroupsRef,
  motorLinkageLiveTimerRef,
  pendingArmConfigRef,
  pendingLinkageMoveRef,
  pendingLiveAngleRef,
  pendingLiveWheelRef,
  pendingMotorLinkageMoveRef,
  pendingSingleMotorMoveRef,
  servoLinkageGroupsRef,
  servos,
  singleMotorGenerationRef,
  singleMotorLiveTimerRef
}: UseAppCancellationRuntimeOptions) {
  function cancelLiveAngleMove(id?: number) {
    if (id === undefined) {
      for (const timer of Object.values(liveAngleTimerRef.current)) {
        window.clearTimeout(timer);
      }
      liveAngleTimerRef.current = {};
      pendingLiveAngleRef.current = {};
      for (const servo of servos) {
        cancelServoMotionForServo(servo.id);
      }
      return;
    }

    delete pendingLiveAngleRef.current[id];
    const timer = liveAngleTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete liveAngleTimerRef.current[id];
    }
    cancelServoMotionForServo(id);
  }

  function cancelLiveWheelMove(id?: number) {
    if (id === undefined) {
      for (const timer of Object.values(liveWheelTimerRef.current)) {
        window.clearTimeout(timer);
      }
      liveWheelTimerRef.current = {};
      pendingLiveWheelRef.current = {};
      for (const servo of servos) {
        cancelServoMotionForServo(servo.id);
      }
      return;
    }

    delete pendingLiveWheelRef.current[id];
    const timer = liveWheelTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete liveWheelTimerRef.current[id];
    }
    cancelServoMotionForServo(id);
  }

  function cancelArmLiveMove(status: ServoMotionDisplayStatus = "idle") {
    pendingArmConfigRef.current = null;
    if (armLiveTimerRef.current !== undefined) {
      window.clearTimeout(armLiveTimerRef.current);
      armLiveTimerRef.current = undefined;
    }
    cancelServoMotionForArm(status);
  }

  function cancelServoLinkageMove(id?: string) {
    if (id === undefined) {
      for (const timer of Object.values(linkageLiveTimerRef.current)) {
        window.clearTimeout(timer);
      }
      linkageLiveTimerRef.current = {};
      pendingLinkageMoveRef.current = {};
      for (const group of servoLinkageGroupsRef.current) {
        cancelServoMotionForLinkage(group.id);
      }
      return;
    }

    delete pendingLinkageMoveRef.current[id];
    const timer = linkageLiveTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete linkageLiveTimerRef.current[id];
    }
    cancelServoMotionForLinkage(id);
  }

  function cancelMotorLinkageMove(id?: string) {
    if (id === undefined) {
      for (const timer of Object.values(motorLinkageLiveTimerRef.current)) {
        window.clearTimeout(timer);
      }
      for (const group of motorLinkageGroupsRef.current) {
        motorLinkageGenerationRef.current[group.id] = (motorLinkageGenerationRef.current[group.id] ?? 0) + 1;
      }
      for (const groupId of Object.keys(pendingMotorLinkageMoveRef.current)) {
        motorLinkageGenerationRef.current[groupId] = (motorLinkageGenerationRef.current[groupId] ?? 0) + 1;
      }
      motorLinkageLiveTimerRef.current = {};
      pendingMotorLinkageMoveRef.current = {};
      return;
    }

    motorLinkageGenerationRef.current[id] = (motorLinkageGenerationRef.current[id] ?? 0) + 1;
    delete pendingMotorLinkageMoveRef.current[id];
    const timer = motorLinkageLiveTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete motorLinkageLiveTimerRef.current[id];
    }
  }

  function cancelMotorLinkageMovesForChannels(channels: string[]) {
    const channelSet = new Set(channels.map(normalizeMotorChannel));
    for (const group of motorLinkageGroupsRef.current) {
      if (group.members.some((member) => channelSet.has(normalizeMotorChannel(member.channel)))) {
        cancelMotorLinkageMove(group.id);
      }
    }
  }

  function cancelSingleMotorMove(channel?: string) {
    const pending = pendingSingleMotorMoveRef.current;
    if (channel !== undefined && pending && normalizeMotorChannel(pending.channel) !== normalizeMotorChannel(channel)) {
      return;
    }

    singleMotorGenerationRef.current += 1;
    pendingSingleMotorMoveRef.current = null;
    if (singleMotorLiveTimerRef.current !== undefined) {
      window.clearTimeout(singleMotorLiveTimerRef.current);
      singleMotorLiveTimerRef.current = undefined;
    }
  }

  return {
    cancelArmLiveMove,
    cancelLiveAngleMove,
    cancelLiveWheelMove,
    cancelMotorLinkageMove,
    cancelMotorLinkageMovesForChannels,
    cancelServoLinkageMove,
    cancelSingleMotorMove
  };
}
