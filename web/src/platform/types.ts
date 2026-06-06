export type PluginKind = "capability" | "driver" | "transport";

export type CapabilityId = "servo" | "motor" | "camera" | "robot-arm" | "raspberry-pi" | "firmware" | "gamepad" | "gpio" | "sensor";

export type DeviceStatus = "online" | "offline" | "standby" | "error";

export type UiControlKind =
  | "button"
  | "toggle"
  | "slider"
  | "number"
  | "select"
  | "metric"
  | "textarea"
  | "file"
  | "joystick"
  | "cameraView"
  | "localCameraView"
  | "output"
  | "group";

export interface PluginBase {
  id: string;
  kind: PluginKind;
  name: string;
  version: string;
  description?: string;
}

export interface CapabilityAction {
  id: string;
  label: string;
  commandType?: string;
}

export interface CapabilityPlugin extends PluginBase {
  kind: "capability";
  capability: CapabilityId;
  actions: CapabilityAction[];
  stateFields: string[];
}

export interface DriverPlugin extends PluginBase {
  kind: "driver";
  provides: CapabilityId[];
  requiresTransport: string[];
  protocol?: string;
}

export interface TransportPlugin extends PluginBase {
  kind: "transport";
  modes: string[];
}

export type PlatformPlugin = CapabilityPlugin | DriverPlugin | TransportPlugin;

export interface PlatformPluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  provides: string[];
  requires?: string[];
}

export interface PlatformPluginPackage {
  manifest: PlatformPluginManifest;
  plugins: PlatformPlugin[];
  uiPanels?: UiPanelSchema[];
}

export interface ExternalPluginSource {
  id: string;
  label: string;
  path?: string;
  manifest: PlatformPluginManifest;
  enabled: boolean;
}

export interface DeviceCapability {
  id: CapabilityId;
  features: string[];
}

export interface DeviceDescriptor {
  id: string;
  name: string;
  type: CapabilityId;
  driverId: string;
  transportId: string;
  status: DeviceStatus;
  capabilities: DeviceCapability[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DeviceStateSnapshot {
  deviceId: string;
  status: DeviceStatus;
  values: Record<string, string | number | boolean | null>;
  updatedAt?: number;
}

export interface UiControlSchema {
  id: string;
  kind: UiControlKind;
  label: string;
  capability: CapabilityId;
  actionId?: string;
  stateField?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: UiControlOption[];
  controls?: UiControlSchema[];
}

export interface UiControlOption {
  label: string;
  value: string | number | boolean;
}

export interface UiPanelSchema {
  id: string;
  title: string;
  capability: CapabilityId;
  driverId?: string;
  deviceId?: string;
  controls: UiControlSchema[];
}

export interface PlatformEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: number;
  type: string;
  level: "info" | "warn" | "error";
  source: string;
  payload: TPayload;
  createdAt: number;
}
