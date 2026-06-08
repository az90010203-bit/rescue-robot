import { describe, expect, it } from "vitest";
import {
  beginImuCalibration,
  calculateImuAttitude,
  createDefaultImuCalibration,
  updateImuCalibration
} from "@domains/drive/imuAttitude";

describe("RoboMaster A IMU attitude helpers", () => {
  it("calculates level roll and pitch from raw accelerometer data", () => {
    const attitude = calculateImuAttitude(
      {
        type: "imu.feedback",
        seq: 1,
        ready: true,
        accelRaw: { x: 0, y: 0, z: 4096 },
        gyroRaw: { x: 16.4, y: -32.8, z: 0 },
        magRaw: { x: 100, y: 0, z: 0 },
        sampleMs: 10
      },
      createDefaultImuCalibration(),
      1000
    );

    expect(attitude?.rollDeg).toBeCloseTo(0, 3);
    expect(attitude?.pitchDeg).toBeCloseTo(0, 3);
    expect(attitude?.yawDeg).toBeCloseTo(0, 3);
    expect(attitude?.gyroDps).toMatchObject({ x: 1, y: -2, z: 0 });
  });

  it("collects hard-iron calibration until the duration elapses", () => {
    let calibration = beginImuCalibration(0);
    calibration = updateImuCalibration(calibration, { x: -100, y: 20, z: 40 }, 1000);
    calibration = updateImuCalibration(calibration, { x: 100, y: -20, z: 80 }, 8000);

    expect(calibration.active).toBe(false);
    expect(calibration.calibrated).toBe(true);
    expect(calibration.sampleCount).toBe(2);
    expect(calibration.offset).toMatchObject({ x: 0, y: 0, z: 60 });
  });
});
