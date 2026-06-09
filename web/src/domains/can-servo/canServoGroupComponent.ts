import {
  ASMG_MD_DEFAULT_BITRATE_KBPS,
  ASMG_MD_SPEED_MAX,
  asmgMdLogicalAngleToPhysicalDegrees,
  asmgMdLogicalAngleToPositionRaw,
  normalizeAsmgMdBaudKbps,
  normalizeAsmgMdServoId,
  normalizeAsmgMdServoProfile,
  type AsmgMdBaudKbps,
  type AsmgMdServoProfile
} from "@adapters/hardware/asmgMdCanServo";
import { clamp, isValidServoId, servoLogicalSpan } from "@adapters/hardware/protocol";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";

export const CAN_SERVO_GROUP_COMPONENT_KIND = "can-servo-group";
export const CAN_SERVO_GROUP_DEFAULT_SPEED_RAW = 300;

export type CanServoGroupSlot = "servo1" | "servo2" | "servo3" | "servo4";

export const CAN_SERVO_GROUP_SLOTS: CanServoGroupSlot[] = ["servo1", "servo2", "servo3", "servo4"];

export const CAN_SERVO_GROUP_SLOT_LABELS: Record<CanServoGroupSlot, string> = {
  servo1: "Servo 1",
  servo2: "Servo 2",
  servo3: "Servo 3",
  servo4: "Servo 4"
};

export interface CanServoGroupComponentConfig extends Record<string, unknown> {
  servos: Record<CanServoGroupSlot, string>;
}

export type CanServoGroupPositionMap = Partial<Record<CanServoGroupSlot, number>>;

export interface CanServoGroupTarget {
  slot: CanServoGroupSlot;
  pluginInstanceId: string;
  id: number;
  name: string;
  logicalAngleDeg: number;
  physicalAngleDeg: number;
  position: number;
  speed: number;
  bitrateKbps: AsmgMdBaudKbps;
  canBus: string;
}

export function isAsmgMdCanServoPlugin(instance: PluginInstance | null | undefined): instance is PluginInstance {
  return Boolean(instance && instance.type === "servo" && instance.driverId === "driver.asme-can-servo");
}

export function canServoPluginInstances(pluginInstances: PluginInstance[]): PluginInstance[] {
  return pluginInstances.filter(isAsmgMdCanServoPlugin);
}

export function createDefaultCanServoGroupConfig(pluginInstances: PluginInstance[] = []): CanServoGroupComponentConfig {
  const plugins = canServoPluginInstances(pluginInstances);
  return {
    servos: Object.fromEntries(CAN_SERVO_GROUP_SLOTS.map((slot, index) => [slot, plugins[index]?.id ?? ""])) as Record<CanServoGroupSlot, string>
  };
}

export function normalizeCanServoGroupConfig(value: unknown, pluginInstances: PluginInstance[] = []): CanServoGroupComponentConfig {
  const defaults = createDefaultCanServoGroupConfig(pluginInstances);
  const draft = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawServos = draft.servos && typeof draft.servos === "object" && !Array.isArray(draft.servos)
    ? draft.servos as Record<string, unknown>
    : {};
  const pluginIds = new Set(canServoPluginInstances(pluginInstances).map((plugin) => plugin.id));
  const servos = { ...defaults.servos };
  for (const slot of CAN_SERVO_GROUP_SLOTS) {
    const pluginId = typeof rawServos[slot] === "string" ? rawServos[slot].trim() : "";
    if (pluginId && (pluginIds.size === 0 || pluginIds.has(pluginId))) {
      servos[slot] = pluginId;
    }
  }
  return { servos };
}

export function canServoGroupPluginIds(config: CanServoGroupComponentConfig): string[] {
  return Array.from(new Set(CAN_SERVO_GROUP_SLOTS.map((slot) => config.servos[slot]).filter(Boolean)));
}

export function canServoPluginToProfile(instance: PluginInstance): AsmgMdServoProfile | null {
  if (!isAsmgMdCanServoPlugin(instance)) {
    return null;
  }
  const id = Number(instance.config.servoId);
  if (!Number.isInteger(id) || !isValidServoId(id)) {
    return null;
  }
  return normalizeAsmgMdServoProfile({
    id: normalizeAsmgMdServoId(id),
    name: instance.name,
    minDeg: numberOrUndefined(instance.config.minDeg),
    maxDeg: numberOrUndefined(instance.config.maxDeg),
    direction: Number(instance.config.direction) === -1 ? -1 : 1,
    bitrateKbps: normalizeAsmgMdBaudKbps(instance.config.bitrateKbps),
    canBus: String(instance.config.canBus ?? "CAN1").trim() || "CAN1"
  });
}

export function validateCanServoGroupComponentConfig(component: ComponentDefinition, pluginInstances: PluginInstance[]): string | null {
  if (component.kind !== CAN_SERVO_GROUP_COMPONENT_KIND) {
    return null;
  }
  const config = normalizeCanServoGroupConfig(component.config, pluginInstances);
  const pluginById = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  const ids = CAN_SERVO_GROUP_SLOTS.map((slot) => config.servos[slot]).filter(Boolean);
  if (ids.length !== CAN_SERVO_GROUP_SLOTS.length) {
    return "can-servo-group component requires four ASME CAN servo plugin instances";
  }
  if (new Set(ids).size !== ids.length) {
    return "can-servo-group component servo plugins must be unique";
  }
  const profiles: AsmgMdServoProfile[] = [];
  for (const pluginId of ids) {
    const plugin = pluginById.get(pluginId);
    if (!isAsmgMdCanServoPlugin(plugin)) {
      return `can-servo-group component requires ASME CAN servo plugin instances: ${pluginId}`;
    }
    const profile = canServoPluginToProfile(plugin);
    if (!profile) {
      return `can-servo-group component has invalid CAN servo config: ${pluginId}`;
    }
    profiles.push(profile);
  }
  const first = profiles[0];
  if (first && profiles.some((profile) => profile.canBus !== first.canBus || profile.bitrateKbps !== first.bitrateKbps)) {
    return "can-servo-group component requires all servos to use the same CAN bus and bitrate";
  }
  return null;
}

export function canServoGroupTargets(
  config: CanServoGroupComponentConfig,
  pluginInstances: PluginInstance[],
  positions: CanServoGroupPositionMap,
  speedRaw = CAN_SERVO_GROUP_DEFAULT_SPEED_RAW
): CanServoGroupTarget[] {
  const pluginById = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  const speed = integerInRange(speedRaw, 0, ASMG_MD_SPEED_MAX, CAN_SERVO_GROUP_DEFAULT_SPEED_RAW);
  return CAN_SERVO_GROUP_SLOTS.map((slot) => {
    const pluginInstanceId = config.servos[slot];
    const plugin = pluginById.get(pluginInstanceId);
    const profile = plugin ? canServoPluginToProfile(plugin) : null;
    if (!profile) {
      return null;
    }
    const logicalAngleDeg = clamp(Number(positions[slot]), 0, servoLogicalSpan(profile));
    return {
      slot,
      pluginInstanceId,
      id: profile.id,
      name: profile.name,
      logicalAngleDeg,
      physicalAngleDeg: asmgMdLogicalAngleToPhysicalDegrees(profile, logicalAngleDeg),
      position: asmgMdLogicalAngleToPositionRaw(profile, logicalAngleDeg),
      speed,
      bitrateKbps: profile.bitrateKbps ?? ASMG_MD_DEFAULT_BITRATE_KBPS,
      canBus: profile.canBus ?? "CAN1"
    };
  }).filter((target): target is CanServoGroupTarget => target !== null);
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(clamp(number, min, max)) : fallback;
}
