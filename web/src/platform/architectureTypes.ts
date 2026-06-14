import type { CapabilityId, DeviceCapability } from "@platform/types";
import type { PanelLayoutItem } from "@platform/panelLayoutCore";
import type { WorkflowDefinition } from "@platform/workflow";

export type DeviceConfigValue = string | number | boolean | null;
export type DeviceConfig = Record<string, DeviceConfigValue>;
export type ComponentKind = "custom" | "robot-arm" | "tracked-drive" | "mecanum-drive" | "can-servo-group";
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

export type RobotActionButtonStepKind = "servo.move" | "servo.pose" | "motor.set" | "motor.stop" | "wait" | "parallel";

export interface RobotActionButtonServoTarget {
  id: string;
  pluginInstanceId: string;
  angleDeg: number;
  enabled: boolean;
}

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
  targets?: RobotActionButtonServoTarget[];
}

export interface RobotActionButton {
  id: string;
  name: string;
  color: string;
  icon: string;
  triggerKey?: string;
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
