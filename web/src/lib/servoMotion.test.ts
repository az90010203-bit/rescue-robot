import { describe, expect, it } from "vitest";
import {
  createPositionTrajectory,
  createWheelSpeedTrajectory,
  isCurrentMotionGeneration,
  nextMotionGeneration,
  resolveServoMotionConfig,
  smoothStepQuintic
} from "./servoMotion";
import { servoLogicalToPhysicalAngleWithReverse } from "./protocol";

describe("servo motion smoothing", () => {
  const standard = resolveServoMotionConfig("standard");

  it("uses a quintic S curve with zero slope at both ends", () => {
    expect(smoothStepQuintic(0)).toBe(0);
    expect(smoothStepQuintic(1)).toBe(1);
    expect(smoothStepQuintic(0.25)).toBeLessThan(0.25);
    expect(smoothStepQuintic(0.75)).toBeGreaterThan(0.75);
  });

  it("builds monotonic position samples without overshooting the target", () => {
    const samples = createPositionTrajectory(0, 180, standard);

    expect(samples[0].value).toBe(0);
    expect(samples[samples.length - 1].value).toBe(180);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index].value).toBeGreaterThanOrEqual(samples[index - 1].value);
      expect(samples[index].value).toBeLessThanOrEqual(180);
    }
  });

  it("replans position samples from the latest sent point", () => {
    const first = createPositionTrajectory(0, 180, standard);
    const latest = first[Math.floor(first.length / 2)].value;
    const replanned = createPositionTrajectory(latest, 90, standard);

    expect(replanned[0].value).toBe(latest);
    expect(replanned[replanned.length - 1].value).toBe(90);
    for (let index = 1; index < replanned.length; index += 1) {
      expect(replanned[index].value).toBeLessThanOrEqual(replanned[index - 1].value);
      expect(replanned[index].value).toBeGreaterThanOrEqual(90);
    }
  });

  it("ramps wheel speed smoothly through start, reverse, and stop targets", () => {
    const start = createWheelSpeedTrajectory(0, 300, standard);
    const reverse = createWheelSpeedTrajectory(300, -300, standard);
    const stop = createWheelSpeedTrajectory(300, 0, standard);

    expect(start[0].value).toBe(0);
    expect(start[start.length - 1].value).toBe(300);
    expect(reverse[0].value).toBe(300);
    expect(reverse[reverse.length - 1].value).toBe(-300);
    expect(stop[0].value).toBe(300);
    expect(stop[stop.length - 1].value).toBe(0);
  });

  it("keeps smoothed points inside limited reversed physical angles", () => {
    const servo = { id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 as const };
    const fromPhysical = servoLogicalToPhysicalAngleWithReverse(servo, 0, false);
    const toPhysical = servoLogicalToPhysicalAngleWithReverse(servo, 180, false);
    const samples = createPositionTrajectory(fromPhysical, toPhysical, standard);

    expect(fromPhysical).toBe(180);
    expect(toPhysical).toBe(0);
    for (const sample of samples) {
      expect(sample.value).toBeGreaterThanOrEqual(0);
      expect(sample.value).toBeLessThanOrEqual(180);
    }
  });

  it("tracks motion generations for cancelling old timers", () => {
    const first = nextMotionGeneration(undefined);
    const second = nextMotionGeneration(first);

    expect(isCurrentMotionGeneration(first, first)).toBe(true);
    expect(isCurrentMotionGeneration(second, first)).toBe(false);
  });
});
