import {
  clamp,
  servoLogicalSpan,
  servoPhysicalToLogicalAngleWithReverse,
  type ServoProfile
} from "@adapters/hardware/protocol";
import { armJointShapeLengthPx, calculateArmSegmentPoses, type ArmConfig, type ArmJointConfig, type ArmPoint } from "@adapters/persistence/storage";

export type ArmTuningSeverity = "danger" | "info" | "ok" | "warning";
export type ArmTuningReason =
  | "currentHigh"
  | "decreaseMotion"
  | "disabled"
  | "feedbackMissing"
  | "increaseMotion"
  | "loadHigh"
  | "positionLag"
  | "stable"
  | "temperatureHigh";

export interface ArmKinematicJointPose {
  jointId: string;
  name: string;
  servoId: number;
  lengthPx: number;
  angleDeg: number;
  neutralDeg: number;
  relativeDeg: number;
  globalDeg: number;
  start: ArmPoint;
  end: ArmPoint;
}

export interface ArmKinematics2d {
  endEffector: ArmPoint;
  joints: ArmKinematicJointPose[];
  origin: ArmPoint;
  totalLengthPx: number;
}

export interface ArmIkSolution {
  config: ArmConfig;
  converged: boolean;
  errorPx: number;
  iterations: number;
  kinematics: ArmKinematics2d;
  movedJointIds: string[];
  reachable: boolean;
  target: ArmPoint;
}

export interface ArmTuningFeedback {
  currentMa?: number;
  currentRaw?: number;
  loadPercent?: number;
  loadRaw?: number;
  moving?: boolean;
  positionDeg?: number;
  speedRaw?: number;
  temperatureC?: number;
}

export interface ArmJointTuningResult {
  acc: number;
  jointId: string;
  name: string;
  positionErrorDeg?: number;
  reasons: ArmTuningReason[];
  servoId: number;
  severity: ArmTuningSeverity;
  speedRaw: number;
  suggestedAcc: number;
  suggestedSpeedRaw: number;
}

export interface ArmTuningReport {
  canProbe: boolean;
  joints: ArmJointTuningResult[];
  status: ArmTuningSeverity;
  suggestedCount: number;
}

interface ArmKinematicsOptions {
  origin?: ArmPoint;
  servos?: ServoProfile[];
}

interface ArmIkOptions extends ArmKinematicsOptions {
  maxIterations?: number;
  tolerancePx?: number;
}

interface ArmTuningOptions {
  servos?: ServoProfile[];
}

interface ArmProbeOptions {
  stepDeg?: number;
  servos?: ServoProfile[];
}

const DEFAULT_ARM_ORIGIN: ArmPoint = { x: 300, y: 250 };
const DEFAULT_IK_MAX_ITERATIONS = 32;
const DEFAULT_IK_TOLERANCE_PX = 2;
const POSITION_ERROR_WARN_DEG = 8;
const POSITION_ERROR_INFO_DEG = 3;
const WARNING_LOAD_RAW = 550;
const DANGER_LOAD_RAW = 700;
const WARNING_LOAD_PERCENT = 55;
const DANGER_LOAD_PERCENT = 70;
const WARNING_CURRENT_RAW = 700;
const DANGER_CURRENT_RAW = 900;
const WARNING_CURRENT_MA = 4550;
const DANGER_CURRENT_MA = 5850;
const WARNING_TEMPERATURE_C = 62;
const DANGER_TEMPERATURE_C = 70;

export function forwardKinematics2d(config: ArmConfig, options: ArmKinematicsOptions = {}): ArmKinematics2d {
  const origin = options.origin ?? DEFAULT_ARM_ORIGIN;
  const joints = config.joints.map((joint) => ({ ...joint, angleDeg: clampJointAngle(joint, options.servos) }));
  const segmentPoses = calculateArmSegmentPoses(joints, origin);
  const poses = segmentPoses.map<ArmKinematicJointPose>((pose) => ({
      jointId: pose.jointId,
      name: pose.name,
      servoId: pose.servoId,
      lengthPx: pose.lengthPx,
      angleDeg: pose.angleDeg,
      neutralDeg: pose.neutralDeg,
      relativeDeg: pose.relativeDeg,
      globalDeg: pose.globalDeg,
      start: { x: pose.startX, y: pose.startY },
      end: { x: pose.endX, y: pose.endY }
    }));

  return {
    endEffector: poses[poses.length - 1]?.end ?? { ...origin },
    joints: poses,
    origin,
    totalLengthPx: joints.reduce((total, joint) => total + armJointShapeLengthPx(joint), 0)
  };
}

export function solvePlanarIk(config: ArmConfig, target: ArmPoint, options: ArmIkOptions = {}): ArmIkSolution {
  const maxIterations = positiveInteger(options.maxIterations, DEFAULT_IK_MAX_ITERATIONS);
  const tolerancePx = positiveNumber(options.tolerancePx, DEFAULT_IK_TOLERANCE_PX);
  let joints = config.joints.map((joint) => ({ ...joint, angleDeg: clampJointAngle(joint, options.servos) }));
  const movableJointIds = new Set(joints.filter((joint) => joint.enabled).map((joint) => joint.id));
  const movedJointIds = new Set<string>();
  const origin = options.origin ?? DEFAULT_ARM_ORIGIN;
  const reachable = distance(origin, target) <= joints.reduce((total, joint) => total + armJointShapeLengthPx(joint), 0) + tolerancePx;
  let iterations = 0;

  for (; iterations < maxIterations; iterations += 1) {
    const current = forwardKinematics2d({ ...config, joints }, options);
    if (distance(current.endEffector, target) <= tolerancePx || movableJointIds.size === 0) {
      break;
    }

    for (let index = joints.length - 1; index >= 0; index -= 1) {
      const joint = joints[index];
      if (!movableJointIds.has(joint.id)) {
        continue;
      }

      const pose = forwardKinematics2d({ ...config, joints }, options);
      const anchor = pose.joints[index]?.start;
      if (!anchor) {
        continue;
      }

      const currentAngle = pointAngleDeg(anchor, pose.endEffector);
      const targetAngle = pointAngleDeg(anchor, target);
      const delta = shortestDeltaDeg(currentAngle, targetAngle);
      if (Math.abs(delta) < 0.01) {
        continue;
      }

      const nextAngle = clamp(joint.angleDeg + delta, 0, jointLogicalSpan(joint, options.servos));
      if (Math.abs(nextAngle - joint.angleDeg) >= 0.01) {
        movedJointIds.add(joint.id);
        joints = joints.map((item) => (item.id === joint.id ? { ...item, angleDeg: nextAngle } : item));
      }
    }
  }

  const kinematics = forwardKinematics2d({ ...config, joints }, options);
  const errorPx = distance(kinematics.endEffector, target);
  return {
    config: { ...config, joints },
    converged: errorPx <= tolerancePx,
    errorPx,
    iterations,
    kinematics,
    movedJointIds: Array.from(movedJointIds),
    reachable,
    target
  };
}

export function analyzeArmTuning(
  config: ArmConfig,
  feedbackByServoId: Record<number, ArmTuningFeedback | undefined>,
  options: ArmTuningOptions = {}
): ArmTuningReport {
  const joints = config.joints.map((joint) => analyzeJointTuning(joint, feedbackByServoId[joint.servoId], options.servos));
  const suggestedCount = joints.filter((joint) => joint.suggestedSpeedRaw !== joint.speedRaw || joint.suggestedAcc !== joint.acc).length;
  return {
    canProbe: config.joints.some((joint) => joint.enabled),
    joints,
    status: summarizeSeverity(joints.map((joint) => joint.severity)),
    suggestedCount
  };
}

export function createArmTuningProbeSequence(config: ArmConfig, options: ArmProbeOptions = {}): ArmConfig[] {
  const stepDeg = positiveNumber(options.stepDeg, 5);
  const sequence: ArmConfig[] = [];

  for (const joint of config.joints) {
    if (!joint.enabled) {
      continue;
    }
    const span = jointLogicalSpan(joint, options.servos);
    const originalAngle = clampJointAngle(joint, options.servos);
    const plusAngle = clamp(originalAngle + stepDeg, 0, span);
    const minusAngle = clamp(originalAngle - stepDeg, 0, span);

    if (Math.abs(plusAngle - originalAngle) >= 0.01) {
      sequence.push(configWithJointAngle(config, joint.id, plusAngle));
    }
    if (Math.abs(minusAngle - originalAngle) >= 0.01) {
      sequence.push(configWithJointAngle(config, joint.id, minusAngle));
    }
    if (sequence.length > 0) {
      sequence.push(configWithJointAngle(config, joint.id, originalAngle));
    }
  }

  return sequence;
}

function analyzeJointTuning(joint: ArmJointConfig, feedback: ArmTuningFeedback | undefined, servos: ServoProfile[] = []): ArmJointTuningResult {
  const base: ArmJointTuningResult = {
    acc: clamp(Math.round(joint.acc), 0, 254),
    jointId: joint.id,
    name: joint.name,
    reasons: [],
    servoId: joint.servoId,
    severity: "ok",
    speedRaw: clamp(Math.round(joint.speedRaw), 0, 4095),
    suggestedAcc: clamp(Math.round(joint.acc), 0, 254),
    suggestedSpeedRaw: clamp(Math.round(joint.speedRaw), 0, 4095)
  };

  if (!joint.enabled) {
    return { ...base, reasons: ["disabled"], severity: "info" };
  }

  if (!feedback || !Number.isFinite(feedback.positionDeg)) {
    return { ...base, reasons: ["feedbackMissing"], severity: "warning" };
  }

  const positionErrorDeg = jointPositionErrorDeg(joint, feedback.positionDeg!, servos);
  const loadLevel = limitLevel(feedback.loadRaw, feedback.loadPercent, WARNING_LOAD_RAW, DANGER_LOAD_RAW, WARNING_LOAD_PERCENT, DANGER_LOAD_PERCENT);
  const currentLevel = limitLevel(feedback.currentRaw, feedback.currentMa, WARNING_CURRENT_RAW, DANGER_CURRENT_RAW, WARNING_CURRENT_MA, DANGER_CURRENT_MA);
  const temperatureLevel = scalarLimitLevel(feedback.temperatureC, WARNING_TEMPERATURE_C, DANGER_TEMPERATURE_C);
  const reasons = new Set<ArmTuningReason>();
  let severity: ArmTuningSeverity = "ok";
  let suggestedSpeedRaw = base.speedRaw;
  let suggestedAcc = base.acc;

  if (temperatureLevel !== "ok") {
    reasons.add("temperatureHigh");
    severity = maxSeverity(severity, temperatureLevel);
  }
  if (currentLevel !== "ok") {
    reasons.add("currentHigh");
    severity = maxSeverity(severity, currentLevel);
  }
  if (loadLevel !== "ok") {
    reasons.add("loadHigh");
    severity = maxSeverity(severity, loadLevel);
  }

  if (severity === "danger") {
    [suggestedSpeedRaw, suggestedAcc] = reduceMotion(base.speedRaw, base.acc, 0.65, 18);
    reasons.add("decreaseMotion");
  } else if (severity === "warning") {
    [suggestedSpeedRaw, suggestedAcc] = reduceMotion(base.speedRaw, base.acc, 0.82, 10);
    reasons.add("decreaseMotion");
  } else if (positionErrorDeg >= POSITION_ERROR_WARN_DEG) {
    [suggestedSpeedRaw, suggestedAcc] = increaseMotion(base.speedRaw, base.acc, feedback.moving === false ? 1.16 : 1.1, feedback.moving === false ? 10 : 6);
    reasons.add("positionLag");
    reasons.add("increaseMotion");
    severity = "warning";
  } else if (positionErrorDeg >= POSITION_ERROR_INFO_DEG) {
    reasons.add("positionLag");
    severity = "info";
  } else {
    reasons.add("stable");
  }

  return {
    ...base,
    positionErrorDeg,
    reasons: Array.from(reasons),
    severity,
    suggestedAcc,
    suggestedSpeedRaw
  };
}

function configWithJointAngle(config: ArmConfig, jointId: string, angleDeg: number): ArmConfig {
  return {
    ...config,
    joints: config.joints.map((joint) => (joint.id === jointId ? { ...joint, angleDeg } : joint))
  };
}

function reduceMotion(speedRaw: number, acc: number, speedScale: number, accDrop: number): [number, number] {
  return [clamp(Math.round(speedRaw * speedScale), 0, 4095), clamp(Math.max(0, acc - accDrop), 0, 254)];
}

function increaseMotion(speedRaw: number, acc: number, speedScale: number, accBump: number): [number, number] {
  return [clamp(Math.max(120, Math.round(speedRaw * speedScale)), 0, 4095), clamp(acc + accBump, 0, 254)];
}

function jointPositionErrorDeg(joint: ArmJointConfig, physicalAngleDeg: number, servos: ServoProfile[]): number {
  const servo = servos.find((item) => item.id === joint.servoId) ?? { id: joint.servoId, name: joint.name };
  const logical = servoPhysicalToLogicalAngleWithReverse(servo, physicalAngleDeg, joint.reverse);
  const span = jointLogicalSpan(joint, servos);
  const direct = Math.abs(logical - joint.angleDeg);
  return span >= 359 ? Math.min(direct, 360 - direct) : direct;
}

function limitLevel(
  rawValue: number | undefined,
  scaledValue: number | undefined,
  rawWarning: number,
  rawDanger: number,
  scaledWarning: number,
  scaledDanger: number
): Exclude<ArmTuningSeverity, "info"> {
  const raw = absoluteFinite(rawValue);
  const scaled = absoluteFinite(scaledValue);
  if ((raw !== undefined && raw >= rawDanger) || (scaled !== undefined && scaled >= scaledDanger)) {
    return "danger";
  }
  if ((raw !== undefined && raw >= rawWarning) || (scaled !== undefined && scaled >= scaledWarning)) {
    return "warning";
  }
  return "ok";
}

function scalarLimitLevel(value: number | undefined, warning: number, danger: number): Exclude<ArmTuningSeverity, "info"> {
  if (!Number.isFinite(value)) {
    return "ok";
  }
  if (value! >= danger) {
    return "danger";
  }
  return value! >= warning ? "warning" : "ok";
}

function summarizeSeverity(severities: ArmTuningSeverity[]): ArmTuningSeverity {
  return severities.reduce<ArmTuningSeverity>((summary, severity) => maxSeverity(summary, severity), "ok");
}

function maxSeverity(a: ArmTuningSeverity, b: ArmTuningSeverity): ArmTuningSeverity {
  const rank: Record<ArmTuningSeverity, number> = { ok: 0, info: 1, warning: 2, danger: 3 };
  return rank[b] > rank[a] ? b : a;
}

function clampJointAngle(joint: ArmJointConfig, servos: ServoProfile[] = []) {
  return clamp(Number.isFinite(joint.angleDeg) ? joint.angleDeg : joint.neutralDeg, 0, jointLogicalSpan(joint, servos));
}

function jointLogicalSpan(joint: ArmJointConfig, servos: ServoProfile[] = []) {
  const servo = servos.find((item) => item.id === joint.servoId);
  return servo ? servoLogicalSpan(servo) : 360;
}

function pointAngleDeg(anchor: ArmPoint, point: ArmPoint): number {
  return radiansToDegrees(Math.atan2(anchor.y - point.y, point.x - anchor.x));
}

function shortestDeltaDeg(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

function distance(a: ArmPoint, b: ArmPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function degreesToRadians(value: number): number {
  return (value / 180) * Math.PI;
}

function radiansToDegrees(value: number): number {
  return (value / Math.PI) * 180;
}

function positiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value! > 0 ? value! : fallback;
}

function absoluteFinite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.abs(value) : undefined;
}
