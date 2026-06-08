import { useCallback, useEffect, useMemo, useState } from "react";
import { MAIN_CAMERA_SOURCE_ID, type CameraConfig } from "@adapters/persistence/storage";
import {
  buildCameraLatencyUrl,
  cameraSourceById,
  defaultCameraSourceRuntimeStatus,
  visibleCameraSources,
  type CameraSourceRuntimeStatus
} from "@domains/camera/cameraSources";

interface UseCameraSourceRuntimeOptions {
  cameraConfig: CameraConfig;
}

export function useCameraSourceRuntime({ cameraConfig }: UseCameraSourceRuntimeOptions) {
  const [cameraSourceRuntimeById, setCameraSourceRuntimeById] = useState<Record<string, CameraSourceRuntimeStatus>>({});
  const [cameraStreamReloadToken, setCameraStreamReloadToken] = useState(0);
  const activeCameraSource = cameraSourceById(cameraConfig, cameraConfig.activeVideoSourceId);
  const cameraVideoSources = useMemo(() => visibleCameraSources(cameraConfig), [cameraConfig]);
  const activeCameraRuntime = cameraSourceRuntimeById[activeCameraSource.id] ?? defaultCameraSourceRuntimeStatus();
  const cameraStreamUrl = activeCameraSource.streamUrl.trim();
  const cameraReadyBySourceId = useMemo(
    () =>
      Object.fromEntries(
        cameraConfig.videoSources.map((source) => [
          source.id,
          Boolean(source.streamUrl.trim()) && cameraSourceRuntimeById[source.id]?.loaded === true
        ])
      ),
    [cameraConfig.videoSources, cameraSourceRuntimeById]
  );
  const cameraRuntimeResetSignature = cameraConfig.videoSources
    .map((source) => `${source.id}:${source.streamUrl}:${source.port}`)
    .join("|");
  const cameraVisibleLatencySignature = cameraVideoSources.map((source) => `${source.id}:${source.streamUrl}`).join("|");

  const setCameraSourceRuntime = useCallback((sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => {
    setCameraSourceRuntimeById((current) => {
      const existing = current[sourceId] ?? defaultCameraSourceRuntimeStatus();
      if (cameraRuntimePatchMatches(existing, patch)) {
        return current;
      }
      return {
        ...current,
        [sourceId]: {
          ...defaultCameraSourceRuntimeStatus(),
          ...existing,
          ...patch
        }
      };
    });
  }, []);

  const resetCameraSourceRuntime = useCallback((sourceId: string) => {
    setCameraSourceRuntimeById((current) => {
      const resetStatus = defaultCameraSourceRuntimeStatus();
      const existing = current[sourceId];
      if (!existing || cameraRuntimePatchMatches(existing, resetStatus)) {
        return current;
      }
      return {
        ...current,
        [sourceId]: resetStatus
      };
    });
  }, []);

  useEffect(() => {
    for (const source of cameraConfig.videoSources) {
      resetCameraSourceRuntime(source.id);
    }
  }, [cameraConfig.latencyProfile, cameraConfig.streamMode, cameraConfig.webrtcOfferUrl, cameraRuntimeResetSignature, resetCameraSourceRuntime]);

  useEffect(() => {
    if (cameraVideoSources.length === 0) {
      return undefined;
    }

    let cancelled = false;
    const timers: number[] = [];

    async function pollLatency(sourceId: string, streamUrl: string) {
      if (!streamUrl) {
        setCameraSourceRuntime(sourceId, { latency: null });
        return;
      }

      const latencyUrl = buildCameraLatencyUrl(streamUrl);
      if (!latencyUrl) {
        setCameraSourceRuntime(sourceId, { latency: { estimateMs: null, frameAgeMs: null, rttMs: null, updatedAt: Date.now(), error: "invalid latency URL" } });
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1800);
      const startedAt = performance.now();
      try {
        const response = await fetch(`${latencyUrl}?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        const finishedAt = performance.now();
        if (!response.ok) {
          throw new Error(`latency endpoint returned ${response.status}`);
        }
        const payload = (await response.json()) as { frameAgeMs?: unknown };
        const rttMs = Math.max(0, finishedAt - startedAt);
        const frameAgeMs = typeof payload.frameAgeMs === "number" && Number.isFinite(payload.frameAgeMs) ? payload.frameAgeMs : null;
        if (!cancelled) {
          setCameraSourceRuntime(sourceId, {
            latency: {
              estimateMs: frameAgeMs === null ? rttMs : frameAgeMs + rttMs / 2,
              frameAgeMs,
              rttMs,
              updatedAt: Date.now(),
              error: null
            }
          });
        }
      } catch (error) {
        if (!cancelled) {
          setCameraSourceRuntime(sourceId, {
            latency: {
              estimateMs: null,
              frameAgeMs: null,
              rttMs: null,
              updatedAt: Date.now(),
              error: error instanceof Error && error.message ? error.message : "latency check failed"
            }
          });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    for (const source of cameraVideoSources) {
      void pollLatency(source.id, source.streamUrl.trim());
      timers.push(window.setInterval(() => void pollLatency(source.id, source.streamUrl.trim()), 2000));
    }
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearInterval(timer));
    };
  }, [cameraVideoSources, cameraVisibleLatencySignature, setCameraSourceRuntime]);

  return {
    activeCameraRuntime,
    activeCameraSource,
    cameraReadyBySourceId,
    cameraSourceRuntimeById,
    cameraStreamReloadToken,
    cameraStreamUrl,
    cameraVideoSources,
    resetCameraSourceRuntime,
    setCameraSourceRuntime,
    setCameraStreamReloadToken,
    mainCameraReady: cameraReadyBySourceId[MAIN_CAMERA_SOURCE_ID] ?? activeCameraRuntime.loaded
  };
}

function cameraRuntimePatchMatches(status: CameraSourceRuntimeStatus, patch: Partial<CameraSourceRuntimeStatus>): boolean {
  return (Object.keys(patch) as Array<keyof CameraSourceRuntimeStatus>).every((key) => status[key] === patch[key]);
}
