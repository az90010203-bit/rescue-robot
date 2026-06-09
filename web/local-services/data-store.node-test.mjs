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
  const asmeCatalog = store.listDeviceCatalog({ type: "servo", brand: "ASME", model: "ASME-SE" });
  assert.equal(asmeCatalog.length, 1);
  assert.equal(asmeCatalog[0].id, "catalog.asme.asme-se-can-servo");
  assert.equal(asmeCatalog[0].driverId, "driver.asme-can-servo");
  assert.equal(asmeCatalog[0].transportId, "transport.a-board-can1");
  const wheeltecCatalog = store.listDeviceCatalog({ type: "motor", brand: "WHEELTEC" });
  assert.deepEqual(wheeltecCatalog.map((item) => item.model), ["G513XL", "MG540"]);
  assert.deepEqual(wheeltecCatalog[0].defaultConfig, {
    channel: "M1",
    pwmPin: "PA0",
    in1Pin: "PB0",
    in2Pin: "PE12",
    enablePin: "PD12",
    sensorPin: "",
    encoderAPin: "PE4",
    encoderBPin: "PF0"
  });
  const localCameraCatalog = store.listDeviceCatalog({ type: "camera", brand: "Browser", query: "local" });
  assert.equal(localCameraCatalog.length, 1);
  assert.equal(localCameraCatalog[0].id, "catalog.browser.local-camera");
  assert.equal(localCameraCatalog[0].driverId, "driver.browser-camera");
  assert.equal(localCameraCatalog[0].transportId, "transport.browser-media");
  assert.deepEqual(localCameraCatalog[0].defaultConfig, { preferredDeviceId: "", width: 640, height: 480, fps: 30 });
  const aiVisionCatalog = store.listDeviceCatalog({ type: "ai-vision", brand: "Local", query: "mannequin" });
  assert.equal(aiVisionCatalog.length, 1);
  assert.equal(aiVisionCatalog[0].id, "catalog.local.ai-vision");
  assert.equal(aiVisionCatalog[0].driverId, "driver.ai-vision-helper");
  assert.equal(aiVisionCatalog[0].transportId, "transport.local-helper");
  assert.equal(aiVisionCatalog[0].defaultConfig.label, "competition_mannequin");

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
  const canServo = store.createPluginInstance(project.id, {
    name: "CAN Servo",
    catalogItemId: "catalog.asme.asme-se-can-servo",
    config: { servoId: 7, minDeg: 10, maxDeg: 180, direction: -1 }
  });
  assert.equal(canServo.driverId, "driver.asme-can-servo");
  assert.equal(canServo.config.servoId, 7);
  assert.equal(canServo.config.direction, -1);
  const canServo2 = store.createPluginInstance(project.id, {
    name: "CAN Servo 2",
    catalogItemId: "catalog.asme.asme-se-can-servo",
    config: { servoId: 8 }
  });
  const canServo3 = store.createPluginInstance(project.id, {
    name: "CAN Servo 3",
    catalogItemId: "catalog.asme.asme-se-can-servo",
    config: { servoId: 9 }
  });
  const canServo4 = store.createPluginInstance(project.id, {
    name: "CAN Servo 4",
    catalogItemId: "catalog.asme.asme-se-can-servo",
    config: { servoId: 10 }
  });
  const motor = store.createPluginInstance(project.id, {
    name: "Left Track",
    catalogItemId: "catalog.toshiba.tb6618-motor",
    config: { channel: "m1", pwmPin: "D5" }
  });
  const rearLeftMotor = store.createPluginInstance(project.id, {
    name: "Rear Left",
    catalogItemId: "catalog.toshiba.tb6618-motor",
    config: { channel: "M2", pwmPin: "PA1", in1Pin: "PC2", in2Pin: "PE6", encoderAPin: "PE5", encoderBPin: "PF1" }
  });
  const rearRightMotor = store.createPluginInstance(project.id, {
    name: "Rear Right",
    catalogItemId: "catalog.toshiba.tb6618-motor",
    config: { channel: "M3", pwmPin: "PA2", in1Pin: "PA4", in2Pin: "PC1", encoderAPin: "PC0", encoderBPin: "PB1" }
  });
  const frontRightMotor = store.createPluginInstance(project.id, {
    name: "Front Right",
    catalogItemId: "catalog.toshiba.tb6618-motor",
    config: { channel: "M4", pwmPin: "PA3", in1Pin: "PA5", in2Pin: "PC5", encoderAPin: "PC4", encoderBPin: "PC3" }
  });
  const armServo = store.createPluginInstance(project.id, {
    name: "Arm Joint 1",
    catalogItemId: catalog[0].id,
    config: { servoId: 8 }
  });
  const localCamera = store.createPluginInstance(project.id, {
    name: "Desk Camera",
    catalogItemId: localCameraCatalog[0].id,
    config: { preferredDeviceId: "usb-camera-1", detectedDeviceId: "camera:usb-camera-1", detectedAt: 1234, detectedSource: "local-camera" }
  });

  assert.equal(servo.config.servoId, 7);
  assert.equal(motor.config.channel, "M1");
  assert.equal(localCamera.config.preferredDeviceId, "usb-camera-1");
  assert.equal(localCamera.config.detectedDeviceId, "camera:usb-camera-1");
  assert.equal(localCamera.config.detectedAt, 1234);
  assert.equal(localCamera.config.detectedSource, "local-camera");
  assert.equal(localCamera.config.width, 640);
  assert.equal(localCamera.config.height, 480);
  assert.equal(localCamera.config.fps, 30);
  assert.throws(
    () => store.createPluginInstance(project.id, { name: "Duplicate Base", catalogItemId: catalog[0].id, config: { servoId: 7 } }),
    /duplicate servo ID/
  );
  assert.throws(
    () => store.createPluginInstance(project.id, { name: "Duplicate Camera Device", catalogItemId: localCameraCatalog[0].id, config: { preferredDeviceId: "usb-camera-2", detectedDeviceId: "camera:usb-camera-1" } }),
    /duplicate detected device: camera:usb-camera-1/
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
    /requires Feetech servo plugin instances/
  );
  const mecanumComponent = store.createComponent(project.id, {
    name: "Mecanum Base",
    kind: "mecanum-drive",
    pluginInstanceIds: [motor.id, rearLeftMotor.id, rearRightMotor.id, frontRightMotor.id],
    config: {
      wheels: {
        frontLeft: motor.id,
        frontRight: frontRightMotor.id,
        rearLeft: rearLeftMotor.id,
        rearRight: rearRightMotor.id
      },
      directions: { frontRight: -1 },
      closedLoop: true,
      maxRpm: 6000,
      encoderTicksPerRev: 52
    }
  });
  assert.equal(mecanumComponent.kind, "mecanum-drive");
  assert.equal(mecanumComponent.config.closedLoop, true);
  assert.equal(mecanumComponent.config.wheels.frontRight, frontRightMotor.id);
  assert.throws(
    () => store.updateComponent(project.id, mecanumComponent.id, {
      config: { wheels: { frontLeft: motor.id, frontRight: rearLeftMotor.id, rearLeft: rearRightMotor.id, rearRight: motor.id } }
    }),
    /four unique motor plugin instances/
  );
  assert.deepEqual(store.deleteComponent(project.id, mecanumComponent.id), { deleted: true });

  const canServoGroup = store.createComponent(project.id, {
    name: "CAN Group",
    kind: "can-servo-group",
    pluginInstanceIds: [canServo.id, canServo2.id, canServo3.id, canServo4.id],
    config: {
      servos: {
        servo1: canServo.id,
        servo2: canServo2.id,
        servo3: canServo3.id,
        servo4: canServo4.id
      }
    }
  });
  assert.equal(canServoGroup.kind, "can-servo-group");
  assert.equal(canServoGroup.config.servos.servo1, canServo.id);
  assert.deepEqual(store.deleteComponent(project.id, canServoGroup.id), { deleted: true });
  assert.throws(
    () => store.createComponent(project.id, {
      name: "Bad CAN Group",
      kind: "can-servo-group",
      pluginInstanceIds: [canServo.id, canServo2.id, canServo3.id, motor.id],
      config: { servos: { servo1: canServo.id, servo2: canServo2.id, servo3: canServo3.id, servo4: motor.id } }
    }),
    /requires ASME CAN servo/
  );

  const component = store.createComponent(project.id, { name: "Drive", pluginInstanceIds: [motor.id] });
  assert.deepEqual(component.pluginInstanceIds, [motor.id]);
  assert.throws(() => store.deletePluginInstance(project.id, motor.id), /in use/);

  assert.deepEqual(store.savePanelLayout(project.id, `component:${component.id}`, [{ id: "panel-1", targetId: "motor:M1", capability: "motor", order: 0 }]).layout[0].scopeId, `component:${component.id}`);
  const savedConsoleLayout = store.savePanelLayout(project.id, "console:main", [
    {
      id: "console:telemetry",
      panelId: "console.telemetry",
      targetId: "dashboard:telemetry",
      capability: "dashboard",
      title: "Telemetry",
      visibleItemIds: ["voltage", "", 7, "serial", "voltage"],
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      order: 0
    }
  ]).layout[0];
  assert.equal(savedConsoleLayout.capability, "dashboard");
  assert.deepEqual(savedConsoleLayout.visibleItemIds, ["voltage", "serial"]);

  assert.throws(
    () => store.createRobot(project.id, { name: "Robot A", componentIds: [component.id], pluginInstanceIds: [motor.id] }),
    /already assigned/
  );
  const robot = store.createRobot(project.id, {
    name: "Robot A",
    componentIds: [component.id],
    pluginInstanceIds: [servo.id],
    config: {
      assembly: {
        version: 2,
        nodes: [{ id: "component:drive", sourceType: "component", sourceId: component.id, x: 40, y: 60, w: 180, h: 120, visualKind: "tracked-base" }],
        ports: [{ id: "component:drive:port:motor-bus", nodeId: "component:drive", name: "MOTOR_BUS", label: "Motor bus", kind: "pwm", direction: "in", side: "right", x: 180, y: 96 }],
        edges: [],
        harnesses: [{ id: "harness:motor", name: "Motor bus", color: "#38bdf8", hidden: false }],
        controlMappings: []
      },
      actionButtons: [{ id: "button:stop", name: "Stop Motors", color: "#ef4444", icon: "stop", confirmRequired: true, timeoutMs: 5000, steps: [{ id: "step:stop", kind: "motor.stop", label: "Stop left", pluginInstanceId: motor.id, stopMode: "brake" }] }]
    }
  });
  assert.deepEqual(robot.componentIds, [component.id]);
  assert.equal(robot.config.assembly.version, 2);
  assert.equal(robot.config.assembly.nodes[0].visualKind, "tracked-base");
  assert.equal(robot.config.actionButtons[0].steps[0].kind, "motor.stop");
  const updatedRobot = store.updateRobot(project.id, robot.id, {
    config: {
      assembly: {
        ...robot.config.assembly,
        edges: [{ id: "edge-1", fromNodeId: "component:drive", toNodeId: "plugin:base", fromPortId: "component:drive:port:motor-bus", toPortId: "plugin:base:port:pwm", kind: "pwm", label: "PWM", harnessId: "harness:motor", hidden: true }]
      },
      actionButtons: robot.config.actionButtons
    }
  });
  assert.deepEqual(updatedRobot.config.assembly.edges, [{ id: "edge-1", fromNodeId: "component:drive", toNodeId: "plugin:base", fromPortId: "component:drive:port:motor-bus", toPortId: "plugin:base:port:pwm", kind: "pwm", label: "PWM", harnessId: "harness:motor", hidden: true }]);
  assert.equal(updatedRobot.config.actionButtons[0].name, "Stop Motors");
  const robotConsoleScope = `console:robot:${robot.id}`;
  assert.equal(store.savePanelLayout(project.id, robotConsoleScope, [{ id: "robot-console:telemetry", targetId: "dashboard:telemetry", capability: "dashboard", order: 0 }]).layout[0].scopeId, robotConsoleScope);
  assert.equal(store.getPanelLayout(project.id, robotConsoleScope).layout.length, 1);
  assert.deepEqual(store.createRobot(project.id, { name: "Robot Empty Config", pluginInstanceIds: [canServo.id] }).config, {});
  assert.throws(() => store.deleteComponent(project.id, component.id), /in use/);

  const projectB = store.createProject("Other Project");
  assert.deepEqual(store.listPluginInstances(projectB.id), []);

  assert.deepEqual(store.deleteRobot(project.id, robot.id), { deleted: true });
  assert.deepEqual(store.getPanelLayout(project.id, robotConsoleScope).layout, []);
  assert.deepEqual(store.deleteComponent(project.id, armComponent.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, armServo.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, localCamera.id), { deleted: true });
  assert.deepEqual(store.deleteComponent(project.id, component.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, frontRightMotor.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, rearRightMotor.id), { deleted: true });
  assert.deepEqual(store.deletePluginInstance(project.id, rearLeftMotor.id), { deleted: true });
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
