import { Activity, Gamepad2, Gauge, SlidersHorizontal, Square, Video } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import { Metric, PanelTitle } from "../../shared/ui/AppChrome";
import type { DriveInputState } from "../../lib/drive";
import type { LogEntry } from "../../app/appModel";
import type {
  CameraConfig,
  CameraLatencyProfile,
  CameraStreamMode,
  CameraVideoLayout,
  CameraVideoSource
} from "../../lib/storage";
import { CameraFeeds } from "../drive/CameraFeeds";
import type { CameraSourceRuntimeStatus } from "../drive/cameraSources";

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

interface ConsolePageProps {
  activeDriveBase: "tracked" | "mecanum";
  activeGamepad: { index: number } | null;
  activeSectionLabel: string;
  armCanvas: ReactNode;
  activeCameraSource: CameraVideoSource;
  cameraConfig: CameraConfig;
  cameraPreviewCommand: string;
  cameraSourceRuntimeById: Record<string, CameraSourceRuntimeStatus>;
  cameraStreamReloadToken: number;
  cameraVideoSources: CameraVideoSource[];
  completeMotorMappingCount: number;
  connected: boolean;
  driveCanCommand: boolean;
  driveInput: DriveInputState;
  drivePreviewCommand: string;
  handleVirtualStickDown: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  handleVirtualStickMove: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  logs: LogEntry[];
  motorCount: number;
  resetVirtualStick: (kind: "camera" | "drive") => void;
  selectDriveBase: (base: "tracked" | "mecanum") => void;
  servoCount: number;
  servoFeedback: Record<string, any>;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  stopAllMotors: () => void;
  t: TFunction;
  updateCameraActiveSource: (sourceId: string) => void;
  updateCameraLatencyProfile: (profile: CameraLatencyProfile) => void;
  updateCameraStreamMode: (mode: CameraStreamMode) => void;
  updateCameraVideoLayout: (layout: CameraVideoLayout) => void;
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

export function ConsolePage({
  activeDriveBase,
  activeGamepad,
  activeSectionLabel,
  armCanvas,
  activeCameraSource,
  cameraConfig,
  cameraPreviewCommand,
  cameraSourceRuntimeById,
  cameraStreamReloadToken,
  cameraVideoSources,
  completeMotorMappingCount,
  connected,
  driveCanCommand,
  driveInput,
  drivePreviewCommand,
  handleVirtualStickDown,
  handleVirtualStickMove,
  logs,
  motorCount,
  resetVirtualStick,
  selectDriveBase,
  servoCount,
  servoFeedback,
  setCameraSourceRuntime,
  stopAllMotors,
  t,
  updateCameraActiveSource,
  updateCameraLatencyProfile,
  updateCameraStreamMode,
  updateCameraVideoLayout
}: ConsolePageProps) {
  const servoTelemetryItems = Object.values(servoFeedback);
  const voltageValue = metricNumber(servoTelemetryItems.find((item) => item.voltageV !== undefined)?.voltageV);
  const currentValue = metricNumber(servoTelemetryItems.find((item) => item.currentMa !== undefined)?.currentMa);
  const temperatureValue = servoTelemetryItems.find((item) => item.temperatureC !== undefined)?.temperatureC ?? "--";
  const movingServoCount = servoTelemetryItems.filter((item) => item.moving).length;
  const driveStickX = activeDriveBase === "mecanum" ? driveInput.strafe : driveInput.turn;
  const driveStickY = -driveInput.forward;
  const cameraStickX = driveInput.cameraPan;
  const cameraStickY = -driveInput.cameraTilt;

  return (
    <section className="panel console-page-panel" aria-labelledby="main-console-title">
      <PanelTitle icon={<Gauge size={18} />} id="main-console-title" meta={activeSectionLabel} title={t("console.main")} />

      <div className="console-grid">
        <section className="console-card console-telemetry" aria-labelledby="robot-telemetry-title">
          <div className="drive-section-title">
            <Activity size={17} />
            <h3 id="robot-telemetry-title">{t("console.robotTelemetry")}</h3>
          </div>
          <div className="console-metric-grid">
            <Metric label={t("metrics.voltage")} value={voltageValue} suffix=" V" />
            <Metric label={t("metrics.current")} value={currentValue} suffix=" mA" />
            <Metric label={t("metrics.temp")} value={temperatureValue} suffix={temperatureValue === "--" ? "" : "°C"} />
            <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
            <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} />
            <Metric label={t("metrics.activeBase")} value={activeDriveBase === "tracked" ? t("drive.tracked") : t("drive.mecanum")} />
            <Metric label={t("metrics.servoCount")} value={servoCount} />
            <Metric label={t("metrics.motorCount")} value={`${completeMotorMappingCount}/${motorCount}`} />
            <Metric label={t("metrics.moving")} value={movingServoCount} tone={movingServoCount > 0 ? "warning" : "neutral"} />
            <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} />
          </div>
          <p className="console-note">{t("console.telemetryNote")}</p>
        </section>

        <section className="console-card console-camera" aria-labelledby="console-camera-title">
          <div className="drive-section-title">
            <Video size={17} />
            <h3 id="console-camera-title">{t("console.camera")}</h3>
          </div>
          <CameraFeeds
            activeCameraSource={activeCameraSource}
            cameraConfig={cameraConfig}
            cameraSourceRuntimeById={cameraSourceRuntimeById}
            cameraStreamReloadToken={cameraStreamReloadToken}
            cameraVideoSources={cameraVideoSources}
            gridClassName="console-camera-viewer"
            setCameraSourceRuntime={setCameraSourceRuntime}
            t={t}
            updateCameraActiveSource={updateCameraActiveSource}
            updateCameraLatencyProfile={updateCameraLatencyProfile}
            updateCameraStreamMode={updateCameraStreamMode}
            updateCameraVideoLayout={updateCameraVideoLayout}
          />
        </section>

        <section className="console-card console-pose" aria-labelledby="robot-pose-title">
          <div className="drive-section-title">
            <SlidersHorizontal size={17} />
            <h3 id="robot-pose-title">{t("console.pose")}</h3>
          </div>
          <div className="console-arm-preview">{armCanvas}</div>
          <div className="drive-vector-grid console-vector-grid">
            <Metric label={t("metrics.forward")} value={Math.round(driveInput.forward * 100)} suffix="%" />
            <Metric label={t("metrics.strafe")} value={Math.round(driveInput.strafe * 100)} suffix="%" />
            <Metric label={t("metrics.turn")} value={Math.round(driveInput.turn * 100)} suffix="%" />
          </div>
        </section>

        <section className="console-card console-control" aria-labelledby="console-control-title">
          <div className="drive-section-title">
            <Gamepad2 size={17} />
            <h3 id="console-control-title">{t("console.control")}</h3>
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
        </section>

        <section className="console-card console-log" aria-labelledby="console-log-title">
          <div className="drive-section-title">
            <Activity size={17} />
            <h3 id="console-log-title">{t("panels.eventLog")}</h3>
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
        </section>
      </div>
    </section>
  );
}
