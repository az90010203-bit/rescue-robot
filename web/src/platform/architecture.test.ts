import { describe, expect, it } from "vitest";
import {
  BUILTIN_DEVICE_CATALOG_ITEMS,
  availablePluginInstancesForComponent,
  catalogItemsForDriver,
  createDeviceDescriptorFromPluginInstance,
  createPluginInstanceFromCatalog,
  defaultPanelLayoutItems,
  deviceCodeLibraryItemsFromCatalog,
  deviceCatalogModels,
  driverLibraryItemsFromPackages,
  filterDeviceCodeLibraryItems,
  filterDriverLibraryItems,
  filterDeviceCatalogItems,
  mergePanelLayoutItems,
  panelTargetsForPluginInstances,
  pluginInstancesToMotorProfiles,
  pluginInstancesToServoProfiles,
  reorderPanelLayoutItems,
  validateComponentDefinition,
  validatePhysicalInstanceAssignments,
  validatePluginInstance,
  type PluginInstance
} from "@platform/architecture";
import { BUILTIN_PLUGIN_PACKAGES, BUILTIN_UI_PANELS } from "@platform/builtinPlugins";

const asmeServoCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.asme.asme-se-can-servo")!;
const motorCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.toshiba.tb6618-motor")!;
const wheeltecMg540Catalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.wheeltec.mg540")!;
const gamepadCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.browser.gamepad")!;
const localCameraCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.browser.local-camera")!;
const aiVisionCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.local.ai-vision")!;

function legacyFeetechPlugin(id: string, name: string, servoId: number): PluginInstance {
  return {
    id,
    name,
    type: "servo",
    catalogItemId: null,
    brand: "Feetech",
    model: "Legacy STS/SCS",
    driverId: "driver.feetech-servo",
    transportId: "transport.web-serial",
    capabilities: [{ id: "servo", features: ["position_control", "wheel_speed_control", "torque_control", "feedback"] }],
    config: { servoId, minDeg: 0, maxDeg: 360, direction: 1 },
    tags: ["servo", "legacy", "feetech"]
  };
}

describe("three-layer architecture model", () => {
  it("filters catalog items by type, brand, and query", () => {
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "servo", brand: "Feetech", query: "3215" })).toEqual([]);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "servo", brand: "ASME", model: "ASME-SE" })).toEqual([asmeServoCatalog]);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "motor", query: "h-bridge" })[0].id).toBe(motorCatalog.id);
    expect(deviceCatalogModels(BUILTIN_DEVICE_CATALOG_ITEMS, "motor", "WHEELTEC")).toEqual(["G513XL", "MG540"]);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "gamepad", query: "browser" })[0].id).toBe(gamepadCatalog.id);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "camera", brand: "Browser", query: "local" })[0].id).toBe(localCameraCatalog.id);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "ai-vision", brand: "Local", query: "mannequin" })[0].id).toBe(aiVisionCatalog.id);
  });

  it("derives and filters selectable driver library files from built-in packages", () => {
    const drivers = driverLibraryItemsFromPackages(BUILTIN_PLUGIN_PACKAGES);
    const asme = drivers.find((item) => item.driverId === "driver.asme-can-servo");
    const tb6618 = drivers.find((item) => item.driverId === "driver.tb6618-motor");
    const gamepad = drivers.find((item) => item.driverId === "driver.browser-gamepad");
    const browserCamera = drivers.find((item) => item.driverId === "driver.browser-camera");
    const aiVision = drivers.find((item) => item.driverId === "driver.ai-vision-helper");

    expect(drivers.some((item) => item.driverId === "driver.feetech-servo")).toBe(false);
    expect(asme).toMatchObject({
      packageId: "builtin.asme-can-servo",
      type: "servo",
      sourceFile: "plugins/builtin/asmeCanServo.ts",
      transportIds: ["transport.a-board-can1"]
    });
    expect(tb6618).toMatchObject({ type: "motor", sourceFile: "plugins/builtin/tb6618Motor.ts" });
    expect(gamepad).toMatchObject({ type: "gamepad", sourceFile: "plugins/builtin/browserGamepad.ts", transportIds: ["transport.browser-gamepad-api"] });
    expect(browserCamera).toMatchObject({ type: "camera", sourceFile: "plugins/builtin/browserCamera.ts", transportIds: ["transport.browser-media"] });
    expect(aiVision).toMatchObject({ type: "ai-vision", sourceFile: "plugins/builtin/aiVision.ts", transportIds: ["transport.local-helper"] });
    expect(filterDriverLibraryItems(drivers, { type: "servo", query: "feetechServo.ts" }).map((item) => item.driverId)).toEqual([]);
  });

  it("scopes model templates to the selected driver library", () => {
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.feetech-servo")).toEqual([]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.asme-can-servo").map((item) => item.id)).toEqual(["catalog.asme.asme-se-can-servo"]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.tb6618-motor").map((item) => item.id)).toEqual(["catalog.toshiba.tb6618-motor", "catalog.wheeltec.g513xl", "catalog.wheeltec.mg540"]);
    expect(BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.wheeltec.g513xl")?.defaultConfig).toMatchObject({
      channel: "M1",
      pwmPin: "PA0",
      in1Pin: "PB0",
      in2Pin: "PE12",
      enablePin: "PD12",
      encoderAPin: "PE4",
      encoderBPin: "PF0"
    });
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.browser-gamepad").map((item) => item.id)).toEqual(["catalog.browser.gamepad"]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.browser-camera").map((item) => item.id)).toEqual(["catalog.browser.local-camera"]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.ai-vision-helper").map((item) => item.id)).toEqual(["catalog.local.ai-vision"]);
  });

  it("selects code libraries by device type and brand before model driver choice", () => {
    const drivers = driverLibraryItemsFromPackages(BUILTIN_PLUGIN_PACKAGES);
    const libraries = deviceCodeLibraryItemsFromCatalog(BUILTIN_DEVICE_CATALOG_ITEMS, drivers);

    expect(filterDeviceCodeLibraryItems(libraries, { type: "servo", brand: "Feetech" })).toEqual([]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "servo", brand: "ASME", model: "ASME-SE" }).map((item) => item.driverId)).toEqual(["driver.asme-can-servo"]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "motor", brand: "Toshiba" }).map((item) => item.sourceFile)).toEqual(["plugins/builtin/tb6618Motor.ts"]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "motor", brand: "WHEELTEC" }).map((item) => item.model)).toEqual(["G513XL", "MG540"]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "motor", brand: "WHEELTEC", model: "MG540" }).map((item) => item.catalogItemId)).toEqual([wheeltecMg540Catalog.id]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "servo", brand: "Feetech", query: "3215" })).toEqual([]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "ai-vision", brand: "Local", query: "aiVision.ts" }).map((item) => item.catalogItemId)).toEqual([aiVisionCatalog.id]);
  });

  it("creates plugin instances from catalog defaults and validates duplicate hardware", () => {
    const servo = createPluginInstanceFromCatalog({
      id: "servo-a",
      name: "Base joint",
      catalogItem: asmeServoCatalog,
      config: { servoId: "22", direction: "-1" }
    });
    const duplicate = createPluginInstanceFromCatalog({
      id: "servo-b",
      name: "Elbow joint",
      catalogItem: asmeServoCatalog,
      config: { servoId: 22 }
    });
    const canServo = createPluginInstanceFromCatalog({
      id: "can-servo",
      name: "CAN joint",
      catalogItem: asmeServoCatalog,
      config: { servoId: 23, direction: "-1", minDeg: "15", maxDeg: "180" }
    });

    expect(servo.config).toMatchObject({ servoId: 22, direction: -1 });
    expect(canServo.config).toMatchObject({ servoId: 23, direction: -1, minDeg: 15, maxDeg: 180, bitrateKbps: 250, canBus: "CAN1" });
    expect(validatePluginInstance(servo)).toBeNull();
    expect(validatePluginInstance(duplicate, [servo])).toBe("duplicate servo ID: 22");
    expect(validatePluginInstance(canServo, [servo])).toBeNull();
  });

  it("bridges plugin instances into platform devices and legacy profiles", () => {
    const servo = legacyFeetechPlugin("servo-a", "Base", 7);
    const motor = createPluginInstanceFromCatalog({ id: "motor-a", name: "Left Track", catalogItem: motorCatalog, config: { channel: "m2", pwmPin: "S" } });
    const typeAMotor = createPluginInstanceFromCatalog({ id: "motor-type-a", name: "A Wheel", catalogItem: motorCatalog, config: { channel: "M1", pwmPin: "S", in1Pin: "L2", in2Pin: "K2" } });

    expect(createDeviceDescriptorFromPluginInstance(servo)).toMatchObject({ id: "servo:7", driverId: "driver.feetech-servo" });
    const canServo = createPluginInstanceFromCatalog({ id: "can-servo", name: "CAN", catalogItem: asmeServoCatalog, config: { servoId: 7 } });
    expect(pluginInstancesToServoProfiles([servo, canServo])).toEqual([expect.objectContaining({ id: 7, name: "Base" })]);
    expect(pluginInstancesToMotorProfiles([motor])[0]).toMatchObject({ channel: "M2", name: "Left Track", pwmPin: "PA0" });
    expect(pluginInstancesToMotorProfiles([typeAMotor])[0]).toMatchObject({ channel: "M1", name: "A Wheel", pwmPin: "PA0", in1Pin: "PB0", in2Pin: "PE12" });
  });

  it("tracks physical plugin assignment availability", () => {
    const servo = legacyFeetechPlugin("servo-a", "Base", 7);
    const motor = createPluginInstanceFromCatalog({ id: "motor-a", name: "Left", catalogItem: motorCatalog, config: { channel: "M1" } });
    const components = [{ id: "drive", kind: "custom" as const, name: "Drive", pluginInstanceIds: ["motor-a"], tags: [], config: {} }];
    const robots = [{ id: "robot", kind: "robot" as const, name: "Robot", componentIds: [], pluginInstanceIds: ["servo-a"], tags: [], config: {} }];

    expect(availablePluginInstancesForComponent([servo, motor], components, robots).map((item) => item.id)).toEqual([]);
    expect(validateComponentDefinition({ id: "arm", kind: "robot-arm", name: "Arm", pluginInstanceIds: ["servo-a"], tags: [], config: {} }, [servo, motor])).toBeNull();
    expect(validateComponentDefinition({ id: "bad-arm", kind: "robot-arm", name: "Bad Arm", pluginInstanceIds: ["motor-a"], tags: [], config: {} }, [servo, motor])).toContain("requires Feetech servo");
    const wheelMotors = ["M1", "M2", "M3", "M4"].map((channel) => createPluginInstanceFromCatalog({ id: `motor-${channel}`, name: channel, catalogItem: motorCatalog, config: { channel, pwmPin: `P${channel}`, in1Pin: `A${channel}`, in2Pin: `B${channel}` } }));
    expect(validateComponentDefinition({
      id: "mecanum",
      kind: "mecanum-drive",
      name: "Mecanum",
      pluginInstanceIds: wheelMotors.map((plugin) => plugin.id),
      tags: [],
      config: {
        wheels: {
          frontLeft: "motor-M1",
          frontRight: "motor-M4",
          rearLeft: "motor-M2",
          rearRight: "motor-M3"
        },
        directions: {},
        closedLoop: true,
        maxRpm: 6000,
        encoderTicksPerRev: 52
      }
    }, [...wheelMotors, servo])).toBeNull();
    expect(validateComponentDefinition({
      id: "bad-mecanum",
      kind: "mecanum-drive",
      name: "Bad Mecanum",
      pluginInstanceIds: ["motor-M1", "motor-M2", "motor-M3", "motor-M4"],
      tags: [],
      config: {
        wheels: {
          frontLeft: "motor-M1",
          frontRight: "motor-M2",
          rearLeft: "motor-M3",
          rearRight: "motor-M1"
        }
      }
    }, wheelMotors)).toContain("unique");
    const trackMotors = ["M5", "M6"].map((channel) => createPluginInstanceFromCatalog({ id: `track-${channel}`, name: channel, catalogItem: motorCatalog, config: { channel, pwmPin: `P${channel}`, in1Pin: `A${channel}`, in2Pin: `B${channel}` } }));
    expect(validateComponentDefinition({
      id: "tracked",
      kind: "tracked-drive",
      name: "Tracked",
      pluginInstanceIds: trackMotors.map((plugin) => plugin.id),
      tags: [],
      config: {
        tracks: {
          leftTrack: "track-M5",
          rightTrack: "track-M6"
        },
        directions: {},
        closedLoop: true,
        maxRpm: 6000,
        encoderTicksPerRev: 52
      }
    }, [...trackMotors, servo])).toBeNull();
    expect(validateComponentDefinition({
      id: "bad-tracked",
      kind: "tracked-drive",
      name: "Bad Tracked",
      pluginInstanceIds: ["track-M5", "track-M6"],
      tags: [],
      config: {
        tracks: {
          leftTrack: "track-M5",
          rightTrack: "track-M5"
        }
      }
    }, trackMotors)).toContain("unique");
    const canServos = [1, 2, 3, 4].map((id) => createPluginInstanceFromCatalog({
      id: `can-${id}`,
      name: `CAN ${id}`,
      catalogItem: asmeServoCatalog,
      config: { servoId: id }
    }));
    expect(validateComponentDefinition({
      id: "can-group",
      kind: "can-servo-group",
      name: "CAN Group",
      pluginInstanceIds: canServos.map((plugin) => plugin.id),
      tags: [],
      config: { servos: { servo1: "can-1", servo2: "can-2", servo3: "can-3", servo4: "can-4" } }
    }, canServos)).toBeNull();
    expect(validateComponentDefinition({
      id: "bad-can-group",
      kind: "can-servo-group",
      name: "Bad CAN Group",
      pluginInstanceIds: ["can-1", "can-2", "can-3", "motor-M1"],
      tags: [],
      config: { servos: { servo1: "can-1", servo2: "can-2", servo3: "can-3", servo4: "motor-M1" } }
    }, [...canServos, ...wheelMotors])).toContain("requires ASME CAN servo");
    expect(validatePhysicalInstanceAssignments(components, robots)).toBeNull();
    expect(validatePhysicalInstanceAssignments([...components, { id: "dup", kind: "custom" as const, name: "Dup", pluginInstanceIds: ["motor-a"], tags: [], config: {} }], robots)).toContain("already assigned");
  });

  it("generates and reorders panel layout from plugin capabilities", () => {
    const servo = legacyFeetechPlugin("servo-a", "Base", 7);
    const motor = createPluginInstanceFromCatalog({ id: "motor-a", name: "Left", catalogItem: motorCatalog, config: { channel: "M1" } });
    const targets = panelTargetsForPluginInstances([servo, motor], BUILTIN_UI_PANELS);
    const layout = defaultPanelLayoutItems("component:drive", targets);
    const reordered = reorderPanelLayoutItems(layout, layout[1].id, layout[0].id);

    expect(layout.map((item) => item.panelId)).toEqual(["servo-panel", "motor-control"]);
    expect(reordered.map((item) => item.targetId)).toEqual(["motor:M1", "servo:7"]);
    expect(mergePanelLayoutItems("component:drive", reordered, targets).map((item) => item.order)).toEqual([0, 1]);
  });

  it("selects driver-specific camera panels for plugin layouts", () => {
    const gimbal = createPluginInstanceFromCatalog({ id: "camera-main", name: "Gimbal", catalogItem: BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.generic.camera-gimbal")! });
    const secondary = createPluginInstanceFromCatalog({ id: "camera-secondary", name: "Second", catalogItem: BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.generic.secondary-camera")! });
    const browserCamera = createPluginInstanceFromCatalog({ id: "camera-local", name: "Computer", catalogItem: localCameraCatalog });

    expect(panelTargetsForPluginInstances([gimbal, secondary, browserCamera], BUILTIN_UI_PANELS).map((item) => item.panelId)).toEqual([
      "camera-gimbal-control",
      "secondary-camera-control",
      "browser-camera-control"
    ]);
  });
});
