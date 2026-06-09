import type { ChangeEvent } from "react";
import { clampServoLogicalAngle, type ServoProfile } from "@adapters/hardware/protocol";
import {
  WHEEL_SLIDER_CENTER_DEG,
  clampWheelSliderDeg,
  normalizeWheelMaxSpeedRaw
} from "@domains/servo/servoWheelSlider";
import {
  formatServoAngle,
  getServoCommandState,
  singleWheelTurnProgressKey,
  type ServoCommandState,
  type ServoCommandStateMap,
  type ServoControlMode,
  type PendingLiveAngleMove,
  type PendingLiveWheelMove
} from "@app/appModel";
import type { ArmConfig } from "@adapters/persistence/storage";

const LIVE_SERVO_COMMAND_DELAY_MS = 140;

interface UseServoCommandRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  armConfig: ArmConfig;
  cancelArmLiveMove: () => void;
  cancelLiveAngleMove: (id?: number) => void;
  cancelLiveWheelMove: (id?: number) => void;
  cancelServoSafetyMonitor: (id?: number) => void;
  cancelWheelTurnMonitor: (key?: string) => void;
  liveAngleSendingRef: { current: Record<number, boolean> };
  liveAngleTimerRef: { current: Record<number, number> };
  livePositionModeServoRef: { current: Set<number> };
  liveWheelSendingRef: { current: Record<number, boolean> };
  liveWheelTimerRef: { current: Record<number, number> };
  pendingLiveAngleRef: { current: Record<number, PendingLiveAngleMove> };
  pendingLiveWheelRef: { current: Record<number, PendingLiveWheelMove> };
  prepareServoPositionMode: (servo: ServoProfile, options?: { logFrame?: boolean; waitMs?: number }) => Promise<unknown>;
  runServoPositionMotion: (servo: ServoProfile, state: ServoCommandState, angle: number, options?: { live?: boolean }) => Promise<unknown>;
  sendMoveForServo: (servo: ServoProfile, state: ServoCommandState, options?: { live?: boolean }) => Promise<unknown>;
  servoBusReady: boolean;
  servoSerialQueueBusy: () => boolean;
  setServoCommandById: (updater: (current: ServoCommandStateMap) => ServoCommandStateMap) => void;
}

export function useServoCommandRuntime({
  addSystemLog,
  armConfig,
  cancelArmLiveMove,
  cancelLiveAngleMove,
  cancelLiveWheelMove,
  cancelServoSafetyMonitor,
  cancelWheelTurnMonitor,
  liveAngleSendingRef,
  liveAngleTimerRef,
  livePositionModeServoRef,
  liveWheelSendingRef,
  liveWheelTimerRef,
  pendingLiveAngleRef,
  pendingLiveWheelRef,
  prepareServoPositionMode,
  runServoPositionMotion,
  sendMoveForServo,
  servoBusReady,
  servoSerialQueueBusy,
  setServoCommandById
}: UseServoCommandRuntimeOptions) {
  function updateServoCommand(id: number, updater: (current: ServoCommandState) => ServoCommandState) {
    setServoCommandById((current) => ({
      ...current,
      [id]: updater(getServoCommandState(current, id))
    }));
  }

  function updateServoCommandField<K extends keyof ServoCommandState>(id: number, field: K, value: ServoCommandState[K]) {
    updateServoCommand(id, (current) => ({ ...current, [field]: value }));
  }

  function handleServoModeChange(servo: ServoProfile, mode: ServoControlMode) {
    const id = servo.id;
    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    if (armConfig.joints.some((joint) => joint.servoId === id)) {
      cancelArmLiveMove();
    }
    cancelWheelTurnMonitor(singleWheelTurnProgressKey(id));
    cancelServoSafetyMonitor(id);
    livePositionModeServoRef.current.delete(id);
    updateServoCommand(id, (current) => {
      if (mode === "wheel") {
        const speedValue = Number(current.speedRaw);
        const wheelSliderDeg = clampWheelSliderDeg(current.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : Number(current.wheelSliderDeg));
        return {
          ...current,
          mode,
          speedRaw: String(normalizeWheelMaxSpeedRaw(Number.isFinite(speedValue) ? speedValue : 300)),
          acc: "50",
          wheelSliderDeg: formatServoAngle(wheelSliderDeg)
        };
      }

      const speedValue = Number(current.speedRaw);
      return {
        ...current,
        mode,
        speedRaw: Number.isFinite(speedValue) && speedValue >= 0 ? current.speedRaw : "300"
      };
    });
    if (mode === "position" && servoBusReady) {
      void prepareServoPositionMode(servo, { waitMs: 40, logFrame: false });
    }
  }

  function handleLiveDragToggle(servo: ServoProfile, state: ServoCommandState, enabled: boolean) {
    const id = servo.id;
    if (!enabled) {
      cancelLiveAngleMove(id);
    }
    updateServoCommandField(id, "liveDragEnabled", enabled);
    if (enabled && state.mode === "position" && servoBusReady) {
      void prepareServoPositionMode(servo, { waitMs: 40, logFrame: false });
    }
  }

  function updateServoLogicalAngle(servo: ServoProfile, value: string) {
    if (value.trim() === "") {
      updateServoCommandField(servo.id, "angleDeg", "");
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    updateServoCommandField(servo.id, "angleDeg", formatServoAngle(clampServoLogicalAngle(servo, numericValue)));
  }

  function scheduleLiveAngleMove(servo: ServoProfile, state: ServoCommandState, angle: number) {
    if (!state.liveDragEnabled || state.mode !== "position" || !servoBusReady || !Number.isFinite(angle)) {
      return;
    }

    pendingLiveAngleRef.current[servo.id] = { servo, state: { ...state, angleDeg: String(angle) }, angle };
    if (liveAngleTimerRef.current[servo.id] !== undefined || liveAngleSendingRef.current[servo.id]) {
      return;
    }

    liveAngleTimerRef.current[servo.id] = window.setTimeout(() => {
      delete liveAngleTimerRef.current[servo.id];
      void flushLiveAngleMove(servo.id);
    }, LIVE_SERVO_COMMAND_DELAY_MS);
  }

  async function flushLiveAngleMove(id: number) {
    if (liveAngleSendingRef.current[id]) {
      return;
    }

    const pending = pendingLiveAngleRef.current[id];
    if (!pending || !pending.state.liveDragEnabled || pending.state.mode !== "position" || !servoBusReady) {
      delete pendingLiveAngleRef.current[id];
      return;
    }
    if (servoSerialQueueBusy()) {
      liveAngleTimerRef.current[id] = window.setTimeout(() => {
        delete liveAngleTimerRef.current[id];
        void flushLiveAngleMove(id);
      }, LIVE_SERVO_COMMAND_DELAY_MS);
      return;
    }
    delete pendingLiveAngleRef.current[id];

    liveAngleSendingRef.current[id] = true;
    try {
      await runServoPositionMotion(pending.servo, pending.state, pending.angle, { live: true });
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      liveAngleSendingRef.current[id] = false;
      if (pendingLiveAngleRef.current[id] && liveAngleTimerRef.current[id] === undefined) {
        liveAngleTimerRef.current[id] = window.setTimeout(() => {
          delete liveAngleTimerRef.current[id];
          void flushLiveAngleMove(id);
        }, LIVE_SERVO_COMMAND_DELAY_MS);
      }
    }
  }

  function scheduleLiveWheelMove(servo: ServoProfile, state: ServoCommandState) {
    if (state.mode !== "wheel" || !servoBusReady) {
      return;
    }

    pendingLiveWheelRef.current[servo.id] = { servo, state };
    if (liveWheelTimerRef.current[servo.id] !== undefined || liveWheelSendingRef.current[servo.id]) {
      return;
    }

    liveWheelTimerRef.current[servo.id] = window.setTimeout(() => {
      delete liveWheelTimerRef.current[servo.id];
      void flushLiveWheelMove(servo.id);
    }, LIVE_SERVO_COMMAND_DELAY_MS);
  }

  async function flushLiveWheelMove(id: number) {
    if (liveWheelSendingRef.current[id]) {
      return;
    }

    const pending = pendingLiveWheelRef.current[id];
    if (!pending || pending.state.mode !== "wheel" || !servoBusReady) {
      delete pendingLiveWheelRef.current[id];
      return;
    }
    if (servoSerialQueueBusy()) {
      liveWheelTimerRef.current[id] = window.setTimeout(() => {
        delete liveWheelTimerRef.current[id];
        void flushLiveWheelMove(id);
      }, LIVE_SERVO_COMMAND_DELAY_MS);
      return;
    }
    delete pendingLiveWheelRef.current[id];

    liveWheelSendingRef.current[id] = true;
    try {
      await sendMoveForServo(pending.servo, pending.state, { live: true });
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      liveWheelSendingRef.current[id] = false;
      if (pendingLiveWheelRef.current[id] && liveWheelTimerRef.current[id] === undefined) {
        liveWheelTimerRef.current[id] = window.setTimeout(() => {
          delete liveWheelTimerRef.current[id];
          void flushLiveWheelMove(id);
        }, LIVE_SERVO_COMMAND_DELAY_MS);
      }
    }
  }

  function handleAngleSliderChange(servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) {
    const nextAngle = event.target.value;
    updateServoLogicalAngle(servo, nextAngle);
    scheduleLiveAngleMove(servo, state, Number(nextAngle));
  }

  function updateServoWheelSlider(servo: ServoProfile, state: ServoCommandState, value: string) {
    if (value.trim() === "") {
      updateServoCommandField(servo.id, "wheelSliderDeg", "");
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const wheelSliderDeg = clampWheelSliderDeg(numericValue);
    const nextState = { ...state, wheelSliderDeg: formatServoAngle(wheelSliderDeg) };
    updateServoCommand(servo.id, () => nextState);
    scheduleLiveWheelMove(servo, nextState);
  }

  function updateServoWheelMaxSpeed(servo: ServoProfile, state: ServoCommandState, value: string) {
    if (value.trim() === "") {
      updateServoCommandField(servo.id, "speedRaw", "");
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const nextState = { ...state, speedRaw: String(normalizeWheelMaxSpeedRaw(numericValue)) };
    updateServoCommand(servo.id, () => nextState);
    scheduleLiveWheelMove(servo, nextState);
  }

  function handleWheelSliderChange(servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) {
    updateServoWheelSlider(servo, state, event.target.value);
  }

  return {
    flushLiveAngleMove,
    flushLiveWheelMove,
    handleAngleSliderChange,
    handleLiveDragToggle,
    handleServoModeChange,
    handleWheelSliderChange,
    scheduleLiveAngleMove,
    scheduleLiveWheelMove,
    updateServoCommand,
    updateServoCommandField,
    updateServoLogicalAngle,
    updateServoWheelMaxSpeed,
    updateServoWheelSlider
  };
}
