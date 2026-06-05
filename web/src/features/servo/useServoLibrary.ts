import type { FormEvent } from "react";
import {
  clampServoCommandStateToLimits,
  singleWheelTurnProgressKey,
  type ServoCommandState,
  type ServoCommandStateMap,
  type ServoFeedbackMap,
  type ServoMotionStatusMap
} from "../../app/appModel";
import { clamp, normalizeServoProfile, type ServoProfile } from "../../lib/protocol";
import { validateServoDraft } from "../../lib/storage";

interface UseServoLibraryOptions {
  cancelLiveAngleMove: (id?: number) => void;
  cancelLiveWheelMove: (id?: number) => void;
  cancelServoLinkageMove: (id?: string) => void;
  cancelServoSafetyMonitor: (id?: number) => void;
  cancelWheelTurnMonitor: (key?: string) => void;
  lastServoPhysicalAngleRef: { current: Record<number, number> };
  lastServoWheelSpeedRef: { current: Record<number, number> };
  livePositionModeServoRef: { current: Set<number> };
  selectedId: number | "";
  servoDraft: any;
  servos: ServoProfile[];
  setSelectedId: (id: number | "") => void;
  setServoCommandById: (updater: (current: ServoCommandStateMap) => ServoCommandStateMap) => void;
  setServoDraft: (draft: any) => void;
  setServoFeedback: (updater: (current: ServoFeedbackMap) => ServoFeedbackMap) => void;
  setServoLibraryError: (error: any) => void;
  setServoMotionStatusById: (updater: (current: ServoMotionStatusMap) => ServoMotionStatusMap) => void;
  setServos: (updater: ServoProfile[] | ((current: ServoProfile[]) => ServoProfile[])) => void;
  updateServoCommand: (id: number, updater: (current: ServoCommandState) => ServoCommandState) => void;
}

export function useServoLibrary({
  cancelLiveAngleMove,
  cancelLiveWheelMove,
  cancelServoLinkageMove,
  cancelServoSafetyMonitor,
  cancelWheelTurnMonitor,
  lastServoPhysicalAngleRef,
  lastServoWheelSpeedRef,
  livePositionModeServoRef,
  selectedId,
  servoDraft,
  servos,
  setSelectedId,
  setServoCommandById,
  setServoDraft,
  setServoFeedback,
  setServoLibraryError,
  setServoMotionStatusById,
  setServos,
  updateServoCommand
}: UseServoLibraryOptions) {
  function addServo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateServoDraft(servoDraft, servos);
    if (error) {
      setServoLibraryError(error);
      return;
    }

    const servo = normalizeServoProfile({ id: Number(servoDraft.id), name: servoDraft.name.trim() });
    setServos((current) => [...current, servo].sort((a, b) => a.id - b.id));
    setSelectedId(servo.id);
    setServoDraft({ id: String(servo.id + 1), name: `J${servo.id + 1}` });
    setServoLibraryError(null);
  }

  function removeServo(id: number) {
    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    cancelWheelTurnMonitor(singleWheelTurnProgressKey(id));
    cancelServoSafetyMonitor(id);
    cancelServoLinkageMove();
    livePositionModeServoRef.current.delete(id);
    delete lastServoPhysicalAngleRef.current[id];
    delete lastServoWheelSpeedRef.current[id];
    setServos((current) => current.filter((servo) => servo.id !== id));
    setServoCommandById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setServoFeedback((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setServoMotionStatusById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (selectedId === id) {
      setSelectedId("");
    }
  }

  function updateServoLimit(id: number, field: "minDeg" | "maxDeg", value: string) {
    const numericValue = Number(value);
    const servo = servos.find((item) => item.id === id);
    if (!servo || !Number.isFinite(numericValue)) {
      return;
    }

    const current = normalizeServoProfile(servo);
    const clampedValue = clamp(numericValue, 0, 360);
    const minDeg = field === "minDeg" ? clampedValue : current.minDeg!;
    const maxDeg = field === "maxDeg" ? clampedValue : current.maxDeg!;
    if (minDeg >= maxDeg) {
      return;
    }
    const next = normalizeServoProfile({ ...current, minDeg, maxDeg });

    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    setServos((items) => items.map((item) => (item.id === id ? next : item)));
    updateServoCommand(id, (state) => clampServoCommandStateToLimits(state, next));
  }

  function updateServoDirection(id: number, reversed: boolean) {
    const servo = servos.find((item) => item.id === id);
    if (!servo) {
      return;
    }

    const next = normalizeServoProfile({ ...servo, direction: reversed ? -1 : 1 });
    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    setServos((items) => items.map((item) => (item.id === id ? next : item)));
    updateServoCommand(id, (state) => clampServoCommandStateToLimits(state, next));
  }

  return {
    addServo,
    removeServo,
    updateServoDirection,
    updateServoLimit
  };
}
