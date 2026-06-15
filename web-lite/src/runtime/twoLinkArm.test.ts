import { describe, expect, it } from "vitest";
import { ROBOT_PROFILE, type LiteArmProfile } from "../robotProfile";
import {
  applyArmJoystickStep,
  applyFourAxisArmJoystickStep,
  buildLiteArmMoveCommand,
  buildLiteFourAxisWristPoseHoldSpeedCommand,
  buildLiteFourAxisWristSpeedCommand,
  calculateLiteArmGravityCompensation,
  createLiteArmRuntimeState,
  createLiteFourAxisArmRuntimeState,
  createLiteFourAxisPoseLock,
  normalizeLiteArmProfile,
  solveFourAxisArmPoseIk,
  solveTwoLinkArmIk,
  wristSpeedCommandSignature
} from "./twoLinkArm";

const armServos = ROBOT_PROFILE.feetech.servos;

function testArmProfile(overrides: Partial<LiteArmProfile> = {}): LiteArmProfile {
  return normalizeLiteArmProfile({
    ...ROBOT_PROFILE.arm,
    calibrated: true,
    link1Length: 100,
    link2Length: 60,
    minForward: -160,
    maxForward: 160,
    minHeight: -120,
    maxHeight: 120,
    minReachMargin: 0,
    maxReachMargin: 0,
    zeroJ1Deg: 90,
    zeroJ2Deg: 90,
    trimJ1Deg: 0,
    trimJ2Deg: 0,
    j1Sign: 1,
    j2Sign: 1,
    elbowSign: 1,
    ...overrides
  }, ROBOT_PROFILE.arm);
}

describe("two-link arm runtime", () => {
  it("normalizes missing wrist semantic zero fields for older stored arm profiles", () => {
    const legacyProfile = {
      ...ROBOT_PROFILE.arm,
      wristZeroPitchLocalDeg: undefined,
      wristZeroRollDeg: undefined
    };
    const normalized = normalizeLiteArmProfile(legacyProfile, ROBOT_PROFILE.arm);

    expect(normalized.wristZeroPitchLocalDeg).toBe(ROBOT_PROFILE.arm.wristZeroPitchLocalDeg);
    expect(normalized.wristZeroRollDeg).toBe(ROBOT_PROFILE.arm.wristZeroRollDeg);
  });

  it("normalizes missing gravity compensation fields for older stored arm profiles", () => {
    const normalized = normalizeLiteArmProfile({
      ...ROBOT_PROFILE.arm,
      gravityCompensationEnabled: undefined,
      gravityMaxBiasDeg: undefined,
      j1GravityBiasDegPerNm: undefined,
      link1MassG: undefined
    }, ROBOT_PROFILE.arm);

    expect(normalized).toMatchObject({
      endEffectorMassG: ROBOT_PROFILE.arm.endEffectorMassG,
      gravityCompensationEnabled: false,
      gravityMaxBiasDeg: ROBOT_PROFILE.arm.gravityMaxBiasDeg,
      j1GravityBiasDegPerNm: ROBOT_PROFILE.arm.j1GravityBiasDegPerNm,
      link1MassG: ROBOT_PROFILE.arm.link1MassG
    });
  });

  it("keeps the equal-link default folded pose at the calibrated zero angles", () => {
    const profile = normalizeLiteArmProfile({ ...ROBOT_PROFILE.arm, calibrated: true }, ROBOT_PROFILE.arm);
    const state = createLiteArmRuntimeState(profile, armServos);
    const solution = solveTwoLinkArmIk(state.target, profile, armServos);

    expect(state.target).toEqual({ x: 0, z: 0 });
    expect(solution.j1LogicalDeg).toBe(90);
    expect(solution.j2LogicalDeg).toBe(90);
    expect(solution.limitedByWorkspace).toBe(false);
  });

  it("solves the folded horizontal zero pose for J1/J2", () => {
    const solution = solveTwoLinkArmIk({ x: 40, z: 0 }, testArmProfile(), armServos);

    expect(solution).toMatchObject({
      reachable: true,
      withinLimits: true,
      limitedByWorkspace: false
    });
    expect(solution.shoulderDeg).toBeCloseTo(0, 1);
    expect(solution.elbowDeg).toBeCloseTo(180, 1);
    expect(solution.j1LogicalDeg).toBeCloseTo(90, 1);
    expect(solution.j2LogicalDeg).toBeCloseTo(90, 1);
  });

  it("extends forward by reducing the elbow fold", () => {
    const solution = solveTwoLinkArmIk({ x: 60, z: 0 }, testArmProfile(), armServos);

    expect(solution.withinLimits).toBe(true);
    expect(solution.target.x).toBe(60);
    expect(solution.elbowDeg).toBeLessThan(180);
    expect(solution.j2LogicalDeg).toBeLessThan(90);
  });

  it("raises the hand when z increases", () => {
    const solution = solveTwoLinkArmIk({ x: 40, z: 30 }, testArmProfile(), armServos);

    expect(solution.withinLimits).toBe(true);
    expect(solution.target.z).toBe(30);
    expect(solution.j1LogicalDeg).toBeGreaterThan(90);
  });

  it("clamps unreachable hand targets to the configured workspace", () => {
    const solution = solveTwoLinkArmIk({ x: 1000, z: 200 }, testArmProfile(), armServos);

    expect(solution.limitedByWorkspace).toBe(true);
    expect(solution.target.x).toBeLessThanOrEqual(160);
    expect(solution.target.z).toBeLessThanOrEqual(120);
  });

  it("reports angle-limit violations before sending", () => {
    const solution = solveTwoLinkArmIk({ x: 60, z: 0 }, testArmProfile({ zeroJ1Deg: 0 }), armServos);

    expect(solution.withinLimits).toBe(false);
    expect(() => buildLiteArmMoveCommand(1, solution, testArmProfile({ zeroJ1Deg: 0 }))).toThrow(RangeError);
  });

  it("applies trims, direction signs, and joystick slew limiting", () => {
    const profile = testArmProfile({
      forwardSpeedPerSecond: 20,
      liftSpeedPerSecond: 20,
      maxAngleStepDeg: 3,
      trimJ1Deg: 2,
      trimJ2Deg: -4,
      j1Sign: -1
    });
    const state = createLiteArmRuntimeState(profile, armServos);
    const step = applyArmJoystickStep(state, { forward: 1, lift: 1 }, 1000, profile, armServos);

    expect(step.moving).toBe(true);
    expect(step.state.target.x).toBeGreaterThan(state.target.x);
    expect(step.state.target.z).toBeGreaterThan(state.target.z);
    expect(step.solution.limitedBySlew).toBe(true);
    expect(Math.abs(step.state.j1LogicalDeg - state.j1LogicalDeg)).toBeLessThanOrEqual(3);
    expect(Math.abs(step.state.j2LogicalDeg - state.j2LogicalDeg)).toBeLessThanOrEqual(3);
  });

  it("builds one synchronized servo.move for ID9 and ID10", () => {
    const profile = testArmProfile();
    const solution = solveTwoLinkArmIk({ x: 40, z: 0 }, profile, armServos);
    const command = buildLiteArmMoveCommand(77, solution, profile, armServos);

    expect(command).toMatchObject({
      type: "servo.move",
      seq: 77,
      sync: true,
      targets: [
        { id: 9, name: "J1", speedRaw: 300, acc: 30 },
        { id: 10, name: "J2", speedRaw: 300, acc: 30 }
      ]
    });
    expect(command.targets[0].angleDeg).toBe(solution.j1PhysicalDeg);
    expect(command.targets[1].angleDeg).toBe(solution.j2PhysicalDeg);
  });

  it("keeps servo.move targets unchanged while gravity compensation is disabled", () => {
    const profile = testArmProfile({ gravityCompensationEnabled: false });
    const solution = solveTwoLinkArmIk({ x: 60, z: 0 }, profile, armServos);
    const compensation = calculateLiteArmGravityCompensation(solution, profile, armServos);
    const command = buildLiteArmMoveCommand(78, solution, profile, armServos);

    expect(compensation.enabled).toBe(false);
    expect(compensation.j1AppliedBiasDeg).toBe(0);
    expect(compensation.j2AppliedBiasDeg).toBe(0);
    expect(command.targets[0].angleDeg).toBe(solution.j1PhysicalDeg);
    expect(command.targets[1].angleDeg).toBe(solution.j2PhysicalDeg);
  });

  it("adds an upward J1 feed-forward bias for a horizontal forward reach", () => {
    const profile = testArmProfile({ gravityCompensationEnabled: true, gravityMaxBiasDeg: 10 });
    const solution = solveTwoLinkArmIk({ x: 60, z: 0 }, profile, armServos);
    const compensation = calculateLiteArmGravityCompensation(solution, profile, armServos);

    expect(compensation.enabled).toBe(true);
    expect(compensation.j1TorqueNm).toBeGreaterThan(0);
    expect(compensation.j1AppliedBiasDeg).toBeGreaterThan(0);
    expect(compensation.j1CompensatedLogicalDeg).toBeGreaterThan(solution.j1LogicalDeg);
  });

  it("increases the gravity feed-forward angle as payload mass rises", () => {
    const lightProfile = testArmProfile({ gravityCompensationEnabled: true, gravityMaxBiasDeg: 20, payloadMassG: 0 });
    const heavyProfile = testArmProfile({ gravityCompensationEnabled: true, gravityMaxBiasDeg: 20, payloadMassG: 800 });
    const lightSolution = solveTwoLinkArmIk({ x: 60, z: 0 }, lightProfile, armServos);
    const heavySolution = solveTwoLinkArmIk({ x: 60, z: 0 }, heavyProfile, armServos);
    const light = calculateLiteArmGravityCompensation(lightSolution, lightProfile, armServos);
    const heavy = calculateLiteArmGravityCompensation(heavySolution, heavyProfile, armServos);

    expect(Math.abs(heavy.j1AppliedBiasDeg)).toBeGreaterThan(Math.abs(light.j1AppliedBiasDeg));
    expect(Math.abs(heavy.j2AppliedBiasDeg)).toBeGreaterThan(Math.abs(light.j2AppliedBiasDeg));
  });

  it("limits gravity compensation to gravityMaxBiasDeg", () => {
    const profile = testArmProfile({
      gravityCompensationEnabled: true,
      gravityMaxBiasDeg: 2,
      j1GravityBiasDegPerNm: 30,
      j2GravityBiasDegPerNm: 30,
      payloadMassG: 2000
    });
    const solution = solveTwoLinkArmIk({ x: 60, z: 0 }, profile, armServos);
    const compensation = calculateLiteArmGravityCompensation(solution, profile, armServos);

    expect(Math.abs(compensation.j1BiasDeg)).toBeLessThanOrEqual(2);
    expect(Math.abs(compensation.j2BiasDeg)).toBeLessThanOrEqual(2);
    expect(compensation.limited).toBe(true);
  });

  it("clamps compensated targets to the fixed ID9/ID10 servo angle ranges", () => {
    const profile = testArmProfile({
      gravityCompensationEnabled: true,
      gravityMaxBiasDeg: 20,
      j1GravityBiasDegPerNm: 30,
      payloadMassG: 2000
    });
    const baseSolution = solveTwoLinkArmIk({ x: 40, z: 0 }, profile, armServos);
    const nearJ1Max = {
      ...baseSolution,
      j1LogicalDeg: 179.5,
      j1PhysicalDeg: 359.5
    };
    const compensation = calculateLiteArmGravityCompensation(nearJ1Max, profile, armServos);
    const command = buildLiteArmMoveCommand(79, nearJ1Max, profile, armServos);

    expect(compensation.j1CompensatedLogicalDeg).toBeLessThanOrEqual(180);
    expect(command.targets[0].angleDeg).toBeLessThanOrEqual(360);
    expect(compensation.limited).toBe(true);
  });

  it("solves a four-axis tool pose through the wrist point before shoulder and elbow IK", () => {
    const profile = testArmProfile({
      toolLengthMm: 20,
      toolPitchMinDeg: -90,
      toolPitchMaxDeg: 90,
      wristRollMinDeg: -360,
      wristRollMaxDeg: 360
    });
    const solution = solveFourAxisArmPoseIk({ x: 80, z: 20, toolPitchDeg: 0, wristRollDeg: 45 }, profile, armServos);

    expect(solution.target).toMatchObject({ x: 80, z: 20, toolPitchDeg: 0, wristRollDeg: 45 });
    expect(solution.wristTarget).toMatchObject({ x: 60, z: 20 });
    expect(solution.arm.withinLimits).toBe(true);
    expect(solution.wristPitchLocalDeg).toBeCloseTo(solution.target.toolPitchDeg - solution.forearmAbsDeg, 1);
  });

  it("steps the four-axis target from right-stick position and left-stick wrist input", () => {
    const profile = testArmProfile({
      forwardSpeedPerSecond: 50,
      liftSpeedPerSecond: 40,
      toolPitchSpeedDegPerSecond: 30,
      wristRollSpeedDegPerSecond: 90
    });
    const state = createLiteFourAxisArmRuntimeState(profile, armServos);
    const step = applyFourAxisArmJoystickStep(state, {
      claw: 0,
      toolPitch: 1,
      wristRoll: -0.5,
      x: 1,
      z: 0.5
    }, 1000, profile, armServos);

    expect(step.moving).toBe(true);
    expect(step.armMoving).toBe(true);
    expect(step.wristMoving).toBe(true);
    expect(step.state.target.x).toBeGreaterThan(state.target.x);
    expect(step.state.target.z).toBeGreaterThan(state.target.z);
    expect(step.state.target.toolPitchDeg).toBe(15);
    expect(step.state.target.wristRollDeg).toBe(-22.5);
  });

  it("keeps the locked height plane and claw posture during forward motion", () => {
    const profile = testArmProfile({
      forwardSpeedPerSecond: 50,
      liftSpeedPerSecond: 40,
      toolPitchSpeedDegPerSecond: 30,
      wristRollSpeedDegPerSecond: 90
    });
    const state = {
      j1LogicalDeg: 90,
      j2LogicalDeg: 90,
      target: { x: 40, z: 20, toolPitchDeg: 15, wristRollDeg: -30 }
    };
    const lock = createLiteFourAxisPoseLock(state.target);
    const step = applyFourAxisArmJoystickStep(state, {
      claw: 0,
      toolPitch: 0,
      wristRoll: 0,
      x: 1,
      z: 0
    }, 1000, profile, armServos);

    expect(step.state.target.x).toBeGreaterThan(state.target.x);
    expect(step.state.target.z).toBe(lock.z);
    expect(step.state.target.toolPitchDeg).toBe(lock.toolPitchDeg);
    expect(step.state.target.wristRollDeg).toBe(lock.wristRollDeg);
  });

  it("updates the locked plane height after right-stick sideways lift input", () => {
    const profile = testArmProfile({
      forwardSpeedPerSecond: 50,
      liftSpeedPerSecond: 40
    });
    const state = {
      j1LogicalDeg: 90,
      j2LogicalDeg: 90,
      target: { x: 40, z: 20, toolPitchDeg: 10, wristRollDeg: 5 }
    };
    const lifted = applyFourAxisArmJoystickStep(state, {
      claw: 0,
      toolPitch: 0,
      wristRoll: 0,
      x: 0,
      z: 1
    }, 500, profile, armServos);
    const nextLock = createLiteFourAxisPoseLock(lifted.state.target);
    const forward = applyFourAxisArmJoystickStep(lifted.state, {
      claw: 0,
      toolPitch: 0,
      wristRoll: 0,
      x: 1,
      z: 0
    }, 500, profile, armServos);

    expect(nextLock.z).toBeGreaterThan(state.target.z);
    expect(forward.state.target.z).toBe(nextLock.z);
    expect(forward.state.target.toolPitchDeg).toBe(nextLock.toolPitchDeg);
    expect(forward.state.target.wristRollDeg).toBe(nextLock.wristRollDeg);
  });

  it("holds the adjusted posture during later forward motion", () => {
    const profile = testArmProfile({
      forwardSpeedPerSecond: 50,
      toolPitchSpeedDegPerSecond: 30,
      wristRollSpeedDegPerSecond: 90
    });
    const state = {
      j1LogicalDeg: 90,
      j2LogicalDeg: 90,
      target: { x: 40, z: 20, toolPitchDeg: 0, wristRollDeg: 0 }
    };
    const adjusted = applyFourAxisArmJoystickStep(state, {
      claw: 0,
      toolPitch: 1,
      wristRoll: -0.5,
      x: 0,
      z: 0
    }, 1000, profile, armServos);
    const postureLock = createLiteFourAxisPoseLock(adjusted.state.target);
    const forward = applyFourAxisArmJoystickStep(adjusted.state, {
      claw: 0,
      toolPitch: 0,
      wristRoll: 0,
      x: 1,
      z: 0
    }, 500, profile, armServos);

    expect(postureLock.toolPitchDeg).toBe(15);
    expect(postureLock.wristRollDeg).toBe(-22.5);
    expect(forward.state.target.toolPitchDeg).toBe(postureLock.toolPitchDeg);
    expect(forward.state.target.wristRollDeg).toBe(postureLock.wristRollDeg);
  });

  it("builds differential wrist and composed ID22 wheel speeds", () => {
    const profile = testArmProfile({ wristSpeedRaw: 300 });
    const command = buildLiteFourAxisWristSpeedCommand(88, {
      claw: 1,
      toolPitch: 1,
      wristRoll: 0.5,
      x: 0,
      z: 0
    }, profile, {
      pitchSpeedRaw: 300,
      rotationSpeedRaw: 200,
      rotationClawSpeedRaw: 100,
      clawSpeedRaw: 220,
      acc: 50,
      pitchReverse: false,
      rotationReverse: false,
      rotationClawReverse: false,
      clawReverse: false,
      openTurns: 1,
      closeTurns: 1
    });

    expect(command).toMatchObject({
      type: "servo.speed",
      seq: 88,
      setupWheelMode: true,
      targets: [
        { id: 21, speedRaw: 400, acc: 50 },
        { id: 22, speedRaw: 270, acc: 50 },
        { id: 23, speedRaw: -200, acc: 50 }
      ]
    });
    expect(wristSpeedCommandSignature(command)).toBe("21:400|22:270|23:-200");
  });

  it("builds opposite ID21/ID23 compensation for local wrist pitch error", () => {
    const profile = testArmProfile({ wristSpeedRaw: 300 });
    const solution = solveFourAxisArmPoseIk({ x: 70, z: 25, toolPitchDeg: 20, wristRollDeg: 0 }, profile, armServos);
    const command = buildLiteFourAxisWristPoseHoldSpeedCommand(89, {
      claw: 0,
      toolPitch: 0,
      wristRoll: 0,
      x: 0,
      z: 0
    }, {
      ...solution,
      wristPitchLocalDeg: 12,
      target: { ...solution.target, wristRollDeg: 0 }
    }, { pitchLocalDeg: 0, rollDeg: 0 }, profile, {
      pitchSpeedRaw: 300,
      rotationSpeedRaw: 200,
      rotationClawSpeedRaw: 100,
      clawSpeedRaw: 220,
      acc: 50,
      pitchReverse: false,
      rotationReverse: false,
      rotationClawReverse: false,
      clawReverse: false,
      openTurns: 1,
      closeTurns: 1
    });

    expect(command).toMatchObject({
      type: "servo.speed",
      targets: [
        { id: 21, speedRaw: 96 },
        { id: 22, speedRaw: 0 },
        { id: 23, speedRaw: -96 }
      ]
    });
  });

  it("builds same-direction ID21/ID23 and ID22 follow compensation for wrist roll error", () => {
    const profile = testArmProfile({ wristSpeedRaw: 300 });
    const solution = solveFourAxisArmPoseIk({ x: 70, z: 25, toolPitchDeg: 0, wristRollDeg: 15 }, profile, armServos);
    const command = buildLiteFourAxisWristPoseHoldSpeedCommand(90, {
      claw: 0,
      toolPitch: 0,
      wristRoll: 0,
      x: 0,
      z: 0
    }, solution, { pitchLocalDeg: solution.wristPitchLocalDeg, rollDeg: 0 }, profile, {
      pitchSpeedRaw: 300,
      rotationSpeedRaw: 200,
      rotationClawSpeedRaw: 100,
      clawSpeedRaw: 220,
      acc: 50,
      pitchReverse: false,
      rotationReverse: false,
      rotationClawReverse: false,
      clawReverse: false,
      openTurns: 1,
      closeTurns: 1
    });

    expect(command).toMatchObject({
      type: "servo.speed",
      targets: [
        { id: 21, speedRaw: 120 },
        { id: 22, speedRaw: 60 },
        { id: 23, speedRaw: 120 }
      ]
    });
  });
});
