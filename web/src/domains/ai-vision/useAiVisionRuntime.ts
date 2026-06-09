import { useState } from "react";
import type { CameraVideoSource } from "@adapters/persistence/storage";
import type { DeviceStateSnapshot } from "@platform/types";
import {
  AI_VISION_DEFAULT_LABEL,
  type AiVisionAnalyzeResult,
  type AiVisionCaptureResult,
  type AiVisionDetection,
  type AiVisionHealth,
  requestAiVisionAnalysis,
  requestAiVisionHealth,
  requestAiVisionSampleCapture
} from "@domains/ai-vision/aiVision";

export type AiVisionStatus = "unknown" | "checking" | "online" | "offline" | "analyzing" | "capturing" | "error";

export interface AiVisionLogEntry {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: number;
}

interface UseAiVisionRuntimeOptions {
  activeCameraSource: CameraVideoSource;
  platformState: Record<string, DeviceStateSnapshot>;
}

export function useAiVisionRuntime({ activeCameraSource, platformState }: UseAiVisionRuntimeOptions) {
  const [status, setStatus] = useState<AiVisionStatus>("unknown");
  const [health, setHealth] = useState<AiVisionHealth | null>(null);
  const [detections, setDetections] = useState<AiVisionDetection[]>([]);
  const [lastAnalyzeResult, setLastAnalyzeResult] = useState<AiVisionAnalyzeResult | null>(null);
  const [lastCaptureResult, setLastCaptureResult] = useState<AiVisionCaptureResult | null>(null);
  const [logs, setLogs] = useState<AiVisionLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  function remember(level: AiVisionLogEntry["level"], message: string) {
    setLogs((current) => [
      { id: Date.now() + Math.floor(Math.random() * 1000), level, message, createdAt: Date.now() },
      ...current
    ].slice(0, 12));
  }

  async function checkHealth(): Promise<AiVisionHealth | null> {
    setStatus("checking");
    setError(null);
    try {
      const result = await requestAiVisionHealth();
      setHealth(result);
      setStatus(result.ok ? "online" : "offline");
      remember(result.ok ? "info" : "warn", result.ok ? `AI Vision helper online (${result.mode})` : "AI Vision helper is not ready");
      return result;
    } catch (caught) {
      const message = errorMessage(caught, "AI Vision helper is offline");
      setStatus("offline");
      setError(message);
      remember("error", message);
      return null;
    }
  }

  async function analyze(source: CameraVideoSource = activeCameraSource): Promise<AiVisionAnalyzeResult | null> {
    if (!source.streamUrl.trim()) {
      const message = "Camera stream URL is required before AI analysis";
      setError(message);
      remember("warn", message);
      return null;
    }
    setStatus("analyzing");
    setError(null);
    try {
      const result = await requestAiVisionAnalysis({
        sourceId: source.id,
        streamUrl: source.streamUrl,
        state: platformState
      });
      setLastAnalyzeResult(result);
      setDetections(result.detections);
      setStatus("online");
      remember("info", `AI analysis complete: ${result.detections.length} detection${result.detections.length === 1 ? "" : "s"}`);
      return result;
    } catch (caught) {
      const message = errorMessage(caught, "AI analysis failed");
      setStatus("error");
      setError(message);
      remember("error", message);
      return null;
    }
  }

  async function captureSample(source: CameraVideoSource = activeCameraSource, label = AI_VISION_DEFAULT_LABEL): Promise<AiVisionCaptureResult | null> {
    if (!source.streamUrl.trim()) {
      const message = "Camera stream URL is required before sample capture";
      setError(message);
      remember("warn", message);
      return null;
    }
    setStatus("capturing");
    setError(null);
    try {
      const result = await requestAiVisionSampleCapture({
        sourceId: source.id,
        streamUrl: source.streamUrl,
        state: platformState,
        label
      });
      setLastCaptureResult(result);
      setStatus("online");
      remember("info", `Sample captured: ${result.imagePath}`);
      return result;
    } catch (caught) {
      const message = errorMessage(caught, "AI sample capture failed");
      setStatus("error");
      setError(message);
      remember("error", message);
      return null;
    }
  }

  return {
    analyze,
    captureSample,
    checkHealth,
    detections,
    error,
    health,
    helperReady: status === "online" || status === "analyzing" || status === "capturing",
    lastAnalyzeResult,
    lastCaptureResult,
    logs,
    status
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
