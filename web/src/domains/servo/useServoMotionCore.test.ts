import { describe, expect, it, vi } from "vitest";
import {
  ACC_ADDR,
  GOAL_POSITION_ADDR,
  MODE_ADDR,
  TORQUE_ENABLE_ADDR,
  normalizeServoProfile
} from "@adapters/hardware/protocol";
import type { ArmConfig } from "@adapters/persistence/storage";
import { useServoMotionCore } from "@domains/servo/useServoMotionCore";

function createCore(overrides: Partial<Parameters<typeof useServoMotionCore>[0]> = {}) {
  return useServoMotionCore({
    addSystemLog: vi.fn(),
    armConfig: { joints: [] } as unknown as ArmConfig,
    enqueueServoSerialTask: vi.fn((task) => task()),
    lastServoPhysicalAngleRef: { current: {} },
    lastServoWheelSpeedRef: { current: {} },
    livePositionModeServoRef: { current: new Set<number>() },
    sendServoFrameUnlocked: vi.fn(async () => null),
    servoBusConnected: vi.fn(() => true),
    servoFeedback: {},
    servoLinkageGroupsRef: { current: [] },
    servoMotionGenerationRef: { current: {} },
    setServoMotionStatusById: vi.fn(),
    ...overrides
  });
}

describe("useServoMotionCore", () => {
  it("does not torque off during a live position write when position mode is already prepared", async () => {
    const sent: Array<{ frame: number[]; options?: unknown }> = [];
    const sendServoFrameUnlocked = vi.fn(async (frame: number[], _waitMs?: number, _logFrame?: boolean, options?: unknown) => {
      sent.push({ frame, options });
      return null;
    });
    const core = createCore({
      livePositionModeServoRef: { current: new Set([7]) },
      sendServoFrameUnlocked
    });
    const servo = normalizeServoProfile({ id: 7, name: "ID7" });

    await core.writeServoPositionUnlocked({
      servo,
      physicalAngleDeg: 90,
      speedRaw: 300,
      acc: undefined,
      waitMs: 12,
      logFrame: false,
      live: true
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].frame[5]).toBe(GOAL_POSITION_ADDR);
    expect(sent[0].options).toEqual({
      policy: "latest",
      coalesceKey: "servo:7:position",
      minIntervalMs: 40,
      ackDrainMs: 4
    });
  });

  it("keeps non-live position writes on the safe one-time mode preparation path", async () => {
    const sent: number[][] = [];
    const core = createCore({
      sendServoFrameUnlocked: vi.fn(async (frame: number[]) => {
        sent.push(frame);
        return null;
      })
    });
    const servo = normalizeServoProfile({ id: 8, name: "ID8" });

    await core.writeServoPositionUnlocked({
      servo,
      physicalAngleDeg: 90,
      speedRaw: 300,
      acc: 30,
      waitMs: 80,
      logFrame: true
    });

    expect(sent).toHaveLength(4);
    expect(sent[0][5]).toBe(TORQUE_ENABLE_ADDR);
    expect(sent[0][6]).toBe(0);
    expect(sent[1][5]).toBe(MODE_ADDR);
    expect(sent[1][6]).toBe(0);
    expect(sent[2][5]).toBe(TORQUE_ENABLE_ADDR);
    expect(sent[2][6]).toBe(1);
    expect(sent[3][5]).toBe(ACC_ADDR);
  });
});
