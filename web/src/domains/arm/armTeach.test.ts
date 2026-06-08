import { describe, expect, it, vi } from "vitest";
import {
  ARM_TEACH_SOURCE,
  armTeachTrackToJson,
  armTeachTrackToJsonl,
  createArmTeachSampleFromFeedback,
  createArmTeachTrack,
  normalizeArmTeachTrack
} from "@domains/arm/armTeach";
import { ArmConfig, ArmJointConfig } from "@adapters/persistence/storage";
import { ServoProfile, angleDegToRaw } from "@adapters/hardware/protocol";

describe("arm teach tracks", () => {
  it("converts raw servo feedback into logical arm angles with reverse support", () => {
    const servo: ServoProfile = { id: 7, name: "J7", minDeg: 0, maxDeg: 180 };
    const joint: ArmJointConfig = createJoint({ servoId: 7, reverse: true });
    const sample = createArmTeachSampleFromFeedback({
      tMs: 123.4,
      joints: [joint],
      servos: [servo],
      feedbackByServoId: {
        7: { positionRaw: angleDegToRaw(45), speedRaw: 50, loadRaw: -30, voltageRaw: 121, temperatureC: 30, currentRaw: 12 }
      }
    });

    expect(sample).toMatchObject({
      tMs: 123,
      joints: [
        {
          jointId: "joint-1",
          servoId: 7,
          logicalAngleDeg: expect.closeTo(135, 0),
          physicalAngleDeg: expect.closeTo(45, 0),
          positionRaw: angleDegToRaw(45),
          speedRpm: 36.62,
          loadPercent: -3,
          voltageV: 12.1,
          temperatureC: 30,
          currentMa: 78
        }
      ]
    });
  });

  it("returns null when any enabled joint is missing feedback", () => {
    expect(
      createArmTeachSampleFromFeedback({
        tMs: 0,
        joints: [createJoint({ servoId: 1 }), createJoint({ id: "joint-2", servoId: 2 })],
        servos: [
          { id: 1, name: "J1" },
          { id: 2, name: "J2" }
        ],
        feedbackByServoId: {
          1: { positionRaw: 100 }
        }
      })
    ).toBeNull();
  });

  it("normalizes tracks and drops samples that reference missing joints", () => {
    const config: ArmConfig = {
      joints: [createJoint({ id: "base", servoId: 10 })],
      liveDragEnabled: false,
      selectedJointId: "base"
    };
    const track = normalizeArmTeachTrack(
      {
        id: "track-1",
        name: " Pick ",
        createdAt: 1,
        updatedAt: 2,
        durationMs: 100,
        sampleIntervalMs: 100,
        jointIds: ["base", "old"],
        servoIds: [10, 99],
        metadata: { source: "hardware-drag", notes: " demo " },
        samples: [
          { tMs: 0, joints: [{ jointId: "base", servoId: 10, logicalAngleDeg: 20, physicalAngleDeg: 30, positionRaw: 341 }] },
          { tMs: 100, joints: [{ jointId: "old", servoId: 99, logicalAngleDeg: 20, physicalAngleDeg: 30, positionRaw: 341 }] }
        ]
      },
      config
    );

    expect(track).toMatchObject({
      id: "track-1",
      name: "Pick",
      jointIds: ["base"],
      servoIds: [10],
      metadata: { source: ARM_TEACH_SOURCE, notes: "demo" },
      samples: [{ tMs: 0 }]
    });
    expect(track?.samples).toHaveLength(1);
  });

  it("exports stable JSON and JSONL payloads", () => {
    vi.setSystemTime(new Date("2026-06-03T00:00:00Z"));
    const track = createArmTeachTrack({
      id: "track-1",
      name: "Route A",
      createdAt: 10,
      updatedAt: 20,
      joints: [createJoint({ id: "base", servoId: 1 })],
      samples: [{ tMs: 0, joints: [{ jointId: "base", servoId: 1, logicalAngleDeg: 10, physicalAngleDeg: 20, positionRaw: 228 }] }],
      notes: "first pass"
    });

    expect(JSON.parse(armTeachTrackToJson(track))).toMatchObject({ id: "track-1", name: "Route A" });
    expect(armTeachTrackToJsonl(track)).toBe(
      JSON.stringify({
        trackId: "track-1",
        trackName: "Route A",
        createdAt: 10,
        source: "hardware-drag",
        taskLabel: "",
        notes: "first pass",
        tMs: 0,
        joints: [{ jointId: "base", servoId: 1, logicalAngleDeg: 10, physicalAngleDeg: 20, positionRaw: 228 }]
      })
    );
    vi.useRealTimers();
  });
});

function createJoint(overrides: Partial<ArmJointConfig> = {}): ArmJointConfig {
  return {
    id: "joint-1",
    name: "Joint",
    servoId: 1,
    lengthPx: 88,
    angleDeg: 90,
    neutralDeg: 90,
    speedRaw: 800,
    acc: 30,
    reverse: false,
    enabled: true,
    ...overrides
  };
}
