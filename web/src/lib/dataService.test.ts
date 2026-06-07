import { describe, expect, it } from "vitest";
import {
  DataServiceError,
  appendEvents,
  checkDataService,
  createComponent,
  createDataServiceProjectStateRepository,
  createDeviceCatalogItem,
  createPluginInstance,
  createProject,
  createRobot,
  deleteArmTeachTrack,
  deletePluginInstance,
  listComponents,
  listArmTeachTracks,
  listDeviceCatalog,
  listPluginInstances,
  listRobots,
  loadCurrentProjectState,
  loadPanelLayout,
  savePanelLayout,
  saveProjectState,
  saveArmTeachTrack,
  selectProject,
  updateRobot
} from "./dataService";
import { createAppConfigSnapshot, createAppStateSnapshotV2 } from "./appDatabase";
import { DEFAULT_CAMERA_CONFIG, DEFAULT_MOTORS, DEFAULT_SERVOS, createDefaultArmConfig } from "./storage";
import { DEFAULT_INPUT_MAPPING } from "./inputMapping";
import { DEFAULT_SERVO_SAFETY_SETTINGS, DEFAULT_SERVO_SMOOTHING_SETTINGS } from "./appDatabase";

describe("data service client", () => {
  it("loads health and current project state from the service", async () => {
    const fetcher = createJsonFetcher((url) => {
      if (url.endsWith("/health")) {
        return {
          ok: true,
          dbPath: "robot.sqlite",
          schemaVersion: 1,
          currentProject: project,
          projectCount: 1
        };
      }
      return {
        project,
        state: null,
        stateUpdatedAt: null,
        events: [{ direction: "system", text: "ready" }],
        telemetry: [{ category: "servo", targetId: "22", payload: { id: 22 } }]
      };
    });

    await expect(checkDataService({ fetcher, baseUrl: "http://data.test" })).resolves.toMatchObject({ ok: true, currentProject: project });
    await expect(loadCurrentProjectState({ fetcher, baseUrl: "http://data.test" })).resolves.toMatchObject({
      project,
      state: null,
      events: [{ direction: "system", text: "ready" }]
    });
  });

  it("writes state snapshots and event batches to scoped endpoints", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetcher = createJsonFetcher((url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      return url.includes("/state") ? { updatedAt: 10 } : { inserted: 1 };
    });
    const snapshot = createAppStateSnapshotV2({ config: createConfigSnapshot() });

    await expect(saveProjectState("project 1", snapshot, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual({ updatedAt: 10 });
    await expect(appendEvents("session 1", [{ direction: "system", text: "ok" }], { fetcher, baseUrl: "http://data.test" })).resolves.toEqual({ inserted: 1 });

    expect(calls.map((call) => call.url)).toEqual([
      "http://data.test/projects/project%201/state",
      "http://data.test/sessions/session%201/events/batch"
    ]);
    expect(calls[0].body).toMatchObject({ snapshot: { version: 2 } });
    expect(calls[1].body).toEqual({ events: [{ direction: "system", text: "ok" }] });
  });

  it("wraps current project load and scoped state save behind a project state repository", async () => {
    const snapshot = createAppStateSnapshotV2({ config: createConfigSnapshot() });
    const calls: Array<{ url: string; body: unknown; method?: string }> = [];
    const fetcher = createJsonFetcher((url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, method: init.method });
      return init.method === "GET"
        ? { project, state: snapshot, stateUpdatedAt: 10, events: [], telemetry: [] }
        : { updatedAt: 11 };
    });
    const repository = createDataServiceProjectStateRepository("project 1", { fetcher, baseUrl: "http://data.test" });

    await expect(repository.load()).resolves.toMatchObject({ version: 2 });
    await expect(repository.save(snapshot)).resolves.toBeUndefined();

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://data.test/projects/current"],
      ["PUT", "http://data.test/projects/project%201/state"]
    ]);
    expect(calls[1].body).toMatchObject({ snapshot: { version: 2 } });
  });

  it("creates and selects projects through project payload endpoints", async () => {
    const calls: Array<{ url: string; body: unknown; method?: string }> = [];
    const fetcher = createJsonFetcher((url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, method: init.method });
      return { project, state: null, stateUpdatedAt: null, events: [], telemetry: [] };
    });

    await createProject("Robot B", { fetcher, baseUrl: "http://data.test" });
    await selectProject("project 1", { fetcher, baseUrl: "http://data.test" });

    expect(calls).toMatchObject([
      { url: "http://data.test/projects", method: "POST", body: { name: "Robot B" } },
      { url: "http://data.test/projects/project%201/current", method: "PATCH", body: null }
    ]);
  });

  it("uses scoped arm teach track endpoints", async () => {
    const calls: Array<{ url: string; body: unknown; method?: string }> = [];
    const track = {
      id: "track 1",
      name: "Route",
      createdAt: 1,
      updatedAt: 2,
      durationMs: 0,
      sampleIntervalMs: 100,
      jointIds: [],
      servoIds: [],
      samples: [],
      metadata: { source: "hardware-drag" as const }
    };
    const fetcher = createJsonFetcher((url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, method: init.method });
      return init.method === "GET" ? { tracks: [track] } : init.method === "DELETE" ? { deleted: true } : track;
    });

    await expect(listArmTeachTracks("project 1", { fetcher, baseUrl: "http://data.test" })).resolves.toEqual([track]);
    await expect(saveArmTeachTrack("project 1", track, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual(track);
    await expect(deleteArmTeachTrack("track 1", { fetcher, baseUrl: "http://data.test" })).resolves.toEqual({ deleted: true });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["GET", "http://data.test/projects/project%201/arm-teach-tracks"],
      ["PUT", "http://data.test/projects/project%201/arm-teach-tracks/track%201"],
      ["DELETE", "http://data.test/arm-teach-tracks/track%201"]
    ]);
    expect(calls[1].body).toEqual({ track });
  });

  it("uses three-layer architecture endpoints", async () => {
    const calls: Array<{ url: string; body: unknown; method?: string }> = [];
    const fetcher = createJsonFetcher((url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, method: init.method });
      if (url.includes("/catalog/devices") && init.method === "GET") {
        return { items: [catalogItem] };
      }
      if (url.includes("/plugin-instances") && init.method === "GET") {
        return { pluginInstances: [pluginInstance] };
      }
      if (url.includes("/components") && init.method === "GET") {
        return { components: [component] };
      }
      if (url.includes("/robots") && init.method === "GET") {
        return { robots: [robot] };
      }
      if (url.includes("/panel-layouts")) {
        return { scopeId: "robot:1", layout: [{ id: "panel" }], updatedAt: 1 };
      }
      if (url.includes("/catalog/devices")) {
        return catalogItem;
      }
      if (url.includes("/plugin-instances") && init.method === "DELETE") {
        return { deleted: true };
      }
      if (url.includes("/plugin-instances")) {
        return pluginInstance;
      }
      if (url.includes("/components")) {
        return component;
      }
      return robot;
    });

    await expect(listDeviceCatalog({ type: "servo", query: "3215" }, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual([catalogItem]);
    await expect(listDeviceCatalog({ type: "servo", brand: "ASME", model: "ASME-SE" }, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual([catalogItem]);
    await expect(createDeviceCatalogItem(catalogItem, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual(catalogItem);
    await expect(listPluginInstances("project 1", { fetcher, baseUrl: "http://data.test" })).resolves.toEqual([pluginInstance]);
    await expect(createPluginInstance("project 1", pluginInstance, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual(pluginInstance);
    await expect(deletePluginInstance("project 1", "servo 1", { fetcher, baseUrl: "http://data.test" })).resolves.toEqual({ deleted: true });
    await expect(listComponents("project 1", { fetcher, baseUrl: "http://data.test" })).resolves.toEqual([component]);
    await expect(createComponent("project 1", component, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual(component);
    await expect(listRobots("project 1", { fetcher, baseUrl: "http://data.test" })).resolves.toEqual([robot]);
    await expect(createRobot("project 1", robot, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual(robot);
    await expect(updateRobot("project 1", robot.id, { config: robot.config }, { fetcher, baseUrl: "http://data.test" })).resolves.toEqual(robot);
    await expect(loadPanelLayout("project 1", "console:robot:robot 1", { fetcher, baseUrl: "http://data.test" })).resolves.toMatchObject({ scopeId: "robot:1" });
    await expect(savePanelLayout("project 1", "robot:1", [], { fetcher, baseUrl: "http://data.test" })).resolves.toMatchObject({ scopeId: "robot:1" });

    expect(calls.map((call) => [call.method, call.url])).toContainEqual(["GET", "http://data.test/catalog/devices?type=servo&query=3215"]);
    expect(calls.map((call) => [call.method, call.url])).toContainEqual(["GET", "http://data.test/catalog/devices?type=servo&brand=ASME&model=ASME-SE"]);
    expect(calls.map((call) => [call.method, call.url])).toContainEqual(["DELETE", "http://data.test/projects/project%201/plugin-instances/servo%201"]);
    expect(calls).toContainEqual({ method: "POST", url: "http://data.test/projects/project%201/robots", body: { robot } });
    expect(calls).toContainEqual({ method: "PATCH", url: "http://data.test/projects/project%201/robots/robot%201", body: { robot: { config: robot.config } } });
    expect(calls.map((call) => [call.method, call.url])).toContainEqual(["GET", "http://data.test/projects/project%201/panel-layouts/console%3Arobot%3Arobot%201"]);
    expect(calls.map((call) => [call.method, call.url])).toContainEqual(["PUT", "http://data.test/projects/project%201/panel-layouts/robot%3A1"]);
  });

  it("turns network failures into DataServiceError", async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error("offline");
    };

    await expect(checkDataService({ fetcher, baseUrl: "http://data.test" })).rejects.toBeInstanceOf(DataServiceError);
  });
});

const project = {
  id: "project-1",
  name: "Default Robot",
  isCurrent: true,
  createdAt: 1,
  updatedAt: 2
};

const catalogItem = {
  id: "catalog.feetech.sts3215",
  type: "servo" as const,
  brand: "Feetech",
  model: "STS3215",
  displayName: "Feetech STS3215 Servo",
  driverId: "driver.feetech-servo",
  transportId: "transport.web-serial",
  capabilities: [{ id: "servo" as const, features: ["position_control"] }],
  configSchema: [{ id: "servoId", label: "ID", kind: "number" as const, required: true }],
  defaultConfig: { servoId: 1 },
  tags: ["servo"],
  userDefined: false,
  createdAt: 1,
  updatedAt: 1
};

const pluginInstance = {
  id: "servo 1",
  name: "Base",
  type: "servo" as const,
  catalogItemId: catalogItem.id,
  brand: catalogItem.brand,
  model: catalogItem.model,
  driverId: catalogItem.driverId,
  transportId: catalogItem.transportId,
  capabilities: catalogItem.capabilities,
  config: { servoId: 7, detectedDeviceId: "feetech:feedback:id:7", detectedAt: 1234, detectedSource: "feetech-servo" },
  tags: ["servo"],
  createdAt: 1,
  updatedAt: 1
};

const component = {
  id: "component 1",
  name: "Arm",
  pluginInstanceIds: [pluginInstance.id],
  tags: [],
  createdAt: 1,
  updatedAt: 1
};

const robot = {
  id: "robot 1",
  name: "Robot",
  componentIds: [component.id],
  pluginInstanceIds: [],
  config: {
    assembly: {
      version: 2 as const,
      nodes: [{ id: "component:component 1", sourceType: "component" as const, sourceId: component.id, x: 40, y: 60, w: 180, h: 120, visualKind: "robot-arm" as const }],
      ports: [{ id: "component:component 1:port:servo-bus", nodeId: "component:component 1", name: "SERVO", label: "Servo bus", kind: "servo-bus" as const, direction: "bidirectional" as const, side: "right" as const, x: 180, y: 72 }],
      edges: [],
      harnesses: [{ id: "harness:servo", name: "Servo bus", color: "#38bdf8", hidden: false }],
      controlMappings: []
    },
    actionButtons: [{ id: "button:ready", name: "Ready Pose", color: "#38bdf8", icon: "spark", confirmRequired: true, timeoutMs: 8000, steps: [{ id: "step:1", kind: "servo.move" as const, label: "Move servo", pluginInstanceId: pluginInstance.id, angleDeg: 90, speedRaw: 600, acc: 30 }] }]
  },
  tags: [],
  createdAt: 1,
  updatedAt: 1
};

function createJsonFetcher(handler: (url: string, init: RequestInit) => unknown): typeof fetch {
  return async (input: RequestInfo | URL, init: RequestInit = {}) =>
    new Response(JSON.stringify(handler(String(input), init)), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
}

function createConfigSnapshot() {
  return createAppConfigSnapshot({
    servos: DEFAULT_SERVOS,
    servoCommands: {},
    servoLinkageGroups: [],
    servoSmoothing: DEFAULT_SERVO_SMOOTHING_SETTINGS,
    servoSafety: DEFAULT_SERVO_SAFETY_SETTINGS,
    armConfig: createDefaultArmConfig(DEFAULT_SERVOS),
    motors: DEFAULT_MOTORS,
    motorLinkageGroups: [],
    cameraConfig: DEFAULT_CAMERA_CONFIG,
    inputMapping: DEFAULT_INPUT_MAPPING,
    language: "zh-CN",
    lastActiveModule: "servo"
  });
}
