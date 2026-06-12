import { describe, expect, it } from "vitest";
import { ROBOT_PROFILE } from "./robotProfile";

describe("web-lite fixed robot profile", () => {
  it("fixes the CAN group to four ASMG-MD servos on one bus", () => {
    expect(ROBOT_PROFILE.can.servos).toHaveLength(4);
    expect(ROBOT_PROFILE.can.servos.map((servo) => servo.id)).toEqual([1, 2, 3, 4]);
    expect(new Set(ROBOT_PROFILE.can.servos.map((servo) => `${servo.canBus}:${servo.bitrateKbps}`))).toEqual(new Set(["CAN1:250"]));
  });

  it("keeps the fixed Feetech and PWM servo defaults available without database lookup", () => {
    expect(ROBOT_PROFILE.feetech.servos).toEqual([expect.objectContaining({ id: 22, name: "ID22" })]);
    expect(ROBOT_PROFILE.pwmServos.map((servo) => `${servo.silk}:${servo.pin}`)).toEqual(["S:PA0", "T:PA1", "U:PA2", "V:PA3"]);
  });
});
