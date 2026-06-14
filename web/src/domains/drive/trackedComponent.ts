import type { MotorPortMapping, MotorStopMode, MotorTarget } from "@adapters/hardware/protocol";
import { normalizeMotorChannel } from "@adapters/hardware/protocol";
import type { ComponentDefinition, PluginInstance } from "@platform/architectureTypes";
import { DEFAULT_DRIVE_CHANNELS, type DriveChannelConfig, type DriveDirectionConfig, type DriveInputState, mixTrackedDrive } from "@domains/drive/drive";
import { roundedIntegerInRange } from "@shared/normalize";

export const TRACKED_DRIVE_COMPONENT_KIND = "tracked-drive";
export const TRACKED_DEFAULT_MAX_RPM = 6000;
export const TRACKED_DEFAULT_ENCODER_TICKS_PER_REV = 52;

export type TrackedTrackPosition = "leftTrack" | "rightTrack";

export const TRACKED_TRACK_POSITIONS: TrackedTrackPosition[] = ["leftTrack", "rightTrack"];

export const TRACKED_DEFAULT_CHANNELS: Record<TrackedTrackPosition, string> = {
  leftTrack: "M5",
  rightTrack: "M6"
};

export interface TrackedDriveComponentConfig extends Record<string, unknown> {
  tracks: Record<TrackedTrackPosition, string>;
  directions: Record<TrackedTrackPosition, 1 | -1>;
  closedLoop: boolean;
  maxRpm: number;
  encoderTicksPerRev: number;
}

export const DEFAULT_TRACKED_DIRECTIONS: Record<TrackedTrackPosition, 1 | -1> = {
  leftTrack: 1,
  rightTrack: 1
};

export function isTrackedDriveComponent(component: ComponentDefinition | null | undefined): component is ComponentDefinition {
  return component?.kind === TRACKED_DRIVE_COMPONENT_KIND;
}

export function createDefaultTrackedDriveConfig(pluginInstances: PluginInstance[] = []): TrackedDriveComponentConfig {
  const motors = motorPluginInstances(pluginInstances);
  return {
    tracks: Object.fromEntries(
      TRACKED_TRACK_POSITIONS.map((position) => [position, defaultPluginIdForPosition(position, motors)])
    ) as Record<TrackedTrackPosition, string>,
    directions: { ...DEFAULT_TRACKED_DIRECTIONS },
    closedLoop: true,
    maxRpm: TRACKED_DEFAULT_MAX_RPM,
    encoderTicksPerRev: TRACKED_DEFAULT_ENCODER_TICKS_PER_REV
  };
}

export function normalizeTrackedDriveConfig(value: unknown, pluginInstances: PluginInstance[] = []): TrackedDriveComponentConfig {
  const defaults = createDefaultTrackedDriveConfig(pluginInstances);
  const draft = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawTracks = draft.tracks && typeof draft.tracks === "object" && !Array.isArray(draft.tracks)
    ? draft.tracks as Record<string, unknown>
    : {};
  const rawDirections = draft.directions && typeof draft.directions === "object" && !Array.isArray(draft.directions)
    ? draft.directions as Record<string, unknown>
    : {};
  const pluginIds = new Set(motorPluginInstances(pluginInstances).map((plugin) => plugin.id));

  const tracks = { ...defaults.tracks };
  const directions = { ...defaults.directions };
  for (const position of TRACKED_TRACK_POSITIONS) {
    const pluginId = typeof rawTracks[position] === "string" ? rawTracks[position].trim() : "";
    if (pluginId && (pluginIds.size === 0 || pluginIds.has(pluginId))) {
      tracks[position] = pluginId;
    }
    directions[position] = rawDirections[position] === -1 ? -1 : 1;
  }

  return {
    tracks,
    directions,
    closedLoop: draft.closedLoop !== false,
    maxRpm: integerInRange(draft.maxRpm, 1, 30_000, defaults.maxRpm),
    encoderTicksPerRev: integerInRange(draft.encoderTicksPerRev, 1, 100_000, defaults.encoderTicksPerRev)
  };
}

export function trackedDrivePluginIds(config: TrackedDriveComponentConfig): string[] {
  return Array.from(new Set(TRACKED_TRACK_POSITIONS.map((position) => config.tracks[position]).filter(Boolean)));
}

export function trackedDriveChannels(config: TrackedDriveComponentConfig, pluginInstances: PluginInstance[]): DriveChannelConfig {
  const byId = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  return {
    ...DEFAULT_DRIVE_CHANNELS,
    leftTrack: channelForTrack("leftTrack", config, byId),
    rightTrack: channelForTrack("rightTrack", config, byId)
  };
}

export function trackedDriveDirections(config: TrackedDriveComponentConfig): DriveDirectionConfig {
  return {
    leftTrack: config.directions.leftTrack,
    rightTrack: config.directions.rightTrack
  };
}

export function trackedDriveTargets(
  config: TrackedDriveComponentConfig,
  pluginInstances: PluginInstance[],
  input: Pick<DriveInputState, "forward" | "turn">,
  speedLimitPercent: number,
  stopMode?: MotorStopMode
): MotorTarget[] {
  return mixTrackedDrive(input, {
    channels: trackedDriveChannels(config, pluginInstances),
    directions: trackedDriveDirections(config),
    speedLimitPercent
  }).map((target) => ({
    ...target,
    stopMode,
    closedLoop: config.closedLoop
  }));
}

export function trackedDriveMotorConfigMappings(config: TrackedDriveComponentConfig, pluginInstances: PluginInstance[]): MotorPortMapping[] {
  const byId = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  return TRACKED_TRACK_POSITIONS
    .map((position) => byId.get(config.tracks[position]))
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

export function findPrimaryTrackedDriveComponent(components: ComponentDefinition[]): ComponentDefinition | null {
  return components.find(isTrackedDriveComponent) ?? null;
}

export function validateTrackedDriveComponentConfig(component: ComponentDefinition, pluginInstances: PluginInstance[]): string | null {
  if (!isTrackedDriveComponent(component)) {
    return null;
  }
  const config = normalizeTrackedDriveConfig(component.config, pluginInstances);
  const pluginById = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  const ids = TRACKED_TRACK_POSITIONS.map((position) => config.tracks[position]).filter(Boolean);
  if (ids.length !== TRACKED_TRACK_POSITIONS.length) {
    return "tracked-drive component requires two motor plugin instances";
  }
  if (new Set(ids).size !== ids.length) {
    return "tracked-drive component track plugins must be unique";
  }
  for (const pluginId of ids) {
    if (pluginById.get(pluginId)?.type !== "motor") {
      return `tracked-drive component requires motor plugin instances: ${pluginId}`;
    }
  }
  return null;
}

function motorPluginInstances(pluginInstances: PluginInstance[]): PluginInstance[] {
  return pluginInstances.filter((plugin) => plugin.type === "motor");
}

function defaultPluginIdForPosition(position: TrackedTrackPosition, motors: PluginInstance[]): string {
  const channel = TRACKED_DEFAULT_CHANNELS[position];
  return motors.find((plugin) => normalizeMotorChannel(String(plugin.config.channel ?? "")) === channel)?.id ?? "";
}

function channelForTrack(
  position: TrackedTrackPosition,
  config: TrackedDriveComponentConfig,
  pluginById: Map<string, PluginInstance>
): string {
  const plugin = pluginById.get(config.tracks[position]);
  const channel = plugin?.type === "motor" ? normalizeMotorChannel(String(plugin.config.channel ?? "")) : "";
  return channel || TRACKED_DEFAULT_CHANNELS[position];
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return roundedIntegerInRange(value, min, max, fallback);
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
