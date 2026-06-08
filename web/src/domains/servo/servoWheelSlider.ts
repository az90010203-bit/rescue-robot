import { DEFAULT_WHEEL_SPEED_LIMIT, clamp } from "@adapters/hardware/protocol";

export type WheelSliderDirection = "counterclockwise" | "stopped" | "clockwise";

export const WHEEL_SLIDER_MIN_DEG = 0;
export const WHEEL_SLIDER_STOP_MIN_DEG = 60;
export const WHEEL_SLIDER_CENTER_DEG = 90;
export const WHEEL_SLIDER_STOP_MAX_DEG = 120;
export const WHEEL_SLIDER_MAX_DEG = 180;

export function clampWheelSliderDeg(value: number): number {
  return clamp(Number.isFinite(value) ? value : WHEEL_SLIDER_CENTER_DEG, WHEEL_SLIDER_MIN_DEG, WHEEL_SLIDER_MAX_DEG);
}

export function normalizeWheelMaxSpeedRaw(value: number): number {
  if (!Number.isFinite(value)) {
    return 300;
  }
  return clamp(Math.round(Math.abs(value)), 0, DEFAULT_WHEEL_SPEED_LIMIT);
}

export function wheelSliderToCommandSpeedRaw(sliderDeg: number, maxSpeedRaw: number): number {
  const slider = clampWheelSliderDeg(sliderDeg);
  const maxSpeed = normalizeWheelMaxSpeedRaw(maxSpeedRaw);

  if (slider < WHEEL_SLIDER_STOP_MIN_DEG) {
    return -Math.round((maxSpeed * (WHEEL_SLIDER_STOP_MIN_DEG - slider)) / WHEEL_SLIDER_STOP_MIN_DEG);
  }
  if (slider > WHEEL_SLIDER_STOP_MAX_DEG) {
    return Math.round((maxSpeed * (slider - WHEEL_SLIDER_STOP_MAX_DEG)) / (WHEEL_SLIDER_MAX_DEG - WHEEL_SLIDER_STOP_MAX_DEG));
  }
  return 0;
}

export function commandSpeedRawToWheelSliderDeg(commandSpeedRaw: number, maxSpeedRaw: number): number {
  const maxSpeed = normalizeWheelMaxSpeedRaw(maxSpeedRaw);
  const commandSpeed = clamp(Math.round(Number.isFinite(commandSpeedRaw) ? commandSpeedRaw : 0), -maxSpeed, maxSpeed);

  if (maxSpeed === 0 || commandSpeed === 0) {
    return WHEEL_SLIDER_CENTER_DEG;
  }
  if (commandSpeed < 0) {
    return Math.round(WHEEL_SLIDER_STOP_MIN_DEG - (Math.abs(commandSpeed) / maxSpeed) * WHEEL_SLIDER_STOP_MIN_DEG);
  }
  return Math.round(WHEEL_SLIDER_STOP_MAX_DEG + (commandSpeed / maxSpeed) * (WHEEL_SLIDER_MAX_DEG - WHEEL_SLIDER_STOP_MAX_DEG));
}

export function wheelSliderDirection(sliderDeg: number): WheelSliderDirection {
  const speed = wheelSliderToCommandSpeedRaw(sliderDeg, 1);
  if (speed < 0) {
    return "counterclockwise";
  }
  if (speed > 0) {
    return "clockwise";
  }
  return "stopped";
}
