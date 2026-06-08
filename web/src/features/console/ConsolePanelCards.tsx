import { Activity, Compass, Crosshair, Gamepad2, RefreshCw, SlidersHorizontal, Square, Video } from "lucide-react";
import type { TFunction } from "i18next";
import { Fragment, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatAngle, formatHexByte, formatVector3, metricNumber } from "../../shared/formatters";
import { Metric } from "../../shared/ui/AppChrome";
import type { DriveInputState } from "../../lib/drive";
import type { ImuAttitude, ImuCalibration, ImuCalibrationStatus, ImuFeedback } from "../../lib/imuAttitude";
import {
  type CameraConfig,
  type CameraVideoSource
} from "../../lib/storage";
import type { LogEntry } from "../../app/appModel";
import { CameraSourcePanel } from "../drive/CameraSourcePanel";
import { defaultCameraSourceRuntimeStatus, type CameraSourceRuntimeStatus } from "../drive/cameraSources";

interface VirtualJoystickProps {
  caption: string;
  kind: "camera" | "drive";
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  onReset: (kind: "camera" | "drive") => void;
  t: TFunction;
  x: number;
  y: number;
}

export interface ConsoleTelemetryPanelProps {
  activeDriveBase: "tracked" | "mecanum";
  activeGamepad: { index: number } | null;
  completeMotorMappingCount: number;
  connected: boolean;
  driveCanCommand: boolean;
  hiddenItemCount?: number;
  motorCount: number;
  servoCount: number;
  servoFeedback: Record<string, any>;
  t: TFunction;
  visibleItemIds?: readonly string[];
}

export interface ConsoleCameraFeedPanelProps {
  cameraConfig: CameraConfig;
  cameraStreamReloadToken: number;
  hiddenItemCount?: number;
  runtime?: CameraSourceRuntimeStatus;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  source: CameraVideoSource;
  t: TFunction;
  visibleItemIds?: readonly string[];
}

export interface ConsoleAttitudePanelProps {
  aBoardBridgeBusy: boolean;
  aBoardBridgeConnected: boolean;
  attitude: ImuAttitude | null;
  calibration: ImuCalibration;
  calibrationStatus: ImuCalibrationStatus;
  error: string | null;
  feedback: ImuFeedback | null;
  hiddenItemCount?: number;
  onCheckBridge: () => Promise<unknown>;
  onStartCalibration: () => void;
  t: TFunction;
  visibleItemIds?: readonly string[];
}

export interface ConsoleJoystickPanelProps {
  activeDriveBase: "tracked" | "mecanum";
  cameraPreviewCommand: string;
  driveInput: DriveInputState;
  drivePreviewCommand: string;
  handleVirtualStickDown: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  handleVirtualStickMove: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  resetVirtualStick: (kind: "camera" | "drive") => void;
  selectDriveBase: (base: "tracked" | "mecanum") => void;
  stopAllMotors: () => void;
  t: TFunction;
}

export interface ConsoleEventLogPanelProps {
  logs: LogEntry[];
  t: TFunction;
}

interface ConsolePanelMetric {
  id: string;
  node: ReactNode;
}

function visiblePanelMetrics(metrics: ConsolePanelMetric[], visibleItemIds?: readonly string[]) {
  if (!visibleItemIds || visibleItemIds.length === 0) {
    return metrics;
  }
  const visible = new Set(visibleItemIds);
  return metrics.filter((metric) => visible.has(metric.id));
}

function hiddenMetricNode(t: TFunction, hiddenItemCount = 0) {
  return hiddenItemCount > 0 ? <Metric className="console-metric-overflow" label={t("dashboard.fields.hiddenMetrics")} value={`+${hiddenItemCount}`} /> : null;
}

function VirtualJoystick({ caption, kind, label, onPointerDown, onPointerMove, onReset, t, x, y }: VirtualJoystickProps) {
  return (
    <div className="virtual-joystick">
      <div className="virtual-joystick-head">
        <strong>{label}</strong>
        <small>{caption}</small>
      </div>
      <div
        className="joystick-base"
        role="application"
        tabIndex={0}
        aria-label={`${label} ${t("aria.virtualJoystick")}`}
        onPointerDown={(event) => onPointerDown(event, kind)}
        onPointerMove={(event) => onPointerMove(event, kind)}
        onPointerUp={() => onReset(kind)}
        onPointerCancel={() => onReset(kind)}
      >
        <span className="joystick-axis horizontal" />
        <span className="joystick-axis vertical" />
        <span className="joystick-knob" style={{ transform: `translate(calc(-50% + ${x * 42}px), calc(-50% + ${y * 42}px))` }} />
      </div>
    </div>
  );
}

export function ConsoleTelemetryPanel({
  activeDriveBase,
  activeGamepad,
  completeMotorMappingCount,
  connected,
  driveCanCommand,
  hiddenItemCount = 0,
  motorCount,
  servoCount,
  servoFeedback,
  t,
  visibleItemIds
}: ConsoleTelemetryPanelProps) {
  const servoTelemetryItems = Object.values(servoFeedback);
  const voltageValue = metricNumber(servoTelemetryItems.find((item) => item.voltageV !== undefined)?.voltageV);
  const currentValue = metricNumber(servoTelemetryItems.find((item) => item.currentMa !== undefined)?.currentMa);
  const temperatureValue = servoTelemetryItems.find((item) => item.temperatureC !== undefined)?.temperatureC ?? "--";
  const movingServoCount = servoTelemetryItems.filter((item) => item.moving).length;
  const metrics: ConsolePanelMetric[] = [
    { id: "voltage", node: <Metric label={t("metrics.voltage")} value={voltageValue} suffix=" V" /> },
    { id: "current", node: <Metric label={t("metrics.current")} value={currentValue} suffix=" mA" /> },
    { id: "temp", node: <Metric label={t("metrics.temp")} value={temperatureValue} suffix={temperatureValue === "--" ? "" : " C"} /> },
    { id: "serial", node: <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} /> },
    { id: "drive", node: <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} /> },
    { id: "activeBase", node: <Metric label={t("metrics.activeBase")} value={activeDriveBase === "tracked" ? t("drive.tracked") : t("drive.mecanum")} /> },
    { id: "servoCount", node: <Metric label={t("metrics.servoCount")} value={servoCount} /> },
    { id: "motorCount", node: <Metric label={t("metrics.motorCount")} value={`${completeMotorMappingCount}/${motorCount}`} /> },
    { id: "moving", node: <Metric label={t("metrics.moving")} value={movingServoCount} tone={movingServoCount > 0 ? "warning" : "neutral"} /> },
    { id: "gamepad", node: <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} /> }
  ];

  return (
    <>
      <div className="drive-section-title">
        <Activity size={17} />
        <h3>{t("console.robotTelemetry")}</h3>
      </div>
      <div className="console-metric-grid">
        {visiblePanelMetrics(metrics, visibleItemIds).map((metric) => <Fragment key={metric.id}>{metric.node}</Fragment>)}
        {hiddenMetricNode(t, hiddenItemCount)}
      </div>
      {hiddenItemCount === 0 && <p className="console-note">{t("console.telemetryNote")}</p>}
    </>
  );
}

export function ConsoleAttitudePanel({
  aBoardBridgeBusy,
  aBoardBridgeConnected,
  attitude,
  calibration,
  calibrationStatus,
  error,
  feedback,
  hiddenItemCount = 0,
  onCheckBridge,
  onStartCalibration,
  t,
  visibleItemIds
}: ConsoleAttitudePanelProps) {
  const ageMs = attitude ? Date.now() - attitude.receivedAtMs : undefined;
  const stale = ageMs !== undefined && ageMs > 1200;
  const ready = aBoardBridgeConnected && Boolean(feedback) && !error && !stale;
  const statusLabel = !aBoardBridgeConnected
    ? t("status.offline")
    : error
      ? t("status.error")
      : stale
        ? t("status.stale")
        : feedback
          ? t("status.ready")
          : t("status.syncing");
  const statusTone: "neutral" | "online" | "warning" | "danger" = !aBoardBridgeConnected || error ? "danger" : stale ? "warning" : ready ? "online" : "neutral";
  const calibrationLabel =
    calibrationStatus === "calibrating"
      ? t("imu.calibrating", { count: calibration.sampleCount })
      : calibrationStatus === "calibrated"
        ? t("imu.calibrated")
        : t("imu.uncalibrated");
  const horizonPitch = attitude ? Math.max(-34, Math.min(34, attitude.pitchDeg * 1.2)) : 0;
  const horizonRoll = attitude ? attitude.rollDeg : 0;
  const metrics: ConsolePanelMetric[] = [
    { id: "roll", node: <Metric label={t("metrics.roll")} value={formatAngle(attitude?.rollDeg)} suffix={attitude ? " deg" : ""} tone={ready ? "online" : statusTone} /> },
    { id: "pitch", node: <Metric label={t("metrics.pitch")} value={formatAngle(attitude?.pitchDeg)} suffix={attitude ? " deg" : ""} tone={ready ? "online" : statusTone} /> },
    { id: "yaw", node: <Metric label={t("metrics.yaw")} value={formatAngle(attitude?.yawDeg)} suffix={attitude?.yawDeg !== null && attitude?.yawDeg !== undefined ? " deg" : ""} tone={attitude?.calibrated ? "online" : "warning"} /> },
    { id: "imuStatus", node: <Metric label={t("metrics.imuStatus")} value={statusLabel} tone={statusTone} /> },
    { id: "imuCalibration", node: <Metric label={t("metrics.imuCalibration")} value={calibrationLabel} tone={calibrationStatus === "calibrated" ? "online" : calibrationStatus === "calibrating" ? "warning" : "neutral"} /> },
    { id: "lastFeedback", node: <Metric label={t("metrics.lastFeedback")} value={ageMs === undefined ? "--" : `${Math.max(0, Math.round(ageMs))} ms`} tone={stale ? "warning" : ready ? "online" : "neutral"} /> },
    { id: "rawMag", node: <Metric className="frame-preview" code label={t("metrics.rawMag")} value={formatVector3(feedback?.magRaw)} /> },
    { id: "gyroDps", node: <Metric className="frame-preview" code label={t("metrics.gyroDps")} value={formatVector3(attitude?.gyroDps, 1)} /> },
    { id: "mpuWhoAmI", node: <Metric className="frame-preview" code label={t("metrics.mpuWhoAmI")} value={formatHexByte(feedback?.mpuWhoAmI)} /> },
    { id: "istWhoAmI", node: <Metric className="frame-preview" code label={t("metrics.istWhoAmI")} value={formatHexByte(feedback?.istWhoAmI)} /> }
  ];

  return (
    <div className="console-attitude-panel">
      <div className="drive-section-title">
        <Compass size={17} />
        <h3>{t("console.attitude")}</h3>
      </div>
      <div className="attitude-horizon" aria-hidden="true">
        <span className="attitude-horizon-plane" style={{ transform: `translateY(${horizonPitch}px) rotate(${horizonRoll}deg)` }} />
        <span className="attitude-horizon-crosshair" />
      </div>
      <div className="console-metric-grid attitude-metric-grid">
        {visiblePanelMetrics(metrics, visibleItemIds).map((metric) => <Fragment key={metric.id}>{metric.node}</Fragment>)}
        {hiddenMetricNode(t, hiddenItemCount)}
      </div>
      <div className="console-attitude-actions">
        <button className="icon-button" disabled={aBoardBridgeBusy} onClick={() => void onCheckBridge()} type="button">
          <RefreshCw size={18} />
          <span>{t("actions.checkAboardBridge")}</span>
        </button>
        <button className="icon-button" disabled={!aBoardBridgeConnected || calibrationStatus === "calibrating"} onClick={onStartCalibration} type="button">
          <Crosshair size={18} />
          <span>{t("actions.calibrateImu")}</span>
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export function ConsoleCameraFeedPanel({
  cameraConfig,
  cameraStreamReloadToken,
  hiddenItemCount = 0,
  runtime = defaultCameraSourceRuntimeStatus(),
  setCameraSourceRuntime,
  source,
  t,
  visibleItemIds
}: ConsoleCameraFeedPanelProps) {
  return (
    <>
      <div className="drive-section-title">
        <Video size={17} />
        <h3>{source.label}</h3>
      </div>
      <CameraSourcePanel
        cameraConfig={cameraConfig}
        cameraStreamReloadToken={cameraStreamReloadToken}
        className="console-dashboard-camera-source"
        hiddenItemCount={hiddenItemCount}
        runtime={runtime}
        setCameraSourceRuntime={setCameraSourceRuntime}
        source={source}
        t={t}
        visibleItemIds={visibleItemIds}
      />
    </>
  );
}

export function ConsoleArmPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <>
      <div className="drive-section-title">
        <SlidersHorizontal size={17} />
        <h3>{title}</h3>
      </div>
      <div className="console-arm-preview">{children}</div>
    </>
  );
}

export function ConsoleJoystickPanel({
  activeDriveBase,
  cameraPreviewCommand,
  driveInput,
  drivePreviewCommand,
  handleVirtualStickDown,
  handleVirtualStickMove,
  resetVirtualStick,
  selectDriveBase,
  stopAllMotors,
  t
}: ConsoleJoystickPanelProps) {
  const driveStickX = activeDriveBase === "mecanum" ? driveInput.strafe : driveInput.turn;
  const driveStickY = -driveInput.forward;
  const cameraStickX = driveInput.cameraPan;
  const cameraStickY = -driveInput.cameraTilt;

  return (
    <>
      <div className="drive-section-title">
        <Gamepad2 size={17} />
        <h3>{t("console.control")}</h3>
      </div>
      <div className="drive-base-switch console-base-switch" aria-label={t("aria.driveBase")}>
        <button className={activeDriveBase === "tracked" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("tracked")} type="button">
          <span>{t("drive.tracked")}</span>
        </button>
        <button className={activeDriveBase === "mecanum" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("mecanum")} type="button">
          <span>{t("drive.mecanum")}</span>
        </button>
      </div>
      <div className="joystick-grid">
        <VirtualJoystick kind="drive" label={t("console.driveStick")} caption={activeDriveBase === "mecanum" ? t("console.driveStickMecanum") : t("console.driveStickTracked")} x={driveStickX} y={driveStickY} onPointerDown={handleVirtualStickDown} onPointerMove={handleVirtualStickMove} onReset={resetVirtualStick} t={t} />
        <VirtualJoystick kind="camera" label={t("console.cameraStick")} caption={t("console.cameraStickHint")} x={cameraStickX} y={cameraStickY} onPointerDown={handleVirtualStickDown} onPointerMove={handleVirtualStickMove} onReset={resetVirtualStick} t={t} />
      </div>
      <button className="icon-button danger drive-stop-button" onClick={stopAllMotors} type="button">
        <Square size={18} />
        <span>{t("actions.stopAll")}</span>
      </button>
      <div className="preview-grid console-output-grid">
        <Metric className="frame-preview" label={t("metrics.driveOutput")} value={drivePreviewCommand || "--"} code />
        <Metric className="frame-preview" label={t("metrics.cameraOutput")} value={cameraPreviewCommand || "--"} code />
      </div>
    </>
  );
}

export function ConsoleEventLogPanel({ logs, t }: ConsoleEventLogPanelProps) {
  return (
    <>
      <div className="drive-section-title">
        <Activity size={17} />
        <h3>{t("panels.eventLog")}</h3>
      </div>
      <div className="console-log-list">
        {logs.length === 0 ? (
          <div className="empty-state">{t("empty.noLogs")}</div>
        ) : (
          logs.slice(0, 8).map((log) => (
            <div className={`log-entry ${log.direction} ${log.level ?? "info"}`} key={log.id}>
              <span>{log.direction.toUpperCase()}</span>
              <code>{log.text ?? t(log.messageKey ?? "", log.values)}</code>
            </div>
          ))
        )}
      </div>
    </>
  );
}
