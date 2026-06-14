import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  DriveBase,
  DriveInputState,
  ZERO_DRIVE_INPUT,
  combineDriveInputs,
  mixDriveTargets
} from "@domains/drive/drive";
import {
  ControlAction,
  DEFAULT_INPUT_MAPPING,
  GamepadPresetId,
  InputMapping,
  ZERO_ROBOT_GAMEPAD_INPUT,
  cloneMapping,
  getGamepadPresetMapping,
  isCustomGamepadMapping,
  keyboardInputFromPressedKeys,
  normalizeInputMapping,
  robotGamepadInputFromGamepad,
  resolveGamepadPreset,
  selectGamepadByIndex
} from "@domains/drive/inputMapping";
import {
  findPrimaryMecanumDriveComponent,
  mecanumDriveChannels,
  mecanumDriveDirections,
  mecanumDriveMotorConfigMappings,
  normalizeMecanumDriveConfig
} from "@domains/drive/mecanumComponent";
import {
  findPrimaryTrackedDriveComponent,
  normalizeTrackedDriveConfig,
  trackedDriveChannels,
  trackedDriveDirections,
  trackedDriveMotorConfigMappings
} from "@domains/drive/trackedComponent";
import { clamp, normalizeMotorChannel, type MotorPortMapping, type MotorTarget } from "@adapters/hardware/protocol";
import { GamepadAxisName, GamepadButtonName, GamepadSummary, LogEntry, isEditableTarget } from "@app/appModel";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";

interface UseDriveInputOptions {
  addSystemLog: (messageKey: string, level?: LogEntry["level"]) => void;
  components?: ComponentDefinition[];
  pluginInstances?: PluginInstance[];
  stopAllMotors: (silent?: boolean) => Promise<void>;
}

export function useDriveInput({ addSystemLog, components = [], pluginInstances = [], stopAllMotors }: UseDriveInputOptions) {
  const [activeDriveBase, setActiveDriveBase] = useState<DriveBase>("tracked");
  const [driveSpeedLimit, setDriveSpeedLimit] = useState("60");
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());
  const [virtualDriveInput, setVirtualDriveInput] = useState<DriveInputState>(ZERO_DRIVE_INPUT);
  const [robotGamepadInput, setRobotGamepadInput] = useState(ZERO_ROBOT_GAMEPAD_INPUT);
  const [gamepads, setGamepads] = useState<GamepadSummary[]>([]);
  const [selectedGamepadIndex, setSelectedGamepadIndex] = useState<number | "">("");
  const [selectedGamepadPreset, setSelectedGamepadPreset] = useState<GamepadPresetId>("auto");
  const [inputMapping, setInputMapping] = useState<InputMapping>(() => cloneMapping(DEFAULT_INPUT_MAPPING));
  const [mappingDraft, setMappingDraft] = useState<InputMapping>(() => cloneMapping(DEFAULT_INPUT_MAPPING));
  const [capturingKey, setCapturingKey] = useState<ControlAction | null>(null);
  const gamepadInputSignatureRef = useRef("");
  const previousGamepadButtonsRef = useRef<Record<number, boolean[]>>({});

  const speedLimitPercent = Number.isFinite(Number(driveSpeedLimit)) ? clamp(Number(driveSpeedLimit), 0, 100) : 0;
  const keyboardInput = useMemo(
    () => keyboardInputFromPressedKeys(pressedKeys, inputMapping.keyboard),
    [inputMapping.keyboard, pressedKeys]
  );
  const manualDriveInput = useMemo(
    () => combineDriveInputs(keyboardInput, virtualDriveInput),
    [keyboardInput, virtualDriveInput]
  );
  const mecanumComponent = useMemo(() => findPrimaryMecanumDriveComponent(components), [components]);
  const mecanumConfig = useMemo(
    () => normalizeMecanumDriveConfig(mecanumComponent?.config, pluginInstances),
    [mecanumComponent?.config, pluginInstances]
  );
  const trackedComponent = useMemo(() => findPrimaryTrackedDriveComponent(components), [components]);
  const trackedConfig = useMemo(
    () => normalizeTrackedDriveConfig(trackedComponent?.config, pluginInstances),
    [pluginInstances, trackedComponent?.config]
  );
  const mecanumDriveInput = useMemo(
    () => combineDriveInputs(activeDriveBase === "mecanum" ? manualDriveInput : ZERO_DRIVE_INPUT, robotGamepadInput.mecanum),
    [activeDriveBase, manualDriveInput, robotGamepadInput.mecanum]
  );
  const trackedDriveInput = useMemo(
    () => combineDriveInputs(activeDriveBase === "tracked" ? manualDriveInput : ZERO_DRIVE_INPUT, robotGamepadInput.tracked),
    [activeDriveBase, manualDriveInput, robotGamepadInput.tracked]
  );
  const driveInput = useMemo(
    () => activeDriveBase === "mecanum" ? mecanumDriveInput : trackedDriveInput,
    [activeDriveBase, mecanumDriveInput, trackedDriveInput]
  );
  const mecanumMixOptions = useMemo(
    () => ({
      channels: mecanumDriveChannels(mecanumConfig, pluginInstances),
      directions: mecanumDriveDirections(mecanumConfig),
      speedLimitPercent
    }),
    [mecanumConfig, pluginInstances, speedLimitPercent]
  );
  const trackedMixOptions = useMemo(
    () => ({
      channels: trackedDriveChannels(trackedConfig, pluginInstances),
      directions: trackedDriveDirections(trackedConfig),
      speedLimitPercent
    }),
    [pluginInstances, speedLimitPercent, trackedConfig]
  );
  const driveTargets = useMemo(
    () => mergeMotorTargets([
      ...mixDriveTargets("mecanum", mecanumDriveInput, mecanumMixOptions).map((target) => ({ ...target, closedLoop: mecanumConfig.closedLoop })),
      ...mixDriveTargets("tracked", trackedDriveInput, trackedMixOptions).map((target) => ({ ...target, closedLoop: trackedConfig.closedLoop }))
    ]),
    [mecanumConfig.closedLoop, mecanumDriveInput, mecanumMixOptions, trackedConfig.closedLoop, trackedDriveInput, trackedMixOptions]
  );
  const driveSetupMappings = useMemo(
    () => mergeMotorMappings([
      ...mecanumDriveMotorConfigMappings(mecanumConfig, pluginInstances),
      ...trackedDriveMotorConfigMappings(trackedConfig, pluginInstances)
    ]),
    [mecanumConfig, pluginInstances, trackedConfig]
  );
  const activeGamepad = selectGamepadByIndex(gamepads, selectedGamepadIndex);
  const recommendedGamepadPreset = useMemo(() => resolveGamepadPreset(activeGamepad), [activeGamepad]);
  const savedGamepadIsCustom = useMemo(() => isCustomGamepadMapping(inputMapping.gamepad), [inputMapping.gamepad]);
  const effectiveGamepadMapping = useMemo(() => {
    if (savedGamepadIsCustom) {
      return inputMapping.gamepad;
    }
    return getGamepadPresetMapping(selectedGamepadPreset, activeGamepad);
  }, [activeGamepad, inputMapping.gamepad, savedGamepadIsCustom, selectedGamepadPreset]);

  async function selectDriveBase(base: DriveBase) {
    if (base !== activeDriveBase) {
      await stopAllMotors(true);
    }
    setVirtualDriveInput((current) => ({ ...current, forward: 0, strafe: 0, turn: 0 }));
    setActiveDriveBase(base);
  }

  function joystickVectorFromEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const halfWidth = rect.width / 2;
    const halfHeight = rect.height / 2;
    const x = halfWidth === 0 ? 0 : clamp((event.clientX - rect.left - halfWidth) / halfWidth, -1, 1);
    const y = halfHeight === 0 ? 0 : clamp((event.clientY - rect.top - halfHeight) / halfHeight, -1, 1);
    return { x, y };
  }

  function updateVirtualDriveStick(event: ReactPointerEvent<HTMLDivElement>) {
    const { x, y } = joystickVectorFromEvent(event);
    setVirtualDriveInput((current) => ({
      ...current,
      forward: clamp(-y, -1, 1),
      strafe: activeDriveBase === "mecanum" ? clamp(x, -1, 1) : 0,
      turn: activeDriveBase === "tracked" ? clamp(x, -1, 1) : 0
    }));
  }

  function updateVirtualCameraStick(event: ReactPointerEvent<HTMLDivElement>) {
    const { x, y } = joystickVectorFromEvent(event);
    setVirtualDriveInput((current) => ({
      ...current,
      cameraPan: clamp(x, -1, 1),
      cameraTilt: clamp(-y, -1, 1)
    }));
  }

  function handleVirtualStickDown(event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") {
    event.currentTarget.setPointerCapture(event.pointerId);
    if (kind === "drive") {
      updateVirtualDriveStick(event);
      return;
    }
    updateVirtualCameraStick(event);
  }

  function handleVirtualStickMove(event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    if (kind === "drive") {
      updateVirtualDriveStick(event);
      return;
    }
    updateVirtualCameraStick(event);
  }

  function resetVirtualStick(kind: "camera" | "drive") {
    setVirtualDriveInput((current) =>
      kind === "drive"
        ? { ...current, forward: 0, strafe: 0, turn: 0 }
        : { ...current, cameraPan: 0, cameraTilt: 0 }
    );
  }

  function handleGamepadButtonEdges(gamepad: Gamepad) {
    const previous = previousGamepadButtonsRef.current[gamepad.index] ?? [];
    const current = gamepad.buttons.map((button) => button.pressed);
    const justPressed = (button: number) => current[button] && !previous[button];

    if (justPressed(effectiveGamepadMapping.buttons.stop)) {
      void stopAllMotors();
    }
    if (justPressed(effectiveGamepadMapping.buttons.selectTracked)) {
      void selectDriveBase("tracked");
    }
    if (justPressed(effectiveGamepadMapping.buttons.selectMecanum)) {
      void selectDriveBase("mecanum");
    }

    previousGamepadButtonsRef.current[gamepad.index] = current;
  }

  function saveMappingSettings() {
    const normalized = normalizeInputMapping(mappingDraft);
    setInputMapping(normalized);
    setMappingDraft(cloneMapping(normalized));
    addSystemLog("logs.inputMappingSaved");
  }

  function resetMappingSettings() {
    const defaults = cloneMapping(DEFAULT_INPUT_MAPPING);
    setInputMapping(defaults);
    setMappingDraft(cloneMapping(defaults));
    setSelectedGamepadPreset("auto");
    setCapturingKey(null);
    addSystemLog("logs.inputMappingReset");
  }

  function applyGamepadPresetToDraft() {
    const presetMapping = getGamepadPresetMapping(selectedGamepadPreset, activeGamepad);
    setMappingDraft((current) => ({
      ...current,
      gamepad: presetMapping
    }));
  }

  function updateKeyboardMapping(action: ControlAction, value: string) {
    setMappingDraft((current) => ({
      ...current,
      keyboard: { ...current.keyboard, [action]: value }
    }));
  }

  function updateGamepadAxis(axis: GamepadAxisName, field: "index" | "invert", value: number | boolean) {
    setMappingDraft((current) => ({
      ...current,
      gamepad: {
        ...current.gamepad,
        axes: {
          ...current.gamepad.axes,
          [axis]: {
            ...current.gamepad.axes[axis],
            [field]: value
          }
        }
      }
    }));
  }

  function updateGamepadButton(button: GamepadButtonName, value: number) {
    setMappingDraft((current) => ({
      ...current,
      gamepad: {
        ...current.gamepad,
        buttons: { ...current.gamepad.buttons, [button]: value }
      }
    }));
  }

  function updateGamepadDeadzone(value: number) {
    setMappingDraft((current) => ({
      ...current,
      gamepad: { ...current.gamepad, deadzone: value }
    }));
  }

  useEffect(() => {
    const mappedCodes = new Set(Object.values(inputMapping.keyboard));

    function handleKeyDown(event: KeyboardEvent) {
      if (capturingKey) {
        event.preventDefault();
        setMappingDraft((current) => ({
          ...current,
          keyboard: { ...current.keyboard, [capturingKey]: event.code }
        }));
        setCapturingKey(null);
        return;
      }

      if (isEditableTarget(event.target) || !mappedCodes.has(event.code)) {
        return;
      }

      event.preventDefault();
      setPressedKeys((current) => {
        const next = new Set(current);
        next.add(event.code);
        return next;
      });

      if (event.repeat) {
        return;
      }

      if (event.code === inputMapping.keyboard.stop) {
        void stopAllMotors();
      }
      if (event.code === inputMapping.keyboard.selectTracked) {
        void selectDriveBase("tracked");
      }
      if (event.code === inputMapping.keyboard.selectMecanum) {
        void selectDriveBase("mecanum");
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (!mappedCodes.has(event.code)) {
        return;
      }
      setPressedKeys((current) => {
        const next = new Set(current);
        next.delete(event.code);
        return next;
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [capturingKey, inputMapping.keyboard]);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      return;
    }

    let frameId = 0;
    let lastSummaryAt = 0;

    function pollGamepads(time: number) {
      const pads = Array.from(navigator.getGamepads()).filter((gamepad): gamepad is Gamepad => Boolean(gamepad));
      const selectedPad = selectGamepadByIndex(pads, selectedGamepadIndex);
      const nextInput = robotGamepadInputFromGamepad(selectedPad, effectiveGamepadMapping);
      const inputSignature = JSON.stringify(nextInput);
      if (inputSignature !== gamepadInputSignatureRef.current) {
        gamepadInputSignatureRef.current = inputSignature;
        setRobotGamepadInput(nextInput);
      }

      if (selectedPad) {
        handleGamepadButtonEdges(selectedPad);
      }

      if (time - lastSummaryAt > 400) {
        lastSummaryAt = time;
        setGamepads(
          pads.map((gamepad) => ({
            index: gamepad.index,
            id: gamepad.id,
            axes: gamepad.axes.length,
            buttons: gamepad.buttons.length,
            mapping: gamepad.mapping || "unknown",
            axesValues: gamepad.axes.map((axis) => Number(axis.toFixed(2))),
            pressedButtons: gamepad.buttons
              .map((button, index) => (button.pressed ? index : -1))
              .filter((index) => index >= 0)
          }))
        );
      }

      frameId = window.requestAnimationFrame(pollGamepads);
    }

    frameId = window.requestAnimationFrame(pollGamepads);
    return () => window.cancelAnimationFrame(frameId);
  }, [effectiveGamepadMapping, selectedGamepadIndex]);

  useEffect(() => {
    if (!driveInput.stop) {
      return;
    }
    void stopAllMotors(true);
  }, [driveInput.stop]);

  useEffect(() => {
    function handleBlur() {
      setPressedKeys(new Set());
      void stopAllMotors(true);
    }

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);

  return {
    activeDriveBase,
    activeGamepad,
    applyGamepadPresetToDraft,
    capturingKey,
    driveInput,
    driveSpeedLimit,
    driveSetupMappings,
    driveTargets,
    gamepads,
    handleVirtualStickDown,
    handleVirtualStickMove,
    inputMapping,
    mappingDraft,
    recommendedGamepadPreset,
    resetMappingSettings,
    resetVirtualStick,
    saveMappingSettings,
    savedGamepadIsCustom,
    selectDriveBase,
    selectedGamepadIndex,
    selectedGamepadPreset,
    setActiveDriveBase,
    setCapturingKey,
    setDriveSpeedLimit,
    setInputMapping,
    setMappingDraft,
    setSelectedGamepadIndex,
    setSelectedGamepadPreset,
    speedLimitPercent,
    canServoGamepadAngle: robotGamepadInput.canServoAngle,
    updateGamepadAxis,
    updateGamepadButton,
    updateGamepadDeadzone,
    updateKeyboardMapping,
    virtualDriveInput
  };
}

function mergeMotorTargets(targets: MotorTarget[]): MotorTarget[] {
  const byChannel = new Map<string, MotorTarget>();
  for (const target of targets) {
    const channel = normalizeMotorChannel(target.channel);
    byChannel.set(channel, { ...target, channel });
  }
  return Array.from(byChannel.values());
}

function mergeMotorMappings(mappings: MotorPortMapping[]): MotorPortMapping[] {
  const byChannel = new Map<string, MotorPortMapping>();
  for (const mapping of mappings) {
    const channel = normalizeMotorChannel(mapping.channel);
    if (channel) {
      byChannel.set(channel, { ...mapping, channel });
    }
  }
  return Array.from(byChannel.values());
}
