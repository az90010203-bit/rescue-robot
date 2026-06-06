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

test("saves, lists, and deletes arm teach tracks", async () => {
  const store = await openTempStore();
  const project = store.getCurrentProject();
  const track = {
    id: "track-1",
    name: "Pick route",
    createdAt: 10,
    updatedAt: 20,
    durationMs: 100,
    sampleIntervalMs: 100,
    jointIds: ["base"],
    servoIds: [22],
    samples: [{ tMs: 0, joints: [{ jointId: "base", servoId: 22, logicalAngleDeg: 45, physicalAngleDeg: 45, positionRaw: 512 }] }],
    metadata: { source: "hardware-drag", notes: "demo" }
  };

  assert.deepEqual(store.saveArmTeachTrack(project.id, track), track);
  assert.deepEqual(store.listArmTeachTracks(project.id), [track]);
  assert.deepEqual(store.deleteArmTeachTrack(track.id), { deleted: true });
  assert.deepEqual(store.listArmTeachTracks(project.id), []);
  store.close();
});

test("manages catalog, plugin instances, components, robots, and panel layouts", async () => {
  const store = await openTempStore();
  const project = store.getCurrentProject();

  const catalog = store.listDeviceCatalog({ type: "servo", query: "3215" });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].brand, "Feetech");
  const localCameraCatalog = store.listDeviceCatalog({ type: "camera", brand: "Browser", query: "local" });
  assert.equal(localCameraCatalog.length, 1);
  assert.equal(localCameraCatalog[0].id, "catalog.browser.local-camera");
  assert.equal(localCameraCatalog[0].driverId, "driver.browser-camera");
  assert.equal(localCameraCatalog[0].transportId, "transport.browser-media");
  assert.deepEqual(localCameraCatalog[0].defaultConfig, { preferredDeviceId: "", width: 640, height: 480, fps: 30 });

  const custom = store.createDeviceCatalogItem({
    type: "sensor",
    brand: "Acme",
    model: "Gas 1",
    displayName: "Acme Gas 1",
    driverId: "driver.custom-sensor",
    transportId: "transport.controller-json",
    capabilities: [{ id: "sensor", features: ["analog_read"] }],
    configSchema: [{ id: "port", label: "Port", kind: "text", required: true }],
    defaultConfig: { port: "A0" },
    tags: ["sensor"]
  });
  assert.equal(custom.userDefined, true);

  const servo = store.createPluginInstance(project.id, {
    name: "Base",
    catalogItemId: catalog[0].id,
    config: { servoId: 7 }
  });
  const motor = store.createPluginInstance(project.id, {
    name: "Left Track",
    catalogItemId: "catalog.toshiba.tb6618-motor",
    config: { channel: "m1", pwmPin: "D5" }
  });
  const armServo = store.createPluginInstance(project.id, {
    name: "Arm Joint 1",
    catalogItemId: catalog[0].id,
    config: { servoId: 8 }
  });
  const localCamera = store.createPluginInstance(project.id, {
    name: "Desk Camera",
    catalogItemId: localCameraCatalog[0].id,
    config: { preferredDeviceId: "usb-camera-1" }
  });

  assert.equal(servo.config.servoId, 7);
  assert.equal(motor.config.channel, "M1");
  assert.equal(localCamera.config.preferredDeviceId, "usb-camera-1");
  assert.equal(localCamera.config.width, 640);
  assert.equal(localCamera.config.height, 480);
  assert.equal(localCamera.config.fps, 30);
  assert.throws(
    () => store.createPluginInstance(project.id, { name: "Duplicate Base", catalogItemId: catalog[0].id, config: { servoId: 7 } }),
    /duplicate servo ID/
  );

  const armComponent = store.createComponent(project.id, {
    name: "Arm",
    kind: "robot-arm",
    pluginInstanceIds: [armServo.id],
    config: { armConfig: { joints: [{ id: "joint-1", servoId: 8, angleDeg: 90 }] } }
  });
  assert.equal(armComponent.kind, "robot-arm");
  assert.equal(armComponent.config.armConfig.joints[0].servoId, 8);
  assert.throws(
    () => store.createComponent(project.id, { name: "Bad Arm", kind: "robot-arm", pluginInstanceIds: [motor.id] }),
    /requires servo plugin instances/
  );

  const component = store.createComponent(project.id, { name: "Drive", pluginInstanceIds: [motor.id] });
  assert.deepEqual(component.pluginInstanceIds, [motor.id]);
  assert.throws(() => store.deletePluginInstance(project.id, motor.id), /in use/);

  assert.deepEqual(store.savePanelLayout(project.id, `component:${component.id}`, [{ id: "panel-1", targetId: "motor:M1", capability: "motor", order: 0 }]).layout[0].scopeId, `component:${component.id}`);
  assert.equal(
    store.savePanelLayout(project.id, "console:main", [{ id: "console:telemetry", panelId: "console.telemetry", targetId: "dashboard:telemetry", capability: "dashboard", title: "Telemetry", x: 0, y: 0, w: 4, h: 3, order: 0 }]).layout[0].capability,
    "dashboard"
  );

  assert.throws(
    () => store.createRobot(project.id, { name: "Robot A", componentIds: [component.id], pluginInstanceIds: [motor.id] }),
    /already assigned/
  );
  const robot = store.createRobot(project.id, { name: "Robot A", componentIds: [component.id], pluginInstanceIds: [servo.id] });
  assert.deepEqual(robot.componentIds, [component.id]);
  assert.throws(() => store.deleteComponent(project.id, component.id), /in use/);

  const projectB = store.createProject("Other Project");
  assert.deepEqual(store.listPluginInstances(projectB.id), []);

  assert.deepEqual(store.deleteRobot(project.id, robot.id), { deleted: true });
  assert.deepEqual(store.deleteComponent(project.id, armComponent.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, armServo.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, localCamera.id), { deleted: true });
  assert.deepEqual(store.deleteComponent(project.id, component.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, motor.id), { deleted: true });
  store.close();
});

async function openTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "rescue-robot-db-test-"));
  cleanupPaths.push(dir);
  const store = await createDataStore(path.join(dir, "data.sqlite"));
  store.initialize();
  return store;
}
