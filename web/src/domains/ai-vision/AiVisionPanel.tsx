import { Activity, Camera, Crosshair, Database, ScanSearch } from "lucide-react";
import type { TFunction } from "i18next";
import type { CameraVideoSource } from "@adapters/persistence/storage";
import { Metric } from "@shared/ui/AppChrome";
import { AI_VISION_DEFAULT_LABEL, type AiVisionDetection } from "@domains/ai-vision/aiVision";
import type { AiVisionStatus, useAiVisionRuntime } from "@domains/ai-vision/useAiVisionRuntime";

type AiVisionRuntime = ReturnType<typeof useAiVisionRuntime>;

interface AiVisionPanelProps {
  activeCameraSource: CameraVideoSource;
  cameraVideoSources: CameraVideoSource[];
  runtime: AiVisionRuntime;
  t: TFunction;
  updateCameraActiveSource: (sourceId: string) => void;
}

export function AiVisionPanel({
  activeCameraSource,
  cameraVideoSources,
  runtime,
  t,
  updateCameraActiveSource
}: AiVisionPanelProps) {
  const busy = runtime.status === "checking" || runtime.status === "analyzing" || runtime.status === "capturing";
  const confidence = runtime.detections[0]?.confidence;
  const helperTone = runtime.helperReady ? "online" : runtime.status === "error" || runtime.status === "offline" ? "danger" : "neutral";

  return (
    <section className="ai-vision-panel" aria-labelledby="ai-vision-title">
      <div className="drive-section-title">
        <ScanSearch size={17} />
        <h3 id="ai-vision-title">{t("aiVision.title", { defaultValue: "AI Vision" })}</h3>
      </div>

      <div className="ai-vision-toolbar">
        <label>
          <span>{t("fields.activeVideoSource")}</span>
          <select value={activeCameraSource.id} onChange={(event) => updateCameraActiveSource(event.target.value)}>
            {cameraVideoSources.map((source) => (
              <option key={source.id} value={source.id}>{source.label}</option>
            ))}
          </select>
        </label>
        <button className="icon-button" disabled={busy} onClick={() => void runtime.checkHealth()} type="button">
          <Activity size={18} />
          <span>{t("aiVision.actions.check", { defaultValue: "Check AI" })}</span>
        </button>
        <button className="icon-button primary" disabled={busy || !activeCameraSource.streamUrl.trim()} onClick={() => void runtime.analyze(activeCameraSource)} type="button">
          <Crosshair size={18} />
          <span>{t("aiVision.actions.analyze", { defaultValue: "Analyze" })}</span>
        </button>
        <button className="icon-button" disabled={busy || !activeCameraSource.streamUrl.trim()} onClick={() => void runtime.captureSample(activeCameraSource, AI_VISION_DEFAULT_LABEL)} type="button">
          <Camera size={18} />
          <span>{t("aiVision.actions.capture", { defaultValue: "Capture" })}</span>
        </button>
      </div>

      <div className="preview-grid ai-vision-metrics">
        <Metric label={t("aiVision.metrics.helper", { defaultValue: "Helper" })} value={statusLabel(runtime.status)} tone={helperTone} />
        <Metric label={t("aiVision.metrics.mode", { defaultValue: "Mode" })} value={runtime.health?.mode ?? "--"} />
        <Metric label={t("aiVision.metrics.detections", { defaultValue: "Detections" })} value={runtime.detections.length} tone={runtime.detections.length > 0 ? "online" : "neutral"} />
        <Metric label={t("aiVision.metrics.confidence", { defaultValue: "Confidence" })} value={confidence === undefined ? "--" : Math.round(confidence * 100)} suffix={confidence === undefined ? "" : "%"} />
      </div>

      <div className="ai-vision-preview">
        {activeCameraSource.streamUrl.trim() ? (
          <>
            <img alt={`${activeCameraSource.label} AI vision`} src={activeCameraSource.streamUrl} />
            <DetectionOverlay detections={runtime.detections} />
          </>
        ) : (
          <div className="camera-placeholder ai-vision-empty">
            <Camera size={38} />
            <span>{t("empty.noCameraStream")}</span>
          </div>
        )}
      </div>

      {runtime.error && <p className="form-error">{runtime.error}</p>}
      {runtime.lastCaptureResult && (
        <div className="ai-vision-capture-path">
          <Database size={15} />
          <span>{runtime.lastCaptureResult.imagePath}</span>
        </div>
      )}
      <div className="ai-vision-log-list">
        {runtime.logs.length === 0 ? (
          <div className="empty-state">{t("aiVision.empty.logs", { defaultValue: "No AI vision run yet." })}</div>
        ) : runtime.logs.map((entry) => (
          <div className={`ai-vision-log ${entry.level}`} key={entry.id}>
            <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
            <strong>{entry.message}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DetectionOverlay({ detections }: { detections: AiVisionDetection[] }) {
  return (
    <div className="ai-vision-overlay" aria-hidden="true">
      {detections.map((detection, index) => (
        <div
          className="ai-vision-box"
          key={`${detection.label}-${index}-${detection.frameTimestamp}`}
          style={{
            left: `${detection.bbox.x * 100}%`,
            top: `${detection.bbox.y * 100}%`,
            width: `${detection.bbox.width * 100}%`,
            height: `${detection.bbox.height * 100}%`
          }}
        >
          <span>{detection.label} {Math.round(detection.confidence * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function statusLabel(status: AiVisionStatus): string {
  if (status === "checking") {
    return "checking";
  }
  if (status === "analyzing") {
    return "analyzing";
  }
  if (status === "capturing") {
    return "capturing";
  }
  if (status === "online") {
    return "online";
  }
  if (status === "offline") {
    return "offline";
  }
  if (status === "error") {
    return "error";
  }
  return "unknown";
}
