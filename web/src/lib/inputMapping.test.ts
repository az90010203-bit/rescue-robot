import { describe, expect, it } from "vitest";
import {
  DEFAULT_INPUT_MAPPING,
  GAMEPAD_PRESETS,
  INPUT_MAPPING_STORAGE_KEY,
  cloneMapping,
  getGamepadPresetMapping,
  gamepadInputFromGamepad,
  isCustomGamepadMapping,
  keyboardInputFromPressedKeys,
  loadInputMapping,
  resolveGamepadPreset,
  saveInputMapping
} from "./inputMapping";

describe("input mapping storage", () => {
  it("loads defaults when storage is empty", () => {
    expect(loadInputMapping(createStorage())).toEqual(DEFAULT_INPUT_MAPPING);
  });

  it("saves and loads a valid mapping", () => {
    const storage = createStorage();
    const mapping = cloneMapping(DEFAULT_INPUT_MAPPING);
    mapping.keyboard.forward = "ArrowUp";
    mapping.gamepad.axes.turn = { index: 3, invert: true };
    mapping.gamepad.deadzone = 0.2;

    saveInputMapping(mapping, storage);

    expect(storage.getItem(INPUT_MAPPING_STORAGE_KEY)).toContain("ArrowUp");
    expect(loadInputMapping(storage)).toEqual(mapping);
  });

  it("falls back for invalid mapping fields", () => {
    const storage = createStorage();
    storage.setItem(
      INPUT_MAPPING_STORAGE_KEY,
      JSON.stringify({
        keyboard: { forward: "", backward: "KeyX" },
        gamepad: {
          axes: { forward: { index: -1, invert: "yes" } },
          buttons: { stop: 99 },
          deadzone: 2
        }
      })
    );

    const mapping = loadInputMapping(storage);

    expect(mapping.keyboard.forward).toBe(DEFAULT_INPUT_MAPPING.keyboard.forward);
    expect(mapping.keyboard.backward).toBe("KeyX");
    expect(mapping.gamepad.axes.forward).toEqual(DEFAULT_INPUT_MAPPING.gamepad.axes.forward);
    expect(mapping.gamepad.buttons.stop).toBe(DEFAULT_INPUT_MAPPING.gamepad.buttons.stop);
    expect(mapping.gamepad.deadzone).toBe(DEFAULT_INPUT_MAPPING.gamepad.deadzone);
  });
});

describe("input mapping readers", () => {
  it("turns keyboard state into drive axes", () => {
    const pressed = new Set(["KeyW", "KeyD", "KeyQ", "ArrowUp"]);

    expect(keyboardInputFromPressedKeys(pressed, DEFAULT_INPUT_MAPPING.keyboard)).toMatchObject({
      forward: 1,
      strafe: -1,
      turn: 1,
      cameraTilt: 1,
      stop: false
    });
  });

  it("turns standard gamepad axes and buttons into drive axes", () => {
    const gamepad = createGamepad({
      axes: [0.5, -0.75, -0.25],
      buttons: { 0: true, 12: true }
    });

    expect(gamepadInputFromGamepad(gamepad, DEFAULT_INPUT_MAPPING.gamepad)).toMatchObject({
      forward: expect.closeTo(0.7159, 3),
      strafe: expect.closeTo(0.4318, 3),
      turn: expect.closeTo(-0.1477, 3),
      cameraTilt: 1,
      stop: true
    });
  });
});

describe("gamepad presets", () => {
  it("detects mainstream controller families from browser descriptors", () => {
    expect(resolveGamepadPreset(createGamepad({ id: "Xbox Wireless Controller", mapping: "standard" })).id).toBe("xinput");
    expect(resolveGamepadPreset(createGamepad({ id: "DualSense Wireless Controller", mapping: "standard" })).id).toBe("playstation");
    expect(resolveGamepadPreset(createGamepad({ id: "Nintendo Switch Pro Controller" })).id).toBe("switchPro");
    expect(resolveGamepadPreset(createGamepad({ id: "Unknown USB Gamepad", mapping: "", axes: [0, 0, 0, 0] })).id).toBe("generic");
  });

  it("uses auto preset mapping for the active controller", () => {
    const playstationPad = createGamepad({
      id: "Sony DualShock 4",
      axes: [0.4, -0.6, 0.25],
      buttons: { 1: true, 12: true }
    });

    expect(gamepadInputFromGamepad(playstationPad, getGamepadPresetMapping("auto", playstationPad))).toMatchObject({
      forward: expect.closeTo(0.5454, 3),
      strafe: expect.closeTo(0.3181, 3),
      turn: expect.closeTo(0.1477, 3),
      cameraTilt: 1,
      stop: true
    });
  });

  it("keeps custom saved mappings distinguishable from presets", () => {
    const custom = cloneMapping(DEFAULT_INPUT_MAPPING);
    custom.gamepad.axes.turn = { index: 3, invert: true };

    expect(isCustomGamepadMapping(GAMEPAD_PRESETS.xinput.mapping)).toBe(false);
    expect(isCustomGamepadMapping(custom.gamepad)).toBe(true);
  });

  it("falls back unknown controllers to the generic preset", () => {
    const unknownPad = createGamepad({ id: "Arcade Encoder", mapping: "", axes: [0.5, -0.5, 0] });
    expect(resolveGamepadPreset(unknownPad).id).toBe("generic");
    expect(getGamepadPresetMapping("auto", unknownPad)).toEqual(GAMEPAD_PRESETS.generic.mapping);
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
}

function createGamepad(
  options: { axes?: number[]; buttons?: Record<number, boolean>; id?: string; mapping?: string } = {}
): Gamepad {
  const axes = options.axes ?? [0, 0, 0, 0];
  const pressedButtons = options.buttons ?? {};
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: Boolean(pressedButtons[index]),
    touched: Boolean(pressedButtons[index]),
    value: pressedButtons[index] ? 1 : 0
  })) as GamepadButton[];

  return {
    axes,
    buttons,
    connected: true,
    hapticActuators: [],
    id: options.id ?? "Test Gamepad",
    index: 0,
    mapping: options.mapping ?? "standard",
    timestamp: 1
  } as unknown as Gamepad;
}
