import { VideoOff } from "lucide-react";
import type { TFunction } from "i18next";
import { Fragment, type ReactNode } from "react";
import { Metric } from "@shared/ui/AppChrome";
import {
  MAIN_CAMERA_SOURCE_ID,
  type CameraConfig,
  type CameraStreamMode,
  type CameraVideoSource
} from "@adapters/persistence/storage";
import { CameraViewer, type CameraEffectiveMode } from "@domains/camera/CameraViewer";
import { cameraStreamOfferUrl, defaultCameraSourceRuntimeStatus, type CameraSourceRuntimeStatus } from "@domains/camera/cameraSources";

export interface CameraSourcePanelProps {
  cameraConfig: CameraConfig;
  cameraStreamReloadToken: number;
  className?: string;
  hiddenItemCount?: number;
  runtime?: CameraSourceRuntimeStatus;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  source: CameraVideoSource;
  t: TFunction;
  visibleItemIds?: readonly string[];
}

interface CameraSourceMetric {
  id: string;
  node: ReactNode;
}

export function CameraSourcePanel({
  cameraConfig,
  cameraStreamReloadToken,
  className = "",
  hiddenItemCount = 0,
  runtime = defaultCameraSourceRuntimeStatus(),
  setCameraSourceRuntime,
  source,
  t,
  visibleItemIds
}: CameraSourcePanelProps) {
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
  const metrics: CameraSourceMetric[] = [
    { id: "videoLatency", node: <Metric label={t("metrics.videoLatency")} value={latencyLabel} tone={tone} /> },
    { id: "networkRtt", node: <Metric label={t("metrics.networkRtt")} value={rttLabel} tone={tone} /> },
    { id: "sourceDevicePath", node: <Metric label={t("fields.sourceDevicePath")} value={source.devicePath} /> },
    { id: "sourcePort", node: <Metric label={t("fields.sourcePort")} value={source.port} /> }
  ];

  return (
    <div className={["camera-source-panel", className].filter(Boolean).join(" ")} data-stream-url={source.streamUrl}>
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
        {visibleCameraMetrics(metrics, visibleItemIds).map((metric) => <Fragment key={metric.id}>{metric.node}</Fragment>)}
        {hiddenItemCount > 0 && <Metric className="console-metric-overflow" label={t("dashboard.fields.hiddenMetrics")} value={`+${hiddenItemCount}`} />}
      </div>
      {hiddenItemCount === 0 && runtime.webrtcError && runtime.webrtcFallback && source.id === MAIN_CAMERA_SOURCE_ID && <p className="camera-mode-note">{t("camera.webrtcFallback", { error: runtime.webrtcError })}</p>}
    </div>
  );
}

function visibleCameraMetrics(metrics: CameraSourceMetric[], visibleItemIds?: readonly string[]) {
  if (!visibleItemIds || visibleItemIds.length === 0) {
    return metrics;
  }
  const visible = new Set(visibleItemIds);
  return metrics.filter((metric) => visible.has(metric.id));
}
