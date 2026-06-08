import type { AppStateSnapshotV2, PersistedLogEntry, ProjectStateRepository } from "@adapters/persistence/appDatabase";
import type { ArmTeachTrack } from "@domains/arm/armTeach";
import type {
  ArchitectureSnapshot,
  ComponentDefinition,
  DeviceCatalogItem,
  PanelLayoutItem,
  PluginInstance,
  RobotDefinition
} from "@platform/architecture";

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
  architecture?: ArchitectureSnapshot;
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

export async function listDeviceCatalog(filter: { type?: string; brand?: string; model?: string; query?: string } = {}, options: RequestOptions = {}): Promise<DeviceCatalogItem[]> {
  const params = new URLSearchParams();
  if (filter.type) {
    params.set("type", filter.type);
  }
  if (filter.brand) {
    params.set("brand", filter.brand);
  }
  if (filter.model) {
    params.set("model", filter.model);
  }
  if (filter.query) {
    params.set("query", filter.query);
  }
  const path = `/catalog/devices${params.toString() ? `?${params}` : ""}`;
  const response = await requestJson<{ items: DeviceCatalogItem[] }>(path, { method: "GET" }, options);
  return response.items;
}

export async function createDeviceCatalogItem(item: DeviceCatalogItem, options: RequestOptions = {}): Promise<DeviceCatalogItem> {
  return requestJson<DeviceCatalogItem>(
    "/catalog/devices",
    {
      method: "POST",
      body: JSON.stringify({ item })
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

export async function listPluginInstances(projectId: string, options: RequestOptions = {}): Promise<PluginInstance[]> {
  const response = await requestJson<{ pluginInstances: PluginInstance[] }>(`/projects/${encodeURIComponent(projectId)}/plugin-instances`, { method: "GET" }, options);
  return response.pluginInstances;
}

export async function createPluginInstance(projectId: string, pluginInstance: Partial<PluginInstance>, options: RequestOptions = {}): Promise<PluginInstance> {
  return requestJson<PluginInstance>(
    `/projects/${encodeURIComponent(projectId)}/plugin-instances`,
    {
      method: "POST",
      body: JSON.stringify({ pluginInstance })
    },
    options
  );
}

export async function updatePluginInstance(projectId: string, pluginInstanceId: string, pluginInstance: Partial<PluginInstance>, options: RequestOptions = {}): Promise<PluginInstance> {
  return requestJson<PluginInstance>(
    `/projects/${encodeURIComponent(projectId)}/plugin-instances/${encodeURIComponent(pluginInstanceId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ pluginInstance })
    },
    options
  );
}

export async function deletePluginInstance(projectId: string, pluginInstanceId: string, options: RequestOptions = {}): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(`/projects/${encodeURIComponent(projectId)}/plugin-instances/${encodeURIComponent(pluginInstanceId)}`, { method: "DELETE" }, options);
}

export async function listComponents(projectId: string, options: RequestOptions = {}): Promise<ComponentDefinition[]> {
  const response = await requestJson<{ components: ComponentDefinition[] }>(`/projects/${encodeURIComponent(projectId)}/components`, { method: "GET" }, options);
  return response.components;
}

export async function createComponent(projectId: string, component: Partial<ComponentDefinition>, options: RequestOptions = {}): Promise<ComponentDefinition> {
  return requestJson<ComponentDefinition>(
    `/projects/${encodeURIComponent(projectId)}/components`,
    {
      method: "POST",
      body: JSON.stringify({ component })
    },
    options
  );
}

export async function updateComponent(projectId: string, componentId: string, component: Partial<ComponentDefinition>, options: RequestOptions = {}): Promise<ComponentDefinition> {
  return requestJson<ComponentDefinition>(
    `/projects/${encodeURIComponent(projectId)}/components/${encodeURIComponent(componentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ component })
    },
    options
  );
}

export async function deleteComponent(projectId: string, componentId: string, options: RequestOptions = {}): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(`/projects/${encodeURIComponent(projectId)}/components/${encodeURIComponent(componentId)}`, { method: "DELETE" }, options);
}

export async function listRobots(projectId: string, options: RequestOptions = {}): Promise<RobotDefinition[]> {
  const response = await requestJson<{ robots: RobotDefinition[] }>(`/projects/${encodeURIComponent(projectId)}/robots`, { method: "GET" }, options);
  return response.robots;
}

export async function createRobot(projectId: string, robot: Partial<RobotDefinition>, options: RequestOptions = {}): Promise<RobotDefinition> {
  return requestJson<RobotDefinition>(
    `/projects/${encodeURIComponent(projectId)}/robots`,
    {
      method: "POST",
      body: JSON.stringify({ robot })
    },
    options
  );
}

export async function updateRobot(projectId: string, robotId: string, robot: Partial<RobotDefinition>, options: RequestOptions = {}): Promise<RobotDefinition> {
  return requestJson<RobotDefinition>(
    `/projects/${encodeURIComponent(projectId)}/robots/${encodeURIComponent(robotId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ robot })
    },
    options
  );
}

export async function deleteRobot(projectId: string, robotId: string, options: RequestOptions = {}): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(`/projects/${encodeURIComponent(projectId)}/robots/${encodeURIComponent(robotId)}`, { method: "DELETE" }, options);
}

export async function loadPanelLayout(projectId: string, scopeId: string, options: RequestOptions = {}): Promise<{ scopeId: string; layout: PanelLayoutItem[]; updatedAt: number | null }> {
  return requestJson<{ scopeId: string; layout: PanelLayoutItem[]; updatedAt: number | null }>(
    `/projects/${encodeURIComponent(projectId)}/panel-layouts/${encodeURIComponent(scopeId)}`,
    { method: "GET" },
    options
  );
}

export async function savePanelLayout(projectId: string, scopeId: string, layout: PanelLayoutItem[], options: RequestOptions = {}): Promise<{ scopeId: string; layout: PanelLayoutItem[]; updatedAt: number }> {
  return requestJson<{ scopeId: string; layout: PanelLayoutItem[]; updatedAt: number }>(
    `/projects/${encodeURIComponent(projectId)}/panel-layouts/${encodeURIComponent(scopeId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ layout })
    },
    options
  );
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

export function createDataServiceProjectStateRepository(
  projectId: string,
  options: RequestOptions = {}
): ProjectStateRepository<AppStateSnapshotV2> {
  return {
    async load() {
      const current = await loadCurrentProjectState(options);
      return current.state;
    },
    async save(snapshot) {
      await saveProjectState(projectId, snapshot, options);
    }
  };
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

export async function listArmTeachTracks(projectId: string, options: RequestOptions = {}): Promise<ArmTeachTrack[]> {
  const response = await requestJson<{ tracks: ArmTeachTrack[] }>(`/projects/${encodeURIComponent(projectId)}/arm-teach-tracks`, { method: "GET" }, options);
  return response.tracks;
}

export async function saveArmTeachTrack(projectId: string, track: ArmTeachTrack, options: RequestOptions = {}): Promise<ArmTeachTrack> {
  return requestJson<ArmTeachTrack>(
    `/projects/${encodeURIComponent(projectId)}/arm-teach-tracks/${encodeURIComponent(track.id)}`,
    {
      method: "PUT",
      body: JSON.stringify({ track })
    },
    options
  );
}

export async function deleteArmTeachTrack(trackId: string, options: RequestOptions = {}): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(`/arm-teach-tracks/${encodeURIComponent(trackId)}`, { method: "DELETE" }, options);
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
