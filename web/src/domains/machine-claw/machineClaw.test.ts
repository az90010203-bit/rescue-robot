import { describe, expect, it } from "vitest";
import {
  DEFAULT_MACHINE_CLAW_TEST_CONFIG,
  buildMachineClawClawCommand,
  buildMachineClawPitchCommands,
  buildMachineClawReadCommand,
  buildMachineClawRotationCommands,
  buildMachineClawStopCommands,
  machineClawFeedbackPositionRaw,
  nextMachineClawTurnProgress,
  normalizeMachineClawTestConfig
} from "@domains/machine-claw/machineClaw";
import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";

describe("machine claw commands", () => {
  it("builds pitch commands with ID21 and ID23 moving in opposed signed directions", () => {
    const commands = buildMachineClawPitchCommands(DEFAULT_MACHINE_CLAW_TEST_CONFIG, "positive", seq());

    expect(speedTarget(commands[0])).toEqual({ id: 21, speedRaw: 300, acc: 50 });
    expect(speedTarget(commands[1])).toEqual({ id: 23, speedRaw: -300, acc: 50 });

    const reversed = buildMachineClawPitchCommands(
      { ...DEFAULT_MACHINE_CLAW_TEST_CONFIG, pitchReverse: true },
      "negative",
      seq()
    );

    expect(speedTarget(reversed[0])?.speedRaw).toBe(300);
    expect(speedTarget(reversed[1])?.speedRaw).toBe(-300);
  });

  it("builds rotation commands with ID21 and ID23 aligned and ID22 at its own follow speed", () => {
    const commands = buildMachineClawRotationCommands(DEFAULT_MACHINE_CLAW_TEST_CONFIG, "positive", seq());

    expect(commands.map(speedTarget)).toEqual([
      { id: 21, speedRaw: 300, acc: 50 },
      { id: 23, speedRaw: 300, acc: 50 },
      { id: 22, speedRaw: 120, acc: 50 }
    ]);

    const reversed = buildMachineClawRotationCommands(
      { ...DEFAULT_MACHINE_CLAW_TEST_CONFIG, rotationReverse: true, rotationClawReverse: true },
      "positive",
      seq()
    );

    expect(reversed.map((command) => speedTarget(command)?.speedRaw)).toEqual([-300, -300, -120]);
  });

  it("builds open and close commands for ID22 and supports claw reverse", () => {
    const open = buildMachineClawClawCommand(DEFAULT_MACHINE_CLAW_TEST_CONFIG, "open", seq());
    const close = buildMachineClawClawCommand(DEFAULT_MACHINE_CLAW_TEST_CONFIG, "close", seq());
    const reversedOpen = buildMachineClawClawCommand({ ...DEFAULT_MACHINE_CLAW_TEST_CONFIG, clawReverse: true }, "open", seq());

    expect(speedTarget(open)).toEqual({ id: 22, speedRaw: 220, acc: 50 });
    expect(speedTarget(close)).toEqual({ id: 22, speedRaw: -220, acc: 50 });
    expect(speedTarget(reversedOpen)).toEqual({ id: 22, speedRaw: -220, acc: 50 });
  });

  it("normalizes missing and out-of-range config values", () => {
    expect(normalizeMachineClawTestConfig(undefined)).toEqual(DEFAULT_MACHINE_CLAW_TEST_CONFIG);
    expect(
      normalizeMachineClawTestConfig({
        pitchSpeedRaw: 5000,
        rotationSpeedRaw: "240",
        rotationClawSpeedRaw: -10,
        clawSpeedRaw: 55.6,
        acc: 999,
        pitchReverse: true,
        openTurns: "2.345",
        closeTurns: 0,
        pitchLimitTurns: "3.456",
        rotationLimitTurns: 0,
        protectionCurrentMa: 9999,
        protectionLoadPercent: 120,
        protectionTemperatureC: 120,
        protectionStallMs: 10,
        protectionMinRawDelta: 99,
        protectionEnabled: false
      })
    ).toEqual({
      ...DEFAULT_MACHINE_CLAW_TEST_CONFIG,
      pitchSpeedRaw: 1000,
      rotationSpeedRaw: 240,
      rotationClawSpeedRaw: 0,
      clawSpeedRaw: 56,
      acc: 254,
      pitchReverse: true,
      openTurns: 2.35,
      closeTurns: 0.01,
      pitchLimitTurns: 3.46,
      rotationLimitTurns: 0.01,
      protectionCurrentMa: 5000,
      protectionLoadPercent: 100,
      protectionTemperatureC: 100,
      protectionStallMs: 120,
      protectionMinRawDelta: 64,
      protectionEnabled: false
    });
  });

  it("tracks ID22 wheel turns from semantic servo feedback and stops with wheel setup disabled", () => {
    const feedback: InboundMessage = { type: "servo.feedback", seq: 7, id: 22, positionRaw: 100 };

    expect(machineClawFeedbackPositionRaw(feedback)).toBe(100);
    expect(buildMachineClawReadCommand(8)).toEqual({ type: "servo.read", seq: 8, id: 22 });

    const progress = nextMachineClawTurnProgress(4000, 100, 300, {
      completedTurns: 0,
      targetTurns: 0.04,
      running: true
    });

    expect(progress.completedTurns).toBeCloseTo(0.04, 5);
    expect(progress.running).toBe(false);

    const stops = buildMachineClawStopCommands(seq());
    expect(stops.map(speedTarget)).toEqual([
      { id: 21, speedRaw: 0, acc: 50 },
      { id: 22, speedRaw: 0, acc: 50 },
      { id: 23, speedRaw: 0, acc: 50 }
    ]);
    expect(stops.every((command) => command.setupWheelMode === false)).toBe(true);
  });
});

function seq() {
  let value = 1;
  return () => value++;
}

function speedTarget(command: PcCommand) {
  const targets = command.targets;
  if (!Array.isArray(targets)) {
    return null;
  }
  return targets[0];
}
