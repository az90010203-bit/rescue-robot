import {
  DEFAULT_WHEEL_SPEED_LIMIT,
  buildServoMoveCommand,
  buildServoSpeedCommand,
  clamp,
  normalizeServoProfile,
  servoLogicalSpan,
  servoLogicalToPhysicalAngle,
  type PcCommand,
  type ServoProfile
} from "@adapters/hardware/protocol";
import type { MachineClawTestConfig } from "@domains/machine-claw/machineClaw";
import { MACHINE_CLAW_SERVO_IDS } from "@domains/machine-claw/machineClaw";
import type { LiteArmProfile } from "../robotProfile";
import type { LiteArmJoystickInput, LiteFourAxisArmJoystickInput } from "./manualControl";

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

export interface LiteFourAxisArmPose extends LiteArmPoint {
  toolPitchDeg: number;
  wristRollDeg: number;
}

export interface LiteFourAxisArmRuntimeState {
  target: LiteFourAxisArmPose;
  j1LogicalDeg: number;
  j2LogicalDeg: number;
}

export interface LiteFourAxisPoseLock {
  toolPitchDeg: number;
  wristRollDeg: number;
  z: number;
}

export interface LiteFourAxisWristPoseFeedback {
  pitchLocalDeg: number;
  rollDeg: number;
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

export interface LiteArmGravityCompensation {
  enabled: boolean;
  j1TorqueNm: number;
  j2TorqueNm: number;
  j1BiasDeg: number;
  j2BiasDeg: number;
  j1AppliedBiasDeg: number;
  j2AppliedBiasDeg: number;
  j1CompensatedLogicalDeg: number;
  j2CompensatedLogicalDeg: number;
  j1CompensatedPhysicalDeg: number;
  j2CompensatedPhysicalDeg: number;
  limited: boolean;
}

export interface LiteFourAxisArmSolution {
  arm: LiteArmSolution;
  forearmAbsDeg: number;
  requestedTarget: LiteFourAxisArmPose;
  target: LiteFourAxisArmPose;
  wristPitchLocalDeg: number;
  wristTarget: LiteArmPoint;
}

export interface LiteArmStepResult {
  state: LiteArmRuntimeState;
  solution: LiteArmSolution;
  moving: boolean;
}

export interface LiteFourAxisArmStepResult {
  armMoving: boolean;
  moving: boolean;
  solution: LiteFourAxisArmSolution;
  state: LiteFourAxisArmRuntimeState;
  wristMoving: boolean;
}

export interface LiteFourAxisWristSpeedTarget {
  acc: number;
  id: number;
  name: string;
  speedRaw: number;
}

const EPSILON = 0.000001;
const GRAVITY_M_PER_SECOND2 = 9.80665;
const WRIST_POSE_HOLD_DEADBAND_DEG = 0.8;
const WRIST_POSE_HOLD_GAIN_RAW_PER_DEG = 8;

export function normalizeLiteArmProfile(value: unknown, fallback: LiteArmProfile): LiteArmProfile {
  const draft = value && typeof value === "object" ? value as Partial<LiteArmProfile> : {};
  const link1Length = finiteInRange(draft.link1Length, fallback.link1Length, 10, 400);
  const link2Length = finiteInRange(draft.link2Length, fallback.link2Length, 10, 400);
  const minForward = finiteOrDefault(draft.minForward, fallback.minForward);
  const maxForward = finiteOrDefault(draft.maxForward, fallback.maxForward);
  const minHeight = finiteOrDefault(draft.minHeight, fallback.minHeight);
  const maxHeight = finiteOrDefault(draft.maxHeight, fallback.maxHeight);
  const toolPitchMinDeg = finiteOrDefault(draft.toolPitchMinDeg, fallback.toolPitchMinDeg);
  const toolPitchMaxDeg = finiteOrDefault(draft.toolPitchMaxDeg, fallback.toolPitchMaxDeg);
  const wristRollMinDeg = finiteOrDefault(draft.wristRollMinDeg, fallback.wristRollMinDeg);
  const wristRollMaxDeg = finiteOrDefault(draft.wristRollMaxDeg, fallback.wristRollMaxDeg);
  return {
    ...fallback,
    ...draft,
    j1ServoId: integerInRange(draft.j1ServoId, fallback.j1ServoId, 1, 253),
    j2ServoId: integerInRange(draft.j2ServoId, fallback.j2ServoId, 1, 253),
    link1Length,
    link2Length,
    forwardSpeedPerSecond: finiteInRange(draft.forwardSpeedPerSecond, fallback.forwardSpeedPerSecond, 1, 500),
    liftSpeedPerSecond: finiteInRange(draft.liftSpeedPerSecond, fallback.liftSpeedPerSecond, 1, 500),
    toolPitchSpeedDegPerSecond: finiteInRange(draft.toolPitchSpeedDegPerSecond, fallback.toolPitchSpeedDegPerSecond, 1, 360),
    wristRollSpeedDegPerSecond: finiteInRange(draft.wristRollSpeedDegPerSecond, fallback.wristRollSpeedDegPerSecond, 1, 720),
    deadzone: finiteInRange(draft.deadzone, fallback.deadzone, 0, 0.95),
    commandIntervalMs: integerInRange(draft.commandIntervalMs, fallback.commandIntervalMs, 40, 1000),
    maxAngleStepDeg: finiteInRange(draft.maxAngleStepDeg, fallback.maxAngleStepDeg, 0.1, 45),
    minForward: Math.min(minForward, maxForward),
    maxForward: Math.max(minForward, maxForward),
    minHeight: Math.min(minHeight, maxHeight),
    maxHeight: Math.max(minHeight, maxHeight),
    toolLengthMm: finiteInRange(draft.toolLengthMm, fallback.toolLengthMm, 0, 250),
    toolPitchMinDeg: Math.min(toolPitchMinDeg, toolPitchMaxDeg),
    toolPitchMaxDeg: Math.max(toolPitchMinDeg, toolPitchMaxDeg),
    wristRollMinDeg: Math.min(wristRollMinDeg, wristRollMaxDeg),
    wristRollMaxDeg: Math.max(wristRollMinDeg, wristRollMaxDeg),
    minReachMargin: finiteInRange(draft.minReachMargin, fallback.minReachMargin, 0, Math.max(link1Length, link2Length)),
    maxReachMargin: finiteInRange(draft.maxReachMargin, fallback.maxReachMargin, 0, link1Length + link2Length - 1),
    zeroJ1Deg: finiteInRange(draft.zeroJ1Deg, fallback.zeroJ1Deg, 0, 360),
    zeroJ2Deg: finiteInRange(draft.zeroJ2Deg, fallback.zeroJ2Deg, 0, 360),
    wristZeroRaw21: integerInRange(draft.wristZeroRaw21, fallback.wristZeroRaw21, 0, 4095),
    wristZeroRaw22: integerInRange(draft.wristZeroRaw22, fallback.wristZeroRaw22, 0, 4095),
    wristZeroRaw23: integerInRange(draft.wristZeroRaw23, fallback.wristZeroRaw23, 0, 4095),
    wristZeroPitchLocalDeg: finiteInRange(draft.wristZeroPitchLocalDeg, fallback.wristZeroPitchLocalDeg, -1080, 1080),
    wristZeroRollDeg: finiteInRange(draft.wristZeroRollDeg, fallback.wristZeroRollDeg, -1080, 1080),
    trimJ1Deg: finiteInRange(draft.trimJ1Deg, fallback.trimJ1Deg, -90, 90),
    trimJ2Deg: finiteInRange(draft.trimJ2Deg, fallback.trimJ2Deg, -90, 90),
    j1Sign: normalizeSign(draft.j1Sign, fallback.j1Sign),
    j2Sign: normalizeSign(draft.j2Sign, fallback.j2Sign),
    elbowSign: normalizeSign(draft.elbowSign, fallback.elbowSign),
    pitchDegPerTurn: finiteInRange(draft.pitchDegPerTurn, fallback.pitchDegPerTurn, 1, 1080),
    rollDegPerTurn: finiteInRange(draft.rollDegPerTurn, fallback.rollDegPerTurn, 1, 1080),
    rotationClawFollowRatio: finiteInRange(draft.rotationClawFollowRatio, fallback.rotationClawFollowRatio, -3, 3),
    wristSpeedRaw: integerInRange(draft.wristSpeedRaw, fallback.wristSpeedRaw, 0, DEFAULT_WHEEL_SPEED_LIMIT),
    gravityCompensationEnabled: draft.gravityCompensationEnabled === true,
    link1MassG: finiteInRange(draft.link1MassG, fallback.link1MassG, 0, 2000),
    link2MassG: finiteInRange(draft.link2MassG, fallback.link2MassG, 0, 2000),
    endEffectorMassG: finiteInRange(draft.endEffectorMassG, fallback.endEffectorMassG, 0, 2000),
    payloadMassG: finiteInRange(draft.payloadMassG, fallback.payloadMassG, 0, 2000),
    link1ComRatio: finiteInRange(draft.link1ComRatio, fallback.link1ComRatio, 0, 1),
    link2ComRatio: finiteInRange(draft.link2ComRatio, fallback.link2ComRatio, 0, 1),
    j1GravityBiasDegPerNm: finiteInRange(draft.j1GravityBiasDegPerNm, fallback.j1GravityBiasDegPerNm, 0, 30),
    j2GravityBiasDegPerNm: finiteInRange(draft.j2GravityBiasDegPerNm, fallback.j2GravityBiasDegPerNm, 0, 30),
    j1GravitySign: normalizeSign(draft.j1GravitySign, fallback.j1GravitySign),
    j2GravitySign: normalizeSign(draft.j2GravitySign, fallback.j2GravitySign),
    gravityMaxBiasDeg: finiteInRange(draft.gravityMaxBiasDeg, fallback.gravityMaxBiasDeg, 0, 20),
    speedRaw: integerInRange(draft.speedRaw, fallback.speedRaw, 0, 4095),
    acc: integerInRange(draft.acc, fallback.acc, 0, 254),
    calibrated: draft.calibrated === true,
    wristCalibrated: draft.wristCalibrated === true
  };
}

export function createLiteFourAxisPoseLock(target: Pick<LiteFourAxisArmPose, "toolPitchDeg" | "wristRollDeg" | "z">): LiteFourAxisPoseLock {
  return {
    toolPitchDeg: roundAngle(finiteOrDefault(target.toolPitchDeg, 0)),
    wristRollDeg: roundAngle(finiteOrDefault(target.wristRollDeg, 0)),
    z: roundPosition(finiteOrDefault(target.z, 0))
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

export function createLiteFourAxisArmRuntimeState(config: LiteArmProfile, servos: ServoProfile[]): LiteFourAxisArmRuntimeState {
  const folded = foldedArmTarget(config);
  const pose = clampFourAxisPose({
    x: folded.x,
    z: folded.z,
    toolPitchDeg: 0,
    wristRollDeg: 0
  }, config);
  const solution = solveFourAxisArmPoseIk(pose, config, servos);
  return {
    target: solution.target,
    j1LogicalDeg: solution.arm.j1LogicalDeg,
    j2LogicalDeg: solution.arm.j2LogicalDeg
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

export function solveFourAxisArmPoseIk(requestedTarget: LiteFourAxisArmPose, config: LiteArmProfile, servos: ServoProfile[]): LiteFourAxisArmSolution {
  const target = clampFourAxisPose(requestedTarget, config);
  const pitchRad = degreesToRadians(target.toolPitchDeg);
  const wristTarget = {
    x: roundPosition(target.x - config.toolLengthMm * Math.cos(pitchRad)),
    z: roundPosition(target.z - config.toolLengthMm * Math.sin(pitchRad))
  };
  const arm = solveTwoLinkArmIk(wristTarget, config, servos);
  const forearmAbsDeg = roundAngle(arm.shoulderDeg + config.elbowSign * arm.elbowDeg);
  const wristPitchLocalDeg = roundAngle(target.toolPitchDeg - forearmAbsDeg);
  return {
    arm,
    forearmAbsDeg,
    requestedTarget,
    target: {
      x: target.x,
      z: target.z,
      toolPitchDeg: target.toolPitchDeg,
      wristRollDeg: target.wristRollDeg
    },
    wristPitchLocalDeg,
    wristTarget: arm.target
  };
}

export function applyFourAxisArmJoystickStep(
  state: LiteFourAxisArmRuntimeState,
  input: LiteFourAxisArmJoystickInput,
  dtMs: number,
  config: LiteArmProfile,
  servos: ServoProfile[]
): LiteFourAxisArmStepResult {
  const x = axisAfterDeadzone(input.x, config.deadzone);
  const z = axisAfterDeadzone(input.z, config.deadzone);
  const toolPitch = axisAfterDeadzone(input.toolPitch, config.deadzone);
  const wristRoll = axisAfterDeadzone(input.wristRoll, config.deadzone);
  const armMoving = Math.abs(x) > 0 || Math.abs(z) > 0;
  const wristMoving = Math.abs(toolPitch) > 0 || Math.abs(wristRoll) > 0 || input.claw !== 0;
  const dtSeconds = clamp(Number.isFinite(dtMs) ? dtMs / 1000 : config.commandIntervalMs / 1000, 0, 0.5);
  const requestedTarget: LiteFourAxisArmPose = {
    x: state.target.x + x * config.forwardSpeedPerSecond * dtSeconds,
    z: state.target.z + z * config.liftSpeedPerSecond * dtSeconds,
    toolPitchDeg: state.target.toolPitchDeg + toolPitch * config.toolPitchSpeedDegPerSecond * dtSeconds,
    wristRollDeg: state.target.wristRollDeg + wristRoll * config.wristRollSpeedDegPerSecond * dtSeconds
  };
  const solution = solveFourAxisArmPoseIk(requestedTarget, config, servos);
  const limitedArm = slewSolution(solution.arm, {
    target: solution.arm.target,
    j1LogicalDeg: state.j1LogicalDeg,
    j2LogicalDeg: state.j2LogicalDeg
  }, config.maxAngleStepDeg, servos, config);
  const limitedSolution: LiteFourAxisArmSolution = {
    ...solution,
    arm: limitedArm
  };
  return {
    armMoving,
    moving: armMoving || wristMoving,
    solution: limitedSolution,
    state: {
      target: solution.target,
      j1LogicalDeg: limitedArm.j1LogicalDeg,
      j2LogicalDeg: limitedArm.j2LogicalDeg
    },
    wristMoving
  };
}

export function hasArmJoystickMotion(input: LiteArmJoystickInput, deadzone: number): boolean {
  return Math.abs(axisAfterDeadzone(input.forward, deadzone)) > 0 || Math.abs(axisAfterDeadzone(input.lift, deadzone)) > 0;
}

export function hasFourAxisWristMotion(input: LiteFourAxisArmJoystickInput, deadzone: number): boolean {
  return Math.abs(axisAfterDeadzone(input.toolPitch, deadzone)) > 0 ||
    Math.abs(axisAfterDeadzone(input.wristRoll, deadzone)) > 0 ||
    input.claw !== 0;
}

export function calculateLiteArmGravityCompensation(
  solution: LiteArmSolution,
  config: LiteArmProfile,
  servos: ServoProfile[]
): LiteArmGravityCompensation {
  const j1Servo = servoById(servos, config.j1ServoId);
  const j2Servo = servoById(servos, config.j2ServoId);
  const j1Span = servoLogicalSpan(j1Servo);
  const j2Span = servoLogicalSpan(j2Servo);
  const link1LengthM = positiveLength(config.link1Length) / 1000;
  const link2LengthM = positiveLength(config.link2Length) / 1000;
  const link1MassKg = Math.max(0, finiteOrDefault(config.link1MassG, 0)) / 1000;
  const link2MassKg = Math.max(0, finiteOrDefault(config.link2MassG, 0)) / 1000;
  const wristMassKg = Math.max(0, finiteOrDefault(config.endEffectorMassG, 0) + finiteOrDefault(config.payloadMassG, 0)) / 1000;
  const shoulderRad = degreesToRadians(solution.shoulderDeg);
  const forearmAbsRad = degreesToRadians(solution.shoulderDeg + config.elbowSign * solution.elbowDeg);
  const link1ComX = link1LengthM * finiteInRange(config.link1ComRatio, 0.5, 0, 1) * Math.cos(shoulderRad);
  const link2ComXFromShoulder = link1LengthM * Math.cos(shoulderRad) +
    link2LengthM * finiteInRange(config.link2ComRatio, 0.5, 0, 1) * Math.cos(forearmAbsRad);
  const wristXFromShoulder = link1LengthM * Math.cos(shoulderRad) + link2LengthM * Math.cos(forearmAbsRad);
  const link2ComXFromElbow = link2LengthM * finiteInRange(config.link2ComRatio, 0.5, 0, 1) * Math.cos(forearmAbsRad);
  const wristXFromElbow = link2LengthM * Math.cos(forearmAbsRad);
  const j1TorqueNm = GRAVITY_M_PER_SECOND2 * (
    link1MassKg * link1ComX +
    link2MassKg * link2ComXFromShoulder +
    wristMassKg * wristXFromShoulder
  );
  const j2TorqueNm = GRAVITY_M_PER_SECOND2 * (
    link2MassKg * link2ComXFromElbow +
    wristMassKg * wristXFromElbow
  );
  const maxBiasDeg = Math.max(0, finiteOrDefault(config.gravityMaxBiasDeg, 0));
  const compensationEnabled = config.gravityCompensationEnabled;
  const desiredJ1BiasDeg = compensationEnabled
    ? j1TorqueNm * config.j1GravityBiasDegPerNm * config.j1GravitySign
    : 0;
  const desiredJ2BiasDeg = compensationEnabled
    ? j2TorqueNm * config.j2GravityBiasDegPerNm * config.j2GravitySign
    : 0;
  const j1BiasDeg = clamp(desiredJ1BiasDeg, -maxBiasDeg, maxBiasDeg);
  const j2BiasDeg = clamp(desiredJ2BiasDeg, -maxBiasDeg, maxBiasDeg);
  const j1CompensatedLogicalDeg = roundAngle(clamp(solution.j1LogicalDeg + j1BiasDeg, 0, j1Span));
  const j2CompensatedLogicalDeg = roundAngle(clamp(solution.j2LogicalDeg + j2BiasDeg, 0, j2Span));
  const j1AppliedBiasDeg = roundAngle(j1CompensatedLogicalDeg - solution.j1LogicalDeg);
  const j2AppliedBiasDeg = roundAngle(j2CompensatedLogicalDeg - solution.j2LogicalDeg);
  return {
    enabled: compensationEnabled,
    j1AppliedBiasDeg,
    j1BiasDeg: roundAngle(j1BiasDeg),
    j1CompensatedLogicalDeg,
    j1CompensatedPhysicalDeg: compensationEnabled ? roundAngle(servoLogicalToPhysicalAngle(j1Servo, j1CompensatedLogicalDeg)) : roundAngle(solution.j1PhysicalDeg),
    j1TorqueNm: roundAngle(j1TorqueNm),
    j2AppliedBiasDeg,
    j2BiasDeg: roundAngle(j2BiasDeg),
    j2CompensatedLogicalDeg,
    j2CompensatedPhysicalDeg: compensationEnabled ? roundAngle(servoLogicalToPhysicalAngle(j2Servo, j2CompensatedLogicalDeg)) : roundAngle(solution.j2PhysicalDeg),
    j2TorqueNm: roundAngle(j2TorqueNm),
    limited: Math.abs(j1AppliedBiasDeg - desiredJ1BiasDeg) > 0.05 ||
      Math.abs(j2AppliedBiasDeg - desiredJ2BiasDeg) > 0.05 ||
      Math.abs(j1BiasDeg - desiredJ1BiasDeg) > 0.05 ||
      Math.abs(j2BiasDeg - desiredJ2BiasDeg) > 0.05
  };
}

export function buildLiteArmMoveCommand(seq: number, solution: LiteArmSolution, config: LiteArmProfile, servos: ServoProfile[] = []): PcCommand {
  if (!solution.reachable || !solution.withinLimits) {
    throw new RangeError("arm solution is not safe to send");
  }
  const gravityCompensation = calculateLiteArmGravityCompensation(solution, config, servos);
  return buildServoMoveCommand(
    seq,
    [
      { id: config.j1ServoId, name: "J1", angleDeg: gravityCompensation.j1CompensatedPhysicalDeg, speedRaw: config.speedRaw, acc: config.acc },
      { id: config.j2ServoId, name: "J2", angleDeg: gravityCompensation.j2CompensatedPhysicalDeg, speedRaw: config.speedRaw, acc: config.acc }
    ],
    true
  );
}

export function buildLiteFourAxisWristSpeedCommand(
  seq: number,
  input: LiteFourAxisArmJoystickInput,
  config: LiteArmProfile,
  clawConfig: MachineClawTestConfig
): PcCommand {
  return buildServoSpeedCommand(seq, buildLiteFourAxisWristSpeedTargets(input, config, clawConfig), true);
}

export function buildLiteFourAxisWristSpeedTargets(
  input: LiteFourAxisArmJoystickInput,
  config: LiteArmProfile,
  clawConfig: MachineClawTestConfig
): LiteFourAxisWristSpeedTarget[] {
  const pitchSpeed = signedAxisWheelSpeed(input.toolPitch, Math.max(config.wristSpeedRaw, clawConfig.pitchSpeedRaw), clawConfig.pitchReverse);
  const rollSpeed = signedAxisWheelSpeed(input.wristRoll, clawConfig.rotationSpeedRaw, clawConfig.rotationReverse);
  const clawFollowSpeed = signedAxisWheelSpeed(input.wristRoll, clawConfig.rotationClawSpeedRaw, clawConfig.rotationClawReverse);
  const clawSpeed = signedAxisWheelSpeed(input.claw, clawConfig.clawSpeedRaw, clawConfig.clawReverse);
  return [
    { id: MACHINE_CLAW_SERVO_IDS.pitchLeft, name: "Claw Pitch L", speedRaw: clampWheelSpeed(rollSpeed + pitchSpeed), acc: clawConfig.acc },
    { id: MACHINE_CLAW_SERVO_IDS.claw, name: "Claw Open", speedRaw: clampWheelSpeed(clawFollowSpeed + clawSpeed), acc: clawConfig.acc },
    { id: MACHINE_CLAW_SERVO_IDS.pitchRight, name: "Claw Pitch R", speedRaw: clampWheelSpeed(rollSpeed - pitchSpeed), acc: clawConfig.acc }
  ];
}

export function buildLiteFourAxisWristPoseHoldSpeedCommand(
  seq: number,
  input: LiteFourAxisArmJoystickInput,
  solution: LiteFourAxisArmSolution,
  feedback: LiteFourAxisWristPoseFeedback,
  config: LiteArmProfile,
  clawConfig: MachineClawTestConfig
): PcCommand {
  return buildServoSpeedCommand(seq, buildLiteFourAxisWristPoseHoldSpeedTargets(input, solution, feedback, config, clawConfig), true);
}

export function buildLiteFourAxisWristPoseHoldSpeedTargets(
  input: LiteFourAxisArmJoystickInput,
  solution: LiteFourAxisArmSolution,
  feedback: LiteFourAxisWristPoseFeedback,
  config: LiteArmProfile,
  clawConfig: MachineClawTestConfig
): LiteFourAxisWristSpeedTarget[] {
  const pitchErrorDeg = solution.wristPitchLocalDeg - feedback.pitchLocalDeg;
  const rollErrorDeg = solution.target.wristRollDeg - feedback.rollDeg;
  const pitchSpeed = signedErrorWheelSpeed(
    pitchErrorDeg,
    Math.max(config.wristSpeedRaw, clawConfig.pitchSpeedRaw),
    clawConfig.pitchReverse
  );
  const semanticRollSpeed = signedErrorWheelSpeed(rollErrorDeg, clawConfig.rotationSpeedRaw, false);
  const rollSpeed = clawConfig.rotationReverse ? -semanticRollSpeed : semanticRollSpeed;
  const clawFollowSpeed = scaleRollFollowSpeed(
    semanticRollSpeed,
    clawConfig.rotationSpeedRaw,
    clawConfig.rotationClawSpeedRaw,
    clawConfig.rotationClawReverse
  );
  const clawSpeed = signedAxisWheelSpeed(input.claw, clawConfig.clawSpeedRaw, clawConfig.clawReverse);
  return [
    { id: MACHINE_CLAW_SERVO_IDS.pitchLeft, name: "Claw Pitch L", speedRaw: clampWheelSpeed(rollSpeed + pitchSpeed), acc: clawConfig.acc },
    { id: MACHINE_CLAW_SERVO_IDS.claw, name: "Claw Open", speedRaw: clampWheelSpeed(clawFollowSpeed + clawSpeed), acc: clawConfig.acc },
    { id: MACHINE_CLAW_SERVO_IDS.pitchRight, name: "Claw Pitch R", speedRaw: clampWheelSpeed(rollSpeed - pitchSpeed), acc: clawConfig.acc }
  ];
}

export function armCommandSignature(solution: LiteArmSolution, config?: LiteArmProfile, servos: ServoProfile[] = []): string {
  if (config) {
    const gravityCompensation = calculateLiteArmGravityCompensation(solution, config, servos);
    return `${gravityCompensation.j1CompensatedPhysicalDeg}:${gravityCompensation.j2CompensatedPhysicalDeg}`;
  }
  return `${roundAngle(solution.j1PhysicalDeg)}:${roundAngle(solution.j2PhysicalDeg)}`;
}

export function wristSpeedCommandSignature(command: PcCommand): string {
  if (command.type !== "servo.speed" || !Array.isArray(command.targets)) {
    return "";
  }
  return command.targets.map((target) => `${target.id}:${target.speedRaw}`).join("|");
}

function clampFourAxisPose(target: LiteFourAxisArmPose, config: LiteArmProfile): LiteFourAxisArmPose {
  return {
    x: clamp(finiteOrDefault(target.x, 0), config.minForward, config.maxForward),
    z: clamp(finiteOrDefault(target.z, 0), config.minHeight, config.maxHeight),
    toolPitchDeg: clamp(finiteOrDefault(target.toolPitchDeg, 0), config.toolPitchMinDeg, config.toolPitchMaxDeg),
    wristRollDeg: clamp(finiteOrDefault(target.wristRollDeg, 0), config.wristRollMinDeg, config.wristRollMaxDeg)
  };
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

function degreesToRadians(value: number): number {
  return (value / 180) * Math.PI;
}

function roundAngle(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundPosition(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function signedAxisWheelSpeed(axis: number, speedRaw: number, reverse: boolean): number {
  const value = axisAfterDeadzone(axis, 0);
  const speed = Math.round(clamp(Math.abs(value) * speedRaw, 0, DEFAULT_WHEEL_SPEED_LIMIT));
  return value === 0 ? 0 : speed * (reverse ? -Math.sign(value) : Math.sign(value));
}

function signedErrorWheelSpeed(errorDeg: number, speedRaw: number, reverse: boolean): number {
  const error = Number.isFinite(errorDeg) ? errorDeg : 0;
  if (Math.abs(error) <= WRIST_POSE_HOLD_DEADBAND_DEG) {
    return 0;
  }
  const speed = Math.round(clamp(Math.abs(error) * WRIST_POSE_HOLD_GAIN_RAW_PER_DEG, 0, speedRaw));
  return speed * (reverse ? -Math.sign(error) : Math.sign(error));
}

function scaleRollFollowSpeed(semanticRollSpeed: number, rollSpeedRaw: number, followSpeedRaw: number, reverse: boolean): number {
  if (semanticRollSpeed === 0 || rollSpeedRaw <= 0 || followSpeedRaw <= 0) {
    return 0;
  }
  const speed = Math.round(clamp(Math.abs(semanticRollSpeed) * followSpeedRaw / rollSpeedRaw, 0, DEFAULT_WHEEL_SPEED_LIMIT));
  return speed * (reverse ? -Math.sign(semanticRollSpeed) : Math.sign(semanticRollSpeed));
}

function clampWheelSpeed(value: number): number {
  const rounded = Math.round(clamp(value, -DEFAULT_WHEEL_SPEED_LIMIT, DEFAULT_WHEEL_SPEED_LIMIT));
  return Object.is(rounded, -0) ? 0 : rounded;
}
