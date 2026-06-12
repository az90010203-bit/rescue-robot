import { Activity, RotateCcw, Save, Send, Settings, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import type { MotorFeedbackMap, MotorMappingField } from "@app/appModel";
import {
  ROBOMASTER_A_BOARD_GPIO_OPTIONS,
  normalizeMotorPin,
  type MotorDirection,
  type MotorPinRole,
  type MotorProfile,
  type MotorStopMode
} from "@adapters/hardware/protocol";
import type { MotorLinkageGroup, ValidationErrorKey } from "@adapters/persistence/storage";
import { Metric } from "@shared/ui/AppChrome";
import { MotorLinkageRunCard } from "@domains/motor/MotorLinkageCards";

const ENCODER_REALTIME_REFRESH_MS = 100;
const ENCODER_COMMAND_PAUSE_MS = 150;

interface MotorCommandPanelProps {
  aBoardBridgeConnected: boolean;
  aBoardBridgeDetail: string;
  aBoardBridgeError: string | null;
  aBoardBridgeLabel: string;
  aBoardBridgeTone: "neutral" | "online" | "warning" | "danger";
  enabledMotorLinkageGroups: MotorLinkageGroup[];
  formatDirectionLabel: (direction: MotorDirection | string) => string;
  formatLinkageMemberDirection: (reverse: boolean) => string;
  motorConfigError: ValidationErrorKey | null;
  motorControllerReady: boolean;
  motorDirection: MotorDirection;
  motorDuty: number;
  motorFeedback: MotorFeedbackMap;
  motorPreviewCommand: string;
  motorSpeed: string;
  motors: MotorProfile[];
  numericMotorSpeed: number;
  readMotor: (options?: { log?: boolean }) => Promise<void>;
  saveMotorMapping: () => void;
  selectedChannel: string;
  selectedMotor: MotorProfile | undefined;
  sendMotorConfig: () => Promise<void>;
  sendMotorLinkageGroup: (group: MotorLinkageGroup) => void;
  sendMotorSet: () => Promise<void>;
  setSelectedChannel: (channel: string) => void;
  setStopMode: (mode: MotorStopMode) => void;
  stopAllMotors: () => void;
  stopMode: MotorStopMode;
  stopMotor: () => Promise<void>;
  stopMotorLinkageGroup: (group: MotorLinkageGroup) => void;
  t: TFunction;
  updateMotorLinkageMaster: (groupId: string, value: string, live?: boolean) => void;
  updateSelectedMotorMapping: (field: MotorMappingField, value: string) => void;
  updateSingleMotorSpeed: (value: string, live?: boolean) => void;
}

export function MotorCommandPanel({
  aBoardBridgeConnected,
  aBoardBridgeDetail,
  aBoardBridgeError,
  aBoardBridgeLabel,
  aBoardBridgeTone,
  enabledMotorLinkageGroups,
  formatDirectionLabel,
  formatLinkageMemberDirection,
  motorConfigError,
  motorControllerReady,
  motorDirection,
  motorDuty,
  motorFeedback,
  motorPreviewCommand,
  motorSpeed,
  motors,
  numericMotorSpeed,
  readMotor,
  saveMotorMapping,
  selectedChannel,
  selectedMotor,
  sendMotorConfig,
  sendMotorLinkageGroup,
  sendMotorSet,
  setSelectedChannel,
  setStopMode,
  stopAllMotors,
  stopMode,
  stopMotor,
  stopMotorLinkageGroup,
  t,
  updateMotorLinkageMaster,
  updateSelectedMotorMapping,
  updateSingleMotorSpeed
}: MotorCommandPanelProps) {
  const motorActionsDisabled = !motorControllerReady || !selectedMotor;
  const selectedMotorFeedback = selectedMotor ? motorFeedback[selectedMotor.channel] : undefined;
  const selectedMotorPinSummary = useMemo(() => formatMotorPinSummary(selectedMotor), [selectedMotor]);
  const [encoderAutoRefresh, setEncoderAutoRefresh] = useState(true);
  const [lastEncoderFeedbackAt, setLastEncoderFeedbackAt] = useState<number | null>(null);
  const [encoderObservation, setEncoderObservation] = useState<EncoderObservation>(() => createEncoderObservation(""));
  const encoderReadInFlightRef = useRef(false);
  const encoderPollPausedUntilRef = useRef(0);
  const encoderCanRead = aBoardBridgeConnected && motorControllerReady && Boolean(selectedMotor);
  const encoderDiagnostic = useMemo(
    () => describeEncoderFeedback(selectedMotorFeedback, encoderObservation, t),
    [encoderObservation, selectedMotorFeedback, t]
  );
  const encoderRawFeedback = useMemo(
    () => (selectedMotorFeedback ? JSON.stringify(selectedMotorFeedback) : "--"),
    [selectedMotorFeedback]
  );
  const lastEncoderFeedbackLabel = lastEncoderFeedbackAt ? new Date(lastEncoderFeedbackAt).toLocaleTimeString() : "--";

  useEffect(() => {
    setLastEncoderFeedbackAt(null);
    setEncoderObservation(createEncoderObservation(selectedMotor?.channel ?? ""));
  }, [selectedMotor?.channel]);

  useEffect(() => {
    if (!selectedMotor || !selectedMotorFeedback) {
      return;
    }
    setLastEncoderFeedbackAt(Date.now());
    setEncoderObservation((current) => updateEncoderObservation(current, selectedMotor.channel, selectedMotorFeedback));
  }, [selectedMotor, selectedMotorFeedback]);

  const readEncoderFeedback = useCallback(async (options: { log?: boolean } = {}) => {
    if (!encoderCanRead || encoderReadInFlightRef.current) {
      return;
    }
    encoderReadInFlightRef.current = true;
    try {
      await readMotor(options);
    } finally {
      encoderReadInFlightRef.current = false;
    }
  }, [encoderCanRead, readMotor]);

  useEffect(() => {
    if (!encoderAutoRefresh || !encoderCanRead) {
      return undefined;
    }
    const pollEncoder = () => {
      if (Date.now() < encoderPollPausedUntilRef.current || encoderReadInFlightRef.current) {
        return;
      }
      void readEncoderFeedback({ log: false });
    };
    pollEncoder();
    const timer = window.setInterval(pollEncoder, ENCODER_REALTIME_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [encoderAutoRefresh, encoderCanRead, readEncoderFeedback]);

  function pauseEncoderPolling() {
    encoderPollPausedUntilRef.current = Date.now() + ENCODER_COMMAND_PAUSE_MS;
  }

  async function runMotorAction(action: () => Promise<void>) {
    pauseEncoderPolling();
    await action();
  }

  return (
    <>
      {enabledMotorLinkageGroups.length > 0 && (
        <div className="servo-linkage-run-list">
          {enabledMotorLinkageGroups.map((group) => (
            <MotorLinkageRunCard
              formatDirectionLabel={formatDirectionLabel}
              formatLinkageMemberDirection={formatLinkageMemberDirection}
              group={group}
              key={group.id}
              motorFeedback={motorFeedback}
              motors={motors}
              sendMotorLinkageGroup={sendMotorLinkageGroup}
              stopMotorLinkageGroup={stopMotorLinkageGroup}
              t={t}
              updateMotorLinkageMaster={updateMotorLinkageMaster}
            />
          ))}
        </div>
      )}
      <div className="command-grid motor-command-grid">
        <label>
          <span>{t("fields.targetPort")}</span>
          <select value={selectedChannel} onChange={(event) => setSelectedChannel(event.target.value)}>
            <option value="">{t("placeholders.selectMotor")}</option>
            {motors.map((motor) => (
              <option key={motor.channel} value={motor.channel}>
                {motor.channel} · {motor.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("fields.speedPercent")}</span>
          <input type="number" min={-100} max={100} step={1} value={motorSpeed} onChange={(event) => updateSingleMotorSpeed(event.target.value)} />
        </label>
        <label>
          <span>{t("fields.stopMode")}</span>
          <select value={stopMode} onChange={(event) => setStopMode(event.target.value as MotorStopMode)}>
            <option value="coast">{t("stopMode.coast")}</option>
            <option value="brake">{t("stopMode.brake")}</option>
          </select>
        </label>
      </div>

      <>
        <div className="preview-grid motor-debug-status-grid">
          <Metric label={t("metrics.aBoardBridge")} value={aBoardBridgeLabel} tone={aBoardBridgeTone} />
          <Metric className="frame-preview" code label={t("metrics.aBoardBridgeDetail")} value={aBoardBridgeDetail || "--"} />
          <Metric className="frame-preview" code label={t("metrics.aBoardPins")} value={selectedMotorPinSummary} />
        </div>
        {aBoardBridgeError && <p className="form-error">{aBoardBridgeError}</p>}
        <div className="encoder-diagnostic-panel">
          <div className="port-config-title">
            <Activity size={17} />
            <span>{t("panels.encoderDiagnostics")}</span>
          </div>
          <div className="preview-grid encoder-diagnostic-grid">
            <Metric label={t("metrics.ticks")} value={selectedMotorFeedback?.encoderTicks} />
            <Metric label={t("metrics.rpm")} value={selectedMotorFeedback?.speedRpm} />
            <Metric label={t("metrics.pulseHz")} value={selectedMotorFeedback?.pulseHz} />
            <Metric label={t("metrics.encoderDelta")} value={selectedMotorFeedback?.encoderDelta} />
            <Metric label={t("metrics.encoderDirection")} value={selectedMotorFeedback?.encoderDirection ? formatDirectionLabel(selectedMotorFeedback.encoderDirection) : undefined} />
            <Metric label={t("metrics.encoderA")} value={formatEncoderLevel(selectedMotorFeedback?.encoderA)} />
            <Metric label={t("metrics.encoderB")} value={formatEncoderLevel(selectedMotorFeedback?.encoderB)} />
            <Metric label={t("metrics.sampleMs")} value={selectedMotorFeedback?.sampleMs} suffix={selectedMotorFeedback?.sampleMs === undefined ? "" : " ms"} />
            <Metric label={t("metrics.lastFeedback")} value={lastEncoderFeedbackLabel} />
            <Metric className="frame-preview encoder-diagnostic-wide" code label={t("metrics.rawFeedback")} value={encoderRawFeedback} />
          </div>
          <div className="action-grid port-config-actions encoder-diagnostic-actions">
            <button className="icon-button" disabled={!encoderCanRead || encoderReadInFlightRef.current} onClick={() => void readEncoderFeedback()} type="button">
              <Activity size={18} />
              <span>{t("actions.readEncoder")}</span>
            </button>
            <label className="checkbox-field encoder-auto-refresh">
              <input checked={encoderAutoRefresh} onChange={(event) => setEncoderAutoRefresh(event.target.checked)} type="checkbox" />
              <span>{t("fields.autoRefreshEncoder")}</span>
            </label>
          </div>
          <p className={`encoder-diagnostic-note ${encoderDiagnostic.tone}`}>{encoderDiagnostic.text}</p>
        </div>
      </>

      <div className="port-config-panel">
        <div className="port-config-title">
          <Settings size={17} />
          <span>{t("panels.motorPortMapping")}</span>
        </div>
        <div className="port-config-grid">
          <MotorMappingInput field="pwmPin" label={t("fields.pwmPin")} placeholder={t("placeholders.pwmPin")} selectedMotor={selectedMotor} useRoboMasterAPins updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="in1Pin" label={t("fields.in1Pin")} placeholder={t("placeholders.in1Pin")} selectedMotor={selectedMotor} useRoboMasterAPins updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="in2Pin" label={t("fields.in2Pin")} placeholder={t("placeholders.in2Pin")} selectedMotor={selectedMotor} useRoboMasterAPins updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="enablePin" label={t("fields.enablePin")} placeholder={t("placeholders.optionalPin")} selectedMotor={selectedMotor} useRoboMasterAPins updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="sensorPin" label={t("fields.sensorPin")} placeholder={t("placeholders.optionalPin")} selectedMotor={selectedMotor} useRoboMasterAPins updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="encoderAPin" label={t("fields.encoderAPin")} placeholder="PA0" selectedMotor={selectedMotor} useRoboMasterAPins updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="encoderBPin" label={t("fields.encoderBPin")} placeholder="PA1" selectedMotor={selectedMotor} useRoboMasterAPins updateSelectedMotorMapping={updateSelectedMotorMapping} />
        </div>
        {motorConfigError && <p className="form-error">{t(motorConfigError)}</p>}
        <div className="action-grid port-config-actions">
          <button className="icon-button" disabled={!selectedMotor} onClick={saveMotorMapping} type="button">
            <Save size={18} />
            <span>{t("actions.savePortMapping")}</span>
          </button>
          <button className="icon-button primary" disabled={motorActionsDisabled} onClick={() => void runMotorAction(sendMotorConfig)} type="button">
            <Send size={18} />
            <span>{t("actions.sendPortMapping")}</span>
          </button>
        </div>
      </div>

      <label className="speed-slider-field">
        <span>{t("fields.speedSlider")}</span>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={Number.isFinite(numericMotorSpeed) ? String(numericMotorSpeed) : "0"}
          onChange={(event) => {
            pauseEncoderPolling();
            updateSingleMotorSpeed(event.target.value, true);
          }}
        />
      </label>

      <div className="preview-grid motor-preview-grid">
        <Metric label={t("metrics.direction")} value={formatDirectionLabel(motorDirection)} />
        <Metric label={t("metrics.duty")} value={Number.isFinite(motorDuty) ? motorDuty.toFixed(0) : "--"} suffix={Number.isFinite(motorDuty) ? "%" : ""} />
        <Metric className="frame-preview" label={t("metrics.json")} value={motorPreviewCommand || "--"} code />
      </div>

      <div className="action-grid">
        <button className="icon-button primary" disabled={motorActionsDisabled} onClick={() => void runMotorAction(sendMotorSet)} type="button">
          <Send size={18} />
          <span>{t("actions.sendCommand")}</span>
        </button>
        <button className="icon-button danger" disabled={motorActionsDisabled} onClick={() => void runMotorAction(stopMotor)} type="button">
          <Square size={18} />
          <span>{t("actions.stop")}</span>
        </button>
        <button className="icon-button" disabled={!motorControllerReady} onClick={() => {
          pauseEncoderPolling();
          stopAllMotors();
        }} type="button">
          <RotateCcw size={18} />
          <span>{t("actions.stopAll")}</span>
        </button>
        <button className="icon-button" disabled={motorActionsDisabled} onClick={() => void readEncoderFeedback()} type="button">
          <Activity size={18} />
          <span>{t("actions.readFeedback")}</span>
        </button>
      </div>
    </>
  );
}

type MotorFeedback = MotorFeedbackMap[string];

interface EncoderObservation {
  channel: string;
  feedbackCount: number;
  lastEncoderA?: number;
  lastEncoderB?: number;
  lastTicks?: number;
  sawLevelChange: boolean;
  sawTickChange: boolean;
}

function createEncoderObservation(channel: string): EncoderObservation {
  return {
    channel,
    feedbackCount: 0,
    sawLevelChange: false,
    sawTickChange: false
  };
}

function updateEncoderObservation(current: EncoderObservation, channel: string, feedback: MotorFeedback): EncoderObservation {
  const base = current.channel === channel ? current : createEncoderObservation(channel);
  const hasPrevious = base.feedbackCount > 0;
  const levelChanged =
    hasPrevious &&
    feedback.encoderA !== undefined &&
    feedback.encoderB !== undefined &&
    base.lastEncoderA !== undefined &&
    base.lastEncoderB !== undefined &&
    (feedback.encoderA !== base.lastEncoderA || feedback.encoderB !== base.lastEncoderB);
  const tickChanged =
    hasPrevious &&
    feedback.encoderTicks !== undefined &&
    base.lastTicks !== undefined &&
    feedback.encoderTicks !== base.lastTicks;

  return {
    channel,
    feedbackCount: base.feedbackCount + 1,
    lastEncoderA: feedback.encoderA,
    lastEncoderB: feedback.encoderB,
    lastTicks: feedback.encoderTicks,
    sawLevelChange: base.sawLevelChange || levelChanged,
    sawTickChange: base.sawTickChange || tickChanged
  };
}

function describeEncoderFeedback(feedback: MotorFeedback | undefined, observation: EncoderObservation, t: TFunction): { text: string; tone: "danger" | "neutral" | "online" | "warning" } {
  if (!feedback) {
    return { text: t("encoderDiagnostics.noFeedback"), tone: "neutral" };
  }
  if (feedback.encoderA === undefined || feedback.encoderB === undefined) {
    return { text: t("encoderDiagnostics.oldFirmware"), tone: "warning" };
  }
  if (observation.sawTickChange && Number(feedback.pulseHz ?? 0) > 0) {
    return { text: t("encoderDiagnostics.ok"), tone: "online" };
  }
  if (observation.sawTickChange) {
    return { text: t("encoderDiagnostics.slowOrSparse"), tone: "warning" };
  }
  if (observation.sawLevelChange) {
    return { text: t("encoderDiagnostics.levelsOnly"), tone: "warning" };
  }
  return { text: t("encoderDiagnostics.noMovement"), tone: "neutral" };
}

function formatEncoderLevel(value: number | undefined) {
  return value === undefined ? undefined : value ? "HIGH" : "LOW";
}

function formatMotorPinSummary(motor: MotorProfile | undefined): string {
  if (!motor) {
    return "--";
  }

  return [
    `${motor.channel} ${motor.name}`,
    `PWM ${motor.pwmPin || "--"}`,
    `IN1 ${motor.in1Pin || "--"}`,
    `IN2 ${motor.in2Pin || "--"}`,
    `STBY ${motor.enablePin || "--"}`,
    `ENC ${motor.encoderAPin || "--"}/${motor.encoderBPin || "--"}`,
    "UART5 Pi 30/32/33"
  ].join(" / ");
}

interface MotorMappingInputProps {
  field: MotorMappingField;
  label: string;
  placeholder: string;
  selectedMotor: MotorProfile | undefined;
  useRoboMasterAPins: boolean;
  updateSelectedMotorMapping: (field: MotorMappingField, value: string) => void;
}

function MotorMappingInput({ field, label, placeholder, selectedMotor, useRoboMasterAPins, updateSelectedMotorMapping }: MotorMappingInputProps) {
  if (useRoboMasterAPins) {
    const normalizedValue = normalizeMotorPin(selectedMotor?.[field], field as MotorPinRole, selectedMotor?.channel) ?? "";
    const selectedValue = ROBOMASTER_A_BOARD_GPIO_OPTIONS.some((option) => option.value === normalizedValue) ? normalizedValue : "";
    return (
      <label>
        <span>{label}</span>
        <select disabled={!selectedMotor} value={selectedValue} onChange={(event) => updateSelectedMotorMapping(field, event.target.value)}>
          <option value="">--</option>
          {ROBOMASTER_A_BOARD_GPIO_OPTIONS.map((option) => (
            <option key={`${field}-${option.label}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label>
      <span>{label}</span>
      <input disabled={!selectedMotor} placeholder={placeholder} value={selectedMotor?.[field] ?? ""} onChange={(event) => updateSelectedMotorMapping(field, event.target.value)} />
    </label>
  );
}
