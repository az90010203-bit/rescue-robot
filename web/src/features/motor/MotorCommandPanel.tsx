import { Activity, Cpu, Download, RotateCcw, RotateCw, Save, Send, Settings, Square, Upload, Usb } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { ConnectionMode, FirmwareUploadStatus, MotorFeedbackMap, MotorMappingField } from "../../app/appModel";
import type { MotorDirection, MotorProfile, MotorStopMode } from "../../lib/protocol";
import type { MotorLinkageGroup, ValidationErrorKey } from "../../lib/storage";
import {
  FIRMWARE_BOARD_OPTIONS,
  type FirmwareBoardId,
  type FirmwareCompileResult,
  type FirmwareHelperHealth,
  type FirmwarePort
} from "../../lib/firmwareUpload";
import { Metric } from "../../shared/ui/AppChrome";
import { MotorLinkageRunCard } from "./MotorLinkageCards";

interface MotorCommandPanelProps {
  canCompileFirmware: boolean;
  canUploadFirmware: boolean;
  checkFirmwareHelper: (log?: boolean) => Promise<unknown>;
  compileArduinoFirmware: () => Promise<void>;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  debugEnabled: boolean;
  downloadArduinoFirmware: () => void;
  enabledMotorLinkageGroups: MotorLinkageGroup[];
  firmwareBoard: FirmwareBoardId;
  firmwareBusy: boolean;
  firmwareError: string | null;
  firmwareHelperHealth: FirmwareHelperHealth | null;
  firmwareHelperLabel: string;
  firmwareHelperTone: "neutral" | "online" | "warning" | "danger";
  firmwareHexLabel: string;
  firmwareLogs: string;
  firmwarePorts: FirmwarePort[];
  firmwareStatus: FirmwareUploadStatus;
  firmwareStatusTone: "neutral" | "online" | "warning" | "danger";
  formatDirectionLabel: (direction: MotorDirection | string) => string;
  formatLinkageMemberDirection: (reverse: boolean) => string;
  lastMotorError: unknown;
  lastMotorErrorLabel: string;
  motorConfigError: ValidationErrorKey | null;
  motorDebugHandshakeLabel: string;
  motorDebugHandshakeTone: "neutral" | "online" | "warning" | "danger";
  motorDirection: MotorDirection;
  motorDuty: number;
  motorFeedback: MotorFeedbackMap;
  motorPreviewCommand: string;
  motorSpeed: string;
  motors: MotorProfile[];
  numericMotorSpeed: number;
  readMotor: () => Promise<void>;
  refreshFirmwarePorts: () => Promise<void>;
  saveMotorMapping: () => void;
  selectedChannel: string;
  selectedFirmwarePort: string;
  selectedMotor: MotorProfile | undefined;
  sendMotorConfig: () => Promise<void>;
  sendMotorLinkageGroup: (group: MotorLinkageGroup) => void;
  sendMotorSet: () => Promise<void>;
  setFirmwareBoard: Dispatch<SetStateAction<FirmwareBoardId>>;
  setFirmwareJob: Dispatch<SetStateAction<FirmwareCompileResult | null>>;
  setFirmwareStatus: Dispatch<SetStateAction<FirmwareUploadStatus>>;
  setSelectedChannel: (channel: string) => void;
  setSelectedFirmwarePort: Dispatch<SetStateAction<string>>;
  setStopMode: Dispatch<SetStateAction<MotorStopMode>>;
  stopAllMotors: () => void;
  stopMode: MotorStopMode;
  stopMotor: () => Promise<void>;
  stopMotorLinkageGroup: (group: MotorLinkageGroup) => void;
  t: TFunction;
  updateMotorLinkageMaster: (groupId: string, value: string, live?: boolean) => void;
  updateSelectedMotorMapping: (field: MotorMappingField, value: string) => void;
  updateSingleMotorSpeed: (value: string, live?: boolean) => void;
  uploadCompiledArduinoFirmware: () => Promise<void>;
}

export function MotorCommandPanel({
  canCompileFirmware,
  canUploadFirmware,
  checkFirmwareHelper,
  compileArduinoFirmware,
  connected,
  connectionMode,
  debugEnabled,
  downloadArduinoFirmware,
  enabledMotorLinkageGroups,
  firmwareBoard,
  firmwareBusy,
  firmwareError,
  firmwareHelperHealth,
  firmwareHelperLabel,
  firmwareHelperTone,
  firmwareHexLabel,
  firmwareLogs,
  firmwarePorts,
  firmwareStatus,
  firmwareStatusTone,
  formatDirectionLabel,
  formatLinkageMemberDirection,
  lastMotorError,
  lastMotorErrorLabel,
  motorConfigError,
  motorDebugHandshakeLabel,
  motorDebugHandshakeTone,
  motorDirection,
  motorDuty,
  motorFeedback,
  motorPreviewCommand,
  motorSpeed,
  motors,
  numericMotorSpeed,
  readMotor,
  refreshFirmwarePorts,
  saveMotorMapping,
  selectedChannel,
  selectedFirmwarePort,
  selectedMotor,
  sendMotorConfig,
  sendMotorLinkageGroup,
  sendMotorSet,
  setFirmwareBoard,
  setFirmwareJob,
  setFirmwareStatus,
  setSelectedChannel,
  setSelectedFirmwarePort,
  setStopMode,
  stopAllMotors,
  stopMode,
  stopMotor,
  stopMotorLinkageGroup,
  t,
  updateMotorLinkageMaster,
  updateSelectedMotorMapping,
  updateSingleMotorSpeed,
  uploadCompiledArduinoFirmware
}: MotorCommandPanelProps) {
  const motorActionsDisabled = !connected || connectionMode === "servo-bus" || !selectedMotor;

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

      <div className="preview-grid motor-debug-status-grid">
        <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
        <Metric label={t("metrics.uiDebug")} value={debugEnabled ? t("status.debug") : t("status.standby")} tone={debugEnabled ? "warning" : "neutral"} />
        <Metric label={t("metrics.arduinoDebug")} value={motorDebugHandshakeLabel} tone={motorDebugHandshakeTone} />
        <Metric label={t("metrics.lastError")} value={lastMotorErrorLabel} tone={lastMotorError ? "danger" : "neutral"} />
      </div>

      <div className="port-config-panel">
        <div className="port-config-title">
          <Settings size={17} />
          <span>{t("panels.motorPortMapping")}</span>
        </div>
        <div className="port-config-grid">
          <MotorMappingInput field="pwmPin" label={t("fields.pwmPin")} placeholder={t("placeholders.pwmPin")} selectedMotor={selectedMotor} updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="in1Pin" label={t("fields.in1Pin")} placeholder={t("placeholders.in1Pin")} selectedMotor={selectedMotor} updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="in2Pin" label={t("fields.in2Pin")} placeholder={t("placeholders.in2Pin")} selectedMotor={selectedMotor} updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="enablePin" label={t("fields.enablePin")} placeholder={t("placeholders.optionalPin")} selectedMotor={selectedMotor} updateSelectedMotorMapping={updateSelectedMotorMapping} />
          <MotorMappingInput field="sensorPin" label={t("fields.sensorPin")} placeholder={t("placeholders.optionalPin")} selectedMotor={selectedMotor} updateSelectedMotorMapping={updateSelectedMotorMapping} />
        </div>
        {motorConfigError && <p className="form-error">{t(motorConfigError)}</p>}
        <div className="action-grid port-config-actions">
          <button className="icon-button" disabled={!selectedMotor} onClick={saveMotorMapping} type="button">
            <Save size={18} />
            <span>{t("actions.savePortMapping")}</span>
          </button>
          <button className="icon-button primary" disabled={motorActionsDisabled} onClick={sendMotorConfig} type="button">
            <Send size={18} />
            <span>{t("actions.sendPortMapping")}</span>
          </button>
          <button className="icon-button" onClick={downloadArduinoFirmware} type="button">
            <Download size={18} />
            <span>{t("actions.downloadArduinoFirmware")}</span>
          </button>
        </div>
        <div className="firmware-upload-panel">
          <div className="port-config-title">
            <Cpu size={17} />
            <span>{t("panels.firmwareUpload")}</span>
          </div>
          <div className="firmware-upload-grid">
            <label>
              <span>{t("fields.board")}</span>
              <select
                disabled={firmwareBusy}
                value={firmwareBoard}
                onChange={(event) => {
                  setFirmwareBoard(event.target.value as FirmwareBoardId);
                  setFirmwareJob(null);
                  setFirmwareStatus("idle");
                }}
              >
                {FIRMWARE_BOARD_OPTIONS.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("fields.serialPort")}</span>
              <select disabled={firmwareBusy || firmwarePorts.length === 0} value={selectedFirmwarePort} onChange={(event) => setSelectedFirmwarePort(event.target.value)}>
                {firmwarePorts.length === 0 ? (
                  <option value="">{t("empty.noFirmwarePorts")}</option>
                ) : (
                  firmwarePorts.map((port) => (
                    <option key={port.path} value={port.path}>
                      {port.path} {port.description ? `- ${port.description}` : ""}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
          <div className="preview-grid firmware-status-grid">
            <Metric label={t("metrics.firmwareHelper")} value={firmwareHelperLabel} tone={firmwareHelperTone} />
            <Metric label={t("metrics.firmware")} value={t(`firmware.status.${firmwareStatus}`)} tone={firmwareStatusTone} />
            <Metric label={t("metrics.hexSize")} value={firmwareHexLabel} />
            <Metric code label={t("metrics.serialPort")} value={selectedFirmwarePort || "--"} />
          </div>
          <div className="action-grid port-config-actions">
            <button className="icon-button" disabled={firmwareBusy} onClick={() => checkFirmwareHelper()} type="button">
              <RotateCw size={18} />
              <span>{t("actions.checkFirmwareHelper")}</span>
            </button>
            <button className="icon-button" disabled={firmwareBusy || firmwareHelperHealth?.pioAvailable !== true} onClick={refreshFirmwarePorts} type="button">
              <Usb size={18} />
              <span>{t("actions.refreshFirmwarePorts")}</span>
            </button>
            <button className="icon-button primary" disabled={!canCompileFirmware} onClick={compileArduinoFirmware} type="button">
              <Cpu size={18} />
              <span>{t("actions.compileFirmware")}</span>
            </button>
            <button className="icon-button" disabled={!canUploadFirmware} onClick={uploadCompiledArduinoFirmware} type="button">
              <Upload size={18} />
              <span>{t("actions.uploadFirmware")}</span>
            </button>
          </div>
          {firmwareError && <p className="form-error">{firmwareError}</p>}
          {firmwareLogs && <pre className="firmware-log">{firmwareLogs}</pre>}
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
          onChange={(event) => updateSingleMotorSpeed(event.target.value, true)}
        />
      </label>

      <div className="preview-grid motor-preview-grid">
        <Metric label={t("metrics.direction")} value={formatDirectionLabel(motorDirection)} />
        <Metric label={t("metrics.duty")} value={Number.isFinite(motorDuty) ? motorDuty.toFixed(0) : "--"} suffix={Number.isFinite(motorDuty) ? "%" : ""} />
        <Metric className="frame-preview" label={t("metrics.json")} value={motorPreviewCommand || "--"} code />
      </div>

      <div className="action-grid">
        <button className="icon-button primary" disabled={motorActionsDisabled} onClick={sendMotorSet} type="button">
          <Send size={18} />
          <span>{t("actions.sendCommand")}</span>
        </button>
        <button className="icon-button danger" disabled={motorActionsDisabled} onClick={stopMotor} type="button">
          <Square size={18} />
          <span>{t("actions.stop")}</span>
        </button>
        <button className="icon-button" disabled={!connected || connectionMode === "servo-bus"} onClick={() => stopAllMotors()} type="button">
          <RotateCcw size={18} />
          <span>{t("actions.stopAll")}</span>
        </button>
        <button className="icon-button" disabled={motorActionsDisabled} onClick={readMotor} type="button">
          <Activity size={18} />
          <span>{t("actions.readFeedback")}</span>
        </button>
      </div>
    </>
  );
}

interface MotorMappingInputProps {
  field: MotorMappingField;
  label: string;
  placeholder: string;
  selectedMotor: MotorProfile | undefined;
  updateSelectedMotorMapping: (field: MotorMappingField, value: string) => void;
}

function MotorMappingInput({ field, label, placeholder, selectedMotor, updateSelectedMotorMapping }: MotorMappingInputProps) {
  return (
    <label>
      <span>{label}</span>
      <input disabled={!selectedMotor} placeholder={placeholder} value={selectedMotor?.[field] ?? ""} onChange={(event) => updateSelectedMotorMapping(field, event.target.value)} />
    </label>
  );
}
