import { RefreshCw, Square, Video } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  enumerateLocalCameraDevices,
  isLocalCameraSupported,
  mediaErrorMessage,
  startLocalCameraStream,
  stopLocalCameraStream,
  type LocalCameraDevice
} from "./localCamera";

interface LocalCameraViewProps {
  fps?: number | string | null;
  height?: number | string | null;
  label: string;
  onDeviceSelected?: (deviceId: string) => void;
  preferredDeviceId?: string | null;
  width?: number | string | null;
}

type LocalCameraStatus = "idle" | "loading" | "online" | "error";
type LocalizedMessage = { key: string } | { text: string };

export function LocalCameraView({
  fps,
  height,
  label,
  onDeviceSelected,
  preferredDeviceId,
  width
}: LocalCameraViewProps) {
  const { t } = useTranslation();
  const supported = isLocalCameraSupported();
  const [devices, setDevices] = useState<LocalCameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => preferredDeviceId?.trim() ?? "");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<LocalCameraStatus>("idle");
  const [error, setError] = useState<LocalizedMessage | null>(null);
  const [notice, setNotice] = useState<LocalizedMessage | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeTrackSettings = stream?.getVideoTracks()[0]?.getSettings();
  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId) ?? null,
    [devices, selectedDeviceId]
  );

  useEffect(() => {
    setSelectedDeviceId((current) => current || preferredDeviceId?.trim() || "");
  }, [preferredDeviceId]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (supported) {
      void refreshDevices();
    }
    return () => {
      stopLocalCameraStream(streamRef.current);
      streamRef.current = null;
    };
  }, [supported]);

  async function refreshDevices() {
    if (!supported) {
      setError({ key: "localCamera.errors.unsupported" });
      setStatus("error");
      return;
    }
    setStatus((current) => (current === "online" ? current : "loading"));
    try {
      const nextDevices = await enumerateLocalCameraDevices();
      setDevices(nextDevices);
      if (nextDevices.length === 0) {
        setError({ key: "localCamera.errors.noneDetected" });
        setStatus("error");
        return;
      }
      if (selectedDeviceId && !nextDevices.some((device) => device.deviceId === selectedDeviceId)) {
        setNotice({ key: "localCamera.errors.savedUnavailable" });
      }
      setError(null);
      setStatus((current) => (current === "online" ? "online" : "idle"));
    } catch (nextError) {
      setError({ text: mediaErrorMessage(nextError) });
      setStatus("error");
    }
  }

  async function startPreview(deviceId = selectedDeviceId) {
    if (!supported) {
      setError({ key: "localCamera.errors.unsupported" });
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError(null);
    setNotice(null);
    stopCurrentStream();
    try {
      let nextStream: MediaStream;
      try {
        nextStream = await startLocalCameraStream({ deviceId, width, height, fps });
      } catch (nextError) {
        if (!deviceId) {
          throw nextError;
        }
        nextStream = await startLocalCameraStream({ width, height, fps });
        setSelectedDeviceId("");
        onDeviceSelected?.("");
        setNotice({ key: "localCamera.errors.savedUnavailableActive" });
      }

      streamRef.current = nextStream;
      setStream(nextStream);
      setStatus("online");
      await refreshDevices();
    } catch (nextError) {
      setError({ text: mediaErrorMessage(nextError) });
      setStatus("error");
    }
  }

  function stopCurrentStream() {
    stopLocalCameraStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function stopPreview() {
    stopCurrentStream();
    setStatus("idle");
    setNotice(null);
  }

  function selectDevice(deviceId: string) {
    setSelectedDeviceId(deviceId);
    onDeviceSelected?.(deviceId);
    if (streamRef.current) {
      void startPreview(deviceId);
    }
  }

  const statusLabel = t(`localCamera.status.${status}`);
  const currentDeviceLabel = selectedDevice?.label || (selectedDeviceId ? selectedDeviceId : t("localCamera.systemDefault"));
  const resolutionLabel =
    activeTrackSettings?.width && activeTrackSettings.height
      ? `${activeTrackSettings.width} x ${activeTrackSettings.height}`
      : `${width || "--"} x ${height || "--"}`;
  const fpsLabel = activeTrackSettings?.frameRate ? `${Math.round(activeTrackSettings.frameRate)} fps` : `${fps || "--"} fps`;

  return (
    <div className="local-camera-control architecture-wide-field">
      <div className="architecture-camera-view local-camera-preview">
        {stream ? (
          <video ref={videoRef} aria-label={label} autoPlay muted playsInline />
        ) : (
          <div className="local-camera-placeholder">
            <Video size={42} />
            <span>{supported ? t("localCamera.previewStopped") : t("localCamera.unsupported")}</span>
          </div>
        )}
      </div>

      <div className="local-camera-toolbar">
        <label>
          <span>{t("localCamera.deviceLabel")}</span>
          <select disabled={!supported || status === "loading"} value={selectedDeviceId} onChange={(event) => selectDevice(event.target.value)}>
            <option value="">{t("localCamera.systemDefault")}</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-button" disabled={!supported || status === "loading"} onClick={() => void refreshDevices()} type="button">
          <RefreshCw size={16} />
          <span>{t("localCamera.refreshDevices")}</span>
        </button>
        <button className="icon-button primary" disabled={!supported || status === "loading"} onClick={() => void startPreview()} type="button">
          <Video size={16} />
          <span>{t("localCamera.enableCamera")}</span>
        </button>
        <button className="icon-button danger" disabled={!stream} onClick={stopPreview} type="button">
          <Square size={16} />
          <span>{t("localCamera.stopPreview")}</span>
        </button>
      </div>

      <div className="preview-grid local-camera-metrics">
        <LocalCameraMetric label={t("localCamera.metrics.status")} value={statusLabel} />
        <LocalCameraMetric label={t("localCamera.metrics.device")} value={currentDeviceLabel} />
        <LocalCameraMetric label={t("localCamera.metrics.resolution")} value={resolutionLabel} />
        <LocalCameraMetric label={t("localCamera.metrics.frameRate")} value={fpsLabel} />
      </div>
      {notice && <p className="architecture-debug-message warning">{localizedMessage(notice, t)}</p>}
      {error && <p className="architecture-debug-message danger">{localizedMessage(error, t)}</p>}
    </div>
  );
}

function LocalCameraMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="architecture-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function localizedMessage(message: LocalizedMessage, t: (key: string) => string) {
  return "key" in message ? t(message.key) : message.text;
}
