import { describe, expect, it } from "vitest";
import { DEFAULT_MACHINE_CLAW_TEST_CONFIG } from "@domains/machine-claw/machineClaw";
import type { InboundMessage } from "@adapters/hardware/protocol";
import {
  createMachineClawProtectionServoRuntime,
  evaluateMachineClawProtectionFeedback
} from "./machineClawProtection";

describe("machine claw protection", () => {
  it("trips on high current before waiting for turn progress", () => {
    const runtime = createMachineClawProtectionServoRuntime(22, 100, 220, 1000, 1);
    const feedback: InboundMessage = { type: "servo.feedback", seq: 1, id: 22, positionRaw: 102, currentMa: 1500 };

    const result = evaluateMachineClawProtectionFeedback(runtime, feedback, DEFAULT_MACHINE_CLAW_TEST_CONFIG, 1100);

    expect(result.trip).toMatchObject({ id: 22, reason: "current" });
  });

  it("trips on high load and temperature feedback", () => {
    const loadRuntime = createMachineClawProtectionServoRuntime(21, 500, 300, 1000, null);
    const load = evaluateMachineClawProtectionFeedback(
      loadRuntime,
      { type: "servo.feedback", seq: 2, id: 21, positionRaw: 510, loadPercent: -92 },
      DEFAULT_MACHINE_CLAW_TEST_CONFIG,
      1200
    );

    const tempRuntime = createMachineClawProtectionServoRuntime(23, 500, 300, 1000, null);
    const temperature = evaluateMachineClawProtectionFeedback(
      tempRuntime,
      { type: "servo.feedback", seq: 3, id: 23, positionRaw: 510, temperatureC: 78 },
      DEFAULT_MACHINE_CLAW_TEST_CONFIG,
      1200
    );

    expect(load.trip?.reason).toBe("load");
    expect(temperature.trip?.reason).toBe("temperature");
  });

  it("trips at a wheel turn limit", () => {
    const runtime = createMachineClawProtectionServoRuntime(22, 4000, 220, 1000, 0.04);
    const result = evaluateMachineClawProtectionFeedback(
      runtime,
      { type: "servo.feedback", seq: 4, id: 22, positionRaw: 100 },
      DEFAULT_MACHINE_CLAW_TEST_CONFIG,
      1180
    );

    expect(result.trip).toMatchObject({ reason: "turnLimit" });
    expect(result.runtime.completedTurns).toBeCloseTo(0.04, 2);
  });

  it("trips when commanded speed is active but raw position does not change", () => {
    const runtime = createMachineClawProtectionServoRuntime(21, 1000, 300, 1000, null);
    const config = { ...DEFAULT_MACHINE_CLAW_TEST_CONFIG, protectionStallMs: 300, protectionMinRawDelta: 3 };

    const result = evaluateMachineClawProtectionFeedback(
      runtime,
      { type: "servo.feedback", seq: 5, id: 21, positionRaw: 1001 },
      config,
      1400
    );

    expect(result.trip).toMatchObject({ reason: "stall" });
  });
});
