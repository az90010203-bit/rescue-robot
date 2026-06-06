import { describe, expect, it } from "vitest";
import {
  applyComponentArmTrajectorySample,
  createComponentArmTrajectoryArchive,
  createComponentArmTrajectorySample,
  deleteComponentArmTrajectoryArchive,
  normalizeComponentArmAutoConfig,
  shouldScheduleComponentArmIkLiveMove,
  upsertComponentArmTrajectoryArchive
} from "./componentArmAuto";
import type { ArmConfig, ArmJointConfig } from "../../lib/storage";

describe("component arm auto config", () => {
  it("creates a safe default auto config", () => {
    expect(normalizeComponentArmAutoConfig(undefined, createConfig([joint({ id: "base" })]))).toEqual({
      mode: "manual",
      sendMode: "preview",
      correctionEnabled: false,
      archives: []
    });
  });

  it("filters archived samples whose joints or servos no longer match", () => {
    const config = createConfig([joint({ id: "base", servoId: 1 }), joint({ id: "elbow", servoId: 2 })]);
    const normalized = normalizeComponentArmAutoConfig(
      {
        mode: "ik",
        sendMode: "live",
        correctionEnabled: true,
        archives: [
          {
            id: "archive",
            name: "Reach",
            createdAt: 10,
            updatedAt: 20,
            sampleIntervalMs: 100,
            durationMs: 200,
            jointIds: ["base", "missing"],
            servoIds: [1, 99],
            samples: [
              {
                tMs: 0,
                joints: [
                  { jointId: "base", servoId: 1, logicalAngleDeg: 110 },
                  { jointId: "missing", servoId: 99, logicalAngleDeg: 120 },
                  { jointId: "elbow", servoId: 99, logicalAngleDeg: 130 }
                ]
              },
              {
                tMs: 120,
                joints: [{ jointId: "missing", servoId: 99, logicalAngleDeg: 90 }]
              }
            ]
          }
        ]
      },
      config
    );

    expect(normalized.mode).toBe("ik");
    expect(normalized.sendMode).toBe("live");
    expect(normalized.correctionEnabled).toBe(false);
    expect(normalized.archives).toHaveLength(1);
    expect(normalized.archives[0].jointIds).toEqual(["base"]);
    expect(normalized.archives[0].servoIds).toEqual([1]);
    expect(normalized.archives[0].samples).toEqual([{ tMs: 0, joints: [{ jointId: "base", servoId: 1, logicalAngleDeg: 110 }] }]);
  });

  it("sorts multiple archives by updated time", () => {
    const config = createConfig([joint({ id: "base", servoId: 1 })]);
    const sample = { tMs: 0, joints: [{ jointId: "base", servoId: 1, logicalAngleDeg: 90 }] };

    const normalized = normalizeComponentArmAutoConfig(
      {
        archives: [
          { id: "old", name: "Old", createdAt: 1, updatedAt: 10, durationMs: 0, sampleIntervalMs: 100, jointIds: ["base"], servoIds: [1], samples: [sample] },
          { id: "new", name: "New", createdAt: 1, updatedAt: 30, durationMs: 0, sampleIntervalMs: 100, jointIds: ["base"], servoIds: [1], samples: [sample] }
        ]
      },
      config
    );

    expect(normalized.archives.map((archive) => archive.id)).toEqual(["new", "old"]);
  });

  it("captures and applies logical angle samples, including disabled joints", () => {
    const config = createConfig([
      joint({ id: "base", servoId: 1, angleDeg: 120 }),
      joint({ id: "elbow", servoId: 2, angleDeg: 45, enabled: false })
    ]);

    const sample = createComponentArmTrajectorySample(config, 125);
    const next = applyComponentArmTrajectorySample(
      createConfig([
        joint({ id: "base", servoId: 1, angleDeg: 10 }),
        joint({ id: "elbow", servoId: 2, angleDeg: 10, enabled: false })
      ]),
      sample
    );

    expect(sample).toEqual({
      tMs: 125,
      joints: [
        { jointId: "base", servoId: 1, logicalAngleDeg: 120 },
        { jointId: "elbow", servoId: 2, logicalAngleDeg: 45 }
      ]
    });
    expect(next.joints.map((joint) => [joint.id, joint.angleDeg])).toEqual([
      ["base", 120],
      ["elbow", 45]
    ]);
  });

  it("creates component trajectory archives from samples", () => {
    const config = createConfig([joint({ id: "base", servoId: 1 })]);
    const archive = createComponentArmTrajectoryArchive({
      id: "archive",
      name: "Reach",
      notes: "Template",
      createdAt: 100,
      updatedAt: 200,
      target: { x: 320, y: 180 },
      armConfig: config,
      samples: [createComponentArmTrajectorySample(config, 0), createComponentArmTrajectorySample({ ...config, joints: [joint({ id: "base", servoId: 1, angleDeg: 150 })] }, 300)]
    });

    expect(archive).toMatchObject({
      id: "archive",
      name: "Reach",
      notes: "Template",
      durationMs: 300,
      target: { x: 320, y: 180 },
      jointIds: ["base"],
      servoIds: [1]
    });
    expect(archive.samples).toHaveLength(2);
  });

  it("keeps IK preview local and gates live moves behind live drag", () => {
    const config = createConfig([joint({ id: "base", servoId: 1 })]);

    expect(shouldScheduleComponentArmIkLiveMove({ mode: "ik", sendMode: "preview", correctionEnabled: false, archives: [] }, { ...config, liveDragEnabled: true })).toBe(false);
    expect(shouldScheduleComponentArmIkLiveMove({ mode: "ik", sendMode: "live", correctionEnabled: false, archives: [] }, config)).toBe(false);
    expect(shouldScheduleComponentArmIkLiveMove({ mode: "ik", sendMode: "live", correctionEnabled: false, archives: [] }, { ...config, liveDragEnabled: true })).toBe(true);
  });

  it("upserts and deletes component trajectory archives", () => {
    const config = createConfig([joint({ id: "base", servoId: 1 })]);
    const oldArchive = createComponentArmTrajectoryArchive({
      id: "same",
      name: "Old",
      createdAt: 10,
      updatedAt: 20,
      armConfig: config,
      samples: [createComponentArmTrajectorySample(config, 0)]
    });
    const newArchive = createComponentArmTrajectoryArchive({
      id: "same",
      name: "New",
      createdAt: 10,
      updatedAt: 40,
      armConfig: config,
      samples: [createComponentArmTrajectorySample(config, 0)]
    });

    const archives = upsertComponentArmTrajectoryArchive([oldArchive], newArchive);
    expect(archives).toHaveLength(1);
    expect(archives[0].name).toBe("New");
    expect(deleteComponentArmTrajectoryArchive(archives, "same")).toEqual([]);
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
