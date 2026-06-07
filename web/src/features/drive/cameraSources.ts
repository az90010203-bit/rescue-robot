import {
  buildCameraOfferUrl,
  DEFAULT_CAMERA_CONFIG,
  MAIN_CAMERA_SOURCE_ID,
  SECONDARY_CAMERA_SOURCE_ID,
  type CameraConfig,
  type CameraVideoSource
} from "../../lib/storage";
import { buildPiCameraStreamUrl, buildPiCameraWebrtcOfferUrl } from "../../lib/piRemote";

export interface CameraLatencyStatus {
  estimateMs: number | null;
  frameAgeMs: number | null;
  rttMs: number | null;
  updatedAt: number;
  error: string | null;
}

export interface CameraSourceRuntimeStatus {
  loaded: boolean;
  failed: boolean;
  webrtcFallback: boolean;
  webrtcError: string | null;
  latency: CameraLatencyStatus | null;
}

export function defaultCameraSourceRuntimeStatus(): CameraSourceRuntimeStatus {
  return {
    loaded: false,
    failed: false,
    webrtcFallback: false,
    webrtcError: null,
    latency: null
  };
}

export function cameraSourceById(config: CameraConfig, sourceId: string): CameraVideoSource {
  return (
    config.videoSources.find((source) => source.id === sourceId) ??
    config.videoSources.find((source) => source.id === MAIN_CAMERA_SOURCE_ID) ??
    config.videoSources[0] ??
    DEFAULT_CAMERA_CONFIG.videoSources[0]
  );
}

export function cameraSourceForDevice(config: CameraConfig, deviceId: string): CameraVideoSource {
  return cameraSourceById(config, deviceId === "camera:secondary" ? SECONDARY_CAMERA_SOURCE_ID : MAIN_CAMERA_SOURCE_ID);
}

export function visibleCameraSources(config: CameraConfig): CameraVideoSource[] {
  if (config.videoLayout === "dual") {
    return [MAIN_CAMERA_SOURCE_ID, SECONDARY_CAMERA_SOURCE_ID]
      .map((sourceId) => config.videoSources.find((source) => source.id === sourceId))
      .filter((source): source is CameraVideoSource => Boolean(source));
  }
  return [cameraSourceById(config, config.activeVideoSourceId)];
}

export function cameraStreamOfferUrl(source: CameraVideoSource, config: CameraConfig): string {
  return source.id === MAIN_CAMERA_SOURCE_ID
    ? config.webrtcOfferUrl.trim() || buildCameraOfferUrl(source.streamUrl)
    : buildCameraOfferUrl(source.streamUrl);
}

export function updateCameraSource(
  sources: CameraVideoSource[],
  sourceId: string,
  patch: Partial<CameraVideoSource>
): CameraVideoSource[] {
  return sources.map((source) => (source.id === sourceId ? { ...source, ...patch } : source));
}

export function adaptCameraConfigToPiHost(config: CameraConfig, host: string): CameraConfig {
  const piHost = host.trim();
  if (!piHost) {
    return config;
  }

  let changed = false;
  const videoSources = config.videoSources.map((source) => {
    if (!isPiUsbCameraSource(source)) {
      return source;
    }
    const streamUrl = buildPiCameraStreamUrl(piHost, source.port);
    if (source.streamUrl === streamUrl) {
      return source;
    }
    changed = true;
    return { ...source, streamUrl };
  });
  const mainSource = videoSources.find((source) => source.id === MAIN_CAMERA_SOURCE_ID);
  const mainStreamUrl = mainSource?.streamUrl ?? config.streamUrl;
  const mainOfferUrl = mainSource ? buildPiCameraWebrtcOfferUrl(piHost, mainSource.port) : buildCameraOfferUrl(mainStreamUrl);

  if (config.streamUrl !== mainStreamUrl || config.webrtcOfferUrl !== mainOfferUrl) {
    changed = true;
  }

  return changed
    ? {
        ...config,
        streamUrl: mainStreamUrl,
        webrtcOfferUrl: mainOfferUrl,
        videoSources
      }
    : config;
}

function isPiUsbCameraSource(source: CameraVideoSource): boolean {
  return source.devicePath.trim().startsWith("/dev/video");
}

export function buildCameraLatencyUrl(streamUrl: string): string {
  try {
    const url = new URL(streamUrl);
    url.pathname = "/latency";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}
