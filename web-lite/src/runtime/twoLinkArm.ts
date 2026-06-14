import {
  buildServoMoveCommand,
  clamp,
  normalizeServoProfile,
  servoLogicalSpan,
  servoLogicalToPhysicalAngle,
  type PcCommand,
  type ServoProfile
} from "@adapters/hardware/protocol";
import type { LiteArmProfile } from "../robotProfile";
import type { LiteArmJoystickInput } from "./manualControl";

export type LiteArmSign = 1 | -1;

export interface LiteArmPoint {
  x: number;
  z: number;
}

export interface LiteArmRuntimeState {
  target: LiteArmPoint;
  j1LogicalDeg: number;
  j2LogicalDeg: number;
}

export interface LiteArmSolution {
  target: LiteArmPoint;
  requestedTarget: LiteArmPoint;
  shoulderDeg: number;
  elbowDeg: number;
  j1LogicalDeg: number;
  j2LogicalDeg: number;
  j1PhysicalDeg: number;
  j2PhysicalDeg: number;
  j1RawLogicalDeg: number;
  j2RawLogicalDeg: number;
  reachable: boolean;
  withinLimits: boolean;
  limitedByWorkspace: boolean;
  limitedBySlew: boolean;
}

export interface LiteArmStepResult {
  state: LiteArmRuntimeState;
  solution: LiteArmSolution;
  moving: boolean;
}

const EPSILON = 0.000001;

export function normalizeLiteArmProfile(value: unknown, fallback: LiteArmProfile): LiteArmProfile {
  const draft = value && typeof value === "object" ? value as Partial<LiteArmProfile> : {};
  const link1Length = finiteInRange(draft.link1Length, fallback.link1Length, 10, 400);
  const link2Length = finiteInRange(draft.link2Length, fallback.link2Length, 10, 400);
  const minForward = finiteOrDefault(draft.minForward, fallback.minForward);
  const maxForward = finiteOrDefault(draft.maxForward, fallback.maxForward);
  const minHeight = finiteOrDefault(draft.minHeight, fallback.minHeight);
  const maxHeight = finiteOrDefault(draft.maxHeight, fallback.maxHeight);
  return {
    ...fallback,
    ...draft,
    j1ServoId: integerInRange(draft.j1ServoId, fallback.j1ServoId, 1, 253),
    j2ServoId: integerInRange(draft.j2ServoId, fallback.j2ServoId, 1, 253),
    link1Length,
    link2Length,
    forwardSpeedPerSecond: finiteInRange(draft.forwardSpeedPerSecond, fallback.forwardSpeedPerSecond, 1, 500),
    liftSpeedPerSecond: finiteInRange(draft.liftSpeedPerSecond, fallback.liftSpeedPerSecond, 1, 500),
    deadzone: finiteInRange(draft.deadzone, fallback.deadzone, 0, 0.95),
    commandIntervalMs: integerInRange(draft.commandIntervalMs, fallback.commandIntervalMs, 40, 1000),
    maxAngleStepDeg: finiteInRange(draft.maxAngleStepDeg, fallback.maxAngleStepDeg, 0.1, 45),
    minForward: Math.min(minForward, maxForward),
    maxForward: Math.max(minForward, maxForward),
    minHeight: Math.min(minHeight, maxHeight),
    maxHeight: Math.max(minHeight, maxHeight),
    minReachMargin: finiteInRange(draft.minReachMargin, fallback.minReachMargin, 0, Math.max(link1Length, link2Length)),
    maxReachMargin: finiteInRange(draft.maxReachMargin, fallback.maxReachMargin, 0, link1Length + link2Length - 1),
    zeroJ1Deg: finiteInRange(draft.zeroJ1Deg, fallback.zeroJ1Deg, 0, 360),
    zeroJ2Deg: finiteInRange(draft.zeroJ2Deg, fallback.zeroJ2Deg, 0, 360),
    trimJ1Deg: finiteInRange(draft.trimJ1Deg, fallback.trimJ1Deg, -90, 90),
    trimJ2Deg: finiteInRange(draft.trimJ2Deg, fallback.trimJ2Deg, -90, 90),
    j1Sign: normalizeSign(draft.j1Sign, fallback.j1Sign),
    j2Sign: normalizeSign(draft.j2Sign, fallback.j2Sign),
    elbowSign: normalizeSign(draft.elbowSign, fallback.elbowSign),
    speedRaw: integerInRange(draft.speedRaw, fallback.speedRaw, 0, 4095),
    acc: integerInRange(draft.acc, fallback.acc, 0, 254),
    calibrated: draft.calibrated === true
  };
}

export function foldedArmTarget(config: Pick<LiteArmProfile, "link1Length" | "link2Length" | "minForward" | "maxForward" | "minHeight" | "maxHeight">): LiteArmPoint {
  return {
    x: clamp(config.link1Length - config.link2Length, config.minForward, config.maxForward),
    z: clamp(0, config.minHeight, config.maxHeight)
  };
}

export function createLiteArmRuntimeState(config: LiteArmProfile, servos: ServoProfile[]): LiteArmRuntimeState {
  const target = clampArmTarget(foldedArmTarget(config), config).target;
  const solution = solveTwoLinkArmIk(target, config, servos);
  return {
    target: solution.target,
    j1LogicalDeg: solution.j1LogicalDeg,
    j2LogicalDeg: solution.j2LogicalDeg
  };
}

export function solveTwoLinkArmIk(requestedTarget: LiteArmPoint, config: LiteArmProfile, servos: ServoProfile[]): LiteArmSolution {
  const { limitedByWorkspace, target } = clampArmTarget(requestedTarget, config);
  const l1 = positiveLength(config.link1Length);
  const l2 = positiveLength(config.link2Length);
  if (isFoldedTarget(target, l1, l2)) {
    const shoulderDeg = 0;
    const elbowDeg = 180;
    const j1RawLogicalDeg = config.zeroJ1Deg + config.trimJ1Deg;
    const j2RawLogicalDeg = config.zeroJ2Deg + config.trimJ2Deg;
    return solutionFromLogicalAngles({
      config,
      elbowDeg,
      j1LogicalDeg: j1RawLogicalDeg,
      j1RawLogicalDeg,
      j2LogicalDeg: j2RawLogicalDeg,
      j2RawLogicalDeg,
      limitedBySlew: false,
      limitedByWorkspace,
      requestedTarget,
      servos,
      shoulderDeg,
      target
    });
  }
  const r2 = target.x * target.x + target.z * target.z;
  const cosElbow = clamp((r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2), -1, 1);
  const elbowAbsRad = Math.acos(cosElbow);
  const signedElbowRad = config.elbowSign * elbowAbsRad;
  const shoulderRad = Math.atan2(target.z, target.x) - Math.atan2(l2 * Math.sin(signedElbowRad), l1 + l2 * Math.cos(signedElbowRad));
  const shoulderDeg = radiansToDegrees(shoulderRad);
  const elbowDeg = radiansToDegrees(elbowAbsRad);
  const j1RawLogicalDeg = config.zeroJ1Deg + shoulderDeg * config.j1Sign + config.trimJ1Deg;
  const j2RawLogicalDeg = config.zeroJ2Deg + (elbowDeg - 180) * config.elbowSign * config.j2Sign + config.trimJ2Deg;
  return solutionFromLogicalAngles({
    config,
    elbowDeg,
    j1LogicalDeg: j1RawLogicalDeg,
    j1RawLogicalDeg,
    j2LogicalDeg: j2RawLogicalDeg,
    j2RawLogicalDeg,
    limitedBySlew: false,
    limitedByWorkspace,
    requestedTarget,
    servos,
    shoulderDeg,
    target
  });
}

export function applyArmJoystickStep(
  state: LiteArmRuntimeState,
  input: LiteArmJoystickInput,
  dtMs: number,
  config: LiteArmProfile,
  servos: ServoProfile[]
): LiteArmStepResult {
  const forward = axisAfterDeadzone(input.forward, config.deadzone);
  const lift = axisAfterDeadzone(input.lift, config.deadzone);
  const moving = Math.abs(forward) > 0 || Math.abs(lift) > 0;
  const dtSeconds = clamp(Number.isFinite(dtMs) ? dtMs / 1000 : config.commandIntervalMs / 1000, 0, 0.5);
  const requestedTarget = moving
    ? {
        x: state.target.x + forward * config.forwardSpeedPerSecond * dtSeconds,
        z: state.target.z + lift * config.liftSpeedPerSecond * dtSeconds
      }
    : state.target;
  const solution = solveTwoLinkArmIk(requestedTarget, config, servos);
  const limitedSolution = slewSolution(solution, state, config.maxAngleStepDeg, servos, config);
  return {
    moving,
    solution: limitedSolution,
    state: {
      target: solution.target,
      j1LogicalDeg: limitedSolution.j1LogicalDeg,
      j2LogicalDeg: limitedSolution.j2LogicalDeg
    }
  };
}

export function hasArmJoystickMotion(input: LiteArmJoystickInput, deadzone: number): boolean {
  return Math.abs(axisAfterDeadzone(input.forward, deadzone)) > 0 || Math.abs(axisAfterDeadzone(input.lift, deadzone)) > 0;
}

export function buildLiteArmMoveCommand(seq: number, solution: LiteArmSolution, config: LiteArmProfile): PcCommand {
  if (!solution.reachable || !solution.withinLimits) {
    throw new RangeError("arm solution is not safe to send");
  }
  return buildServoMoveCommand(
    seq,
    [
      { id: config.j1ServoId, name: "J1", angleDeg: roundAngle(solution.j1PhysicalDeg), speedRaw: config.speedRaw, acc: config.acc },
      { id: config.j2ServoId, name: "J2", angleDeg: roundAngle(solution.j2PhysicalDeg), speedRaw: config.speedRaw, acc: config.acc }
    ],
    true
  );
}

export function armCommandSignature(solution: LiteArmSolution): string {
  return `${roundAngle(solution.j1PhysicalDeg)}:${roundAngle(solution.j2PhysicalDeg)}`;
}

function clampArmTarget(requestedTarget: LiteArmPoint, config: LiteArmProfile) {
  const l1 = positiveLength(config.link1Length);
  const l2 = positiveLength(config.link2Length);
  const foldedTarget = foldedArmTarget(config);
  if (isFoldedTarget({
    x: finiteOrDefault(requestedTarget.x, 0),
    z: finiteOrDefault(requestedTarget.z, 0)
  }, l1, l2)) {
    return {
      limitedByWorkspace: Math.abs(foldedTarget.x - requestedTarget.x) > 0.001 || Math.abs(foldedTarget.z - requestedTarget.z) > 0.001,
      target: foldedTarget
    };
  }
  const minReach = Math.max(0, Math.abs(l1 - l2) + config.minReachMargin);
  const maxReach = Math.max(minReach, l1 + l2 - config.maxReachMargin);
  let x = clamp(finiteOrDefault(requestedTarget.x, 0), config.minForward, config.maxForward);
  let z = clamp(finiteOrDefault(requestedTarget.z, 0), config.minHeight, config.maxHeight);
  let r = Math.hypot(x, z);
  if (r < EPSILON) {
    x = Math.max(minReach, EPSILON);
    z = 0;
    r = Math.hypot(x, z);
  }
  if (r > maxReach) {
    const scale = maxReach / r;
    x *= scale;
    z *= scale;
  } else if (r < minReach) {
    const scale = minReach / r;
    x *= scale;
    z *= scale;
  }
  x = clamp(x, config.minForward, config.maxForward);
  z = clamp(z, config.minHeight, config.maxHeight);
  const target = { x: roundPosition(x), z: roundPosition(z) };
  return {
    limitedByWorkspace: Math.abs(target.x - requestedTarget.x) > 0.001 || Math.abs(target.z - requestedTarget.z) > 0.001,
    target
  };
}

function isFoldedTarget(target: LiteArmPoint, link1Length: number, link2Length: number): boolean {
  return Math.abs(target.x - (link1Length - link2Length)) <= 0.001 && Math.abs(target.z) <= 0.001;
}

function slewSolution(
  solution: LiteArmSolution,
  state: LiteArmRuntimeState,
  maxStepDeg: number,
  servos: ServoProfile[],
  config: LiteArmProfile
): LiteArmSolution {
  const step = finiteInRange(maxStepDeg, 3, 0.1, 45);
  const j1LogicalDeg = clamp(solution.j1LogicalDeg, state.j1LogicalDeg - step, state.j1LogicalDeg + step);
  const j2LogicalDeg = clamp(solution.j2LogicalDeg, state.j2LogicalDeg - step, state.j2LogicalDeg + step);
  if (Math.abs(j1LogicalDeg - solution.j1LogicalDeg) < 0.001 && Math.abs(j2LogicalDeg - solution.j2LogicalDeg) < 0.001) {
    return solution;
  }
  return solutionFromLogicalAngles({
    config,
    elbowDeg: solution.elbowDeg,
    j1LogicalDeg,
    j1RawLogicalDeg: solution.j1RawLogicalDeg,
    j2LogicalDeg,
    j2RawLogicalDeg: solution.j2RawLogicalDeg,
    limitedBySlew: true,
    limitedByWorkspace: solution.limitedByWorkspace,
    requestedTarget: solution.requestedTarget,
    servos,
    shoulderDeg: solution.shoulderDeg,
    target: solution.target
  });
}

function solutionFromLogicalAngles(options: {
  config: LiteArmProfile;
  elbowDeg: number;
  j1LogicalDeg: number;
  j1RawLogicalDeg: number;
  j2LogicalDeg: number;
  j2RawLogicalDeg: number;
  limitedBySlew: boolean;
  limitedByWorkspace: boolean;
  requestedTarget: LiteArmPoint;
  servos: ServoProfile[];
  shoulderDeg: number;
  target: LiteArmPoint;
}): LiteArmSolution {
  const j1Servo = servoById(options.servos, options.config.j1ServoId);
  const j2Servo = servoById(options.servos, options.config.j2ServoId);
  const j1Span = servoLogicalSpan(j1Servo);
  const j2Span = servoLogicalSpan(j2Servo);
  const j1LogicalDeg = clamp(options.j1LogicalDeg, 0, j1Span);
  const j2LogicalDeg = clamp(options.j2LogicalDeg, 0, j2Span);
  const j1WithinLimits = options.j1RawLogicalDeg >= -EPSILON && options.j1RawLogicalDeg <= j1Span + EPSILON;
  const j2WithinLimits = options.j2RawLogicalDeg >= -EPSILON && options.j2RawLogicalDeg <= j2Span + EPSILON;
  return {
    elbowDeg: roundAngle(options.elbowDeg),
    j1LogicalDeg: roundAngle(j1LogicalDeg),
    j1PhysicalDeg: roundAngle(servoLogicalToPhysicalAngle(j1Servo, j1LogicalDeg)),
    j1RawLogicalDeg: roundAngle(options.j1RawLogicalDeg),
    j2LogicalDeg: roundAngle(j2LogicalDeg),
    j2PhysicalDeg: roundAngle(servoLogicalToPhysicalAngle(j2Servo, j2LogicalDeg)),
    j2RawLogicalDeg: roundAngle(options.j2RawLogicalDeg),
    limitedBySlew: options.limitedBySlew,
    limitedByWorkspace: options.limitedByWorkspace,
    reachable: true,
    requestedTarget: options.requestedTarget,
    shoulderDeg: roundAngle(options.shoulderDeg),
    target: options.target,
    withinLimits: j1WithinLimits && j2WithinLimits
  };
}

function servoById(servos: ServoProfile[], servoId: number): ServoProfile {
  return normalizeServoProfile(servos.find((servo) => servo.id === servoId) ?? { id: servoId, name: `ID${servoId}` });
}

function axisAfterDeadzone(value: number, deadzone: number): number {
  const axis = clamp(Number.isFinite(value) ? value : 0, -1, 1);
  return Math.abs(axis) <= Math.max(0, deadzone) ? 0 : axis;
}

function normalizeSign(value: unknown, fallback: LiteArmSign): LiteArmSign {
  return value === -1 ? -1 : value === 1 ? 1 : fallback;
}

function positiveLength(value: number): number {
  return Math.max(1, Number.isFinite(value) ? value : 1);
}

function finiteOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteInRange(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(finiteOrDefault(value, fallback), min, max);
}

function integerInRange(value: unknown, fallback: number, min: number, max: number): number {
  return clamp(Math.round(finiteOrDefault(value, fallback)), min, max);
}

function radiansToDegrees(value: number): number {
  return (value / Math.PI) * 180;
}

function roundAngle(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundPosition(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
