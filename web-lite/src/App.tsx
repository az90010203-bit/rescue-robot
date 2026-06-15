import { Activity, ArrowDown, ArrowUp, Cable, Camera, Cpu, DatabaseZap, Gamepad2, Gauge, HandHelping, Home, Network, Play, Radar, RefreshCw, RotateCcw, RotateCw, Save, Send, Settings2, Shield, ShieldAlert, SlidersHorizontal, Square, Video, Wrench } from "lucide-react";
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
import { buildDebugSetCommand, buildServoSpeedCommand, calculateWheelTurnDelta, isServoDebugDisabledError, servoPhysicalToLogicalAngle, type InboundMessage, type PcCommand } from "@adapters/hardware/protocol";
import {
  MACHINE_CLAW_SERVO_IDS,
  buildMachineClawClawCommand,
  buildMachineClawPitchCommands,
  buildMachineClawReadCommand,
  buildMachineClawRotationCommands,
  buildMachineClawStopCommands,
  machineClawActionKey,
  machineClawClawActionKey,
  machineClawTargetTurns,
  normalizeMachineClawConfigPatch,
  type MachineClawClawDirection,
  type MachineClawConfigPatch,
  type MachineClawDirection,
  type MachineClawRunAction,
  type MachineClawTestConfig,
  type MachineClawTurnProgress
} from "@domains/machine-claw/machineClaw";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, isLiteLanguage, type LiteLanguage } from "./i18n/languages";
import { A_BOARD_BRIDGE_PORT, CAMERA_PORTS, PI_SERVO_BRIDGE_PORT, ROBOT_PROFILE, type LiteArmProfile, type PwmServoProfile } from "./robotProfile";
import { bridgeBaseUrl, buildCommandEnvelope, checkAboardBridgeHealth, checkPiServoBridgeHealth, sendAboardCommand, sendPiServoBridgeCommand, type AboardCommandResult, type BridgeHealth, type PiServoCommandResult } from "./runtime/bridgeClient";
import {
  ZERO_LITE_GAMEPAD_STATE,
  buildOperatorGamepadDiagramState,
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
  stepLiteGamepadControlMode,
  trackedInputFromStick,
  type LiteCanJogDirection,
  type LiteCanJogGroup,
  type LiteFourAxisArmJoystickInput,
  type LiteGamepadControlMode,
  type LiteGamepadState,
  type LiteTrackedInput,
  type OperatorGamepadDiagramControl,
  type OperatorGamepadDiagramControlId,
  type OperatorGamepadDiagramState
} from "./runtime/manualControl";
import { discoverPiHosts, normalizeHost, recommendedPiResult, type PiDiscoveryResult, type PiDiscoverySource } from "./runtime/piDiscoveryLite";
import { DEFAULT_PRIORITY_SETTINGS, PRIORITY_FIELDS, loadPrioritySettings, normalizePrioritySettings, savePrioritySettings, type PrioritySettings } from "./runtime/priority";
import {
  buildOperatorDeviceMatrix,
  isConsoleViewVisible,
  resolveConsoleViewForMode,
  type LiteConsoleMode
} from "./runtime/operatorConsole";
import {
  machineClawPositionRawFromResult,
  machineClawResponseFromResult,
  readMachineClawConfig,
  saveMachineClawConfig
} from "./runtime/machineClawLite";
import {
  createMachineClawProtectionServoRuntime,
  evaluateMachineClawProtectionFeedback,
  type MachineClawProtectionReason,
  type MachineClawProtectionServoRuntime,
  type MachineClawProtectionTrip
} from "./runtime/machineClawProtection";
import { buildLiteImuReadCommand, createLiteImuSnapshot, liteImuFeedbackFromResult, type LiteImuSnapshot } from "./runtime/imuLite";
import { CameraViewer } from "@domains/camera/CameraViewer";
import {
  applyFourAxisArmJoystickStep,
  applyArmJoystickStep,
  armCommandSignature,
  buildLiteArmMoveCommand,
  buildLiteFourAxisWristPoseHoldSpeedCommand,
  buildLiteFourAxisWristPoseHoldSpeedTargets,
  calculateLiteArmGravityCompensation,
  createLiteArmRuntimeState,
  createLiteFourAxisArmRuntimeState,
  createLiteFourAxisPoseLock,
  hasArmJoystickMotion,
  normalizeLiteArmProfile,
  solveFourAxisArmPoseIk,
  solveTwoLinkArmIk,
  wristSpeedCommandSignature,
  type LiteFourAxisArmPose,
  type LiteFourAxisArmRuntimeState,
  type LiteFourAxisPoseLock,
  type LiteFourAxisWristPoseFeedback,
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

interface LiteCameraRuntime {
  failed: boolean;
  loaded: boolean;
  webrtcError: string | null;
  webrtcFallback: boolean;
}

interface LiteCameraLatency {
  error: string | null;
  estimateMs: number | null;
  rttMs: number | null;
  updatedAt: number | null;
}

interface MachineClawMonitorRuntime {
  completedTurns: number;
  direction?: MachineClawClawDirection;
  generation: number;
  lastRawChangedAtMs: number;
  polling: boolean;
  previousRaw: number;
  source?: "gamepad" | "panel";
  speedRaw: number;
  startedAtMs: number;
  targetTurns: number;
}

interface MachineClawProtectionMonitorRuntime {
  generation: number;
  polling: boolean;
  servos: MachineClawProtectionServoRuntime[];
  source: "gamepad" | "panel";
}

interface MachineClawProtectionStatus {
  active: boolean;
  detail: string | null;
  ids: number[];
  reason: MachineClawProtectionReason | null;
  tripped: boolean;
}

interface MachineClawProtectionTarget {
  id: number;
  speedRaw: number;
}

interface WristPoseFeedbackRuntime extends LiteFourAxisWristPoseFeedback {
  leftRaw: number;
  leftSpeedRaw: number;
  leftTurns: number;
  polling: boolean;
  rightRaw: number;
  rightSpeedRaw: number;
  rightTurns: number;
}

const PI_HOST_STORAGE_KEY = "rescue-robot-lite.piHost.v3";
const CAN_CONFIG_STORAGE_KEY = "rescue-robot-lite.canConfig.v1";
const CAN_SERVO_PROFILES_STORAGE_KEY = "rescue-robot-lite.canServoProfiles.v1";
const CAN_GROUP_STORAGE_KEY = "rescue-robot-lite.canGroupAngles.v1";
const GAMEPAD_STORAGE_KEY = "rescue-robot-lite.gamepad.v1";
const ARM_CONTROL_STORAGE_KEY = "rescue-robot-lite.armControl.v1";
const GAMEPAD_DRIVE_RESEND_MS = 200;
const MACHINE_CLAW_POLL_MS = 180;
const WRIST_POSE_FEEDBACK_POLL_MS = 180;

const MACHINE_CLAW_ACTION_I18N_KEYS: Record<MachineClawRunAction, string> = {
  idle: "machineClaw.status.idle",
  "pitch-positive": "machineClaw.status.pitchPositive",
  "pitch-negative": "machineClaw.status.pitchNegative",
  "rotation-positive": "machineClaw.status.rotationPositive",
  "rotation-negative": "machineClaw.status.rotationNegative",
  "claw-open": "machineClaw.status.clawOpen",
  "claw-close": "machineClaw.status.clawClose",
  stopping: "machineClaw.status.stopping",
  error: "machineClaw.status.error"
};

const EMPTY_MACHINE_CLAW_PROGRESS: MachineClawTurnProgress = {
  completedTurns: 0,
  targetTurns: 0,
  running: false
};

const EMPTY_MACHINE_CLAW_PROTECTION_STATUS: MachineClawProtectionStatus = {
  active: false,
  detail: null,
  ids: [],
  reason: null,
  tripped: false
};

const EMPTY_CAMERA_RUNTIME: LiteCameraRuntime = {
  failed: false,
  loaded: false,
  webrtcError: null,
  webrtcFallback: false
};

const EMPTY_CAMERA_LATENCY: LiteCameraLatency = {
  error: null,
  estimateMs: null,
  rttMs: null,
  updatedAt: null
};

const baudOptions: AsmgMdBaudKbps[] = [250, 500, 1000];
const gamepadPresetOptions: Array<Exclude<GamepadPresetId, "auto">> = ["xinput", "playstation", "switchPro", "generic"];

export default function App() {
  const { i18n, t } = useTranslation();
  const [activeView, setActiveView] = useState<ViewId>("control");
  const [consoleMode, setConsoleMode] = useState<LiteConsoleMode>("operator");
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
  const [imuSnapshot, setImuSnapshot] = useState<LiteImuSnapshot | null>(null);
  const [imuError, setImuError] = useState<string | null>(null);
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
  const [cameraRuntimeById, setCameraRuntimeById] = useState<Record<string, LiteCameraRuntime>>({
    main: EMPTY_CAMERA_RUNTIME,
    secondary: EMPTY_CAMERA_RUNTIME
  });
  const [gamepadMapping, setGamepadMapping] = useState<GamepadMapping>(() => readGamepadMapping());
  const [gamepadPreset, setGamepadPreset] = useState<Exclude<GamepadPresetId, "auto">>("xinput");
  const [activeGamepadIndex, setActiveGamepadIndex] = useState<number | null>(null);
  const [gamepads, setGamepads] = useState<GamepadSummary[]>([]);
  const [gamepadInput, setGamepadInput] = useState<GamepadLiveInput>(() => zeroGamepadInput());
  const [liteGamepadState, setLiteGamepadState] = useState<LiteGamepadState>(ZERO_LITE_GAMEPAD_STATE);
  const [gamepadActivityAt, setGamepadActivityAt] = useState(0);
  const [gamepadControlEnabled, setGamepadControlEnabled] = useState(false);
  const [gamepadControlMode, setGamepadControlMode] = useState<LiteGamepadControlMode>("drive");
  const [manualTxStatus, setManualTxStatus] = useState<ManualTxStatus | null>(null);
  const [armProfile, setArmProfile] = useState<LiteArmProfile>(() => readArmProfile());
  const [armState, setArmState] = useState<LiteArmRuntimeState>(() => createLiteArmRuntimeState(readArmProfile(), ROBOT_PROFILE.feetech.servos));
  const [fourAxisArmState, setFourAxisArmState] = useState<LiteFourAxisArmRuntimeState>(() => createLiteFourAxisArmRuntimeState(readArmProfile(), ROBOT_PROFILE.feetech.servos));
  const [fourAxisPoseLock, setFourAxisPoseLock] = useState<LiteFourAxisPoseLock>(() => createLiteFourAxisPoseLock(createLiteFourAxisArmRuntimeState(readArmProfile(), ROBOT_PROFILE.feetech.servos).target));
  const [wristPoseFeedback, setWristPoseFeedback] = useState<LiteFourAxisWristPoseFeedback | null>(null);
  const [machineClawConfig, setMachineClawConfig] = useState<MachineClawTestConfig>(() => readMachineClawConfig());
  const [machineClawAction, setMachineClawAction] = useState<MachineClawRunAction>("idle");
  const [machineClawBusy, setMachineClawBusy] = useState(false);
  const [machineClawError, setMachineClawError] = useState<string | null>(null);
  const [machineClawProgress, setMachineClawProgress] = useState<MachineClawTurnProgress>(EMPTY_MACHINE_CLAW_PROGRESS);
  const [machineClawProtectionStatus, setMachineClawProtectionStatus] = useState<MachineClawProtectionStatus>(EMPTY_MACHINE_CLAW_PROTECTION_STATUS);
  const [lastMachineClawResponse, setLastMachineClawResponse] = useState<InboundMessage | null>(null);
  const [manualHold, setManualHold] = useState<ManualHoldState>({ mecanum: "", tracked: "", canFront: 0, canRear: 0 });
  const [lastWholeStopReason, setLastWholeStopReason] = useState("");
  const seqRef = useRef(1);
  const canJogTimersRef = useRef<Record<LiteCanJogGroup, number | null>>({ front: null, rear: null });
  const canJogAnglesRef = useRef<Record<string, number> | null>(null);
  const driveActiveRef = useRef({ mecanum: false, tracked: false });
  const gamepadDriveSendAtRef = useRef({ mecanum: 0, tracked: 0 });
  const gamepadMotionRef = useRef({ mecanum: "", tracked: "", canFront: 0 as LiteCanJogDirection, canRear: 0 as LiteCanJogDirection });
  const gamepadControlModeRef = useRef<LiteGamepadControlMode>(gamepadControlMode);
  const gamepadModeYPressedRef = useRef(false);
  const armProfileRef = useRef<LiteArmProfile>(armProfile);
  const armStateRef = useRef<LiteArmRuntimeState>(armState);
  const fourAxisArmStateRef = useRef<LiteFourAxisArmRuntimeState>(fourAxisArmState);
  const fourAxisPoseLockRef = useRef<LiteFourAxisPoseLock>(fourAxisPoseLock);
  const armLastTickAtRef = useRef<number | null>(null);
  const armLastSendAtRef = useRef(0);
  const armCommandSignatureRef = useRef("");
  const wristLastSendAtRef = useRef(0);
  const wristCommandSignatureRef = useRef("");
  const wristPoseFeedbackRef = useRef<WristPoseFeedbackRuntime | null>(null);
  const wristPoseFeedbackTimerRef = useRef<number | null>(null);
  const imuPollingRef = useRef(false);
  const gamepadClawDirectionRef = useRef<MachineClawClawDirection | null>(null);
  const gamepadClawLimitDoneRef = useRef<MachineClawClawDirection | null>(null);
  const gamepadClawLimitStartingRef = useRef<MachineClawClawDirection | null>(null);
  const machineClawConfigRef = useRef<MachineClawTestConfig>(machineClawConfig);
  const machineClawActionRef = useRef<MachineClawRunAction>(machineClawAction);
  const machineClawMonitorRef = useRef<MachineClawMonitorRuntime | null>(null);
  const machineClawMonitorTimerRef = useRef<number | null>(null);
  const machineClawMonitorGenerationRef = useRef(0);
  const machineClawProtectionMonitorRef = useRef<MachineClawProtectionMonitorRuntime | null>(null);
  const machineClawProtectionTimerRef = useRef<number | null>(null);
  const machineClawProtectionGenerationRef = useRef(0);
  const machineClawProtectionStartingRef = useRef(false);
  const piServoDebugEnabledRef = useRef(false);

  const currentLanguage = useMemo<LiteLanguage>(() => {
    const resolved = i18n.resolvedLanguage ?? i18n.language;
    return isLiteLanguage(resolved) ? resolved : "zh-CN";
  }, [i18n.language, i18n.resolvedLanguage]);
  const recommended = recommendedPiResult(discoveryResults);
  const aBoardTone = bridgeTone(aBoardHealth, aBoardError);
  const piServoTone = bridgeTone(piServoHealth, piServoError);
  const aBoardBridgeConnected = aBoardHealth?.ok === true && aBoardHealth.serialOpen !== false;
  const mainCameraUrl = `http://${piHost}:${CAMERA_PORTS.main}/stream`;
  const secondaryCameraUrl = `http://${piHost}:${CAMERA_PORTS.secondary}/stream`;
  const mainCameraOfferUrl = `http://${piHost}:${CAMERA_PORTS.main}/offer`;
  const secondaryCameraOfferUrl = `http://${piHost}:${CAMERA_PORTS.secondary}/offer`;
  const selectedCanServo = canServoProfiles.find((servo) => servo.id === readTargetId(canConfig.targetId)) ?? canServoProfiles[0] ?? normalizeAsmgMdServoProfile(ROBOT_PROFILE.can.servos[0]);
  const selectedCanProfile = useMemo(() => canServoProfileFromConfig(selectedCanServo, canConfig), [canConfig, selectedCanServo]);
  const selectedPwmServo = ROBOT_PROFILE.pwmServos.find((servo) => servo.id === selectedPwmServoId) ?? ROBOT_PROFILE.pwmServos[0];
  const latestParsed = lastCanExchange?.parsed[lastCanExchange.parsed.length - 1] ?? null;
  const activeGamepad = selectPreferredGamepadSummary(gamepads, activeGamepadIndex);
  const operatorDeviceMatrix = useMemo(() => buildOperatorDeviceMatrix({
    aBoardError,
    aBoardHealth,
    cameraHost: piHost,
    gamepadConnected: Boolean(activeGamepad),
    imuDetail: imuSnapshot ? formatImuChipIds(imuSnapshot.feedback) : null,
    imuError,
    imuReady: imuSnapshot?.feedback.ready ?? null,
    piServoError,
    piServoHealth
  }), [aBoardError, aBoardHealth, activeGamepad, imuError, imuSnapshot, piHost, piServoError, piServoHealth]);
  const armSolution = useMemo(() => solveTwoLinkArmIk(armState.target, armProfile, ROBOT_PROFILE.feetech.servos), [armProfile, armState.target]);
  const fourAxisArmSolution = useMemo(() => solveFourAxisArmPoseIk(fourAxisArmState.target, armProfile, ROBOT_PROFILE.feetech.servos), [armProfile, fourAxisArmState.target]);
  const armGravityCompensation = useMemo(
    () => calculateLiteArmGravityCompensation(armSolution, armProfile, ROBOT_PROFILE.feetech.servos),
    [armProfile, armSolution]
  );
  const machineClawBridgeConnected = piServoHealth?.serialOpen === true;
  const machineClawControlsDisabled = !machineClawBridgeConnected || machineClawBusy || Boolean(feetechBusy);
  const machineClawProgressLabel = formatMachineClawProgress(machineClawProgress);
  const machineClawActionLabel = t(MACHINE_CLAW_ACTION_I18N_KEYS[machineClawAction]);
  const lastMachineClawResponseLabel = formatMachineClawResponse(lastMachineClawResponse, t);
  const machineClawProtectionLabel = machineClawConfig.protectionEnabled || machineClawProtectionStatus.active || machineClawProtectionStatus.tripped
    ? formatMachineClawProtectionStatus(machineClawProtectionStatus, t)
    : t("machineClaw.protection.disabled");
  const machineClawProtectionTone: Tone = machineClawProtectionStatus.tripped
    ? "warning"
    : machineClawProtectionStatus.active
      ? "online"
      : machineClawConfig.protectionEnabled
        ? "neutral"
        : "warning";
  const operatorCriticalError = aBoardError ?? piServoError ?? imuError ?? machineClawError ?? feetechError ?? canError ?? aBoardHealth?.lastError ?? piServoHealth?.lastError ?? "--";
  const imuStatusTone: Tone = imuError
    ? "danger"
    : imuSnapshot?.feedback.ready === true
      ? "online"
      : imuSnapshot?.feedback.ready === false
        ? "warning"
        : aBoardBridgeConnected
          ? "neutral"
          : "warning";
  const imuStatusLabel = imuError ?? (imuSnapshot
    ? imuSnapshot.feedback.ready === false
      ? t("status.notReady")
      : t("status.online")
    : aBoardBridgeConnected ? t("status.syncing") : t("status.notChecked"));
  const imuRollPitchLabel = imuSnapshot?.attitude
    ? `${formatNumber(imuSnapshot.attitude.rollDeg)} / ${formatNumber(imuSnapshot.attitude.pitchDeg)}`
    : "--";
  const imuGyroLabel = formatVector3(imuSnapshot?.attitude?.gyroDps, 1);
  const imuSampleLabel = imuSnapshot?.feedback.sampleMs !== undefined
    ? `${imuSnapshot.feedback.sampleMs} ms`
    : imuSnapshot
      ? `${Math.max(0, Math.round(Date.now() - imuSnapshot.receivedAtMs))} ms`
      : "--";
  const wristCompensationLabel = !armProfile.wristCalibrated
    ? t("status.notReady")
    : gamepadControlMode === "arm"
      ? t("status.enabled")
      : t("status.standby");
  const wristCompensationTone: Tone = !armProfile.wristCalibrated ? "warning" : gamepadControlMode === "arm" ? "online" : "neutral";
  const wristFeedbackLabel = wristPoseFeedback
    ? `${formatNumber(wristPoseFeedback.pitchLocalDeg)} / ${formatNumber(wristPoseFeedback.rollDeg)}`
    : "--";
  const armGravityCompensationLabel = armGravityCompensation.enabled
    ? `J1 ${formatNumber(armGravityCompensation.j1AppliedBiasDeg)} / J2 ${formatNumber(armGravityCompensation.j2AppliedBiasDeg)}${armGravityCompensation.limited ? ` ${t("status.limited")}` : ""}`
    : t("status.disabled");
  const armGravityCompensationTone: Tone = armGravityCompensation.enabled
    ? armGravityCompensation.limited ? "warning" : "online"
    : "neutral";

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  useEffect(() => {
    piServoDebugEnabledRef.current = false;
    setCameraRuntimeById({
      main: EMPTY_CAMERA_RUNTIME,
      secondary: EMPTY_CAMERA_RUNTIME
    });
    setImuSnapshot(null);
    setImuError(null);
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
    fourAxisArmStateRef.current = fourAxisArmState;
  }, [fourAxisArmState]);

  useEffect(() => {
    fourAxisPoseLockRef.current = fourAxisPoseLock;
  }, [fourAxisPoseLock]);

  useEffect(() => {
    gamepadControlModeRef.current = gamepadControlMode;
  }, [gamepadControlMode]);

  useEffect(() => {
    machineClawConfigRef.current = machineClawConfig;
    saveMachineClawConfig(machineClawConfig);
  }, [machineClawConfig]);

  useEffect(() => {
    machineClawActionRef.current = machineClawAction;
  }, [machineClawAction]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!navigator.getGamepads) {
        setGamepads([]);
        setGamepadInput(zeroGamepadInput());
        setLiteGamepadState(ZERO_LITE_GAMEPAD_STATE);
        if (gamepadControlEnabled) {
          stopAllManualControl(t("manual.stopReasonGamepadUnavailable"), { resetGamepadMode: true });
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
        stopAllManualControl(t("manual.stopReasonGamepadDisconnected"), { resetGamepadMode: true });
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
      stopAllManualControl(t("manual.stopReasonWindow"), { resetGamepadMode: true });
    };
    const stopForVisibility = () => {
      if (document.hidden) {
        stopAllManualControl(t("manual.stopReasonWindow"), { resetGamepadMode: true });
      }
    };
    window.addEventListener("blur", stopForWindowState);
    document.addEventListener("visibilitychange", stopForVisibility);
    return () => {
      window.removeEventListener("blur", stopForWindowState);
      document.removeEventListener("visibilitychange", stopForVisibility);
      stopAllManualControl(t("manual.stopReasonCleanup"), { resetGamepadMode: true });
    };
  }, [piHost, prioritySettings, t]);

  useEffect(() => {
    if (!aBoardBridgeConnected) {
      return undefined;
    }
    void readOperatorImu({ quiet: true });
    const timer = window.setInterval(() => {
      void readOperatorImu({ quiet: true });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [aBoardBridgeConnected, piHost, prioritySettings]);

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
        checkAboardBridgeHealth(targetHost, { timeoutMs: 2500 }),
        checkPiServoBridgeHealth(targetHost, { timeoutMs: 2500 })
      ]);
      if (aBoard.status === "fulfilled") {
        setABoardHealth(aBoard.value);
      } else {
        setABoardHealth(null);
        setABoardError(errorMessage(aBoard.reason, t));
      }
      if (piServo.status === "fulfilled") {
        setPiServoHealth(piServo.value);
        if (piServo.value.serialOpen === true) {
          void ensurePiServoDebugMode(targetHost, { quiet: true });
        }
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
    stopAllManualControl(t("manual.stopReasonHostChange"), { resetGamepadMode: true });
    setPiHost(next);
    addLog("system", t("logs.hostApplied", { host: next }), "info");
  }

  function updateCameraRuntime(sourceId: string, patch: Partial<LiteCameraRuntime>) {
    setCameraRuntimeById((current) => ({
      ...current,
      [sourceId]: {
        ...(current[sourceId] ?? EMPTY_CAMERA_RUNTIME),
        ...patch
      }
    }));
  }

  function changeLanguage(value: string) {
    if (isLiteLanguage(value)) {
      void i18n.changeLanguage(value);
    }
  }

  function changeConsoleMode(mode: LiteConsoleMode) {
    setConsoleMode(mode);
    setActiveView((current) => resolveConsoleViewForMode(mode, current));
  }

  function selectConsoleView(view: ViewId) {
    if (isConsoleViewVisible(consoleMode, view)) {
      setActiveView(view);
    }
  }

  function reconnectPiHost() {
    const next = normalizeHost(manualHost);
    if (!next) {
      return;
    }
    if (next !== piHost) {
      applyHost(next);
      return;
    }
    void refreshHealth(next);
  }

  function updatePriority(key: keyof PrioritySettings, value: string) {
    setPrioritySettings((current) => normalizePrioritySettings({ ...current, [key]: value }));
  }

  function resetPriorities() {
    setPrioritySettings(DEFAULT_PRIORITY_SETTINGS);
    addLog("system", t("logs.priorityReset"), "info");
  }

  async function readOperatorImu(options: { quiet?: boolean } = {}) {
    if (imuPollingRef.current) {
      return;
    }
    if (!aBoardBridgeConnected) {
      setImuError(t("imu.errors.bridgeRequired"));
      return;
    }
    imuPollingRef.current = true;
    const command = buildLiteImuReadCommand(nextSeq());
    try {
      const result = await sendAboardCommand(piHost, command, prioritySettings, { timeoutMs: 700 });
      const errorResponse = result.messages.find((message) => message.type === "error");
      const feedback = liteImuFeedbackFromResult(result);
      if (result.ok === false || errorResponse?.type === "error" || !feedback) {
        const message = result.error ?? inboundErrorMessage(errorResponse ?? null) ?? t("imu.errors.noFeedback");
        setImuError(message);
        if (!options.quiet) {
          addLog("system", t("logs.imuReadFailed", { message }), "warn");
        }
        return;
      }
      setImuSnapshot(createLiteImuSnapshot(feedback));
      setImuError(feedback.ready === false ? feedback.error ?? t("imu.errors.notReady") : null);
    } catch (error) {
      const message = errorMessage(error, t);
      setImuError(message);
      if (!options.quiet) {
        addLog("system", t("logs.imuReadFailed", { message }), "error");
      }
    } finally {
      imuPollingRef.current = false;
    }
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
    void sendPiServoCommandWithDebug(command, { waitMs: options.waitMs ?? 220, timeoutMs: options.timeoutMs ?? 900 }, label)
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

  async function ensurePiServoDebugMode(host = piHost, options: { quiet?: boolean } = {}): Promise<boolean> {
    if (piServoDebugEnabledRef.current) {
      return true;
    }
    const command = buildDebugSetCommand(nextSeq(), "servo", true);
    try {
      const result = await sendPiServoBridgeCommand(host, command, { waitMs: 260, timeoutMs: 900 });
      const failed = result.ok === false || result.messages.some((message) => message.type === "error");
      setLastFeetechExchange({ label: "debug.set", command, result, at: Date.now() });
      if (failed) {
        piServoDebugEnabledRef.current = false;
        const response = machineClawResponseFromResult(result);
        const message = result.error ?? inboundErrorMessage(response) ?? t("errors.feetechRejected");
        setPiServoError(message);
        if (!options.quiet) {
          setFeetechError(message);
        }
        addLog("system", t("logs.manualCommandFailed", { label: "debug.set", message }), "warn");
        return false;
      }
      piServoDebugEnabledRef.current = true;
      setPiServoError(null);
      if (!options.quiet) {
        addLog("system", "Pi servo debug mode enabled", "info");
      }
      return true;
    } catch (error) {
      piServoDebugEnabledRef.current = false;
      const message = errorMessage(error, t);
      setPiServoError(message);
      if (!options.quiet) {
        setFeetechError(message);
      }
      addLog("system", t("logs.manualCommandFailed", { label: "debug.set", message }), "error");
      return false;
    }
  }

  async function sendPiServoCommandWithDebug(command: PcCommand, options: { waitMs?: number; timeoutMs?: number } = {}, label: string = command.type): Promise<PiServoCommandResult> {
    if (command.type !== "debug.set") {
      await ensurePiServoDebugMode(piHost, { quiet: true });
    }
    const requestOptions = {
      waitMs: options.waitMs ?? 220,
      timeoutMs: options.timeoutMs ?? 900
    };
    let result = await sendPiServoBridgeCommand(piHost, command, requestOptions);
    if (piServoResultHasDebugDisabled(result)) {
      piServoDebugEnabledRef.current = false;
      addLog("system", `${label}: servo debug mode was off; enabling and retrying`, "warn");
      const enabled = await ensurePiServoDebugMode(piHost, { quiet: true });
      if (enabled) {
        result = await sendPiServoBridgeCommand(piHost, command, requestOptions);
      }
    }
    return result;
  }

  function requireMachineClawBridge() {
    if (machineClawBridgeConnected) {
      return true;
    }
    setMachineClawError(t("machineClaw.errors.bridgeRequired"));
    return false;
  }

  async function runMachineClawPiServoCommand(command: PcCommand, label: string, options: { waitMs?: number; timeoutMs?: number } = {}) {
    try {
      const result = await sendPiServoCommandWithDebug(command, {
        waitMs: options.waitMs ?? 180,
        timeoutMs: options.timeoutMs ?? 900
      }, label);
      const response = machineClawResponseFromResult(result);
      setLastFeetechExchange({ label, command, result, at: Date.now() });
      setLastMachineClawResponse(response);
      if (result.ok === false || result.messages.some((message) => message.type === "error") || response?.type === "error") {
        const message = result.error ?? inboundErrorMessage(response) ?? t("errors.feetechRejected");
        setMachineClawError(message);
        setFeetechError(message);
        addLog("system", t("logs.manualCommandFailed", { label, message }), "warn");
        return null;
      }
      return result;
    } catch (error) {
      const message = errorMessage(error, t);
      setMachineClawError(message);
      setFeetechError(message);
      addLog("system", t("logs.manualCommandFailed", { label, message }), "error");
      return null;
    }
  }

  async function runMachineClawCommandList(commands: PcCommand[], label: string) {
    for (const command of commands) {
      const result = await runMachineClawPiServoCommand(command, label);
      if (!result) {
        return false;
      }
    }
    return true;
  }

  async function sendMachineClawStopCommandsQuiet(ids?: readonly number[]) {
    const commands = buildMachineClawStopCommands(() => nextSeq(), ids);
    let stopped = true;
    for (const command of commands) {
      try {
        const result = await sendPiServoCommandWithDebug(command, { waitMs: 120, timeoutMs: 700 }, t("machineClaw.actions.stop"));
        if (result.ok === false || result.messages.some((message) => message.type === "error")) {
          stopped = false;
        }
      } catch {
        stopped = false;
      }
    }
    return stopped;
  }

  function clearMachineClawProtectionMonitor(updateStatus: boolean) {
    if (machineClawProtectionTimerRef.current !== null) {
      window.clearInterval(machineClawProtectionTimerRef.current);
      machineClawProtectionTimerRef.current = null;
    }
    machineClawProtectionMonitorRef.current = null;
    machineClawProtectionGenerationRef.current += 1;
    if (updateStatus) {
      setMachineClawProtectionStatus(EMPTY_MACHINE_CLAW_PROTECTION_STATUS);
    }
  }

  function startMachineClawProtectionTimer(generation: number) {
    if (machineClawProtectionTimerRef.current !== null) {
      window.clearInterval(machineClawProtectionTimerRef.current);
    }
    machineClawProtectionTimerRef.current = window.setInterval(() => {
      void pollMachineClawProtection(generation);
    }, MACHINE_CLAW_POLL_MS);
  }

  async function readMachineClawServoFeedback(servoId: number, label: string) {
    const result = await runMachineClawPiServoCommand(
      buildMachineClawReadCommand(nextSeq(), servoId),
      label,
      { waitMs: 120, timeoutMs: 760 }
    );
    return result ? servoFeedbackFromResult(result, servoId) : null;
  }

  async function startMachineClawProtectionMonitor(
    targets: readonly MachineClawProtectionTarget[],
    source: MachineClawProtectionMonitorRuntime["source"],
    targetTurnsById: ReadonlyMap<number, number> = new Map()
  ) {
    const config = machineClawConfigRef.current;
    const activeTargets = compactMachineClawProtectionTargets(targets).filter((target) => Math.abs(target.speedRaw) > 0);
    const hasTurnLimits = activeTargets.some((target) => targetTurnsById.has(target.id));
    if ((!config.protectionEnabled && !hasTurnLimits) || activeTargets.length === 0) {
      clearMachineClawProtectionMonitor(true);
      return true;
    }
    if (machineClawProtectionStartingRef.current) {
      return false;
    }

    machineClawProtectionStartingRef.current = true;
    clearMachineClawProtectionMonitor(false);
    const nowMs = Date.now();
    const servos: MachineClawProtectionServoRuntime[] = [];
    const label = t("machineClaw.actions.readFeedback");
    try {
      for (const target of activeTargets) {
        const feedback = await readMachineClawServoFeedback(target.id, label);
        const positionRaw = servoFeedbackPositionRaw(feedback);
        if (positionRaw === null) {
          await handleMachineClawProtectionTrip({
            detail: t("machineClaw.errors.feedbackRequired"),
            id: target.id,
            reason: "feedback"
          }, activeTargets.map((item) => item.id));
          return false;
        }
        servos.push(createMachineClawProtectionServoRuntime(
          target.id,
          positionRaw,
          target.speedRaw,
          nowMs,
          targetTurnsById.get(target.id) ?? null
        ));
      }
    } finally {
      machineClawProtectionStartingRef.current = false;
    }

    const generation = machineClawProtectionGenerationRef.current + 1;
    machineClawProtectionGenerationRef.current = generation;
    machineClawProtectionMonitorRef.current = {
      generation,
      polling: false,
      servos,
      source
    };
    setMachineClawProtectionStatus({
      active: true,
      detail: null,
      ids: servos.map((servo) => servo.id),
      reason: null,
      tripped: false
    });
    startMachineClawProtectionTimer(generation);
    return true;
  }

  function updateMachineClawProtectionTargets(
    targets: readonly MachineClawProtectionTarget[],
    source: MachineClawProtectionMonitorRuntime["source"]
  ) {
    const activeTargets = compactMachineClawProtectionTargets(targets).filter((target) => Math.abs(target.speedRaw) > 0);
    if (!machineClawConfigRef.current.protectionEnabled || activeTargets.length === 0) {
      if (machineClawProtectionMonitorRef.current?.source === source) {
        clearMachineClawProtectionMonitor(true);
      }
      return;
    }

    const runtime = machineClawProtectionMonitorRef.current;
    const speedById = new Map(activeTargets.map((target) => [target.id, target.speedRaw]));
    if (runtime?.source === source) {
      runtime.servos = runtime.servos
        .map((servo) => ({ ...servo, speedRaw: speedById.get(servo.id) ?? 0 }))
        .filter((servo) => Math.abs(servo.speedRaw) > 0);
      if (runtime.servos.length === 0) {
        clearMachineClawProtectionMonitor(true);
        return;
      }
      setMachineClawProtectionStatus({
        active: true,
        detail: null,
        ids: runtime.servos.map((servo) => servo.id),
        reason: null,
        tripped: false
      });
      return;
    }

    if (!machineClawProtectionStartingRef.current) {
      void startMachineClawProtectionMonitor(activeTargets, source);
    }
  }

  async function pollMachineClawProtection(generation: number) {
    const runtime = machineClawProtectionMonitorRef.current;
    if (!runtime || runtime.generation !== generation || runtime.polling) {
      return;
    }
    runtime.polling = true;
    const nextServos: MachineClawProtectionServoRuntime[] = [];
    let trip: MachineClawProtectionTrip | null = null;
    try {
      for (const servo of runtime.servos) {
        const feedback = await readMachineClawServoFeedback(servo.id, t("machineClaw.actions.readFeedback"));
        const evaluated = evaluateMachineClawProtectionFeedback(servo, feedback, machineClawConfigRef.current, Date.now());
        nextServos.push(evaluated.runtime);
        if (evaluated.trip) {
          trip = evaluated.trip;
          break;
        }
      }
      if (trip) {
        const stopIds = runtime.servos.map((servo) => servo.id);
        clearMachineClawProtectionMonitor(false);
        await handleMachineClawProtectionTrip(trip, stopIds);
      } else {
        runtime.servos = nextServos;
        setMachineClawProtectionStatus({
          active: true,
          detail: null,
          ids: runtime.servos.map((servo) => servo.id),
          reason: null,
          tripped: false
        });
      }
    } finally {
      if (machineClawProtectionMonitorRef.current === runtime) {
        runtime.polling = false;
      }
    }
  }

  async function handleMachineClawProtectionTrip(trip: MachineClawProtectionTrip, stopIds: readonly number[] = [trip.id]) {
    if (trip.id === MACHINE_CLAW_SERVO_IDS.claw) {
      clearMachineClawMonitor(true);
    }
    await sendMachineClawStopCommandsQuiet(stopIds);
    const message = machineClawProtectionTripMessage(trip, t);
    setMachineClawProtectionStatus({
      active: false,
      detail: message,
      ids: [trip.id],
      reason: trip.reason,
      tripped: true
    });
    if (trip.reason === "turnLimit") {
      setMachineClawError(null);
      setMachineClawAction("idle");
      addLog("system", message, "info");
      return;
    }
    setMachineClawError(message);
    setFeetechError(message);
    setMachineClawAction("error");
    addLog("system", message, "warn");
  }

  function clearMachineClawMonitor(updateProgress: boolean) {
    if (machineClawMonitorTimerRef.current !== null) {
      window.clearInterval(machineClawMonitorTimerRef.current);
      machineClawMonitorTimerRef.current = null;
    }
    machineClawMonitorRef.current = null;
    machineClawMonitorGenerationRef.current += 1;
    if (updateProgress) {
      setMachineClawProgress((current) => ({ ...current, running: false }));
    }
  }

  function startMachineClawMonitor(generation: number) {
    if (machineClawMonitorTimerRef.current !== null) {
      window.clearInterval(machineClawMonitorTimerRef.current);
    }
    machineClawMonitorTimerRef.current = window.setInterval(() => {
      void pollMachineClawProgress(generation);
    }, MACHINE_CLAW_POLL_MS);
  }

  async function pollMachineClawProgress(generation: number) {
    const runtime = machineClawMonitorRef.current;
    if (!runtime || runtime.generation !== generation || runtime.polling) {
      return;
    }
    runtime.polling = true;
    try {
      const result = await runMachineClawPiServoCommand(
        buildMachineClawReadCommand(nextSeq()),
        t("machineClaw.actions.readFeedback"),
        { waitMs: 130, timeoutMs: 760 }
      );
      const feedback = result ? servoFeedbackFromResult(result, MACHINE_CLAW_SERVO_IDS.claw) : null;
      const positionRaw = servoFeedbackPositionRaw(feedback);
      if (positionRaw === null) {
        clearMachineClawMonitor(true);
        await sendMachineClawStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
        setMachineClawError(t("machineClaw.errors.feedbackRequired"));
        setMachineClawAction("error");
        return;
      }

      const protection = evaluateMachineClawProtectionFeedback({
        completedTurns: runtime.completedTurns,
        id: MACHINE_CLAW_SERVO_IDS.claw,
        lastRawChangedAtMs: runtime.lastRawChangedAtMs,
        previousRaw: runtime.previousRaw,
        speedRaw: runtime.speedRaw,
        startedAtMs: runtime.startedAtMs,
        targetTurns: runtime.targetTurns
      }, feedback, machineClawConfigRef.current, Date.now());
      runtime.previousRaw = protection.runtime.previousRaw;
      runtime.completedTurns = Math.min(runtime.targetTurns, protection.runtime.completedTurns);
      runtime.lastRawChangedAtMs = protection.runtime.lastRawChangedAtMs;
      const nextProgress = {
        completedTurns: runtime.completedTurns,
        targetTurns: runtime.targetTurns,
        running: protection.trip === null
      };
      setMachineClawProgress(nextProgress);

      if (protection.trip) {
        clearMachineClawMonitor(false);
        setMachineClawProgress({ ...nextProgress, running: false });
        if (protection.trip.reason === "turnLimit") {
          await sendMachineClawStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
          if (runtime.source === "gamepad" && runtime.direction) {
            gamepadClawLimitDoneRef.current = runtime.direction;
          }
          setMachineClawAction("idle");
        } else {
          await handleMachineClawProtectionTrip(protection.trip, [MACHINE_CLAW_SERVO_IDS.claw]);
        }
      }
    } finally {
      if (machineClawMonitorRef.current === runtime) {
        runtime.polling = false;
      }
    }
  }

  function stopMachineClawControl() {
    clearMachineClawMonitor(true);
    clearMachineClawProtectionMonitor(true);
    setMachineClawAction("idle");
    void sendMachineClawStopCommandsQuiet();
  }

  async function stopMachineClawIds(ids?: readonly number[]) {
    if (!requireMachineClawBridge()) {
      return;
    }
    clearMachineClawMonitor(true);
    clearMachineClawProtectionMonitor(true);
    setMachineClawBusy(true);
    setFeetechBusy(t("machineClaw.actions.stop"));
    setMachineClawError(null);
    setMachineClawAction("stopping");
    const stopped = await sendMachineClawStopCommandsQuiet(ids);
    if (!stopped) {
      setMachineClawError(t("machineClaw.errors.commandFailed"));
      setMachineClawAction("error");
    } else {
      setMachineClawAction("idle");
    }
    setMachineClawBusy(false);
    setFeetechBusy(null);
  }

  async function startMachineClawPitch(direction: MachineClawDirection) {
    if (!requireMachineClawBridge()) {
      return;
    }
    const label = t("machineClaw.pitch.title");
    setMachineClawBusy(true);
    setFeetechBusy(label);
    setMachineClawError(null);
    setFeetechError(null);
    setMachineClawAction("stopping");
    clearMachineClawMonitor(true);
    clearMachineClawProtectionMonitor(true);
    await sendMachineClawStopCommandsQuiet();
    const commands = buildMachineClawPitchCommands(machineClawConfigRef.current, direction, () => nextSeq());
    const protectedToStart = await startMachineClawProtectionMonitor(
      machineClawSpeedTargetsFromCommands(commands),
      "panel",
      new Map([
        [MACHINE_CLAW_SERVO_IDS.pitchLeft, machineClawConfigRef.current.pitchLimitTurns],
        [MACHINE_CLAW_SERVO_IDS.pitchRight, machineClawConfigRef.current.pitchLimitTurns]
      ])
    );
    if (!protectedToStart) {
      setMachineClawBusy(false);
      setFeetechBusy(null);
      return;
    }
    const sent = await runMachineClawCommandList(commands, label);
    if (!sent) {
      clearMachineClawProtectionMonitor(true);
    }
    setMachineClawAction(sent ? machineClawActionKey("pitch", direction) : "error");
    setMachineClawBusy(false);
    setFeetechBusy(null);
  }

  async function startMachineClawRotation(direction: MachineClawDirection) {
    if (!requireMachineClawBridge()) {
      return;
    }
    const label = t("machineClaw.rotation.title");
    setMachineClawBusy(true);
    setFeetechBusy(label);
    setMachineClawError(null);
    setFeetechError(null);
    setMachineClawAction("stopping");
    clearMachineClawMonitor(true);
    clearMachineClawProtectionMonitor(true);
    await sendMachineClawStopCommandsQuiet();
    const commands = buildMachineClawRotationCommands(machineClawConfigRef.current, direction, () => nextSeq());
    const protectedToStart = await startMachineClawProtectionMonitor(
      machineClawSpeedTargetsFromCommands(commands),
      "panel",
      new Map([
        [MACHINE_CLAW_SERVO_IDS.pitchLeft, machineClawConfigRef.current.rotationLimitTurns],
        [MACHINE_CLAW_SERVO_IDS.claw, machineClawConfigRef.current.rotationLimitTurns],
        [MACHINE_CLAW_SERVO_IDS.pitchRight, machineClawConfigRef.current.rotationLimitTurns]
      ])
    );
    if (!protectedToStart) {
      setMachineClawBusy(false);
      setFeetechBusy(null);
      return;
    }
    const sent = await runMachineClawCommandList(commands, label);
    if (!sent) {
      clearMachineClawProtectionMonitor(true);
    }
    setMachineClawAction(sent ? machineClawActionKey("rotation", direction) : "error");
    setMachineClawBusy(false);
    setFeetechBusy(null);
  }

  async function startMachineClawClaw(direction: MachineClawClawDirection) {
    if (!requireMachineClawBridge()) {
      return;
    }
    const label = t(direction === "open" ? "machineClaw.actions.open" : "machineClaw.actions.close");
    setMachineClawBusy(true);
    setFeetechBusy(label);
    setMachineClawError(null);
    setFeetechError(null);
    setMachineClawAction("stopping");
    clearMachineClawMonitor(true);
    clearMachineClawProtectionMonitor(true);
    await sendMachineClawStopCommandsQuiet();

    const readResult = await runMachineClawPiServoCommand(buildMachineClawReadCommand(nextSeq()), t("machineClaw.actions.readFeedback"), {
      waitMs: 180,
      timeoutMs: 1000
    });
    const positionRaw = machineClawPositionRawFromResult(readResult);
    if (positionRaw === null) {
      await sendMachineClawStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
      setMachineClawError(t("machineClaw.errors.feedbackRequired"));
      setMachineClawAction("error");
      setMachineClawBusy(false);
      setFeetechBusy(null);
      return;
    }

    const config = machineClawConfigRef.current;
    const command = buildMachineClawClawCommand(config, direction, () => nextSeq());
    const speedRaw = machineClawCommandSpeedRaw(command);
    const targetTurns = machineClawTargetTurns(config, direction);
    setMachineClawProgress({ completedTurns: 0, targetTurns, running: true });

    if (speedRaw === 0) {
      await sendMachineClawStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
      setMachineClawError(t("machineClaw.errors.zeroSpeed"));
      setMachineClawAction("error");
      setMachineClawBusy(false);
      setFeetechBusy(null);
      return;
    }

    const result = await runMachineClawPiServoCommand(command, label);
    if (!result) {
      await sendMachineClawStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
      setMachineClawAction("error");
      setMachineClawBusy(false);
      setFeetechBusy(null);
      return;
    }

    const generation = machineClawMonitorGenerationRef.current + 1;
    const nowMs = Date.now();
    machineClawMonitorGenerationRef.current = generation;
    machineClawMonitorRef.current = {
      completedTurns: 0,
      direction,
      generation,
      lastRawChangedAtMs: nowMs,
      polling: false,
      previousRaw: positionRaw,
      source: "panel",
      speedRaw,
      startedAtMs: nowMs,
      targetTurns
    };
    startMachineClawMonitor(generation);
    setMachineClawAction(machineClawClawActionKey(direction));
    setMachineClawBusy(false);
    setFeetechBusy(null);
  }

  function updateMachineClawConfig(patch: MachineClawConfigPatch) {
    setMachineClawConfig((current) => normalizeMachineClawConfigPatch(current, patch));
  }

  function updateMachineClawNumber(field: keyof MachineClawConfigPatch, value: string) {
    updateMachineClawConfig({ [field]: Number(value) } as MachineClawConfigPatch);
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

  function stopAllManualControl(reason?: string, options: { resetGamepadMode?: boolean } = {}) {
    const hadActiveMotion = driveActiveRef.current.mecanum ||
      driveActiveRef.current.tracked ||
      canJogTimersRef.current.front !== null ||
      canJogTimersRef.current.rear !== null ||
      gamepadMotionRef.current.mecanum !== "" ||
      gamepadMotionRef.current.tracked !== "" ||
      gamepadMotionRef.current.canFront !== 0 ||
      gamepadMotionRef.current.canRear !== 0 ||
      armCommandSignatureRef.current !== "" ||
      machineClawMonitorRef.current !== null ||
      machineClawProtectionMonitorRef.current !== null ||
      (machineClawActionRef.current !== "idle" && machineClawActionRef.current !== "error");
    if (options.resetGamepadMode) {
      resetGamepadControlMode();
    }
    stopCanJogLoop("front");
    stopCanJogLoop("rear");
    stopArmJoystickControl();
    stopFourAxisArmJoystickControl();
    stopMachineClawControl();
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
      setLastWholeStopReason(reason);
      addLog("system", reason, "warn");
    }
  }

  function stopWholeRobot(reason = t("operator.stopReasonManual")) {
    setLastWholeStopReason(reason);
    stopAllManualControl(undefined, { resetGamepadMode: true });
    stopArmServosQuiet();
    void stopAllPwmMotors();
    addLog("system", reason, "warn");
  }

  function toggleGamepadControl(enabled: boolean) {
    setGamepadControlEnabled(enabled);
    if (!enabled) {
      stopAllManualControl(t("manual.stopReasonGamepadDisabled"), { resetGamepadMode: true });
    }
  }

  function setGamepadMode(mode: LiteGamepadControlMode) {
    gamepadControlModeRef.current = mode;
    setGamepadControlMode(mode);
  }

  function resetGamepadControlMode() {
    gamepadModeYPressedRef.current = false;
    setGamepadMode("drive");
  }

  function stopArmJoystickControl() {
    armLastTickAtRef.current = null;
    armLastSendAtRef.current = 0;
    armCommandSignatureRef.current = "";
  }

  function stopFourAxisArmJoystickControl() {
    stopWristPoseFeedbackMonitor(false);
    if (machineClawProtectionMonitorRef.current?.source === "gamepad") {
      clearMachineClawProtectionMonitor(true);
    }
    wristLastSendAtRef.current = 0;
    wristCommandSignatureRef.current = "";
    resetWristPoseCommandSpeeds();
    gamepadClawDirectionRef.current = null;
    gamepadClawLimitDoneRef.current = null;
    gamepadClawLimitStartingRef.current = null;
  }

  function lockCurrentFourAxisPose() {
    updateFourAxisPoseLock(fourAxisArmStateRef.current.target);
  }

  function updateFourAxisPoseLock(target: Pick<LiteFourAxisArmPose, "toolPitchDeg" | "wristRollDeg" | "z">) {
    const nextLock = createLiteFourAxisPoseLock(target);
    fourAxisPoseLockRef.current = nextLock;
    setFourAxisPoseLock(nextLock);
  }

  function createWristPoseFeedbackRuntime(profile: LiteArmProfile, leftRaw = profile.wristZeroRaw21, rightRaw = profile.wristZeroRaw23): WristPoseFeedbackRuntime {
    return {
      leftRaw,
      leftSpeedRaw: 0,
      leftTurns: 0,
      pitchLocalDeg: profile.wristZeroPitchLocalDeg,
      polling: false,
      rightRaw,
      rightSpeedRaw: 0,
      rightTurns: 0,
      rollDeg: profile.wristZeroRollDeg
    };
  }

  function publishWristPoseFeedback(runtime: WristPoseFeedbackRuntime | null) {
    wristPoseFeedbackRef.current = runtime;
    setWristPoseFeedback(runtime ? {
      pitchLocalDeg: runtime.pitchLocalDeg,
      rollDeg: runtime.rollDeg
    } : null);
  }

  function ensureWristPoseFeedbackRuntime(profile: LiteArmProfile) {
    if (!wristPoseFeedbackRef.current) {
      publishWristPoseFeedback(createWristPoseFeedbackRuntime(profile));
    }
    return wristPoseFeedbackRef.current;
  }

  function startWristPoseFeedbackMonitor() {
    const profile = armProfileRef.current;
    if (!profile.wristCalibrated) {
      return;
    }
    ensureWristPoseFeedbackRuntime(profile);
    if (wristPoseFeedbackTimerRef.current === null) {
      wristPoseFeedbackTimerRef.current = window.setInterval(() => {
        void pollWristPoseFeedback();
      }, WRIST_POSE_FEEDBACK_POLL_MS);
    }
    void pollWristPoseFeedback();
  }

  function stopWristPoseFeedbackMonitor(clearFeedback: boolean) {
    if (wristPoseFeedbackTimerRef.current !== null) {
      window.clearInterval(wristPoseFeedbackTimerRef.current);
      wristPoseFeedbackTimerRef.current = null;
    }
    if (wristPoseFeedbackRef.current) {
      wristPoseFeedbackRef.current.polling = false;
    }
    if (clearFeedback) {
      publishWristPoseFeedback(null);
    }
  }

  function resetWristPoseCommandSpeeds() {
    const runtime = wristPoseFeedbackRef.current;
    if (runtime) {
      runtime.leftSpeedRaw = 0;
      runtime.rightSpeedRaw = 0;
    }
  }

  function updateWristPoseCommandSpeeds(targets: ReturnType<typeof buildLiteFourAxisWristPoseHoldSpeedTargets>) {
    const runtime = wristPoseFeedbackRef.current;
    if (!runtime) {
      return;
    }
    runtime.leftSpeedRaw = targets.find((target) => target.id === MACHINE_CLAW_SERVO_IDS.pitchLeft)?.speedRaw ?? 0;
    runtime.rightSpeedRaw = targets.find((target) => target.id === MACHINE_CLAW_SERVO_IDS.pitchRight)?.speedRaw ?? 0;
  }

  async function pollWristPoseFeedback() {
    const runtime = wristPoseFeedbackRef.current;
    if (!runtime || runtime.polling) {
      return;
    }
    const profile = armProfileRef.current;
    if (!profile.wristCalibrated || !machineClawBridgeConnected) {
      stopWristPoseFeedbackMonitor(false);
      return;
    }
    runtime.polling = true;
    try {
      const label = t("manual.wristTitle");
      const leftRaw = await readWristServoPositionRaw(MACHINE_CLAW_SERVO_IDS.pitchLeft, label);
      const rightRaw = await readWristServoPositionRaw(MACHINE_CLAW_SERVO_IDS.pitchRight, label);
      if (leftRaw === null || rightRaw === null) {
        stopWristPoseFeedbackMonitor(false);
        setMachineClawError(t("machineClaw.errors.feedbackRequired"));
        return;
      }
      updateWristPoseFeedbackFromRaw(runtime, leftRaw, rightRaw, profile, machineClawConfigRef.current);
      publishWristPoseFeedback(runtime);
    } finally {
      if (wristPoseFeedbackRef.current === runtime) {
        runtime.polling = false;
      }
    }
  }

  async function readWristServoPositionRaw(servoId: number, label: string): Promise<number | null> {
    const command: PcCommand = { type: "servo.read", seq: nextSeq(), id: servoId };
    try {
      const result = await sendPiServoCommandWithDebug(command, { waitMs: 100, timeoutMs: 600 }, label);
      setLastFeetechExchange({ label, command, result, at: Date.now() });
      if (result.ok === false || result.messages.some((message) => message.type === "error")) {
        return null;
      }
      return servoPositionRawFromResult(result, servoId);
    } catch {
      return null;
    }
  }

  function updateWristPoseFeedbackFromRaw(
    runtime: WristPoseFeedbackRuntime,
    leftRaw: number,
    rightRaw: number,
    profile: LiteArmProfile,
    clawConfig: MachineClawTestConfig
  ) {
    const leftDelta = Math.sign(runtime.leftSpeedRaw) * calculateWheelTurnDelta(runtime.leftRaw, leftRaw, runtime.leftSpeedRaw);
    const rightDelta = Math.sign(runtime.rightSpeedRaw) * calculateWheelTurnDelta(runtime.rightRaw, rightRaw, runtime.rightSpeedRaw);
    runtime.leftRaw = leftRaw;
    runtime.rightRaw = rightRaw;
    runtime.leftTurns += leftDelta;
    runtime.rightTurns += rightDelta;
    const pitchSign = clawConfig.pitchReverse ? -1 : 1;
    const rollSign = clawConfig.rotationReverse ? -1 : 1;
    runtime.pitchLocalDeg = profile.wristZeroPitchLocalDeg + pitchSign * ((runtime.leftTurns - runtime.rightTurns) / 2) * profile.pitchDegPerTurn;
    runtime.rollDeg = profile.wristZeroRollDeg + rollSign * ((runtime.leftTurns + runtime.rightTurns) / 2) * profile.rollDegPerTurn;
  }

  function stopArmServosQuiet() {
    const profile = armProfileRef.current;
    sendManualPiServoCommand(buildServoSpeedCommand(nextSeq(), [
      { id: profile.j1ServoId, name: "J1", speedRaw: 0, acc: profile.acc },
      { id: profile.j2ServoId, name: "J2", speedRaw: 0, acc: profile.acc }
    ], false), t("manual.armStop"), { waitMs: 120, timeoutMs: 700 });
  }

  function applyLiteGamepadControl(state: LiteGamepadState) {
    const modeStep = stepLiteGamepadControlMode(gamepadControlModeRef.current, state, gamepadModeYPressedRef.current);
    gamepadModeYPressedRef.current = modeStep.previousYPressed;
    if (modeStep.toggled) {
      setGamepadMode(modeStep.mode);
      stopAllManualControl(t(modeStep.mode === "arm" ? "manual.stopReasonEnterArmMode" : "manual.stopReasonExitArmMode"));
      if (modeStep.mode === "arm") {
        lockCurrentFourAxisPose();
        startWristPoseFeedbackMonitor();
      }
      return;
    }
    if (state.stop) {
      stopAllManualControl(t("manual.stopReasonGamepadStop"));
      return;
    }
    const snapshot = snapshotFromLiteGamepad(state);
    if (gamepadControlModeRef.current === "arm") {
      applyGamepadFourAxisArmControl(snapshot.armPose);
      return;
    }
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

    const signature = armCommandSignature(step.solution, profile, ROBOT_PROFILE.feetech.servos);
    if (signature === armCommandSignatureRef.current) {
      return;
    }
    armCommandSignatureRef.current = signature;
    armLastSendAtRef.current = now;
    try {
      sendManualPiServoCommand(buildLiteArmMoveCommand(nextSeq(), step.solution, profile, ROBOT_PROFILE.feetech.servos), t("manual.armTitle"));
    } catch (error) {
      addLog("system", t("logs.manualCommandFailed", { label: t("manual.armTitle"), message: errorMessage(error, t) }), "warn");
    }
  }

  function applyGamepadFourAxisArmControl(input: LiteFourAxisArmJoystickInput) {
    const profile = armProfileRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const lastTickAt = armLastTickAtRef.current ?? now - profile.commandIntervalMs;
    armLastTickAtRef.current = now;
    const step = applyFourAxisArmJoystickStep(fourAxisArmStateRef.current, input, now - lastTickAt, profile, ROBOT_PROFILE.feetech.servos);
    fourAxisArmStateRef.current = step.state;
    setFourAxisArmState(step.state);
    updateFourAxisPoseLock(step.state.target);
    const nextArmState = {
      target: step.solution.arm.target,
      j1LogicalDeg: step.solution.arm.j1LogicalDeg,
      j2LogicalDeg: step.solution.arm.j2LogicalDeg
    };
    armStateRef.current = nextArmState;
    setArmState(nextArmState);

    if (!step.moving) {
      stopGamepadWristIfActive();
      stopArmJoystickControl();
      return;
    }

    if (step.armMoving && profile.calibrated && step.solution.arm.reachable && step.solution.arm.withinLimits && now - armLastSendAtRef.current >= profile.commandIntervalMs) {
      const signature = armCommandSignature(step.solution.arm, profile, ROBOT_PROFILE.feetech.servos);
      if (signature !== armCommandSignatureRef.current) {
        armCommandSignatureRef.current = signature;
        armLastSendAtRef.current = now;
        try {
          sendManualPiServoCommand(buildLiteArmMoveCommand(nextSeq(), step.solution.arm, profile, ROBOT_PROFILE.feetech.servos), t("manual.armTitle"));
        } catch (error) {
          addLog("system", t("logs.manualCommandFailed", { label: t("manual.armTitle"), message: errorMessage(error, t) }), "warn");
        }
      }
    } else if (!step.armMoving) {
      stopArmJoystickControl();
    }

    const clawDirection = input.claw > 0 ? "open" : input.claw < 0 ? "close" : null;
    const fallbackFeedback = ensureWristPoseFeedbackRuntime(profile) ?? createWristPoseFeedbackRuntime(profile);
    const baseTargets = buildLiteFourAxisWristPoseHoldSpeedTargets(input, step.solution, fallbackFeedback, profile, machineClawConfigRef.current);
    const id22SpeedRaw = baseTargets.find((target) => target.id === MACHINE_CLAW_SERVO_IDS.claw)?.speedRaw ?? 0;
    const clawReady = updateGamepadClawLimit(clawDirection, id22SpeedRaw);
    const commandInput = clawDirection && !clawReady ? { ...input, claw: 0 as LiteCanJogDirection } : input;
    const targets = commandInput === input
      ? baseTargets
      : buildLiteFourAxisWristPoseHoldSpeedTargets(commandInput, step.solution, fallbackFeedback, profile, machineClawConfigRef.current);
    const wristMoving = targets.some((target) => target.speedRaw !== 0);

    if (!wristMoving) {
      stopGamepadWristIfActive();
      return;
    }
    if (!profile.wristCalibrated) {
      setMachineClawError(t("manual.wristNotCalibrated"));
      stopGamepadWristIfActive();
      return;
    }
    startWristPoseFeedbackMonitor();
    if (!machineClawBridgeConnected) {
      setMachineClawError(t("machineClaw.errors.bridgeRequired"));
      stopGamepadWristIfActive();
      return;
    }
    if (now - wristLastSendAtRef.current < profile.commandIntervalMs) {
      return;
    }

    const command = buildLiteFourAxisWristPoseHoldSpeedCommand(nextSeq(), commandInput, step.solution, fallbackFeedback, profile, machineClawConfigRef.current);
    const signature = wristSpeedCommandSignature(command);
    if (signature === wristCommandSignatureRef.current && now - wristLastSendAtRef.current < GAMEPAD_DRIVE_RESEND_MS) {
      return;
    }
    wristCommandSignatureRef.current = signature;
    wristLastSendAtRef.current = now;
    updateWristPoseCommandSpeeds(targets);
    if (machineClawMonitorRef.current?.source === "gamepad") {
      const id22Target = targets.find((target) => target.id === MACHINE_CLAW_SERVO_IDS.claw);
      if (id22Target) {
        machineClawMonitorRef.current.speedRaw = id22Target.speedRaw;
      }
    }
    updateMachineClawProtectionTargets(targets, "gamepad");
    setMachineClawAction(actionFromWristTargets(targets, clawDirection));
    setMachineClawError(null);
    sendManualPiServoCommand(command, t("manual.wristTitle"), { waitMs: 120, timeoutMs: 700 });
  }

  function stopGamepadWristIfActive() {
    if (machineClawMonitorRef.current?.source === "gamepad") {
      clearMachineClawMonitor(true);
    }
    if (machineClawProtectionMonitorRef.current?.source === "gamepad") {
      clearMachineClawProtectionMonitor(true);
    }
    const hadWrist = wristCommandSignatureRef.current !== "" || gamepadClawDirectionRef.current !== null;
    stopFourAxisArmJoystickControl();
    if (hadWrist) {
      void sendMachineClawStopCommandsQuiet();
      setMachineClawAction("idle");
    }
  }

  function updateGamepadClawLimit(direction: MachineClawClawDirection | null, speedRaw: number) {
    if (!direction) {
      if (gamepadClawDirectionRef.current !== null && machineClawMonitorRef.current?.source === "gamepad") {
        clearMachineClawMonitor(true);
      }
      gamepadClawDirectionRef.current = null;
      gamepadClawLimitDoneRef.current = null;
      gamepadClawLimitStartingRef.current = null;
      return true;
    }
    if (gamepadClawLimitDoneRef.current === direction) {
      return false;
    }
    const activeMonitor = machineClawMonitorRef.current;
    if (activeMonitor?.source === "gamepad" && activeMonitor.direction === direction) {
      return true;
    }
    if (gamepadClawLimitStartingRef.current === direction) {
      return false;
    }
    if (activeMonitor?.source === "gamepad") {
      clearMachineClawMonitor(true);
    }
    gamepadClawDirectionRef.current = direction;
    gamepadClawLimitStartingRef.current = direction;
    void beginGamepadClawLimitMonitor(direction, speedRaw);
    return false;
  }

  async function beginGamepadClawLimitMonitor(direction: MachineClawClawDirection, speedRaw: number) {
    if (!machineClawBridgeConnected) {
      gamepadClawLimitStartingRef.current = null;
      setMachineClawError(t("machineClaw.errors.bridgeRequired"));
      return;
    }
    if (speedRaw === 0) {
      gamepadClawLimitStartingRef.current = null;
      setMachineClawError(t("machineClaw.errors.zeroSpeed"));
      return;
    }
    const label = t(direction === "open" ? "machineClaw.actions.open" : "machineClaw.actions.close");
    const readResult = await runMachineClawPiServoCommand(buildMachineClawReadCommand(nextSeq()), t("machineClaw.actions.readFeedback"), {
      waitMs: 160,
      timeoutMs: 900
    });
    const positionRaw = machineClawPositionRawFromResult(readResult);
    if (gamepadClawDirectionRef.current !== direction) {
      gamepadClawLimitStartingRef.current = null;
      return;
    }
    if (positionRaw === null) {
      gamepadClawLimitStartingRef.current = null;
      await sendMachineClawStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
      setMachineClawError(t("machineClaw.errors.feedbackRequired"));
      setMachineClawAction("error");
      return;
    }

    const targetTurns = machineClawTargetTurns(machineClawConfigRef.current, direction);
    const generation = machineClawMonitorGenerationRef.current + 1;
    const nowMs = Date.now();
    machineClawMonitorGenerationRef.current = generation;
    machineClawMonitorRef.current = {
      completedTurns: 0,
      direction,
      generation,
      lastRawChangedAtMs: nowMs,
      polling: false,
      previousRaw: positionRaw,
      source: "gamepad",
      speedRaw,
      startedAtMs: nowMs,
      targetTurns
    };
    setMachineClawProgress({ completedTurns: 0, targetTurns, running: true });
    setMachineClawAction(machineClawClawActionKey(direction));
    setMachineClawError(null);
    addLog("system", label, "info");
    gamepadClawLimitStartingRef.current = null;
    startMachineClawMonitor(generation);
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

  function updateArmProfileSign(field: "j1Sign" | "j2Sign" | "elbowSign" | "j1GravitySign" | "j2GravitySign", value: string) {
    setArmProfile((current) => normalizeLiteArmProfile({ ...current, [field]: Number(value) === -1 ? -1 : 1 }, ROBOT_PROFILE.arm));
  }

  function resetArmFoldedTarget() {
    const nextState = createLiteArmRuntimeState(armProfileRef.current, ROBOT_PROFILE.feetech.servos);
    const nextFourAxisState = createLiteFourAxisArmRuntimeState(armProfileRef.current, ROBOT_PROFILE.feetech.servos);
    armStateRef.current = nextState;
    fourAxisArmStateRef.current = nextFourAxisState;
    setArmState(nextState);
    setFourAxisArmState(nextFourAxisState);
    updateFourAxisPoseLock(nextFourAxisState.target);
    stopArmJoystickControl();
    stopFourAxisArmJoystickControl();
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
      const nextFourAxisState = createLiteFourAxisArmRuntimeState(nextProfile, ROBOT_PROFILE.feetech.servos);
      armStateRef.current = nextState;
      fourAxisArmStateRef.current = nextFourAxisState;
      setArmState(nextState);
      setFourAxisArmState(nextFourAxisState);
      updateFourAxisPoseLock(nextFourAxisState.target);
      stopArmJoystickControl();
      stopFourAxisArmJoystickControl();
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
    const result = await sendPiServoCommandWithDebug(command, { waitMs: 650, timeoutMs: 1200 }, label);
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

  async function readFeetechPositionRaw(servo: (typeof ROBOT_PROFILE.feetech.servos)[number], label: string): Promise<number> {
    const command: PcCommand = { type: "servo.read", seq: nextSeq(), id: servo.id };
    addLog("tx", JSON.stringify(command), "info");
    const result = await sendPiServoCommandWithDebug(command, { waitMs: 650, timeoutMs: 1200 }, label);
    addLog("rx", JSON.stringify({ ok: result.ok, protocol: result.protocol, messages: result.messages }), result.ok ? "info" : "warn");
    setLastFeetechExchange({ label, command, result, at: Date.now() });
    if (result.ok === false) {
      throw new Error(result.error ?? t("errors.feetechRejected"));
    }
    const feedback = result.messages.find((message): message is ServoFeedbackMessage =>
      message.type === "servo.feedback" && message.id === servo.id && typeof message.positionRaw === "number"
    );
    const positionRaw = feedback?.positionRaw;
    if (typeof positionRaw !== "number" || !Number.isFinite(positionRaw)) {
      throw new Error(`ID${servo.id} feedback missing raw position`);
    }
    return positionRaw;
  }

  async function calibrateWristZero() {
    const label = t("actions.calibrateWristZero");
    const left = armServoProfile(MACHINE_CLAW_SERVO_IDS.pitchLeft);
    const claw = armServoProfile(MACHINE_CLAW_SERVO_IDS.claw);
    const right = armServoProfile(MACHINE_CLAW_SERVO_IDS.pitchRight);
    if (!left || !claw || !right) {
      setFeetechError(t("errors.feetechRejected"));
      return;
    }
    setFeetechBusy(label);
    setMachineClawError(null);
    setFeetechError(null);
    try {
      const wristZeroRaw21 = await readFeetechPositionRaw(left, label);
      const wristZeroRaw22 = await readFeetechPositionRaw(claw, label);
      const wristZeroRaw23 = await readFeetechPositionRaw(right, label);
      const currentWristSolution = solveFourAxisArmPoseIk(fourAxisArmStateRef.current.target, armProfileRef.current, ROBOT_PROFILE.feetech.servos);
      const nextProfile = normalizeLiteArmProfile({
        ...armProfileRef.current,
        wristZeroRaw21,
        wristZeroRaw22,
        wristZeroRaw23,
        wristZeroPitchLocalDeg: currentWristSolution.wristPitchLocalDeg,
        wristZeroRollDeg: currentWristSolution.target.wristRollDeg,
        wristCalibrated: true
      }, ROBOT_PROFILE.arm);
      armProfileRef.current = nextProfile;
      setArmProfile(nextProfile);
      publishWristPoseFeedback(createWristPoseFeedbackRuntime(nextProfile, wristZeroRaw21, wristZeroRaw23));
      stopFourAxisArmJoystickControl();
      addLog("system", t("logs.wristCalibrated"), "info");
    } catch (error) {
      const message = errorMessage(error, t);
      setMachineClawError(message);
      setFeetechError(message);
      addLog("system", t("logs.wristCalibrationFailed", { message }), "error");
    } finally {
      setFeetechBusy(null);
    }
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
      const result = await sendPiServoCommandWithDebug(command, { waitMs: 650, timeoutMs: 1200 }, label);
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
    const gamepadActivityFresh = gamepadActivityAt > 0 && Date.now() - gamepadActivityAt < 1200;
    const gamepadDiagramState = buildOperatorGamepadDiagramState(liteGamepadState, {
      activityFresh: gamepadActivityFresh,
      connected: Boolean(activeGamepad),
      enabled: gamepadControlEnabled,
      mode: gamepadControlMode
    });
    const manualTxAgeSeconds = manualTxStatus ? Math.max(0, Math.round((Date.now() - manualTxStatus.at) / 100) / 10) : null;
    const manualTxValue = manualTxStatus
      ? `${manualTxStatus.commandType}${manualTxStatus.seq === null ? "" : ` #${manualTxStatus.seq}`} ${manualTxAgeSeconds}s`
      : "--";
    const manualTxTone: Tone = manualTxStatus?.state === "error" ? "danger" : manualTxStatus?.state === "sending" ? "warning" : manualTxStatus ? "online" : "neutral";
    return (
      <section className="control-view">
        <div className="operator-main-column">
          <section className="panel control-camera-panel">
            <PanelTitle icon={<Video size={18} />} title={t("master.cameraFeeds")} meta={piHost} />
            <div className={`camera-feed-grid ${consoleMode === "operator" ? "single" : ""}`}>
              <CameraFeed
                label={t("camera.main")}
                mode="webrtc"
                offerUrl={mainCameraOfferUrl}
                onRuntimeChange={(patch) => updateCameraRuntime("main", patch)}
                runtime={cameraRuntimeById.main ?? EMPTY_CAMERA_RUNTIME}
                streamUrl={mainCameraUrl}
              />
              {consoleMode === "engineering" && (
                <CameraFeed
                  label={t("camera.secondary")}
                  mode="mjpeg"
                  offerUrl={secondaryCameraOfferUrl}
                  onRuntimeChange={(patch) => updateCameraRuntime("secondary", patch)}
                  runtime={cameraRuntimeById.secondary ?? EMPTY_CAMERA_RUNTIME}
                  streamUrl={secondaryCameraUrl}
                />
              )}
            </div>
          </section>

          <div className="operator-drive-grid">
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
          {consoleMode === "engineering" && <p className="inline-note">{t("manual.mecanumHint")}</p>}
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
          {consoleMode === "engineering" && <p className="inline-note">{t("manual.trackedHint")}</p>}
            </section>
          </div>

          <section className="panel manual-arm-panel">
          <PanelTitle icon={<Wrench size={18} />} title={t("manual.armTitle")} meta={`ID${armProfile.j1ServoId} / ID${armProfile.j2ServoId}`} />
          <div className="metric-grid">
            <Metric label={t("metrics.armForward")} value={formatNumber(fourAxisArmSolution.target.x)} />
            <Metric label={t("metrics.armHeight")} value={formatNumber(fourAxisArmSolution.target.z)} />
            <Metric label={t("metrics.toolPitch")} value={formatNumber(fourAxisArmSolution.target.toolPitchDeg)} />
            <Metric label={t("metrics.wristRoll")} value={formatNumber(fourAxisArmSolution.target.wristRollDeg)} />
            <Metric label={t("metrics.planeLockHeight")} value={formatNumber(fourAxisPoseLock.z)} tone={gamepadControlMode === "arm" ? "online" : "neutral"} />
            <Metric label={t("metrics.poseLock")} value={`${formatNumber(fourAxisPoseLock.toolPitchDeg)} / ${formatNumber(fourAxisPoseLock.wristRollDeg)}`} tone={gamepadControlMode === "arm" ? "online" : "neutral"} />
            <Metric label={t("metrics.wristCompensation")} value={armProfile.wristCalibrated && wristPoseFeedback ? `${wristCompensationLabel} ${wristFeedbackLabel}` : wristCompensationLabel} tone={wristCompensationTone} />
            <Metric label={t("metrics.gravityCompensation")} value={armGravityCompensationLabel} tone={armGravityCompensationTone} />
            <Metric label={t("metrics.j1Target")} value={`${formatNumber(armState.j1LogicalDeg)} / ${formatNumber(armSolution.j1PhysicalDeg)}`} />
            <Metric label={t("metrics.j2Target")} value={`${formatNumber(armState.j2LogicalDeg)} / ${formatNumber(armSolution.j2PhysicalDeg)}`} />
            <Metric label={t("metrics.calibrated")} value={armProfile.calibrated ? t("common.yes") : t("common.no")} tone={armProfile.calibrated ? "online" : "warning"} />
            <Metric label={t("metrics.wristCalibrated")} value={armProfile.wristCalibrated ? t("common.yes") : t("common.no")} tone={armProfile.wristCalibrated ? "online" : "warning"} />
            <Metric label={t("metrics.workspace")} value={armSolution.limitedByWorkspace ? t("status.limited") : t("status.ready")} tone={armSolution.limitedByWorkspace ? "warning" : "online"} />
            <Metric label={t("metrics.reachable")} value={armSolution.withinLimits ? t("common.yes") : t("common.no")} tone={armSolution.withinLimits ? "online" : "danger"} />
            <Metric label={t("metrics.piServoSerial")} value={piServoHealth?.serialOpen ? t("status.open") : t("status.closed")} tone={piServoTone} />
          </div>
          <details className="operator-tuning-details" open={consoleMode === "engineering"}>
            <summary>{t("operator.tuning")}</summary>
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
            <label>{t("fields.toolPitchSpeed")}<input value={armProfile.toolPitchSpeedDegPerSecond} onChange={(event) => updateArmProfileNumber("toolPitchSpeedDegPerSecond", event.target.value)} /></label>
            <label>{t("fields.wristRollSpeed")}<input value={armProfile.wristRollSpeedDegPerSecond} onChange={(event) => updateArmProfileNumber("wristRollSpeedDegPerSecond", event.target.value)} /></label>
            <label>{t("fields.toolLength")}<input value={armProfile.toolLengthMm} onChange={(event) => updateArmProfileNumber("toolLengthMm", event.target.value)} /></label>
            <label>{t("fields.toolPitchMin")}<input value={armProfile.toolPitchMinDeg} onChange={(event) => updateArmProfileNumber("toolPitchMinDeg", event.target.value)} /></label>
            <label>{t("fields.toolPitchMax")}<input value={armProfile.toolPitchMaxDeg} onChange={(event) => updateArmProfileNumber("toolPitchMaxDeg", event.target.value)} /></label>
            <label>{t("fields.wristRollMin")}<input value={armProfile.wristRollMinDeg} onChange={(event) => updateArmProfileNumber("wristRollMinDeg", event.target.value)} /></label>
            <label>{t("fields.wristRollMax")}<input value={armProfile.wristRollMaxDeg} onChange={(event) => updateArmProfileNumber("wristRollMaxDeg", event.target.value)} /></label>
            <label>{t("fields.wristSpeedRaw")}<input value={armProfile.wristSpeedRaw} onChange={(event) => updateArmProfileNumber("wristSpeedRaw", event.target.value)} /></label>
            {consoleMode === "engineering" && <>
            <label>{t("fields.gravityCompensationEnabled")}<input checked={armProfile.gravityCompensationEnabled} onChange={(event) => setArmProfile((current) => normalizeLiteArmProfile({ ...current, gravityCompensationEnabled: event.target.checked }, ROBOT_PROFILE.arm))} type="checkbox" /></label>
            <label>{t("fields.link1Mass")}<input value={armProfile.link1MassG} onChange={(event) => updateArmProfileNumber("link1MassG", event.target.value)} /></label>
            <label>{t("fields.link2Mass")}<input value={armProfile.link2MassG} onChange={(event) => updateArmProfileNumber("link2MassG", event.target.value)} /></label>
            <label>{t("fields.endEffectorMass")}<input value={armProfile.endEffectorMassG} onChange={(event) => updateArmProfileNumber("endEffectorMassG", event.target.value)} /></label>
            <label>{t("fields.payloadMass")}<input value={armProfile.payloadMassG} onChange={(event) => updateArmProfileNumber("payloadMassG", event.target.value)} /></label>
            <label>{t("fields.link1ComRatio")}<input value={armProfile.link1ComRatio} onChange={(event) => updateArmProfileNumber("link1ComRatio", event.target.value)} /></label>
            <label>{t("fields.link2ComRatio")}<input value={armProfile.link2ComRatio} onChange={(event) => updateArmProfileNumber("link2ComRatio", event.target.value)} /></label>
            <label>{t("fields.j1GravityBias")}<input value={armProfile.j1GravityBiasDegPerNm} onChange={(event) => updateArmProfileNumber("j1GravityBiasDegPerNm", event.target.value)} /></label>
            <label>{t("fields.j2GravityBias")}<input value={armProfile.j2GravityBiasDegPerNm} onChange={(event) => updateArmProfileNumber("j2GravityBiasDegPerNm", event.target.value)} /></label>
            <label>{t("fields.j1GravitySign")}<select value={armProfile.j1GravitySign} onChange={(event) => updateArmProfileSign("j1GravitySign", event.target.value)}><option value={1}>+1</option><option value={-1}>-1</option></select></label>
            <label>{t("fields.j2GravitySign")}<select value={armProfile.j2GravitySign} onChange={(event) => updateArmProfileSign("j2GravitySign", event.target.value)}><option value={1}>+1</option><option value={-1}>-1</option></select></label>
            <label>{t("fields.gravityMaxBias")}<input value={armProfile.gravityMaxBiasDeg} onChange={(event) => updateArmProfileNumber("gravityMaxBiasDeg", event.target.value)} /></label>
            </>}
            <label>{t("fields.minForward")}<input value={armProfile.minForward} onChange={(event) => updateArmProfileNumber("minForward", event.target.value)} /></label>
            <label>{t("fields.maxForward")}<input value={armProfile.maxForward} onChange={(event) => updateArmProfileNumber("maxForward", event.target.value)} /></label>
            <label>{t("fields.minHeight")}<input value={armProfile.minHeight} onChange={(event) => updateArmProfileNumber("minHeight", event.target.value)} /></label>
            <label>{t("fields.maxHeight")}<input value={armProfile.maxHeight} onChange={(event) => updateArmProfileNumber("maxHeight", event.target.value)} /></label>
            <label>{t("fields.speedRaw")}<input value={armProfile.speedRaw} onChange={(event) => updateArmProfileNumber("speedRaw", event.target.value)} /></label>
            <label>{t("fields.acc")}<input value={armProfile.acc} onChange={(event) => updateArmProfileNumber("acc", event.target.value)} /></label>
            </div>
          </details>
          <div className="toolbar-row">
            <button className="icon-button primary" disabled={Boolean(feetechBusy)} onClick={() => void calibrateArmFoldedZero()} type="button"><Radar size={17} /><span>{t("actions.calibrateArmZero")}</span></button>
            <button className="icon-button primary" disabled={Boolean(feetechBusy) || !machineClawBridgeConnected} onClick={() => void calibrateWristZero()} type="button"><HandHelping size={17} /><span>{t("actions.calibrateWristZero")}</span></button>
            <button className="icon-button" onClick={resetArmFoldedTarget} type="button"><RotateCw size={17} /><span>{t("actions.resetArmTarget")}</span></button>
          </div>
          {(consoleMode === "engineering" || !armProfile.calibrated || !armProfile.wristCalibrated) && <p className="inline-note">{!armProfile.calibrated ? t("manual.armNotCalibrated") : !armProfile.wristCalibrated ? t("manual.wristNotCalibrated") : t("manual.armHint")}</p>}

          <div className="arm-machine-claw" aria-label={t("machineClaw.title")}>
            <div className="arm-machine-claw-heading">
              <div>
                <strong><HandHelping size={17} />{t("machineClaw.title")}</strong>
                <span>{t("machineClaw.subtitle")}</span>
              </div>
              <div className="toolbar-row">
                <button className="icon-button" disabled={healthBusy} onClick={() => void refreshHealth(piHost)} type="button"><RefreshCw size={16} /><span>{t("actions.check")}</span></button>
                <button className="icon-button danger" disabled={!machineClawBridgeConnected || machineClawBusy} onClick={() => void stopMachineClawIds()} type="button"><ShieldAlert size={16} /><span>{t("machineClaw.actions.emergencyStop")}</span></button>
              </div>
            </div>
            <div className="metric-grid machine-claw-lite-metrics">
              <Metric label={t("machineClaw.metrics.bridge")} value={piServoHealth?.serialOpen ? t("status.bridgeOnline") : piServoError ?? t("status.standby")} tone={piServoTone} />
              <Metric label={t("machineClaw.metrics.activeAction")} value={machineClawActionLabel} tone={machineClawActionTone(machineClawAction)} />
              <Metric label={t("machineClaw.metrics.progress")} value={machineClawProgressLabel} tone={machineClawProgress.running ? "warning" : "neutral"} />
              <Metric label={t("machineClaw.metrics.protection")} value={machineClawProtectionLabel} tone={machineClawProtectionTone} />
              <Metric label={t("machineClaw.metrics.lastResponse")} value={lastMachineClawResponseLabel} tone={lastMachineClawResponse?.type === "error" ? "danger" : "neutral"} code />
            </div>
            {machineClawError && <p className="form-error">{machineClawError}</p>}
            <div className="machine-claw-lite-grid">
              <div className="machine-claw-lite-group">
                <div className="machine-claw-lite-group-title">
                  <strong>{t("machineClaw.pitch.title")}</strong>
                  <span>ID21 / ID23</span>
                </div>
                {consoleMode === "engineering" && <div className="machine-claw-lite-fields">
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.pitchSpeed")} max={1000} min={0} onChange={(value) => updateMachineClawNumber("pitchSpeedRaw", value)} value={machineClawConfig.pitchSpeedRaw} />
                  <MachineClawNumberField disabled={machineClawBusy} label={t("machineClaw.fields.pitchLimitTurns")} min={0.01} onChange={(value) => updateMachineClawNumber("pitchLimitTurns", value)} step={0.01} value={machineClawConfig.pitchLimitTurns} />
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.acc")} max={254} min={0} onChange={(value) => updateMachineClawNumber("acc", value)} value={machineClawConfig.acc} />
                  <MachineClawToggleField checked={machineClawConfig.pitchReverse} disabled={machineClawBusy} label={t("machineClaw.fields.pitchReverse")} onChange={(checked) => updateMachineClawConfig({ pitchReverse: checked })} />
                </div>}
                <div className="toolbar-row">
                  <button className="icon-button primary" disabled={machineClawControlsDisabled} onClick={() => void startMachineClawPitch("positive")} type="button"><ArrowUp size={16} /><span>{t("machineClaw.actions.pitchPositive")}</span></button>
                  <button className="icon-button" disabled={machineClawControlsDisabled} onClick={() => void startMachineClawPitch("negative")} type="button"><ArrowDown size={16} /><span>{t("machineClaw.actions.pitchNegative")}</span></button>
                  <button className="icon-button" disabled={!machineClawBridgeConnected || machineClawBusy} onClick={() => void stopMachineClawIds([MACHINE_CLAW_SERVO_IDS.pitchLeft, MACHINE_CLAW_SERVO_IDS.pitchRight])} type="button"><Square size={15} /><span>{t("machineClaw.actions.stopPitch")}</span></button>
                </div>
              </div>

              <div className="machine-claw-lite-group">
                <div className="machine-claw-lite-group-title">
                  <strong>{t("machineClaw.rotation.title")}</strong>
                  <span>ID21 / ID23 / ID22</span>
                </div>
                {consoleMode === "engineering" && <div className="machine-claw-lite-fields">
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.rotationSpeed")} max={1000} min={0} onChange={(value) => updateMachineClawNumber("rotationSpeedRaw", value)} value={machineClawConfig.rotationSpeedRaw} />
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.rotationClawSpeed")} max={1000} min={0} onChange={(value) => updateMachineClawNumber("rotationClawSpeedRaw", value)} value={machineClawConfig.rotationClawSpeedRaw} />
                  <MachineClawNumberField disabled={machineClawBusy} label={t("machineClaw.fields.rotationLimitTurns")} min={0.01} onChange={(value) => updateMachineClawNumber("rotationLimitTurns", value)} step={0.01} value={machineClawConfig.rotationLimitTurns} />
                  <MachineClawToggleField checked={machineClawConfig.rotationReverse} disabled={machineClawBusy} label={t("machineClaw.fields.rotationReverse")} onChange={(checked) => updateMachineClawConfig({ rotationReverse: checked })} />
                  <MachineClawToggleField checked={machineClawConfig.rotationClawReverse} disabled={machineClawBusy} label={t("machineClaw.fields.rotationClawReverse")} onChange={(checked) => updateMachineClawConfig({ rotationClawReverse: checked })} />
                </div>}
                <div className="toolbar-row">
                  <button className="icon-button primary" disabled={machineClawControlsDisabled} onClick={() => void startMachineClawRotation("positive")} type="button"><RotateCw size={16} /><span>{t("machineClaw.actions.rotatePositive")}</span></button>
                  <button className="icon-button" disabled={machineClawControlsDisabled} onClick={() => void startMachineClawRotation("negative")} type="button"><RotateCcw size={16} /><span>{t("machineClaw.actions.rotateNegative")}</span></button>
                  <button className="icon-button" disabled={!machineClawBridgeConnected || machineClawBusy} onClick={() => void stopMachineClawIds([MACHINE_CLAW_SERVO_IDS.pitchLeft, MACHINE_CLAW_SERVO_IDS.claw, MACHINE_CLAW_SERVO_IDS.pitchRight])} type="button"><Square size={15} /><span>{t("machineClaw.actions.stopRotation")}</span></button>
                </div>
              </div>

              <div className="machine-claw-lite-group">
                <div className="machine-claw-lite-group-title">
                  <strong>{t("machineClaw.claw.title")}</strong>
                  <span>ID22</span>
                </div>
                {consoleMode === "engineering" && <div className="machine-claw-lite-fields">
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.clawSpeed")} max={1000} min={0} onChange={(value) => updateMachineClawNumber("clawSpeedRaw", value)} value={machineClawConfig.clawSpeedRaw} />
                  <MachineClawNumberField disabled={machineClawBusy} label={t("machineClaw.fields.openTurns")} min={0.01} onChange={(value) => updateMachineClawNumber("openTurns", value)} step={0.01} value={machineClawConfig.openTurns} />
                  <MachineClawNumberField disabled={machineClawBusy} label={t("machineClaw.fields.closeTurns")} min={0.01} onChange={(value) => updateMachineClawNumber("closeTurns", value)} step={0.01} value={machineClawConfig.closeTurns} />
                  <MachineClawToggleField checked={machineClawConfig.clawReverse} disabled={machineClawBusy} label={t("machineClaw.fields.clawReverse")} onChange={(checked) => updateMachineClawConfig({ clawReverse: checked })} />
                </div>}
                <div className="machine-claw-lite-progress">
                  <span>{t("machineClaw.metrics.progress")}</span>
                  <strong>{machineClawProgressLabel}</strong>
                </div>
                <div className="toolbar-row">
                  <button className="icon-button primary" disabled={machineClawControlsDisabled} onClick={() => void startMachineClawClaw("open")} type="button"><ArrowUp size={16} /><span>{t("machineClaw.actions.open")}</span></button>
                  <button className="icon-button" disabled={machineClawControlsDisabled} onClick={() => void startMachineClawClaw("close")} type="button"><ArrowDown size={16} /><span>{t("machineClaw.actions.close")}</span></button>
                  <button className="icon-button" disabled={!machineClawBridgeConnected || machineClawBusy} onClick={() => void stopMachineClawIds([MACHINE_CLAW_SERVO_IDS.claw])} type="button"><Square size={15} /><span>{t("machineClaw.actions.stopClaw")}</span></button>
                </div>
              </div>

              {consoleMode === "engineering" && <div className="machine-claw-lite-group machine-claw-lite-protection">
                <div className="machine-claw-lite-group-title">
                  <strong>{t("machineClaw.protection.title")}</strong>
                  <span>{t("machineClaw.protection.subtitle")}</span>
                </div>
                <div className="machine-claw-lite-fields">
                  <MachineClawToggleField checked={machineClawConfig.protectionEnabled} disabled={machineClawBusy} label={t("machineClaw.fields.protectionEnabled")} onChange={(checked) => updateMachineClawConfig({ protectionEnabled: checked })} />
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.protectionCurrentMa")} max={5000} min={0} onChange={(value) => updateMachineClawNumber("protectionCurrentMa", value)} value={machineClawConfig.protectionCurrentMa} />
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.protectionLoadPercent")} max={100} min={0} onChange={(value) => updateMachineClawNumber("protectionLoadPercent", value)} value={machineClawConfig.protectionLoadPercent} />
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.protectionTemperatureC")} max={100} min={0} onChange={(value) => updateMachineClawNumber("protectionTemperatureC", value)} value={machineClawConfig.protectionTemperatureC} />
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.protectionStallMs")} max={3000} min={120} onChange={(value) => updateMachineClawNumber("protectionStallMs", value)} value={machineClawConfig.protectionStallMs} />
                  <MachineClawRangeField disabled={machineClawBusy} label={t("machineClaw.fields.protectionMinRawDelta")} max={64} min={0} onChange={(value) => updateMachineClawNumber("protectionMinRawDelta", value)} value={machineClawConfig.protectionMinRawDelta} />
                </div>
              </div>}
            </div>
          </div>
        </section>

        {consoleMode === "engineering" && <section className="panel manual-can-panel">
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
        </section>}

        </div>

        <aside className="operator-side-column">
          <section className="panel operator-pi-panel">
            <PanelTitle icon={<Radar size={18} />} title={t("operator.piConnection")} meta={piHost} />
            <div className="operator-pi-row">
              <input aria-label={t("operator.piHost")} value={manualHost} onChange={(event) => setManualHost(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") {
                  reconnectPiHost();
                }
              }} placeholder={t("placeholders.piHost")} />
              <button className="icon-button primary" onClick={() => applyHost(manualHost)} type="button"><Save size={16} /><span>{t("actions.apply")}</span></button>
              <button className="icon-button" disabled={healthBusy} onClick={reconnectPiHost} type="button"><RefreshCw size={16} /><span>{healthBusy ? t("common.checking") : t("operator.reconnect")}</span></button>
            </div>
            <div className="operator-pi-status">
              <Metric label="A-board" value={bridgeStatusText(aBoardHealth, aBoardError, t)} tone={aBoardTone} />
              <Metric label="Pi servo" value={piServoHealth?.serialOpen ? t("status.bridgeOnline") : piServoError ?? t("status.standby")} tone={piServoTone} />
            </div>
          </section>

          <section className="panel operator-imu-panel">
            <PanelTitle icon={<Activity size={18} />} title={t("imu.title")} meta={imuStatusLabel} />
            <div className="metric-grid imu-metric-grid">
              <Metric label={t("metrics.imuStatus")} value={imuStatusLabel} tone={imuStatusTone} />
              <Metric label={t("metrics.rollPitch")} value={imuRollPitchLabel} tone={imuSnapshot?.attitude ? "online" : "neutral"} />
              <Metric label={t("metrics.gyroDps")} value={imuGyroLabel} code />
              <Metric label={t("metrics.mpuWhoAmI")} value={formatImuChipIds(imuSnapshot?.feedback)} code />
              <Metric label={t("metrics.imuSample")} value={imuSampleLabel} />
            </div>
            <div className="toolbar-row">
              <button className="icon-button" disabled={!aBoardBridgeConnected} onClick={() => void readOperatorImu()} type="button"><RefreshCw size={16} /><span>{t("imu.actions.read")}</span></button>
            </div>
            {imuError && <p className="form-error">{imuError}</p>}
          </section>

          <section className="panel operator-stop-panel">
            <PanelTitle icon={<ShieldAlert size={18} />} title={t("operator.safetyTitle")} meta={t("operator.safetyMeta")} />
            <button className="operator-stop-button" onClick={() => stopWholeRobot()} type="button">
              <ShieldAlert size={24} />
              <span>{t("operator.stopWholeRobot")}</span>
              <small>{lastWholeStopReason || t("operator.stopReasonIdle")}</small>
            </button>
            <div className="operator-safety-metrics">
            <Metric label={t("operator.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("gamepad.noGamepad")} tone={activeGamepad ? "online" : "warning"} />
              <Metric label={t("operator.handMode")} value={t(gamepadControlMode === "arm" ? "operator.handModeArm" : "operator.handModeDrive")} tone={gamepadControlMode === "arm" ? "warning" : "online"} />
              <Metric label={t("operator.lastTx")} value={manualTxStatus?.error ?? manualTxValue} tone={manualTxTone} code />
              <Metric label={t("machineClaw.metrics.activeAction")} value={machineClawActionLabel} tone={machineClawActionTone(machineClawAction)} />
            </div>
            {!activeGamepad && <p className="operator-warning"><Gamepad2 size={14} />{t("operator.gamepadWarning")}</p>}
          </section>

          {consoleMode === "operator" && <section className="panel operator-gamepad-panel">
            <PanelTitle icon={<Gamepad2 size={18} />} title={t("operator.gamepadDiagram.title")} meta={t(gamepadDiagramState.statusKey)} />
            <OperatorGamepadDiagram state={gamepadDiagramState} t={t} />
          </section>}

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

        <section className="panel operator-status-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("operator.statusRail")} meta={consoleMode === "operator" ? t("operator.modeOperator") : t("operator.modeEngineering")} />
          <div className="metric-grid">
            <Metric label={t("metrics.queueDepth")} value={aBoardHealth?.queueDepth} />
            <Metric label={t("metrics.requestCount")} value={aBoardHealth?.requestCount} />
            <Metric label={t("operator.handMode")} value={t(gamepadControlMode === "arm" ? "operator.handModeArm" : "operator.handModeDrive")} tone={gamepadControlMode === "arm" ? "warning" : "online"} />
            <Metric label={t("metrics.imuStatus")} value={imuStatusLabel} tone={imuStatusTone} />
            <Metric label={t("metrics.rollPitch")} value={imuRollPitchLabel} tone={imuSnapshot?.attitude ? "online" : "neutral"} />
            <Metric label={t("operator.lastStop")} value={lastWholeStopReason || t("status.ready")} tone={lastWholeStopReason ? "warning" : "neutral"} />
            <Metric label={t("operator.lastError")} value={operatorCriticalError} tone={operatorCriticalError === "--" ? "neutral" : "danger"} code />
            <Metric label={t("metrics.calibrated")} value={armProfile.calibrated ? t("common.yes") : t("common.no")} tone={armProfile.calibrated ? "online" : "warning"} />
            <Metric label={t("machineClaw.metrics.progress")} value={machineClawProgressLabel} tone={machineClawProgress.running ? "warning" : "neutral"} />
          </div>
        </section>

        <section className="panel device-panel operator-device-panel">
          <PanelTitle icon={<Network size={18} />} title={t("master.deviceStatus")} meta={`${A_BOARD_BRIDGE_PORT} / ${PI_SERVO_BRIDGE_PORT}`} />
          {consoleMode === "engineering" ? (
            <div className="device-status-grid">
              <ArchitectureNode icon={<Activity size={18} />} label={t("nodes.pcWebLite")} status="127.0.0.1:5174" tone="online" />
              <ArchitectureNode icon={<Radar size={18} />} label={t("nodes.raspberryPi")} status={piHost} tone={aBoardTone === "online" || piServoTone === "online" ? "online" : "warning"} />
              <ArchitectureNode icon={<Cable size={18} />} label={t("nodes.aBoardBridge")} status={bridgeStatusText(aBoardHealth, aBoardError, t)} tone={aBoardTone} />
              <ArchitectureNode icon={<Cpu size={18} />} label={t("nodes.mcuUart")} status={aBoardHealth?.serialPort ?? "/dev/ttyAMA5"} tone={aBoardHealth?.serialOpen ? "online" : "neutral"} />
              <ArchitectureNode icon={<DatabaseZap size={18} />} label={t("nodes.canBus")} status={aBoardHealth?.canServoReady === false ? t("status.notReady") : t("status.ready")} tone={aBoardHealth?.canServoReady === false ? "warning" : "online"} />
              <ArchitectureNode icon={<Wrench size={18} />} label={t("nodes.feetechBus")} status={piServoHealth?.serialPort ?? "/dev/serial0"} tone={piServoTone} />
            </div>
          ) : (
            <>
              <div className="operator-device-grid">
                {operatorDeviceMatrix.map((item) => (
                  <OperatorDeviceTile badge={t(item.required ? "operator.required" : "operator.backup")} detail={operatorDeviceDetail(item.detail, t)} key={item.id} label={t(`operator.devices.${item.id}`)} tone={item.tone} />
                ))}
              </div>
              <div className="operator-role-grid">
                {ROBOT_PROFILE.operation.roles.map((role) => (
                  <OperatorRoleTile devices={role.deviceRefs} key={role.id} label={t(role.labelKey)} required={role.required} />
                ))}
              </div>
            </>
          )}
        </section>

        {consoleMode === "engineering" && <section className="panel log-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("panels.eventLog")} meta={`${logs.length}`} />
          <LogList logs={logs} t={t} />
        </section>}
        </aside>
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
      { label: "Y", active: liteGamepadState.y },
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
          <StatusPill label="IMU" value={imuStatusLabel} tone={imuStatusTone} />
          <StatusPill label={t("operator.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("status.notReady")} tone={activeGamepad ? "online" : "warning"} />
          <StatusPill label={t("operator.handMode")} value={t(gamepadControlMode === "arm" ? "operator.handModeArm" : "operator.handModeDrive")} tone={gamepadControlMode === "arm" ? "warning" : "online"} />
          <StatusPill label={t("operator.lastStop")} value={lastWholeStopReason || t("status.ready")} tone={lastWholeStopReason ? "warning" : "neutral"} />
          <StatusPill label={t("operator.lastError")} value={operatorCriticalError} tone={operatorCriticalError === "--" ? "neutral" : "danger"} />
          <div className="mode-switch" role="group" aria-label={t("operator.mode")}>
            <button className={consoleMode === "operator" ? "active" : ""} onClick={() => changeConsoleMode("operator")} type="button">{t("operator.modeOperator")}</button>
            <button className={consoleMode === "engineering" ? "active" : ""} onClick={() => changeConsoleMode("engineering")} type="button">{t("operator.modeEngineering")}</button>
          </div>
          <button className="topbar-estop" onClick={() => stopWholeRobot()} type="button">
            <ShieldAlert size={17} />
            <span>{t("operator.stopWholeRobot")}</span>
          </button>
          <label className="language-control">
            <span>{t("language.label")}</span>
            <select aria-label={t("language.label")} value={currentLanguage} onChange={(event) => changeLanguage(event.target.value)}>
              {SUPPORTED_LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_LABELS[language]}</option>)}
            </select>
          </label>
        </div>
      </header>

      <nav className="view-tabs" aria-label={t("nav.label")}>
        {navItems.filter((item) => isConsoleViewVisible(consoleMode, item.id)).map((item) => (
          <button className={item.id === activeView ? "active" : ""} key={item.id} onClick={() => selectConsoleView(item.id)} type="button">
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

function OperatorDeviceTile({ badge, detail, label, tone }: { badge: string; detail: string; label: string; tone: Tone }) {
  return (
    <div className={`operator-device-tile ${tone}`}>
      <span className="status-led" />
      <div>
        <strong>{label}</strong>
        <small>{badge}</small>
      </div>
      <code>{detail}</code>
    </div>
  );
}

function OperatorRoleTile({ devices, label, required }: { devices: string[]; label: string; required: boolean }) {
  return (
    <div className={`operator-role-tile ${required ? "required" : "backup"}`}>
      <strong>{label}</strong>
      <code>{devices.join(" / ")}</code>
    </div>
  );
}

function OperatorGamepadDiagram({ state, t }: { state: OperatorGamepadDiagramState; t: TFunction }) {
  const control = (id: OperatorGamepadDiagramControlId) => operatorGamepadDiagramControl(state, id);
  return (
    <div className={`gamepad-diagram ${state.tone} ${state.enabled ? "" : "disabled"}`} aria-live="polite">
      <div className="gamepad-diagram-summary">
        <span className="status-led" />
        <strong>{t(state.statusKey)}</strong>
        <span>{state.active ? t("operator.gamepadDiagram.activeCount", { count: state.activeCount }) : t("operator.gamepadDiagram.idle")}</span>
      </div>
      <div className="gamepad-diagram-shoulders">
        <GamepadDiagramKey control={control("lt")} t={t} />
        <GamepadDiagramKey control={control("lb")} t={t} />
        <GamepadDiagramKey control={control("rb")} t={t} />
        <GamepadDiagramKey control={control("rt")} t={t} />
      </div>
      <div className="gamepad-diagram-body">
        <div className="gamepad-diagram-dpad" aria-label={t("manual.dpad")}>
          <span />
          <GamepadDiagramKey control={control("dpadUp")} t={t} />
          <span />
          <GamepadDiagramKey control={control("dpadLeft")} t={t} />
          <div className="gamepad-diagram-center">{t("operator.gamepadDiagram.dpad")}</div>
          <GamepadDiagramKey control={control("dpadRight")} t={t} />
          <span />
          <GamepadDiagramKey control={control("dpadDown")} t={t} />
          <span />
        </div>
        <GamepadDiagramStick control={control("leftStick")} t={t} />
        <GamepadDiagramStick control={control("rightStick")} t={t} />
        <div className="gamepad-diagram-face">
          <GamepadDiagramKey control={control("y")} t={t} />
          <GamepadDiagramKey control={control("a")} t={t} />
        </div>
      </div>
    </div>
  );
}

function GamepadDiagramKey({ control, t }: { control: OperatorGamepadDiagramControl; t: TFunction }) {
  return (
    <div className={`gamepad-diagram-key ${control.active ? "active" : ""}`} aria-label={`${t(control.labelKey)} ${t(control.actionKey)} ${control.value}`}>
      <strong>{control.shortLabel}</strong>
      <span>{t(control.actionKey)}</span>
      <em>{control.value}</em>
    </div>
  );
}

function GamepadDiagramStick({ control, t }: { control: OperatorGamepadDiagramControl; t: TFunction }) {
  const x = Math.round((control.x ?? 0) * 16);
  const y = Math.round((control.y ?? 0) * -16);
  return (
    <div className={`gamepad-diagram-stick ${control.active ? "active" : ""}`} aria-label={`${t(control.labelKey)} ${t(control.actionKey)} ${control.value}`}>
      <div className="gamepad-stick-pad">
        <span className="gamepad-stick-knob" style={{ transform: `translate(${x}px, ${y}px)` }} />
      </div>
      <div>
        <strong>{t(control.labelKey)}</strong>
        <span>{t(control.actionKey)}</span>
        <code>{control.value}</code>
      </div>
    </div>
  );
}

function operatorGamepadDiagramControl(state: OperatorGamepadDiagramState, id: OperatorGamepadDiagramControlId): OperatorGamepadDiagramControl {
  const control = state.controls.find((item) => item.id === id);
  if (control) {
    return control;
  }
  return {
    actionKey: "operator.gamepadDiagram.idle",
    active: false,
    group: "face",
    id,
    labelKey: "operator.gamepadDiagram.idle",
    shortLabel: "--",
    value: "0"
  };
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

function operatorDeviceDetail(detail: string, t: TFunction) {
  if (detail === "connected") {
    return t("status.online");
  }
  if (detail === "not connected") {
    return t("operator.deviceStates.notConnected");
  }
  if (detail === "not checked") {
    return t("status.notChecked");
  }
  return detail;
}

function MachineClawRangeField({ disabled, label, max, min, onChange, value }: {
  disabled: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  value: number;
}) {
  return (
    <label className="machine-claw-lite-range">
      <span>{label}</span>
      <div>
        <input disabled={disabled} max={max} min={min} onChange={(event) => onChange(event.target.value)} type="range" value={value} />
        <input disabled={disabled} max={max} min={min} onChange={(event) => onChange(event.target.value)} type="number" value={value} />
      </div>
    </label>
  );
}

function MachineClawNumberField({ disabled, label, min, onChange, step, value }: {
  disabled: boolean;
  label: string;
  min: number;
  onChange: (value: string) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="machine-claw-lite-number">
      <span>{label}</span>
      <input disabled={disabled} min={min} onChange={(event) => onChange(event.target.value)} step={step} type="number" value={value} />
    </label>
  );
}

function MachineClawToggleField({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="machine-claw-lite-toggle">
      <input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function CameraFeed({ label, mode, offerUrl, onRuntimeChange, runtime, streamUrl }: {
  label: string;
  mode: "mjpeg" | "webrtc";
  offerUrl: string;
  onRuntimeChange: (patch: Partial<LiteCameraRuntime>) => void;
  runtime: LiteCameraRuntime;
  streamUrl: string;
}) {
  const [latency, setLatency] = useState<LiteCameraLatency>(EMPTY_CAMERA_LATENCY);
  const modeLabel = mode === "webrtc" && !runtime.webrtcFallback ? "WebRTC" : mode === "webrtc" ? "MJPEG fallback" : "MJPEG";
  const statusLabel = runtime.failed ? "error" : runtime.loaded ? modeLabel : "loading";
  const latencyLabel = latency.estimateMs === null ? "-- ms" : `${latency.estimateMs} ms`;
  const latencyTone = cameraLatencyTone(latency);

  useEffect(() => {
    if (!streamUrl) {
      setLatency(EMPTY_CAMERA_LATENCY);
      return undefined;
    }

    let cancelled = false;
    const latencyUrl = buildLiteCameraLatencyUrl(streamUrl);

    async function pollLatency() {
      const startedAt = performance.now();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 800);
      try {
        const response = await fetch(latencyUrl, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json() as unknown;
        const rttMs = Math.max(0, Math.round(performance.now() - startedAt));
        const frameAgeMs = readFiniteNumberField(payload, "frameAgeMs") ??
          estimateFrameAgeFromTimestamps(payload);
        const estimateMs = frameAgeMs === null
          ? rttMs
          : Math.max(0, Math.round(frameAgeMs + rttMs / 2));
        if (!cancelled) {
          setLatency({ error: null, estimateMs, rttMs, updatedAt: Date.now() });
        }
      } catch (error) {
        if (!cancelled) {
          setLatency({
            error: error instanceof Error && error.message ? error.message : "latency unavailable",
            estimateMs: null,
            rttMs: null,
            updatedAt: Date.now()
          });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void pollLatency();
    const timer = window.setInterval(() => {
      void pollLatency();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [streamUrl]);

  return (
    <div className={`camera-feed ${runtime.loaded ? "online" : ""} ${runtime.failed ? "error" : ""}`}>
      <CameraViewer
        alt={label}
        failed={runtime.failed}
        forceMjpeg={runtime.webrtcFallback}
        mode={mode}
        offerUrl={offerUrl}
        onError={() => onRuntimeChange({ failed: true, loaded: false })}
        onLoad={() => onRuntimeChange({ failed: false, loaded: true })}
        onWebrtcFallback={(error) => onRuntimeChange({ failed: false, loaded: false, webrtcError: error, webrtcFallback: true })}
        placeholder={
          <div className="camera-feed-placeholder">
            <Camera size={34} />
            <span>{label}</span>
          </div>
        }
        streamUrl={streamUrl}
      />
      <div className={`camera-latency-badge ${latencyTone}`} title={latency.error ?? `RTT ${latency.rttMs ?? "--"} ms`}>
        <Activity size={13} />
        <span>{latencyLabel}</span>
      </div>
      <div className="camera-feed-meta">
        <strong>{label}</strong>
        <span className={runtime.failed ? "camera-feed-status error" : runtime.loaded ? "camera-feed-status online" : "camera-feed-status"}>{statusLabel}</span>
        <code>{runtime.webrtcError && runtime.webrtcFallback ? runtime.webrtcError : streamUrl}</code>
      </div>
    </div>
  );
}

function buildLiteCameraLatencyUrl(streamUrl: string): string {
  try {
    const url = new URL(streamUrl);
    url.pathname = "/latency";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function cameraLatencyTone(latency: LiteCameraLatency): "danger" | "neutral" | "online" | "warning" {
  if (latency.error) {
    return "danger";
  }
  if (latency.estimateMs === null) {
    return "neutral";
  }
  if (latency.estimateMs > 350) {
    return "danger";
  }
  if (latency.estimateMs > 160) {
    return "warning";
  }
  return "online";
}

function readFiniteNumberField(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const number = Number((value as Record<string, unknown>)[key]);
  return Number.isFinite(number) ? number : null;
}

function estimateFrameAgeFromTimestamps(value: unknown): number | null {
  const serverNowMs = readFiniteNumberField(value, "serverNowMs");
  const frameTimestampMs = readFiniteNumberField(value, "frameTimestampMs");
  if (serverNowMs === null || frameTimestampMs === null) {
    return null;
  }
  return Math.max(0, serverNowMs - frameTimestampMs);
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

function formatVector3(value: { x: number; y: number; z: number } | null | undefined, digits = 0): string {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
    return "--";
  }
  return `${formatNumber(value.x, digits)} / ${formatNumber(value.y, digits)} / ${formatNumber(value.z, digits)}`;
}

function formatHexByte(value: number | null | undefined): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `0x${Math.round(value!).toString(16).toUpperCase().padStart(2, "0")}`;
}

function formatImuChipIds(feedback: LiteImuSnapshot["feedback"] | null | undefined): string {
  if (!feedback) {
    return "--";
  }
  return `${formatHexByte(feedback.mpuWhoAmI)} / ${formatHexByte(feedback.istWhoAmI)}`;
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

function machineClawSpeedTargetsFromCommands(commands: readonly PcCommand[]): MachineClawProtectionTarget[] {
  return commands.flatMap((command) => {
    if (command.type !== "servo.speed" || !Array.isArray(command.targets)) {
      return [];
    }
    return command.targets.flatMap((target) => {
      const maybeTarget = target as Partial<MachineClawProtectionTarget>;
      return typeof maybeTarget.id === "number" && typeof maybeTarget.speedRaw === "number"
        ? [{ id: maybeTarget.id, speedRaw: maybeTarget.speedRaw }]
        : [];
    });
  });
}

function compactMachineClawProtectionTargets(targets: readonly MachineClawProtectionTarget[]): MachineClawProtectionTarget[] {
  const byId = new Map<number, number>();
  for (const target of targets) {
    byId.set(target.id, target.speedRaw);
  }
  return Array.from(byId, ([id, speedRaw]) => ({ id, speedRaw }));
}

function servoFeedbackFromResult(result: PiServoCommandResult, servoId: number): ServoFeedbackMessage | null {
  const messages = result.response ? [result.response, ...result.messages] : result.messages;
  return messages.find((message): message is ServoFeedbackMessage =>
    message.type === "servo.feedback" &&
    message.id === servoId
  ) ?? null;
}

function servoFeedbackPositionRaw(feedback: ServoFeedbackMessage | null | undefined): number | null {
  return typeof feedback?.positionRaw === "number" && Number.isFinite(feedback.positionRaw) ? feedback.positionRaw : null;
}

function formatMachineClawProtectionStatus(status: MachineClawProtectionStatus, t: TFunction): string {
  if (status.tripped) {
    return status.detail ?? t("machineClaw.protection.stopped");
  }
  if (status.active) {
    return t("machineClaw.protection.active", { ids: status.ids.map((id) => `ID${id}`).join(" / ") });
  }
  return t("machineClaw.protection.idle");
}

function machineClawProtectionTripMessage(trip: MachineClawProtectionTrip, t: TFunction): string {
  const reasonKeyByType: Record<MachineClawProtectionReason, string> = {
    current: "machineClaw.protection.currentHigh",
    feedback: "machineClaw.protection.feedbackLost",
    load: "machineClaw.protection.loadHigh",
    stall: "machineClaw.protection.stalled",
    temperature: "machineClaw.protection.temperatureHigh",
    turnLimit: "machineClaw.protection.turnLimit"
  };
  return t("machineClaw.protection.tripMessage", {
    detail: trip.detail,
    id: trip.id,
    reason: t(reasonKeyByType[trip.reason])
  });
}

function machineClawActionTone(action: MachineClawRunAction): Tone {
  if (action === "error") return "danger";
  if (action === "stopping") return "warning";
  if (action === "idle") return "neutral";
  return "online";
}

function actionFromWristTargets(
  targets: ReturnType<typeof buildLiteFourAxisWristPoseHoldSpeedTargets>,
  clawDirection: MachineClawClawDirection | null
): MachineClawRunAction {
  if (clawDirection) {
    return machineClawClawActionKey(clawDirection);
  }
  const leftSpeed = targets.find((target) => target.id === MACHINE_CLAW_SERVO_IDS.pitchLeft)?.speedRaw ?? 0;
  const rightSpeed = targets.find((target) => target.id === MACHINE_CLAW_SERVO_IDS.pitchRight)?.speedRaw ?? 0;
  const pitchComponent = (leftSpeed - rightSpeed) / 2;
  const rollComponent = (leftSpeed + rightSpeed) / 2;
  if (Math.abs(rollComponent) > Math.abs(pitchComponent)) {
    return machineClawActionKey("rotation", rollComponent > 0 ? "positive" : "negative");
  }
  return machineClawActionKey("pitch", pitchComponent > 0 ? "positive" : "negative");
}

function formatMachineClawProgress(progress: MachineClawTurnProgress): string {
  if (!progress.running && progress.targetTurns <= 0) {
    return "--";
  }
  return `${progress.completedTurns.toFixed(2)} / ${progress.targetTurns.toFixed(2)}`;
}

function formatMachineClawResponse(response: InboundMessage | null, t: TFunction): string {
  if (!response) {
    return t("machineClaw.status.noResponse");
  }
  if (response.type === "ack") {
    return `ack #${response.seq}`;
  }
  if (response.type === "error") {
    return `${response.code ?? "error"} #${response.seq}`;
  }
  if (response.type === "servo.feedback") {
    return `ID${response.id} raw ${response.positionRaw ?? "--"}`;
  }
  return `${response.type} #${response.seq ?? "--"}`;
}

function machineClawCommandSpeedRaw(command: PcCommand): number {
  const target = Array.isArray(command.targets) ? command.targets[0] as { speedRaw?: number } | undefined : undefined;
  return typeof target?.speedRaw === "number" ? target.speedRaw : 0;
}

function inboundErrorMessage(response: InboundMessage | null): string | null {
  return response?.type === "error" && typeof response.message === "string" ? response.message : null;
}

function servoPositionRawFromResult(result: PiServoCommandResult, servoId: number): number | null {
  const messages = result.response ? [result.response, ...result.messages] : result.messages;
  const feedback = messages.find((message): message is ServoFeedbackMessage =>
    message.type === "servo.feedback" &&
    message.id === servoId &&
    typeof message.positionRaw === "number" &&
    Number.isFinite(message.positionRaw)
  );
  return feedback?.positionRaw ?? null;
}

function piServoResultHasDebugDisabled(result: PiServoCommandResult): boolean {
  const messages = result.response ? [result.response, ...result.messages] : result.messages;
  return messages.some(isServoDebugDisabledError);
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
