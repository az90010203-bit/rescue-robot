import { DriveBase, DriveInputState, ZERO_DRIVE_INPUT, applyDeadzone } from "@domains/drive/drive";

export type ControlAction =
  | "forward"
  | "backward"
  | "turnLeft"
  | "turnRight"
  | "strafeLeft"
  | "strafeRight"
  | "stop"
  | "selectTracked"
  | "selectMecanum"
  | "cameraUp"
  | "cameraDown"
  | "cameraLeft"
  | "cameraRight";

export type KeyboardMapping = Record<ControlAction, string>;

export interface AxisMapping {
  index: number;
  invert: boolean;
}

export interface GamepadMapping {
  axes: {
    forward: AxisMapping;
    strafe: AxisMapping;
    turn: AxisMapping;
  };
  buttons: {
    stop: number;
    selectTracked: number;
    selectMecanum: number;
    cameraUp: number;
    cameraDown: number;
    cameraLeft: number;
    cameraRight: number;
  };
  deadzone: number;
}

export type GamepadPresetId = "auto" | "xinput" | "playstation" | "switchPro" | "generic";

export interface GamepadDescriptor {
  id: string;
  mapping?: string;
  axes: number | readonly number[];
  buttons: number | readonly GamepadButton[];
}

export interface GamepadPreset {
  id: Exclude<GamepadPresetId, "auto">;
  mapping: GamepadMapping;
}

export interface InputMapping {
  keyboard: KeyboardMapping;
  gamepad: GamepadMapping;
}

export const INPUT_MAPPING_STORAGE_KEY = "rescue-robot.input-mapping.v1";

export const DEFAULT_INPUT_MAPPING: InputMapping = {
  keyboard: {
    forward: "KeyW",
    backward: "KeyS",
    turnLeft: "KeyA",
    turnRight: "KeyD",
    strafeLeft: "KeyQ",
    strafeRight: "KeyE",
    stop: "Space",
    selectTracked: "Digit1",
    selectMecanum: "Digit2",
    cameraUp: "ArrowUp",
    cameraDown: "ArrowDown",
    cameraLeft: "ArrowLeft",
    cameraRight: "ArrowRight"
  },
  gamepad: {
    axes: {
      forward: { index: 1, invert: true },
      strafe: { index: 0, invert: false },
      turn: { index: 0, invert: false }
    },
    buttons: {
      stop: 0,
      selectTracked: 4,
      selectMecanum: 5,
      cameraUp: 12,
      cameraDown: 13,
      cameraLeft: 14,
      cameraRight: 15
    },
    deadzone: 0.12
  }
};

export const GAMEPAD_PRESETS: Record<Exclude<GamepadPresetId, "auto">, GamepadPreset> = {
  xinput: {
    id: "xinput",
    mapping: cloneGamepadMapping({
      axes: {
        forward: { index: 1, invert: true },
        strafe: { index: 0, invert: false },
        turn: { index: 0, invert: false }
      },
      buttons: {
        stop: 0,
        selectTracked: 4,
        selectMecanum: 5,
        cameraUp: 12,
        cameraDown: 13,
        cameraLeft: 14,
        cameraRight: 15
      },
      deadzone: 0.12
    })
  },
  playstation: {
    id: "playstation",
    mapping: cloneGamepadMapping({
      axes: {
        forward: { index: 1, invert: true },
        strafe: { index: 0, invert: false },
        turn: { index: 0, invert: false }
      },
      buttons: {
        stop: 1,
        selectTracked: 4,
        selectMecanum: 5,
        cameraUp: 12,
        cameraDown: 13,
        cameraLeft: 14,
        cameraRight: 15
      },
      deadzone: 0.12
    })
  },
  switchPro: {
    id: "switchPro",
    mapping: cloneGamepadMapping({
      axes: {
        forward: { index: 1, invert: true },
        strafe: { index: 0, invert: false },
        turn: { index: 0, invert: false }
      },
      buttons: {
        stop: 1,
        selectTracked: 4,
        selectMecanum: 5,
        cameraUp: 12,
        cameraDown: 13,
        cameraLeft: 14,
        cameraRight: 15
      },
      deadzone: 0.12
    })
  },
  generic: {
    id: "generic",
    mapping: cloneGamepadMapping(DEFAULT_INPUT_MAPPING.gamepad)
  }
};

const LEGACY_GAMEPAD_PRESET_MAPPINGS = [
  legacyRightStickTurnMapping(0),
  legacyRightStickTurnMapping(1)
];

export const KEYBOARD_ACTIONS: ControlAction[] = [
  "forward",
  "backward",
  "turnLeft",
  "turnRight",
  "strafeLeft",
  "strafeRight",
  "stop",
  "selectTracked",
  "selectMecanum",
  "cameraUp",
  "cameraDown",
  "cameraLeft",
  "cameraRight"
];

export function loadInputMapping(storage: Storage = window.localStorage): InputMapping {
  const raw = storage.getItem(INPUT_MAPPING_STORAGE_KEY);
  if (!raw) {
    return cloneMapping(DEFAULT_INPUT_MAPPING);
  }

  try {
    return normalizeInputMapping(JSON.parse(raw));
  } catch {
    return cloneMapping(DEFAULT_INPUT_MAPPING);
  }
}

export function saveInputMapping(mapping: InputMapping, storage: Storage = window.localStorage): void {
  storage.setItem(INPUT_MAPPING_STORAGE_KEY, JSON.stringify(normalizeInputMapping(mapping)));
}

export function gamepadMappingSignature(mapping: GamepadMapping): string {
  return JSON.stringify(normalizeGamepadMapping(mapping));
}

export function isCustomGamepadMapping(mapping: GamepadMapping): boolean {
  const signature = gamepadMappingSignature(mapping);
  return ![...Object.values(GAMEPAD_PRESETS).map((preset) => preset.mapping), ...LEGACY_GAMEPAD_PRESET_MAPPINGS].some(
    (presetMapping) => gamepadMappingSignature(presetMapping) === signature
  );
}

export function getGamepadPresetMapping(presetId: GamepadPresetId, descriptor?: GamepadDescriptor | null): GamepadMapping {
  if (presetId === "auto") {
    return cloneGamepadMapping(resolveGamepadPreset(descriptor).mapping);
  }
  return cloneGamepadMapping(GAMEPAD_PRESETS[presetId].mapping);
}

export function resolveGamepadPreset(descriptor?: GamepadDescriptor | null): GamepadPreset {
  if (!descriptor) {
    return GAMEPAD_PRESETS.generic;
  }

  const id = descriptor.id.toLowerCase();
  const axes = descriptorCount(descriptor.axes);
  const buttons = descriptorCount(descriptor.buttons);
  if (/(dualsense|dualshock|playstation|\bps[345]?\b|sony)/i.test(id)) {
    return GAMEPAD_PRESETS.playstation;
  }
  if (/(switch|joy-con|joycon|pro controller|nintendo)/i.test(id)) {
    return GAMEPAD_PRESETS.switchPro;
  }
  if (descriptor.mapping === "standard" || /(xinput|x-box|xbox|microsoft|360 controller|8bitdo|gamesir|gulikit)/i.test(id)) {
    return GAMEPAD_PRESETS.xinput;
  }
  if (axes >= 4 && buttons >= 12) {
    return GAMEPAD_PRESETS.generic;
  }
  return GAMEPAD_PRESETS.generic;
}

export function normalizeInputMapping(value: unknown): InputMapping {
  if (!value || typeof value !== "object") {
    return cloneMapping(DEFAULT_INPUT_MAPPING);
  }

  const draft = value as Partial<InputMapping>;
  const keyboard = { ...DEFAULT_INPUT_MAPPING.keyboard };
  if (draft.keyboard && typeof draft.keyboard === "object") {
    for (const action of KEYBOARD_ACTIONS) {
      const code = draft.keyboard[action];
      if (typeof code === "string" && code.trim()) {
        keyboard[action] = code.trim();
      }
    }
  }

  const gamepad: Partial<GamepadMapping> =
    draft.gamepad && typeof draft.gamepad === "object" ? draft.gamepad : {};
  return {
    keyboard,
    gamepad: normalizeGamepadMapping(gamepad)
  };
}

export function normalizeGamepadMapping(value: unknown): GamepadMapping {
  const gamepad: Partial<GamepadMapping> = value && typeof value === "object" ? value : {};
  return {
    axes: {
      forward: normalizeAxis(gamepad.axes?.forward, DEFAULT_INPUT_MAPPING.gamepad.axes.forward),
      strafe: normalizeAxis(gamepad.axes?.strafe, DEFAULT_INPUT_MAPPING.gamepad.axes.strafe),
      turn: normalizeAxis(gamepad.axes?.turn, DEFAULT_INPUT_MAPPING.gamepad.axes.turn)
    },
    buttons: {
      stop: normalizeButton(gamepad.buttons?.stop, DEFAULT_INPUT_MAPPING.gamepad.buttons.stop),
      selectTracked: normalizeButton(gamepad.buttons?.selectTracked, DEFAULT_INPUT_MAPPING.gamepad.buttons.selectTracked),
      selectMecanum: normalizeButton(gamepad.buttons?.selectMecanum, DEFAULT_INPUT_MAPPING.gamepad.buttons.selectMecanum),
      cameraUp: normalizeButton(gamepad.buttons?.cameraUp, DEFAULT_INPUT_MAPPING.gamepad.buttons.cameraUp),
      cameraDown: normalizeButton(gamepad.buttons?.cameraDown, DEFAULT_INPUT_MAPPING.gamepad.buttons.cameraDown),
      cameraLeft: normalizeButton(gamepad.buttons?.cameraLeft, DEFAULT_INPUT_MAPPING.gamepad.buttons.cameraLeft),
      cameraRight: normalizeButton(gamepad.buttons?.cameraRight, DEFAULT_INPUT_MAPPING.gamepad.buttons.cameraRight)
    },
    deadzone: normalizeDeadzone(gamepad.deadzone)
  };
}

export function keyboardInputFromPressedKeys(pressedKeys: ReadonlySet<string>, mapping: KeyboardMapping): DriveInputState {
  return {
    ...ZERO_DRIVE_INPUT,
    forward: keyAxis(pressedKeys, mapping.forward, mapping.backward),
    strafe: keyAxis(pressedKeys, mapping.strafeRight, mapping.strafeLeft),
    turn: keyAxis(pressedKeys, mapping.turnRight, mapping.turnLeft),
    cameraPan: keyAxis(pressedKeys, mapping.cameraRight, mapping.cameraLeft),
    cameraTilt: keyAxis(pressedKeys, mapping.cameraUp, mapping.cameraDown),
    stop: pressedKeys.has(mapping.stop)
  };
}

export function gamepadInputFromGamepad(gamepad: Gamepad | null | undefined, mapping: GamepadMapping): DriveInputState {
  if (!gamepad) {
    return ZERO_DRIVE_INPUT;
  }

  return {
    ...ZERO_DRIVE_INPUT,
    forward: readAxis(gamepad, mapping.axes.forward, mapping.deadzone),
    strafe: readAxis(gamepad, mapping.axes.strafe, mapping.deadzone),
    turn: readAxis(gamepad, mapping.axes.turn, mapping.deadzone),
    cameraPan: buttonAxis(gamepad, mapping.buttons.cameraRight, mapping.buttons.cameraLeft),
    cameraTilt: buttonAxis(gamepad, mapping.buttons.cameraUp, mapping.buttons.cameraDown),
    stop: isButtonPressed(gamepad, mapping.buttons.stop)
  };
}

export function gamepadDriveInputFromGamepad(gamepad: Gamepad | null | undefined, mapping: GamepadMapping, driveBase: DriveBase): DriveInputState {
  const input = gamepadInputFromGamepad(gamepad, mapping);
  if (mapping.axes.strafe.index !== mapping.axes.turn.index || mapping.axes.strafe.invert !== mapping.axes.turn.invert) {
    return input;
  }
  return driveBase === "tracked"
    ? { ...input, strafe: 0 }
    : { ...input, turn: 0 };
}

export function cloneMapping(mapping: InputMapping): InputMapping {
  return JSON.parse(JSON.stringify(mapping)) as InputMapping;
}

export function cloneGamepadMapping(mapping: GamepadMapping): GamepadMapping {
  return JSON.parse(JSON.stringify(mapping)) as GamepadMapping;
}

function keyAxis(pressedKeys: ReadonlySet<string>, positiveKey: string, negativeKey: string): number {
  return (pressedKeys.has(positiveKey) ? 1 : 0) - (pressedKeys.has(negativeKey) ? 1 : 0);
}

function readAxis(gamepad: Gamepad, mapping: AxisMapping, deadzone: number): number {
  const raw = gamepad.axes[mapping.index] ?? 0;
  return applyDeadzone(mapping.invert ? -raw : raw, deadzone);
}

function buttonAxis(gamepad: Gamepad, positiveButton: number, negativeButton: number): number {
  return (isButtonPressed(gamepad, positiveButton) ? 1 : 0) - (isButtonPressed(gamepad, negativeButton) ? 1 : 0);
}

function isButtonPressed(gamepad: Gamepad, buttonIndex: number): boolean {
  return Boolean(gamepad.buttons[buttonIndex]?.pressed);
}

function normalizeAxis(value: unknown, fallback: AxisMapping): AxisMapping {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }
  const draft = value as Partial<AxisMapping>;
  return {
    index: normalizeIndex(draft.index, fallback.index),
    invert: typeof draft.invert === "boolean" ? draft.invert : fallback.invert
  };
}

function normalizeButton(value: unknown, fallback: number): number {
  return normalizeIndex(value, fallback);
}

function descriptorCount(value: number | { length: number }): number {
  return typeof value === "number" ? value : value.length;
}

function normalizeIndex(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 31 ? value : fallback;
}

function normalizeDeadzone(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 0.95
    ? value
    : DEFAULT_INPUT_MAPPING.gamepad.deadzone;
}

function legacyRightStickTurnMapping(stopButton: number): GamepadMapping {
  return cloneGamepadMapping({
    axes: {
      forward: { index: 1, invert: true },
      strafe: { index: 0, invert: false },
      turn: { index: 2, invert: false }
    },
    buttons: {
      stop: stopButton,
      selectTracked: 4,
      selectMecanum: 5,
      cameraUp: 12,
      cameraDown: 13,
      cameraLeft: 14,
      cameraRight: 15
    },
    deadzone: 0.12
  });
}
