import type { AppStateSnapshotV2, PersistedLogEntry } from "./appDatabase";

export const DATA_SERVICE_BASE_URL = "http://127.0.0.1:17351";

export interface DataProject {
  id: string;
  name: string;
  isCurrent: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DataServiceHealth {
  ok: boolean;
  dbPath: string;
  schemaVersion: number;
  currentProject: DataProject;
  projectCount: number;
}

export interface DataTelemetryEntry {
  category: string;
  targetId: string;
  payload: Record<string, unknown>;
  createdAt?: number;
}

export interface CurrentProjectState {
  project: DataProject;
  state: AppStateSnapshotV2 | null;
  stateUpdatedAt: number | null;
  events: PersistedLogEntry[];
  telemetry: DataTelemetryEntry[];
}

export interface DataSession {
  id: string;
  projectId: string;
  startedAt: number;
  endedAt: number | null;
}

interface RequestOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export class DataServiceError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DataServiceError";
  }
}

export async function checkDataService(options: RequestOptions = {}): Promise<DataServiceHealth> {
  return requestJson<DataServiceHealth>("/health", { method: "GET" }, options);
}

export async function listProjects(options: RequestOptions = {}): Promise<DataProject[]> {
  const response = await requestJson<{ projects: DataProject[] }>("/projects", { method: "GET" }, options);
  return response.projects;
}

export async function createProject(name: string, options: RequestOptions = {}): Promise<CurrentProjectState> {
  return requestJson<CurrentProjectState>(
    "/projects",
    {
      method: "POST",
      body: JSON.stringify({ name })
    },
    options
  );
}

export async function loadCurrentProjectState(options: RequestOptions = {}): Promise<CurrentProjectState> {
  return requestJson<CurrentProjectState>("/projects/current", { method: "GET" }, options);
}

export async function selectProject(projectId: string, options: RequestOptions = {}): Promise<CurrentProjectState> {
  return requestJson<CurrentProjectState>(`/projects/${encodeURIComponent(projectId)}/current`, { method: "PATCH" }, options);
}

export async function saveProjectState(projectId: string, snapshot: AppStateSnapshotV2, options: RequestOptions = {}): Promise<{ updatedAt: number }> {
  return requestJson<{ updatedAt: number }>(
    `/projects/${encodeURIComponent(projectId)}/state`,
    {
      method: "PUT",
      body: JSON.stringify({ snapshot })
    },
    options
  );
}

export async function startSession(projectId: string, options: RequestOptions = {}): Promise<DataSession> {
  return requestJson<DataSession>(`/projects/${encodeURIComponent(projectId)}/sessions`, { method: "POST" }, options);
}

export async function endSession(sessionId: string, options: RequestOptions = {}): Promise<DataSession> {
  return requestJson<DataSession>(`/sessions/${encodeURIComponent(sessionId)}/end`, { method: "PATCH" }, options);
}

export async function appendEvents(sessionId: string, events: PersistedLogEntry[], options: RequestOptions = {}): Promise<{ inserted: number }> {
  if (events.length === 0) {
    return { inserted: 0 };
  }
  return requestJson<{ inserted: number }>(
    `/sessions/${encodeURIComponent(sessionId)}/events/batch`,
    {
      method: "POST",
      body: JSON.stringify({ events })
    },
    options
  );
}

export async function appendTelemetry(sessionId: string, telemetry: DataTelemetryEntry[], options: RequestOptions = {}): Promise<{ inserted: number }> {
  if (telemetry.length === 0) {
    return { inserted: 0 };
  }
  return requestJson<{ inserted: number }>(
    `/sessions/${encodeURIComponent(sessionId)}/telemetry/batch`,
    {
      method: "POST",
      body: JSON.stringify({ telemetry })
    },
    options
  );
}

async function requestJson<T>(path: string, init: RequestInit, options: RequestOptions): Promise<T> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (!fetcher) {
    throw new DataServiceError(0, "fetch is unavailable");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 1800);
  try {
    const response = await fetcher(`${options.baseUrl ?? DATA_SERVICE_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      },
      signal: controller.signal
    });
    const body = await parseResponseBody(response);
    if (!response.ok) {
      throw new DataServiceError(response.status, responseErrorMessage(body, response.statusText));
    }
    return body as T;
  } catch (error) {
    if (error instanceof DataServiceError) {
      throw error;
    }
    throw new DataServiceError(0, error instanceof Error && error.message ? error.message : "data service is unavailable");
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function responseErrorMessage(body: unknown, fallback: string): string {
  return body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : fallback;
}
