import { ServoProfile, currentRawToMilliamps, loadRawToPercent, rawToAngleDeg, servoPhysicalToLogicalAngleWithReverse, speedRawToRpm, voltageRawToVolts } from "@adapters/hardware/protocol";
import { ArmConfig, ArmJointConfig } from "@adapters/persistence/storage";

export const ARM_TEACH_SAMPLE_INTERVAL_MS = 100;
export const ARM_TEACH_SOURCE = "hardware-drag";

export interface ArmTeachJointSample {
  jointId: string;
  servoId: number;
  logicalAngleDeg: number;
  physicalAngleDeg: number;
  positionRaw: number;
  speedRaw?: number;
  speedRpm?: number;
  loadRaw?: number;
  loadPercent?: number;
  voltageRaw?: number;
  voltageV?: number;
  temperatureC?: number;
  currentRaw?: number;
  currentMa?: number;
}

export interface ArmTeachSample {
  tMs: number;
  joints: ArmTeachJointSample[];
}

export interface ArmTeachMetadata {
  taskLabel?: string;
  notes?: string;
  source: typeof ARM_TEACH_SOURCE;
}

export interface ArmTeachTrack {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  sampleIntervalMs: number;
  jointIds: string[];
  servoIds: number[];
  samples: ArmTeachSample[];
  metadata: ArmTeachMetadata;
}

export type ArmTeachTrackDraft = Partial<ArmTeachTrack> & {
  metadata?: Partial<ArmTeachMetadata>;
};

export function createArmTeachTrack(options: {
  id?: string;
  name?: string;
  createdAt?: number;
  updatedAt?: number;
  sampleIntervalMs?: number;
  joints: ArmJointConfig[];
  samples?: ArmTeachSample[];
  notes?: string;
  taskLabel?: string;
}): ArmTeachTrack {
  const now = Date.now();
  const samples = normalizeArmTeachSamples(options.samples ?? [], options.joints);
  const durationMs = samples.length > 0 ? Math.max(...samples.map((sample) => sample.tMs)) : 0;
  return {
    id: options.id ?? createArmTeachTrackId(now),
    name: cleanTrackName(options.name, now),
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
    durationMs,
    sampleIntervalMs: positiveNumber(options.sampleIntervalMs, ARM_TEACH_SAMPLE_INTERVAL_MS),
    jointIds: options.joints.map((joint) => joint.id),
    servoIds: options.joints.map((joint) => joint.servoId),
    samples,
    metadata: {
      source: ARM_TEACH_SOURCE,
      ...(options.taskLabel?.trim() ? { taskLabel: options.taskLabel.trim() } : {}),
      ...(options.notes?.trim() ? { notes: options.notes.trim() } : {})
    }
  };
}

export function normalizeArmTeachTrack(value: unknown, armConfig?: ArmConfig): ArmTeachTrack | null {
  if (!isObject(value)) {
    return null;
  }
  const draft = value as ArmTeachTrackDraft;
  const jointIds = normalizeStringArray(draft.jointIds);
  const servoIds = normalizeNumberArray(draft.servoIds);
  const validJointIds = new Set(armConfig?.joints.map((joint) => joint.id) ?? jointIds);
  const validServoIds = new Set(armConfig?.joints.map((joint) => joint.servoId) ?? servoIds);
  const samples = normalizeArmTeachSamples(draft.samples, undefined, validJointIds, validServoIds);
  if (samples.length === 0 && !Array.isArray(draft.samples)) {
    return null;
  }

  const now = Date.now();
  const createdAt = positiveNumber(draft.createdAt, now);
  const updatedAt = positiveNumber(draft.updatedAt, createdAt);
  const durationMs = positiveNumber(draft.durationMs, samples.length > 0 ? Math.max(...samples.map((sample) => sample.tMs)) : 0);
  return {
    id: typeof draft.id === "string" && draft.id.trim() ? draft.id.trim() : createArmTeachTrackId(createdAt),
    name: cleanTrackName(draft.name, createdAt),
    createdAt,
    updatedAt,
    durationMs,
    sampleIntervalMs: positiveNumber(draft.sampleIntervalMs, ARM_TEACH_SAMPLE_INTERVAL_MS),
    jointIds: armConfig ? armConfig.joints.filter((joint) => jointIds.includes(joint.id) || servoIds.includes(joint.servoId)).map((joint) => joint.id) : jointIds,
    servoIds: armConfig ? armConfig.joints.filter((joint) => jointIds.includes(joint.id) || servoIds.includes(joint.servoId)).map((joint) => joint.servoId) : servoIds,
    samples,
    metadata: {
      source: ARM_TEACH_SOURCE,
      ...(draft.metadata?.taskLabel?.trim() ? { taskLabel: draft.metadata.taskLabel.trim() } : {}),
      ...(draft.metadata?.notes?.trim() ? { notes: draft.metadata.notes.trim() } : {})
    }
  };
}

export function normalizeArmTeachTracks(value: unknown, armConfig?: ArmConfig): ArmTeachTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((track) => normalizeArmTeachTrack(track, armConfig))
    .filter((track): track is ArmTeachTrack => track !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createArmTeachSampleFromFeedback(options: {
  tMs: number;
  joints: ArmJointConfig[];
  servos: ServoProfile[];
  feedbackByServoId: Record<
    number,
    {
      positionRaw?: number;
      speedRaw?: number;
      loadRaw?: number;
      voltageRaw?: number;
      temperatureC?: number;
      currentRaw?: number;
    }
  >;
}): ArmTeachSample | null {
  const servoById = new Map(options.servos.map((servo) => [servo.id, servo]));
  const jointSamples: ArmTeachJointSample[] = [];
  for (const joint of options.joints) {
    const servo = servoById.get(joint.servoId);
    const feedback = options.feedbackByServoId[joint.servoId];
    const positionRaw = feedback?.positionRaw;
    if (!servo || !Number.isFinite(positionRaw)) {
      return null;
    }
    const physicalAngleDeg = rawToAngleDeg(positionRaw!);
    jointSamples.push({
      jointId: joint.id,
      servoId: joint.servoId,
      logicalAngleDeg: servoPhysicalToLogicalAngleWithReverse(servo, physicalAngleDeg, joint.reverse),
      physicalAngleDeg,
      positionRaw: Math.round(positionRaw!),
      ...(feedback.speedRaw === undefined ? {} : { speedRaw: feedback.speedRaw, speedRpm: speedRawToRpm(feedback.speedRaw) }),
      ...(feedback.loadRaw === undefined ? {} : { loadRaw: feedback.loadRaw, loadPercent: loadRawToPercent(feedback.loadRaw) }),
      ...(feedback.voltageRaw === undefined ? {} : { voltageRaw: feedback.voltageRaw, voltageV: voltageRawToVolts(feedback.voltageRaw) }),
      ...(feedback.temperatureC === undefined ? {} : { temperatureC: feedback.temperatureC }),
      ...(feedback.currentRaw === undefined ? {} : { currentRaw: feedback.currentRaw, currentMa: currentRawToMilliamps(feedback.currentRaw) })
    });
  }
  return { tMs: Math.max(0, Math.round(options.tMs)), joints: jointSamples };
}

export function armTeachTrackToJson(track: ArmTeachTrack): string {
  return JSON.stringify(track, null, 2);
}

export function armTeachTrackToJsonl(track: ArmTeachTrack): string {
  return track.samples
    .map((sample) =>
      JSON.stringify({
        trackId: track.id,
        trackName: track.name,
        createdAt: track.createdAt,
        source: track.metadata.source,
        taskLabel: track.metadata.taskLabel ?? "",
        notes: track.metadata.notes ?? "",
        tMs: sample.tMs,
        joints: sample.joints
      })
    )
    .join("\n");
}

export function updateArmTeachTrackMetadata(track: ArmTeachTrack, value: { name?: string; notes?: string; taskLabel?: string }): ArmTeachTrack {
  const updatedAt = Date.now();
  return {
    ...track,
    name: cleanTrackName(value.name ?? track.name, track.createdAt),
    updatedAt,
    metadata: {
      source: ARM_TEACH_SOURCE,
      ...(value.taskLabel?.trim() || track.metadata.taskLabel ? { taskLabel: (value.taskLabel ?? track.metadata.taskLabel ?? "").trim() } : {}),
      ...(value.notes?.trim() || track.metadata.notes ? { notes: (value.notes ?? track.metadata.notes ?? "").trim() } : {})
    }
  };
}

function normalizeArmTeachSamples(
  value: unknown,
  joints?: ArmJointConfig[],
  validJointIds = new Set(joints?.map((joint) => joint.id) ?? []),
  validServoIds = new Set(joints?.map((joint) => joint.servoId) ?? [])
): ArmTeachSample[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((sample) => normalizeArmTeachSample(sample, validJointIds, validServoIds))
    .filter((sample): sample is ArmTeachSample => sample !== null)
    .sort((a, b) => a.tMs - b.tMs);
}

function normalizeArmTeachSample(value: unknown, validJointIds: Set<string>, validServoIds: Set<number>): ArmTeachSample | null {
  if (!isObject(value) || typeof value.tMs !== "number" || !Number.isFinite(value.tMs) || !Array.isArray(value.joints)) {
    return null;
  }
  const joints = value.joints
    .map((joint) => normalizeArmTeachJointSample(joint, validJointIds, validServoIds))
    .filter((joint): joint is ArmTeachJointSample => joint !== null);
  if (joints.length === 0 || joints.length !== value.joints.length) {
    return null;
  }
  return { tMs: Math.max(0, Math.round(value.tMs)), joints };
}

function normalizeArmTeachJointSample(value: unknown, validJointIds: Set<string>, validServoIds: Set<number>): ArmTeachJointSample | null {
  if (!isObject(value)) {
    return null;
  }
  const jointId = typeof value.jointId === "string" ? value.jointId.trim() : "";
  const servoId = Number(value.servoId);
  if (!jointId || !Number.isInteger(servoId) || (validJointIds.size > 0 && !validJointIds.has(jointId)) || (validServoIds.size > 0 && !validServoIds.has(servoId))) {
    return null;
  }
  const logicalAngleDeg = Number(value.logicalAngleDeg);
  const physicalAngleDeg = Number(value.physicalAngleDeg);
  const positionRaw = Number(value.positionRaw);
  if (![logicalAngleDeg, physicalAngleDeg, positionRaw].every(Number.isFinite)) {
    return null;
  }
  const speedRaw = optionalFiniteNumber(value.speedRaw);
  const loadRaw = optionalFiniteNumber(value.loadRaw);
  const voltageRaw = optionalFiniteNumber(value.voltageRaw);
  const temperatureC = optionalFiniteNumber(value.temperatureC);
  const currentRaw = optionalFiniteNumber(value.currentRaw);
  return {
    jointId,
    servoId,
    logicalAngleDeg,
    physicalAngleDeg,
    positionRaw: Math.round(positionRaw),
    ...(speedRaw === undefined ? {} : { speedRaw, speedRpm: optionalFiniteNumber(value.speedRpm) ?? speedRawToRpm(speedRaw) }),
    ...(loadRaw === undefined ? {} : { loadRaw, loadPercent: optionalFiniteNumber(value.loadPercent) ?? loadRawToPercent(loadRaw) }),
    ...(voltageRaw === undefined ? {} : { voltageRaw, voltageV: optionalFiniteNumber(value.voltageV) ?? voltageRawToVolts(voltageRaw) }),
    ...(temperatureC === undefined ? {} : { temperatureC }),
    ...(currentRaw === undefined ? {} : { currentRaw, currentMa: optionalFiniteNumber(value.currentMa) ?? currentRawToMilliamps(currentRaw) })
  };
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanTrackName(value: unknown, timestamp: number): string {
  return typeof value === "string" && value.trim() ? value.trim() : `Teach ${new Date(timestamp).toLocaleString()}`;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function normalizeNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => Number.isInteger(item)) : [];
}

function createArmTeachTrackId(timestamp: number): string {
  return `arm-teach-${timestamp.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
