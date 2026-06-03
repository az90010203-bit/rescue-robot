import { describe, expect, it } from "vitest";
import {
  clampWheelSliderDeg,
  commandSpeedRawToWheelSliderDeg,
  normalizeWheelMaxSpeedRaw,
  wheelSliderDirection,
  wheelSliderToCommandSpeedRaw
} from "./servoWheelSlider";

describe("servo wheel slider", () => {
  it("maps the 0-60 range to counterclockwise speed", () => {
    expect(wheelSliderToCommandSpeedRaw(0, 600)).toBe(-600);
    expect(wheelSliderToCommandSpeedRaw(30, 600)).toBe(-300);
    expect(wheelSliderToCommandSpeedRaw(60, 600)).toBe(0);
  });

  it("keeps the 60-120 range stopped", () => {
    expect(wheelSliderToCommandSpeedRaw(60, 600)).toBe(0);
    expect(wheelSliderToCommandSpeedRaw(90, 600)).toBe(0);
    expect(wheelSliderToCommandSpeedRaw(120, 600)).toBe(0);
  });

  it("maps the 120-180 range to clockwise speed", () => {
    expect(wheelSliderToCommandSpeedRaw(120, 600)).toBe(0);
    expect(wheelSliderToCommandSpeedRaw(150, 600)).toBe(300);
    expect(wheelSliderToCommandSpeedRaw(180, 600)).toBe(600);
  });

  it("clamps slider values and normalizes max speed", () => {
    expect(clampWheelSliderDeg(-20)).toBe(0);
    expect(clampWheelSliderDeg(220)).toBe(180);
    expect(clampWheelSliderDeg(Number.NaN)).toBe(90);
    expect(normalizeWheelMaxSpeedRaw(-1200)).toBe(1000);
  });

  it("reports the active direction", () => {
    expect(wheelSliderDirection(30)).toBe("counterclockwise");
    expect(wheelSliderDirection(90)).toBe("stopped");
    expect(wheelSliderDirection(150)).toBe("clockwise");
  });

  it("maps command speed back to slider positions", () => {
    expect(commandSpeedRawToWheelSliderDeg(-600, 600)).toBe(0);
    expect(commandSpeedRawToWheelSliderDeg(-300, 600)).toBe(30);
    expect(commandSpeedRawToWheelSliderDeg(0, 600)).toBe(90);
    expect(commandSpeedRawToWheelSliderDeg(300, 600)).toBe(150);
    expect(commandSpeedRawToWheelSliderDeg(600, 600)).toBe(180);
  });
});
