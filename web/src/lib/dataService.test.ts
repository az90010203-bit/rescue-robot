import { describe, expect, it } from "vitest";
import {
  DataServiceError,
  appendEvents,
  checkDataService,
  createProject,
  deleteArmTeachTrack,
  listArmTeachTracks,
  loadCurrentProjectState,
  saveProjectState,
  saveArmTeachTrack,
  selectProject
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
