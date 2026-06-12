export interface PlatformGamepadSnapshotInput {
  index: number;
  id: string;
  axes: number;
  buttons: number;
  mapping: string;
  axesValues?: number[];
  pressedButtons?: number[];
  input?: {
    forward?: number;
    strafe?: number;
    turn?: number;
    cameraPan?: number;
    cameraTilt?: number;
    stop?: boolean;
  };
}

export function gamepadSnapshotValues(gamepad: PlatformGamepadSnapshotInput | null | undefined): Record<string, boolean | number | string | null> {
  return {
    connected: Boolean(gamepad),
    index: gamepad?.index ?? null,
    id: gamepad?.id ?? null,
    mapping: gamepad?.mapping ?? null,
    axes: gamepad?.axes ?? null,
    buttons: gamepad?.buttons ?? null,
    axesValues: gamepad?.axesValues?.join(" ") ?? null,
    pressedButtons: gamepad?.pressedButtons?.join(", ") ?? null,
    forward: gamepad?.input?.forward ?? null,
    strafe: gamepad?.input?.strafe ?? null,
    turn: gamepad?.input?.turn ?? null,
    cameraPan: gamepad?.input?.cameraPan ?? null,
    cameraTilt: gamepad?.input?.cameraTilt ?? null,
    stop: gamepad?.input?.stop ?? null
  };
}
