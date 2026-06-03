import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_PROJECT_NAME, createDataStore } from "./data-store.mjs";

const cleanupPaths = [];

test.afterEach(async () => {
  while (cleanupPaths.length > 0) {
    await rm(cleanupPaths.pop(), { recursive: true, force: true });
  }
});

test("initializes the schema with a current default project", async () => {
  const store = await openTempStore();

  const projects = store.listProjects();

  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, DEFAULT_PROJECT_NAME);
  assert.equal(projects[0].isCurrent, true);
  assert.equal(store.getCurrentProject().id, projects[0].id);
  store.close();
});

test("creates projects and keeps a single current project", async () => {
  const store = await openTempStore();

  const robotA = store.createProject("Robot A");
  const robotB = store.createProject("Robot B");
  const projects = store.listProjects();

  assert.equal(store.getCurrentProject().id, robotB.id);
  assert.equal(store.getCurrentProject().name, "Robot B");
  assert.equal(projects.filter((project) => project.isCurrent).length, 1);
  store.setCurrentProject(robotA.id);
  assert.equal(store.getCurrentProject().id, robotA.id);
  store.close();
});

test("saves and loads project state snapshots", async () => {
  const store = await openTempStore();
  const project = store.getCurrentProject();
  const snapshot = { version: 2, config: { servos: [{ id: 7, name: "J7" }] }, ui: { activeModule: "servo" }, runtime: {} };

  const result = store.saveProjectState(project.id, snapshot);
  const stored = store.getProjectState(project.id);

  assert.equal(typeof result.updatedAt, "number");
  assert.deepEqual(stored.snapshot, snapshot);
  assert.equal(store.getCurrentProject().updatedAt, result.updatedAt);
  store.close();
});

test("appends long-lived event and telemetry batches", async () => {
  const store = await openTempStore();
  const project = store.getCurrentProject();
  const session = store.startSession(project.id);

  assert.deepEqual(store.appendEvents(session.id, [
    { direction: "tx", text: "01 02", level: "info", createdAt: 10 },
    { direction: "system", messageKey: "logs.ready", level: "warn", values: { count: 2 }, createdAt: 20 }
  ]), { inserted: 2 });
  assert.deepEqual(store.appendTelemetry(session.id, [
    { category: "servo", targetId: "22", payload: { id: 22, positionRaw: 512 }, createdAt: 30 },
    { category: "motor", targetId: "M1", payload: { channel: "M1", dutyPercent: 40 }, createdAt: 40 }
  ]), { inserted: 2 });

  const events = store.listRecentEvents(project.id, 10);
  assert.deepEqual(events.map((entry) => entry.direction), ["system", "tx"]);
  assert.deepEqual(events[0].values, { count: 2 });
  assert.deepEqual(store.listLatestTelemetry(project.id, 10).map((entry) => [entry.category, entry.targetId]), [
    ["motor", "M1"],
    ["servo", "22"]
  ]);
  assert.equal(typeof store.endSession(session.id).endedAt, "number");
  store.close();
});

async function openTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "rescue-robot-db-test-"));
  cleanupPaths.push(dir);
  const store = await createDataStore(path.join(dir, "data.sqlite"));
  store.initialize();
  return store;
}
