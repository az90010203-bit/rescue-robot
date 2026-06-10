import { describe, expect, it } from "vitest";
import { isLatestWinsAboardMotorBatch, isLatestWinsAboardMotorCommand, shouldClearPendingAboardMotion } from "@adapters/pi/aBoardCommandScheduling";

describe("A board command scheduling", () => {
  it("treats semantic motion commands as latest-wins motion", () => {
    const command = { type: "motor.target" as const, seq: 1, channel: "M1", speedPercent: 20 };

    expect(isLatestWinsAboardMotorCommand(command)).toBe(true);
    expect(isLatestWinsAboardMotorBatch([
      command,
      { type: "mecanum.target", seq: 2, forward: 0.2, strafe: 0, turn: 0, speedLimitPercent: 40 },
      { type: "can_servo.move", seq: 3, id: 1, position: 8192, speed: 300 },
      { type: "can_servo.group_move", seq: 4, targets: [{ id: 1, position: 8192 }], speed: 300 }
    ])).toBe(true);
    expect(shouldClearPendingAboardMotion(command)).toBe(false);
  });

  it("keeps stop, read, and config commands on the FIFO path", () => {
    const stop = { type: "motor.stop", seq: 3, channel: "M1", stopMode: "brake" };
    const read = { type: "motor.read", seq: 4, channel: "M1" };
    const config = { type: "motor.config", seq: 5, channel: "M1", pins: {} };

    expect(isLatestWinsAboardMotorBatch([stop])).toBe(false);
    expect([stop, read, config].every(shouldClearPendingAboardMotion)).toBe(true);
  });
});
