import { describe, expect, it } from "vitest";
import { ROBOT_PROFILE, type LiteArmProfile } from "../robotProfile";
import {
  applyArmJoystickStep,
  buildLiteArmMoveCommand,
  createLiteArmRuntimeState,
  normalizeLiteArmProfile,
  solveTwoLinkArmIk
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
    const command = buildLiteArmMoveCommand(77, solution, profile);

    expect(command).toMatchObject({
      type: "servo.move",
      seq: 77,
      sync: true,
      targets: [
        { id: 9, name: "J1", speedRaw: 300, acc: 30 },
        { id: 10, name: "J2", speedRaw: 300, acc: 30 }
      ]
    });
  });
});
