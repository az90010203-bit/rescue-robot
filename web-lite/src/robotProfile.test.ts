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
    expect(ROBOT_PROFILE.feetech.servos).toEqual([
      expect.objectContaining({ id: 9, name: "J1" }),
      expect.objectContaining({ id: 10, name: "J2" }),
      expect.objectContaining({ id: 21, name: "Claw Pitch L" }),
      expect.objectContaining({ id: 22, name: "Claw Open" }),
      expect.objectContaining({ id: 23, name: "Claw Pitch R" })
    ]);
    expect(ROBOT_PROFILE.arm).toMatchObject({
      j1ServoId: 9,
      j2ServoId: 10,
      calibrated: false,
      gravityCompensationEnabled: false,
      gravityMaxBiasDeg: 6
    });
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

  it("publishes operator-facing role groups without making hardware editable", () => {
    expect(ROBOT_PROFILE.operation.roles).toEqual([
      expect.objectContaining({ id: "mecanum", deviceRefs: ["M1", "M2", "M3", "M4"], required: true }),
      expect.objectContaining({ id: "tracked", deviceRefs: ["M5", "M6"], required: true }),
      expect.objectContaining({ id: "arm", deviceRefs: ["ID9", "ID10"], required: true }),
      expect.objectContaining({ id: "claw", deviceRefs: ["ID21", "ID22", "ID23"], required: true }),
      expect.objectContaining({ id: "imu", deviceRefs: ["MPU6500", "IST8310"], required: true }),
      expect.objectContaining({ id: "can", deviceRefs: ["CAN J1", "CAN J2", "CAN J3", "CAN J4"], required: false }),
      expect.objectContaining({ id: "pwm", deviceRefs: ["S", "T", "U", "V"], required: false })
    ]);
  });
});
