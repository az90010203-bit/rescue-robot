import { describe, expect, it } from "vitest";
import {
  analyzeArmTuning,
  createArmTuningProbeSequence,
  forwardKinematics2d,
  solvePlanarIk
} from "./armKinematics";
import type { ArmConfig, ArmJointConfig } from "./storage";

describe("2D arm kinematics", () => {
  it("calculates forward kinematics from logical angle minus neutral angle", () => {
    const result = forwardKinematics2d(
      createConfig([
        joint({ id: "base", lengthPx: 100, angleDeg: 90, neutralDeg: 90 }),
        joint({ id: "elbow", lengthPx: 50, angleDeg: 180, neutralDeg: 90 })
      ]),
      { origin: { x: 0, y: 0 } }
    );

    expect(result.joints[0].end).toEqual({ x: 100, y: 0 });
    expect(Math.round(result.endEffector.x)).toBe(100);
    expect(Math.round(result.endEffector.y)).toBe(-50);
    expect(result.totalLengthPx).toBe(150);
  });

  it("uses L-shaped link geometry for forward kinematics", () => {
    const result = forwardKinematics2d(
      createConfig([
        joint({
          id: "base",
          lengthPx: 80,
          shapeSegments: [
            { id: "main", name: "Main", lengthPx: 80, directionDeg: 0 },
            { id: "rise", name: "Rise", lengthPx: 40, directionDeg: 90 }
          ]
        })
      ]),
      { origin: { x: 0, y: 0 } }
    );

    expect(result.endEffector).toEqual({ x: 80, y: -40 });
    expect(result.totalLengthPx).toBe(120);
  });

  it("keeps disabled joints in the chain but does not move them during IK", () => {
    const config = createConfig([
      joint({ id: "base", angleDeg: 90, neutralDeg: 90, enabled: false }),
      joint({ id: "elbow", angleDeg: 90, neutralDeg: 90, enabled: true })
    ]);

    const solution = solvePlanarIk(config, { x: 0, y: -160 }, { origin: { x: 0, y: 0 } });

    expect(solution.movedJointIds).not.toContain("base");
    expect(solution.config.joints[0].angleDeg).toBe(90);
    expect(solution.movedJointIds).toContain("elbow");
  });

  it("solves a reachable 2D IK target", () => {
    const config = createConfig([
      joint({ id: "base", lengthPx: 100, angleDeg: 90, neutralDeg: 90 }),
      joint({ id: "elbow", lengthPx: 80, angleDeg: 90, neutralDeg: 90 })
    ]);

    const solution = solvePlanarIk(config, { x: 100, y: -80 }, { origin: { x: 0, y: 0 }, tolerancePx: 1 });

    expect(solution.reachable).toBe(true);
    expect(solution.converged).toBe(true);
    expect(solution.errorPx).toBeLessThanOrEqual(1);
  });

  it("solves IK targets using L-shaped link geometry", () => {
    const config = createConfig([
      joint({
        id: "base",
        lengthPx: 80,
        angleDeg: 90,
        neutralDeg: 90,
        shapeSegments: [
          { id: "main", name: "Main", lengthPx: 80, directionDeg: 0 },
          { id: "rise", name: "Rise", lengthPx: 40, directionDeg: 90 }
        ]
      })
    ]);

    const solution = solvePlanarIk(config, { x: 40, y: -80 }, { origin: { x: 0, y: 0 }, tolerancePx: 0.5 });

    expect(solution.converged).toBe(true);
    expect(solution.errorPx).toBeLessThanOrEqual(0.5);
    expect(solution.movedJointIds).toEqual(["base"]);
  });

  it("reports an unreachable IK target without exceeding servo span", () => {
    const config = createConfig([
      joint({ id: "base", servoId: 1, lengthPx: 80, angleDeg: 90, neutralDeg: 90 }),
      joint({ id: "elbow", servoId: 2, lengthPx: 60, angleDeg: 90, neutralDeg: 90 })
    ]);

    const solution = solvePlanarIk(config, { x: 500, y: 0 }, { origin: { x: 0, y: 0 }, servos: [{ id: 1, name: "Base", minDeg: 0, maxDeg: 180 }] });

    expect(solution.reachable).toBe(false);
    expect(solution.converged).toBe(false);
    expect(solution.config.joints[0].angleDeg).toBeGreaterThanOrEqual(0);
    expect(solution.config.joints[0].angleDeg).toBeLessThanOrEqual(180);
  });
});

describe("arm tuning analysis", () => {
  it("recommends more motion authority for large position lag with normal feedback", () => {
    const report = analyzeArmTuning(
      createConfig([joint({ servoId: 1, angleDeg: 120, speedRaw: 800, acc: 30 })]),
      { 1: { positionDeg: 90, loadRaw: 100, currentRaw: 100, temperatureC: 35, moving: false } }
    );

    expect(report.status).toBe("warning");
    expect(report.suggestedCount).toBe(1);
    expect(report.joints[0].reasons).toEqual(expect.arrayContaining(["positionLag", "increaseMotion"]));
    expect(report.joints[0].suggestedSpeedRaw).toBeGreaterThan(800);
    expect(report.joints[0].suggestedAcc).toBeGreaterThan(30);
  });

  it("reduces speed and acceleration when load, current, or temperature are high", () => {
    const report = analyzeArmTuning(
      createConfig([joint({ servoId: 1, speedRaw: 1000, acc: 40 })]),
      { 1: { positionDeg: 90, loadRaw: 760, currentRaw: 950, temperatureC: 73 } }
    );

    expect(report.status).toBe("danger");
    expect(report.joints[0].reasons).toEqual(expect.arrayContaining(["loadHigh", "currentHigh", "temperatureHigh", "decreaseMotion"]));
    expect(report.joints[0].suggestedSpeedRaw).toBeLessThan(1000);
    expect(report.joints[0].suggestedAcc).toBeLessThan(40);
  });

  it("marks missing feedback without changing tuning values", () => {
    const report = analyzeArmTuning(createConfig([joint({ servoId: 1, speedRaw: 700, acc: 20 })]), {});

    expect(report.status).toBe("warning");
    expect(report.suggestedCount).toBe(0);
    expect(report.joints[0]).toMatchObject({
      reasons: ["feedbackMissing"],
      severity: "warning",
      suggestedSpeedRaw: 700,
      suggestedAcc: 20
    });
  });

  it("skips disabled joints", () => {
    const report = analyzeArmTuning(createConfig([joint({ enabled: false })]), {});

    expect(report.canProbe).toBe(false);
    expect(report.joints[0].reasons).toEqual(["disabled"]);
    expect(report.joints[0].severity).toBe("info");
  });
});

describe("arm tuning probe sequence", () => {
  it("creates small plus/minus/return probes for each enabled joint", () => {
    const sequence = createArmTuningProbeSequence(
      createConfig([
        joint({ id: "base", angleDeg: 90 }),
        joint({ id: "elbow", angleDeg: 10 }),
        joint({ id: "disabled", angleDeg: 90, enabled: false })
      ]),
      { stepDeg: 5 }
    );

    expect(sequence.map((config) => config.joints.map((item) => [item.id, item.angleDeg]))).toEqual([
      [
        ["base", 95],
        ["elbow", 10],
        ["disabled", 90]
      ],
      [
        ["base", 85],
        ["elbow", 10],
        ["disabled", 90]
      ],
      [
        ["base", 90],
        ["elbow", 10],
        ["disabled", 90]
      ],
      [
        ["base", 90],
        ["elbow", 15],
        ["disabled", 90]
      ],
      [
        ["base", 90],
        ["elbow", 5],
        ["disabled", 90]
      ],
      [
        ["base", 90],
        ["elbow", 10],
        ["disabled", 90]
      ]
    ]);
  });
});

function createConfig(joints: ArmJointConfig[]): ArmConfig {
  return {
    joints,
    liveDragEnabled: false,
    selectedJointId: joints[0]?.id ?? null
  };
}

function joint(overrides: Partial<ArmJointConfig> = {}): ArmJointConfig {
  return {
    id: "joint",
    name: "Joint",
    servoId: 1,
    lengthPx: 80,
    angleDeg: 90,
    neutralDeg: 90,
    speedRaw: 800,
    acc: 30,
    reverse: false,
    enabled: true,
    ...overrides
  };
}
