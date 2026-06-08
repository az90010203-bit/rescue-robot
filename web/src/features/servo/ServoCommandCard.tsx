import { Activity, Power, PowerOff, Radar, Send, Square } from "lucide-react";
import type { ChangeEvent } from "react";
import type { TFunction } from "i18next";
import { Metric } from "../../shared/ui/AppChrome";
import {
  DEFAULT_WHEEL_SPEED_LIMIT,
  angleDegToRaw,
  applyServoWheelDirection,
  clampServoLogicalAngle,
  servoLogicalSpan,
  servoLogicalToPhysicalAngleWithReverse,
  type ServoProfile
} from "../../lib/protocol";
import {
  WHEEL_SLIDER_CENTER_DEG,
  WHEEL_SLIDER_MAX_DEG,
  WHEEL_SLIDER_MIN_DEG,
  clampWheelSliderDeg,
  normalizeWheelMaxSpeedRaw,
  wheelSliderDirection,
  wheelSliderToCommandSpeedRaw
} from "../../lib/servoWheelSlider";
import {
  formatServoAngle,
  getServoCommandState,
  safeFramePreview,
  safeSpeedFramePreview,
  singleWheelTurnProgressKey,
  type ServoCommandState,
  type ServoCommandStateMap,
  type ServoControlMode,
  type ServoFeedbackMap,
  type ServoMotionStatusMap,
  type ServoSafetyDisplayStatus,
  type ServoSafetyStatusMap,
  type WheelTurnProgress
} from "../../app/appModel";

interface ServoCommandCardProps {
  formatWheelSliderDirectionLabel: (direction: ReturnType<typeof wheelSliderDirection>) => string;
  handleAngleSliderChange: (servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) => void;
  handleLiveDragToggle: (id: number, enabled: boolean) => void;
  handleServoModeChange: (id: number, mode: ServoControlMode) => void;
  handleWheelSliderChange: (servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) => void;
  pauseServo: (servo: ServoProfile, state: ServoCommandState) => void;
  pingServo: (servo: ServoProfile) => void;
  readServo: (servo: ServoProfile) => void;
  selectedId: number | "";
  sendMoveForServo: (servo: ServoProfile, state: ServoCommandState) => void;
  servo: ServoProfile;
  servoCommandById: ServoCommandStateMap;
  servoFeedback: ServoFeedbackMap;
  servoMotionStatusById: ServoMotionStatusMap;
  servoSafetyStatusById: ServoSafetyStatusMap;
  servoSafetyStatusLabel: (status?: ServoSafetyDisplayStatus) => string;
  servoSafetyStatusTone: (status?: ServoSafetyDisplayStatus) => "neutral" | "online" | "warning" | "danger";
  setSelectedId: (id: number | "") => void;
  setTorqueForServo: (servo: ServoProfile, enabled: boolean) => void;
  t: TFunction;
  updateServoCommandField: <K extends keyof ServoCommandState>(id: number, field: K, value: ServoCommandState[K]) => void;
  updateServoLogicalAngle: (servo: ServoProfile, value: string) => void;
  updateServoWheelMaxSpeed: (servo: ServoProfile, state: ServoCommandState, value: string) => void;
  updateServoWheelSlider: (servo: ServoProfile, state: ServoCommandState, value: string) => void;
  wheelTurnProgress: Record<string, WheelTurnProgress>;
}

export function ServoCommandCard({
  formatWheelSliderDirectionLabel,
  handleAngleSliderChange,
  handleLiveDragToggle,
  handleServoModeChange,
  handleWheelSliderChange,
  pauseServo,
  pingServo,
  readServo,
  selectedId,
  sendMoveForServo,
  servo,
  servoCommandById,
  servoFeedback,
  servoMotionStatusById,
  servoSafetyStatusById,
  servoSafetyStatusLabel,
  servoSafetyStatusTone,
  setSelectedId,
  setTorqueForServo,
  t,
  updateServoCommandField,
  updateServoLogicalAngle,
  updateServoWheelMaxSpeed,
  updateServoWheelSlider,
  wheelTurnProgress
}: ServoCommandCardProps) {
  const state = getServoCommandState(servoCommandById, servo.id);
  const numericAngle = Number(state.angleDeg);
  const numericSpeed = Number(state.speedRaw);
  const numericAcc = state.acc.trim() === "" ? undefined : Number(state.acc);
  const logicalSpan = servoLogicalSpan(servo);
  const clampedLogicalAngle = clampServoLogicalAngle(servo, numericAngle);
  const physicalAngle = servoLogicalToPhysicalAngleWithReverse(servo, numericAngle, state.reverse);
  const wheelSliderValue = state.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : clampWheelSliderDeg(Number(state.wheelSliderDeg));
  const wheelSliderInputValue = state.wheelSliderDeg.trim() === "" ? "" : formatServoAngle(wheelSliderValue);
  const wheelMaxSpeedRaw = state.speedRaw.trim() === "" ? 0 : normalizeWheelMaxSpeedRaw(numericSpeed);
  const commandWheelSpeedRaw = state.mode === "wheel" ? wheelSliderToCommandSpeedRaw(wheelSliderValue, wheelMaxSpeedRaw) : 0;
  const wheelDirection = wheelSliderDirection(wheelSliderValue);
  const effectiveWheelSpeed = state.mode === "wheel" ? applyServoWheelDirection(servo, commandWheelSpeedRaw, state.reverse) : Number.isFinite(numericSpeed) ? applyServoWheelDirection(servo, numericSpeed, state.reverse) : Number.NaN;
  const angleSliderValue = Number.isFinite(numericAngle) ? formatServoAngle(clampedLogicalAngle) : "0";
  const rawPosition = state.mode === "position" && Number.isFinite(numericAngle) ? angleDegToRaw(physicalAngle) : "--";
  const speedRpm = state.mode === "wheel" ? Math.abs(commandWheelSpeedRaw) * 0.732 : Number.isFinite(numericSpeed) ? Math.abs(numericSpeed) * 0.732 : 0;
  const turnProgress = wheelTurnProgress[singleWheelTurnProgressKey(servo.id)];
  const motionStatus = servoMotionStatusById[servo.id] ?? "idle";
  const previewFrame =
    (state.mode === "wheel" || Number.isFinite(numericSpeed)) && (state.mode === "wheel" || Number.isFinite(numericAngle))
      ? state.mode === "wheel"
        ? safeSpeedFramePreview(servo.id, servo.name, effectiveWheelSpeed, numericAcc)
        : safeFramePreview(servo.id, servo.name, physicalAngle, numericSpeed, numericAcc)
      : "";
  const feedback = servoFeedback[servo.id];
  const safetyStatus = servoSafetyStatusById[servo.id];
  const safetyTone = servoSafetyStatusTone(safetyStatus);

  return (
    <article className={selectedId === servo.id ? "servo-command-card selected" : "servo-command-card"} key={servo.id}>
      <div className="servo-command-card-header">
        <button className="servo-card-select" onClick={() => setSelectedId(servo.id)} type="button">
          <span className="device-id">ID {servo.id}</span>
          <span className="device-name">{servo.name}</span>
        </button>
        <div className="servo-card-status-stack">
          <span className={motionStatus === "smoothing" ? "device-signal motion" : motionStatus === "paused" ? "device-signal motion paused" : "device-signal motion muted"}>{t(`servo.motionStatus.${motionStatus}`)}</span>
          <span className={`device-signal safety ${safetyTone}`}>{servoSafetyStatusLabel(safetyStatus)}</span>
          <span className={feedback ? "device-signal" : "device-signal muted"}>{feedback ? (feedback.moving ? t("metrics.moving") : t("device.data")) : t("device.idle")}</span>
        </div>
      </div>

      <div className="command-grid servo-command-grid">
        <label>
          <span>{t("fields.controlMode")}</span>
          <select value={state.mode} onChange={(event) => handleServoModeChange(servo.id, event.target.value as ServoControlMode)}>
            <option value="position">{t("fields.positionMode")}</option>
            <option value="wheel">{t("fields.wheelMode")}</option>
          </select>
        </label>
        {state.mode === "wheel" ? (
          <div className="angle-combo-field wheel-slider-field">
            <div className="angle-field-heading">
              <span>{t("fields.wheelSliderDeg")}</span>
              <span className={`wheel-direction-pill ${wheelDirection}`}>{formatWheelSliderDirectionLabel(wheelDirection)}</span>
            </div>
            <div className="range-number-control">
              <input className="angle-range" aria-label={`${servo.name} ${t("fields.wheelSliderDeg")}`} type="range" min={WHEEL_SLIDER_MIN_DEG} max={WHEEL_SLIDER_MAX_DEG} step={1} value={formatServoAngle(wheelSliderValue)} onChange={(event) => handleWheelSliderChange(servo, state, event)} />
              <input className="angle-number" aria-label={`${servo.name} ${t("fields.wheelSliderDeg")}`} type="number" min={WHEEL_SLIDER_MIN_DEG} max={WHEEL_SLIDER_MAX_DEG} step={1} value={wheelSliderInputValue} onChange={(event) => updateServoWheelSlider(servo, state, event.target.value)} />
            </div>
          </div>
        ) : (
          <div className="angle-combo-field">
            <div className="angle-field-heading">
              <span>{t("fields.angleDeg")}</span>
              <label className="live-drag-toggle">
                <input checked={state.liveDragEnabled} type="checkbox" onChange={(event) => handleLiveDragToggle(servo.id, event.target.checked)} />
                <span>{t("fields.liveDrag")}</span>
              </label>
            </div>
            <div className="range-number-control">
              <input className="angle-range" aria-label={`${servo.name} ${t("fields.angleDeg")}`} type="range" min={0} max={logicalSpan} step={1} value={angleSliderValue} onChange={(event) => handleAngleSliderChange(servo, state, event)} />
              <input className="angle-number" aria-label={`${servo.name} ${t("fields.angleDeg")}`} type="number" min={0} max={logicalSpan} step={1} value={state.angleDeg} onChange={(event) => updateServoLogicalAngle(servo, event.target.value)} />
            </div>
          </div>
        )}
        <label>
          <span>{state.mode === "wheel" ? t("fields.wheelMaxSpeedRaw") : t("fields.speedRaw")}</span>
          <input type="number" min={0} max={state.mode === "wheel" ? DEFAULT_WHEEL_SPEED_LIMIT : 4095} step={1} value={state.speedRaw} onChange={(event) => (state.mode === "wheel" ? updateServoWheelMaxSpeed(servo, state, event.target.value) : updateServoCommandField(servo.id, "speedRaw", event.target.value))} />
        </label>
        <label>
          <span>{t("fields.acceleration")}</span>
          <input type="number" min={0} max={254} step={1} value={state.acc} onChange={(event) => updateServoCommandField(servo.id, "acc", event.target.value)} />
        </label>
      </div>

      <div className="servo-extra-grid">
        <label className="checkbox-field">
          <input type="checkbox" checked={state.reverse} onChange={(event) => updateServoCommandField(servo.id, "reverse", event.target.checked)} />
          <span>{t("fields.temporaryReverse")}</span>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={state.wheelTurnsEnabled} disabled={state.mode !== "wheel"} onChange={(event) => updateServoCommandField(servo.id, "wheelTurnsEnabled", event.target.checked)} />
          <span>{t("fields.limitTurns")}</span>
        </label>
        <label>
          <span>{t("fields.turnsTarget")}</span>
          <input type="number" min={0.01} step={0.1} disabled={state.mode !== "wheel" || !state.wheelTurnsEnabled} value={state.wheelTurnsTarget} onChange={(event) => updateServoCommandField(servo.id, "wheelTurnsTarget", event.target.value)} />
        </label>
        <Metric label={t("metrics.turnProgress")} value={turnProgress ? `${turnProgress.completedTurns.toFixed(2)} / ${turnProgress.targetTurns}` : "--"} tone={turnProgress?.running ? "warning" : "neutral"} />
      </div>

      <div className="preview-grid servo-card-preview-grid">
        <Metric label={t("fields.actualAngle")} value={state.mode === "position" && Number.isFinite(numericAngle) ? physicalAngle.toFixed(0) : "--"} suffix={state.mode === "position" && Number.isFinite(numericAngle) ? " deg" : ""} />
        <Metric label={t("metrics.rawPosition")} value={rawPosition} />
        {state.mode === "wheel" ? (
          <>
            <Metric label={t("metrics.direction")} value={formatWheelSliderDirectionLabel(wheelDirection)} />
            <Metric label={t("metrics.commandSpeedRaw")} value={commandWheelSpeedRaw} suffix=" raw" />
          </>
        ) : null}
        <Metric label={t("metrics.speed")} value={Number.isFinite(speedRpm) ? speedRpm.toFixed(1) : "--"} suffix={Number.isFinite(speedRpm) ? " rpm" : ""} />
        <Metric className="frame-preview" label={t("metrics.frame")} value={previewFrame || "--"} code />
      </div>

      <div className="servo-card-telemetry">
        <span><small>{t("metrics.position")}</small><strong>{feedback?.positionDeg === undefined ? "--" : `${feedback.positionDeg.toFixed(1)}°`}</strong></span>
        <span><small>{t("metrics.load")}</small><strong>{feedback?.loadPercent === undefined ? "--" : `${feedback.loadPercent.toFixed(1)}%`}</strong></span>
        <span><small>{t("metrics.voltage")}</small><strong>{feedback?.voltageV === undefined ? "--" : `${feedback.voltageV.toFixed(1)}V`}</strong></span>
        <span><small>{t("metrics.temp")}</small><strong>{feedback ? `${feedback.temperatureC}°C` : "--"}</strong></span>
        <span><small>{t("metrics.moving")}</small><strong>{feedback ? (feedback.moving ? t("common.yes") : t("common.no")) : "--"}</strong></span>
        <span><small>{t("metrics.current")}</small><strong>{feedback?.currentMa === undefined ? "--" : `${feedback.currentMa.toFixed(1)}mA`}</strong></span>
        <span><small>{t("metrics.safety")}</small><strong>{servoSafetyStatusLabel(safetyStatus)}</strong></span>
      </div>

      <div className="action-grid servo-card-actions">
        <button className="icon-button primary" onClick={() => sendMoveForServo(servo, state)} type="button"><Send size={18} /><span>{t("actions.sendCommand")}</span></button>
        <button className="icon-button danger" onClick={() => pauseServo(servo, state)} type="button"><Square size={18} /><span>{t("actions.pause")}</span></button>
        <button className="icon-button" onClick={() => pingServo(servo)} type="button"><Radar size={18} /><span>{t("actions.ping")}</span></button>
        <button className="icon-button" onClick={() => readServo(servo)} type="button"><Activity size={18} /><span>{t("actions.readFeedback")}</span></button>
        <button className="icon-button" onClick={() => setTorqueForServo(servo, true)} type="button"><Power size={18} /><span>{t("actions.torqueOn")}</span></button>
        <button className="icon-button" onClick={() => setTorqueForServo(servo, false)} type="button"><PowerOff size={18} /><span>{t("actions.torqueOff")}</span></button>
      </div>
    </article>
  );
}
