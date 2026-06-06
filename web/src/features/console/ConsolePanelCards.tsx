import { Activity, Gamepad2, SlidersHorizontal, Square, Video, VideoOff } from "lucide-react";
import type { TFunction } from "i18next";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Metric } from "../../shared/ui/AppChrome";
import type { DriveInputState } from "../../lib/drive";
import {
  MAIN_CAMERA_SOURCE_ID,
  type CameraConfig,
  type CameraStreamMode,
  type CameraVideoSource
} from "../../lib/storage";
import type { LogEntry } from "../../app/appModel";
import { CameraViewer, type CameraEffectiveMode } from "../drive/CameraViewer";
import { cameraStreamOfferUrl, defaultCameraSourceRuntimeStatus, type CameraSourceRuntimeStatus } from "../drive/cameraSources";

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
  motorCount: number;
  servoCount: number;
  servoFeedback: Record<string, any>;
  t: TFunction;
}

export interface ConsoleCameraFeedPanelProps {
  cameraConfig: CameraConfig;
  cameraStreamReloadToken: number;
  runtime?: CameraSourceRuntimeStatus;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  source: CameraVideoSource;
  t: TFunction;
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

function metricNumber(value: number | undefined, digits = 1) {
  return value === undefined ? "--" : Number(value.toFixed(digits));
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
  motorCount,
  servoCount,
  servoFeedback,
  t
}: ConsoleTelemetryPanelProps) {
  const servoTelemetryItems = Object.values(servoFeedback);
  const voltageValue = metricNumber(servoTelemetryItems.find((item) => item.voltageV !== undefined)?.voltageV);
  const currentValue = metricNumber(servoTelemetryItems.find((item) => item.currentMa !== undefined)?.currentMa);
  const temperatureValue = servoTelemetryItems.find((item) => item.temperatureC !== undefined)?.temperatureC ?? "--";
  const movingServoCount = servoTelemetryItems.filter((item) => item.moving).length;

  return (
    <>
      <div className="drive-section-title">
        <Activity size={17} />
        <h3>{t("console.robotTelemetry")}</h3>
      </div>
      <div className="console-metric-grid">
        <Metric label={t("metrics.voltage")} value={voltageValue} suffix=" V" />
        <Metric label={t("metrics.current")} value={currentValue} suffix=" mA" />
        <Metric label={t("metrics.temp")} value={temperatureValue} suffix={temperatureValue === "--" ? "" : " C"} />
        <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
        <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} />
        <Metric label={t("metrics.activeBase")} value={activeDriveBase === "tracked" ? t("drive.tracked") : t("drive.mecanum")} />
        <Metric label={t("metrics.servoCount")} value={servoCount} />
        <Metric label={t("metrics.motorCount")} value={`${completeMotorMappingCount}/${motorCount}`} />
        <Metric label={t("metrics.moving")} value={movingServoCount} tone={movingServoCount > 0 ? "warning" : "neutral"} />
        <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} />
      </div>
      <p className="console-note">{t("console.telemetryNote")}</p>
    </>
  );
}

export function ConsoleCameraFeedPanel({
  cameraConfig,
  cameraStreamReloadToken,
  runtime = defaultCameraSourceRuntimeStatus(),
  setCameraSourceRuntime,
  source,
  t
}: ConsoleCameraFeedPanelProps) {
  const sourceMode: CameraStreamMode = source.id === MAIN_CAMERA_SOURCE_ID ? cameraConfig.streamMode : "mjpeg";
  const effectiveMode: CameraEffectiveMode = sourceMode === "webrtc" && runtime.webrtcFallback ? "mjpegFallback" : sourceMode;
  const modeLabel =
    effectiveMode === "webrtc"
      ? t("camera.streamModes.webrtc")
      : effectiveMode === "mjpegFallback"
        ? t("camera.streamModes.mjpegFallback")
        : t("camera.streamModes.mjpeg");
  const latencyLabel = runtime.latency?.estimateMs === null || runtime.latency?.estimateMs === undefined ? "--" : `~${Math.round(runtime.latency.estimateMs)} ms`;
  const rttLabel = runtime.latency?.rttMs === null || runtime.latency?.rttMs === undefined ? "--" : `${Math.round(runtime.latency.rttMs)} ms`;
  const tone: "neutral" | "online" | "warning" | "danger" =
    runtime.latency?.error
      ? "danger"
      : runtime.latency?.estimateMs === null || runtime.latency?.estimateMs === undefined
        ? "neutral"
        : runtime.latency.estimateMs > 800
          ? "danger"
          : runtime.latency.estimateMs > 350
            ? "warning"
            : "online";

  return (
    <>
      <div className="drive-section-title">
        <Video size={17} />
        <h3>{source.label}</h3>
      </div>
      <div className="camera-source-panel console-dashboard-camera-source" data-stream-url={source.streamUrl}>
        <div className="camera-viewer camera-source-viewer">
          <CameraViewer
            alt={`${source.label} ${t("camera.streamAlt")}`}
            forceMjpeg={runtime.webrtcFallback || source.id !== MAIN_CAMERA_SOURCE_ID}
            key={`${source.id}-${sourceMode}-${cameraConfig.latencyProfile}-${source.streamUrl}-${cameraStreamReloadToken}`}
            mode={sourceMode}
            offerUrl={cameraStreamOfferUrl(source, cameraConfig)}
            onError={() => setCameraSourceRuntime(source.id, { loaded: false, failed: true })}
            onLoad={() => setCameraSourceRuntime(source.id, { loaded: true, failed: false })}
            onWebrtcFallback={(error) => setCameraSourceRuntime(source.id, { webrtcFallback: true, webrtcError: error, loaded: false, failed: false })}
            placeholder={
              <div className="camera-placeholder">
                <VideoOff size={42} />
                <span>{t("empty.noCameraStream")}</span>
              </div>
            }
            streamUrl={source.streamUrl.trim()}
          />
          <span className="camera-source-name">{source.label}</span>
          <span className={runtime.failed ? "camera-stream-badge error" : runtime.loaded ? "camera-stream-badge online" : "camera-stream-badge"}>
            {source.streamUrl.trim()
              ? runtime.failed
                ? t("status.streamError")
                : runtime.loaded
                  ? `${t("status.streamOnline")} / ${modeLabel}`
                  : t("status.streamLoading")
              : t("status.streamMissing")}
          </span>
        </div>
        <div className="preview-grid camera-source-metrics">
          <Metric label={t("metrics.videoLatency")} value={latencyLabel} tone={tone} />
          <Metric label={t("metrics.networkRtt")} value={rttLabel} tone={tone} />
          <Metric label={t("fields.sourceDevicePath")} value={source.devicePath} />
          <Metric label={t("fields.sourcePort")} value={source.port} />
        </div>
        {runtime.webrtcError && runtime.webrtcFallback && source.id === MAIN_CAMERA_SOURCE_ID && <p className="camera-mode-note">{t("camera.webrtcFallback", { error: runtime.webrtcError })}</p>}
      </div>
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
