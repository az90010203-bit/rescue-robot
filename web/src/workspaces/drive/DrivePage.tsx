import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Gamepad2, Play, Save, SlidersHorizontal, Square, Video } from "lucide-react";
import type { FormEvent } from "react";
import type { TFunction } from "i18next";
import { Metric, PanelTitle } from "@shared/ui/AppChrome";
import { PiCameraCard } from "@workspaces/pi/PiRemotePanels";
import type { PiRemoteRuntime } from "@adapters/pi/usePiRemote";
import type { DriveInputState } from "@domains/drive/drive";
import type { MotorStopMode } from "@adapters/hardware/protocol";
import {
  type CameraConfig,
  type CameraLatencyProfile,
  type CameraStreamMode,
  type CameraVideoLayout,
  type CameraVideoSource
} from "@adapters/persistence/storage";
import { CameraFeeds } from "@domains/camera/CameraFeeds";
import type { CameraSourceRuntimeStatus } from "@domains/camera/cameraSources";

interface DrivePageProps {
  activeDriveBase: "tracked" | "mecanum";
  activeCameraSource: CameraVideoSource;
  activeGamepad: { index: number } | null;
  cameraCanCommand: boolean;
  cameraConfig: CameraConfig;
  cameraConfigError: string | null;
  cameraPreviewCommand: string;
  cameraSourceRuntimeById: Record<string, CameraSourceRuntimeStatus>;
  cameraStreamReloadToken: number;
  cameraStreamFailed: boolean;
  cameraStreamLoaded: boolean;
  cameraStreamUrl: string;
  cameraValidationError: string | null;
  cameraVideoSources: CameraVideoSource[];
  centerCamera: () => void;
  connected: boolean;
  debugEnabled: boolean;
  driveCanCommand: boolean;
  driveInput: DriveInputState;
  drivePreviewCommand: string;
  driveSpeedLimit: string;
  driveTargets: Array<{ channel: string; speedPercent: number }>;
  nudgeCamera: (panDelta: number, tiltDelta: number) => void;
  piRemote: PiRemoteRuntime;
  saveCameraSettings: (event: FormEvent<HTMLFormElement>) => void;
  selectDriveBase: (base: "tracked" | "mecanum") => void;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  setDriveSpeedLimit: (value: string) => void;
  setStopMode: (mode: MotorStopMode) => void;
  speedLimitPercent: number;
  stopAllMotors: () => void;
  stopMode: MotorStopMode;
  t: TFunction;
  updateCameraActiveSource: (sourceId: string) => void;
  updateCameraLatencyProfile: (profile: CameraLatencyProfile) => void;
  updateCameraNumber: (field: any, value: string) => void;
  updateCameraSourcePort: (sourceId: string, value: string) => void;
  updateCameraSourceText: (sourceId: string, field: "label" | "devicePath" | "streamUrl", value: string) => void;
  updateCameraStreamMode: (mode: CameraStreamMode) => void;
  updateCameraText: (field: "streamUrl" | "webrtcOfferUrl", value: string) => void;
  updateCameraVideoLayout: (layout: CameraVideoLayout) => void;
}

export function DrivePage({
  activeDriveBase,
  activeCameraSource,
  activeGamepad,
  cameraCanCommand,
  cameraConfig,
  cameraConfigError,
  cameraPreviewCommand,
  cameraSourceRuntimeById,
  cameraStreamReloadToken,
  cameraStreamFailed,
  cameraStreamLoaded,
  cameraStreamUrl,
  cameraValidationError,
  cameraVideoSources,
  centerCamera,
  connected,
  debugEnabled,
  driveCanCommand,
  driveInput,
  drivePreviewCommand,
  driveSpeedLimit,
  driveTargets,
  nudgeCamera,
  piRemote,
  saveCameraSettings,
  selectDriveBase,
  setCameraSourceRuntime,
  setDriveSpeedLimit,
  setStopMode,
  speedLimitPercent,
  stopAllMotors,
  stopMode,
  t,
  updateCameraActiveSource,
  updateCameraLatencyProfile,
  updateCameraNumber,
  updateCameraSourcePort,
  updateCameraSourceText,
  updateCameraStreamMode,
  updateCameraText,
  updateCameraVideoLayout
}: DrivePageProps) {
  const gimbalPadClass = (baseClass: string, active: boolean) => (active ? `${baseClass} active` : baseClass);

  return (
    <section className="panel drive-page-panel" aria-labelledby="drive-page-title">
      <div className="drive-page-header">
        <PanelTitle icon={<Video size={18} />} id="drive-page-title" meta={driveCanCommand ? t("status.ready") : t("status.standby")} title={t("panels.driveCamera")} />
      </div>

      <div className="drive-page-grid">
        <section className="drive-page-status" aria-labelledby="drive-status-title">
          <div className="drive-section-title">
            <Play size={17} />
            <h3 id="drive-status-title">{t("panels.driveStatus")}</h3>
          </div>
          <div className="drive-status-grid">
            <Metric
              label={t("metrics.stream")}
              value={cameraStreamUrl ? (cameraStreamFailed ? t("status.streamError") : cameraStreamLoaded ? t("status.streamOnline") : t("status.streamLoading")) : t("status.streamMissing")}
              tone={cameraStreamFailed ? "danger" : cameraStreamLoaded ? "online" : "neutral"}
            />
            <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
            <Metric label={t("status.debugMode")} value={debugEnabled ? t("status.debug") : t("status.standby")} tone={debugEnabled ? "warning" : "neutral"} />
            <Metric label={t("metrics.gimbal")} value={cameraValidationError ? t("status.configInvalid") : cameraCanCommand ? t("status.ready") : t("status.standby")} tone={cameraValidationError ? "danger" : cameraCanCommand ? "online" : "neutral"} />
            <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} />
            <Metric label={t("metrics.activeBase")} value={activeDriveBase === "tracked" ? t("drive.tracked") : t("drive.mecanum")} />
            <Metric label={t("metrics.forward")} value={Math.round(driveInput.forward * 100)} suffix="%" />
            <Metric label={t("metrics.strafe")} value={Math.round(driveInput.strafe * 100)} suffix="%" />
            <Metric label={t("metrics.turn")} value={Math.round(driveInput.turn * 100)} suffix="%" />
            <Metric label={t("metrics.cameraPan")} value={Math.round(driveInput.cameraPan * 100)} suffix="%" />
            <Metric label={t("metrics.cameraTilt")} value={Math.round(driveInput.cameraTilt * 100)} suffix="%" />
            <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} />
          </div>
          <div className="drive-target-list drive-status-targets" aria-label={t("aria.driveTargets")}>
            {driveTargets.map((target) => (
              <div className="drive-target-row" key={target.channel}>
                <span>{target.channel}</span>
                <strong>{target.speedPercent}%</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="drive-page-camera" aria-label={t("panels.driveCamera")}>
          <CameraFeeds
            activeCameraSource={activeCameraSource}
            cameraConfig={cameraConfig}
            cameraSourceRuntimeById={cameraSourceRuntimeById}
            cameraStreamReloadToken={cameraStreamReloadToken}
            cameraVideoSources={cameraVideoSources}
            setCameraSourceRuntime={setCameraSourceRuntime}
            t={t}
            updateCameraActiveSource={updateCameraActiveSource}
            updateCameraLatencyProfile={updateCameraLatencyProfile}
            updateCameraStreamMode={updateCameraStreamMode}
            updateCameraVideoLayout={updateCameraVideoLayout}
          />
          <PiCameraCard activeCameraSource={activeCameraSource} cameraStreamUrl={cameraStreamUrl} runtime={piRemote} t={t} />
        </section>

        <section className="drive-page-controller" aria-labelledby="drive-controller-title">
          <div className="drive-section-title">
            <Gamepad2 size={17} />
            <h3 id="drive-controller-title">{t("panels.driveController")}</h3>
          </div>
          <div className="drive-base-switch" aria-label={t("aria.driveBase")}>
            <button className={activeDriveBase === "tracked" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("tracked")} type="button">
              <span>{t("drive.tracked")}</span>
            </button>
            <button className={activeDriveBase === "mecanum" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("mecanum")} type="button">
              <span>{t("drive.mecanum")}</span>
            </button>
          </div>

          <button className="icon-button danger drive-stop-button" onClick={stopAllMotors} type="button">
            <Square size={18} />
            <span>{t("actions.stopAll")}</span>
          </button>

          <div className="gimbal-pad" aria-label={t("aria.gimbalControls")}>
            <button className={gimbalPadClass("icon-only pad-up", driveInput.cameraTilt > 0)} disabled={!cameraCanCommand} onClick={() => nudgeCamera(0, cameraConfig.stepDeg)} title={t("actions.tiltUp")} type="button" aria-label={t("actions.tiltUp")}>
              <ArrowUp size={18} />
            </button>
            <button className={gimbalPadClass("icon-only pad-left", driveInput.cameraPan < 0)} disabled={!cameraCanCommand} onClick={() => nudgeCamera(-cameraConfig.stepDeg, 0)} title={t("actions.panLeft")} type="button" aria-label={t("actions.panLeft")}>
              <ArrowLeft size={18} />
            </button>
            <button className="icon-only pad-center" disabled={!cameraCanCommand} onClick={centerCamera} title={t("actions.centerCamera")} type="button" aria-label={t("actions.centerCamera")}>
              <Crosshair size={18} />
            </button>
            <button className={gimbalPadClass("icon-only pad-right", driveInput.cameraPan > 0)} disabled={!cameraCanCommand} onClick={() => nudgeCamera(cameraConfig.stepDeg, 0)} title={t("actions.panRight")} type="button" aria-label={t("actions.panRight")}>
              <ArrowRight size={18} />
            </button>
            <button className={gimbalPadClass("icon-only pad-down", driveInput.cameraTilt < 0)} disabled={!cameraCanCommand} onClick={() => nudgeCamera(0, -cameraConfig.stepDeg)} title={t("actions.tiltDown")} type="button" aria-label={t("actions.tiltDown")}>
              <ArrowDown size={18} />
            </button>
          </div>

          <div className="drive-controller-notes">
            <div className="camera-command-note">{driveCanCommand ? t("drive.commandReady") : connected ? t("drive.enableDebug") : t("drive.connectSerial")}</div>
            <div className="camera-command-note">{cameraCanCommand ? t("camera.gimbalReady") : connected ? t("camera.enableDebug") : t("camera.connectSerial")}</div>
          </div>

          <div className="preview-grid drive-controller-preview">
            <Metric className="frame-preview" label={t("metrics.driveOutput")} value={drivePreviewCommand || "--"} code />
            <Metric className="frame-preview" label={t("metrics.cameraOutput")} value={cameraPreviewCommand || "--"} code />
          </div>
        </section>

        <form className="drive-page-params" onSubmit={saveCameraSettings} aria-labelledby="drive-params-title">
          <div className="drive-section-title full-field">
            <SlidersHorizontal size={17} />
            <h3 id="drive-params-title">{t("panels.driveParameters")}</h3>
          </div>
          <label>
            <span>{t("fields.speedLimit")}: {speedLimitPercent.toFixed(0)}%</span>
            <input type="range" min={0} max={100} step={5} value={driveSpeedLimit} onChange={(event) => setDriveSpeedLimit(event.target.value)} />
          </label>
          <label>
            <span>{t("fields.stopMode")}</span>
            <select value={stopMode} onChange={(event) => setStopMode(event.target.value as MotorStopMode)}>
              <option value="coast">{t("stopMode.coast")}</option>
              <option value="brake">{t("stopMode.brake")}</option>
            </select>
          </label>
          <label>
            <span>{t("fields.activeVideoSource")}</span>
            <select value={activeCameraSource.id} onChange={(event) => updateCameraActiveSource(event.target.value)}>
              {cameraConfig.videoSources.map((source) => (
                <option key={source.id} value={source.id}>{source.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("fields.videoLayout")}</span>
            <select value={cameraConfig.videoLayout} onChange={(event) => updateCameraVideoLayout(event.target.value as CameraVideoLayout)}>
              <option value="single">{t("camera.videoLayout.single")}</option>
              <option value="dual">{t("camera.videoLayout.dual")}</option>
            </select>
          </label>
          <label>
            <span>{t("fields.sourceLabel")}</span>
            <input value={activeCameraSource.label} onChange={(event) => updateCameraSourceText(activeCameraSource.id, "label", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.sourceDevice")}</span>
            <input value={activeCameraSource.devicePath} onChange={(event) => updateCameraSourceText(activeCameraSource.id, "devicePath", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.sourcePort")}</span>
            <input inputMode="numeric" min={1} max={65535} step={1} type="number" value={activeCameraSource.port} onChange={(event) => updateCameraSourcePort(activeCameraSource.id, event.target.value)} />
          </label>
          <label className="drive-param-wide">
            <span>{t("fields.streamUrl")}</span>
            <input placeholder={t("placeholders.streamUrl")} type="url" value={activeCameraSource.streamUrl} onChange={(event) => updateCameraSourceText(activeCameraSource.id, "streamUrl", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.cameraStreamMode")}</span>
            <select value={cameraConfig.streamMode} onChange={(event) => updateCameraStreamMode(event.target.value as CameraStreamMode)}>
              <option value="mjpeg">{t("camera.streamModes.mjpeg")}</option>
              <option value="webrtc">{t("camera.streamModes.webrtc")}</option>
            </select>
          </label>
          <label>
            <span>{t("fields.latencyProfile")}</span>
            <select value={cameraConfig.latencyProfile} onChange={(event) => updateCameraLatencyProfile(event.target.value as CameraLatencyProfile)}>
              <option value="lowLatency">{t("camera.latencyProfiles.lowLatency")}</option>
              <option value="balanced">{t("camera.latencyProfiles.balanced")}</option>
              <option value="sharp">{t("camera.latencyProfiles.sharp")}</option>
            </select>
          </label>
          <label className="drive-param-wide">
            <span>{t("fields.webrtcOfferUrl")}</span>
            <input placeholder={t("placeholders.webrtcOfferUrl")} type="url" value={cameraConfig.webrtcOfferUrl} onChange={(event) => updateCameraText("webrtcOfferUrl", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.panServoId")}</span>
            <input inputMode="numeric" min={0} max={253} step={1} type="number" value={cameraConfig.panServoId} onChange={(event) => updateCameraNumber("panServoId", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.tiltServoId")}</span>
            <input inputMode="numeric" min={0} max={253} step={1} type="number" value={cameraConfig.tiltServoId} onChange={(event) => updateCameraNumber("tiltServoId", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.panMinDeg")}</span>
            <input type="number" min={0} max={360} step={1} value={cameraConfig.panMinDeg} onChange={(event) => updateCameraNumber("panMinDeg", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.panMaxDeg")}</span>
            <input type="number" min={0} max={360} step={1} value={cameraConfig.panMaxDeg} onChange={(event) => updateCameraNumber("panMaxDeg", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.tiltMinDeg")}</span>
            <input type="number" min={0} max={360} step={1} value={cameraConfig.tiltMinDeg} onChange={(event) => updateCameraNumber("tiltMinDeg", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.tiltMaxDeg")}</span>
            <input type="number" min={0} max={360} step={1} value={cameraConfig.tiltMaxDeg} onChange={(event) => updateCameraNumber("tiltMaxDeg", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.stepDeg")}</span>
            <input type="number" min={1} max={90} step={1} value={cameraConfig.stepDeg} onChange={(event) => updateCameraNumber("stepDeg", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.speedRaw")}</span>
            <input type="number" min={0} max={4095} step={1} value={cameraConfig.speedRaw} onChange={(event) => updateCameraNumber("speedRaw", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.acceleration")}</span>
            <input type="number" min={0} max={254} step={1} value={cameraConfig.acc} onChange={(event) => updateCameraNumber("acc", event.target.value)} />
          </label>
          <button className="icon-button primary drive-param-save" type="submit">
            <Save size={18} />
            <span>{t("actions.saveCamera")}</span>
          </button>
          {(cameraConfigError || cameraValidationError) && <p className="form-error full-field">{t(cameraConfigError ?? cameraValidationError ?? "")}</p>}
        </form>
      </div>
    </section>
  );
}
