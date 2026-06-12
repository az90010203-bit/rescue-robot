import { describe, expect, it } from "vitest";
import { ROBOT_PROFILE } from "./robotProfile";

describe("web-lite fixed robot profile", () => {
  it("fixes the CAN group to four ASMG-MD servos on one bus", () => {
    expect(ROBOT_PROFILE.can.servos).toHaveLength(4);
    expect(ROBOT_PROFILE.can.servos.map((servo) => servo.id)).toEqual([1, 2, 3, 4]);
    expect(new Set(ROBOT_PROFILE.can.servos.map((servo) => `${servo.canBus}:${servo.bitrateKbps}`))).toEqual(new Set(["CAN1:250"]));
    expect(ROBOT_PROFILE.canJog.positions).toEqual({
      leftFront: 4,
      rightFront: 1,
      leftRear: 3,
      rightRear: 2
    });
    expect(ROBOT_PROFILE.canJog.frontIds).toEqual([4, 1]);
    expect(ROBOT_PROFILE.canJog.rearIds).toEqual([3, 2]);
  });

  it("keeps the fixed Feetech and PWM servo defaults available without database lookup", () => {
    expect(ROBOT_PROFILE.feetech.servos).toEqual([expect.objectContaining({ id: 22, name: "ID22" })]);
    expect(ROBOT_PROFILE.pwmServos.map((servo) => `${servo.silk}:${servo.pin}`)).toEqual(["S:PA0", "T:PA1", "U:PA2", "V:PA3"]);
  });

  it("fixes the M1-M6 drive profile with M5/M6 tracks", () => {
    expect(ROBOT_PROFILE.motors.map((motor) => motor.channel)).toEqual(["M1", "M2", "M3", "M4", "M5", "M6"]);
    expect(ROBOT_PROFILE.drive).toMatchObject({
      speedLimitPercent: 35,
      stopMode: "brake",
      mecanum: { frontLeft: "M3", frontRight: "M1", rearLeft: "M4", rearRight: "M2" },
      tracked: { left: "M5", right: "M6" }
    });
    expect(ROBOT_PROFILE.motors[4]).toMatchObject({ channel: "M5", pwmPin: "PH10", in1Pin: "PA0", in2Pin: "PA1" });
    expect(ROBOT_PROFILE.motors[5]).toMatchObject({ channel: "M6", pwmPin: "PD12", in1Pin: "PF1", in2Pin: "PE5" });
  });
});
