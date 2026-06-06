import { clamp, servoLogicalSpan, type ServoProfile } from "../../lib/protocol";
import type { ArmConfig, ArmJointConfig, ArmPoint } from "../../lib/storage";

export type ComponentArmAutoMode = "manual" | "ik";
export type ComponentArmIkSendMode = "preview" | "live";

export interface ComponentArmTrajectoryJointSample {
  jointId: string;
  servoId: number;
  logicalAngleDeg: number;
}

export interface ComponentArmTrajectorySample {
  tMs: number;
  joints: ComponentArmTrajectoryJointSample[];
}

export interface ComponentArmTrajectoryArchive {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  sampleIntervalMs: number;
  durationMs: number;
  target?: ArmPoint;
  jointIds: string[];
  servoIds: number[];
  samples: ComponentArmTrajectorySample[];
}

export interface ComponentArmAutoConfig {
  mode: ComponentArmAutoMode;
  sendMode: ComponentArmIkSendMode;
  correctionEnabled: boolean;
  target?: ArmPoint;
  archives: ComponentArmTrajectoryArchive[];
}

export const COMPONENT_ARM_AUTO_SAMPLE_INTERVAL_MS = 100;

export function defaultComponentArmAutoConfig(): ComponentArmAutoConfig {
  return {
    mode: "manual",
    sendMode: "preview",
    correctionEnabled: false,
    archives: []
  };
}

export function normalizeComponentArmAutoConfig(value: unknown, armConfig: ArmConfig): ComponentArmAutoConfig {
  if (!isObject(value)) {
    return defaultComponentArmAutoConfig();
  }
  const draft = value as Partial<ComponentArmAutoConfig>;
  const archives = Array.isArray(draft.archives)
    ? draft.archives
        .map((archive) => normalizeComponentArmTrajectoryArchive(archive, armConfig))
        .filter((archive): archive is ComponentArmTrajectoryArchive => archive !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt)
    : [];
  return {
    mode: draft.mode === "ik" ? "ik" : "manual",
    sendMode: draft.sendMode === "live" ? "live" : "preview",
    correctionEnabled: false,
    ...(normalizePoint(draft.target) ? { target: normalizePoint(draft.target)! } : {}),
    archives
  };
}

export function createComponentArmTrajectorySample(config: ArmConfig, tMs: number, servos: ServoProfile[] = []): ComponentArmTrajectorySample {
  return {
    tMs: Math.max(0, Math.round(Number.isFinite(tMs) ? tMs : 0)),
    joints: config.joints.map((joint) => ({
      jointId: joint.id,
      servoId: joint.servoId,
      logicalAngleDeg: clamp(joint.angleDeg, 0, jointLogicalSpan(joint, servos))
    }))
  };
}

export function createComponentArmTrajectoryArchive(options: {
  id?: string;
  name?: string;
  notes?: string;
  samples: ComponentArmTrajectorySample[];
  target?: ArmPoint;
  armConfig: ArmConfig;
  createdAt?: number;
  updatedAt?: number;
  sampleIntervalMs?: number;
}): ComponentArmTrajectoryArchive {
  const createdAt = positiveNumber(options.createdAt, Date.now());
  const updatedAt = positiveNumber(options.updatedAt, createdAt);
  const samples = normalizeComponentArmTrajectorySamples(options.samples, options.armConfig);
  const jointIds = jointIdsForSamples(options.armConfig, samples);
  return {
    id: options.id?.trim() || createComponentArmTrajectoryArchiveId(createdAt),
    name: cleanArchiveName(options.name, createdAt),
    createdAt,
    updatedAt,
    ...(options.notes?.trim() ? { notes: options.notes.trim() } : {}),
    sampleIntervalMs: positiveNumber(options.sampleIntervalMs, COMPONENT_ARM_AUTO_SAMPLE_INTERVAL_MS),
    durationMs: samples.length > 0 ? Math.max(...samples.map((sample) => sample.tMs)) : 0,
    ...(options.target ? { target: { ...options.target } } : {}),
    jointIds,
    servoIds: jointIds.map((jointId) => options.armConfig.joints.find((joint) => joint.id === jointId)?.servoId).filter((servoId): servoId is number => Number.isInteger(servoId)),
    samples
  };
}

export function applyComponentArmTrajectorySample(config: ArmConfig, sample: ComponentArmTrajectorySample, servos: ServoProfile[] = []): ArmConfig {
  const sampleByJointId = new Map(sample.joints.map((joint) => [joint.jointId, joint]));
  return {
    ...config,
    selectedJointId: sample.joints[0]?.jointId ?? config.selectedJointId,
    joints: config.joints.map((joint) => {
      const recorded = sampleByJointId.get(joint.id);
      return recorded && recorded.servoId === joint.servoId
        ? { ...joint, angleDeg: clamp(recorded.logicalAngleDeg, 0, jointLogicalSpan(joint, servos)) }
        : joint;
    })
  };
}

export function shouldScheduleComponentArmIkLiveMove(autoConfig: ComponentArmAutoConfig, config: ArmConfig): boolean {
  return autoConfig.mode === "ik" && autoConfig.sendMode === "live" && config.liveDragEnabled;
}

export function upsertComponentArmTrajectoryArchive(archives: ComponentArmTrajectoryArchive[], archive: ComponentArmTrajectoryArchive): ComponentArmTrajectoryArchive[] {
  return [archive, ...archives.filter((item) => item.id !== archive.id)].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteComponentArmTrajectoryArchive(archives: ComponentArmTrajectoryArchive[], archiveId: string): ComponentArmTrajectoryArchive[] {
  return archives.filter((archive) => archive.id !== archiveId);
}

function normalizeComponentArmTrajectoryArchive(value: unknown, armConfig: ArmConfig): ComponentArmTrajectoryArchive | null {
  if (!isObject(value)) {
    return null;
  }
  const draft = value as Partial<ComponentArmTrajectoryArchive>;
  const createdAt = positiveNumber(draft.createdAt, Date.now());
  const updatedAt = positiveNumber(draft.updatedAt, createdAt);
  const samples = normalizeComponentArmTrajectorySamples(draft.samples, armConfig);
  if (samples.length === 0) {
    return null;
  }
  const jointIds = jointIdsForSamples(armConfig, samples);
  return {
    id: typeof draft.id === "string" && draft.id.trim() ? draft.id.trim() : createComponentArmTrajectoryArchiveId(createdAt),
    name: cleanArchiveName(draft.name, createdAt),
    createdAt,
    updatedAt,
    ...(typeof draft.notes === "string" && draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    sampleIntervalMs: positiveNumber(draft.sampleIntervalMs, COMPONENT_ARM_AUTO_SAMPLE_INTERVAL_MS),
    durationMs: positiveNumber(draft.durationMs, Math.max(...samples.map((sample) => sample.tMs))),
    ...(normalizePoint(draft.target) ? { target: normalizePoint(draft.target)! } : {}),
    jointIds,
    servoIds: jointIds.map((jointId) => armConfig.joints.find((joint) => joint.id === jointId)?.servoId).filter((servoId): servoId is number => Number.isInteger(servoId)),
    samples
  };
}

function normalizeComponentArmTrajectorySamples(value: unknown, armConfig: ArmConfig): ComponentArmTrajectorySample[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const jointById = new Map(armConfig.joints.map((joint) => [joint.id, joint]));
  return value
    .map((sample) => normalizeComponentArmTrajectorySample(sample, jointById))
    .filter((sample): sample is ComponentArmTrajectorySample => sample !== null)
    .sort((a, b) => a.tMs - b.tMs);
}

function normalizeComponentArmTrajectorySample(value: unknown, jointById: Map<string, ArmJointConfig>): ComponentArmTrajectorySample | null {
  if (!isObject(value) || !Array.isArray(value.joints)) {
    return null;
  }
  const joints = value.joints
    .map((joint) => normalizeComponentArmTrajectoryJointSample(joint, jointById))
    .filter((joint): joint is ComponentArmTrajectoryJointSample => joint !== null);
  if (joints.length === 0) {
    return null;
  }
  return {
    tMs: Math.max(0, Math.round(Number(value.tMs) || 0)),
    joints
  };
}

function normalizeComponentArmTrajectoryJointSample(value: unknown, jointById: Map<string, ArmJointConfig>): ComponentArmTrajectoryJointSample | null {
  if (!isObject(value)) {
    return null;
  }
  const jointId = typeof value.jointId === "string" ? value.jointId.trim() : "";
  const servoId = Number(value.servoId);
  const logicalAngleDeg = Number(value.logicalAngleDeg);
  const joint = jointById.get(jointId);
  if (!joint || joint.servoId !== servoId || !Number.isFinite(logicalAngleDeg)) {
    return null;
  }
  return {
    jointId,
    servoId,
    logicalAngleDeg: clamp(logicalAngleDeg, 0, jointLogicalSpan(joint))
  };
}

function jointIdsForSamples(config: ArmConfig, samples: ComponentArmTrajectorySample[]): string[] {
  const recordedIds = new Set(samples.flatMap((sample) => sample.joints.map((joint) => joint.jointId)));
  return config.joints.filter((joint) => recordedIds.has(joint.id)).map((joint) => joint.id);
}

function jointLogicalSpan(joint: ArmJointConfig, servos: ServoProfile[] = []): number {
  const servo = servos.find((item) => item.id === joint.servoId);
  return servo ? servoLogicalSpan(servo) : 360;
}

function normalizePoint(value: unknown): ArmPoint | null {
  if (!isObject(value)) {
    return null;
  }
  const x = Number(value.x);
  const y = Number(value.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function cleanArchiveName(value: unknown, timestamp: number): string {
  return typeof value === "string" && value.trim() ? value.trim() : `IK ${new Date(timestamp).toLocaleString()}`;
}

function createComponentArmTrajectoryArchiveId(timestamp: number): string {
  return `component-arm-trajectory-${timestamp.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}
