import type { MotorPortMapping, MotorStopMode, MotorTarget } from "@adapters/hardware/protocol";
import { normalizeMotorChannel } from "@adapters/hardware/protocol";
import type { ComponentDefinition, PluginInstance } from "@platform/architectureTypes";
import { DEFAULT_DRIVE_CHANNELS, type DriveChannelConfig, type DriveDirectionConfig, type DriveInputState, mixMecanumDrive } from "@domains/drive/drive";
import { roundedIntegerInRange } from "@shared/normalize";

export const MECANUM_DRIVE_COMPONENT_KIND = "mecanum-drive";
export const MECANUM_DEFAULT_MAX_RPM = 6000;
export const MECANUM_DEFAULT_ENCODER_TICKS_PER_REV = 52;

export type MecanumWheelPosition = "frontLeft" | "frontRight" | "rearLeft" | "rearRight";

export const MECANUM_WHEEL_POSITIONS: MecanumWheelPosition[] = [
  "frontLeft",
  "frontRight",
  "rearLeft",
  "rearRight"
];

export const MECANUM_DEFAULT_CHANNELS: Record<MecanumWheelPosition, string> = {
  frontLeft: "M3",
  frontRight: "M1",
  rearLeft: "M4",
  rearRight: "M2"
};

export interface MecanumDriveComponentConfig extends Record<string, unknown> {
  wheels: Record<MecanumWheelPosition, string>;
  directions: Record<MecanumWheelPosition, 1 | -1>;
  closedLoop: boolean;
  maxRpm: number;
  encoderTicksPerRev: number;
}

export const DEFAULT_MECANUM_DIRECTIONS: Record<MecanumWheelPosition, 1 | -1> = {
  frontLeft: 1,
  frontRight: 1,
  rearLeft: 1,
  rearRight: 1
};

export function isMecanumDriveComponent(component: ComponentDefinition | null | undefined): component is ComponentDefinition {
  return component?.kind === MECANUM_DRIVE_COMPONENT_KIND;
}

export function createDefaultMecanumDriveConfig(pluginInstances: PluginInstance[] = []): MecanumDriveComponentConfig {
  const motors = motorPluginInstances(pluginInstances);
  return {
    wheels: Object.fromEntries(
      MECANUM_WHEEL_POSITIONS.map((position) => [position, defaultPluginIdForPosition(position, motors)])
    ) as Record<MecanumWheelPosition, string>,
    directions: { ...DEFAULT_MECANUM_DIRECTIONS },
    closedLoop: true,
    maxRpm: MECANUM_DEFAULT_MAX_RPM,
    encoderTicksPerRev: MECANUM_DEFAULT_ENCODER_TICKS_PER_REV
  };
}

export function normalizeMecanumDriveConfig(value: unknown, pluginInstances: PluginInstance[] = []): MecanumDriveComponentConfig {
  const defaults = createDefaultMecanumDriveConfig(pluginInstances);
  const draft = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawWheels = draft.wheels && typeof draft.wheels === "object" && !Array.isArray(draft.wheels)
    ? draft.wheels as Record<string, unknown>
    : {};
  const rawDirections = draft.directions && typeof draft.directions === "object" && !Array.isArray(draft.directions)
    ? draft.directions as Record<string, unknown>
    : {};
  const pluginIds = new Set(motorPluginInstances(pluginInstances).map((plugin) => plugin.id));

  const wheels = { ...defaults.wheels };
  const directions = { ...defaults.directions };
  for (const position of MECANUM_WHEEL_POSITIONS) {
    const pluginId = typeof rawWheels[position] === "string" ? rawWheels[position].trim() : "";
    if (pluginId && (pluginIds.size === 0 || pluginIds.has(pluginId))) {
      wheels[position] = pluginId;
    }
    directions[position] = rawDirections[position] === -1 ? -1 : 1;
  }

  return {
    wheels,
    directions,
    closedLoop: draft.closedLoop !== false,
    maxRpm: integerInRange(draft.maxRpm, 1, 30_000, defaults.maxRpm),
    encoderTicksPerRev: integerInRange(draft.encoderTicksPerRev, 1, 100_000, defaults.encoderTicksPerRev)
  };
}

export function mecanumDrivePluginIds(config: MecanumDriveComponentConfig): string[] {
  return Array.from(new Set(MECANUM_WHEEL_POSITIONS.map((position) => config.wheels[position]).filter(Boolean)));
}

export function mecanumDriveChannels(config: MecanumDriveComponentConfig, pluginInstances: PluginInstance[]): DriveChannelConfig {
  const byId = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  return {
    ...DEFAULT_DRIVE_CHANNELS,
    frontLeft: channelForWheel("frontLeft", config, byId),
    frontRight: channelForWheel("frontRight", config, byId),
    rearLeft: channelForWheel("rearLeft", config, byId),
    rearRight: channelForWheel("rearRight", config, byId)
  };
}

export function mecanumDriveDirections(config: MecanumDriveComponentConfig): DriveDirectionConfig {
  return {
    frontLeft: config.directions.frontLeft,
    frontRight: config.directions.frontRight,
    rearLeft: config.directions.rearLeft,
    rearRight: config.directions.rearRight
  };
}

export function mecanumDriveTargets(
  config: MecanumDriveComponentConfig,
  pluginInstances: PluginInstance[],
  input: Pick<DriveInputState, "forward" | "strafe" | "turn">,
  speedLimitPercent: number,
  stopMode?: MotorStopMode
): MotorTarget[] {
  return mixMecanumDrive(input, {
    channels: mecanumDriveChannels(config, pluginInstances),
    directions: mecanumDriveDirections(config),
    speedLimitPercent
  }).map((target) => ({
    ...target,
    stopMode,
    closedLoop: config.closedLoop
  }));
}

export function mecanumDriveMotorConfigMappings(config: MecanumDriveComponentConfig, pluginInstances: PluginInstance[]): MotorPortMapping[] {
  const byId = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  return MECANUM_WHEEL_POSITIONS
    .map((position) => byId.get(config.wheels[position]))
    .filter((plugin): plugin is PluginInstance => Boolean(plugin && plugin.type === "motor"))
    .map((plugin) => ({
      channel: normalizeMotorChannel(String(plugin.config.channel ?? "")),
      driver: "tb6618" as const,
      pwmPin: String(plugin.config.pwmPin ?? ""),
      in1Pin: String(plugin.config.in1Pin ?? ""),
      in2Pin: String(plugin.config.in2Pin ?? ""),
      enablePin: stringOrUndefined(plugin.config.enablePin),
      sensorPin: stringOrUndefined(plugin.config.sensorPin),
      encoderAPin: stringOrUndefined(plugin.config.encoderAPin),
      encoderBPin: stringOrUndefined(plugin.config.encoderBPin),
      closedLoop: config.closedLoop,
      maxRpm: config.maxRpm,
      encoderTicksPerRev: config.encoderTicksPerRev
    }))
    .filter((mapping) => mapping.channel && mapping.pwmPin.trim() && mapping.in1Pin.trim() && mapping.in2Pin.trim());
}

export function findPrimaryMecanumDriveComponent(components: ComponentDefinition[]): ComponentDefinition | null {
  return components.find(isMecanumDriveComponent) ?? null;
}

export function validateMecanumDriveComponentConfig(component: ComponentDefinition, pluginInstances: PluginInstance[]): string | null {
  if (!isMecanumDriveComponent(component)) {
    return null;
  }
  const config = normalizeMecanumDriveConfig(component.config, pluginInstances);
  const pluginById = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  const ids = MECANUM_WHEEL_POSITIONS.map((position) => config.wheels[position]).filter(Boolean);
  if (ids.length !== MECANUM_WHEEL_POSITIONS.length) {
    return "mecanum-drive component requires four motor plugin instances";
  }
  if (new Set(ids).size !== ids.length) {
    return "mecanum-drive component wheel plugins must be unique";
  }
  for (const pluginId of ids) {
    if (pluginById.get(pluginId)?.type !== "motor") {
      return `mecanum-drive component requires motor plugin instances: ${pluginId}`;
    }
  }
  return null;
}

function motorPluginInstances(pluginInstances: PluginInstance[]): PluginInstance[] {
  return pluginInstances.filter((plugin) => plugin.type === "motor");
}

function defaultPluginIdForPosition(position: MecanumWheelPosition, motors: PluginInstance[]): string {
  const channel = MECANUM_DEFAULT_CHANNELS[position];
  return motors.find((plugin) => normalizeMotorChannel(String(plugin.config.channel ?? "")) === channel)?.id ?? "";
}

function channelForWheel(
  position: MecanumWheelPosition,
  config: MecanumDriveComponentConfig,
  pluginById: Map<string, PluginInstance>
): string {
  const plugin = pluginById.get(config.wheels[position]);
  const channel = plugin?.type === "motor" ? normalizeMotorChannel(String(plugin.config.channel ?? "")) : "";
  return channel || MECANUM_DEFAULT_CHANNELS[position];
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return roundedIntegerInRange(value, min, max, fallback);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
