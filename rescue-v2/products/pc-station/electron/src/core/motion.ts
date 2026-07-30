/**
 * Logical controls understood by the operator console.
 *
 * Hardware identifiers deliberately do not cross this boundary.
 */
export type MotionControl =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "turn-left"
  | "turn-right"
  | "left-forward"
  | "left-backward"
  | "right-forward"
  | "right-backward";

/** Normalized mecanum intent sent to the local Control Agent. */
export interface MecanumTarget {
  readonly forwardMilli: number;
  readonly strafeMilli: number;
  readonly turnMilli: number;
}

/** Normalized tracked-drive intent sent to the local Control Agent. */
export interface TrackedTarget {
  readonly leftMilli: number;
  readonly rightMilli: number;
}

/** One controller-compatible named speed level. */
export interface SpeedMode {
  readonly name: "CRUISE MODE" | "TURBO MODE" | "HYPER MODE";
  readonly mecanum: number;
  readonly tracked: number;
}

/** Speed levels shared with the ESP32PLUS OLED and current Qt console. */
export const SPEED_MODES: readonly SpeedMode[] = [
  { name: "CRUISE MODE", mecanum: 30, tracked: 30 },
  { name: "TURBO MODE", mecanum: 50, tracked: 60 },
  { name: "HYPER MODE", mecanum: 70, tracked: 100 }
];

/**
 * Converts held directional controls to a bounded mecanum vector.
 *
 * @param controls - Currently held logical controls
 * @returns Vector whose combined absolute magnitude never exceeds 1000
 */
export function computeMecanumTarget(
  controls: ReadonlySet<MotionControl>
): MecanumTarget {
  const forward = Number(controls.has("forward")) - Number(controls.has("backward"));
  const strafe = Number(controls.has("right")) - Number(controls.has("left"));
  const turn = Number(controls.has("turn-right")) - Number(controls.has("turn-left"));
  const scale = Math.max(1, Math.abs(forward) + Math.abs(strafe) + Math.abs(turn));
  return {
    forwardMilli: Math.round((forward * 1000) / scale),
    strafeMilli: Math.round((strafe * 1000) / scale),
    turnMilli: Math.round((turn * 1000) / scale)
  };
}

/**
 * Converts independent left/right track controls to normalized intent.
 *
 * @param controls - Currently held logical controls
 * @returns Independent track commands in the inclusive range -1000..1000
 */
export function computeTrackedTarget(
  controls: ReadonlySet<MotionControl>
): TrackedTarget {
  const left =
    Number(controls.has("left-forward")) - Number(controls.has("left-backward"));
  const right =
    Number(controls.has("right-forward")) - Number(controls.has("right-backward"));
  return { leftMilli: left * 1000, rightMilli: right * 1000 };
}

/**
 * Advances the three-level speed selector with wrap-around.
 *
 * @param current - Current zero-based level, or null for a custom slider value
 * @returns Next zero-based speed level
 */
export function nextSpeedLevel(current: number | null): number {
  if (current === null) {
    return 0;
  }
  return (current + 1) % SPEED_MODES.length;
}
