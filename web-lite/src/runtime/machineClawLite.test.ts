import { describe, expect, it } from "vitest";
import type { InboundMessage } from "@adapters/hardware/protocol";
import {
  DEFAULT_MACHINE_CLAW_TEST_CONFIG,
  buildMachineClawClawCommand,
  buildMachineClawPitchCommands,
  buildMachineClawRotationCommands,
  buildMachineClawStopCommands,
  nextMachineClawTurnProgress
} from "@domains/machine-claw/machineClaw";
import type { PiServoCommandResult } from "./bridgeClient";
import {
  MACHINE_CLAW_STORAGE_KEY,
  machineClawPositionRawFromResult,
  readMachineClawConfig,
  saveMachineClawConfig
} from "./machineClawLite";

describe("web-lite machine claw runtime", () => {
  it("normalizes default and stored machine claw config", () => {
    const storage = createStorage();

    expect(readMachineClawConfig(storage)).toEqual(DEFAULT_MACHINE_CLAW_TEST_CONFIG);

    storage.setItem(MACHINE_CLAW_STORAGE_KEY, JSON.stringify({
      pitchSpeedRaw: "240",
      rotationSpeedRaw: 1200,
      rotationClawSpeedRaw: 90.4,
      clawSpeedRaw: "bad",
      acc: 999,
      pitchReverse: true,
      openTurns: "2.456",
      closeTurns: 0,
      protectionEnabled: false,
      protectionCurrentMa: 9000
    }));

    expect(readMachineClawConfig(storage)).toEqual({
      ...DEFAULT_MACHINE_CLAW_TEST_CONFIG,
      pitchSpeedRaw: 240,
      rotationSpeedRaw: 1000,
      rotationClawSpeedRaw: 90,
      acc: 254,
      pitchReverse: true,
      openTurns: 2.46,
      closeTurns: 0.01,
      protectionEnabled: false,
      protectionCurrentMa: 5000
    });
  });

  it("persists normalized machine claw config", () => {
    const storage = createStorage();

    saveMachineClawConfig({
      ...DEFAULT_MACHINE_CLAW_TEST_CONFIG,
      closeTurns: 3.333,
      clawReverse: true,
      protectionCurrentMa: 9000
    }, storage);

    expect(JSON.parse(storage.getItem(MACHINE_CLAW_STORAGE_KEY) ?? "{}")).toMatchObject({
      closeTurns: 3.33,
      clawReverse: true,
      protectionCurrentMa: 5000
    });
  });

  it("reuses the shared machine claw command direction semantics", () => {
    const pitch = buildMachineClawPitchCommands(DEFAULT_MACHINE_CLAW_TEST_CONFIG, "positive", seq());
    const rotation = buildMachineClawRotationCommands(DEFAULT_MACHINE_CLAW_TEST_CONFIG, "positive", seq());
    const open = buildMachineClawClawCommand(DEFAULT_MACHINE_CLAW_TEST_CONFIG, "open", seq());

    expect(pitch.map(speedTarget)).toEqual([
      { id: 21, speedRaw: 300, acc: 50 },
      { id: 23, speedRaw: -300, acc: 50 }
    ]);
    expect(rotation.map(speedTarget)).toEqual([
      { id: 21, speedRaw: 300, acc: 50 },
      { id: 23, speedRaw: 300, acc: 50 },
      { id: 22, speedRaw: 120, acc: 50 }
    ]);
    expect(speedTarget(open)).toEqual({ id: 22, speedRaw: 220, acc: 50 });
  });

  it("extracts ID22 feedback from Pi servo bridge responses", () => {
    const feedback: InboundMessage = { type: "servo.feedback", seq: 9, id: 22, positionRaw: 512 };
    const result: PiServoCommandResult = {
      ok: true,
      messages: [{ type: "ack", seq: 8, command: "servo.read" }, feedback],
      response: null
    };

    expect(machineClawPositionRawFromResult(result)).toBe(512);
  });

  it("tracks ID22 wheel turns and stops only the claw at the limit", () => {
    const progress = nextMachineClawTurnProgress(4000, 100, 300, {
      completedTurns: 0,
      targetTurns: 0.04,
      running: true
    });
    const stops = buildMachineClawStopCommands(seq(), [22]);

    expect(progress.running).toBe(false);
    expect(stops.map(speedTarget)).toEqual([{ id: 22, speedRaw: 0, acc: 50 }]);
    expect(stops[0].setupWheelMode).toBe(false);
  });
});

function seq() {
  let value = 1;
  return () => value++;
}

function speedTarget(command: { targets?: unknown }) {
  return Array.isArray(command.targets) ? command.targets[0] : null;
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    }
  };
}
