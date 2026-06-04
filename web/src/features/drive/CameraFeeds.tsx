import { VideoOff } from "lucide-react";
import type { TFunction } from "i18next";
import { Metric } from "../../shared/ui/AppChrome";
import {
  MAIN_CAMERA_SOURCE_ID,
  type CameraConfig,
  type CameraLatencyProfile,
  type CameraStreamMode,
  type CameraVideoLayout,
  type CameraVideoSource
} from "../../lib/storage";
import { CameraViewer, type CameraEffectiveMode } from "./CameraViewer";
import { cameraStreamOfferUrl, defaultCameraSourceRuntimeStatus, type CameraSourceRuntimeStatus } from "./cameraSources";

interface CameraFeedsProps {
  activeCameraSource: CameraVideoSource;
  cameraConfig: CameraConfig;
  cameraSourceRuntimeById: Record<string, CameraSourceRuntimeStatus>;
  cameraStreamReloadToken: number;
  cameraVideoSources: CameraVideoSource[];
  gridClassName?: string;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  t: TFunction;
  updateCameraActiveSource: (sourceId: string) => void;
  updateCameraLatencyProfile: (profile: CameraLatencyProfile) => void;
  updateCameraStreamMode: (mode: CameraStreamMode) => void;
  updateCameraVideoLayout: (layout: CameraVideoLayout) => void;
}

export function CameraFeeds({
  activeCameraSource,
  cameraConfig,
  cameraSourceRuntimeById,
  cameraStreamReloadToken,
  cameraVideoSources,
  gridClassName = "",
  setCameraSourceRuntime,
  t,
  updateCameraActiveSource,
  updateCameraLatencyProfile,
  updateCameraStreamMode,
  updateCameraVideoLayout
}: CameraFeedsProps) {
  return (
    <>
      <CameraModeControls
        activeCameraSource={activeCameraSource}
        cameraConfig={cameraConfig}
        t={t}
        updateCameraActiveSource={updateCameraActiveSource}
        updateCameraLatencyProfile={updateCameraLatencyProfile}
        updateCameraStreamMode={updateCameraStreamMode}
        updateCameraVideoLayout={updateCameraVideoLayout}
      />
      <div className={`camera-video-grid ${cameraConfig.videoLayout === "dual" ? "dual" : "single"} ${gridClassName}`.trim()}>
        {cameraVideoSources.map((source) => (
          <CameraSourceViewer
            cameraConfig={cameraConfig}
            cameraStreamReloadToken={cameraStreamReloadToken}
            key={source.id}
            runtime={cameraSourceRuntimeById[source.id] ?? defaultCameraSourceRuntimeStatus()}
            setCameraSourceRuntime={setCameraSourceRuntime}
            source={source}
            t={t}
          />
        ))}
      </div>
    </>
  );
}

function CameraModeControls({
  activeCameraSource,
  cameraConfig,
  t,
  updateCameraActiveSource,
  updateCameraLatencyProfile,
  updateCameraStreamMode,
  updateCameraVideoLayout
}: Pick<
  CameraFeedsProps,
  "activeCameraSource" | "cameraConfig" | "t" | "updateCameraActiveSource" | "updateCameraLatencyProfile" | "updateCameraStreamMode" | "updateCameraVideoLayout"
>) {
  const profiles: CameraLatencyProfile[] = ["lowLatency", "balanced", "sharp"];
  const modes: CameraStreamMode[] = ["mjpeg", "webrtc"];

  return (
    <div className="camera-mode-controls">
      <div className="drive-base-switch camera-segmented-control" aria-label={t("aria.cameraSource")}>
        {cameraConfig.videoSources.map((source) => (
          <button className={cameraConfig.videoLayout === "single" && activeCameraSource.id === source.id ? "module-tab active" : "module-tab"} key={source.id} onClick={() => updateCameraActiveSource(source.id)} type="button">
            <span>{source.label}</span>
          </button>
        ))}
      </div>
      <div className="drive-base-switch camera-segmented-control" aria-label={t("aria.cameraVideoLayout")}>
        <button className={cameraConfig.videoLayout === "single" ? "module-tab active" : "module-tab"} onClick={() => updateCameraVideoLayout("single")} type="button">
          <span>{t("camera.videoLayout.single")}</span>
        </button>
        <button className={cameraConfig.videoLayout === "dual" ? "module-tab active" : "module-tab"} onClick={() => updateCameraVideoLayout("dual")} type="button">
          <span>{t("camera.videoLayout.dual")}</span>
        </button>
      </div>
      <div className="drive-base-switch camera-segmented-control" aria-label={t("aria.cameraLatencyProfile")}>
        {profiles.map((profile) => (
          <button className={cameraConfig.latencyProfile === profile ? "module-tab active" : "module-tab"} key={profile} onClick={() => updateCameraLatencyProfile(profile)} type="button">
            <span>{t(`camera.latencyProfiles.${profile}`)}</span>
          </button>
        ))}
      </div>
      <div className="drive-base-switch camera-segmented-control" aria-label={t("aria.cameraStreamMode")}>
        {modes.map((mode) => (
          <button className={cameraConfig.streamMode === mode ? "module-tab active" : "module-tab"} key={mode} onClick={() => updateCameraStreamMode(mode)} type="button">
            <span>{t(`camera.streamModes.${mode}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function CameraSourceViewer({
  cameraConfig,
  cameraStreamReloadToken,
  runtime,
  setCameraSourceRuntime,
  source,
  t
}: {
  cameraConfig: CameraConfig;
  cameraStreamReloadToken: number;
  runtime: CameraSourceRuntimeStatus;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  source: CameraVideoSource;
  t: TFunction;
}) {
  const sourceMode: CameraStreamMode = source.id === MAIN_CAMERA_SOURCE_ID ? cameraConfig.streamMode : "mjpeg";
  const effectiveMode: CameraEffectiveMode = sourceMode === "webrtc" && runtime.webrtcFallback ? "mjpegFallback" : sourceMode;
  const modeLabel =
    effectiveMode === "webrtc"
      ? t("camera.streamModes.webrtc")
      : effectiveMode === "mjpegFallback"
        ? t("camera.streamModes.mjpegFallback")
        : t("camera.streamModes.mjpeg");
  const latencyLabel = runtime.latency?.estimateMs === null || runtime.latency?.estimateMs === undefined ? "--" : `≈${Math.round(runtime.latency.estimateMs)} ms`;
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
    <div className="camera-source-panel">
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
                ? `${t("status.streamOnline")} · ${modeLabel}`
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
  );
}
