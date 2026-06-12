import {
  MotorProfile,
  ServoProfile,
  isValidMotorChannel,
  isValidServoId,
  normalizeMotorChannel,
  normalizeMotorPin,
  normalizeServoProfile,
  type MotorPinRole
} from "@adapters/hardware/protocol";
import { CapabilityId, DeviceDescriptor, PlatformPluginPackage, UiPanelSchema } from "@platform/types";
import { findPlatformUiPanelForDevice } from "@platform/ui";
import builtInDeviceCatalogItems from "@platform/defaultCatalog.json";
import { validateMecanumDriveComponentConfig } from "@domains/drive/mecanumComponent";
import { validateCanServoGroupComponentConfig } from "@domains/can-servo/canServoGroupComponent";
export {
  defaultPanelLayoutItems,
  mergePanelLayoutItems,
  reorderPanelLayoutItems,
  reflowPanelLayout
} from "@platform/panelLayoutCore";
export type { PanelLayoutItem, PanelLayoutTarget } from "@platform/panelLayoutCore";

import type {
  ArchitectureSnapshot,
  CatalogFilter,
  ComponentConfig,
  ComponentDefinition,
  ComponentKind,
  DeviceCatalogItem,
  DeviceCodeLibraryFilter,
  DeviceCodeLibraryItem,
  DeviceConfig,
  DeviceConfigField,
  DeviceConfigFieldKind,
  DeviceConfigOption,
  DeviceConfigValue,
  DriverLibraryFilter,
  DriverLibraryItem,
  PluginInstance,
  PluginUsage,
  RobotActionButton,
  RobotActionButtonServoTarget,
  RobotActionButtonStep,
  RobotActionButtonStepKind,
  RobotAssemblyConfig,
  RobotAssemblyEdge,
  RobotAssemblyHarness,
  RobotAssemblyHardwareKind,
  RobotAssemblyNode,
  RobotAssemblyNodeSourceType,
  RobotAssemblyPort,
  RobotAssemblyPortDirection,
  RobotAssemblyPortKind,
  RobotAssemblyVisualKind,
  RobotAssemblyWarning,
  RobotConfig,
  RobotControlMapping,
  RobotDefinition,
  RobotProgram,
  RobotProgramTarget
} from "@platform/architectureTypes";
export type {
  ArchitectureSnapshot,
  CatalogFilter,
  ComponentConfig,
  ComponentDefinition,
  ComponentKind,
  DeviceCatalogItem,
  DeviceCodeLibraryFilter,
  DeviceCodeLibraryItem,
  DeviceConfig,
  DeviceConfigField,
  DeviceConfigFieldKind,
  DeviceConfigOption,
  DeviceConfigValue,
  DriverLibraryFilter,
  DriverLibraryItem,
  PluginInstance,
  PluginUsage,
  RobotActionButton,
  RobotActionButtonServoTarget,
  RobotActionButtonStep,
  RobotActionButtonStepKind,
  RobotAssemblyConfig,
  RobotAssemblyEdge,
  RobotAssemblyHarness,
  RobotAssemblyHardwareKind,
  RobotAssemblyNode,
  RobotAssemblyNodeSourceType,
  RobotAssemblyPort,
  RobotAssemblyPortDirection,
  RobotAssemblyPortKind,
  RobotAssemblyVisualKind,
  RobotAssemblyWarning,
  RobotConfig,
  RobotControlMapping,
  RobotDefinition,
  RobotProgram,
  RobotProgramTarget
} from "@platform/architectureTypes";

const MOTOR_PIN_FIELD_IDS = new Set<string>(["pwmPin", "in1Pin", "in2Pin", "enablePin", "sensorPin", "encoderAPin", "encoderBPin"]);
export const BUILTIN_DEVICE_CATALOG_ITEMS = builtInDeviceCatalogItems as unknown as DeviceCatalogItem[];

export function filterDeviceCatalogItems(items: DeviceCatalogItem[], filter: CatalogFilter): DeviceCatalogItem[] {
  const brand = filter.brand?.trim().toLowerCase() ?? "";
  const model = filter.model?.trim().toLowerCase() ?? "";
  const query = filter.query?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (filter.type && item.type !== filter.type) {
      return false;
    }
    if (brand && item.brand.toLowerCase() !== brand) {
      return false;
    }
    if (model && item.model.toLowerCase() !== model) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [item.displayName, item.brand, item.model, item.driverId, item.transportId, ...item.tags]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function deviceCatalogBrands(items: DeviceCatalogItem[], type?: CapabilityId | ""): string[] {
  const brands = items.filter((item) => !type || item.type === type).map((item) => item.brand);
  return Array.from(new Set(brands)).sort((a, b) => a.localeCompare(b));
}

export function deviceCatalogModels(items: DeviceCatalogItem[], type?: CapabilityId | "", brand?: string): string[] {
  const normalizedBrand = brand?.trim().toLowerCase() ?? "";
  const models = items
    .filter((item) => (!type || item.type === type) && (!normalizedBrand || item.brand.toLowerCase() === normalizedBrand))
    .map((item) => item.model);
  return Array.from(new Set(models)).sort((a, b) => a.localeCompare(b));
}

export function driverLibraryItemsFromPackages(packages: PlatformPluginPackage[]): DriverLibraryItem[] {
  return packages.flatMap((pluginPackage) =>
    pluginPackage.plugins
      .filter((plugin) => plugin.kind === "driver")
      .flatMap((plugin) =>
        plugin.provides.map((type) => ({
          packageId: pluginPackage.manifest.id,
          packageName: pluginPackage.manifest.name,
          driverId: plugin.id,
          name: plugin.name,
          version: plugin.version,
          type,
          transportIds: plugin.requiresTransport,
          protocol: plugin.protocol,
          sourceFile: driverPackageSourceFile(pluginPackage.manifest.id),
          description: plugin.description ?? pluginPackage.manifest.description
        }))
      )
  );
}

export function filterDriverLibraryItems(items: DriverLibraryItem[], filter: DriverLibraryFilter): DriverLibraryItem[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (filter.type && item.type !== filter.type) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [item.name, item.packageName, item.driverId, item.protocol, item.sourceFile, item.description, ...item.transportIds]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function catalogItemsForDriver(items: DeviceCatalogItem[], driverId: string): DeviceCatalogItem[] {
  return items.filter((item) => item.driverId === driverId);
}

export function deviceCodeLibraryItemsFromCatalog(catalog: DeviceCatalogItem[], drivers: DriverLibraryItem[]): DeviceCodeLibraryItem[] {
  const driversById = new Map(drivers.map((driver) => [driver.driverId, driver]));
  return catalog.map((item) => {
    const driver = driversById.get(item.driverId);
    return {
      id: `${item.id}:${item.driverId}`,
      catalogItemId: item.id,
      type: item.type,
      brand: item.brand,
      model: item.model,
      displayName: item.displayName,
      packageId: driver?.packageId ?? item.driverId,
      packageName: driver?.packageName ?? item.driverId,
      driverId: item.driverId,
      driverName: driver?.name ?? item.driverId,
      version: driver?.version ?? "",
      transportId: item.transportId,
      transportIds: driver?.transportIds ?? [item.transportId],
      protocol: driver?.protocol,
      sourceFile: driver?.sourceFile ?? item.driverId,
      tags: item.tags
    };
  });
}

export function filterDeviceCodeLibraryItems(items: DeviceCodeLibraryItem[], filter: DeviceCodeLibraryFilter): DeviceCodeLibraryItem[] {
  const brand = filter.brand?.trim().toLowerCase() ?? "";
  const model = filter.model?.trim().toLowerCase() ?? "";
  const query = filter.query?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (filter.type && item.type !== filter.type) {
      return false;
    }
    if (brand && item.brand.toLowerCase() !== brand) {
      return false;
    }
    if (model && item.model.toLowerCase() !== model) {
      return false;
    }
    if (!query) {
      return true;
    }
    return [item.displayName, item.brand, item.model, item.driverName, item.driverId, item.protocol, item.sourceFile, item.transportId, ...item.transportIds, ...item.tags]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function configWithCatalogDefaults(catalogItem: DeviceCatalogItem, config: DeviceConfig = {}): DeviceConfig {
  return normalizeConfigForSchema(catalogItem.configSchema, { ...catalogItem.defaultConfig, ...config });
}

export function createPluginInstanceFromCatalog(options: {
  id: string;
  name: string;
  catalogItem: DeviceCatalogItem;
  config?: DeviceConfig;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}): PluginInstance {
  return {
    id: options.id,
    name: options.name.trim(),
    type: options.catalogItem.type,
    catalogItemId: options.catalogItem.id,
    brand: options.catalogItem.brand,
    model: options.catalogItem.model,
    driverId: options.catalogItem.driverId,
    transportId: options.catalogItem.transportId,
    capabilities: options.catalogItem.capabilities,
    config: configWithCatalogDefaults(options.catalogItem, options.config),
    tags: options.tags ?? options.catalogItem.tags,
    createdAt: options.createdAt,
    updatedAt: options.updatedAt
  };
}

export function validateCatalogItem(item: DeviceCatalogItem): string | null {
  if (!item.id.trim() || !item.displayName.trim() || !item.brand.trim() || !item.model.trim()) {
    return "catalog item requires id, displayName, brand, and model";
  }
  if (!item.driverId.trim() || !item.transportId.trim()) {
    return "catalog item requires driverId and transportId";
  }
  if (!item.capabilities.some((capability) => capability.id === item.type)) {
    return "catalog item must include its primary capability";
  }
  return validateConfigForSchema(item.configSchema, item.defaultConfig);
}

export function validatePluginInstance(instance: PluginInstance, existing: PluginInstance[] = []): string | null {
  if (!instance.id.trim() || !instance.name.trim()) {
    return "plugin instance requires id and name";
  }
  if (!instance.driverId.trim() || !instance.transportId.trim()) {
    return "plugin instance requires driverId and transportId";
  }
  if (existing.some((item) => item.id !== instance.id && item.name.trim().toLowerCase() === instance.name.trim().toLowerCase())) {
    return `duplicate plugin instance name: ${instance.name}`;
  }
  const duplicateHardware = duplicateHardwareTarget(instance, existing);
  if (duplicateHardware) {
    return duplicateHardware;
  }
  if (instance.type === "servo") {
    const servoId = Number(instance.config.servoId);
    if (!Number.isInteger(servoId) || !isValidServoId(servoId)) {
      return "servo plugin instance requires servoId from 0 to 253";
    }
  }
  if (instance.type === "motor") {
    const channel = String(instance.config.channel ?? "");
    if (!isValidMotorChannel(channel)) {
      return "motor plugin instance requires a valid channel";
    }
  }
  return null;
}

export function validateComponentDefinition(component: ComponentDefinition, pluginInstances: PluginInstance[]): string | null {
  if (!component.id.trim() || !component.name.trim()) {
    return "component requires id and name";
  }
  if (component.kind !== "custom" && component.kind !== "robot-arm" && component.kind !== "mecanum-drive" && component.kind !== "can-servo-group") {
    return "component kind must be custom, robot-arm, mecanum-drive, or can-servo-group";
  }
  const pluginById = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  const used = new Set<string>();
  for (const pluginId of component.pluginInstanceIds) {
    const plugin = pluginById.get(pluginId);
    if (!plugin) {
      return `component references missing plugin instance: ${pluginId}`;
    }
    if (component.kind === "robot-arm" && (plugin.type !== "servo" || plugin.driverId !== "driver.feetech-servo")) {
      return `robot-arm component requires Feetech servo plugin instances: ${pluginId}`;
    }
    if (component.kind === "mecanum-drive" && plugin.type !== "motor") {
      return `mecanum-drive component requires motor plugin instances: ${pluginId}`;
    }
    if (component.kind === "can-servo-group" && (plugin.type !== "servo" || plugin.driverId !== "driver.asme-can-servo")) {
      return `can-servo-group component requires ASME CAN servo plugin instances: ${pluginId}`;
    }
    if (used.has(pluginId)) {
      return `component references duplicate plugin instance: ${pluginId}`;
    }
    used.add(pluginId);
  }
  return validateMecanumDriveComponentConfig(component, pluginInstances) ?? validateCanServoGroupComponentConfig(component, pluginInstances);
}

export function validateRobotDefinition(robot: RobotDefinition, components: ComponentDefinition[], pluginInstances: PluginInstance[]): string | null {
  if (!robot.id.trim() || !robot.name.trim()) {
    return "robot requires id and name";
  }
  const componentIds = new Set(components.map((component) => component.id));
  const pluginIds = new Set(pluginInstances.map((plugin) => plugin.id));
  for (const componentId of robot.componentIds) {
    if (!componentIds.has(componentId)) {
      return `robot references missing component: ${componentId}`;
    }
  }
  for (const pluginId of robot.pluginInstanceIds) {
    if (!pluginIds.has(pluginId)) {
      return `robot references missing plugin instance: ${pluginId}`;
    }
  }
  return null;
}

export function pluginUsageMap(components: ComponentDefinition[], robots: RobotDefinition[]): Map<string, PluginUsage[]> {
  const usage = new Map<string, PluginUsage[]>();
  for (const component of components) {
    for (const pluginId of component.pluginInstanceIds) {
      pushUsage(usage, pluginId, { ownerKind: "component", ownerId: component.id, ownerName: component.name });
    }
  }
  for (const robot of robots) {
    for (const pluginId of robot.pluginInstanceIds) {
      pushUsage(usage, pluginId, { ownerKind: "robot", ownerId: robot.id, ownerName: robot.name });
    }
  }
  return usage;
}

export function validatePhysicalInstanceAssignments(components: ComponentDefinition[], robots: RobotDefinition[]): string | null {
  const usage = pluginUsageMap(components, robots);
  for (const [pluginId, owners] of usage) {
    if (owners.length > 1) {
      return `plugin instance ${pluginId} is already assigned to ${owners[0].ownerName}`;
    }
  }

  const componentUsage = new Map<string, string>();
  for (const robot of robots) {
    for (const componentId of robot.componentIds) {
      const existing = componentUsage.get(componentId);
      if (existing && existing !== robot.id) {
        return `component ${componentId} is already assigned to another robot`;
      }
      componentUsage.set(componentId, robot.id);
    }
  }
  return null;
}

export function availablePluginInstancesForComponent(
  pluginInstances: PluginInstance[],
  components: ComponentDefinition[],
  robots: RobotDefinition[],
  currentComponentId?: string
): PluginInstance[] {
  const usage = pluginUsageMap(components.filter((component) => component.id !== currentComponentId), robots);
  return pluginInstances.filter((plugin) => !usage.has(plugin.id));
}

export function pluginInstanceDeviceId(instance: PluginInstance): string {
  if (instance.type === "servo") {
    return `servo:${Number(instance.config.servoId)}`;
  }
  if (instance.type === "motor") {
    return `motor:${normalizeMotorChannel(String(instance.config.channel ?? ""))}`;
  }
  return `${instance.type}:${instance.id}`;
}

export function pluginInstanceDisplayName(instance: PluginInstance): string {
  const target = instance.type === "servo"
    ? `ID ${instance.config.servoId}`
    : instance.type === "motor"
      ? normalizeMotorChannel(String(instance.config.channel ?? ""))
      : instance.model;
  return `${instance.name} · ${target}`;
}

export function createDeviceDescriptorFromPluginInstance(instance: PluginInstance, status: DeviceDescriptor["status"] = "offline"): DeviceDescriptor {
  return {
    id: pluginInstanceDeviceId(instance),
    name: instance.name,
    type: instance.type,
    driverId: instance.driverId,
    transportId: instance.transportId,
    status,
    capabilities: instance.capabilities.length > 0 ? instance.capabilities : [{ id: instance.type, features: [] }],
    metadata: instance.config
  };
}

export function pluginInstancesToDeviceDescriptors(instances: PluginInstance[]): DeviceDescriptor[] {
  return instances.map((instance) => createDeviceDescriptorFromPluginInstance(instance));
}

export function pluginInstancesToServoProfiles(instances: PluginInstance[]): ServoProfile[] {
  return instances
    .filter((instance) => instance.type === "servo" && instance.driverId === "driver.feetech-servo")
    .map((instance) => {
      const servo: ServoProfile = {
        id: Number(instance.config.servoId),
        name: instance.name,
        minDeg: numberOrUndefined(instance.config.minDeg),
        maxDeg: numberOrUndefined(instance.config.maxDeg),
        direction: instance.config.direction === -1 ? -1 : 1
      };
      return normalizeServoProfile(servo);
    })
    .filter((servo) => isValidServoId(servo.id));
}

export function pluginInstancesToMotorProfiles(instances: PluginInstance[]): MotorProfile[] {
  return instances
    .filter((instance) => instance.type === "motor")
    .map((instance) => {
      const channel = normalizeMotorChannel(String(instance.config.channel ?? ""));
      return {
        channel,
        name: instance.name,
        pwmPin: normalizeMotorPin(stringOrUndefined(instance.config.pwmPin), "pwmPin", channel),
        in1Pin: normalizeMotorPin(stringOrUndefined(instance.config.in1Pin), "in1Pin", channel),
        in2Pin: normalizeMotorPin(stringOrUndefined(instance.config.in2Pin), "in2Pin", channel),
        enablePin: normalizeMotorPin(stringOrUndefined(instance.config.enablePin), "enablePin", channel),
        sensorPin: normalizeMotorPin(stringOrUndefined(instance.config.sensorPin), "sensorPin", channel),
        encoderAPin: normalizeMotorPin(stringOrUndefined(instance.config.encoderAPin), "encoderAPin", channel),
        encoderBPin: normalizeMotorPin(stringOrUndefined(instance.config.encoderBPin), "encoderBPin", channel)
      };
    })
    .filter((motor) => isValidMotorChannel(motor.channel));
}

export function effectivePluginInstancesForComponent(component: ComponentDefinition | undefined, instances: PluginInstance[]): PluginInstance[] {
  if (!component) {
    return [];
  }
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  return component.pluginInstanceIds.map((id) => byId.get(id)).filter((instance): instance is PluginInstance => Boolean(instance));
}

export function effectivePluginInstancesForRobot(robot: RobotDefinition | undefined, components: ComponentDefinition[], instances: PluginInstance[]): PluginInstance[] {
  if (!robot) {
    return [];
  }
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const componentById = new Map(components.map((component) => [component.id, component]));
  const ids = new Set<string>();
  for (const componentId of robot.componentIds) {
    const component = componentById.get(componentId);
    for (const pluginId of component?.pluginInstanceIds ?? []) {
      ids.add(pluginId);
    }
  }
  for (const pluginId of robot.pluginInstanceIds) {
    ids.add(pluginId);
  }
  return Array.from(ids).map((id) => byId.get(id)).filter((instance): instance is PluginInstance => Boolean(instance));
}

export function panelTargetsForPluginInstances(instances: PluginInstance[], uiPanels: UiPanelSchema[]): Array<{
  panelId: string;
  targetId: string;
  capability: CapabilityId;
  title: string;
}> {
  return instances.map((instance) => {
    const descriptor = createDeviceDescriptorFromPluginInstance(instance);
    const panel = findPlatformUiPanelForDevice(descriptor, uiPanels);
    return {
      panelId: panel?.id ?? `${instance.type}-panel`,
      targetId: pluginInstanceDeviceId(instance),
      capability: instance.type,
      title: `${instance.name} / ${panel?.title ?? instance.model}`
    };
  });
}

export function normalizeConfigForSchema(schema: DeviceConfigField[], config: DeviceConfig): DeviceConfig {
  const normalized: DeviceConfig = {};
  const schemaIds = new Set(schema.map((field) => field.id));
  for (const field of schema) {
    const value = config[field.id];
    if (field.kind === "number") {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
      normalized[field.id] = Number.isFinite(number) ? clampNumber(number!, field.min, field.max) : null;
    } else if (field.kind === "toggle") {
      normalized[field.id] = value === true;
    } else if (field.kind === "select") {
      const selectValue = typeof value === "string" && MOTOR_PIN_FIELD_IDS.has(field.id)
        ? normalizeMotorPin(value, field.id as MotorPinRole) ?? value
        : value;
      const option = (field.options ?? []).find((item) => String(item.value).toLowerCase() === String(selectValue).toLowerCase());
      normalized[field.id] = option ? option.value : field.options?.[0]?.value ?? null;
    } else {
      normalized[field.id] = value === null || value === undefined ? "" : String(value);
    }
  }
  for (const [key, value] of Object.entries(config)) {
    if (!schemaIds.has(key) && (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")) {
      normalized[key] = value;
    }
  }
  return normalized;
}

function validateConfigForSchema(schema: DeviceConfigField[], config: DeviceConfig): string | null {
  const normalized = normalizeConfigForSchema(schema, config);
  for (const field of schema) {
    const value = normalized[field.id];
    if (field.required && (value === null || value === "")) {
      return `config field is required: ${field.id}`;
    }
    if (field.kind === "number" && value !== null && typeof value !== "number") {
      return `config field must be numeric: ${field.id}`;
    }
  }
  return null;
}

function duplicateHardwareTarget(instance: PluginInstance, existing: PluginInstance[]): string | null {
  const detectedDeviceId = typeof instance.config.detectedDeviceId === "string" ? instance.config.detectedDeviceId.trim() : "";
  if (detectedDeviceId) {
    const duplicate = existing.find((item) => item.id !== instance.id && String(item.config.detectedDeviceId ?? "").trim() === detectedDeviceId);
    if (duplicate) {
      return `duplicate detected device: ${detectedDeviceId}`;
    }
  }
  if (instance.type === "servo") {
    const servoId = Number(instance.config.servoId);
    if (existing.some((item) => item.id !== instance.id && item.type === "servo" && item.driverId === instance.driverId && item.transportId === instance.transportId && Number(item.config.servoId) === servoId)) {
      return `duplicate servo ID: ${servoId}`;
    }
  }
  if (instance.type === "motor") {
    const channel = normalizeMotorChannel(String(instance.config.channel ?? ""));
    if (existing.some((item) => item.id !== instance.id && item.type === "motor" && normalizeMotorChannel(String(item.config.channel ?? "")) === channel)) {
      return `duplicate motor channel: ${channel}`;
    }
  }
  return null;
}

function pushUsage(usage: Map<string, PluginUsage[]>, pluginId: string, owner: PluginUsage) {
  usage.set(pluginId, [...(usage.get(pluginId) ?? []), owner]);
}

function driverPackageSourceFile(packageId: string): string {
  const sourceFiles: Record<string, string> = {
    "builtin.camera-gimbal": "plugins/builtin/cameraGimbal.ts",
    "builtin.asme-can-servo": "plugins/builtin/asmeCanServo.ts",
    "builtin.firmware-upload": "plugins/builtin/firmwareUpload.ts",
    "builtin.ai-vision": "plugins/builtin/aiVision.ts",
    "builtin.browser-gamepad": "plugins/builtin/browserGamepad.ts",
    "builtin.browser-camera": "plugins/builtin/browserCamera.ts",
    "builtin.raspberry-pi": "plugins/builtin/raspberryPi.ts",
    "builtin.robot-arm": "plugins/builtin/robotArm.ts",
    "builtin.secondary-camera": "plugins/builtin/secondaryCamera.ts",
    "builtin.tb6618-motor": "plugins/builtin/tb6618Motor.ts"
  };
  return sourceFiles[packageId] ?? packageId;
}

function numberOrUndefined(value: DeviceConfigValue): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: DeviceConfigValue): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampNumber(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === "number") {
    next = Math.max(min, next);
  }
  if (typeof max === "number") {
    next = Math.min(max, next);
  }
  return next;
}
