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
    wheelModeServoRef: { current: new Set<number>() },
    nextSeq: vi.fn(() => 1),
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

  it("uses semantic Pi servo commands when a command sender is available", async () => {
    let seq = 20;
    const commands: unknown[] = [];
    const sendServoCommandUnlocked = vi.fn(async (command) => {
      commands.push(command);
      return { type: "ack", seq: (command as { seq: number }).seq, command: (command as { type: string }).type };
    });
    const sendServoFrameUnlocked = vi.fn();
    const core = createCore({
      livePositionModeServoRef: { current: new Set([7]) },
      nextSeq: () => seq++,
      sendServoCommandUnlocked,
      sendServoFrameUnlocked
    });
    const servo = normalizeServoProfile({ id: 7, name: "ID7" });

    await core.writeServoPositionUnlocked({
      servo,
      physicalAngleDeg: 135,
      speedRaw: 240,
      acc: 18,
      waitMs: 12,
      logFrame: false,
      live: true
    });

    expect(sendServoFrameUnlocked).not.toHaveBeenCalled();
    expect(commands).toEqual([
      {
        type: "servo.move",
        seq: 20,
        sync: false,
        targets: [{ id: 7, name: "ID7", angleDeg: 135, speedRaw: 240, acc: 18 }]
      }
    ]);
    expect(sendServoCommandUnlocked).toHaveBeenCalledWith(expect.any(Object), 12, false, {
      policy: "latest",
      coalesceKey: "servo:7:position",
      minIntervalMs: 40,
      ackDrainMs: 4
    });
  });

  it("uses a single semantic mode command before non-live position writes", async () => {
    let seq = 30;
    const commands: unknown[] = [];
    const core = createCore({
      nextSeq: () => seq++,
      sendServoCommandUnlocked: vi.fn(async (command) => {
        commands.push(command);
        return { type: "ack", seq: (command as { seq: number }).seq, command: (command as { type: string }).type };
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

    expect(commands).toEqual([
      { type: "servo.mode", seq: 30, id: 8, mode: "position" },
      {
        type: "servo.move",
        seq: 31,
        sync: false,
        targets: [{ id: 8, name: "ID8", angleDeg: 90, speedRaw: 300, acc: 30 }]
      }
    ]);
  });

  it("sends multi-servo live position updates as one latest synchronized command", async () => {
    let seq = 40;
    const commands: unknown[] = [];
    const sendServoCommandUnlocked = vi.fn(async (command) => {
      commands.push(command);
      return { type: "ack", seq: (command as { seq: number }).seq, command: (command as { type: string }).type };
    });
    const core = createCore({
      livePositionModeServoRef: { current: new Set([7, 8]) },
      nextSeq: () => seq++,
      sendServoCommandUnlocked,
      sendServoFrameUnlocked: vi.fn()
    });

    await core.writeServoGroupPositionUnlocked({
      coalesceKey: "arm:position",
      live: true,
      logFrame: false,
      waitMs: 12,
      targets: [
        { servo: normalizeServoProfile({ id: 7, name: "ID7" }), physicalAngleDeg: 135, speedRaw: 240, acc: 18 },
        { servo: normalizeServoProfile({ id: 8, name: "ID8" }), physicalAngleDeg: 90, speedRaw: 240, acc: 18 }
      ]
    });

    expect(commands).toEqual([
      {
        type: "servo.move",
        seq: 40,
        sync: true,
        targets: [
          { id: 7, name: "ID7", angleDeg: 135, speedRaw: 240, acc: 18 },
          { id: 8, name: "ID8", angleDeg: 90, speedRaw: 240, acc: 18 }
        ]
      }
    ]);
    expect(sendServoCommandUnlocked).toHaveBeenCalledWith(expect.any(Object), 12, false, {
      policy: "latest",
      coalesceKey: "arm:position",
      minIntervalMs: 40,
      ackDrainMs: 4
    });
  });

  it("caches wheel mode so repeated speed writes do not re-run setup", async () => {
    let seq = 50;
    const commands: unknown[] = [];
    const core = createCore({
      nextSeq: () => seq++,
      sendServoCommandUnlocked: vi.fn(async (command) => {
        commands.push(command);
        return { type: "ack", seq: (command as { seq: number }).seq, command: (command as { type: string }).type };
      })
    });
    const servo = normalizeServoProfile({ id: 9, name: "ID9" });

    await core.writeServoWheelSpeedUnlocked({ servo, speedRaw: 200, acc: 20, setupMode: true, waitMs: 60, logFrame: false });
    await core.writeServoWheelSpeedUnlocked({ servo, speedRaw: 260, acc: 20, setupMode: true, waitMs: 60, logFrame: false });

    expect(commands).toEqual([
      {
        type: "servo.speed",
        seq: 50,
        setupWheelMode: true,
        targets: [{ id: 9, name: "ID9", speedRaw: 200, acc: 20 }]
      },
      {
        type: "servo.speed",
        seq: 51,
        setupWheelMode: false,
        targets: [{ id: 9, name: "ID9", speedRaw: 260, acc: 20 }]
      }
    ]);
  });
});
