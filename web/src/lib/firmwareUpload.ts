export const FIRMWARE_HELPER_BASE_URL = "http://127.0.0.1:17350";

export type FirmwareBoardId = "arduino-uno" | "arduino-nano-atmega328";

export interface FirmwareBoardOption {
  id: FirmwareBoardId;
  label: string;
}

export interface FirmwareHelperHealth {
  ok: boolean;
  pioAvailable: boolean;
  pioPath: string | null;
  boards: Array<{ id: FirmwareBoardId; label: string; board: string }>;
}

export interface FirmwarePort {
  path: string;
  description: string;
  hwid: string;
}

export interface FirmwareCompileResult {
  jobId: string;
  hexSizeBytes: number;
  logs: string;
}

export interface FirmwareUploadResult {
  ok: boolean;
  logs: string;
}

export type FirmwareUploadErrorCode = "helperUnavailable" | "requestFailed" | "invalidResponse";

export class FirmwareUploadError extends Error {
  constructor(
    readonly code: FirmwareUploadErrorCode,
    message: string,
    readonly logs?: string
  ) {
    super(message);
    this.name = "FirmwareUploadError";
  }
}

export function isFirmwareUploadError(error: unknown): error is FirmwareUploadError {
  return error instanceof FirmwareUploadError;
}

export const FIRMWARE_BOARD_OPTIONS: FirmwareBoardOption[] = [
  { id: "arduino-uno", label: "Arduino Uno" },
  { id: "arduino-nano-atmega328", label: "Arduino Nano ATmega328" }
];

interface FirmwareRequestOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
}

export async function requestFirmwareHealth(options: FirmwareRequestOptions = {}): Promise<FirmwareHelperHealth> {
  const value = await requestJson<unknown>("/health", undefined, options);
  if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.pioAvailable !== "boolean" || !Array.isArray(value.boards)) {
    throw new FirmwareUploadError("invalidResponse", "Firmware helper returned an invalid health response");
  }
  return {
    ok: value.ok,
    pioAvailable: value.pioAvailable,
    pioPath: typeof value.pioPath === "string" ? value.pioPath : null,
    boards: value.boards
      .map((board) => normalizeBoard(board))
      .filter((board): board is FirmwareHelperHealth["boards"][number] => board !== null)
  };
}

export async function listFirmwarePorts(options: FirmwareRequestOptions = {}): Promise<FirmwarePort[]> {
  const value = await requestJson<unknown>("/ports", undefined, options);
  if (!isRecord(value) || !Array.isArray(value.ports)) {
    throw new FirmwareUploadError("invalidResponse", "Firmware helper returned an invalid port response");
  }
  return normalizeFirmwarePorts(value.ports);
}

export async function compileFirmware(
  request: { board: FirmwareBoardId; source: string },
  options: FirmwareRequestOptions = {}
): Promise<FirmwareCompileResult> {
  const value = await requestJson<unknown>(
    "/compile",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    },
    options
  );
  if (!isRecord(value) || typeof value.jobId !== "string" || typeof value.hexSizeBytes !== "number") {
    throw new FirmwareUploadError("invalidResponse", "Firmware helper returned an invalid compile response");
  }
  return {
    jobId: value.jobId,
    hexSizeBytes: value.hexSizeBytes,
    logs: typeof value.logs === "string" ? value.logs : ""
  };
}

export async function uploadFirmware(
  request: { jobId: string; port: string },
  options: FirmwareRequestOptions = {}
): Promise<FirmwareUploadResult> {
  const value = await requestJson<unknown>(
    "/upload",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    },
    options
  );
  if (!isRecord(value) || value.ok !== true) {
    throw new FirmwareUploadError("invalidResponse", "Firmware helper returned an invalid upload response");
  }
  return {
    ok: true,
    logs: typeof value.logs === "string" ? value.logs : ""
  };
}

export function normalizeFirmwarePorts(value: unknown): FirmwarePort[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const path = typeof item.path === "string" ? item.path : typeof item.port === "string" ? item.port : "";
      if (!path) {
        return null;
      }
      return {
        path,
        description: typeof item.description === "string" ? item.description : "",
        hwid: typeof item.hwid === "string" ? item.hwid : ""
      };
    })
    .filter((item): item is FirmwarePort => item !== null);
}

async function requestJson<T>(path: string, init: RequestInit | undefined, options: FirmwareRequestOptions): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = options.baseUrl ?? FIRMWARE_HELPER_BASE_URL;
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}${path}`, init);
  } catch (error) {
    throw new FirmwareUploadError("helperUnavailable", error instanceof Error ? error.message : "Firmware helper is unavailable");
  }

  const payload = await readResponseJson(response);
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error : `Firmware helper request failed with ${response.status}`;
    const logs = isRecord(payload) && typeof payload.logs === "string" ? payload.logs : undefined;
    throw new FirmwareUploadError("requestFailed", message, logs);
  }
  return payload as T;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new FirmwareUploadError("invalidResponse", error instanceof Error ? error.message : "Firmware helper returned invalid JSON");
  }
}

function normalizeBoard(value: unknown): FirmwareHelperHealth["boards"][number] | null {
  if (!isRecord(value) || !isFirmwareBoardId(value.id) || typeof value.label !== "string" || typeof value.board !== "string") {
    return null;
  }
  return {
    id: value.id,
    label: value.label,
    board: value.board
  };
}

function isFirmwareBoardId(value: unknown): value is FirmwareBoardId {
  return value === "arduino-uno" || value === "arduino-nano-atmega328";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
