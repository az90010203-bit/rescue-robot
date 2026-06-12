import { describe, expect, it } from "vitest";
import { DEFAULT_PRIORITY_SETTINGS, normalizePrioritySettings, resolveCommandScheduling, withCommandScheduling } from "./priority";
import type { PcCommand } from "@adapters/hardware/protocol";

describe("web-lite priority settings", () => {
  it("normalizes invalid priority values back to fixed defaults", () => {
    expect(normalizePrioritySettings({ safety: "120", motor: -2, armServo: "x" })).toEqual({
      ...DEFAULT_PRIORITY_SETTINGS,
      safety: 120,
      motor: 0
    });
  });

  it("maps fixed command classes to the configured priorities", () => {
    expect(resolveCommandScheduling({ type: "mecanum.target" }, DEFAULT_PRIORITY_SETTINGS)).toMatchObject({
      commandClass: "motor",
      policy: "latest",
      priority: 80
    });
    expect(resolveCommandScheduling({ type: "can_servo.group_move" }, DEFAULT_PRIORITY_SETTINGS)).toMatchObject({
      commandClass: "can-servo",
      policy: "latest",
      priority: 40
    });
    expect(resolveCommandScheduling({ type: "can_servo.read" }, DEFAULT_PRIORITY_SETTINGS)).toMatchObject({
      commandClass: "telemetry",
      policy: "fifo",
      priority: 20
    });
  });

  it("keeps explicit command priority overrides inside the command envelope", () => {
    const command: PcCommand = { type: "can_servo.group_move", seq: 7, priority: 55, targets: [{ id: 1, position: 10 }], speed: 20 };
    expect(withCommandScheduling(command, DEFAULT_PRIORITY_SETTINGS)).toMatchObject({
      priority: 55,
      commandClass: "can-servo",
      policy: "latest"
    });
  });
});
