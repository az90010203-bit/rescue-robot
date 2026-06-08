import { describe, expect, it } from "vitest";
import { calculateArmSegmentPoses, type ArmConfig, type ArmJointConfig } from "@adapters/persistence/storage";
import { buildArmThreeModel } from "@domains/arm/armThreeModel";

function joint(partial: Partial<ArmJointConfig> = {}): ArmJointConfig {
  return {
    acc: 30,
    angleDeg: 90,
    childFrameOffsetDeg: 0,
    enabled: true,
    id: "joint-1",
    lengthPx: 100,
    name: "Joint 1",
    neutralDeg: 90,
    reverse: false,
    servoId: 1,
    shapeSegments: [{ id: "main", name: "Main", lengthPx: 100, directionDeg: 0 }],
    speedRaw: 800,
    ...partial
  };
}

describe("buildArmThreeModel", () => {
  it("maps 2D arm shape segments into scaled 3D links", () => {
    const armConfig: ArmConfig = {
      joints: [
        joint({
          shapeSegments: [
            { id: "fore", name: "Fore", lengthPx: 60, directionDeg: 0 },
            { id: "wrist", name: "Wrist", lengthPx: 40, directionDeg: 90 }
          ]
        })
      ],
      liveDragEnabled: false,
      selectedJointId: "joint-1"
    };
    const poses = calculateArmSegmentPoses(armConfig.joints, { x: 300, y: 250 });

    const model = buildArmThreeModel(armConfig, poses, { scale: 0.01 });

    expect(model.isEmpty).toBe(false);
    expect(model.links).toHaveLength(2);
    expect(model.links[0]).toMatchObject({
      id: "joint-1:fore",
      jointId: "joint-1",
      selected: true,
      enabled: true,
      servoId: 1
    });
    expect(model.links[0].start).toEqual({ x: 0, y: 0, z: 0 });
    expect(model.links[0].end).toEqual({ x: 0.6, y: 0, z: 0 });
    expect(model.links[1].end.x).toBeCloseTo(0.6, 5);
    expect(model.links[1].end.y).toBeCloseTo(0.4, 5);
    expect(model.endEffector).toEqual(model.links[1].end);
  });

  it("keeps disabled and selected joint state on the generated model", () => {
    const armConfig: ArmConfig = {
      joints: [joint({ enabled: false, id: "disabled-joint", servoId: 8 })],
      liveDragEnabled: false,
      selectedJointId: "disabled-joint"
    };
    const poses = calculateArmSegmentPoses(armConfig.joints, { x: 300, y: 250 });

    const model = buildArmThreeModel(armConfig, poses);

    expect(model.links[0]).toMatchObject({ enabled: false, selected: true, servoId: 8 });
    expect(model.jointMarkers[0]).toMatchObject({ enabled: false, selected: true, servoId: 8 });
  });

  it("returns an empty model anchored at the base when no arm joints exist", () => {
    const armConfig: ArmConfig = {
      joints: [],
      liveDragEnabled: false,
      selectedJointId: null
    };

    const model = buildArmThreeModel(armConfig, [], { scale: 0.01 });

    expect(model.isEmpty).toBe(true);
    expect(model.links).toEqual([]);
    expect(model.jointMarkers).toEqual([]);
    expect(model.base).toEqual({ x: 0, y: 0, z: 0 });
    expect(model.endEffector).toEqual(model.base);
  });
});
