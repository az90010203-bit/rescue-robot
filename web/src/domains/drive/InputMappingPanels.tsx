import { Gamepad2, Keyboard, RotateCcw, Save } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { ControlAction, GamepadPreset, GamepadPresetId, InputMapping } from "@domains/drive/inputMapping";
import { KEYBOARD_ACTIONS } from "@domains/drive/inputMapping";
import type { GamepadAxisName, GamepadButtonName, GamepadSummary } from "@app/appModel";
import { Metric } from "@shared/ui/AppChrome";

const GAMEPAD_PRESET_IDS: GamepadPresetId[] = ["auto", "xinput", "playstation", "switchPro", "generic"];
const GAMEPAD_AXES: GamepadAxisName[] = ["forward", "strafe", "turn"];
const GAMEPAD_BUTTONS: GamepadButtonName[] = ["stop", "selectTracked", "selectMecanum", "cameraUp", "cameraDown", "cameraLeft", "cameraRight"];

interface InputMappingSettingsPanelProps {
  activeGamepad?: GamepadSummary | null;
  applyGamepadPresetToDraft: () => void;
  gamepads: GamepadSummary[];
  mappingDraft: InputMapping;
  recommendedGamepadPreset: GamepadPreset;
  resetMappingSettings: () => void;
  saveMappingSettings: () => void;
  savedGamepadIsCustom: boolean;
  selectedGamepadIndex: number | "";
  selectedGamepadPreset: GamepadPresetId;
  setSelectedGamepadIndex: Dispatch<SetStateAction<number | "">>;
  setSelectedGamepadPreset: Dispatch<SetStateAction<GamepadPresetId>>;
  t: TFunction;
  updateGamepadDeadzone: (value: number) => void;
}

export function InputMappingSettingsPanel({
  activeGamepad,
  applyGamepadPresetToDraft,
  gamepads,
  mappingDraft,
  recommendedGamepadPreset,
  resetMappingSettings,
  saveMappingSettings,
  savedGamepadIsCustom,
  selectedGamepadIndex,
  selectedGamepadPreset,
  setSelectedGamepadIndex,
  setSelectedGamepadPreset,
  t,
  updateGamepadDeadzone
}: InputMappingSettingsPanelProps) {
  return (
    <div className="mapping-settings-stack">
      <label>
        <span>{t("fields.gamepad")}</span>
        <select
          value={selectedGamepadIndex}
          onChange={(event) => setSelectedGamepadIndex(event.target.value === "" ? "" : Number(event.target.value))}
        >
          <option value="">{t("mapping.autoGamepad")}</option>
          {gamepads.map((gamepad) => (
            <option key={gamepad.index} value={gamepad.index}>
              #{gamepad.index} {gamepad.id}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>{t("fields.gamepadPreset")}</span>
        <select value={selectedGamepadPreset} onChange={(event) => setSelectedGamepadPreset(event.target.value as GamepadPresetId)}>
          {GAMEPAD_PRESET_IDS.map((preset) => (
            <option key={preset} value={preset}>
              {t(`mapping.presets.${preset}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="gamepad-card">
        <Gamepad2 size={20} />
        <span>
          <strong>{activeGamepad ? activeGamepad.id : t("mapping.noGamepad")}</strong>
          <small>
            {activeGamepad
              ? t("mapping.gamepadMeta", {
                  axes: activeGamepad.axes,
                  buttons: activeGamepad.buttons,
                  mapping: activeGamepad.mapping
                })
              : t("mapping.connectGamepad")}
          </small>
          <small>
            {t("mapping.recommendedPreset", { preset: t(`mapping.presets.${recommendedGamepadPreset.id}`) })}
            {savedGamepadIsCustom ? ` · ${t("mapping.customMappingActive")}` : ""}
          </small>
        </span>
      </div>

      <div className="gamepad-live-grid">
        <Metric code label={t("mapping.liveAxes")} value={activeGamepad ? activeGamepad.axesValues.map((axis, index) => `${index}:${axis.toFixed(2)}`).join(" ") : "--"} />
        <Metric
          code
          label={t("mapping.liveButtons")}
          value={activeGamepad ? (activeGamepad.pressedButtons.length > 0 ? activeGamepad.pressedButtons.join(", ") : t("mapping.none")) : "--"}
        />
      </div>

      <label className="speed-slider-field">
        <span>
          {t("fields.deadzone")}: {mappingDraft.gamepad.deadzone.toFixed(2)}
        </span>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.01}
          value={mappingDraft.gamepad.deadzone}
          onChange={(event) => updateGamepadDeadzone(Number(event.target.value))}
        />
      </label>

      <div className="mapping-actions">
        <button className="icon-button" onClick={applyGamepadPresetToDraft} type="button">
          <Gamepad2 size={18} />
          <span>{t("actions.applyPreset")}</span>
        </button>
        <button className="icon-button primary" onClick={saveMappingSettings} type="button">
          <Save size={18} />
          <span>{t("actions.saveMapping")}</span>
        </button>
        <button className="icon-button" onClick={resetMappingSettings} type="button">
          <RotateCcw size={18} />
          <span>{t("actions.resetMapping")}</span>
        </button>
      </div>
    </div>
  );
}

interface InputMappingCommandPanelProps {
  capturingKey: ControlAction | null;
  mappingDraft: InputMapping;
  setCapturingKey: Dispatch<SetStateAction<ControlAction | null>>;
  t: TFunction;
  updateGamepadAxis: (axis: GamepadAxisName, field: "index" | "invert", value: number | boolean) => void;
  updateGamepadButton: (button: GamepadButtonName, value: number) => void;
  updateKeyboardMapping: (action: ControlAction, value: string) => void;
}

export function InputMappingCommandPanel({
  capturingKey,
  mappingDraft,
  setCapturingKey,
  t,
  updateGamepadAxis,
  updateGamepadButton,
  updateKeyboardMapping
}: InputMappingCommandPanelProps) {
  return (
    <>
      <div className="mapping-section">
        <div className="mapping-section-title">
          <Keyboard size={18} />
          <h3>{t("mapping.keyboardTitle")}</h3>
        </div>
        <div className="keyboard-mapping-grid">
          {KEYBOARD_ACTIONS.map((action) => (
            <label className="mapping-row" key={action}>
              <span>{t(`mapping.actions.${action}`)}</span>
              <input value={mappingDraft.keyboard[action]} onChange={(event) => updateKeyboardMapping(action, event.target.value)} />
              <button className="icon-button" onClick={() => setCapturingKey(action)} type="button">
                <Keyboard size={16} />
                <span>{capturingKey === action ? t("mapping.pressKey") : t("actions.captureKey")}</span>
              </button>
            </label>
          ))}
        </div>
      </div>

      <div className="mapping-section">
        <div className="mapping-section-title">
          <Gamepad2 size={18} />
          <h3>{t("mapping.gamepadTitle")}</h3>
        </div>
        <div className="gamepad-mapping-grid">
          {GAMEPAD_AXES.map((axis) => (
            <div className="axis-mapping-row" key={axis}>
              <label>
                <span>{t(`mapping.axes.${axis}`)}</span>
                <input
                  type="number"
                  min={0}
                  max={31}
                  step={1}
                  value={mappingDraft.gamepad.axes[axis].index}
                  onChange={(event) => updateGamepadAxis(axis, "index", Number(event.target.value))}
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={mappingDraft.gamepad.axes[axis].invert}
                  onChange={(event) => updateGamepadAxis(axis, "invert", event.target.checked)}
                />
                <span>{t("fields.invertAxis")}</span>
              </label>
            </div>
          ))}
        </div>

        <div className="gamepad-button-grid">
          {GAMEPAD_BUTTONS.map((button) => (
            <label key={button}>
              <span>{t(`mapping.buttons.${button}`)}</span>
              <input
                type="number"
                min={0}
                max={31}
                step={1}
                value={mappingDraft.gamepad.buttons[button]}
                onChange={(event) => updateGamepadButton(button, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
