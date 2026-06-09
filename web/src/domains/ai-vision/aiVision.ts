import type { DeviceStateSnapshot } from "@platform/types";

export const AI_VISION_HELPER_URL = "http://127.0.0.1:17353";
export const AI_VISION_DEFAULT_LABEL = "competition_mannequin";

export interface AiVisionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiVisionPoint {
  x: number;
  y: number;
}

export interface AiVisionDetection {
  label: string;
  confidence: number;
  bbox: AiVisionBoundingBox;
  center: AiVisionPoint;
  sourceId: string;
  frameTimestamp: number;
}

export interface AiVisionHealth {
  ok: boolean;
  service: string;
  mode: string;
  sampleDir: string;
  label: string;
}

export interface AiVisionAnalyzeRequest {
  sourceId: string;
  streamUrl: string;
  state?: Record<string, DeviceStateSnapshot>;
}

export interface AiVisionAnalyzeResult {
  ok: boolean;
  sourceId: string;
  detections: AiVisionDetection[];
  frameTimestamp: number;
  mode: string;
}

export interface AiVisionCaptureRequest extends AiVisionAnalyzeRequest {
  label?: string;
}

export interface AiVisionCaptureResult {
  ok: boolean;
  sourceId: string;
  label: string;
  imagePath: string;
  metadataPath: string;
  frameTimestamp: number;
  bytes: number;
}

export async function requestAiVisionHealth(baseUrl = AI_VISION_HELPER_URL): Promise<AiVisionHealth> {
  const response = await fetchJson(`${baseUrl}/health`, { method: "GET" });
  return normalizeAiVisionHealth(response);
}

export async function requestAiVisionAnalysis(request: AiVisionAnalyzeRequest, baseUrl = AI_VISION_HELPER_URL): Promise<AiVisionAnalyzeResult> {
  const response = await fetchJson(`${baseUrl}/analyze`, jsonPost(request));
  return normalizeAiVisionAnalyzeResult(response);
}

export async function requestAiVisionSampleCapture(request: AiVisionCaptureRequest, baseUrl = AI_VISION_HELPER_URL): Promise<AiVisionCaptureResult> {
  const response = await fetchJson(`${baseUrl}/samples/capture`, jsonPost({ ...request, label: request.label ?? AI_VISION_DEFAULT_LABEL }));
  return normalizeAiVisionCaptureResult(response);
}

export function normalizeAiVisionDetection(value: unknown, fallbackSourceId = ""): AiVisionDetection {
  if (!isRecord(value)) {
    throw new Error("ai vision detection must be an object");
  }
  const bbox = normalizeBox(value.bbox);
  const sourceId = stringValue(value.sourceId, fallbackSourceId);
  const frameTimestamp = finiteNumber(value.frameTimestamp, Date.now());
  return {
    label: stringValue(value.label, AI_VISION_DEFAULT_LABEL),
    confidence: clamp01(finiteNumber(value.confidence, 0)),
    bbox,
    center: normalizePoint(value.center, bboxCenter(bbox)),
    sourceId,
    frameTimestamp
  };
}

function normalizeAiVisionHealth(value: unknown): AiVisionHealth {
  if (!isRecord(value)) {
    throw new Error("ai vision health response must be an object");
  }
  return {
    ok: value.ok === true,
    service: stringValue(value.service, "ai-vision-helper"),
    mode: stringValue(value.mode, "sample-only"),
    sampleDir: stringValue(value.sampleDir, ""),
    label: stringValue(value.label, AI_VISION_DEFAULT_LABEL)
  };
}

function normalizeAiVisionAnalyzeResult(value: unknown): AiVisionAnalyzeResult {
  if (!isRecord(value)) {
    throw new Error("ai vision analyze response must be an object");
  }
  const sourceId = stringValue(value.sourceId, "");
  const frameTimestamp = finiteNumber(value.frameTimestamp, Date.now());
  const detections = Array.isArray(value.detections)
    ? value.detections.map((item) => normalizeAiVisionDetection({ ...(isRecord(item) ? item : {}), frameTimestamp }, sourceId))
    : [];
  return {
    ok: value.ok === true,
    sourceId,
    detections,
    frameTimestamp,
    mode: stringValue(value.mode, "sample-only")
  };
}

function normalizeAiVisionCaptureResult(value: unknown): AiVisionCaptureResult {
  if (!isRecord(value)) {
    throw new Error("ai vision sample response must be an object");
  }
  return {
    ok: value.ok === true,
    sourceId: stringValue(value.sourceId, ""),
    label: stringValue(value.label, AI_VISION_DEFAULT_LABEL),
    imagePath: stringValue(value.imagePath, ""),
    metadataPath: stringValue(value.metadataPath, ""),
    frameTimestamp: finiteNumber(value.frameTimestamp, Date.now()),
    bytes: Math.max(0, Math.round(finiteNumber(value.bytes, 0)))
  };
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : `AI vision helper returned ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function normalizeBox(value: unknown): AiVisionBoundingBox {
  if (!isRecord(value)) {
    throw new Error("ai vision detection bbox must be an object");
  }
  const x = clamp01(finiteNumber(value.x, 0));
  const y = clamp01(finiteNumber(value.y, 0));
  const width = clamp01(finiteNumber(value.width, 0));
  const height = clamp01(finiteNumber(value.height, 0));
  return {
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y)
  };
}

function normalizePoint(value: unknown, fallback: AiVisionPoint): AiVisionPoint {
  if (!isRecord(value)) {
    return fallback;
  }
  return {
    x: clamp01(finiteNumber(value.x, fallback.x)),
    y: clamp01(finiteNumber(value.y, fallback.y))
  };
}

function bboxCenter(bbox: AiVisionBoundingBox): AiVisionPoint {
  return {
    x: clamp01(bbox.x + bbox.width / 2),
    y: clamp01(bbox.y + bbox.height / 2)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
