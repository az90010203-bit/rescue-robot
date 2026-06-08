import type { TFunction } from "i18next";
import {
  type CameraConfig,
  type CameraLatencyProfile,
  type CameraStreamMode,
  type CameraVideoLayout,
  type CameraVideoSource
} from "../../lib/storage";
import { CameraSourcePanel } from "./CameraSourcePanel";
import { defaultCameraSourceRuntimeStatus, type CameraSourceRuntimeStatus } from "./cameraSources";

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
          <CameraSourcePanel
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
