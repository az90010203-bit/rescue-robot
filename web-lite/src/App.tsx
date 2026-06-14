import { Activity, Cable, Camera, Cpu, DatabaseZap, Gamepad2, Gauge, Home, Network, Radar, RotateCw, Save, Send, Settings2, Shield, SlidersHorizontal, Square, Video, Wrench } from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_INPUT_MAPPING, GAMEPAD_PRESETS, normalizeGamepadMapping, type GamepadMapping, type GamepadPresetId } from "@domains/drive/inputMapping";
import {
  ASMG_MD_CENTER_RATIO_MAX,
  ASMG_MD_SPEED_MAX,
  asmgMdLogicalAngleToPositionRaw,
  buildAsmgMdCanConfigCommand,
  buildAsmgMdCanReadCommand,
  buildAsmgMdFactoryResetCommand,
  buildAsmgMdGroupMoveCommand,
  buildAsmgMdMoveCommand,
  buildAsmgMdReadCurrentCommand,
  buildAsmgMdReadIdCommand,
  buildAsmgMdReadPidCommand,
  buildAsmgMdReadPositionCommand,
  buildAsmgMdReadPositionCurrentCommand,
  buildAsmgMdSaveCenterCommand,
  buildAsmgMdSetBaudCommand,
  buildAsmgMdSetCurrentCommand,
  buildAsmgMdSetIdCommand,
  buildAsmgMdSetPidCommand,
  normalizeAsmgMdServoProfile,
  parseAsmgMdCanFrame,
  type AsmgMdBaudKbps,
  type AsmgMdParsedFrame,
  type AsmgMdServoProfile
} from "@adapters/hardware/asmgMdCanServo";
import { servoPhysicalToLogicalAngle, type InboundMessage, type PcCommand } from "@adapters/hardware/protocol";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, isLiteLanguage, type LiteLanguage } from "./i18n/languages";
import { A_BOARD_BRIDGE_PORT, CAMERA_PORTS, PI_SERVO_BRIDGE_PORT, ROBOT_PROFILE, type LiteArmProfile, type PwmServoProfile } from "./robotProfile";
import { bridgeBaseUrl, buildCommandEnvelope, checkAboardBridgeHealth, checkPiServoBridgeHealth, sendAboardCommand, sendPiServoBridgeCommand, type AboardCommandResult, type BridgeHealth, type PiServoCommandResult } from "./runtime/bridgeClient";
import {
  ZERO_LITE_GAMEPAD_STATE,
  buildLiteCanJogCommand,
  buildLiteMecanumStopCommand,
  buildLiteMecanumTargetCommand,
  buildLitePwmMotorConfigCommand,
  buildLitePwmMotorSetCommand,
  buildLitePwmMotorStopAllCommand,
  buildLitePwmMotorStopCommand,
  buildLiteTrackedStopCommands,
  buildLiteTrackedTargetCommands,
  canJogGroupLabel,
  createCanJogAngles,
  hasMecanumMotion,
  hasTrackedMotion,
  liteGamepadStateFromGamepad,
  mecanumInputFromDpad,
  snapshotFromLiteGamepad,
  trackedInputFromStick,
  type LiteCanJogDirection,
  type LiteCanJogGroup,
  type LiteGamepadState,
  type LiteTrackedInput
} from "./runtime/manualControl";
import { discoverPiHosts, normalizeHost, recommendedPiResult, type PiDiscoveryResult, type PiDiscoverySource } from "./runtime/piDiscoveryLite";
import { DEFAULT_PRIORITY_SETTINGS, PRIORITY_FIELDS, loadPrioritySettings, normalizePrioritySettings, savePrioritySettings, type PrioritySettings } from "./runtime/priority";
import {
  applyArmJoystickStep,
  armCommandSignature,
  buildLiteArmMoveCommand,
  createLiteArmRuntimeState,
  hasArmJoystickMotion,
  normalizeLiteArmProfile,
  solveTwoLinkArmIk,
  type LiteArmRuntimeState
} from "./runtime/twoLinkArm";

type Tone = "danger" | "neutral" | "online" | "warning";
type ViewId = "control" | "can" | "feetech" | "pwm" | "gamepad" | "settings";
type GamepadAxisKey = keyof GamepadMapping["axes"];
type GamepadButtonKey = keyof GamepadMapping["buttons"];
type ServoFeedbackMessage = Extract<InboundMessage, { type: "servo.feedback" }>;
type LitePwmMotorProfile = (typeof ROBOT_PROFILE.motors)[number];

interface LogEntry {
  id: number;
  direction: "rx" | "tx" | "system";
  level?: "info" | "warn" | "error";
  text: string;
}

interface CanExchange {
  label: string;
  command: PcCommand;
  result: AboardCommandResult;
  parsed: AsmgMdParsedFrame[];
  at: number;
}

interface FeetechExchange {
  label: string;
  command: PcCommand;
  result: PiServoCommandResult;
  at: number;
}

interface GamepadSummary {
  index: number;
  id: string;
  axes: number;
  buttons: number;
  mapping: string;
  axesValues: number[];
  buttonValues: number[];
  pressedButtons: number[];
}

interface GamepadLiveInput {
  forward: number;
  strafe: number;
  turn: number;
  cameraPan: number;
  cameraTilt: number;
  stop: boolean;
}

interface ManualTxStatus {
  source: "gamepad" | "manual";
  label: string;
  commandType: PcCommand["type"];
  seq: number | null;
  state: "sending" | "ok" | "error";
  at: number;
  error?: string;
}

interface ManualHoldState {
  mecanum: "" | "forward" | "backward" | "left" | "right";
  tracked: "" | "forward" | "backward" | "left" | "right";
  canFront: LiteCanJogDirection;
  canRear: LiteCanJogDirection;
}

const PI_HOST_STORAGE_KEY = "rescue-robot-lite.piHost.v1";
const CAN_CONFIG_STORAGE_KEY = "rescue-robot-lite.canConfig.v1";
const CAN_SERVO_PROFILES_STORAGE_KEY = "rescue-robot-lite.canServoProfiles.v1";
const CAN_GROUP_STORAGE_KEY = "rescue-robot-lite.canGroupAngles.v1";
const GAMEPAD_STORAGE_KEY = "rescue-robot-lite.gamepad.v1";
const ARM_CONTROL_STORAGE_KEY = "rescue-robot-lite.armControl.v1";
const GAMEPAD_DRIVE_RESEND_MS = 200;

const baudOptions: AsmgMdBaudKbps[] = [250, 500, 1000];
const gamepadPresetOptions: Array<Exclude<GamepadPresetId, "auto">> = ["xinput", "playstation", "switchPro", "generic"];

export default function App() {
  const { i18n, t } = useTranslation();
  const [activeView, setActiveView] = useState<ViewId>("control");
  const [piHost, setPiHost] = useState(() => readStoredString(PI_HOST_STORAGE_KEY, ROBOT_PROFILE.defaultPiHost));
  const [manualHost, setManualHost] = useState(piHost);
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettings>(() => loadPrioritySettings());
  const [aBoardHealth, setABoardHealth] = useState<BridgeHealth | null>(null);
  const [piServoHealth, setPiServoHealth] = useState<BridgeHealth | null>(null);
  const [aBoardError, setABoardError] = useState<string | null>(null);
  const [piServoError, setPiServoError] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<PiDiscoveryResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoConfigureCan, setAutoConfigureCan] = useState(true);
  const [canBusy, setCanBusy] = useState<string | null>(null);
  const [canError, setCanError] = useState<string | null>(null);
  const [lastCanExchange, setLastCanExchange] = useState<CanExchange | null>(null);
  const [canServoProfiles, setCanServoProfiles] = useState<AsmgMdServoProfile[]>(() => readCanServoProfiles());
  const [canConfig, setCanConfig] = useState(() => readCanConfig());
  const [canGroupAngles, setCanGroupAngles] = useState(() => readCanGroupAngles());
  const [feetechBusy, setFeetechBusy] = useState<string | null>(null);
  const [feetechError, setFeetechError] = useState<string | null>(null);
  const [lastFeetechExchange, setLastFeetechExchange] = useState<FeetechExchange | null>(null);
  const [feetechConfig, setFeetechConfig] = useState(() => ({
    targetId: String(ROBOT_PROFILE.feetech.servos[0]?.id ?? 22),
    angleDeg: "180",
    speedRaw: "300",
    acc: "30",
    torqueEnabled: true
  }));
  const [selectedPwmServoId, setSelectedPwmServoId] = useState(ROBOT_PROFILE.pwmServos[0]?.id ?? "");
  const [pwmPulseUs, setPwmPulseUs] = useState("1500");
  const [pwmMotorSpeeds, setPwmMotorSpeeds] = useState<Record<string, string>>(() => createPwmMotorSpeedStrings());
  const [pwmMotorTargets, setPwmMotorTargets] = useState<Record<string, number>>({});
  const [gamepadMapping, setGamepadMapping] = useState<GamepadMapping>(() => readGamepadMapping());
  const [gamepadPreset, setGamepadPreset] = useState<Exclude<GamepadPresetId, "auto">>("xinput");
  const [activeGamepadIndex, setActiveGamepadIndex] = useState<number | null>(null);
  const [gamepads, setGamepads] = useState<GamepadSummary[]>([]);
  const [gamepadInput, setGamepadInput] = useState<GamepadLiveInput>(() => zeroGamepadInput());
  const [liteGamepadState, setLiteGamepadState] = useState<LiteGamepadState>(ZERO_LITE_GAMEPAD_STATE);
  const [gamepadActivityAt, setGamepadActivityAt] = useState(0);
  const [gamepadControlEnabled, setGamepadControlEnabled] = useState(false);
  const [manualTxStatus, setManualTxStatus] = useState<ManualTxStatus | null>(null);
  const [armProfile, setArmProfile] = useState<LiteArmProfile>(() => readArmProfile());
  const [armState, setArmState] = useState<LiteArmRuntimeState>(() => createLiteArmRuntimeState(readArmProfile(), ROBOT_PROFILE.feetech.servos));
  const [manualHold, setManualHold] = useState<ManualHoldState>({ mecanum: "", tracked: "", canFront: 0, canRear: 0 });
  const seqRef = useRef(1);
  const canJogTimersRef = useRef<Record<LiteCanJogGroup, number | null>>({ front: null, rear: null });
  const canJogAnglesRef = useRef<Record<string, number> | null>(null);
  const driveActiveRef = useRef({ mecanum: false, tracked: false });
  const gamepadDriveSendAtRef = useRef({ mecanum: 0, tracked: 0 });
  const gamepadMotionRef = useRef({ mecanum: "", tracked: "", canFront: 0 as LiteCanJogDirection, canRear: 0 as LiteCanJogDirection });
  const armProfileRef = useRef<LiteArmProfile>(armProfile);
  const armStateRef = useRef<LiteArmRuntimeState>(armState);
  const armLastTickAtRef = useRef<number | null>(null);
  const armLastSendAtRef = useRef(0);
  const armCommandSignatureRef = useRef("");

  const currentLanguage = useMemo<LiteLanguage>(() => {
    const resolved = i18n.resolvedLanguage ?? i18n.language;
    return isLiteLanguage(resolved) ? resolved : "zh-CN";
  }, [i18n.language, i18n.resolvedLanguage]);
  const recommended = recommendedPiResult(discoveryResults);
  const aBoardTone = bridgeTone(aBoardHealth, aBoardError);
  const piServoTone = bridgeTone(piServoHealth, piServoError);
  const mainCameraUrl = `http://${piHost}:${CAMERA_PORTS.main}/stream`;
  const secondaryCameraUrl = `http://${piHost}:${CAMERA_PORTS.secondary}/stream`;
  const selectedCanServo = canServoProfiles.find((servo) => servo.id === readTargetId(canConfig.targetId)) ?? canServoProfiles[0] ?? normalizeAsmgMdServoProfile(ROBOT_PROFILE.can.servos[0]);
  const selectedCanProfile = useMemo(() => canServoProfileFromConfig(selectedCanServo, canConfig), [canConfig, selectedCanServo]);
  const selectedPwmServo = ROBOT_PROFILE.pwmServos.find((servo) => servo.id === selectedPwmServoId) ?? ROBOT_PROFILE.pwmServos[0];
  const latestParsed = lastCanExchange?.parsed[lastCanExchange.parsed.length - 1] ?? null;
  const activeGamepad = selectPreferredGamepadSummary(gamepads, activeGamepadIndex);
  const armSolution = useMemo(() => solveTwoLinkArmIk(armState.target, armProfile, ROBOT_PROFILE.feetech.servos), [armProfile, armState.target]);

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  useEffect(() => {
    window.localStorage.setItem(PI_HOST_STORAGE_KEY, piHost);
    setManualHost(piHost);
    void refreshHealth(piHost);
  }, [piHost]);

  useEffect(() => {
    window.localStorage.setItem(CAN_CONFIG_STORAGE_KEY, JSON.stringify(canConfig));
  }, [canConfig]);

  useEffect(() => {
    window.localStorage.setItem(CAN_SERVO_PROFILES_STORAGE_KEY, JSON.stringify(canServoProfiles));
  }, [canServoProfiles]);

  useEffect(() => {
    setCanConfig((current) => syncCanConfigToServo(current, selectedCanServo));
  }, [selectedCanServo]);

  useEffect(() => {
    window.localStorage.setItem(CAN_GROUP_STORAGE_KEY, JSON.stringify(canGroupAngles));
  }, [canGroupAngles]);

  useEffect(() => {
    savePrioritySettings(prioritySettings);
  }, [prioritySettings]);

  useEffect(() => {
    window.localStorage.setItem(GAMEPAD_STORAGE_KEY, JSON.stringify(gamepadMapping));
  }, [gamepadMapping]);

  useEffect(() => {
    armProfileRef.current = armProfile;
    window.localStorage.setItem(ARM_CONTROL_STORAGE_KEY, JSON.stringify(armProfile));
  }, [armProfile]);

  useEffect(() => {
    armStateRef.current = armState;
  }, [armState]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!navigator.getGamepads) {
        setGamepads([]);
        setGamepadInput(zeroGamepadInput());
        setLiteGamepadState(ZERO_LITE_GAMEPAD_STATE);
        if (gamepadControlEnabled) {
          stopAllManualControl(t("manual.stopReasonGamepadUnavailable"));
          setGamepadControlEnabled(false);
        }
        return;
      }
      const pads = Array.from(navigator.getGamepads()).filter((gamepad): gamepad is Gamepad => Boolean(gamepad));
      const summaries = pads.map((gamepad) => ({
        index: gamepad.index,
        id: gamepad.id,
        axes: gamepad.axes.length,
        buttons: gamepad.buttons.length,
        mapping: gamepad.mapping || "unknown",
        axesValues: gamepad.axes.map((axis) => Number(axis.toFixed(2))),
        buttonValues: gamepad.buttons.map((button) => Number((button.value ?? 0).toFixed(2))),
        pressedButtons: gamepad.buttons.map((button, index) => button.pressed ? index : -1).filter((index) => index >= 0)
      }));
      setGamepads(summaries);
      const selected = selectPreferredGamepad(pads, activeGamepadIndex);
      setGamepadInput(readGamepadInput(selected, gamepadMapping));
      const liteState = liteGamepadStateFromGamepad(selected, ROBOT_PROFILE.drive.deadzone);
      setLiteGamepadState(liteState);
      if (selected && hasRawGamepadActivity(selected, ROBOT_PROFILE.drive.deadzone)) {
        setGamepadActivityAt(Date.now());
      }
      if (!selected && gamepadControlEnabled) {
        stopAllManualControl(t("manual.stopReasonGamepadDisconnected"));
        setGamepadControlEnabled(false);
        return;
      }
      if (gamepadControlEnabled) {
        applyLiteGamepadControl(liteState);
      }
    }, ROBOT_PROFILE.canJog.intervalMs);
    return () => window.clearInterval(timer);
  }, [activeGamepadIndex, canServoProfiles, gamepadControlEnabled, gamepadMapping, piHost, prioritySettings, t]);

  useEffect(() => {
    canJogAnglesRef.current = canGroupAngleStringsToNumbers(canGroupAngles, canServoProfiles);
  }, [canGroupAngles, canServoProfiles]);

  useEffect(() => {
    const stopForWindowState = () => {
      stopAllManualControl(t("manual.stopReasonWindow"));
    };
    const stopForVisibility = () => {
      if (document.hidden) {
        stopAllManualControl(t("manual.stopReasonWindow"));
      }
    };
    window.addEventListener("blur", stopForWindowState);
    document.addEventListener("visibilitychange", stopForVisibility);
    return () => {
      window.removeEventListener("blur", stopForWindowState);
      document.removeEventListener("visibilitychange", stopForVisibility);
      stopAllManualControl(t("manual.stopReasonCleanup"));
    };
  }, [piHost, prioritySettings, t]);

  function addLog(direction: LogEntry["direction"], text: string, level: LogEntry["level"] = "info") {
    setLogs((current) => [{ id: Date.now() + Math.random(), direction, text, level }, ...current].slice(0, 140));
  }

  function nextSeq(count = 1) {
    const seq = seqRef.current;
    seqRef.current += Math.max(1, Math.round(count));
    return seq;
  }

  async function refreshHealth(host = piHost) {
    const targetHost = normalizeHost(host);
    setHealthBusy(true);
    setABoardError(null);
    setPiServoError(null);
    try {
      const [aBoard, piServo] = await Promise.allSettled([
        checkAboardBridgeHealth(targetHost),
        checkPiServoBridgeHealth(targetHost)
      ]);
      if (aBoard.status === "fulfilled") {
        setABoardHealth(aBoard.value);
      } else {
        setABoardHealth(null);
        setABoardError(errorMessage(aBoard.reason, t));
      }
      if (piServo.status === "fulfilled") {
        setPiServoHealth(piServo.value);
      } else {
        setPiServoHealth(null);
        setPiServoError(errorMessage(piServo.reason, t));
      }
      addLog("system", t("logs.healthComplete", { host: targetHost }), "info");
    } finally {
      setHealthBusy(false);
    }
  }

  async function scanPiHosts() {
    setDiscoveryBusy(true);
    try {
      const results = await discoverPiHosts(piHost);
      setDiscoveryResults(results);
      const best = recommendedPiResult(results);
      addLog("system", best ? t("logs.piCandidateFound", { host: best.candidate.host }) : t("logs.noPiCandidate"), best ? "info" : "warn");
    } catch (error) {
      addLog("system", t("logs.piSearchFailed", { message: errorMessage(error, t) }), "error");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  function applyHost(host: string) {
    const next = normalizeHost(host);
    if (!next) {
      return;
    }
    stopAllManualControl(t("manual.stopReasonHostChange"));
    setPiHost(next);
    addLog("system", t("logs.hostApplied", { host: next }), "info");
  }

  function changeLanguage(value: string) {
    if (isLiteLanguage(value)) {
      void i18n.changeLanguage(value);
    }
  }

  function updatePriority(key: keyof PrioritySettings, value: string) {
    setPrioritySettings((current) => normalizePrioritySettings({ ...current, [key]: value }));
  }

  function resetPriorities() {
    setPrioritySettings(DEFAULT_PRIORITY_SETTINGS);
    addLog("system", t("logs.priorityReset"), "info");
  }

  async function runManualAboardCommand(command: PcCommand, label: string, options: { can?: boolean; source?: ManualTxStatus["source"]; timeoutMs?: number } = {}): Promise<boolean> {
    const envelope = buildCommandEnvelope(command, prioritySettings, { timeoutMs: options.timeoutMs ?? 650 });
    const statusBase: ManualTxStatus = {
      source: options.source ?? "manual",
      label,
      commandType: command.type,
      seq: typeof command.seq === "number" ? command.seq : null,
      state: "sending",
      at: Date.now()
    };
    setManualTxStatus(statusBase);
    try {
      const result = await sendAboardCommand(piHost, command, prioritySettings, { timeoutMs: options.timeoutMs ?? 650 });
      if (options.can) {
        const parsed = result.messages.map((message) => parseAsmgMdCanFrame(message)).filter(Boolean) as AsmgMdParsedFrame[];
        setLastCanExchange({ label, command: envelope.command, result, parsed, at: Date.now() });
      }
      if (result.ok === false || result.messages.some((message) => message.type === "error")) {
        const message = result.error ?? t("errors.canRejected");
        setManualTxStatus({ ...statusBase, state: "error", at: Date.now(), error: message });
        addLog("system", t("logs.manualCommandFailed", { label, message }), "warn");
        return false;
      }
      setManualTxStatus({ ...statusBase, state: "ok", at: Date.now() });
      return true;
    } catch (error) {
      const message = errorMessage(error, t);
      setManualTxStatus({ ...statusBase, state: "error", at: Date.now(), error: message });
      addLog("system", t("logs.manualCommandFailed", { label, message }), "error");
      return false;
    }
  }

  function sendManualAboardCommand(command: PcCommand, label: string, options: { can?: boolean; source?: ManualTxStatus["source"]; timeoutMs?: number } = {}) {
    void runManualAboardCommand(command, label, options);
  }

  function sendManualAboardCommands(commands: PcCommand[], label: string, options: { source?: ManualTxStatus["source"]; timeoutMs?: number } = {}) {
    for (const command of commands) {
      sendManualAboardCommand(command, label, { source: options.source, timeoutMs: options.timeoutMs ?? 650 });
    }
  }

  function sendManualPiServoCommand(command: PcCommand, label: string, options: { timeoutMs?: number; waitMs?: number } = {}) {
    void sendPiServoBridgeCommand(piHost, command, { waitMs: options.waitMs ?? 220, timeoutMs: options.timeoutMs ?? 900 })
      .then((result) => {
        setLastFeetechExchange({ label, command, result, at: Date.now() });
        if (result.ok === false || result.messages.some((message) => message.type === "error")) {
          const message = result.error ?? t("errors.feetechRejected");
          setFeetechError(message);
          addLog("system", t("logs.manualCommandFailed", { label, message }), "warn");
        }
      })
      .catch((error) => {
        const message = errorMessage(error, t);
        setFeetechError(message);
        addLog("system", t("logs.manualCommandFailed", { label, message }), "error");
      });
  }

  function pwmMotorSpeedPercent(channel: string) {
    return Math.max(0, Math.min(100, integerFromText(pwmMotorSpeeds[channel] ?? "35", 35)));
  }

  function updatePwmMotorSpeed(channel: string, value: string) {
    setPwmMotorSpeeds((current) => ({ ...current, [channel]: value }));
  }

  async function setPwmMotorSpeedFor(motor: LitePwmMotorProfile, direction: 1 | -1) {
    const speedPercent = pwmMotorSpeedPercent(motor.channel) * direction;
    const label = `${t("pwm.motorControlTitle")} ${motor.channel}`;
    const configured = await runManualAboardCommand(
      buildLitePwmMotorConfigCommand(nextSeq(), motor),
      label,
      { timeoutMs: 850 }
    );
    if (!configured) {
      return;
    }
    const moved = await runManualAboardCommand(
      buildLitePwmMotorSetCommand(nextSeq(), motor.channel, speedPercent, ROBOT_PROFILE.drive.stopMode),
      label,
      { timeoutMs: 850 }
    );
    if (moved) {
      setPwmMotorTargets((current) => ({ ...current, [motor.channel]: speedPercent }));
    }
  }

  async function stopPwmMotor(motor: LitePwmMotorProfile) {
    const stopped = await runManualAboardCommand(
      buildLitePwmMotorStopCommand(nextSeq(), motor.channel, ROBOT_PROFILE.drive.stopMode),
      `${t("manual.stop")} ${motor.channel}`,
      { timeoutMs: 850 }
    );
    if (stopped) {
      setPwmMotorTargets((current) => ({ ...current, [motor.channel]: 0 }));
    }
  }

  async function stopAllPwmMotors() {
    const stopped = await runManualAboardCommand(
      buildLitePwmMotorStopAllCommand(nextSeq(), ROBOT_PROFILE.drive.stopMode),
      t("actions.stopAll"),
      { timeoutMs: 850 }
    );
    if (stopped) {
      setPwmMotorTargets(Object.fromEntries(ROBOT_PROFILE.motors.map((motor) => [motor.channel, 0])));
    }
  }

  function startMecanumHold(direction: ManualHoldState["mecanum"]) {
    if (!direction) {
      return;
    }
    const input = mecanumInputForDirection(direction);
    setManualHold((current) => ({ ...current, mecanum: direction }));
    driveActiveRef.current.mecanum = true;
    sendManualAboardCommand(buildLiteMecanumTargetCommand(nextSeq(), input, ROBOT_PROFILE.drive), t("manual.mecanumTitle"));
  }

  function stopMecanumHold(source: ManualTxStatus["source"] = "manual") {
    setManualHold((current) => ({ ...current, mecanum: "" }));
    if (driveActiveRef.current.mecanum) {
      sendManualAboardCommand(buildLiteMecanumStopCommand(nextSeq(), ROBOT_PROFILE.drive), t("manual.mecanumStop"), { source });
    }
    driveActiveRef.current.mecanum = false;
    gamepadDriveSendAtRef.current.mecanum = 0;
    gamepadMotionRef.current.mecanum = "";
  }

  function startTrackedHold(direction: ManualHoldState["tracked"]) {
    if (!direction) {
      return;
    }
    const input = trackedInputForDirection(direction);
    setManualHold((current) => ({ ...current, tracked: direction }));
    driveActiveRef.current.tracked = true;
    sendManualAboardCommands(buildLiteTrackedTargetCommands(nextSeq(2), input, ROBOT_PROFILE.drive), t("manual.trackedTitle"));
  }

  function stopTrackedHold(source: ManualTxStatus["source"] = "manual") {
    setManualHold((current) => ({ ...current, tracked: "" }));
    if (driveActiveRef.current.tracked) {
      sendManualAboardCommands(buildLiteTrackedStopCommands(nextSeq(2), ROBOT_PROFILE.drive), t("manual.trackedStop"), { source });
    }
    driveActiveRef.current.tracked = false;
    gamepadDriveSendAtRef.current.tracked = 0;
    gamepadMotionRef.current.tracked = "";
  }

  function startCanJogHold(group: LiteCanJogGroup, direction: Exclude<LiteCanJogDirection, 0>) {
    stopCanJogLoop(group);
    setManualHold((current) => ({ ...current, [group === "front" ? "canFront" : "canRear"]: direction }));
    sendCanJogStep(group, direction);
    canJogTimersRef.current[group] = window.setInterval(() => {
      sendCanJogStep(group, direction);
    }, ROBOT_PROFILE.canJog.intervalMs);
  }

  function stopCanJogHold(group: LiteCanJogGroup) {
    stopCanJogLoop(group);
    setManualHold((current) => ({ ...current, [group === "front" ? "canFront" : "canRear"]: 0 }));
    if (group === "front") {
      gamepadMotionRef.current.canFront = 0;
    } else {
      gamepadMotionRef.current.canRear = 0;
    }
  }

  function stopCanJogLoop(group: LiteCanJogGroup) {
    const timer = canJogTimersRef.current[group];
    if (timer !== null) {
      window.clearInterval(timer);
      canJogTimersRef.current[group] = null;
    }
  }

  function sendCanJogStep(group: LiteCanJogGroup, direction: Exclude<LiteCanJogDirection, 0>, source: ManualTxStatus["source"] = "manual") {
    try {
      const baseAngles = canJogAnglesRef.current ?? canGroupAngleStringsToNumbers(canGroupAngles, canServoProfiles);
      const { command, angles } = buildLiteCanJogCommand(nextSeq(), baseAngles, group, direction, ROBOT_PROFILE.canJog, canServoProfiles);
      canJogAnglesRef.current = angles;
      setCanGroupAngles(canGroupAngleNumbersToStrings(angles, canServoProfiles));
      sendManualAboardCommand(command, t(group === "front" ? "manual.canFrontTitle" : "manual.canRearTitle"), { can: true, source, timeoutMs: 700 });
    } catch (error) {
      const message = errorMessage(error, t);
      setCanError(message);
      addLog("system", t("logs.canFailed", { message }), "error");
      stopCanJogHold(group);
    }
  }

  function stopAllManualControl(reason?: string) {
    const hadActiveMotion = driveActiveRef.current.mecanum ||
      driveActiveRef.current.tracked ||
      canJogTimersRef.current.front !== null ||
      canJogTimersRef.current.rear !== null ||
      gamepadMotionRef.current.mecanum !== "" ||
      gamepadMotionRef.current.tracked !== "" ||
      gamepadMotionRef.current.canFront !== 0 ||
      gamepadMotionRef.current.canRear !== 0 ||
      armCommandSignatureRef.current !== "";
    stopCanJogLoop("front");
    stopCanJogLoop("rear");
    stopArmJoystickControl();
    setManualHold({ mecanum: "", tracked: "", canFront: 0, canRear: 0 });
    gamepadMotionRef.current = { mecanum: "", tracked: "", canFront: 0, canRear: 0 };
    if (driveActiveRef.current.mecanum) {
      sendManualAboardCommand(buildLiteMecanumStopCommand(nextSeq(), ROBOT_PROFILE.drive), t("manual.mecanumStop"));
    }
    if (driveActiveRef.current.tracked) {
      sendManualAboardCommands(buildLiteTrackedStopCommands(nextSeq(2), ROBOT_PROFILE.drive), t("manual.trackedStop"));
    }
    driveActiveRef.current = { mecanum: false, tracked: false };
    gamepadDriveSendAtRef.current = { mecanum: 0, tracked: 0 };
    if (reason && hadActiveMotion) {
      addLog("system", reason, "warn");
    }
  }

  function toggleGamepadControl(enabled: boolean) {
    setGamepadControlEnabled(enabled);
    if (!enabled) {
      stopAllManualControl(t("manual.stopReasonGamepadDisabled"));
    }
  }

  function stopArmJoystickControl() {
    armLastTickAtRef.current = null;
    armLastSendAtRef.current = 0;
    armCommandSignatureRef.current = "";
  }

  function applyLiteGamepadControl(state: LiteGamepadState) {
    if (state.stop) {
      stopAllManualControl(t("manual.stopReasonGamepadStop"));
      return;
    }
    const snapshot = snapshotFromLiteGamepad(state);
    const now = Date.now();
    const mecanumSignature = hasMecanumMotion(snapshot.mecanum) ? JSON.stringify(snapshot.mecanum) : "";
    const shouldSendMecanum = Boolean(mecanumSignature) && (
      mecanumSignature !== gamepadMotionRef.current.mecanum ||
      now - gamepadDriveSendAtRef.current.mecanum >= GAMEPAD_DRIVE_RESEND_MS
    );
    if (shouldSendMecanum) {
      driveActiveRef.current.mecanum = true;
      gamepadDriveSendAtRef.current.mecanum = now;
      sendManualAboardCommand(buildLiteMecanumTargetCommand(nextSeq(), snapshot.mecanum, ROBOT_PROFILE.drive), t("manual.mecanumTitle"), { source: "gamepad" });
    } else if (!mecanumSignature && gamepadMotionRef.current.mecanum) {
      stopMecanumHold("gamepad");
    }
    gamepadMotionRef.current.mecanum = mecanumSignature;

    const trackedSignature = hasTrackedMotion(snapshot.tracked) ? JSON.stringify(snapshot.tracked) : "";
    const shouldSendTracked = Boolean(trackedSignature) && (
      trackedSignature !== gamepadMotionRef.current.tracked ||
      now - gamepadDriveSendAtRef.current.tracked >= GAMEPAD_DRIVE_RESEND_MS
    );
    if (shouldSendTracked) {
      driveActiveRef.current.tracked = true;
      gamepadDriveSendAtRef.current.tracked = now;
      sendManualAboardCommands(buildLiteTrackedTargetCommands(nextSeq(2), snapshot.tracked, ROBOT_PROFILE.drive), t("manual.trackedTitle"), { source: "gamepad" });
    } else if (!trackedSignature && gamepadMotionRef.current.tracked) {
      stopTrackedHold("gamepad");
    }
    gamepadMotionRef.current.tracked = trackedSignature;

    applyGamepadArmControl(snapshot.arm);
    applyGamepadCanJog("front", snapshot.canJog.front);
    applyGamepadCanJog("rear", snapshot.canJog.rear);
  }

  function applyGamepadArmControl(input: { forward: number; lift: number }) {
    const profile = armProfileRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const lastTickAt = armLastTickAtRef.current ?? now - profile.commandIntervalMs;
    armLastTickAtRef.current = now;
    const step = applyArmJoystickStep(armStateRef.current, input, now - lastTickAt, profile, ROBOT_PROFILE.feetech.servos);
    armStateRef.current = step.state;
    setArmState(step.state);

    if (!hasArmJoystickMotion(input, profile.deadzone)) {
      stopArmJoystickControl();
      return;
    }
    if (!profile.calibrated || !step.solution.reachable || !step.solution.withinLimits || now - armLastSendAtRef.current < profile.commandIntervalMs) {
      return;
    }

    const signature = armCommandSignature(step.solution);
    if (signature === armCommandSignatureRef.current) {
      return;
    }
    armCommandSignatureRef.current = signature;
    armLastSendAtRef.current = now;
    try {
      sendManualPiServoCommand(buildLiteArmMoveCommand(nextSeq(), step.solution, profile), t("manual.armTitle"));
    } catch (error) {
      addLog("system", t("logs.manualCommandFailed", { label: t("manual.armTitle"), message: errorMessage(error, t) }), "warn");
    }
  }

  function applyGamepadCanJog(group: LiteCanJogGroup, direction: LiteCanJogDirection) {
    const key = group === "front" ? "canFront" : "canRear";
    if (direction !== 0) {
      sendCanJogStep(group, direction, "gamepad");
      setManualHold((current) => ({ ...current, [key]: direction }));
    } else if (gamepadMotionRef.current[key] !== 0) {
      setManualHold((current) => ({ ...current, [key]: 0 }));
    }
    gamepadMotionRef.current[key] = direction;
  }

  function mecanumInputForDirection(direction: Exclude<ManualHoldState["mecanum"], "">) {
    return mecanumInputFromDpad({
      up: direction === "forward",
      down: direction === "backward",
      left: direction === "left",
      right: direction === "right"
    });
  }

  function trackedInputForDirection(direction: Exclude<ManualHoldState["tracked"], "">): LiteTrackedInput {
    if (direction === "forward") return trackedInputFromStick(0, 1);
    if (direction === "backward") return trackedInputFromStick(0, -1);
    if (direction === "left") return trackedInputFromStick(-1, 0);
    return trackedInputFromStick(1, 0);
  }

  function updateArmProfileNumber(field: keyof LiteArmProfile, value: string) {
    if (value.trim() === "") {
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    setArmProfile((current) => normalizeLiteArmProfile({ ...current, [field]: numericValue }, ROBOT_PROFILE.arm));
  }

  function updateArmProfileSign(field: "j1Sign" | "j2Sign" | "elbowSign", value: string) {
    setArmProfile((current) => normalizeLiteArmProfile({ ...current, [field]: Number(value) === -1 ? -1 : 1 }, ROBOT_PROFILE.arm));
  }

  function resetArmFoldedTarget() {
    const nextState = createLiteArmRuntimeState(armProfileRef.current, ROBOT_PROFILE.feetech.servos);
    armStateRef.current = nextState;
    setArmState(nextState);
    stopArmJoystickControl();
  }

  async function calibrateArmFoldedZero() {
    const label = t("actions.calibrateArmZero");
    const j1Servo = armServoProfile(armProfileRef.current.j1ServoId);
    const j2Servo = armServoProfile(armProfileRef.current.j2ServoId);
    if (!j1Servo || !j2Servo) {
      setFeetechError(t("errors.feetechRejected"));
      return;
    }
    setFeetechBusy(label);
    setFeetechError(null);
    try {
      const j1PhysicalDeg = await readFeetechPositionDeg(j1Servo, label);
      const j2PhysicalDeg = await readFeetechPositionDeg(j2Servo, label);
      const nextProfile = normalizeLiteArmProfile({
        ...armProfileRef.current,
        zeroJ1Deg: servoPhysicalToLogicalAngle(j1Servo, j1PhysicalDeg),
        zeroJ2Deg: servoPhysicalToLogicalAngle(j2Servo, j2PhysicalDeg),
        calibrated: true
      }, ROBOT_PROFILE.arm);
      armProfileRef.current = nextProfile;
      setArmProfile(nextProfile);
      const nextState = createLiteArmRuntimeState(nextProfile, ROBOT_PROFILE.feetech.servos);
      armStateRef.current = nextState;
      setArmState(nextState);
      stopArmJoystickControl();
      addLog("system", t("logs.armCalibrated"), "info");
      await refreshHealth(piHost);
    } catch (error) {
      const message = errorMessage(error, t);
      setFeetechError(message);
      addLog("system", t("logs.armCalibrationFailed", { message }), "error");
    } finally {
      setFeetechBusy(null);
    }
  }

  async function readFeetechPositionDeg(servo: (typeof ROBOT_PROFILE.feetech.servos)[number], label: string): Promise<number> {
    const command: PcCommand = { type: "servo.read", seq: nextSeq(), id: servo.id };
    addLog("tx", JSON.stringify(command), "info");
    const result = await sendPiServoBridgeCommand(piHost, command, { waitMs: 650, timeoutMs: 1200 });
    addLog("rx", JSON.stringify({ ok: result.ok, protocol: result.protocol, messages: result.messages }), result.ok ? "info" : "warn");
    setLastFeetechExchange({ label, command, result, at: Date.now() });
    if (result.ok === false) {
      throw new Error(result.error ?? t("errors.feetechRejected"));
    }
    const feedback = result.messages.find((message): message is ServoFeedbackMessage =>
      message.type === "servo.feedback" && message.id === servo.id && typeof message.positionDeg === "number"
    );
    const positionDeg = feedback?.positionDeg;
    if (typeof positionDeg !== "number" || !Number.isFinite(positionDeg)) {
      throw new Error(`ID${servo.id} feedback missing position`);
    }
    return positionDeg;
  }

  function armServoProfile(servoId: number) {
    return ROBOT_PROFILE.feetech.servos.find((servo) => servo.id === servoId) ?? null;
  }

  async function runCanExchange(label: string, commandFactory: () => PcCommand, options: { configureFirst?: boolean; dangerous?: boolean; timeoutMs?: number } = {}) {
    if (options.dangerous && canConfig.dangerConfirm.trim() !== canConfig.targetId.trim()) {
      setCanError(t("errors.dangerConfirm"));
      return;
    }
    setCanBusy(label);
    setCanError(null);
    const factories = options.configureFirst && autoConfigureCan
      ? [() => buildAsmgMdCanConfigCommand(nextSeq(), canConfig.bitrateKbps), commandFactory]
      : [commandFactory];
    try {
      for (const factory of factories) {
        const command = factory();
        const envelope = buildCommandEnvelope(command, prioritySettings, { timeoutMs: options.timeoutMs ?? 1200 });
        addLog("tx", JSON.stringify(envelope.command), "info");
        const result = await sendAboardCommand(piHost, command, prioritySettings, { timeoutMs: options.timeoutMs ?? 1200 });
        addLog("rx", JSON.stringify({ ok: result.ok, busy: result.busy, accepted: result.accepted, messages: result.messages }), result.ok ? "info" : "warn");
        const parsed = result.messages.map((message) => parseAsmgMdCanFrame(message)).filter(Boolean) as AsmgMdParsedFrame[];
        setLastCanExchange({ label, command: envelope.command, result, parsed, at: Date.now() });
        if (result.messages.some((message) => message.type === "error") || result.ok === false) {
          throw new Error(result.error ?? t("errors.canRejected"));
        }
      }
      await refreshHealth(piHost);
    } catch (error) {
      const message = errorMessage(error, t);
      setCanError(message);
      addLog("system", t("logs.canFailed", { message }), "error");
    } finally {
      setCanBusy(null);
    }
  }

  async function runFeetechExchange(label: string, commandFactory: () => PcCommand) {
    setFeetechBusy(label);
    setFeetechError(null);
    try {
      const command = commandFactory();
      addLog("tx", JSON.stringify(command), "info");
      const result = await sendPiServoBridgeCommand(piHost, command, { waitMs: 650, timeoutMs: 1200 });
      addLog("rx", JSON.stringify({ ok: result.ok, protocol: result.protocol, messages: result.messages }), result.ok ? "info" : "warn");
      setLastFeetechExchange({ label, command, result, at: Date.now() });
      if (result.ok === false) {
        throw new Error(result.error ?? t("errors.feetechRejected"));
      }
      await refreshHealth(piHost);
    } catch (error) {
      const message = errorMessage(error, t);
      setFeetechError(message);
      addLog("system", t("logs.feetechFailed", { message }), "error");
    } finally {
      setFeetechBusy(null);
    }
  }

  function selectedMoveCommand(): PcCommand {
    return buildAsmgMdMoveCommand(nextSeq(), {
      id: selectedCanProfile.id,
      position: asmgMdLogicalAngleToPositionRaw(selectedCanProfile, numberFromText(canConfig.positionDeg, 0)),
      speed: integerFromText(canConfig.speedRaw, ASMG_MD_SPEED_MAX)
    });
  }

  function groupMoveCommand(): PcCommand {
    const speed = integerFromText(canConfig.speedRaw, ASMG_MD_SPEED_MAX);
    return buildAsmgMdGroupMoveCommand(
      nextSeq(),
      canServoProfiles.map((servo) => {
        const profile = normalizeAsmgMdServoProfile({ ...servo, bitrateKbps: canConfig.bitrateKbps });
        const angle = numberFromText(canGroupAngles[String(servo.id)], servoLogicalCenter(servo));
        return { id: profile.id, position: asmgMdLogicalAngleToPositionRaw(profile, angle) };
      }),
      speed
    );
  }

  function updateCanConfig<K extends keyof ReturnType<typeof readCanConfig>>(key: K, value: ReturnType<typeof readCanConfig>[K]) {
    setCanConfig((current) => ({ ...current, [key]: value }));
    if (key === "minDeg" || key === "maxDeg") {
      const fallback = key === "minDeg" ? selectedCanServo.minDeg ?? 0 : selectedCanServo.maxDeg ?? 360;
      updateCanServoProfile(selectedCanServo.id, { [key]: numberFromText(String(value), fallback) });
    } else if (key === "direction") {
      updateCanServoProfile(selectedCanServo.id, { direction: value === -1 ? -1 : 1 });
    }
  }

  function selectCanServo(id: number) {
    const servo = canServoProfiles.find((item) => item.id === id) ?? canServoProfiles[0] ?? normalizeAsmgMdServoProfile(ROBOT_PROFILE.can.servos[0]);
    setCanConfig((current) => ({
      ...current,
      targetId: String(servo.id),
      minDeg: String(servo.minDeg ?? 0),
      maxDeg: String(servo.maxDeg ?? 360),
      direction: servo.direction === -1 ? -1 : 1,
      bitrateKbps: servo.bitrateKbps ?? ROBOT_PROFILE.can.bitrateKbps
    }));
  }

  function updateCanServoProfile(id: number, patch: Partial<Pick<AsmgMdServoProfile, "direction" | "maxDeg" | "minDeg">>) {
    setCanServoProfiles((current) => current.map((servo) => servo.id === id
      ? normalizeEditableCanServoProfile({ ...servo, ...patch })
      : servo
    ));
  }

  function updateCanGroupAngle(id: number, value: string) {
    setCanGroupAngles((current) => ({ ...current, [String(id)]: value }));
  }

  function updateGamepadAxis(axis: GamepadAxisKey, field: "index" | "invert", value: string | boolean) {
    setGamepadMapping((current) => normalizeGamepadMapping({
      ...current,
      axes: {
        ...current.axes,
        [axis]: {
          ...current.axes[axis],
          [field]: field === "invert" ? Boolean(value) : integerFromText(String(value), current.axes[axis].index)
        }
      }
    }));
  }

  function updateGamepadButton(button: GamepadButtonKey, value: string) {
    setGamepadMapping((current) => normalizeGamepadMapping({
      ...current,
      buttons: {
        ...current.buttons,
        [button]: integerFromText(value, current.buttons[button])
      }
    }));
  }

  function applyGamepadPreset(preset: Exclude<GamepadPresetId, "auto">) {
    setGamepadPreset(preset);
    setGamepadMapping(GAMEPAD_PRESETS[preset].mapping);
  }

  function renderControlView() {
    return (
      <section className="view-grid control-view">
        <section className="panel manual-drive-panel">
          <PanelTitle icon={<Gauge size={18} />} title={t("manual.mecanumTitle")} meta={`M3 / M1 / M4 / M2 · ${ROBOT_PROFILE.drive.speedLimitPercent}%`} />
          <div className="manual-pad">
            <span />
            <HoldButton active={manualHold.mecanum === "forward"} onHoldEnd={stopMecanumHold} onHoldStart={() => startMecanumHold("forward")}>{t("manual.forward")}</HoldButton>
            <span />
            <HoldButton active={manualHold.mecanum === "left"} onHoldEnd={stopMecanumHold} onHoldStart={() => startMecanumHold("left")}>{t("manual.strafeLeft")}</HoldButton>
            <button className="manual-stop-button" onClick={() => stopMecanumHold()} type="button">{t("manual.stop")}</button>
            <HoldButton active={manualHold.mecanum === "right"} onHoldEnd={stopMecanumHold} onHoldStart={() => startMecanumHold("right")}>{t("manual.strafeRight")}</HoldButton>
            <span />
            <HoldButton active={manualHold.mecanum === "backward"} onHoldEnd={stopMecanumHold} onHoldStart={() => startMecanumHold("backward")}>{t("manual.backward")}</HoldButton>
            <span />
          </div>
          <p className="inline-note">{t("manual.mecanumHint")}</p>
        </section>

        <section className="panel manual-tracked-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("manual.trackedTitle")} meta={`${ROBOT_PROFILE.drive.tracked.left} / ${ROBOT_PROFILE.drive.tracked.right}`} />
          <div className="manual-pad">
            <span />
            <HoldButton active={manualHold.tracked === "forward"} onHoldEnd={stopTrackedHold} onHoldStart={() => startTrackedHold("forward")}>{t("manual.forward")}</HoldButton>
            <span />
            <HoldButton active={manualHold.tracked === "left"} onHoldEnd={stopTrackedHold} onHoldStart={() => startTrackedHold("left")}>{t("manual.turnLeft")}</HoldButton>
            <button className="manual-stop-button" onClick={() => stopTrackedHold()} type="button">{t("manual.stop")}</button>
            <HoldButton active={manualHold.tracked === "right"} onHoldEnd={stopTrackedHold} onHoldStart={() => startTrackedHold("right")}>{t("manual.turnRight")}</HoldButton>
            <span />
            <HoldButton active={manualHold.tracked === "backward"} onHoldEnd={stopTrackedHold} onHoldStart={() => startTrackedHold("backward")}>{t("manual.backward")}</HoldButton>
            <span />
          </div>
          <p className="inline-note">{t("manual.trackedHint")}</p>
        </section>

        <section className="panel manual-arm-panel">
          <PanelTitle icon={<Wrench size={18} />} title={t("manual.armTitle")} meta={`ID${armProfile.j1ServoId} / ID${armProfile.j2ServoId}`} />
          <div className="metric-grid">
            <Metric label={t("metrics.armForward")} value={formatNumber(armSolution.target.x)} />
            <Metric label={t("metrics.armHeight")} value={formatNumber(armSolution.target.z)} />
            <Metric label={t("metrics.j1Target")} value={`${formatNumber(armState.j1LogicalDeg)} / ${formatNumber(armSolution.j1PhysicalDeg)}`} />
            <Metric label={t("metrics.j2Target")} value={`${formatNumber(armState.j2LogicalDeg)} / ${formatNumber(armSolution.j2PhysicalDeg)}`} />
            <Metric label={t("metrics.calibrated")} value={armProfile.calibrated ? t("common.yes") : t("common.no")} tone={armProfile.calibrated ? "online" : "warning"} />
            <Metric label={t("metrics.workspace")} value={armSolution.limitedByWorkspace ? t("status.limited") : t("status.ready")} tone={armSolution.limitedByWorkspace ? "warning" : "online"} />
            <Metric label={t("metrics.reachable")} value={armSolution.withinLimits ? t("common.yes") : t("common.no")} tone={armSolution.withinLimits ? "online" : "danger"} />
            <Metric label={t("metrics.piServoSerial")} value={piServoHealth?.serialOpen ? t("status.open") : t("status.closed")} tone={piServoTone} />
          </div>
          <div className="form-grid arm-tuning-grid">
            <label>{t("fields.link1Length")}<input value={armProfile.link1Length} onChange={(event) => updateArmProfileNumber("link1Length", event.target.value)} /></label>
            <label>{t("fields.link2Length")}<input value={armProfile.link2Length} onChange={(event) => updateArmProfileNumber("link2Length", event.target.value)} /></label>
            <label>{t("fields.trimJ1")}<input value={armProfile.trimJ1Deg} onChange={(event) => updateArmProfileNumber("trimJ1Deg", event.target.value)} /></label>
            <label>{t("fields.trimJ2")}<input value={armProfile.trimJ2Deg} onChange={(event) => updateArmProfileNumber("trimJ2Deg", event.target.value)} /></label>
            <label>{t("fields.j1Sign")}<select value={armProfile.j1Sign} onChange={(event) => updateArmProfileSign("j1Sign", event.target.value)}><option value={1}>+1</option><option value={-1}>-1</option></select></label>
            <label>{t("fields.j2Sign")}<select value={armProfile.j2Sign} onChange={(event) => updateArmProfileSign("j2Sign", event.target.value)}><option value={1}>+1</option><option value={-1}>-1</option></select></label>
            <label>{t("fields.elbowSign")}<select value={armProfile.elbowSign} onChange={(event) => updateArmProfileSign("elbowSign", event.target.value)}><option value={1}>+1</option><option value={-1}>-1</option></select></label>
            <label>{t("fields.angleStep")}<input value={armProfile.maxAngleStepDeg} onChange={(event) => updateArmProfileNumber("maxAngleStepDeg", event.target.value)} /></label>
            <label>{t("fields.forwardSpeed")}<input value={armProfile.forwardSpeedPerSecond} onChange={(event) => updateArmProfileNumber("forwardSpeedPerSecond", event.target.value)} /></label>
            <label>{t("fields.liftSpeed")}<input value={armProfile.liftSpeedPerSecond} onChange={(event) => updateArmProfileNumber("liftSpeedPerSecond", event.target.value)} /></label>
            <label>{t("fields.minForward")}<input value={armProfile.minForward} onChange={(event) => updateArmProfileNumber("minForward", event.target.value)} /></label>
            <label>{t("fields.maxForward")}<input value={armProfile.maxForward} onChange={(event) => updateArmProfileNumber("maxForward", event.target.value)} /></label>
            <label>{t("fields.minHeight")}<input value={armProfile.minHeight} onChange={(event) => updateArmProfileNumber("minHeight", event.target.value)} /></label>
            <label>{t("fields.maxHeight")}<input value={armProfile.maxHeight} onChange={(event) => updateArmProfileNumber("maxHeight", event.target.value)} /></label>
            <label>{t("fields.speedRaw")}<input value={armProfile.speedRaw} onChange={(event) => updateArmProfileNumber("speedRaw", event.target.value)} /></label>
            <label>{t("fields.acc")}<input value={armProfile.acc} onChange={(event) => updateArmProfileNumber("acc", event.target.value)} /></label>
          </div>
          <div className="toolbar-row">
            <button className="icon-button primary" disabled={Boolean(feetechBusy)} onClick={() => void calibrateArmFoldedZero()} type="button"><Radar size={17} /><span>{t("actions.calibrateArmZero")}</span></button>
            <button className="icon-button" onClick={resetArmFoldedTarget} type="button"><RotateCw size={17} /><span>{t("actions.resetArmTarget")}</span></button>
          </div>
          <p className="inline-note">{armProfile.calibrated ? t("manual.armHint") : t("manual.armNotCalibrated")}</p>
        </section>

        <section className="panel manual-can-panel">
          <PanelTitle icon={<DatabaseZap size={18} />} title={t("manual.canJogTitle")} meta={`${ROBOT_PROFILE.canJog.stepDeg} deg / ${ROBOT_PROFILE.canJog.intervalMs} ms`} />
          <div className="can-jog-grid">
            <div className="can-jog-row">
              <div>
                <strong>{t("manual.canFrontTitle")}</strong>
                <span>{canJogGroupLabel("front", ROBOT_PROFILE.canJog)}</span>
              </div>
              <HoldButton active={manualHold.canFront === -1} disabled={Boolean(canBusy)} onHoldEnd={() => stopCanJogHold("front")} onHoldStart={() => startCanJogHold("front", -1)}>LT -</HoldButton>
              <HoldButton active={manualHold.canFront === 1} disabled={Boolean(canBusy)} onHoldEnd={() => stopCanJogHold("front")} onHoldStart={() => startCanJogHold("front", 1)}>LB +</HoldButton>
            </div>
            <div className="can-jog-row">
              <div>
                <strong>{t("manual.canRearTitle")}</strong>
                <span>{canJogGroupLabel("rear", ROBOT_PROFILE.canJog)}</span>
              </div>
              <HoldButton active={manualHold.canRear === -1} disabled={Boolean(canBusy)} onHoldEnd={() => stopCanJogHold("rear")} onHoldStart={() => startCanJogHold("rear", -1)}>RT -</HoldButton>
              <HoldButton active={manualHold.canRear === 1} disabled={Boolean(canBusy)} onHoldEnd={() => stopCanJogHold("rear")} onHoldStart={() => startCanJogHold("rear", 1)}>RB +</HoldButton>
            </div>
          </div>
          <p className="inline-note">{t("manual.canHint")}</p>
        </section>

        <section className="panel control-camera-panel">
          <PanelTitle icon={<Video size={18} />} title={t("master.cameraFeeds")} meta={piHost} />
          <div className="camera-feed-grid">
            <CameraFeed label={t("camera.main")} url={mainCameraUrl} />
            <CameraFeed label={t("camera.secondary")} url={secondaryCameraUrl} />
          </div>
        </section>

        <section className="panel realtime-panel">
          <PanelTitle icon={<Gauge size={18} />} title={t("master.realtime")} meta={aBoardHealth?.uptimeSec ? `${Math.round(aBoardHealth.uptimeSec)}s` : "--"} />
          <div className="metric-grid">
            <Metric label={t("metrics.queueDepth")} value={aBoardHealth?.queueDepth} />
            <Metric label={t("metrics.activeCommand")} value={aBoardHealth?.activeCommand ?? "--"} code />
            <Metric label={t("metrics.requestCount")} value={aBoardHealth?.requestCount} />
            <Metric label={t("metrics.motionPending")} value={String(Boolean(aBoardHealth?.motionPending))} />
            <Metric label={t("metrics.droppedMotion")} value={aBoardHealth?.droppedMotionCount} />
            <Metric label={t("metrics.lastError")} value={aBoardHealth?.lastError ?? aBoardError ?? "--"} tone={aBoardHealth?.lastError || aBoardError ? "danger" : "neutral"} code />
          </div>
        </section>

        <section className="panel device-panel">
          <PanelTitle icon={<Network size={18} />} title={t("master.deviceStatus")} meta={`${A_BOARD_BRIDGE_PORT} / ${PI_SERVO_BRIDGE_PORT}`} />
          <div className="device-status-grid">
            <ArchitectureNode icon={<Activity size={18} />} label={t("nodes.pcWebLite")} status="127.0.0.1:5174" tone="online" />
            <ArchitectureNode icon={<Radar size={18} />} label={t("nodes.raspberryPi")} status={piHost} tone={aBoardTone === "online" || piServoTone === "online" ? "online" : "warning"} />
            <ArchitectureNode icon={<Cable size={18} />} label={t("nodes.aBoardBridge")} status={bridgeStatusText(aBoardHealth, aBoardError, t)} tone={aBoardTone} />
            <ArchitectureNode icon={<Cpu size={18} />} label={t("nodes.mcuUart")} status={aBoardHealth?.serialPort ?? "/dev/ttyAMA5"} tone={aBoardHealth?.serialOpen ? "online" : "neutral"} />
            <ArchitectureNode icon={<DatabaseZap size={18} />} label={t("nodes.canBus")} status={aBoardHealth?.canServoReady === false ? t("status.notReady") : t("status.ready")} tone={aBoardHealth?.canServoReady === false ? "warning" : "online"} />
            <ArchitectureNode icon={<Wrench size={18} />} label={t("nodes.feetechBus")} status={piServoHealth?.serialPort ?? "/dev/serial0"} tone={piServoTone} />
          </div>
        </section>

        <section className="panel log-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("panels.eventLog")} meta={`${logs.length}`} />
          <LogList logs={logs} t={t} />
        </section>
      </section>
    );
  }

  function renderCanView() {
    return (
      <section className="view-grid can-view">
        <section className="panel can-group-panel">
          <PanelTitle icon={<Settings2 size={18} />} title={t("can.settingsTitle")} meta={t("can.priorityMeta", { bus: ROBOT_PROFILE.can.bus, priority: prioritySettings.canServo })} />
          <div className="servo-card-grid">
            {canServoProfiles.map((servo) => (
              <ServoInfoCard
                active={servo.id === selectedCanServo.id}
                key={servo.id}
                title={servo.name}
                subtitle={`ID ${servo.id} · ${servo.canBus}`}
                onClick={() => selectCanServo(servo.id)}
                rows={[
                  [t("fields.minDeg"), `${servo.minDeg ?? 0}`],
                  [t("fields.maxDeg"), `${servo.maxDeg ?? 360}`],
                  [t("fields.direction"), directionLabel(servo.direction, t)],
                  [t("fields.bitrate"), `${servo.bitrateKbps ?? ROBOT_PROFILE.can.bitrateKbps} kbps`]
                ]}
              />
            ))}
          </div>
          <div className="group-angle-grid">
            {canServoProfiles.map((servo) => (
              <label key={servo.id}>
                <span>{servo.name}</span>
                <input value={canGroupAngles[String(servo.id)] ?? String(servoLogicalCenter(servo))} onChange={(event) => updateCanGroupAngle(servo.id, event.target.value)} />
              </label>
            ))}
          </div>
          <div className="toolbar-row">
            <button className="icon-button primary" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.groupMove"), groupMoveCommand, { configureFirst: true, timeoutMs: 1600 })} type="button">
              <Network size={17} /><span>{t("actions.groupMove")}</span>
            </button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.configureCan"), () => buildAsmgMdCanConfigCommand(nextSeq(), canConfig.bitrateKbps))} type="button">
              <Send size={17} /><span>{t("actions.configureCan")}</span>
            </button>
          </div>
        </section>

        <section className="panel can-single-panel">
          <PanelTitle icon={<Shield size={18} />} title={t("can.singleTitle")} meta={selectedCanServo.name} />
          <div className="form-grid">
            <label>{t("fields.targetId")}<select value={selectedCanServo.id} onChange={(event) => selectCanServo(Number(event.target.value))}>{canServoProfiles.map((servo) => <option key={servo.id} value={servo.id}>{servo.name} / ID{servo.id}</option>)}</select></label>
            <label>{t("fields.bitrate")}<select value={canConfig.bitrateKbps} onChange={(event) => updateCanConfig("bitrateKbps", Number(event.target.value) as AsmgMdBaudKbps)}>{baudOptions.map((baud) => <option key={baud} value={baud}>{baud} kbps</option>)}</select></label>
            <label>{t("fields.minDeg")}<input value={canConfig.minDeg} onChange={(event) => updateCanConfig("minDeg", event.target.value)} /></label>
            <label>{t("fields.maxDeg")}<input value={canConfig.maxDeg} onChange={(event) => updateCanConfig("maxDeg", event.target.value)} /></label>
            <label>{t("fields.direction")}<select value={canConfig.direction} onChange={(event) => updateCanConfig("direction", Number(event.target.value) === -1 ? -1 : 1)}><option value={1}>{t("fields.directionForward")}</option><option value={-1}>{t("fields.directionReverse")}</option></select></label>
            <label>{t("fields.positionDeg")}<input value={canConfig.positionDeg} onChange={(event) => updateCanConfig("positionDeg", event.target.value)} /></label>
            <label>{t("fields.speedRaw")}<input value={canConfig.speedRaw} onChange={(event) => updateCanConfig("speedRaw", event.target.value)} /></label>
            <label>{t("fields.currentRaw")}<input value={canConfig.currentRaw} onChange={(event) => updateCanConfig("currentRaw", event.target.value)} /></label>
            <label>{t("fields.pidP")}<input value={canConfig.pidP} onChange={(event) => updateCanConfig("pidP", event.target.value)} /></label>
            <label>{t("fields.pidI")}<input value={canConfig.pidI} onChange={(event) => updateCanConfig("pidI", event.target.value)} /></label>
            <label>{t("fields.pidD")}<input value={canConfig.pidD} onChange={(event) => updateCanConfig("pidD", event.target.value)} /></label>
            <label>{t("fields.newId")}<input value={canConfig.newId} onChange={(event) => updateCanConfig("newId", event.target.value)} /></label>
          </div>
          <div className="can-actions">
            <label className="check-row"><input checked={autoConfigureCan} onChange={(event) => setAutoConfigureCan(event.target.checked)} type="checkbox" />{t("can.autoConfigure")}</label>
            <button className="icon-button primary" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.move"), selectedMoveCommand, { configureFirst: true, timeoutMs: 1400 })} type="button"><Gauge size={17} /><span>{t("actions.move")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readPositionCurrent"), () => buildAsmgMdReadPositionCurrentCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readPositionCurrent")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readPosition"), () => buildAsmgMdReadPositionCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readPosition")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readCurrent"), () => buildAsmgMdReadCurrentCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readCurrent")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readRawFrames"), () => buildAsmgMdCanReadCommand(nextSeq()))} type="button"><Activity size={17} /><span>{t("actions.readRawFrames")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setCurrent"), () => buildAsmgMdSetCurrentCommand(nextSeq(), { id: selectedCanServo.id, current: integerFromText(canConfig.currentRaw, 0) }), { configureFirst: true })} type="button"><Send size={17} /><span>{t("actions.setCurrent")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setPid"), () => buildAsmgMdSetPidCommand(nextSeq(), { id: selectedCanServo.id, p: integerFromText(canConfig.pidP, 16), i: integerFromText(canConfig.pidI, 0), d: integerFromText(canConfig.pidD, 0) }), { configureFirst: true })} type="button"><Send size={17} /><span>{t("actions.setPid")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readPid"), () => buildAsmgMdReadPidCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readPid")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readId"), () => buildAsmgMdReadIdCommand(nextSeq()), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readId")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setBaud"), () => buildAsmgMdSetBaudCommand(nextSeq(), { id: selectedCanServo.id, baudKbps: canConfig.bitrateKbps }), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.writeBitrate")}</span></button>
            <button className="icon-button danger" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setId"), () => buildAsmgMdSetIdCommand(nextSeq(), integerFromText(canConfig.newId, selectedCanServo.id)), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.writeId")}</span></button>
            <button className="icon-button danger" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.saveCenter"), () => buildAsmgMdSaveCenterCommand(nextSeq(), { id: selectedCanServo.id, ratio: centerPercentToRatio(canConfig.centerPercent) }), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.saveCenter")}</span></button>
            <button className="icon-button danger" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.factoryReset"), () => buildAsmgMdFactoryResetCommand(nextSeq(), selectedCanServo.id), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.factoryReset")}</span></button>
            <label className="danger-confirm">{t("fields.dangerConfirm")}<input value={canConfig.dangerConfirm} onChange={(event) => updateCanConfig("dangerConfirm", event.target.value)} placeholder={t("placeholders.dangerConfirm", { id: canConfig.targetId })} /></label>
            <label>{t("fields.centerPercent")}<input value={canConfig.centerPercent} onChange={(event) => updateCanConfig("centerPercent", event.target.value)} /></label>
          </div>
          {canBusy && <p className="inline-status"><Send size={14} /><span>{t("can.busy", { action: canBusy })}</span></p>}
          {canError && <p className="form-error">{canError}</p>}
        </section>

        <section className="panel can-result-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("can.resultTitle")} meta={lastCanExchange?.label ?? "--"} />
          <div className="metric-grid">
            <Metric label={t("can.lastCommand")} value={lastCanExchange?.label ?? "--"} />
            <Metric label={t("metrics.ok")} value={lastCanExchange ? String(lastCanExchange.result.ok !== false) : "--"} tone={lastCanExchange?.result.ok === false ? "danger" : "neutral"} />
            <Metric label={t("metrics.parsedKind")} value={latestParsed?.kind ?? "--"} />
            <Metric label={t("metrics.servoId")} value={latestParsed?.servoId ?? "--"} />
            <Metric label={t("metrics.positionRaw")} value={latestParsed?.position ?? latestParsed?.currentPosition ?? "--"} />
            <Metric label={t("metrics.currentRaw")} value={latestParsed?.current ?? latestParsed?.currentTorque ?? "--"} />
          </div>
        </section>
      </section>
    );
  }

  function renderFeetechView() {
    const selectedId = readTargetId(feetechConfig.targetId);
    return (
      <section className="view-grid feetech-view">
        <section className="panel">
          <PanelTitle icon={<Wrench size={18} />} title={t("feetech.title")} meta={`${ROBOT_PROFILE.feetech.busBaudRate} baud`} />
          <div className="servo-card-grid">
            {ROBOT_PROFILE.feetech.servos.map((servo) => (
              <ServoInfoCard
                active={servo.id === selectedId}
                key={servo.id}
                title={servo.name}
                subtitle={`ID ${servo.id} · Feetech`}
                onClick={() => setFeetechConfig((current) => ({ ...current, targetId: String(servo.id) }))}
                rows={[
                  [t("fields.minDeg"), `${servo.minDeg ?? 0}`],
                  [t("fields.maxDeg"), `${servo.maxDeg ?? 360}`],
                  [t("fields.direction"), directionLabel(servo.direction, t)],
                  [t("feetech.bridgeBaud"), `${ROBOT_PROFILE.feetech.bridgeBaudRate}`]
                ]}
              />
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Send size={18} />} title={t("feetech.commandTitle")} meta={bridgeBaseUrl(piHost, PI_SERVO_BRIDGE_PORT)} />
          <div className="form-grid">
            <label>{t("fields.targetId")}<input value={feetechConfig.targetId} onChange={(event) => setFeetechConfig((current) => ({ ...current, targetId: event.target.value }))} /></label>
            <label>{t("fields.positionDeg")}<input value={feetechConfig.angleDeg} onChange={(event) => setFeetechConfig((current) => ({ ...current, angleDeg: event.target.value }))} /></label>
            <label>{t("fields.speedRaw")}<input value={feetechConfig.speedRaw} onChange={(event) => setFeetechConfig((current) => ({ ...current, speedRaw: event.target.value }))} /></label>
            <label>{t("fields.acc")}<input value={feetechConfig.acc} onChange={(event) => setFeetechConfig((current) => ({ ...current, acc: event.target.value }))} /></label>
            <label className="check-row"><input checked={feetechConfig.torqueEnabled} onChange={(event) => setFeetechConfig((current) => ({ ...current, torqueEnabled: event.target.checked }))} type="checkbox" />{t("fields.torqueEnabled")}</label>
          </div>
          <div className="toolbar-row">
            <button className="icon-button" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.ping"), () => ({ type: "servo.ping", seq: nextSeq(), id: selectedId }))} type="button"><Radar size={17} /><span>{t("actions.ping")}</span></button>
            <button className="icon-button" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.readFeedback"), () => ({ type: "servo.read", seq: nextSeq(), id: selectedId }))} type="button"><Activity size={17} /><span>{t("actions.readFeedback")}</span></button>
            <button className="icon-button" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.torque"), () => ({ type: "servo.torque", seq: nextSeq(), id: selectedId, enabled: feetechConfig.torqueEnabled }))} type="button"><Shield size={17} /><span>{t("actions.torque")}</span></button>
            <button className="icon-button primary" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.move"), () => ({
              type: "servo.move",
              seq: nextSeq(),
              targets: [{ id: selectedId, angleDeg: numberFromText(feetechConfig.angleDeg, 0), speedRaw: integerFromText(feetechConfig.speedRaw, 300), acc: integerFromText(feetechConfig.acc, 30) }]
            }))} type="button"><Gauge size={17} /><span>{t("actions.move")}</span></button>
          </div>
          {feetechBusy && <p className="inline-status"><Send size={14} /><span>{t("can.busy", { action: feetechBusy })}</span></p>}
          {feetechError && <p className="form-error">{feetechError}</p>}
        </section>
        <section className="panel">
          <PanelTitle icon={<Activity size={18} />} title={t("feetech.resultTitle")} meta={lastFeetechExchange?.label ?? "--"} />
          <div className="metric-grid">
            <Metric label={t("can.lastCommand")} value={lastFeetechExchange?.label ?? "--"} />
            <Metric label={t("metrics.ok")} value={lastFeetechExchange ? String(lastFeetechExchange.result.ok !== false) : "--"} tone={lastFeetechExchange?.result.ok === false ? "danger" : "neutral"} />
            <Metric label={t("metrics.protocol")} value={lastFeetechExchange?.result.protocol ?? "--"} />
            <Metric label={t("metrics.messageCount")} value={lastFeetechExchange?.result.messages.length ?? "--"} />
            <Metric label={t("metrics.serialPort")} value={lastFeetechExchange?.result.serialPort ?? "--"} code />
            <Metric label={t("metrics.baudRate")} value={lastFeetechExchange?.result.baudRate ?? "--"} />
          </div>
        </section>
      </section>
    );
  }

  function renderPwmView() {
    return (
      <section className="view-grid pwm-view">
        <section className="panel">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title={t("pwm.title")} meta="S / T / U / V" />
          <div className="servo-card-grid">
            {ROBOT_PROFILE.pwmServos.map((servo) => (
              <ServoInfoCard
                active={servo.id === selectedPwmServo?.id}
                key={servo.id}
                title={servo.name}
                subtitle={`${servo.silk} · ${servo.pin}`}
                onClick={() => {
                  setSelectedPwmServoId(servo.id);
                  setPwmPulseUs(String(servo.centerPulseUs));
                }}
                rows={[
                  [t("fields.frequency"), `${servo.frequencyHz} Hz`],
                  [t("fields.minPulse"), `${servo.minPulseUs} us`],
                  [t("fields.centerPulse"), `${servo.centerPulseUs} us`],
                  [t("fields.maxPulse"), `${servo.maxPulseUs} us`]
                ]}
              />
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Settings2 size={18} />} title={t("pwm.commandTitle")} meta={selectedPwmServo?.pin ?? "--"} />
          <div className="form-grid">
            <label>{t("fields.pwmServo")}<select value={selectedPwmServo?.id ?? ""} onChange={(event) => setSelectedPwmServoId(event.target.value)}>{ROBOT_PROFILE.pwmServos.map((servo) => <option key={servo.id} value={servo.id}>{servo.name}</option>)}</select></label>
            <label>{t("fields.pulseUs")}<input value={pwmPulseUs} onChange={(event) => setPwmPulseUs(event.target.value)} /></label>
            <label>{t("fields.frequency")}<input readOnly value={selectedPwmServo?.frequencyHz ?? "--"} /></label>
            <label>{t("fields.pin")}<input readOnly value={selectedPwmServo ? `${selectedPwmServo.silk} / ${selectedPwmServo.pin}` : "--"} /></label>
          </div>
          <p className="inline-note">{t("pwm.note")}</p>
        </section>
        <section className="panel">
          <PanelTitle icon={<Gauge size={18} />} title={t("pwm.motorStatusTitle")} meta="M1-M6" />
          <div className="compact-table">
            {ROBOT_PROFILE.motors.map((motor) => (
              <div className="compact-row" key={motor.channel}>
                <strong>{motor.channel}</strong>
                <span>{motor.name}</span>
                <code>{motor.pwmPin ?? "--"} / {motor.in1Pin ?? "--"} / {motor.in2Pin ?? "--"}</code>
              </div>
            ))}
          </div>
        </section>
        <section className="panel pwm-motor-control-panel">
          <PanelTitle icon={<Gauge size={18} />} title={t("pwm.motorControlTitle")} meta="M1-M6" />
          <div className="compact-table pwm-motor-table">
            {ROBOT_PROFILE.motors.map((motor) => (
              <div className="pwm-motor-row" key={motor.channel}>
                <strong>{motor.channel}</strong>
                <span>{motor.name}</span>
                <code>{motor.pwmPin ?? "--"} / {motor.in1Pin ?? "--"} / {motor.in2Pin ?? "--"}</code>
                <code>{formatSignedPercent(pwmMotorTargets[motor.channel] ?? 0)}</code>
                <div className="pwm-motor-speed-cell">
                  <input aria-label={`${motor.channel} ${t("fields.motorSpeed")}`} max={100} min={0} step={1} type="range" value={pwmMotorSpeedPercent(motor.channel)} onChange={(event) => updatePwmMotorSpeed(motor.channel, event.target.value)} />
                  <input aria-label={`${motor.channel} ${t("fields.motorSpeed")}`} inputMode="numeric" max={100} min={0} step={1} type="number" value={pwmMotorSpeeds[motor.channel] ?? "35"} onChange={(event) => updatePwmMotorSpeed(motor.channel, event.target.value)} />
                </div>
                <div className="pwm-motor-actions">
                  <button className="icon-button" onClick={() => void setPwmMotorSpeedFor(motor, -1)} type="button"><RotateCw size={15} /><span>{t("manual.backward")}</span></button>
                  <button className="icon-button danger" onClick={() => void stopPwmMotor(motor)} type="button"><Square size={15} /><span>{t("manual.stop")}</span></button>
                  <button className="icon-button primary" onClick={() => void setPwmMotorSpeedFor(motor, 1)} type="button"><Send size={15} /><span>{t("manual.forward")}</span></button>
                </div>
              </div>
            ))}
          </div>
          <div className="toolbar-row">
            <button className="icon-button danger" onClick={stopAllPwmMotors} type="button"><Square size={17} /><span>{t("actions.stopAll")}</span></button>
          </div>
          <p className="inline-note">{t("pwm.motorControlNote")}</p>
        </section>
      </section>
    );
  }

  function renderGamepadView() {
    const gamepadApiSupported = typeof navigator !== "undefined" && Boolean(navigator.getGamepads);
    const gamepadActivityFresh = gamepadActivityAt > 0 && Date.now() - gamepadActivityAt < 1200;
    const manualTxAgeSeconds = manualTxStatus ? Math.max(0, Math.round((Date.now() - manualTxStatus.at) / 100) / 10) : null;
    const manualTxSourceLabel = manualTxStatus ? t(manualTxStatus.source === "gamepad" ? "gamepad.diag.sourceGamepad" : "gamepad.diag.sourceManual") : "";
    const manualTxValue = manualTxStatus
      ? `${manualTxSourceLabel} ${manualTxStatus.commandType}${manualTxStatus.seq === null ? "" : ` #${manualTxStatus.seq}`} ${manualTxAgeSeconds}s`
      : "--";
    const manualTxTone: Tone = manualTxStatus?.state === "error" ? "danger" : manualTxStatus?.state === "sending" ? "warning" : "online";
    const fixedInputLamps: Array<{ label: string; active: boolean; value?: string }> = [
      { label: "D↑", active: liteGamepadState.dpadUp },
      { label: "D↓", active: liteGamepadState.dpadDown },
      { label: "D←", active: liteGamepadState.dpadLeft },
      { label: "D→", active: liteGamepadState.dpadRight },
      { label: "LX", active: Math.abs(liteGamepadState.leftX) > 0, value: liteGamepadState.leftX.toFixed(2) },
      { label: "LY", active: Math.abs(liteGamepadState.leftY) > 0, value: liteGamepadState.leftY.toFixed(2) },
      { label: "RX", active: Math.abs(liteGamepadState.rightX) > 0, value: liteGamepadState.rightX.toFixed(2) },
      { label: "RY", active: Math.abs(liteGamepadState.rightY) > 0, value: liteGamepadState.rightY.toFixed(2) },
      { label: "LB", active: liteGamepadState.lb },
      { label: "LT", active: liteGamepadState.lt },
      { label: "RB", active: liteGamepadState.rb },
      { label: "RT", active: liteGamepadState.rt },
      { label: "A", active: liteGamepadState.stop }
    ];
    return (
      <section className="view-grid gamepad-view">
        <section className="panel gamepad-main-panel">
          <PanelTitle icon={<Gamepad2 size={18} />} title={t("gamepad.title")} meta={activeGamepad ? `#${activeGamepad.index}` : t("gamepad.noGamepad")} />
          <div className="form-grid">
            <label>{t("fields.gamepad")}<select value={activeGamepadIndex ?? ""} onChange={(event) => setActiveGamepadIndex(event.target.value === "" ? null : Number(event.target.value))}>
              <option value="">{t("gamepad.auto")}</option>
              {gamepads.map((gamepad) => <option key={gamepad.index} value={gamepad.index}>#{gamepad.index} {gamepad.id}</option>)}
            </select></label>
            <label>{t("fields.gamepadPreset")}<select value={gamepadPreset} onChange={(event) => applyGamepadPreset(event.target.value as Exclude<GamepadPresetId, "auto">)}>{gamepadPresetOptions.map((preset) => <option key={preset} value={preset}>{t(`gamepad.presets.${preset}`)}</option>)}</select></label>
            <label>{t("fields.deadzone")}<input min={0} max={0.9} step={0.01} type="range" value={gamepadMapping.deadzone} onChange={(event) => setGamepadMapping((current) => normalizeGamepadMapping({ ...current, deadzone: Number(event.target.value) }))} /></label>
          </div>
          <label className="gamepad-enable-row">
            <input checked={gamepadControlEnabled} onChange={(event) => toggleGamepadControl(event.target.checked)} type="checkbox" />
            <span>{gamepadControlEnabled ? t("manual.gamepadEnabled") : t("manual.gamepadDisabled")}</span>
          </label>
          <div className="metric-grid">
            <Metric label={t("metrics.connected")} value={String(Boolean(activeGamepad))} tone={activeGamepad ? "online" : "warning"} />
            <Metric label={t("metrics.axes")} value={activeGamepad?.axes ?? "--"} />
            <Metric label={t("metrics.buttons")} value={activeGamepad?.buttons ?? "--"} />
            <Metric label={t("metrics.mapping")} value={activeGamepad?.mapping ?? "--"} />
          </div>
          <div className="gamepad-live-grid">
            {(["forward", "strafe", "turn", "cameraPan", "cameraTilt"] as const).map((key) => <AxisBar key={key} label={t(`gamepad.input.${key}`)} value={gamepadInput[key]} />)}
            <Metric label={t("gamepad.input.stop")} value={String(gamepadInput.stop)} tone={gamepadInput.stop ? "danger" : "neutral"} />
          </div>
          <div className="fixed-gamepad-grid">
            <Metric label={t("manual.dpad")} value={`${liteGamepadState.dpadUp ? "U" : "-"}${liteGamepadState.dpadDown ? "D" : "-"}${liteGamepadState.dpadLeft ? "L" : "-"}${liteGamepadState.dpadRight ? "R" : "-"}`} />
            <Metric label={t("manual.leftStick")} value={`${liteGamepadState.leftX.toFixed(2)} / ${liteGamepadState.leftY.toFixed(2)}`} />
            <Metric label={t("manual.rightStick")} value={`${liteGamepadState.rightX.toFixed(2)} / ${liteGamepadState.rightY.toFixed(2)}`} />
            <Metric label="LB / LT" value={`${String(liteGamepadState.lb)} / ${String(liteGamepadState.lt)}`} />
            <Metric label="RB / RT" value={`${String(liteGamepadState.rb)} / ${String(liteGamepadState.rt)}`} />
          </div>
        </section>

        <section className="panel gamepad-diagnostics-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("gamepad.diagnosticsTitle")} meta={activeGamepad?.id ?? t("gamepad.noGamepad")} />
          <div className="gamepad-led-grid">
            <GamepadLed active={gamepadApiSupported} label={t("gamepad.diag.api")} value={gamepadApiSupported ? t("status.ready") : t("status.notReady")} />
            <GamepadLed active={Boolean(activeGamepad)} label={t("gamepad.diag.device")} value={activeGamepad ? `#${activeGamepad.index}` : "--"} />
            <GamepadLed active={gamepadActivityFresh} label={t("gamepad.diag.activity")} value={gamepadActivityAt ? `${Math.max(0, Math.round((Date.now() - gamepadActivityAt) / 100) / 10)}s` : "--"} />
            <GamepadLed active={gamepadControlEnabled} label={t("gamepad.diag.control")} value={gamepadControlEnabled ? t("status.enabled") : t("status.disabled")} tone={gamepadControlEnabled ? "warning" : "neutral"} />
            <GamepadLed active={Boolean(manualTxStatus)} label={t("gamepad.diag.lastTx")} value={manualTxStatus?.error ?? manualTxValue} tone={manualTxTone} />
          </div>
          <div className="gamepad-lamp-grid">
            {fixedInputLamps.map((item) => <GamepadLed active={item.active} key={item.label} label={item.label} value={item.value ?? (item.active ? "1" : "0")} />)}
          </div>
          <div className="gamepad-raw-grid">
            <div>
              <strong>{t("gamepad.diag.rawAxes")}</strong>
              <div className="gamepad-axis-list">
                {(activeGamepad?.axesValues ?? []).map((value, index) => <AxisBar key={index} label={`A${index}`} value={value} />)}
                {!activeGamepad && <div className="empty-state">{t("gamepad.noGamepad")}</div>}
              </div>
            </div>
            <div>
              <strong>{t("gamepad.diag.rawButtons")}</strong>
              <div className="gamepad-button-list">
                {(activeGamepad?.buttonValues ?? []).map((value, index) => (
                  <div className={`raw-button ${value > 0.15 ? "active" : ""}`} key={index}>
                    <span>B{index}</span>
                    <strong>{value.toFixed(2)}</strong>
                  </div>
                ))}
                {!activeGamepad && <div className="empty-state">{t("gamepad.noGamepad")}</div>}
              </div>
            </div>
          </div>
        </section>

        <section className="panel gamepad-axis-panel">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title={t("gamepad.axisMapping")} />
          <div className="mapping-grid">
            {(["forward", "strafe", "turn"] as GamepadAxisKey[]).map((axis) => (
              <label className="mapping-row" key={axis}>
                <span>{t(`gamepad.input.${axis}`)}</span>
                <input min={0} max={31} type="number" value={gamepadMapping.axes[axis].index} onChange={(event) => updateGamepadAxis(axis, "index", event.target.value)} />
                <label className="check-row"><input checked={gamepadMapping.axes[axis].invert} onChange={(event) => updateGamepadAxis(axis, "invert", event.target.checked)} type="checkbox" />{t("fields.invert")}</label>
              </label>
            ))}
          </div>
        </section>
        <section className="panel gamepad-button-panel">
          <PanelTitle icon={<Gamepad2 size={18} />} title={t("gamepad.buttonMapping")} />
          <div className="mapping-grid button-mapping-grid">
            {(Object.keys(gamepadMapping.buttons) as GamepadButtonKey[]).map((button) => (
              <label className="mapping-row" key={button}>
                <span>{t(`gamepad.input.${button}`)}</span>
                <input min={0} max={31} type="number" value={gamepadMapping.buttons[button]} onChange={(event) => updateGamepadButton(button, event.target.value)} />
              </label>
            ))}
          </div>
        </section>
      </section>
    );
  }

  function renderSettingsView() {
    return (
      <section className="view-grid settings-view">
        <section className="panel">
          <PanelTitle icon={<Radar size={18} />} title={t("panels.piDiscovery")} meta={recommended?.candidate.host ?? t("common.manual")} />
          <div className="host-row">
            <input value={manualHost} onChange={(event) => setManualHost(event.target.value)} placeholder={t("placeholders.piHost")} />
            <button className="icon-button primary" onClick={() => applyHost(manualHost)} type="button"><Save size={17} /><span>{t("actions.apply")}</span></button>
            <button className="icon-button" disabled={discoveryBusy} onClick={() => void scanPiHosts()} type="button"><Radar size={17} /><span>{discoveryBusy ? t("actions.searchBusy") : t("actions.search")}</span></button>
            <button className="icon-button" disabled={healthBusy} onClick={() => void refreshHealth()} type="button"><RotateCw size={17} /><span>{healthBusy ? t("common.checking") : t("actions.check")}</span></button>
          </div>
          <div className="discovery-list">
            {discoveryResults.length === 0 ? (
              <p className="empty-state">{t("empty.noDiscovery")}</p>
            ) : discoveryResults.map((result) => (
              <div className="discovery-row" data-status={result.status} key={`${result.candidate.source}:${result.candidate.host}`}>
                <div>
                  <strong>{result.candidate.host}</strong>
                  <span>{candidateSourceLabel(result.candidate.source, t)} · {t("common.score")} {result.score}</span>
                </div>
                <div className="service-strip">
                  {result.services.map((service) => <span data-status={service.status} key={service.id} title={serviceLabel(service.id, t)}>{service.port}</span>)}
                </div>
                <button className="icon-button" disabled={result.status === "offline"} onClick={() => applyHost(result.candidate.host)} type="button"><Save size={15} /><span>{t("actions.use")}</span></button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title={t("priority.title")} meta={t("priority.meta")} />
          <div className="priority-list">
            {PRIORITY_FIELDS.map((field) => (
              <label className="priority-row" key={field.key}>
                <span><strong>{t(field.labelKey)}</strong><small>{t(field.detailKey)}</small></span>
                <input type="number" min={0} max={1000} value={prioritySettings[field.key]} onChange={(event) => updatePriority(field.key, event.target.value)} />
              </label>
            ))}
          </div>
          <button className="icon-button" onClick={resetPriorities} type="button"><RotateCw size={17} /><span>{t("actions.restoreDefaults")}</span></button>
        </section>
        <section className="panel">
          <PanelTitle icon={<Cable size={18} />} title={t("bridge.title")} meta={bridgeBaseUrl(piHost, A_BOARD_BRIDGE_PORT)} />
          <div className="metric-grid">
            <Metric label={t("metrics.aBoardSerial")} value={aBoardHealth?.serialOpen ? t("status.open") : t("status.closed")} tone={aBoardTone} />
            <Metric label={t("metrics.aBoardPort")} value={aBoardHealth?.serialPort ?? "/dev/ttyAMA5"} code />
            <Metric label={t("bridge.serialProtocol")} value={aBoardHealth?.serialProtocolActive ?? "--"} />
            <Metric label={t("metrics.piServoSerial")} value={piServoHealth?.serialOpen ? t("status.open") : t("status.closed")} tone={piServoTone} />
            <Metric label={t("metrics.piServoPort")} value={piServoHealth?.serialPort ?? "/dev/serial0"} code />
            <Metric label={t("metrics.binaryReady")} value={String(Boolean(aBoardHealth?.binaryProtocolReady || piServoHealth?.binaryProtocolReady))} />
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Settings2 size={18} />} title={t("settings.fixedProfile")} meta={ROBOT_PROFILE.name} />
          <div className="compact-table">
            <div className="compact-row"><strong>PC</strong><span>Web-Lite</span><code>5174</code></div>
            <div className="compact-row"><strong>Pi</strong><span>{piHost}</span><code>{A_BOARD_BRIDGE_PORT} / {PI_SERVO_BRIDGE_PORT}</code></div>
            <div className="compact-row"><strong>CAN</strong><span>{ROBOT_PROFILE.can.servos.length} ASMG-MD</span><code>{ROBOT_PROFILE.can.bus} / {ROBOT_PROFILE.can.bitrateKbps}</code></div>
            <div className="compact-row"><strong>Feetech</strong><span>{ROBOT_PROFILE.feetech.servos.map((servo) => `ID${servo.id}`).join(", ")}</span><code>{ROBOT_PROFILE.feetech.busBaudRate}</code></div>
          </div>
        </section>
      </section>
    );
  }

  const navItems: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
    { id: "control", label: t("nav.control"), icon: <Home size={16} /> },
    { id: "can", label: t("nav.can"), icon: <DatabaseZap size={16} /> },
    { id: "feetech", label: t("nav.feetech"), icon: <Wrench size={16} /> },
    { id: "pwm", label: t("nav.pwm"), icon: <SlidersHorizontal size={16} /> },
    { id: "gamepad", label: t("nav.gamepad"), icon: <Gamepad2 size={16} /> },
    { id: "settings", label: t("nav.settings"), icon: <Settings2 size={16} /> }
  ];

  return (
    <main className="app-shell">
      <header className="topbar glass-surface">
        <div className="brand-block">
          <div className="brand-mark">RR</div>
          <div className="brand-copy">
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
            <p className="system-line">{t("app.subtitle")}</p>
          </div>
        </div>
        <div className="topbar-status-area">
          <StatusPill label="Pi" value={piHost} tone={aBoardTone === "online" || piServoTone === "online" ? "online" : "warning"} />
          <StatusPill label="A-board" value={aBoardHealth?.serialOpen ? t("status.bridgeOnline") : aBoardError ?? t("common.checking")} tone={aBoardTone} />
          <StatusPill label="Pi servo" value={piServoHealth?.serialOpen ? t("status.bridgeOnline") : piServoError ?? t("status.standby")} tone={piServoTone} />
          <label className="language-control">
            <span>{t("language.label")}</span>
            <select aria-label={t("language.label")} value={currentLanguage} onChange={(event) => changeLanguage(event.target.value)}>
              {SUPPORTED_LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_LABELS[language]}</option>)}
            </select>
          </label>
        </div>
      </header>

      <nav className="view-tabs" aria-label={t("nav.label")}>
        {navItems.map((item) => (
          <button className={item.id === activeView ? "active" : ""} key={item.id} onClick={() => setActiveView(item.id)} type="button">
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>

      {activeView === "control" && renderControlView()}
      {activeView === "can" && renderCanView()}
      {activeView === "feetech" && renderFeetechView()}
      {activeView === "pwm" && renderPwmView()}
      {activeView === "gamepad" && renderGamepadView()}
      {activeView === "settings" && renderSettingsView()}
    </main>
  );
}

function PanelTitle({ icon, meta, title }: { icon: ReactNode; meta?: string; title: string }) {
  return (
    <div className="panel-title">
      <div className="panel-title-main">{icon}<h2>{title}</h2></div>
      {meta && <span className="panel-meta">{meta}</span>}
    </div>
  );
}

function StatusPill({ label, tone, value }: { label: string; tone: Tone; value: string }) {
  return (
    <div className={`status-pill ${tone}`}>
      <span className="status-led" />
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ArchitectureNode({ icon, label, status, tone }: { icon: ReactNode; label: string; status: string; tone: Tone }) {
  return (
    <div className={`architecture-node ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{status}</strong>
    </div>
  );
}

function Metric({ code = false, label, tone = "neutral", value }: { code?: boolean; label: string; tone?: Tone; value: unknown }) {
  const display = value === undefined || value === null || value === "" ? "--" : String(value);
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      {code ? <code>{display}</code> : <strong>{display}</strong>}
    </div>
  );
}

function CameraFeed({ label, url }: { label: string; url: string }) {
  return (
    <div className="camera-feed">
      <img alt={label} src={url} />
      <div>
        <strong>{label}</strong>
        <code>{url}</code>
      </div>
    </div>
  );
}

function ServoInfoCard({ active, onClick, rows, subtitle, title }: { active?: boolean; onClick?: () => void; rows: Array<[string, string]>; subtitle: string; title: string }) {
  return (
    <button className={`servo-info-card ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <div>
        {rows.map(([label, value]) => (
          <span key={label}><small>{label}</small><code>{value}</code></span>
        ))}
      </div>
    </button>
  );
}

function AxisBar({ label, value }: { label: string; value: number }) {
  const percent = Math.max(0, Math.min(100, 50 + value * 50));
  return (
    <div className="axis-bar">
      <span>{label}</span>
      <div><i style={{ left: `${percent}%` }} /></div>
      <strong>{value.toFixed(2)}</strong>
    </div>
  );
}

function GamepadLed({ active, label, tone = "online", value }: { active: boolean; label: string; tone?: Tone; value?: string }) {
  const displayTone = active ? tone : "neutral";
  return (
    <div className={`gamepad-led ${displayTone}`}>
      <span className="status-led" />
      <small>{label}</small>
      {value && <strong>{value}</strong>}
    </div>
  );
}

function HoldButton({ active = false, children, disabled = false, onHoldEnd, onHoldStart }: { active?: boolean; children: ReactNode; disabled?: boolean; onHoldEnd: () => void; onHoldStart: () => void }) {
  const holdingRef = useRef(false);

  function start(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0) {
      return;
    }
    event.preventDefault();
    holdingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onHoldStart();
  }

  function stop(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!holdingRef.current) {
      return;
    }
    event.preventDefault();
    holdingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onHoldEnd();
  }

  return (
    <button
      className={`hold-button ${active ? "active" : ""}`}
      disabled={disabled}
      onPointerCancel={stop}
      onPointerDown={start}
      onPointerLeave={stop}
      onPointerUp={stop}
      type="button"
    >
      {children}
    </button>
  );
}

function LogList({ logs, t }: { logs: LogEntry[]; t: TFunction }) {
  return (
    <div className="log-list">
      {logs.length === 0 ? <div className="empty-state">{t("empty.noLogs")}</div> : logs.map((log) => (
        <div className={`log-entry ${log.direction} ${log.level ?? "info"}`} key={log.id}>
          <span>{log.direction.toUpperCase()}</span>
          <code>{log.text}</code>
        </div>
      ))}
    </div>
  );
}

function readCanConfig() {
  const firstServo = ROBOT_PROFILE.can.servos[0];
  const fallback = {
    targetId: String(firstServo?.id ?? 1),
    bitrateKbps: ROBOT_PROFILE.can.bitrateKbps,
    minDeg: String(firstServo?.minDeg ?? 0),
    maxDeg: String(firstServo?.maxDeg ?? 360),
    direction: (firstServo?.direction === -1 ? -1 : 1) as 1 | -1,
    positionDeg: "90",
    speedRaw: String(ASMG_MD_SPEED_MAX),
    currentRaw: "50",
    pidP: "16",
    pidI: "0",
    pidD: "0",
    newId: String(firstServo?.id ?? 1),
    centerPercent: "100",
    dangerConfirm: ""
  };
  try {
    const raw = window.localStorage.getItem(CAN_CONFIG_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      ...fallback,
      ...parsed,
      bitrateKbps: baudOptions.includes(Number(parsed.bitrateKbps) as AsmgMdBaudKbps) ? Number(parsed.bitrateKbps) as AsmgMdBaudKbps : fallback.bitrateKbps,
      direction: parsed.direction === -1 ? -1 : 1
    };
  } catch {
    window.localStorage.removeItem(CAN_CONFIG_STORAGE_KEY);
    return fallback;
  }
}

function readCanServoProfiles(): AsmgMdServoProfile[] {
  const fallback = ROBOT_PROFILE.can.servos.map((servo) => normalizeEditableCanServoProfile(servo));
  try {
    const raw = window.localStorage.getItem(CAN_SERVO_PROFILES_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as unknown;
    const drafts = Array.isArray(parsed) ? parsed : [];
    return fallback.map((base) => {
      const draft = drafts.find((item): item is Partial<AsmgMdServoProfile> =>
        Boolean(item) && typeof item === "object" && Number((item as Partial<AsmgMdServoProfile>).id) === base.id
      );
      return normalizeEditableCanServoProfile({ ...base, ...draft, id: base.id, name: base.name, canBus: base.canBus });
    });
  } catch {
    window.localStorage.removeItem(CAN_SERVO_PROFILES_STORAGE_KEY);
    return fallback;
  }
}

function normalizeEditableCanServoProfile(profile: AsmgMdServoProfile): AsmgMdServoProfile {
  let minDeg = finiteInRange(profile.minDeg, 0, 0, 360);
  let maxDeg = finiteInRange(profile.maxDeg, 360, 0, 360);
  if (minDeg >= maxDeg) {
    if (minDeg >= 360) {
      minDeg = Math.max(0, maxDeg - 1);
    } else {
      maxDeg = Math.min(360, minDeg + 1);
    }
  }
  return normalizeAsmgMdServoProfile({
    ...profile,
    minDeg,
    maxDeg,
    direction: profile.direction === -1 ? -1 : 1,
    bitrateKbps: normalizeCanBaud(profile.bitrateKbps)
  });
}

function syncCanConfigToServo(config: ReturnType<typeof readCanConfig>, servo: AsmgMdServoProfile): ReturnType<typeof readCanConfig> {
  const next = {
    ...config,
    targetId: String(servo.id),
    minDeg: String(servo.minDeg ?? 0),
    maxDeg: String(servo.maxDeg ?? 360),
    direction: (servo.direction === -1 ? -1 : 1) as 1 | -1,
    bitrateKbps: servo.bitrateKbps ?? config.bitrateKbps
  };
  return next.targetId === config.targetId &&
    next.minDeg === config.minDeg &&
    next.maxDeg === config.maxDeg &&
    next.direction === config.direction &&
    next.bitrateKbps === config.bitrateKbps
    ? config
    : next;
}

function readCanGroupAngles(): Record<string, string> {
  const fallback = Object.fromEntries(ROBOT_PROFILE.can.servos.map((servo) => [String(servo.id), String(servoLogicalCenter(servo))]));
  try {
    const raw = window.localStorage.getItem(CAN_GROUP_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(ROBOT_PROFILE.can.servos.map((servo) => {
      const value = parsed[String(servo.id)];
      return [String(servo.id), typeof value === "string" && value.trim() ? value : fallback[String(servo.id)]];
    }));
  } catch {
    window.localStorage.removeItem(CAN_GROUP_STORAGE_KEY);
    return fallback;
  }
}

function canGroupAngleStringsToNumbers(values: Record<string, string>, servos: AsmgMdServoProfile[]): Record<string, number> {
  const fallback = createCanJogAngles(servos);
  return Object.fromEntries(servos.map((servo) => {
    const key = String(servo.id);
    return [key, numberFromText(values[key], fallback[key] ?? servoLogicalCenter(servo))];
  }));
}

function canGroupAngleNumbersToStrings(values: Record<string, number>, servos: AsmgMdServoProfile[]): Record<string, string> {
  const fallback = createCanJogAngles(servos);
  return Object.fromEntries(servos.map((servo) => {
    const key = String(servo.id);
    const value = Number.isFinite(values[key]) ? values[key] : fallback[key] ?? servoLogicalCenter(servo);
    return [key, String(Math.round(value * 100) / 100)];
  }));
}

function readGamepadMapping(): GamepadMapping {
  try {
    const raw = window.localStorage.getItem(GAMEPAD_STORAGE_KEY);
    return raw ? normalizeGamepadMapping(JSON.parse(raw)) : normalizeGamepadMapping(DEFAULT_INPUT_MAPPING.gamepad);
  } catch {
    window.localStorage.removeItem(GAMEPAD_STORAGE_KEY);
    return normalizeGamepadMapping(DEFAULT_INPUT_MAPPING.gamepad);
  }
}

function readArmProfile(): LiteArmProfile {
  try {
    const raw = window.localStorage.getItem(ARM_CONTROL_STORAGE_KEY);
    return normalizeLiteArmProfile(raw ? JSON.parse(raw) : ROBOT_PROFILE.arm, ROBOT_PROFILE.arm);
  } catch {
    window.localStorage.removeItem(ARM_CONTROL_STORAGE_KEY);
    return normalizeLiteArmProfile(ROBOT_PROFILE.arm, ROBOT_PROFILE.arm);
  }
}

function selectPreferredGamepad(pads: Gamepad[], activeIndex: number | null): Gamepad | null {
  if (activeIndex !== null) {
    return pads.find((gamepad) => gamepad.index === activeIndex) ?? null;
  }
  return [...pads].sort((a, b) => gamepadPriority(b) - gamepadPriority(a) || a.index - b.index)[0] ?? null;
}

function selectPreferredGamepadSummary(gamepads: GamepadSummary[], activeIndex: number | null): GamepadSummary | null {
  if (activeIndex !== null) {
    return gamepads.find((gamepad) => gamepad.index === activeIndex) ?? null;
  }
  return [...gamepads].sort((a, b) => gamepadSummaryPriority(b) - gamepadSummaryPriority(a) || a.index - b.index)[0] ?? null;
}

function gamepadPriority(gamepad: Gamepad): number {
  return scoreGamepad(gamepad.id, gamepad.mapping || "unknown", gamepad.axes.length, gamepad.buttons.length);
}

function gamepadSummaryPriority(gamepad: GamepadSummary): number {
  return scoreGamepad(gamepad.id, gamepad.mapping, gamepad.axes, gamepad.buttons);
}

function scoreGamepad(id: string, mapping: string, axes: number, buttons: number): number {
  const normalizedId = id.toLowerCase();
  let score = 0;
  if (mapping === "standard") {
    score += 1000;
  }
  if (/\bxbox\b|xinput|x-box|360/.test(normalizedId)) {
    score += 200;
  }
  if (/unknown/.test(normalizedId)) {
    score -= 100;
  }
  score += Math.min(buttons, 16) * 6;
  score += Math.min(axes, 8) * 3;
  if (buttons <= 4 && axes >= 8) {
    score -= 80;
  }
  return score;
}

function hasRawGamepadActivity(gamepad: Gamepad, deadzone: number): boolean {
  return gamepad.axes.some((axis) => Math.abs(axis) > deadzone && Math.abs(axis) <= 1.05) ||
    gamepad.buttons.some((button) => button.pressed || (button.value ?? 0) > 0.15);
}

function readStoredString(key: string, fallback: string): string {
  try {
    const value = window.localStorage.getItem(key);
    return value?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function createPwmMotorSpeedStrings(defaultValue = "35"): Record<string, string> {
  return Object.fromEntries(ROBOT_PROFILE.motors.map((motor) => [motor.channel, defaultValue]));
}

function readTargetId(value: string): number {
  const id = integerFromText(value, 1);
  return Math.max(0, Math.min(253, id));
}

function integerFromText(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function numberFromText(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteInRange(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function normalizeCanBaud(value: unknown): AsmgMdBaudKbps {
  const number = Number(value);
  return baudOptions.includes(number as AsmgMdBaudKbps) ? number as AsmgMdBaudKbps : ROBOT_PROFILE.can.bitrateKbps;
}

function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return value.toFixed(digits).replace(/\.0+$/, "");
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function centerPercentToRatio(value: string): number {
  const percent = Math.max(0, Math.min(100, numberFromText(value, 100)));
  return Math.round((percent / 100) * ASMG_MD_CENTER_RATIO_MAX);
}

function servoLogicalCenter(servo: AsmgMdServoProfile): number {
  return ((servo.maxDeg ?? 360) - (servo.minDeg ?? 0)) / 2;
}

function canServoProfileFromConfig(servo: AsmgMdServoProfile, config: ReturnType<typeof readCanConfig>): AsmgMdServoProfile {
  return normalizeAsmgMdServoProfile({
    ...servo,
    name: servo.name,
    bitrateKbps: config.bitrateKbps,
    canBus: servo.canBus ?? ROBOT_PROFILE.can.bus
  });
}

function bridgeTone(health: BridgeHealth | null, error: string | null): Tone {
  if (error) return "danger";
  if (health?.ok && health.serialOpen !== false) return "online";
  if (health) return "warning";
  return "neutral";
}

function bridgeStatusText(health: BridgeHealth | null, error: string | null, t: TFunction): string {
  if (error) return error;
  if (!health) return t("status.notChecked");
  if (health.ok && health.serialOpen !== false) return t("status.online");
  return t("status.reachableSerialClosed");
}

function candidateSourceLabel(source: PiDiscoverySource, t: TFunction): string {
  const keyBySource: Record<PiDiscoverySource, string> = {
    "manual-usb-fallback": "sources.manualUsbFallback",
    "mdns": "sources.mdns",
    "saved": "sources.saved",
    "usb-gadget-fallback": "sources.usbGadgetFallback",
    "usb-gadget-hostname": "sources.usbGadgetHostname"
  };
  return t(keyBySource[source]);
}

function serviceLabel(id: string, t: TFunction): string {
  const keyByService: Record<string, string> = {
    aBoardBridge: "services.aBoardBridge",
    mainCamera: "services.mainCamera",
    piServoBridge: "services.piServoBridge",
    secondaryCamera: "services.secondaryCamera"
  };
  return t(keyByService[id] ?? id);
}

function directionLabel(direction: number | undefined, t: TFunction): string {
  return direction === -1 ? t("fields.directionReverse") : t("fields.directionForward");
}

function zeroGamepadInput(): GamepadLiveInput {
  return { forward: 0, strafe: 0, turn: 0, cameraPan: 0, cameraTilt: 0, stop: false };
}

function readGamepadInput(gamepad: Gamepad | null, mapping: GamepadMapping): GamepadLiveInput {
  if (!gamepad) {
    return zeroGamepadInput();
  }
  return {
    forward: readMappedAxis(gamepad, mapping.axes.forward, mapping.deadzone),
    strafe: readMappedAxis(gamepad, mapping.axes.strafe, mapping.deadzone),
    turn: readMappedAxis(gamepad, mapping.axes.turn, mapping.deadzone),
    cameraPan: readButtonAxis(gamepad, mapping.buttons.cameraRight, mapping.buttons.cameraLeft),
    cameraTilt: readButtonAxis(gamepad, mapping.buttons.cameraUp, mapping.buttons.cameraDown),
    stop: Boolean(gamepad.buttons[mapping.buttons.stop]?.pressed)
  };
}

function readMappedAxis(gamepad: Gamepad, axis: GamepadMapping["axes"][GamepadAxisKey], deadzone: number): number {
  const raw = gamepad.axes[axis.index] ?? 0;
  const value = axis.invert ? -raw : raw;
  return Math.abs(value) < deadzone ? 0 : Number(value.toFixed(2));
}

function readButtonAxis(gamepad: Gamepad, positive: number, negative: number): number {
  return (gamepad.buttons[positive]?.pressed ? 1 : 0) - (gamepad.buttons[negative]?.pressed ? 1 : 0);
}

function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return t("errors.unknown");
}
