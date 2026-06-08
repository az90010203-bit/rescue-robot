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
  validatePluginInstance
} from "@platform/architecture";
import { BUILTIN_PLUGIN_PACKAGES, BUILTIN_UI_PANELS } from "@platform/builtinPlugins";

const servoCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.feetech.sts3215")!;
const asmeServoCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.asme.asme-se-can-servo")!;
const motorCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.toshiba.tb6618-motor")!;
const wheeltecMg540Catalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.wheeltec.mg540")!;
const gamepadCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.browser.gamepad")!;
const localCameraCatalog = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === "catalog.browser.local-camera")!;

describe("three-layer architecture model", () => {
  it("filters catalog items by type, brand, and query", () => {
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "servo", brand: "Feetech", query: "3215" })).toEqual([servoCatalog]);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "servo", brand: "ASME", model: "ASME-SE" })).toEqual([asmeServoCatalog]);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "motor", query: "h-bridge" })[0].id).toBe(motorCatalog.id);
    expect(deviceCatalogModels(BUILTIN_DEVICE_CATALOG_ITEMS, "motor", "WHEELTEC")).toEqual(["G513XL", "MG540"]);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "gamepad", query: "browser" })[0].id).toBe(gamepadCatalog.id);
    expect(filterDeviceCatalogItems(BUILTIN_DEVICE_CATALOG_ITEMS, { type: "camera", brand: "Browser", query: "local" })[0].id).toBe(localCameraCatalog.id);
  });

  it("derives and filters selectable driver library files from built-in packages", () => {
    const drivers = driverLibraryItemsFromPackages(BUILTIN_PLUGIN_PACKAGES);
    const feetech = drivers.find((item) => item.driverId === "driver.feetech-servo");
    const asme = drivers.find((item) => item.driverId === "driver.asme-can-servo");
    const tb6618 = drivers.find((item) => item.driverId === "driver.tb6618-motor");
    const gamepad = drivers.find((item) => item.driverId === "driver.browser-gamepad");
    const browserCamera = drivers.find((item) => item.driverId === "driver.browser-camera");

    expect(feetech).toMatchObject({
      packageId: "builtin.feetech-servo",
      type: "servo",
      sourceFile: "plugins/builtin/feetechServo.ts",
      transportIds: ["transport.web-serial"]
    });
    expect(asme).toMatchObject({
      packageId: "builtin.asme-can-servo",
      type: "servo",
      sourceFile: "plugins/builtin/asmeCanServo.ts",
      transportIds: ["transport.a-board-can1"]
    });
    expect(tb6618).toMatchObject({ type: "motor", sourceFile: "plugins/builtin/tb6618Motor.ts" });
    expect(gamepad).toMatchObject({ type: "gamepad", sourceFile: "plugins/builtin/browserGamepad.ts", transportIds: ["transport.browser-gamepad-api"] });
    expect(browserCamera).toMatchObject({ type: "camera", sourceFile: "plugins/builtin/browserCamera.ts", transportIds: ["transport.browser-media"] });
    expect(filterDriverLibraryItems(drivers, { type: "servo", query: "feetechServo.ts" }).map((item) => item.driverId)).toEqual(["driver.feetech-servo"]);
  });

  it("scopes model templates to the selected driver library", () => {
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.feetech-servo").map((item) => item.id)).toEqual([
      "catalog.feetech.sts3215",
      "catalog.feetech.scservo"
    ]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.asme-can-servo").map((item) => item.id)).toEqual(["catalog.asme.asme-se-can-servo"]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.tb6618-motor").map((item) => item.id)).toEqual(["catalog.toshiba.tb6618-motor", "catalog.wheeltec.g513xl", "catalog.wheeltec.mg540"]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.browser-gamepad").map((item) => item.id)).toEqual(["catalog.browser.gamepad"]);
    expect(catalogItemsForDriver(BUILTIN_DEVICE_CATALOG_ITEMS, "driver.browser-camera").map((item) => item.id)).toEqual(["catalog.browser.local-camera"]);
  });

  it("selects code libraries by device type and brand before model driver choice", () => {
    const drivers = driverLibraryItemsFromPackages(BUILTIN_PLUGIN_PACKAGES);
    const libraries = deviceCodeLibraryItemsFromCatalog(BUILTIN_DEVICE_CATALOG_ITEMS, drivers);

    expect(filterDeviceCodeLibraryItems(libraries, { type: "servo", brand: "Feetech" }).map((item) => item.model)).toEqual(["STS3215", "STS/SCS Generic"]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "servo", brand: "ASME", model: "ASME-SE" }).map((item) => item.driverId)).toEqual(["driver.asme-can-servo"]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "motor", brand: "Toshiba" }).map((item) => item.sourceFile)).toEqual(["plugins/builtin/tb6618Motor.ts"]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "motor", brand: "WHEELTEC" }).map((item) => item.model)).toEqual(["G513XL", "MG540"]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "motor", brand: "WHEELTEC", model: "MG540" }).map((item) => item.catalogItemId)).toEqual([wheeltecMg540Catalog.id]);
    expect(filterDeviceCodeLibraryItems(libraries, { type: "servo", brand: "Feetech", query: "3215" }).map((item) => item.catalogItemId)).toEqual(["catalog.feetech.sts3215"]);
  });

  it("creates plugin instances from catalog defaults and validates duplicate hardware", () => {
    const servo = createPluginInstanceFromCatalog({
      id: "servo-a",
      name: "Base joint",
      catalogItem: servoCatalog,
      config: { servoId: "22", direction: "-1" }
    });
    const duplicate = createPluginInstanceFromCatalog({
      id: "servo-b",
      name: "Elbow joint",
      catalogItem: servoCatalog,
      config: { servoId: 22 }
    });
    const canServo = createPluginInstanceFromCatalog({
      id: "can-servo",
      name: "CAN joint",
      catalogItem: asmeServoCatalog,
      config: { servoId: 22 }
    });

    expect(servo.config).toMatchObject({ servoId: 22, direction: -1 });
    expect(validatePluginInstance(servo)).toBeNull();
    expect(validatePluginInstance(duplicate, [servo])).toBe("duplicate servo ID: 22");
    expect(validatePluginInstance(canServo, [servo])).toBeNull();
  });

  it("bridges plugin instances into platform devices and legacy profiles", () => {
    const servo = createPluginInstanceFromCatalog({ id: "servo-a", name: "Base", catalogItem: servoCatalog, config: { servoId: 7 } });
    const motor = createPluginInstanceFromCatalog({ id: "motor-a", name: "Left Track", catalogItem: motorCatalog, config: { channel: "m2", pwmPin: "D5" } });

    expect(createDeviceDescriptorFromPluginInstance(servo)).toMatchObject({ id: "servo:7", driverId: "driver.feetech-servo" });
    const canServo = createPluginInstanceFromCatalog({ id: "can-servo", name: "CAN", catalogItem: asmeServoCatalog, config: { servoId: 7 } });
    expect(pluginInstancesToServoProfiles([servo, canServo])).toEqual([expect.objectContaining({ id: 7, name: "Base" })]);
    expect(pluginInstancesToMotorProfiles([motor])[0]).toMatchObject({ channel: "M2", name: "Left Track", pwmPin: "D5" });
  });

  it("tracks physical plugin assignment availability", () => {
    const servo = createPluginInstanceFromCatalog({ id: "servo-a", name: "Base", catalogItem: servoCatalog, config: { servoId: 7 } });
    const motor = createPluginInstanceFromCatalog({ id: "motor-a", name: "Left", catalogItem: motorCatalog, config: { channel: "M1" } });
    const components = [{ id: "drive", kind: "custom" as const, name: "Drive", pluginInstanceIds: ["motor-a"], tags: [], config: {} }];
    const robots = [{ id: "robot", kind: "robot" as const, name: "Robot", componentIds: [], pluginInstanceIds: ["servo-a"], tags: [], config: {} }];

    expect(availablePluginInstancesForComponent([servo, motor], components, robots).map((item) => item.id)).toEqual([]);
    expect(validateComponentDefinition({ id: "arm", kind: "robot-arm", name: "Arm", pluginInstanceIds: ["servo-a"], tags: [], config: {} }, [servo, motor])).toBeNull();
    expect(validateComponentDefinition({ id: "bad-arm", kind: "robot-arm", name: "Bad Arm", pluginInstanceIds: ["motor-a"], tags: [], config: {} }, [servo, motor])).toContain("requires Feetech servo");
    expect(validatePhysicalInstanceAssignments(components, robots)).toBeNull();
    expect(validatePhysicalInstanceAssignments([...components, { id: "dup", kind: "custom" as const, name: "Dup", pluginInstanceIds: ["motor-a"], tags: [], config: {} }], robots)).toContain("already assigned");
  });

  it("generates and reorders panel layout from plugin capabilities", () => {
    const servo = createPluginInstanceFromCatalog({ id: "servo-a", name: "Base", catalogItem: servoCatalog, config: { servoId: 7 } });
    const motor = createPluginInstanceFromCatalog({ id: "motor-a", name: "Left", catalogItem: motorCatalog, config: { channel: "M1" } });
    const targets = panelTargetsForPluginInstances([servo, motor], BUILTIN_UI_PANELS);
    const layout = defaultPanelLayoutItems("component:drive", targets);
    const reordered = reorderPanelLayoutItems(layout, layout[1].id, layout[0].id);

    expect(layout.map((item) => item.panelId)).toEqual(["servo-control", "motor-control"]);
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
