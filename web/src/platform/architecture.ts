import {
  MotorProfile,
  ServoProfile,
  isValidMotorChannel,
  isValidServoId,
  normalizeMotorChannel,
  normalizeServoProfile
} from "@adapters/hardware/protocol";
import { CapabilityId, DeviceCapability, DeviceDescriptor, PlatformPluginPackage, UiPanelSchema } from "@platform/types";
import type { PanelLayoutItem } from "@platform/panelLayoutCore";
import type { WorkflowDefinition } from "@platform/workflow";
import { findPlatformUiPanelForDevice } from "@platform/ui";
import { validateMecanumDriveComponentConfig } from "@domains/drive/mecanumComponent";
import { validateCanServoGroupComponentConfig } from "@domains/can-servo/canServoGroupComponent";
export {
  defaultPanelLayoutItems,
  mergePanelLayoutItems,
  reorderPanelLayoutItems,
  reflowPanelLayout
} from "@platform/panelLayoutCore";
export type { PanelLayoutItem, PanelLayoutTarget } from "@platform/panelLayoutCore";

export type DeviceConfigValue = string | number | boolean | null;
export type DeviceConfig = Record<string, DeviceConfigValue>;
export type ComponentKind = "custom" | "robot-arm" | "mecanum-drive" | "can-servo-group";
export type ComponentConfig = Record<string, unknown>;
export type DeviceConfigFieldKind = "text" | "number" | "select" | "toggle";

export interface DeviceConfigOption {
  label: string;
  value: string | number | boolean;
}

export interface DeviceConfigField {
  id: string;
  label: string;
  kind: DeviceConfigFieldKind;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: DeviceConfigOption[];
}

export interface DeviceCatalogItem {
  id: string;
  type: CapabilityId;
  brand: string;
  model: string;
  displayName: string;
  driverId: string;
  transportId: string;
  capabilities: DeviceCapability[];
  configSchema: DeviceConfigField[];
  defaultConfig: DeviceConfig;
  tags: string[];
  userDefined?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface PluginInstance {
  id: string;
  name: string;
  type: CapabilityId;
  catalogItemId: string | null;
  brand: string;
  model: string;
  driverId: string;
  transportId: string;
  capabilities: DeviceCapability[];
  config: DeviceConfig;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  kind: ComponentKind;
  pluginInstanceIds: string[];
  config: ComponentConfig;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
}

export type RobotAssemblyNodeSourceType = "component" | "plugin" | "hardware";
export type RobotAssemblyHardwareKind = "esp32" | "robomaster-a" | "raspberry-pi" | "tb6612" | "tb6618" | "power-module";
export type RobotAssemblyVisualKind = "component" | "plugin" | "robot-arm" | "tracked-base" | "mecanum-drive" | "hardware-board" | "motor-driver" | "power-module";
export type RobotAssemblyPortKind = "uart-tx" | "uart-rx" | "uart" | "can" | "pwm" | "gpio" | "power" | "ground" | "usb" | "servo-bus" | "signal";
export type RobotAssemblyPortDirection = "in" | "out" | "bidirectional" | "power";

export interface RobotAssemblyNode {
  id: string;
  sourceType: RobotAssemblyNodeSourceType;
  sourceId: string;
  hardwareKind?: RobotAssemblyHardwareKind;
  x: number;
  y: number;
  w: number;
  h: number;
  visualKind: RobotAssemblyVisualKind;
}

export interface RobotAssemblyPort {
  id: string;
  nodeId: string;
  name: string;
  label: string;
  kind: RobotAssemblyPortKind;
  direction: RobotAssemblyPortDirection;
  side: "left" | "right" | "top" | "bottom";
  x: number;
  y: number;
  voltage?: string;
  required?: boolean;
}

export interface RobotAssemblyEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortId?: string;
  toPortId?: string;
  kind: string;
  label: string;
  serialName?: string;
  baudRate?: number;
  protocol?: string;
  voltage?: string;
  harnessId?: string;
  hidden?: boolean;
}

export interface RobotAssemblyHarness {
  id: string;
  name: string;
  color: string;
  hidden: boolean;
}

export interface RobotAssemblyWarning {
  id: string;
  severity: "warning" | "error";
  targetId: string;
  message: string;
}

export interface RobotControlMapping {
  id: string;
  label: string;
  sourceId?: string;
  targetNodeId?: string;
  action?: string;
  enabled?: boolean;
}

export interface RobotAssemblyConfig {
  version: 1 | 2;
  nodes: RobotAssemblyNode[];
  ports?: RobotAssemblyPort[];
  edges: RobotAssemblyEdge[];
  harnesses?: RobotAssemblyHarness[];
  controlMappings: RobotControlMapping[];
}

export type RobotActionButtonStepKind = "servo.move" | "motor.set" | "motor.stop" | "wait" | "parallel";

export interface RobotActionButtonStep {
  id: string;
  kind: RobotActionButtonStepKind;
  label: string;
  pluginInstanceId?: string;
  angleDeg?: number;
  speedRaw?: number;
  acc?: number;
  speedPercent?: number;
  stopMode?: "coast" | "brake";
  durationMs?: number;
  steps?: RobotActionButtonStep[];
}

export interface RobotActionButton {
  id: string;
  name: string;
  color: string;
  icon: string;
  confirmRequired: boolean;
  timeoutMs: number;
  steps: RobotActionButtonStep[];
}

export type RobotProgramTarget = "pc";

export interface RobotProgram {
  id: string;
  name: string;
  target: RobotProgramTarget;
  blocklyWorkspaceJson: Record<string, unknown> | null;
  workflow: WorkflowDefinition;
  timeoutMs: number;
  updatedAt?: number;
}

export interface RobotConfig {
  assembly?: RobotAssemblyConfig;
  actionButtons?: RobotActionButton[];
  programs?: RobotProgram[];
  [key: string]: unknown;
}

export interface RobotDefinition {
  id: string;
  name: string;
  componentIds: string[];
  pluginInstanceIds: string[];
  config: RobotConfig;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface ArchitectureSnapshot {
  catalog: DeviceCatalogItem[];
  pluginInstances: PluginInstance[];
  components: ComponentDefinition[];
  robots: RobotDefinition[];
  panelLayouts: Record<string, PanelLayoutItem[]>;
}

export interface CatalogFilter {
  type?: CapabilityId | "";
  brand?: string;
  model?: string;
  query?: string;
}

export interface DriverLibraryItem {
  packageId: string;
  packageName: string;
  driverId: string;
  name: string;
  version: string;
  type: CapabilityId;
  transportIds: string[];
  protocol?: string;
  sourceFile: string;
  description?: string;
}

export interface DriverLibraryFilter {
  type?: CapabilityId | "";
  query?: string;
}

export interface DeviceCodeLibraryItem {
  id: string;
  catalogItemId: string;
  type: CapabilityId;
  brand: string;
  model: string;
  displayName: string;
  packageId: string;
  packageName: string;
  driverId: string;
  driverName: string;
  version: string;
  transportId: string;
  transportIds: string[];
  protocol?: string;
  sourceFile: string;
  tags: string[];
}

export interface DeviceCodeLibraryFilter {
  type?: CapabilityId | "";
  brand?: string;
  model?: string;
  query?: string;
}

export interface PluginUsage {
  ownerKind: "component" | "robot";
  ownerId: string;
  ownerName: string;
}

export const BUILTIN_DEVICE_CATALOG_ITEMS: DeviceCatalogItem[] = [
  {
    id: "catalog.feetech.sts3215",
    type: "servo",
    brand: "Feetech",
    model: "STS3215",
    displayName: "Feetech STS3215 Servo",
    driverId: "driver.feetech-servo",
    transportId: "transport.web-serial",
    capabilities: [{ id: "servo", features: ["position_control", "wheel_speed_control", "torque_control", "feedback"] }],
    configSchema: [
      { id: "servoId", label: "ID", kind: "number", required: true, min: 0, max: 253, step: 1 },
      { id: "minDeg", label: "Min Angle", kind: "number", min: 0, max: 360, step: 1 },
      { id: "maxDeg", label: "Max Angle", kind: "number", min: 0, max: 360, step: 1 },
      {
        id: "direction",
        label: "Direction",
        kind: "select",
        options: [
          { label: "Normal", value: 1 },
          { label: "Reverse", value: -1 }
        ]
      }
    ],
    defaultConfig: { servoId: 1, minDeg: 0, maxDeg: 360, direction: 1 },
    tags: ["servo", "ttl", "feetech"]
  },
  {
    id: "catalog.feetech.scservo",
    type: "servo",
    brand: "Feetech",
    model: "STS/SCS Generic",
    displayName: "Feetech STS/SCS Generic Servo",
    driverId: "driver.feetech-servo",
    transportId: "transport.web-serial",
    capabilities: [{ id: "servo", features: ["position_control", "wheel_speed_control", "torque_control", "feedback"] }],
    configSchema: [
      { id: "servoId", label: "ID", kind: "number", required: true, min: 0, max: 253, step: 1 },
      { id: "minDeg", label: "Min Angle", kind: "number", min: 0, max: 360, step: 1 },
      { id: "maxDeg", label: "Max Angle", kind: "number", min: 0, max: 360, step: 1 },
      {
        id: "direction",
        label: "Direction",
        kind: "select",
        options: [
          { label: "Normal", value: 1 },
          { label: "Reverse", value: -1 }
        ]
      }
    ],
    defaultConfig: { servoId: 1, minDeg: 0, maxDeg: 360, direction: 1 },
    tags: ["servo", "ttl", "feetech"]
  },
  {
    id: "catalog.asme.asme-se-can-servo",
    type: "servo",
    brand: "ASME",
    model: "ASME-SE",
    displayName: "ASME ASME-SE CAN Servo",
    driverId: "driver.asme-can-servo",
    transportId: "transport.a-board-can1",
    capabilities: [{ id: "servo", features: ["position_control", "feedback", "current_config", "pid_config", "id_config", "can1"] }],
    configSchema: [
      { id: "servoId", label: "ID", kind: "number", required: true, min: 0, max: 253, step: 1 },
      { id: "minDeg", label: "Min Angle", kind: "number", min: 0, max: 360, step: 1 },
      { id: "maxDeg", label: "Max Angle", kind: "number", min: 0, max: 360, step: 1 },
      {
        id: "direction",
        label: "Direction",
        kind: "select",
        options: [
          { label: "Normal", value: 1 },
          { label: "Reverse", value: -1 }
        ]
      },
      {
        id: "bitrateKbps",
        label: "CAN Bitrate",
        kind: "select",
        options: [
          { label: "250 kbit/s", value: 250 },
          { label: "500 kbit/s", value: 500 },
          { label: "1000 kbit/s", value: 1000 }
        ]
      },
      {
        id: "canBus",
        label: "CAN Bus",
        kind: "select",
        options: [{ label: "RoboMaster A CAN1", value: "CAN1" }]
      }
    ],
    defaultConfig: { servoId: 1, minDeg: 0, maxDeg: 360, direction: 1, bitrateKbps: 250, canBus: "CAN1" },
    tags: ["servo", "can", "asme", "asmg-md", "robomaster-a"]
  },
  {
    id: "catalog.toshiba.tb6618-motor",
    type: "motor",
    brand: "Toshiba",
    model: "TB6618 Motor Channel",
    displayName: "TB6618 Motor Channel",
    driverId: "driver.tb6618-motor",
    transportId: "transport.controller-json",
    capabilities: [{ id: "motor", features: ["pwm_control", "direction_control", "open_loop"] }],
    configSchema: [
      { id: "channel", label: "Channel", kind: "select", required: true, options: motorChannelOptions(8) },
      { id: "pwmPin", label: "PWM Pin", kind: "text" },
      { id: "in1Pin", label: "IN1 Pin", kind: "text" },
      { id: "in2Pin", label: "IN2 Pin", kind: "text" },
      { id: "enablePin", label: "Enable Pin", kind: "text" },
      { id: "sensorPin", label: "Sensor Pin", kind: "text" },
      { id: "encoderAPin", label: "Encoder A Pin", kind: "text" },
      { id: "encoderBPin", label: "Encoder B Pin", kind: "text" }
    ],
    defaultConfig: { channel: "M1", pwmPin: "", in1Pin: "", in2Pin: "", enablePin: "", sensorPin: "", encoderAPin: "PA0", encoderBPin: "PA1" },
    tags: ["motor", "pwm", "h-bridge"]
  },
  {
    id: "catalog.wheeltec.g513xl",
    type: "motor",
    brand: "WHEELTEC",
    model: "G513XL",
    displayName: "WHEELTEC G513XL Motor",
    driverId: "driver.tb6618-motor",
    transportId: "transport.controller-json",
    capabilities: [{ id: "motor", features: ["pwm_control", "direction_control", "open_loop"] }],
    configSchema: [
      { id: "channel", label: "Channel", kind: "select", required: true, options: motorChannelOptions(8) },
      { id: "pwmPin", label: "PWM Pin", kind: "text" },
      { id: "in1Pin", label: "IN1 Pin", kind: "text" },
      { id: "in2Pin", label: "IN2 Pin", kind: "text" },
      { id: "enablePin", label: "Enable Pin", kind: "text" },
      { id: "sensorPin", label: "Sensor Pin", kind: "text" },
      { id: "encoderAPin", label: "Encoder A Pin", kind: "text" },
      { id: "encoderBPin", label: "Encoder B Pin", kind: "text" }
    ],
    defaultConfig: { channel: "M1", pwmPin: "PA0", in1Pin: "PB0", in2Pin: "PE12", enablePin: "PD12", sensorPin: "", encoderAPin: "PE4", encoderBPin: "PF0" },
    tags: ["motor", "wheeltec", "pwm", "encoder"]
  },
  {
    id: "catalog.wheeltec.mg540",
    type: "motor",
    brand: "WHEELTEC",
    model: "MG540",
    displayName: "WHEELTEC MG540 Motor",
    driverId: "driver.tb6618-motor",
    transportId: "transport.controller-json",
    capabilities: [{ id: "motor", features: ["pwm_control", "direction_control", "open_loop"] }],
    configSchema: [
      { id: "channel", label: "Channel", kind: "select", required: true, options: motorChannelOptions(8) },
      { id: "pwmPin", label: "PWM Pin", kind: "text" },
      { id: "in1Pin", label: "IN1 Pin", kind: "text" },
      { id: "in2Pin", label: "IN2 Pin", kind: "text" },
      { id: "enablePin", label: "Enable Pin", kind: "text" },
      { id: "sensorPin", label: "Sensor Pin", kind: "text" },
      { id: "encoderAPin", label: "Encoder A Pin", kind: "text" },
      { id: "encoderBPin", label: "Encoder B Pin", kind: "text" }
    ],
    defaultConfig: { channel: "M1", pwmPin: "", in1Pin: "", in2Pin: "", enablePin: "", sensorPin: "", encoderAPin: "PA0", encoderBPin: "PA1" },
    tags: ["motor", "wheeltec", "pwm", "encoder"]
  },
  {
    id: "catalog.generic.camera-gimbal",
    type: "camera",
    brand: "Generic",
    model: "Camera Gimbal",
    displayName: "Generic Camera Gimbal",
    driverId: "driver.camera-gimbal",
    transportId: "transport.controller-json",
    capabilities: [{ id: "camera", features: ["mjpeg_stream", "servo_gimbal"] }],
    configSchema: [
      { id: "streamUrl", label: "Stream URL", kind: "text" },
      { id: "panServoId", label: "Pan Servo ID", kind: "number", min: 0, max: 253, step: 1 },
      { id: "tiltServoId", label: "Tilt Servo ID", kind: "number", min: 0, max: 253, step: 1 },
      { id: "panAngleDeg", label: "Pan Angle", kind: "number", min: 0, max: 360, step: 1 },
      { id: "tiltAngleDeg", label: "Tilt Angle", kind: "number", min: 0, max: 360, step: 1 }
    ],
    defaultConfig: { streamUrl: "http://192.168.55.220:8080/stream", webrtcOfferUrl: "http://192.168.55.220:8080/offer", streamMode: "mjpeg", latencyProfile: "lowLatency", panServoId: 1, tiltServoId: 2, panAngleDeg: 90, tiltAngleDeg: 90 },
    tags: ["camera", "gimbal"]
  },
  {
    id: "catalog.generic.secondary-camera",
    type: "camera",
    brand: "Generic",
    model: "Second Camera",
    displayName: "Generic Second Camera",
    driverId: "driver.secondary-camera",
    transportId: "transport.ssh",
    capabilities: [{ id: "camera", features: ["mjpeg_stream", "secondary_source"] }],
    configSchema: [
      { id: "streamUrl", label: "Stream URL", kind: "text" },
      { id: "devicePath", label: "Device Path", kind: "text" },
      { id: "port", label: "Port", kind: "number", min: 1, max: 65535, step: 1 }
    ],
    defaultConfig: { streamUrl: "http://192.168.55.220:8081/stream", devicePath: "/dev/video1", port: 8081 },
    tags: ["camera", "secondary", "raspberry-pi"]
  },
  {
    id: "catalog.browser.gamepad",
    type: "gamepad",
    brand: "Browser",
    model: "Gamepad API",
    displayName: "Browser Gamepad",
    driverId: "driver.browser-gamepad",
    transportId: "transport.browser-gamepad-api",
    capabilities: [{ id: "gamepad", features: ["drive_input", "camera_gimbal_input", "button_mapping", "live_axes"] }],
    configSchema: [
      { id: "preferredIndex", label: "Preferred Index", kind: "number", min: 0, max: 15, step: 1 },
      {
        id: "preset",
        label: "Preset",
        kind: "select",
        options: [
          { label: "Auto", value: "auto" },
          { label: "Xbox / XInput", value: "xinput" },
          { label: "PlayStation", value: "playstation" },
          { label: "Switch Pro", value: "switchPro" },
          { label: "Generic", value: "generic" }
        ]
      }
    ],
    defaultConfig: { preferredIndex: null, preset: "auto" },
    tags: ["gamepad", "browser", "input"]
  },
  {
    id: "catalog.browser.local-camera",
    type: "camera",
    brand: "Browser",
    model: "Local Camera",
    displayName: "Browser Local Camera",
    driverId: "driver.browser-camera",
    transportId: "transport.browser-media",
    capabilities: [{ id: "camera", features: ["local_media_stream", "browser_camera"] }],
    configSchema: [
      { id: "preferredDeviceId", label: "Preferred Device", kind: "text" },
      { id: "width", label: "Width", kind: "number", min: 1, max: 7680, step: 1 },
      { id: "height", label: "Height", kind: "number", min: 1, max: 4320, step: 1 },
      { id: "fps", label: "FPS", kind: "number", min: 1, max: 240, step: 1 }
    ],
    defaultConfig: { preferredDeviceId: "", width: 640, height: 480, fps: 30 },
    tags: ["camera", "browser", "local", "usb", "webcam"]
  },
  {
    id: "catalog.local.ai-vision",
    type: "ai-vision",
    brand: "Local",
    model: "AI Vision Helper",
    displayName: "Local AI Vision Helper",
    driverId: "driver.ai-vision-helper",
    transportId: "transport.local-helper",
    capabilities: [{ id: "ai-vision", features: ["mjpeg_stream_analysis", "competition_mannequin", "sample_capture", "external_helper"] }],
    configSchema: [
      { id: "sourceId", label: "Source ID", kind: "text", required: true },
      { id: "streamUrl", label: "Stream URL", kind: "text", required: true },
      { id: "label", label: "Label", kind: "text" },
      { id: "helperUrl", label: "Helper URL", kind: "text" }
    ],
    defaultConfig: { sourceId: "main", streamUrl: "http://192.168.55.220:8080/stream", label: "competition_mannequin", helperUrl: "http://127.0.0.1:17353" },
    tags: ["ai", "vision", "local-helper", "competition_mannequin"]
  }
];

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
    .map((instance) => ({
      channel: normalizeMotorChannel(String(instance.config.channel ?? "")),
      name: instance.name,
      pwmPin: stringOrUndefined(instance.config.pwmPin),
      in1Pin: stringOrUndefined(instance.config.in1Pin),
      in2Pin: stringOrUndefined(instance.config.in2Pin),
      enablePin: stringOrUndefined(instance.config.enablePin),
      sensorPin: stringOrUndefined(instance.config.sensorPin),
      encoderAPin: stringOrUndefined(instance.config.encoderAPin),
      encoderBPin: stringOrUndefined(instance.config.encoderBPin)
    }))
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
      const option = (field.options ?? []).find((item) => String(item.value).toLowerCase() === String(value).toLowerCase());
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

function motorChannelOptions(count: number): DeviceConfigOption[] {
  return Array.from({ length: count }, (_, index) => {
    const channel = `M${index + 1}`;
    return { label: channel, value: channel };
  });
}

function driverPackageSourceFile(packageId: string): string {
  const sourceFiles: Record<string, string> = {
    "builtin.camera-gimbal": "plugins/builtin/cameraGimbal.ts",
    "builtin.asme-can-servo": "plugins/builtin/asmeCanServo.ts",
    "builtin.feetech-servo": "plugins/builtin/feetechServo.ts",
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
