import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Cable,
  Camera,
  Crosshair,
  Cpu,
  Download,
  Gauge,
  Gamepad2,
  ChevronDown,
  ChevronRight,
  Keyboard,
  Languages,
  ListPlus,
  Play,
  Power,
  PowerOff,
  Radar,
  RotateCcw,
  RotateCw,
  Save,
  Send,
  Settings,
  SlidersHorizontal,
  Square,
  Trash2,
  Unplug,
  Upload,
  Usb,
  Video,
  VideoOff
} from "lucide-react";
import { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DebugModule,
  InboundMessage,
  MotorDirection,
  MOTOR_DIRECTION_DEADTIME_MS,
  MotorProfile,
  MotorStopMode,
  MotorTarget,
  PcCommand,
  ServoProfile,
  DEFAULT_WHEEL_SPEED_LIMIT,
  angleDegToRaw,
  applyServoWheelDirection,
  buildDebugSetCommand,
  buildModeFrame,
  buildMotorConfigCommand,
  buildMotorSetCommand,
  buildMotorStopCommand,
  buildPingFrame,
  buildReadFeedbackFrame,
  buildServoMoveCommand,
  buildTorqueFrame,
  buildWheelModeSetupFrames,
  buildWritePositionFrame,
  buildWriteSpeedFrames,
  calculateWheelTurnDelta,
  clamp,
  clampServoLogicalAngle,
  isMotorDebugDisabledError,
  isMotorPcCommand,
  motorDirectionFromSpeed,
  normalizeMotorChannel,
  normalizeServoProfile,
  parseFeetechStatusPacket,
  parseServoFeedback,
  rawToAngleDeg,
  requiresMotorDirectionDeadtime,
  servoLogicalSpan,
  servoLogicalToPhysicalAngleWithReverse,
  servoPhysicalToLogicalAngleWithReverse,
  toHex,
  withCommandSeq
} from "./lib/protocol";
import {
  AppConfigSnapshot,
  AppStateSnapshotV2,
  createAppConfigSnapshot,
  createAppStateSnapshotV2,
  loadOrMigrateAppConfigSnapshot,
  normalizeAppStateSnapshotV2,
  saveAppDatabaseSnapshot,
  saveLegacyAppConfigBackup,
  PersistedActiveModule,
  PersistedLogEntry,
  PersistedServoCommandMap
} from "./lib/appDatabase";
import {
  DataProject,
  DataTelemetryEntry,
  CurrentProjectState,
  appendEvents,
  appendTelemetry,
  checkDataService,
  createProject,
  endSession,
  listProjects,
  loadCurrentProjectState,
  saveProjectState,
  selectProject,
  startSession
} from "./lib/dataService";
import {
  ServoSmoothPreset,
  createPositionTrajectory,
  createWheelSpeedTrajectory,
  isCurrentMotionGeneration,
  nextMotionGeneration,
  resolveServoMotionConfig,
  smoothStepQuintic
} from "./lib/servoMotion";
import {
  ServoSafetyMotionMode,
  ServoSafetyPreset,
  ServoSafetyRuntime,
  ServoSafetyTriggerReason,
  createServoSafetyRuntime,
  evaluateServoSafety,
  resolveServoSafetyConfig,
  updateServoSafetyTarget
} from "./lib/servoSafety";
import {
  WHEEL_SLIDER_CENTER_DEG,
  WHEEL_SLIDER_MAX_DEG,
  WHEEL_SLIDER_MIN_DEG,
  clampWheelSliderDeg,
  commandSpeedRawToWheelSliderDeg,
  normalizeWheelMaxSpeedRaw,
  wheelSliderDirection,
  wheelSliderToCommandSpeedRaw
} from "./lib/servoWheelSlider";
import {
  DEFAULT_DRIVE_CHANNELS,
  DriveBase,
  DriveInputState,
  ZERO_DRIVE_INPUT,
  combineDriveInputs,
  mixDriveTargets
} from "./lib/drive";
import {
  ControlAction,
  DEFAULT_INPUT_MAPPING,
  InputMapping,
  KEYBOARD_ACTIONS,
  cloneMapping,
  gamepadInputFromGamepad,
  keyboardInputFromPressedKeys,
  loadInputMapping,
  normalizeInputMapping,
  saveInputMapping
} from "./lib/inputMapping";
import { WebSerialClient, isSerialClientError } from "./lib/serial";
import {
  ARM_MAX_JOINT_LENGTH_PX,
  ARM_MIN_JOINT_LENGTH_PX,
  ArmConfig,
  ArmJointConfig,
  ArmSegmentPose,
  CameraConfig,
  DEFAULT_LINKAGE_MEMBER_ACC,
  DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
  DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
  MotorLinkageGroup,
  ServoLinkageGroup,
  ServoLinkageWheelDirection,
  ServoLinkageWheelTarget,
  ValidationErrorKey,
  calculateArmDragAngle,
  calculateArmSegmentPoses,
  calculateMotorLinkageTargets,
  calculateServoLinkageTargets,
  calculateServoLinkageWheelTargets,
  createDefaultArmConfig,
  loadArmConfig,
  loadCameraConfig,
  loadMotorLinkageGroups,
  loadServoLinkageGroups,
  loadMotors,
  loadServos,
  normalizeArmConfig,
  normalizeMotorLinkageGroups,
  normalizeServoLinkageGroups,
  saveArmConfig,
  saveCameraConfig,
  saveMotorLinkageGroups,
  saveServoLinkageGroups,
  saveMotors,
  saveServos,
  validateCameraConfig,
  validateMotorDraft,
  validateMotorMapping,
  validateServoDraft
} from "./lib/storage";
import { SupportedLanguage, defaultLanguage, isSupportedLanguage, saveLanguagePreference, supportedLanguages } from "./i18n/languages";
import { TB6618_MOTOR_DEBUGGER_INO_FILENAME, buildTb6618MotorDebuggerIno } from "./lib/arduinoFirmware";
import {
  FIRMWARE_BOARD_OPTIONS,
  FirmwareBoardId,
  FirmwareCompileResult,
  FirmwareHelperHealth,
  FirmwarePort,
  compileFirmware,
  isFirmwareUploadError,
  listFirmwarePorts,
  requestFirmwareHealth,
  uploadFirmware
} from "./lib/firmwareUpload";

type LogValues = Record<string, string | number | boolean>;

interface LogEntry {
  id: number;
  direction: "tx" | "rx" | "system";
  level?: "info" | "warn" | "error";
  messageKey?: string;
  text?: string;
  values?: LogValues;
}

type ActiveModule = "servo" | "arm" | "motor" | "camera" | "mapping";
type AppSection = "console" | "components" | "tests" | "settings";
type ComponentPanel = "arm" | "drive" | "camera";
type TestPanel = "servo" | "motor";
type ConnectionMode = "servo-bus" | "controller";
type ServoControlMode = "position" | "wheel";
type ServoMotionDisplayStatus = "idle" | "smoothing" | "paused";
type ServoSafetyDisplayState = "idle" | "monitoring" | "stopped";
type DatabaseSaveStatus = "loading" | "saving" | "saved" | "error" | "offline";
type MotorDebugHandshakeStatus = "unknown" | "syncing" | "ready" | "error";
type FirmwareUploadStatus = "idle" | "checking" | "loadingPorts" | "compiling" | "compiled" | "uploading" | "uploaded" | "error";
interface ServoCommandState {
  mode: ServoControlMode;
  angleDeg: string;
  speedRaw: string;
  acc: string;
  liveDragEnabled: boolean;
  reverse: boolean;
  wheelTurnsEnabled: boolean;
  wheelTurnsTarget: string;
  wheelSliderDeg: string;
}
type ServoCommandStateMap = Record<number, ServoCommandState>;
type ServoMotionStatusMap = Record<number, ServoMotionDisplayStatus>;
interface ServoSafetyDisplayStatus {
  state: ServoSafetyDisplayState;
  reason?: ServoSafetyTriggerReason;
}
type ServoSafetyStatusMap = Record<number, ServoSafetyDisplayStatus>;
interface PendingLiveAngleMove {
  servo: ServoProfile;
  state: ServoCommandState;
  angle: number;
}
interface PendingLiveWheelMove {
  servo: ServoProfile;
  state: ServoCommandState;
}
interface PendingSingleMotorMove {
  channel: string;
  speedPercent: number;
  stopMode: MotorStopMode;
  generation: number;
}
interface ArmMotionTarget {
  joint: ArmJointConfig;
  servo: ServoProfile;
  servoId: number;
  logicalAngleDeg: number;
  physicalAngleDeg: number;
  speedRaw: number;
  acc: number;
  reverse: boolean;
}
interface WheelTurnProgress {
  completedTurns: number;
  targetTurns: number;
  running: boolean;
}
interface WheelTurnRuntime {
  servo: ServoProfile;
  previousRaw?: number;
  completedTurns: number;
  targetTurns: number;
  speedRaw: number;
  polling: boolean;
  pause: () => Promise<void>;
  onComplete?: () => Promise<void>;
  onFailure?: () => Promise<void>;
}
interface MotorErrorDisplay {
  command?: string;
  code?: string;
  message: string;
}
interface PendingCommandResponse {
  command?: string;
  resolve: (message: InboundMessage | null) => void;
  timer: number;
}
interface PendingDebugSet {
  module: DebugModule;
  enabled: boolean;
}
interface ServoSafetyMonitor {
  servo: ServoProfile;
  runtime: ServoSafetyRuntime;
  affectedServoIds: number[];
  stop: () => Promise<void>;
  polling: boolean;
}
type CameraNumberField = Exclude<keyof CameraConfig, "streamUrl">;
type MotorMappingField = "pwmPin" | "in1Pin" | "in2Pin" | "enablePin" | "sensorPin";
type ServoFeedbackMap = Record<number, InboundMessage & { type: "servo.feedback" }>;
type MotorFeedbackMap = Record<string, InboundMessage & { type: "motor.feedback" }>;
type GamepadAxisName = keyof InputMapping["gamepad"]["axes"];
type GamepadButtonName = keyof InputMapping["gamepad"]["buttons"];

interface GamepadSummary {
  index: number;
  id: string;
  axes: number;
  buttons: number;
  mapping: string;
}

const defaultServoDraft = { id: "23", name: "ID23" };
const defaultMotorDraft = { channel: "M7", name: "Motor 7" };
const defaultServoCommandState: ServoCommandState = {
  mode: "position",
  angleDeg: "90",
  speedRaw: "800",
  acc: "30",
  liveDragEnabled: true,
  reverse: false,
  wheelTurnsEnabled: false,
  wheelTurnsTarget: "1",
  wheelSliderDeg: String(WHEEL_SLIDER_CENTER_DEG)
};

function createDefaultServoCommandState(): ServoCommandState {
  return { ...defaultServoCommandState };
}

function getServoCommandState(commands: ServoCommandStateMap, id: number): ServoCommandState {
  return { ...defaultServoCommandState, ...commands[id] };
}

function formatServoAngle(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function servoMotionStatusLabel(status: ServoMotionDisplayStatus): string {
  if (status === "smoothing") {
    return "平滑中";
  }
  if (status === "paused") {
    return "急停后空闲";
  }
  return "空闲";
}

function databaseStatusTone(status: DatabaseSaveStatus): "danger" | "neutral" | "online" | "warning" {
  if (status === "error") {
    return "danger";
  }
  if (status === "saving" || status === "loading" || status === "offline") {
    return "warning";
  }
  return "online";
}

function singleWheelTurnProgressKey(servoId: number): string {
  return `servo:${servoId}`;
}

function linkageWheelTurnProgressKey(groupId: string, servoId: number): string {
  return `linkage:${groupId}:${servoId}`;
}

function clampServoCommandStateToLimits(state: ServoCommandState, servo: ServoProfile): ServoCommandState {
  const logicalAngle = Number(state.angleDeg);
  const clampedAngle = clampServoLogicalAngle(servo, logicalAngle);
  const wheelSliderDeg = clampWheelSliderDeg(state.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : Number(state.wheelSliderDeg));
  const speedRaw =
    state.mode === "wheel" ? String(normalizeWheelMaxSpeedRaw(Number(state.speedRaw))) : state.speedRaw;
  return { ...state, angleDeg: formatServoAngle(clampedAngle), speedRaw, wheelSliderDeg: formatServoAngle(wheelSliderDeg) };
}

export default function App() {
  const { i18n, t } = useTranslation();
  const currentLanguage = isSupportedLanguage(i18n.language) ? i18n.language : defaultLanguage;
  const [activeSection, setActiveSection] = useState<AppSection>("console");
  const [activeComponent, setActiveComponent] = useState<ComponentPanel>("drive");
  const [activeTest, setActiveTest] = useState<TestPanel>("servo");
  const [activeModule, setActiveModule] = useState<ActiveModule>("camera");
  const [servos, setServos] = useState<ServoProfile[]>(() => loadServos());
  const [armConfig, setArmConfig] = useState<ArmConfig>(() => loadArmConfig(loadServos()));
  const [servoLinkageGroups, setServoLinkageGroups] = useState<ServoLinkageGroup[]>(() => loadServoLinkageGroups(loadServos()));
  const [motors, setMotors] = useState<MotorProfile[]>(() => loadMotors());
  const [motorLinkageGroups, setMotorLinkageGroups] = useState<MotorLinkageGroup[]>(() => loadMotorLinkageGroups(loadMotors()));
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(() => loadCameraConfig());
  const [servoDraft, setServoDraft] = useState(defaultServoDraft);
  const [motorDraft, setMotorDraft] = useState(defaultMotorDraft);
  const [servoLibraryError, setServoLibraryError] = useState<ValidationErrorKey | null>(null);
  const [motorLibraryError, setMotorLibraryError] = useState<ValidationErrorKey | null>(null);
  const [motorConfigError, setMotorConfigError] = useState<ValidationErrorKey | null>(null);
  const [cameraConfigError, setCameraConfigError] = useState<ValidationErrorKey | null>(null);
  const [cameraStreamLoaded, setCameraStreamLoaded] = useState(false);
  const [cameraStreamFailed, setCameraStreamFailed] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [motorDebugHandshakeStatus, setMotorDebugHandshakeStatusState] = useState<MotorDebugHandshakeStatus>("unknown");
  const [lastMotorError, setLastMotorError] = useState<MotorErrorDisplay | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [servoCommandById, setServoCommandById] = useState<ServoCommandStateMap>({});
  const [servoSmoothingEnabled, setServoSmoothingEnabled] = useState(true);
  const [servoSmoothPreset, setServoSmoothPreset] = useState<ServoSmoothPreset>("standard");
  const [servoMotionStatusById, setServoMotionStatusById] = useState<ServoMotionStatusMap>({});
  const [servoSafetyEnabled, setServoSafetyEnabled] = useState(true);
  const [servoSafetyPreset, setServoSafetyPreset] = useState<ServoSafetyPreset>("standard");
  const [servoSafetyStatusById, setServoSafetyStatusById] = useState<ServoSafetyStatusMap>({});
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseSaveStatus>("loading");
  const [currentProject, setCurrentProject] = useState<DataProject | null>(null);
  const [projects, setProjects] = useState<DataProject[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [lastDatabaseSavedAt, setLastDatabaseSavedAt] = useState<number | null>(null);
  const [databaseErrorMessage, setDatabaseErrorMessage] = useState("");
  const [expandedServoLinkageGroupIds, setExpandedServoLinkageGroupIds] = useState<Set<string>>(() => new Set());
  const [expandedMotorLinkageGroupIds, setExpandedMotorLinkageGroupIds] = useState<Set<string>>(() => new Set());
  const [linkageWheelDirectionByGroup, setLinkageWheelDirectionByGroup] = useState<Record<string, ServoLinkageWheelDirection | "paused">>({});
  const [motorSpeed, setMotorSpeed] = useState("0");
  const [stopMode, setStopMode] = useState<MotorStopMode>("coast");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [servoFeedback, setServoFeedback] = useState<ServoFeedbackMap>({});
  const [wheelTurnProgress, setWheelTurnProgress] = useState<Record<string, WheelTurnProgress>>({});
  const [motorFeedback, setMotorFeedback] = useState<MotorFeedbackMap>({});
  const [activeDriveBase, setActiveDriveBase] = useState<DriveBase>("tracked");
  const [driveSpeedLimit, setDriveSpeedLimit] = useState("60");
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());
  const [virtualDriveInput, setVirtualDriveInput] = useState<DriveInputState>(ZERO_DRIVE_INPUT);
  const [gamepadInput, setGamepadInput] = useState<DriveInputState>(ZERO_DRIVE_INPUT);
  const [gamepads, setGamepads] = useState<GamepadSummary[]>([]);
  const [selectedGamepadIndex, setSelectedGamepadIndex] = useState<number | "">("");
  const [inputMapping, setInputMapping] = useState<InputMapping>(() => loadInputMapping());
  const [mappingDraft, setMappingDraft] = useState<InputMapping>(() => cloneMapping(loadInputMapping()));
  const [capturingKey, setCapturingKey] = useState<ControlAction | null>(null);
  const [firmwareBoard, setFirmwareBoard] = useState<FirmwareBoardId>("arduino-uno");
  const [firmwareHelperHealth, setFirmwareHelperHealth] = useState<FirmwareHelperHealth | null>(null);
  const [firmwarePorts, setFirmwarePorts] = useState<FirmwarePort[]>([]);
  const [selectedFirmwarePort, setSelectedFirmwarePort] = useState("");
  const [firmwareJob, setFirmwareJob] = useState<FirmwareCompileResult | null>(null);
  const [firmwareStatus, setFirmwareStatus] = useState<FirmwareUploadStatus>("idle");
  const [firmwareError, setFirmwareError] = useState<string | null>(null);
  const [firmwareLogs, setFirmwareLogs] = useState("");
  const serialRef = useRef<WebSerialClient | null>(null);
  const seqRef = useRef(1);
  const logIdRef = useRef(1);
  const driveTargetsRef = useRef<MotorTarget[]>([]);
  const lastDriveCommandRef = useRef("");
  const servoSerialQueueRef = useRef<Promise<void>>(Promise.resolve());
  const liveAngleTimerRef = useRef<Record<number, number>>({});
  const liveAngleSendingRef = useRef<Record<number, boolean>>({});
  const pendingLiveAngleRef = useRef<Record<number, PendingLiveAngleMove>>({});
  const liveWheelTimerRef = useRef<Record<number, number>>({});
  const liveWheelSendingRef = useRef<Record<number, boolean>>({});
  const pendingLiveWheelRef = useRef<Record<number, PendingLiveWheelMove>>({});
  const armLiveTimerRef = useRef<number | undefined>(undefined);
  const armLiveSendingRef = useRef(false);
  const pendingArmConfigRef = useRef<ArmConfig | null>(null);
  const draggingArmJointIdRef = useRef<string | null>(null);
  const linkageLiveTimerRef = useRef<Record<string, number>>({});
  const linkageLiveSendingRef = useRef<Record<string, boolean>>({});
  const pendingLinkageMoveRef = useRef<Record<string, ServoLinkageGroup>>({});
  const servoLinkageGroupsRef = useRef<ServoLinkageGroup[]>([]);
  const motorLinkageLiveTimerRef = useRef<Record<string, number>>({});
  const motorLinkageLiveSendingRef = useRef<Record<string, boolean>>({});
  const pendingMotorLinkageMoveRef = useRef<Record<string, MotorLinkageGroup>>({});
  const motorLinkageGroupsRef = useRef<MotorLinkageGroup[]>([]);
  const motorLinkageGenerationRef = useRef<Record<string, number>>({});
  const singleMotorLiveTimerRef = useRef<number | undefined>(undefined);
  const singleMotorLiveSendingRef = useRef(false);
  const pendingSingleMotorMoveRef = useRef<PendingSingleMotorMove | null>(null);
  const singleMotorGenerationRef = useRef(0);
  const motorSerialQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastMotorSpeedByChannelRef = useRef<Record<string, number>>({});
  const pendingCommandResponseBySeqRef = useRef<Map<number, PendingCommandResponse>>(new Map());
  const servoMotionGenerationRef = useRef<Record<string, number>>({});
  const lastServoPhysicalAngleRef = useRef<Record<number, number>>({});
  const lastServoWheelSpeedRef = useRef<Record<number, number>>({});
  const wheelTurnTimerRef = useRef<Record<string, number>>({});
  const wheelTurnStateRef = useRef<Record<string, WheelTurnRuntime>>({});
  const servoSafetyTimerRef = useRef<Record<number, number>>({});
  const servoSafetyMonitorRef = useRef<Record<number, ServoSafetyMonitor>>({});
  const servoSafetySettingsRef = useRef<{ enabled: boolean; preset: ServoSafetyPreset }>({ enabled: true, preset: "standard" });
  const livePositionModeServoRef = useRef<Set<number>>(new Set());
  const gamepadInputSignatureRef = useRef("");
  const previousGamepadButtonsRef = useRef<Record<number, boolean[]>>({});
  const databaseLoadedRef = useRef(false);
  const databaseSaveTimerRef = useRef<number | undefined>(undefined);
  const currentProjectIdRef = useRef<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
  const eventQueueRef = useRef<PersistedLogEntry[]>([]);
  const telemetryQueueRef = useRef<DataTelemetryEntry[]>([]);
  const eventFlushTimerRef = useRef<number | undefined>(undefined);
  const telemetryFlushTimerRef = useRef<number | undefined>(undefined);
  const motorDebugHandshakeStatusRef = useRef<MotorDebugHandshakeStatus>("unknown");
  const motorDebugHandshakePromiseRef = useRef<Promise<boolean> | null>(null);
  const pendingDebugSetBySeqRef = useRef<Map<number, PendingDebugSet>>(new Map());

  const selectedServo = useMemo(
    () => servos.find((servo) => servo.id === selectedId),
    [selectedId, servos]
  );
  const selectedMotor = useMemo(
    () => motors.find((motor) => motor.channel === selectedChannel),
    [motors, selectedChannel]
  );
  const enabledServoLinkageGroups = useMemo(
    () => servoLinkageGroups.filter((group) => group.enabled),
    [servoLinkageGroups]
  );
  const enabledMotorLinkageGroups = useMemo(
    () => motorLinkageGroups.filter((group) => group.enabled),
    [motorLinkageGroups]
  );
  const selectedArmJoint = useMemo(
    () => armConfig.joints.find((joint) => joint.id === armConfig.selectedJointId) ?? armConfig.joints[0],
    [armConfig]
  );
  const armSegmentPoses = useMemo(
    () => calculateArmSegmentPoses(armConfig.joints, { x: 300, y: 250 }),
    [armConfig.joints]
  );
  const selectedArmFeedback = selectedArmJoint ? servoFeedback[selectedArmJoint.servoId] : undefined;

  const numericMotorSpeed = Number(motorSpeed);
  const motorDuty = Number.isFinite(numericMotorSpeed) ? Math.abs(numericMotorSpeed) : 0;
  const motorDirection = Number.isFinite(numericMotorSpeed) ? motorDirectionFromSpeed(numericMotorSpeed) : "stopped";
  const motorPreviewCommand =
    selectedMotor && Number.isFinite(numericMotorSpeed)
      ? safeMotorCommandPreview(selectedMotor.channel, numericMotorSpeed, stopMode)
      : "";
  const cameraStreamUrl = cameraConfig.streamUrl.trim();
  const cameraValidationError = validateCameraConfig(cameraConfig);
  const cameraCanCommand = connected && debugEnabled && !cameraValidationError;
  const cameraPreviewCommand = cameraValidationError ? "" : safeCameraGimbalCommandPreview(cameraConfig);
  const speedLimitPercent = Number.isFinite(Number(driveSpeedLimit)) ? clamp(Number(driveSpeedLimit), 0, 100) : 0;
  const completeMotorMappingCount = useMemo(
    () => motors.filter((motor) => validateMotorMapping(motor) === null).length,
    [motors]
  );
  const firmwareBusy = firmwareStatus === "checking" || firmwareStatus === "loadingPorts" || firmwareStatus === "compiling" || firmwareStatus === "uploading";
  const firmwareStatusTone: "neutral" | "online" | "warning" | "danger" =
    firmwareStatus === "error" ? "danger" : firmwareStatus === "compiled" || firmwareStatus === "uploaded" ? "online" : firmwareBusy ? "warning" : "neutral";
  const firmwareHelperTone: "neutral" | "online" | "warning" | "danger" =
    firmwareStatus === "checking" ? "warning" : firmwareHelperHealth?.pioAvailable ? "online" : firmwareHelperHealth ? "danger" : "neutral";
  const firmwareHelperLabel =
    firmwareStatus === "checking"
      ? t("status.syncing")
      : firmwareHelperHealth?.pioAvailable
        ? t("status.online")
        : firmwareHelperHealth
          ? t("status.offline")
          : t("status.unknown");
  const firmwareHexLabel = firmwareJob ? `${Math.max(1, Math.round(firmwareJob.hexSizeBytes / 1024))} KB` : "--";
  const canCompileFirmware = !firmwareBusy && firmwareHelperHealth?.pioAvailable === true;
  const canUploadFirmware = !firmwareBusy && Boolean(firmwareJob && selectedFirmwarePort && firmwareHelperHealth?.pioAvailable);
  const keyboardInput = useMemo(
    () => keyboardInputFromPressedKeys(pressedKeys, inputMapping.keyboard),
    [inputMapping.keyboard, pressedKeys]
  );
  const driveInput = useMemo(
    () => combineDriveInputs(combineDriveInputs(keyboardInput, gamepadInput), virtualDriveInput),
    [gamepadInput, keyboardInput, virtualDriveInput]
  );
  const driveTargets = useMemo(
    () => mixDriveTargets(activeDriveBase, driveInput, { channels: DEFAULT_DRIVE_CHANNELS, speedLimitPercent }),
    [activeDriveBase, driveInput, speedLimitPercent]
  );
  const drivePreviewCommand = safeDriveCommandPreview(driveTargets, stopMode);
  const activeGamepad = gamepads.find((gamepad) => gamepad.index === selectedGamepadIndex) ?? gamepads[0];
  const driveCanCommand = connected && debugEnabled && activeModule === "camera";
  const webSerialAvailable = typeof navigator !== "undefined" && Boolean(navigator.serial);
  const currentServoSmoothConfig = resolveServoMotionConfig(servoSmoothPreset);
  const currentServoSafetyConfig = resolveServoSafetyConfig(servoSafetyPreset);
  const activeModuleLabel =
    activeModule === "servo"
      ? t("module.servo")
      : activeModule === "arm"
        ? t("module.arm")
        : activeModule === "motor"
          ? t("module.motor")
          : activeModule === "mapping"
            ? t("module.mapping")
            : t("module.camera");
  const activeSectionLabel =
    activeSection === "console"
      ? t("sections.console")
      : activeSection === "components"
        ? t("sections.components")
        : activeSection === "tests"
          ? t("sections.tests")
          : t("sections.settings");
  const activeModuleMeta =
    activeModule === "servo"
      ? t("meta.servoCount", { count: servos.length })
      : activeModule === "arm"
        ? t("meta.armJoints", { count: armConfig.joints.length })
        : activeModule === "motor"
          ? t("meta.motorCount", { count: motors.length })
          : activeModule === "mapping"
            ? t("meta.inputMappings")
             : t("meta.cameraServos", { pan: cameraConfig.panServoId, tilt: cameraConfig.tiltServoId });
  const debugLabel = activeModule === "servo" || activeModule === "arm" ? "DIRECT" : debugEnabled ? t("status.debug") : t("status.standby");
  const motorDebugHandshakeLabel =
    motorDebugHandshakeStatus === "ready"
      ? t("status.ready")
      : motorDebugHandshakeStatus === "syncing"
        ? t("status.syncing")
        : motorDebugHandshakeStatus === "error"
          ? t("status.error")
          : t("status.unknown");
  const motorDebugHandshakeTone =
    motorDebugHandshakeStatus === "ready"
      ? "online"
      : motorDebugHandshakeStatus === "syncing"
        ? "warning"
        : motorDebugHandshakeStatus === "error"
          ? "danger"
          : "neutral";
  const lastMotorErrorLabel = lastMotorError
    ? `${lastMotorError.command ?? "motor"} · ${lastMotorError.code ?? lastMotorError.message}`
    : t("status.noError");
  const databaseStatusValue =
    databaseStatus === "loading"
      ? t("database.loading")
      : databaseStatus === "saving"
        ? t("database.saving")
        : databaseStatus === "offline"
          ? t("database.offline")
          : databaseStatus === "error"
            ? t("database.error")
            : t("database.saved");
  const projectStatusValue = currentProject?.name ?? t("database.noProject");
  const databaseDetailValue =
    databaseStatus === "offline" || databaseStatus === "error"
      ? databaseErrorMessage || t("database.localFallback")
      : lastDatabaseSavedAt
        ? new Date(lastDatabaseSavedAt).toLocaleTimeString()
        : t("database.awaitingSave");

  useEffect(() => {
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  useEffect(() => {
    let cancelled = false;

    async function loadPersistentState() {
      setDatabaseStatus("loading");
      try {
        await checkDataService();
        const current = await loadCurrentProjectState();
        if (cancelled) {
          return;
        }

        currentProjectIdRef.current = current.project.id;
        setCurrentProject(current.project);
        setProjects(await listProjects());
        setLastDatabaseSavedAt(current.stateUpdatedAt);
        setDatabaseErrorMessage("");

        if (current.state) {
          const state = mergeDataServiceRuntime(normalizeAppStateSnapshotV2(current.state), current.events, current.telemetry);
          await applyAppStateSnapshot(state);
        } else {
          const { snapshot } = await loadOrMigrateAppConfigSnapshot();
          const migratedState = createAppStateSnapshotV2({ config: snapshot });
          await saveProjectState(current.project.id, migratedState);
          await applyAppStateSnapshot(migratedState);
          setLastDatabaseSavedAt(migratedState.updatedAt);
        }

        const session = await startSession(current.project.id);
        currentSessionIdRef.current = session.id;
        databaseLoadedRef.current = true;
        setDatabaseStatus("saved");
      } catch (error) {
        if (!cancelled) {
          currentProjectIdRef.current = null;
          currentSessionIdRef.current = null;
          setCurrentProject(null);
          setProjects([]);
          setLastDatabaseSavedAt(null);
          setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.localFallback"));
          const { snapshot } = await loadOrMigrateAppConfigSnapshot();
          await applyAppStateSnapshot(createAppStateSnapshotV2({ config: snapshot }));
          databaseLoadedRef.current = true;
          setDatabaseStatus("offline");
        }
      }
    }

    void loadPersistentState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (databaseSaveTimerRef.current !== undefined) {
        window.clearTimeout(databaseSaveTimerRef.current);
      }
      flushEventQueue();
      flushTelemetryQueue();
      if (eventFlushTimerRef.current !== undefined) {
        window.clearTimeout(eventFlushTimerRef.current);
      }
      if (telemetryFlushTimerRef.current !== undefined) {
        window.clearTimeout(telemetryFlushTimerRef.current);
      }
      if (currentSessionIdRef.current) {
        void endSession(currentSessionIdRef.current);
        currentSessionIdRef.current = null;
      }
      cancelLiveAngleMove();
      cancelLiveWheelMove();
      cancelArmLiveMove();
      cancelServoLinkageMove();
      cancelMotorLinkageMove();
      cancelServoMotion();
      cancelWheelTurnMonitor();
      cancelServoSafetyMonitor();
    };
  }, []);

  useEffect(() => {
    servoLinkageGroupsRef.current = servoLinkageGroups;
  }, [servoLinkageGroups]);

  useEffect(() => {
    motorLinkageGroupsRef.current = motorLinkageGroups;
  }, [motorLinkageGroups]);

  useEffect(() => {
    saveServos(servos);
    if (selectedId === "" && servos[0]) {
      setSelectedId(servos[0].id);
    }
  }, [selectedId, servos]);

  useEffect(() => {
    setServoLinkageGroups((current) => {
      const normalized = normalizeServoLinkageGroups(current, servos);
      return JSON.stringify(normalized) === JSON.stringify(current) ? current : normalized;
    });
  }, [servos]);

  useEffect(() => {
    saveServoLinkageGroups(servoLinkageGroups, servos);
  }, [servoLinkageGroups, servos]);

  useEffect(() => {
    setArmConfig((current) => {
      const normalized = normalizeArmConfig(current, servos);
      return JSON.stringify(normalized) === JSON.stringify(current) ? current : normalized;
    });
  }, [servos]);

  useEffect(() => {
    saveArmConfig(armConfig, servos);
  }, [armConfig, servos]);

  useEffect(() => {
    setMotorLinkageGroups((current) => {
      const normalized = normalizeMotorLinkageGroups(current, motors);
      return JSON.stringify(normalized) === JSON.stringify(current) ? current : normalized;
    });
  }, [motors]);

  useEffect(() => {
    saveMotorLinkageGroups(motorLinkageGroups, motors);
  }, [motorLinkageGroups, motors]);

  useEffect(() => {
    if (!databaseLoadedRef.current) {
      return;
    }

    if (databaseSaveTimerRef.current !== undefined) {
      window.clearTimeout(databaseSaveTimerRef.current);
    }

    setDatabaseStatus("saving");
    databaseSaveTimerRef.current = window.setTimeout(() => {
      const projectId = currentProjectIdRef.current;
      if (!projectId) {
        setDatabaseStatus("offline");
        return;
      }

      const state = buildCurrentAppStateSnapshot();
      void saveProjectState(projectId, state)
        .then((result) => {
          void saveAppDatabaseSnapshot(state.config).catch(() => undefined);
          saveLegacyAppConfigBackup(state.config);
          setLastDatabaseSavedAt(result.updatedAt);
          setDatabaseErrorMessage("");
          setDatabaseStatus("saved");
        })
        .catch((error) => {
          setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
          setDatabaseStatus("error");
        });
    }, 260);
  }, [
    activeModule,
    activeDriveBase,
    cameraConfig,
    currentLanguage,
    driveSpeedLimit,
    expandedMotorLinkageGroupIds,
    expandedServoLinkageGroupIds,
    firmwareBoard,
    inputMapping,
    linkageWheelDirectionByGroup,
    motorLinkageGroups,
    motorDraft,
    motorSpeed,
    motors,
    armConfig,
    selectedChannel,
    selectedFirmwarePort,
    selectedGamepadIndex,
    selectedId,
    servoCommandById,
    servoDraft,
    servoLinkageGroups,
    servoSafetyEnabled,
    servoSafetyPreset,
    servoSmoothPreset,
    servoSmoothingEnabled,
    servos,
    stopMode,
    wheelTurnProgress
  ]);

  useEffect(() => {
    servoSafetySettingsRef.current = { enabled: servoSafetyEnabled, preset: servoSafetyPreset };
    if (!servoSafetyEnabled) {
      cancelServoSafetyMonitor();
    }
  }, [servoSafetyEnabled, servoSafetyPreset]);

  useEffect(() => {
    setServoCommandById((current) => {
      const activeIds = new Set(servos.map((servo) => servo.id));
      let changed = false;
      const next: ServoCommandStateMap = {};

      for (const servo of servos) {
        const nextState = clampServoCommandStateToLimits(current[servo.id] ?? createDefaultServoCommandState(), servo);
        next[servo.id] = nextState;
        if (!current[servo.id]) {
          changed = true;
        }
        if (current[servo.id]?.angleDeg !== nextState.angleDeg) {
          changed = true;
        }
      }

      for (const idText of Object.keys(current)) {
        if (!activeIds.has(Number(idText))) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [servos]);

  useEffect(() => {
    saveMotors(motors);
    if (!selectedChannel && motors[0]) {
      setSelectedChannel(motors[0].channel);
    }
  }, [motors, selectedChannel]);

  useEffect(() => {
    setCameraStreamLoaded(false);
    setCameraStreamFailed(false);
  }, [cameraConfig.streamUrl]);

  useEffect(() => {
    driveTargetsRef.current = driveTargets;
  }, [driveTargets]);

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

      if (event.repeat || activeModule !== "camera") {
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
  }, [activeModule, capturingKey, inputMapping.keyboard]);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
      return;
    }

    let frameId = 0;
    let lastSummaryAt = 0;

    function pollGamepads(time: number) {
      const pads = Array.from(navigator.getGamepads()).filter((gamepad): gamepad is Gamepad => Boolean(gamepad));
      const selectedPad =
        selectedGamepadIndex === ""
          ? pads[0]
          : pads.find((gamepad) => gamepad.index === selectedGamepadIndex);
      const nextInput = gamepadInputFromGamepad(selectedPad, inputMapping.gamepad);
      const inputSignature = JSON.stringify(nextInput);
      if (inputSignature !== gamepadInputSignatureRef.current) {
        gamepadInputSignatureRef.current = inputSignature;
        setGamepadInput(nextInput);
      }

      if (selectedPad && activeModule === "camera") {
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
            mapping: gamepad.mapping || "unknown"
          }))
        );
      }

      frameId = window.requestAnimationFrame(pollGamepads);
    }

    frameId = window.requestAnimationFrame(pollGamepads);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeModule, inputMapping.gamepad, selectedGamepadIndex]);

  useEffect(() => {
    if (!driveInput.stop) {
      return;
    }
    void stopAllMotors(true);
  }, [driveInput.stop]);

  useEffect(() => {
    if (activeModule !== "camera") {
      lastDriveCommandRef.current = "";
      setPressedKeys(new Set());
      void stopAllMotors(true);
    }
  }, [activeModule]);

  useEffect(() => {
    function handleBlur() {
      setPressedKeys(new Set());
      void stopAllMotors(true);
    }

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [connected, stopMode]);

  useEffect(() => {
    if (activeModule !== "camera" || !connected) {
      return;
    }

    const timer = window.setInterval(async () => {
      const targets = driveTargetsRef.current;
      const signature = JSON.stringify({ stopMode, targets });
      if (signature === lastDriveCommandRef.current) {
        return;
      }

      lastDriveCommandRef.current = signature;
      try {
        await sendMotorCommandBatch(targets.map((target) => buildMotorSetCommand(nextSeq(), { ...target, stopMode })));
      } catch {
        addSystemLog("logs.driveCommandInvalid", "error");
      }
    }, 120);

    return () => window.clearInterval(timer);
  }, [activeModule, connected, stopMode]);

  useEffect(() => {
    if (activeModule !== "camera" || !cameraCanCommand || (driveInput.cameraPan === 0 && driveInput.cameraTilt === 0)) {
      return;
    }

    const moveCameraFromInput = () => {
      void nudgeCamera(driveInput.cameraPan * cameraConfig.stepDeg, driveInput.cameraTilt * cameraConfig.stepDeg);
    };

    moveCameraFromInput();
    const timer = window.setInterval(moveCameraFromInput, 220);
    return () => window.clearInterval(timer);
  }, [
    activeModule,
    cameraCanCommand,
    cameraConfig.panAngleDeg,
    cameraConfig.stepDeg,
    cameraConfig.tiltAngleDeg,
    driveInput.cameraPan,
    driveInput.cameraTilt
  ]);

  useEffect(() => {
    void checkFirmwareHelper(false);
  }, []);

  function addLog(direction: LogEntry["direction"], text: string, level: LogEntry["level"] = "info") {
    const entry: LogEntry = { id: logIdRef.current++, direction, text, level };
    setLogs((current) => [entry, ...current].slice(0, 120));
    queueEventLog(entry);
  }

  function addSystemLog(messageKey: string, level: LogEntry["level"] = "info", values?: LogValues) {
    const entry: LogEntry = { id: logIdRef.current++, direction: "system", messageKey, level, values };
    setLogs((current) => [entry, ...current].slice(0, 120));
    queueEventLog(entry);
  }

  function queueEventLog(entry: LogEntry) {
    if (!currentSessionIdRef.current) {
      return;
    }
    eventQueueRef.current.push({ ...persistLogEntry(entry), createdAt: Date.now() });
    scheduleEventFlush();
  }

  function queueTelemetry(item: DataTelemetryEntry) {
    if (!currentSessionIdRef.current) {
      return;
    }
    telemetryQueueRef.current.push({ ...item, createdAt: item.createdAt ?? Date.now() });
    scheduleTelemetryFlush();
  }

  function scheduleEventFlush() {
    if (eventFlushTimerRef.current !== undefined) {
      return;
    }
    eventFlushTimerRef.current = window.setTimeout(() => {
      eventFlushTimerRef.current = undefined;
      flushEventQueue();
    }, 700);
  }

  function scheduleTelemetryFlush() {
    if (telemetryFlushTimerRef.current !== undefined) {
      return;
    }
    telemetryFlushTimerRef.current = window.setTimeout(() => {
      telemetryFlushTimerRef.current = undefined;
      flushTelemetryQueue();
    }, 900);
  }

  function flushEventQueue() {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId || eventQueueRef.current.length === 0) {
      return;
    }
    const events = eventQueueRef.current.splice(0, eventQueueRef.current.length);
    void appendEvents(sessionId, events).catch((error) => {
      eventQueueRef.current.unshift(...events.slice(-200));
      setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
      setDatabaseStatus("error");
    });
  }

  function flushTelemetryQueue() {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId || telemetryQueueRef.current.length === 0) {
      return;
    }
    const telemetry = telemetryQueueRef.current.splice(0, telemetryQueueRef.current.length);
    void appendTelemetry(sessionId, telemetry).catch((error) => {
      telemetryQueueRef.current.unshift(...telemetry.slice(-300));
      setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
      setDatabaseStatus("error");
    });
  }

  function rememberServoFeedback(feedback: InboundMessage & { type: "servo.feedback" }) {
    setServoFeedback((current) => ({ ...current, [feedback.id]: feedback }));
    if (feedback.positionRaw !== undefined) {
      lastServoPhysicalAngleRef.current[feedback.id] = rawToAngleDeg(feedback.positionRaw);
    }
    if (feedback.speedRaw !== undefined) {
      lastServoWheelSpeedRef.current[feedback.id] = feedback.speedRaw;
    }
    queueTelemetry({
      category: "servo",
      targetId: String(feedback.id),
      payload: feedback as unknown as Record<string, unknown>
    });
  }

  function rememberMotorFeedback(message: InboundMessage & { type: "motor.feedback" }) {
    const channel = normalizeMotorChannel(message.channel);
    setMotorFeedback((current) => ({ ...current, [channel]: message }));
    queueTelemetry({
      category: "motor",
      targetId: channel,
      payload: { ...message, channel }
    });
  }

  function addErrorLog(error: unknown, fallbackKey: string) {
    if (isSerialClientError(error)) {
      addSystemLog(`serial.errors.${error.code}`, "error");
      return;
    }
    if (error instanceof Error && error.message) {
      addLog("system", error.message, "error");
      return;
    }
    addSystemLog(fallbackKey, "error");
  }

  function setFirmwareFailure(error: unknown) {
    const message = isFirmwareUploadError(error) ? error.message : error instanceof Error && error.message ? error.message : t("firmware.errors.requestFailed");
    setFirmwareError(message);
    setFirmwareLogs(isFirmwareUploadError(error) && error.logs ? error.logs : message);
    setFirmwareStatus("error");
    addLog("system", message, "error");
  }

  async function checkFirmwareHelper(log = true): Promise<FirmwareHelperHealth | null> {
    setFirmwareStatus("checking");
    setFirmwareError(null);
    try {
      const health = await requestFirmwareHealth();
      setFirmwareHelperHealth(health);
      setFirmwareStatus(health.pioAvailable ? "idle" : "error");
      setFirmwareError(health.pioAvailable ? null : t("firmware.errors.platformioMissing"));
      if (log) {
        addSystemLog(health.pioAvailable ? "logs.firmwareHelperReady" : "logs.firmwareHelperMissing", health.pioAvailable ? "info" : "warn");
      }
      return health;
    } catch (error) {
      setFirmwareHelperHealth(null);
      setFirmwareStatus("error");
      setFirmwareError(t("firmware.errors.helperUnavailable"));
      setFirmwareLogs(isFirmwareUploadError(error) && error.logs ? error.logs : "");
      if (log) {
        addSystemLog("logs.firmwareHelperUnavailable", "warn");
      }
      return null;
    }
  }

  async function ensureFirmwareHelperAvailable(): Promise<boolean> {
    if (firmwareHelperHealth?.pioAvailable) {
      return true;
    }
    const health = await checkFirmwareHelper(false);
    if (!health?.pioAvailable) {
      setFirmwareStatus("error");
      setFirmwareError(health ? t("firmware.errors.platformioMissing") : t("firmware.errors.helperUnavailable"));
      addSystemLog(health ? "logs.firmwareHelperMissing" : "logs.firmwareHelperUnavailable", "warn");
      return false;
    }
    return true;
  }

  async function refreshFirmwarePorts() {
    if (!(await ensureFirmwareHelperAvailable())) {
      return;
    }

    setFirmwareStatus("loadingPorts");
    setFirmwareError(null);
    try {
      const ports = await listFirmwarePorts();
      setFirmwarePorts(ports);
      setSelectedFirmwarePort((current) => (ports.some((port) => port.path === current) ? current : ports[0]?.path ?? ""));
      setFirmwareStatus("idle");
      addSystemLog("logs.firmwarePortsRefreshed", "info", { count: ports.length });
    } catch (error) {
      setFirmwareFailure(error);
    }
  }

  async function compileArduinoFirmware() {
    if (completeMotorMappingCount === 0) {
      setFirmwareStatus("error");
      setFirmwareError(t("firmware.errors.noCompleteMapping"));
      addSystemLog("logs.firmwareNoCompleteMapping", "warn");
      return;
    }
    if (!(await ensureFirmwareHelperAvailable())) {
      return;
    }

    setFirmwareStatus("compiling");
    setFirmwareError(null);
    setFirmwareJob(null);
    try {
      const result = await compileFirmware({
        board: firmwareBoard,
        source: buildTb6618MotorDebuggerIno(motors)
      });
      setFirmwareJob(result);
      setFirmwareLogs(result.logs);
      setFirmwareStatus("compiled");
      addSystemLog("logs.firmwareCompileComplete", "info", { size: result.hexSizeBytes });
    } catch (error) {
      setFirmwareFailure(error);
    }
  }

  async function uploadCompiledArduinoFirmware() {
    if (!firmwareJob) {
      addSystemLog("logs.firmwareCompileFirst", "warn");
      return;
    }
    if (!selectedFirmwarePort) {
      addSystemLog("logs.firmwareSelectPort", "warn");
      return;
    }
    if (!(await ensureFirmwareHelperAvailable())) {
      return;
    }

    setFirmwareStatus("uploading");
    setFirmwareError(null);
    try {
      if (connected && connectionMode === "controller") {
        await disconnectSerial();
      }
      const result = await uploadFirmware({ jobId: firmwareJob.jobId, port: selectedFirmwarePort });
      setFirmwareJob(null);
      setFirmwareLogs(result.logs);
      setFirmwareStatus("uploaded");
      addSystemLog("logs.firmwareUploadComplete");
    } catch (error) {
      setFirmwareFailure(error);
    }
  }

  function servoSafetyReasonLabel(reason?: ServoSafetyTriggerReason) {
    return reason ? t(`safety.reasons.${reason}`) : "--";
  }

  function servoSafetyStatusLabel(status?: ServoSafetyDisplayStatus) {
    if (!servoSafetyEnabled) {
      return t("safety.disabled");
    }
    if (status?.state === "monitoring") {
      return t("safety.monitoring");
    }
    if (status?.state === "stopped") {
      return `${t("safety.stopped")} · ${servoSafetyReasonLabel(status.reason)}`;
    }
    return t("safety.ready");
  }

  function servoSafetyStatusTone(status?: ServoSafetyDisplayStatus): "neutral" | "online" | "warning" | "danger" {
    if (!servoSafetyEnabled) {
      return "neutral";
    }
    if (status?.state === "stopped") {
      return "danger";
    }
    if (status?.state === "monitoring") {
      return "warning";
    }
    return "online";
  }

  function nextSeq() {
    return seqRef.current++;
  }

  async function applyAppConfigSnapshot(snapshot: AppConfigSnapshot) {
    setServos(snapshot.servos);
    setServoLinkageGroups(snapshot.servoLinkageGroups);
    setServoCommandById(snapshot.servoCommands as ServoCommandStateMap);
    setServoSmoothingEnabled(snapshot.servoSmoothing.enabled);
    setServoSmoothPreset(snapshot.servoSmoothing.preset);
    setServoSafetyEnabled(snapshot.servoSafety.enabled);
    setServoSafetyPreset(snapshot.servoSafety.preset);
    setMotors(snapshot.motors);
    setMotorLinkageGroups(snapshot.motorLinkageGroups);
    setArmConfig(snapshot.armConfig);
    setCameraConfig(snapshot.cameraConfig);
    setInputMapping(snapshot.inputMapping);
    setMappingDraft(cloneMapping(snapshot.inputMapping));
    setActiveModule(snapshot.lastActiveModule);
    setSelectedId(snapshot.servos[0]?.id ?? "");
    setSelectedChannel(snapshot.motors[0]?.channel ?? "");
    if (snapshot.language !== currentLanguage) {
      saveLanguagePreference(snapshot.language);
      await i18n.changeLanguage(snapshot.language);
    }
  }

  async function applyAppStateSnapshot(snapshot: AppStateSnapshotV2) {
    const state = normalizeAppStateSnapshotV2(snapshot);
    await applyAppConfigSnapshot(state.config);

    setActiveModule(state.ui.activeModule);
    setSelectedId(state.ui.selectedServoId);
    setSelectedChannel(state.ui.selectedMotorChannel);
    setExpandedServoLinkageGroupIds(new Set(state.ui.expandedServoLinkageGroupIds));
    setExpandedMotorLinkageGroupIds(new Set(state.ui.expandedMotorLinkageGroupIds));
    setLinkageWheelDirectionByGroup(state.ui.linkageWheelDirectionByGroup);
    setServoDraft(state.ui.servoDraft);
    setMotorDraft(state.ui.motorDraft);
    setMotorSpeed(state.ui.motorSpeed);
    setStopMode(state.ui.stopMode);
    setActiveDriveBase(state.ui.activeDriveBase);
    setDriveSpeedLimit(state.ui.driveSpeedLimit);
    setSelectedGamepadIndex(state.ui.selectedGamepadIndex);
    setFirmwareBoard(FIRMWARE_BOARD_OPTIONS.some((board) => board.id === state.ui.firmwareBoard) ? (state.ui.firmwareBoard as FirmwareBoardId) : "arduino-uno");
    setSelectedFirmwarePort(state.ui.selectedFirmwarePort);
    setLogs(restoreLogEntries(state.runtime.logs));
    setServoFeedback(state.runtime.servoFeedback as ServoFeedbackMap);
    setMotorFeedback(state.runtime.motorFeedback as MotorFeedbackMap);
    setWheelTurnProgress(state.runtime.wheelTurnProgress as unknown as Record<string, WheelTurnProgress>);
    setLastMotorError(state.runtime.lastMotorError as MotorErrorDisplay | null);
  }

  function buildCurrentAppConfigSnapshot() {
    return createAppConfigSnapshot({
      servos,
      servoCommands: servoCommandById as PersistedServoCommandMap,
      servoLinkageGroups,
      servoSmoothing: {
        enabled: servoSmoothingEnabled,
        preset: servoSmoothPreset
      },
      servoSafety: {
        enabled: servoSafetyEnabled,
        preset: servoSafetyPreset
      },
      motors,
      motorLinkageGroups,
      armConfig,
      cameraConfig,
      inputMapping,
      language: currentLanguage,
      lastActiveModule: activeModule as PersistedActiveModule
    });
  }

  function buildCurrentAppStateSnapshot() {
    return createAppStateSnapshotV2({
      config: buildCurrentAppConfigSnapshot(),
      ui: {
        activeModule: activeModule as PersistedActiveModule,
        selectedServoId: selectedId,
        selectedMotorChannel: selectedChannel,
        expandedServoLinkageGroupIds: Array.from(expandedServoLinkageGroupIds),
        expandedMotorLinkageGroupIds: Array.from(expandedMotorLinkageGroupIds),
        linkageWheelDirectionByGroup,
        servoDraft,
        motorDraft,
        motorSpeed,
        stopMode,
        activeDriveBase,
        driveSpeedLimit,
        selectedGamepadIndex,
        firmwareBoard,
        selectedFirmwarePort
      },
      runtime: {
        stale: false,
        logs: logs.map(persistLogEntry),
        servoFeedback: servoFeedback as unknown as Record<string, Record<string, unknown>>,
        motorFeedback: motorFeedback as unknown as Record<string, Record<string, unknown>>,
        wheelTurnProgress: wheelTurnProgress as unknown as Record<string, Record<string, unknown>>,
        lastMotorError: lastMotorError as unknown as Record<string, unknown> | null
      }
    });
  }

  function mergeDataServiceRuntime(state: AppStateSnapshotV2, events: PersistedLogEntry[], telemetry: DataTelemetryEntry[]): AppStateSnapshotV2 {
    const runtime = {
      ...state.runtime,
      stale: true,
      logs: events.length > 0 ? events : state.runtime.logs,
      servoFeedback: { ...state.runtime.servoFeedback },
      motorFeedback: { ...state.runtime.motorFeedback }
    };

    for (const item of telemetry) {
      if (item.category === "servo") {
        runtime.servoFeedback[item.targetId] = item.payload;
      }
      if (item.category === "motor") {
        runtime.motorFeedback[item.targetId] = item.payload;
      }
    }

    return { ...state, runtime };
  }

  async function activateProjectPayload(payload: CurrentProjectState, fallbackState?: AppStateSnapshotV2) {
    const previousSessionId = currentSessionIdRef.current;
    if (previousSessionId) {
      flushEventQueue();
      flushTelemetryQueue();
      void endSession(previousSessionId).catch(() => undefined);
      currentSessionIdRef.current = null;
    }

    currentProjectIdRef.current = payload.project.id;
    setCurrentProject(payload.project);
    setProjects(await listProjects());
    setLastDatabaseSavedAt(payload.stateUpdatedAt);
    setDatabaseErrorMessage("");

    const state = payload.state
      ? mergeDataServiceRuntime(normalizeAppStateSnapshotV2(payload.state), payload.events, payload.telemetry)
      : fallbackState ?? createAppStateSnapshotV2({ config: buildCurrentAppConfigSnapshot() });
    if (!payload.state) {
      const result = await saveProjectState(payload.project.id, state);
      setLastDatabaseSavedAt(result.updatedAt);
    }
    await applyAppStateSnapshot(state);

    const session = await startSession(payload.project.id);
    currentSessionIdRef.current = session.id;
    databaseLoadedRef.current = true;
    setDatabaseStatus("saved");
  }

  async function changeCurrentProject(projectId: string) {
    if (!projectId || projectId === currentProject?.id || databaseStatus === "offline") {
      return;
    }
    setDatabaseStatus("loading");
    try {
      await activateProjectPayload(await selectProject(projectId));
    } catch (error) {
      setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
      setDatabaseStatus("error");
    }
  }

  async function createNewProject() {
    const name = newProjectName.trim();
    if (!name || databaseStatus === "offline") {
      return;
    }
    setDatabaseStatus("saving");
    try {
      const payload = await createProject(name);
      const state = buildCurrentAppStateSnapshot();
      const result = await saveProjectState(payload.project.id, state);
      setNewProjectName("");
      await activateProjectPayload({ ...payload, state, stateUpdatedAt: result.updatedAt }, state);
    } catch (error) {
      setDatabaseErrorMessage(error instanceof Error && error.message ? error.message : t("database.error"));
      setDatabaseStatus("error");
    }
  }

  function restoreLogEntries(entries: PersistedLogEntry[]): LogEntry[] {
    return entries.slice(0, 120).map((entry) => {
      const id = logIdRef.current++;
      return {
        id,
        direction: entry.direction,
        level: entry.level,
        messageKey: entry.messageKey,
        text: entry.text,
        values: entry.values
      };
    });
  }

  function persistLogEntry(entry: LogEntry): PersistedLogEntry {
    return {
      direction: entry.direction,
      level: entry.level,
      messageKey: entry.messageKey,
      text: entry.text,
      values: entry.values,
      createdAt: Date.now()
    };
  }

  async function send(value: unknown, options: { log?: boolean } = {}) {
    if (!serialRef.current || !connected) {
      addSystemLog("logs.serialDisconnected", "warn");
      return false;
    }
    if (connectionMode === "servo-bus") {
      addLog("system", "舵机直连模式使用飞特二进制帧，不发送 JSON", "warn");
      return false;
    }

    try {
      await serialRef.current.sendJson(value);
      if (options.log !== false) {
        addLog("tx", JSON.stringify(value));
      }
      return true;
    } catch (error) {
      addErrorLog(error, "logs.serialDisconnected");
      return false;
    }
  }

  function setMotorDebugHandshakeStatus(status: MotorDebugHandshakeStatus) {
    motorDebugHandshakeStatusRef.current = status;
    setMotorDebugHandshakeStatusState(status);
  }

  function clearPendingCommandResponses() {
    for (const pending of pendingCommandResponseBySeqRef.current.values()) {
      window.clearTimeout(pending.timer);
      pending.resolve(null);
    }
    pendingCommandResponseBySeqRef.current.clear();
  }

  function resetMotorDebugHandshake(clearError = true) {
    motorDebugHandshakePromiseRef.current = null;
    pendingDebugSetBySeqRef.current.clear();
    clearPendingCommandResponses();
    motorSerialQueueRef.current = Promise.resolve();
    setMotorDebugHandshakeStatus("unknown");
    if (clearError) {
      setLastMotorError(null);
    }
  }

  function handleMotorFirmwareReadyLog() {
    motorDebugHandshakePromiseRef.current = null;
    setMotorDebugHandshakeStatus("unknown");
  }

  function resolvePendingCommandResponse(message: InboundMessage) {
    const pending = pendingCommandResponseBySeqRef.current.get(message.seq ?? -1);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timer);
    pendingCommandResponseBySeqRef.current.delete(message.seq ?? -1);
    pending.resolve(message);
  }

  function waitForCommandResponse(command: PcCommand, timeoutMs = 900) {
    return new Promise<InboundMessage | null>((resolve) => {
      const timer = window.setTimeout(() => {
        pendingCommandResponseBySeqRef.current.delete(command.seq);
        resolve(null);
      }, timeoutMs);
      pendingCommandResponseBySeqRef.current.set(command.seq, {
        command: command.type,
        resolve,
        timer
      });
    });
  }

  function clearPendingCommandResponse(command: PcCommand) {
    const pending = pendingCommandResponseBySeqRef.current.get(command.seq);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timer);
    pendingCommandResponseBySeqRef.current.delete(command.seq);
  }

  async function writeCommandAndWait(command: PcCommand, options: { log?: boolean } = {}) {
    if (!serialRef.current || !connected) {
      if (options.log !== false) {
        addSystemLog("logs.serialDisconnected", "warn");
      }
      return null;
    }
    if (connectionMode === "servo-bus") {
      if (options.log !== false) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return null;
    }

    const responsePromise = waitForCommandResponse(command);
    try {
      await serialRef.current.sendJson(command);
      if (options.log !== false) {
        addLog("tx", JSON.stringify(command));
      }
    } catch (error) {
      clearPendingCommandResponse(command);
      addErrorLog(error, "logs.serialDisconnected");
      return null;
    }

    const response = await responsePromise;
    if (!response && options.log !== false) {
      addSystemLog("logs.motorCommandTimeout", "warn", { command: command.type });
    }
    return response;
  }

  async function writeCommandsAndWait(commands: PcCommand[], options: { log?: boolean } = {}) {
    if (!serialRef.current || !connected) {
      if (options.log !== false) {
        addSystemLog("logs.serialDisconnected", "warn");
      }
      return commands.map(() => null);
    }
    if (connectionMode === "servo-bus") {
      if (options.log !== false) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return commands.map(() => null);
    }

    const responsePromises = commands.map((command) => waitForCommandResponse(command));
    try {
      for (const command of commands) {
        await serialRef.current.sendJson(command);
        if (options.log !== false) {
          addLog("tx", JSON.stringify(command));
        }
      }
    } catch (error) {
      for (const command of commands) {
        clearPendingCommandResponse(command);
      }
      addErrorLog(error, "logs.serialDisconnected");
      return commands.map(() => null);
    }

    const responses = await Promise.all(responsePromises);
    if (options.log !== false) {
      for (const [index, response] of responses.entries()) {
        if (!response) {
          addSystemLog("logs.motorCommandTimeout", "warn", { command: commands[index].type });
        }
      }
    }
    return responses;
  }

  function enqueueMotorSerialTask<T>(task: () => Promise<T>): Promise<T> {
    const run = motorSerialQueueRef.current.then(task, task);
    motorSerialQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function writeDebugSetToClient(client: WebSerialClient, module: ActiveModule, enabled: boolean, options: { log?: boolean } = {}) {
    const debugModule = debugModuleFor(module);
    const command = buildDebugSetCommand(nextSeq(), debugModule, enabled);
    pendingDebugSetBySeqRef.current.set(command.seq, { module: debugModule, enabled });

    if (debugModule === "motor") {
      setMotorDebugHandshakeStatus(enabled ? "syncing" : "unknown");
      if (enabled) {
        setLastMotorError(null);
      }
    }

    const responsePromise = waitForCommandResponse(command);
    try {
      await client.sendJson(command);
      if (options.log !== false) {
        addLog("tx", JSON.stringify(command));
      }
    } catch (error) {
      const pending = pendingCommandResponseBySeqRef.current.get(command.seq);
      if (pending) {
        window.clearTimeout(pending.timer);
        pendingCommandResponseBySeqRef.current.delete(command.seq);
      }
      pendingDebugSetBySeqRef.current.delete(command.seq);
      if (debugModule === "motor" && enabled) {
        setMotorDebugHandshakeStatus("error");
      }
      addErrorLog(error, "logs.serialDisconnected");
      return false;
    }

    const response = await responsePromise;
    return response?.type === "ack";
  }

  async function sendDebugSet(module: ActiveModule, enabled: boolean, options: { log?: boolean } = {}) {
    if (!serialRef.current || !connected) {
      if (options.log !== false) {
        addSystemLog("logs.serialDisconnected", "warn");
      }
      return false;
    }
    if (connectionMode === "servo-bus") {
      if (options.log !== false) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }
    if (debugModuleFor(module) === "motor") {
      return enqueueMotorSerialTask(() => writeDebugSetToClient(serialRef.current!, module, enabled, options));
    }
    return writeDebugSetToClient(serialRef.current, module, enabled, options);
  }

  async function ensureMotorDebugModeUnlocked(options: { log?: boolean } = {}) {
    if (!serialRef.current || !connected || connectionMode === "servo-bus") {
      if (options.log !== false) {
        addSystemLog("logs.serialDisconnected", "warn");
      }
      return false;
    }
    if (motorDebugHandshakeStatusRef.current === "ready") {
      return true;
    }
    if (motorDebugHandshakeStatusRef.current === "syncing") {
      return motorDebugHandshakePromiseRef.current ? motorDebugHandshakePromiseRef.current : true;
    }

    setDebugEnabled(true);
    const promise = writeDebugSetToClient(serialRef.current, "motor", true, options).finally(() => {
      motorDebugHandshakePromiseRef.current = null;
    });
    motorDebugHandshakePromiseRef.current = promise;
    return promise;
  }

  function rememberMotorCommandSuccess(command: PcCommand) {
    if (command.type === "motor.set" && typeof command.channel === "string" && typeof command.speedPercent === "number") {
      lastMotorSpeedByChannelRef.current[normalizeMotorChannel(command.channel)] = command.speedPercent;
      return;
    }
    if (command.type === "motor.stop") {
      if (command.all) {
        for (const motor of motors) {
          lastMotorSpeedByChannelRef.current[normalizeMotorChannel(motor.channel)] = 0;
        }
      } else if (typeof command.channel === "string") {
        lastMotorSpeedByChannelRef.current[normalizeMotorChannel(command.channel)] = 0;
      }
    }
  }

  async function sendMotorCommandFrameUnlocked(command: PcCommand, options: { log?: boolean } = {}, retryCount = 0): Promise<boolean> {
    const response = await writeCommandAndWait(command, options);
    if (!response) {
      return false;
    }
    if (isMotorDebugDisabledError(response) && retryCount < 1) {
      if (options.log !== false) {
        addSystemLog("logs.motorDebugAutoRecover", "warn");
      }
      setMotorDebugHandshakeStatus("unknown");
      const ready = await ensureMotorDebugModeUnlocked(options);
      if (!ready) {
        setMotorDebugHandshakeStatus("error");
        return false;
      }
      return sendMotorCommandFrameUnlocked(withCommandSeq(command, nextSeq()), options, retryCount + 1);
    }
    if (response.type === "error") {
      recordMotorError(response);
      if (isMotorDebugDisabledError(response)) {
        setMotorDebugHandshakeStatus("error");
        addSystemLog("logs.motorDebugRetryFailed", "error");
      }
      return false;
    }

    rememberMotorCommandSuccess(command);
    return true;
  }

  async function sendMotorCommandFramesUnlocked(commands: PcCommand[], options: { log?: boolean } = {}, retryCount = 0): Promise<number> {
    if (commands.length === 0) {
      return 0;
    }

    const responses = await writeCommandsAndWait(commands, options);
    if (responses.every((response) => response === null)) {
      return 0;
    }

    if (responses.some((response) => response !== null && isMotorDebugDisabledError(response)) && retryCount < 1) {
      if (options.log !== false) {
        addSystemLog("logs.motorDebugAutoRecover", "warn");
      }
      setMotorDebugHandshakeStatus("unknown");
      const ready = await ensureMotorDebugModeUnlocked(options);
      if (!ready) {
        setMotorDebugHandshakeStatus("error");
        return 0;
      }
      return sendMotorCommandFramesUnlocked(
        commands.map((command) => withCommandSeq(command, nextSeq())),
        options,
        retryCount + 1
      );
    }

    let sentCount = 0;
    for (const [index, response] of responses.entries()) {
      if (!response) {
        continue;
      }
      if (response.type === "error") {
        recordMotorError(response);
        if (isMotorDebugDisabledError(response)) {
          setMotorDebugHandshakeStatus("error");
          addSystemLog("logs.motorDebugRetryFailed", "error");
        }
        continue;
      }

      rememberMotorCommandSuccess(commands[index]);
      sentCount += 1;
    }
    return sentCount;
  }

  function motorSetDirectionChange(command: PcCommand) {
    if (command.type !== "motor.set" || typeof command.channel !== "string" || typeof command.speedPercent !== "number") {
      return null;
    }

    const channel = normalizeMotorChannel(command.channel);
    const previousSpeed = lastMotorSpeedByChannelRef.current[channel];
    return requiresMotorDirectionDeadtime(previousSpeed, command.speedPercent)
      ? { channel, previousSpeed: previousSpeed ?? 0, nextSpeed: command.speedPercent }
      : null;
  }

  async function sendMotorCommandBatchUnlocked(commands: PcCommand[], options: { log?: boolean; shouldRun?: () => boolean } = {}) {
    const motorCommands = commands.filter(isMotorPcCommand);
    if (motorCommands.length === 0) {
      return false;
    }
    if (options.shouldRun && !options.shouldRun()) {
      return false;
    }

    const ready = await ensureMotorDebugModeUnlocked(options);
    if (!ready) {
      return false;
    }
    if (options.shouldRun && !options.shouldRun()) {
      return false;
    }

    const directionChanges: Array<{ command: PcCommand; change: { channel: string; previousSpeed: number; nextSpeed: number } }> = [];
    for (const command of motorCommands) {
      const change = motorSetDirectionChange(command);
      if (change) {
        directionChanges.push({ command, change });
      }
    }

    if (directionChanges.length > 0) {
      const stopCommands: PcCommand[] = [];
      for (const { change } of directionChanges) {
        if (options.shouldRun && !options.shouldRun()) {
          return false;
        }
        if (options.log !== false) {
          addSystemLog("logs.motorDirectionDeadtime", "info", { channel: change.channel });
        }
        stopCommands.push(buildMotorStopCommand(nextSeq(), { channel: change.channel, stopMode: "coast" }));
      }
      const stoppedCount = await sendMotorCommandFramesUnlocked(stopCommands, options);
      if (stoppedCount < stopCommands.length) {
        return false;
      }
      await sleepMs(MOTOR_DIRECTION_DEADTIME_MS);
      if (options.shouldRun && !options.shouldRun()) {
        return false;
      }
    }

    if (options.shouldRun && !options.shouldRun()) {
      return false;
    }
    const sentCount = await sendMotorCommandFramesUnlocked(motorCommands, options);
    return sentCount > 0;
  }

  async function sendMotorCommandBatch(commands: PcCommand[], options: { log?: boolean; shouldRun?: () => boolean } = {}) {
    return enqueueMotorSerialTask(() => sendMotorCommandBatchUnlocked(commands, options));
  }

  async function sendMotorCommand(command: PcCommand, options: { log?: boolean; retryCount?: number } = {}) {
    if (!isMotorPcCommand(command)) {
      return send(command, options);
    }
    setLastMotorError(null);
    return sendMotorCommandBatch([command], options);
  }

  function recordMotorError(message: InboundMessage & { type: "error" }) {
    setLastMotorError({
      command: message.command,
      code: message.code,
      message: message.message
    });
  }

  function handleAckMessage(message: InboundMessage & { type: "ack" }) {
    resolvePendingCommandResponse(message);
    const pendingDebugSet = pendingDebugSetBySeqRef.current.get(message.seq);
    if (pendingDebugSet) {
      pendingDebugSetBySeqRef.current.delete(message.seq);
      if (pendingDebugSet.module === "motor") {
        setMotorDebugHandshakeStatus(pendingDebugSet.enabled ? "ready" : "unknown");
        if (pendingDebugSet.enabled) {
          setLastMotorError(null);
        }
      }
    }

    if (message.command?.startsWith("motor.")) {
      setLastMotorError(null);
    }
  }

  function handleErrorMessage(message: InboundMessage & { type: "error" }) {
    resolvePendingCommandResponse(message);
    const pendingDebugSet = pendingDebugSetBySeqRef.current.get(message.seq);
    if (pendingDebugSet) {
      pendingDebugSetBySeqRef.current.delete(message.seq);
      if (pendingDebugSet.module === "motor" && pendingDebugSet.enabled) {
        setMotorDebugHandshakeStatus("error");
        recordMotorError(message);
      }
      return;
    }

    if (isMotorDebugDisabledError(message)) {
      recordMotorError(message);
      setMotorDebugHandshakeStatus("unknown");
      return;
    }

    if (message.command?.startsWith("motor.")) {
      recordMotorError(message);
    }
  }

  function enqueueServoSerialTask<T>(task: () => Promise<T>): Promise<T> {
    const run = servoSerialQueueRef.current.then(task, task);
    servoSerialQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function sendServoFrameUnlocked(frame: number[], waitMs = 80, logFrame = true) {
    if (!serialRef.current || !connected || connectionMode !== "servo-bus") {
      addLog("system", "请先在舵机模块连接飞特总线串口", "warn");
      return null;
    }

    try {
      serialRef.current.clearBinaryBuffer();
      await serialRef.current.sendBytes(frame);
      if (logFrame) {
        addLog("tx", toHex(frame));
      }
      const rx = await serialRef.current.readBufferedBytes(waitMs);
      if (rx.length > 0 && logFrame) {
        addLog("rx", toHex(rx));
      }
      return parseFeetechStatusPacket(rx);
    } catch (error) {
      addErrorLog(error, "logs.serialDisconnected");
      return null;
    }
  }

  async function sendServoFrame(frame: number[], waitMs = 80, logFrame = true) {
    return enqueueServoSerialTask(() => sendServoFrameUnlocked(frame, waitMs, logFrame));
  }

  async function sendServoFrames(frames: number[] | number[][], waitMs = 80) {
    const list = Array.isArray(frames[0]) ? (frames as number[][]) : [frames as number[]];
    let lastPacket: ReturnType<typeof parseFeetechStatusPacket> = null;
    return enqueueServoSerialTask(async () => {
      for (const frame of list) {
        lastPacket = await sendServoFrameUnlocked(frame, waitMs);
      }
      return lastPacket;
    });
  }

  function setServoSafetyStatus(ids: number[], status: ServoSafetyDisplayStatus) {
    if (ids.length === 0) {
      return;
    }

    setServoSafetyStatusById((current) => {
      const next = { ...current };
      for (const id of ids) {
        if (status.state === "idle") {
          delete next[id];
        } else {
          next[id] = status;
        }
      }
      return next;
    });
  }

  function cancelServoSafetyMonitor(id?: number, status: ServoSafetyDisplayStatus = { state: "idle" }) {
    if (id === undefined) {
      for (const timer of Object.values(servoSafetyTimerRef.current)) {
        window.clearTimeout(timer);
      }
      servoSafetyTimerRef.current = {};
      servoSafetyMonitorRef.current = {};
      setServoSafetyStatusById(status.state === "idle" ? {} : Object.fromEntries(servos.map((servo) => [servo.id, status])) as ServoSafetyStatusMap);
      return;
    }

    const timer = servoSafetyTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete servoSafetyTimerRef.current[id];
    }
    delete servoSafetyMonitorRef.current[id];
    setServoSafetyStatus([id], status);
  }

  function beginServoSafetyMonitor(options: {
    servo: ServoProfile;
    mode: ServoSafetyMotionMode;
    targetPositionRaw?: number;
    targetSpeedRaw?: number;
    affectedServoIds?: number[];
    reset?: boolean;
    stop: () => Promise<void>;
  }) {
    const settings = servoSafetySettingsRef.current;
    if (!settings.enabled || !servoBusConnected()) {
      return;
    }

    const now = Date.now();
    const target = {
      mode: options.mode,
      targetPositionRaw: options.targetPositionRaw,
      targetSpeedRaw: options.targetSpeedRaw
    };
    const existing = servoSafetyMonitorRef.current[options.servo.id];
    const monitor: ServoSafetyMonitor =
      existing ?? {
        servo: options.servo,
        runtime: createServoSafetyRuntime(target, now),
        affectedServoIds: options.affectedServoIds ?? [options.servo.id],
        stop: options.stop,
        polling: false
      };

    monitor.servo = options.servo;
    monitor.runtime = existing && !options.reset ? updateServoSafetyTarget(existing.runtime, target) : createServoSafetyRuntime(target, now);
    monitor.affectedServoIds = options.affectedServoIds ?? [options.servo.id];
    monitor.stop = options.stop;
    servoSafetyMonitorRef.current[options.servo.id] = monitor;
    setServoSafetyStatus([options.servo.id], { state: "monitoring" });
    scheduleServoSafetyPoll(options.servo.id, resolveServoSafetyConfig(settings.preset).pollMs);
  }

  function scheduleServoSafetyPoll(id: number, delayMs?: number) {
    if (!servoSafetyMonitorRef.current[id] || servoSafetyTimerRef.current[id] !== undefined) {
      return;
    }

    const config = resolveServoSafetyConfig(servoSafetySettingsRef.current.preset);
    servoSafetyTimerRef.current[id] = window.setTimeout(() => {
      delete servoSafetyTimerRef.current[id];
      void pollServoSafetyMonitor(id);
    }, delayMs ?? config.pollMs);
  }

  async function pollServoSafetyMonitor(id: number) {
    const monitor = servoSafetyMonitorRef.current[id];
    if (!monitor || monitor.polling) {
      return;
    }
    if (!servoSafetySettingsRef.current.enabled || !servoBusConnected()) {
      cancelServoSafetyMonitor(id);
      return;
    }

    monitor.polling = true;
    try {
      const packet = await sendServoFrame(buildReadFeedbackFrame(id), 120, false);
      if (!servoSafetyMonitorRef.current[id] || servoSafetyMonitorRef.current[id] !== monitor) {
        return;
      }
      if (!packet || packet.status !== 0) {
        return;
      }

      const feedback = parseServoFeedback(packet);
      rememberServoFeedback(feedback);

      const result = evaluateServoSafety(monitor.runtime, feedback, Date.now(), resolveServoSafetyConfig(servoSafetySettingsRef.current.preset));
      monitor.runtime = result.runtime;
      if (result.trigger) {
        await triggerServoSafetyStop(id, result.trigger);
        return;
      }
      if (result.settled) {
        cancelServoSafetyMonitor(id);
      }
    } finally {
      const current = servoSafetyMonitorRef.current[id];
      if (current) {
        current.polling = false;
        scheduleServoSafetyPoll(id);
      }
    }
  }

  async function triggerServoSafetyStop(id: number, reason: ServoSafetyTriggerReason) {
    const monitor = servoSafetyMonitorRef.current[id];
    if (!monitor) {
      return;
    }

    const affectedServoIds = monitor.affectedServoIds;
    const stop = monitor.stop;
    for (const affectedId of affectedServoIds) {
      cancelServoSafetyMonitor(affectedId, { state: "stopped", reason });
    }
    addSystemLog("logs.servoSafetyStopped", "error", { id, reason: t(`safety.reasons.${reason}`) });
    try {
      await stop();
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      setServoSafetyStatus(affectedServoIds, { state: "stopped", reason });
    }
  }

  function motionKeyForServo(id: number): string {
    return `servo:${id}`;
  }

  function motionKeyForLinkage(id: string): string {
    return `linkage:${id}`;
  }

  function motionKeyForArm(): string {
    return "arm";
  }

  function sleepMs(ms: number) {
    return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
  }

  function servoBusConnected() {
    return Boolean(serialRef.current && connected && connectionMode === "servo-bus");
  }

  function parseServoAcc(state: ServoCommandState) {
    return state.acc.trim() === "" ? undefined : Number(state.acc);
  }

  function setServoMotionStatus(ids: number[], status: ServoMotionDisplayStatus) {
    if (ids.length === 0) {
      return;
    }
    setServoMotionStatusById((current) => {
      const next = { ...current };
      for (const id of ids) {
        next[id] = status;
      }
      return next;
    });
  }

  function bumpServoMotionGeneration(key: string) {
    const generation = nextMotionGeneration(servoMotionGenerationRef.current[key]);
    servoMotionGenerationRef.current[key] = generation;
    return generation;
  }

  function isServoMotionCurrent(key: string, generation: number) {
    return isCurrentMotionGeneration(servoMotionGenerationRef.current[key], generation);
  }

  function cancelServoMotion(key?: string, status: ServoMotionDisplayStatus = "idle") {
    if (key === undefined) {
      for (const currentKey of Object.keys(servoMotionGenerationRef.current)) {
        bumpServoMotionGeneration(currentKey);
      }
      setServoMotionStatusById((current) =>
        Object.fromEntries(Object.keys(current).map((id) => [id, status])) as ServoMotionStatusMap
      );
      return;
    }
    bumpServoMotionGeneration(key);
  }

  function cancelServoMotionForServo(id: number, status: ServoMotionDisplayStatus = "idle") {
    cancelServoMotion(motionKeyForServo(id));
    if (armConfig.joints.some((joint) => joint.servoId === id)) {
      cancelServoMotion(motionKeyForArm());
    }
    for (const group of servoLinkageGroupsRef.current) {
      if (group.members.some((member) => member.servoId === id)) {
        cancelServoMotion(motionKeyForLinkage(group.id));
      }
    }
    setServoMotionStatus([id], status);
  }

  function cancelServoMotionForLinkage(groupId: string, status: ServoMotionDisplayStatus = "idle") {
    cancelServoMotion(motionKeyForLinkage(groupId));
    const group = servoLinkageGroupsRef.current.find((item) => item.id === groupId);
    setServoMotionStatus(group?.members.map((member) => member.servoId) ?? [], status);
  }

  function cancelServoMotionForArm(status: ServoMotionDisplayStatus = "idle") {
    cancelServoMotion(motionKeyForArm());
    setServoMotionStatus(armConfig.joints.map((joint) => joint.servoId), status);
  }

  function feedbackPhysicalAngle(servoId: number) {
    const positionRaw = servoFeedback[servoId]?.positionRaw;
    return positionRaw === undefined ? undefined : rawToAngleDeg(positionRaw);
  }

  function getPositionMotionStartAngle(servo: ServoProfile, targetPhysicalAngle: number, reverse = false) {
    const normalized = normalizeServoProfile(servo);
    const lastSent = lastServoPhysicalAngleRef.current[servo.id];
    if (Number.isFinite(lastSent)) {
      return clamp(lastSent!, normalized.minDeg!, normalized.maxDeg!);
    }
    const feedbackAngle = feedbackPhysicalAngle(servo.id);
    const start = Number.isFinite(feedbackAngle)
      ? servoLogicalToPhysicalAngleWithReverse(servo, servoPhysicalToLogicalAngleWithReverse(servo, feedbackAngle!, reverse), reverse)
      : targetPhysicalAngle;
    return clamp(Number.isFinite(start) ? start! : targetPhysicalAngle, normalized.minDeg!, normalized.maxDeg!);
  }

  function getWheelMotionStartSpeed(servoId: number) {
    const lastSent = lastServoWheelSpeedRef.current[servoId];
    if (Number.isFinite(lastSent)) {
      return clamp(Math.round(lastSent!), -DEFAULT_WHEEL_SPEED_LIMIT, DEFAULT_WHEEL_SPEED_LIMIT);
    }
    const feedbackSpeed = servoFeedback[servoId]?.speedRaw;
    return Number.isFinite(feedbackSpeed) ? clamp(Math.round(feedbackSpeed!), -DEFAULT_WHEEL_SPEED_LIMIT, DEFAULT_WHEEL_SPEED_LIMIT) : 0;
  }

  async function writeServoPositionUnlocked(options: {
    servo: ServoProfile;
    physicalAngleDeg: number;
    speedRaw: number;
    acc: number | undefined;
    waitMs: number;
    logFrame: boolean;
  }) {
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    if (!livePositionModeServoRef.current.has(options.servo.id)) {
      await sendServoFrameUnlocked(buildTorqueFrame(options.servo.id, false), options.waitMs, options.logFrame);
      await sendServoFrameUnlocked(buildModeFrame(options.servo.id, "servo"), options.waitMs, options.logFrame);
      await sendServoFrameUnlocked(buildTorqueFrame(options.servo.id, true), options.waitMs, options.logFrame);
      livePositionModeServoRef.current.add(options.servo.id);
    }

    await sendServoFrameUnlocked(
      buildWritePositionFrame({
        id: options.servo.id,
        name: options.servo.name,
        angleDeg: options.physicalAngleDeg,
        speedRaw: options.speedRaw,
        acc: options.acc
      }),
      options.waitMs,
      options.logFrame
    );
    lastServoPhysicalAngleRef.current[options.servo.id] = options.physicalAngleDeg;
    lastServoWheelSpeedRef.current[options.servo.id] = 0;
    return true;
  }

  async function writeServoWheelSpeedUnlocked(options: {
    servo: ServoProfile;
    speedRaw: number;
    acc: number | undefined;
    setupMode: boolean;
    waitMs: number;
    logFrame: boolean;
  }) {
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    if (options.setupMode) {
      for (const frame of buildWheelModeSetupFrames(options.servo.id)) {
        await sendServoFrameUnlocked(frame, options.waitMs, options.logFrame);
      }
    }

    for (const frame of buildWriteSpeedFrames({
      id: options.servo.id,
      name: options.servo.name,
      speedRaw: options.speedRaw,
      acc: options.acc
    })) {
      await sendServoFrameUnlocked(frame, options.waitMs, options.logFrame);
    }
    livePositionModeServoRef.current.delete(options.servo.id);
    lastServoWheelSpeedRef.current[options.servo.id] = options.speedRaw;
    return true;
  }

  async function runServoPositionMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    logicalAngleDeg: number,
    options: { live?: boolean } = {}
  ) {
    const live = options.live ?? false;
    const speedValue = Number(state.speedRaw);
    const acc = parseServoAcc(state);
    const targetPhysicalAngle = servoLogicalToPhysicalAngleWithReverse(servo, logicalAngleDeg, state.reverse);
    cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));

    if (!servoBusConnected()) {
      if (!live) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }

    if (!servoSmoothingEnabled) {
      cancelServoMotionForServo(servo.id, "idle");
      const sent = await enqueueServoSerialTask(() =>
        writeServoPositionUnlocked({
          servo,
          physicalAngleDeg: targetPhysicalAngle,
          speedRaw: speedValue,
          acc,
          waitMs: live ? 12 : 80,
          logFrame: !live
        })
      );
      if (sent) {
        beginServoSafetyMonitor({
          servo,
          mode: "position",
          targetPositionRaw: angleDegToRaw(targetPhysicalAngle),
          reset: !live,
          stop: () => pauseServo(servo, state)
        });
      }
      return sent;
    }

    const key = motionKeyForServo(servo.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const startPhysicalAngle = getPositionMotionStartAngle(servo, targetPhysicalAngle, state.reverse);
    const samples = createPositionTrajectory(startPhysicalAngle, targetPhysicalAngle, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus([servo.id], "smoothing");
    beginServoSafetyMonitor({
      servo,
      mode: "position",
      targetPositionRaw: angleDegToRaw(targetPhysicalAngle),
      reset: !live,
      stop: () => pauseServo(servo, state)
    });
    if (!live) {
      addLog("system", `ID${servo.id} smooth position ${startPhysicalAngle.toFixed(1)} -> ${targetPhysicalAngle.toFixed(1)}`);
    }

    try {
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const sample = samplesToSend[index];
        const sent = await enqueueServoSerialTask(() =>
          writeServoPositionUnlocked({
            servo,
            physicalAngleDeg: sample.value,
            speedRaw: speedValue,
            acc,
            waitMs: live ? 12 : 30,
            logFrame: false
          })
        );
        if (!sent || !isServoMotionCurrent(key, generation)) {
          if (!sent) {
            cancelServoSafetyMonitor(servo.id);
          }
          return false;
        }
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }

      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus([servo.id], "idle");
        if (!live) {
          addLog("system", `ID${servo.id} smooth position complete`);
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForServo(servo.id, "idle");
        addSystemLog("logs.commandInvalid", "error");
      }
      return false;
    }
  }

  async function runServoWheelMotion(
    servo: ServoProfile,
    state: ServoCommandState,
    effectiveWheelSpeed: number,
    options: { live?: boolean; log?: boolean } = {}
  ) {
    const live = options.live ?? false;
    const log = options.log ?? true;
    const acc = parseServoAcc(state);
    cancelLiveAngleMove(servo.id);

    if (!servoBusConnected()) {
      if (log) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }

    if (!servoSmoothingEnabled) {
      cancelServoMotionForServo(servo.id, "idle");
      const sent = await enqueueServoSerialTask(() =>
        writeServoWheelSpeedUnlocked({
          servo,
          speedRaw: effectiveWheelSpeed,
          acc,
          setupMode: true,
          waitMs: 60,
          logFrame: log
        })
      );
      if (sent) {
        beginServoSafetyMonitor({
          servo,
          mode: "wheel",
          targetSpeedRaw: effectiveWheelSpeed,
          reset: !live,
          stop: () => pauseServo(servo, state)
        });
      }
      return sent;
    }

    const key = motionKeyForServo(servo.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const startSpeed = getWheelMotionStartSpeed(servo.id);
    const samples = createWheelSpeedTrajectory(startSpeed, effectiveWheelSpeed, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus([servo.id], "smoothing");
    beginServoSafetyMonitor({
      servo,
      mode: "wheel",
      targetSpeedRaw: effectiveWheelSpeed,
      reset: !live,
      stop: () => pauseServo(servo, state)
    });
    if (log) {
      addLog("system", `ID${servo.id} smooth speed ${Math.round(startSpeed)} -> ${Math.round(effectiveWheelSpeed)}`);
    }

    try {
      await enqueueServoSerialTask(() =>
        writeServoWheelSpeedUnlocked({
          servo,
          speedRaw: startSpeed,
          acc,
          setupMode: true,
          waitMs: 30,
          logFrame: false
        })
      );
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const sample = samplesToSend[index];
        const sent = await enqueueServoSerialTask(() =>
          writeServoWheelSpeedUnlocked({
            servo,
            speedRaw: Math.round(sample.value),
            acc,
            setupMode: false,
            waitMs: 24,
            logFrame: false
          })
        );
        if (!sent || !isServoMotionCurrent(key, generation)) {
          if (!sent) {
            cancelServoSafetyMonitor(servo.id);
          }
          return false;
        }
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }

      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus([servo.id], "idle");
        if (log) {
          addLog("system", `ID${servo.id} smooth speed complete`);
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForServo(servo.id, "idle");
        addSystemLog("logs.commandInvalid", "error");
      }
      return false;
    }
  }

  async function runServoLinkagePositionMotion(group: ServoLinkageGroup, live = false) {
    const targets = calculateServoLinkageTargets(group, servos);
    syncServoLinkageTargetsToCommands(group);

    if (targets.length === 0) {
      if (!live) {
        addSystemLog("logs.linkageNoTargets", "warn");
      }
      return false;
    }

    if (!servoBusConnected()) {
      if (!live) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }

    const ids = targets.map((target) => target.servoId);
    if (!servoSmoothingEnabled) {
      cancelServoMotionForLinkage(group.id, "idle");
      await enqueueServoSerialTask(async () => {
        for (const target of targets) {
          await writeServoPositionUnlocked({
            servo: target.servo,
            physicalAngleDeg: target.physicalAngleDeg,
            speedRaw: target.speedRaw,
            acc: target.acc,
            waitMs: live ? 12 : 80,
            logFrame: !live
          });
        }
      });
      for (const target of targets) {
        beginServoSafetyMonitor({
          servo: target.servo,
          mode: "position",
          targetPositionRaw: angleDegToRaw(target.physicalAngleDeg),
          affectedServoIds: ids,
          reset: !live,
          stop: () => pauseServoLinkageGroup(group)
        });
      }
      if (!live) {
        addSystemLog("logs.linkageCommandSent");
      }
      return true;
    }

    const key = motionKeyForLinkage(group.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const motionTargets = targets.map((target) => {
      const start = getPositionMotionStartAngle(target.servo, target.physicalAngleDeg, target.reverse);
      return { ...target, start, delta: target.physicalAngleDeg - start };
    });
    const maxDistance = Math.max(...motionTargets.map((target) => Math.abs(target.delta)), 0);
    const samples = createPositionTrajectory(0, maxDistance, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus(ids, "smoothing");
    for (const target of motionTargets) {
      beginServoSafetyMonitor({
        servo: target.servo,
        mode: "position",
        targetPositionRaw: angleDegToRaw(target.physicalAngleDeg),
        affectedServoIds: ids,
        reset: !live,
        stop: () => pauseServoLinkageGroup(group)
      });
    }
    if (!live) {
      addLog("system", `${group.name || group.id} smooth linkage start`);
    }

    try {
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const progress = smoothStepQuintic(samplesToSend[index].progress);
        await enqueueServoSerialTask(async () => {
          for (const target of motionTargets) {
            await writeServoPositionUnlocked({
              servo: target.servo,
              physicalAngleDeg: target.start + target.delta * progress,
              speedRaw: target.speedRaw,
              acc: target.acc,
              waitMs: live ? 12 : 30,
              logFrame: false
            });
          }
        });
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }

      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus(ids, "idle");
        if (!live) {
          addSystemLog("logs.linkageCommandSent");
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForLinkage(group.id, "idle");
        if (!live) {
          addSystemLog("logs.commandInvalid", "error");
        }
      }
      return false;
    }
  }

  function calculateArmMotionTargets(config: ArmConfig): ArmMotionTarget[] {
    const servoById = new Map(servos.map((servo) => [servo.id, normalizeServoProfile(servo)]));
    return config.joints
      .filter((joint) => joint.enabled)
      .map((joint) => {
        const servo = servoById.get(joint.servoId);
        if (!servo) {
          return null;
        }
        const logicalAngleDeg = clampServoLogicalAngle(servo, joint.angleDeg);
        const physicalAngleDeg = servoLogicalToPhysicalAngleWithReverse(servo, logicalAngleDeg, joint.reverse);
        return {
          joint,
          servo,
          servoId: servo.id,
          logicalAngleDeg,
          physicalAngleDeg,
          speedRaw: clamp(Math.round(joint.speedRaw), 0, 4095),
          acc: clamp(Math.round(joint.acc), 0, 254),
          reverse: joint.reverse
        };
      })
      .filter((target): target is ArmMotionTarget => target !== null);
  }

  async function runArmPositionMotion(config: ArmConfig, live = false) {
    const targets = calculateArmMotionTargets(config);

    if (targets.length === 0) {
      if (!live) {
        addSystemLog("logs.armNoTargets", "warn");
      }
      return false;
    }

    if (!servoBusConnected()) {
      if (!live) {
        addSystemLog("logs.servoBusRequired", "warn");
      }
      return false;
    }

    const ids = targets.map((target) => target.servoId);
    if (!servoSmoothingEnabled) {
      cancelServoMotionForArm("idle");
      await enqueueServoSerialTask(async () => {
        for (const target of targets) {
          await writeServoPositionUnlocked({
            servo: target.servo,
            physicalAngleDeg: target.physicalAngleDeg,
            speedRaw: target.speedRaw,
            acc: target.acc,
            waitMs: live ? 12 : 80,
            logFrame: !live
          });
        }
      });
      for (const target of targets) {
        beginServoSafetyMonitor({
          servo: target.servo,
          mode: "position",
          targetPositionRaw: angleDegToRaw(target.physicalAngleDeg),
          affectedServoIds: ids,
          reset: !live,
          stop: () => pauseArm()
        });
      }
      if (!live) {
        addSystemLog("logs.armCommandSent");
      }
      return true;
    }

    const key = motionKeyForArm();
    const generation = bumpServoMotionGeneration(key);
    const motionConfig = resolveServoMotionConfig(servoSmoothPreset);
    const motionTargets = targets.map((target) => {
      const start = getPositionMotionStartAngle(target.servo, target.physicalAngleDeg, target.reverse);
      return { ...target, start, delta: target.physicalAngleDeg - start };
    });
    const maxDistance = Math.max(...motionTargets.map((target) => Math.abs(target.delta)), 0);
    const samples = createPositionTrajectory(0, maxDistance, motionConfig);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus(ids, "smoothing");
    for (const target of motionTargets) {
      beginServoSafetyMonitor({
        servo: target.servo,
        mode: "position",
        targetPositionRaw: angleDegToRaw(target.physicalAngleDeg),
        affectedServoIds: ids,
        reset: !live,
        stop: () => pauseArm()
      });
    }
    if (!live) {
      addLog("system", "arm smooth position start");
    }

    try {
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const progress = smoothStepQuintic(samplesToSend[index].progress);
        await enqueueServoSerialTask(async () => {
          for (const target of motionTargets) {
            await writeServoPositionUnlocked({
              servo: target.servo,
              physicalAngleDeg: target.start + target.delta * progress,
              speedRaw: target.speedRaw,
              acc: target.acc,
              waitMs: live ? 12 : 30,
              logFrame: false
            });
          }
        });
        if (index < samplesToSend.length - 1) {
          await sleepMs(motionConfig.tickMs);
        }
      }

      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus(ids, "idle");
        if (!live) {
          addSystemLog("logs.armCommandSent");
        }
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForArm("idle");
        if (!live) {
          addSystemLog("logs.commandInvalid", "error");
        }
      }
      return false;
    }
  }

  async function runServoLinkageWheelMotion(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) {
    const targets = calculateServoLinkageWheelTargets(group, servos, direction);
    syncServoLinkageWheelTargetsToCommands(group, direction);
    cancelServoLinkageMove(group.id);
    cancelServoLinkageWheelTurnMonitors(group.id);

    if (targets.length === 0) {
      addSystemLog("logs.linkageNoTargets", "warn");
      return false;
    }

    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return false;
    }

    const ids = targets.map((target) => target.servoId);
    if (!servoSmoothingEnabled) {
      cancelServoMotionForLinkage(group.id, "idle");
      await enqueueServoSerialTask(async () => {
        for (const target of targets) {
          await writeServoWheelSpeedUnlocked({
            servo: target.servo,
            speedRaw: target.effectiveSpeedRaw,
            acc: target.acc,
            setupMode: true,
            waitMs: 60,
            logFrame: true
          });
        }
      });
      for (const target of targets) {
        beginServoSafetyMonitor({
          servo: target.servo,
          mode: "wheel",
          targetSpeedRaw: target.effectiveSpeedRaw,
          affectedServoIds: ids,
          reset: true,
          stop: () => pauseServoLinkageGroup(group)
        });
      }
      addSystemLog("logs.linkageCommandSent");
      return true;
    }

    const key = motionKeyForLinkage(group.id);
    const generation = bumpServoMotionGeneration(key);
    const config = resolveServoMotionConfig(servoSmoothPreset);
    const motionTargets = targets.map((target) => {
      const start = getWheelMotionStartSpeed(target.servoId);
      return { ...target, start, delta: target.effectiveSpeedRaw - start };
    });
    const maxDelta = Math.max(...motionTargets.map((target) => Math.abs(target.delta)), 0);
    const samples = createWheelSpeedTrajectory(0, maxDelta, config);
    const samplesToSend = samples.length > 1 ? samples.slice(1) : samples;
    setServoMotionStatus(ids, "smoothing");
    for (const target of motionTargets) {
      beginServoSafetyMonitor({
        servo: target.servo,
        mode: "wheel",
        targetSpeedRaw: target.effectiveSpeedRaw,
        affectedServoIds: ids,
        reset: true,
        stop: () => pauseServoLinkageGroup(group)
      });
    }
    addLog("system", `${group.name || group.id} smooth wheel ${direction}`);

    try {
      await enqueueServoSerialTask(async () => {
        for (const target of motionTargets) {
          await writeServoWheelSpeedUnlocked({
            servo: target.servo,
            speedRaw: target.start,
            acc: target.acc,
            setupMode: true,
            waitMs: 30,
            logFrame: false
          });
        }
      });
      for (let index = 0; index < samplesToSend.length; index += 1) {
        if (!isServoMotionCurrent(key, generation) || !servoBusConnected()) {
          return false;
        }
        const progress = smoothStepQuintic(samplesToSend[index].progress);
        await enqueueServoSerialTask(async () => {
          for (const target of motionTargets) {
            await writeServoWheelSpeedUnlocked({
              servo: target.servo,
              speedRaw: Math.round(target.start + target.delta * progress),
              acc: target.acc,
              setupMode: false,
              waitMs: 24,
              logFrame: false
            });
          }
        });
        if (index < samplesToSend.length - 1) {
          await sleepMs(config.tickMs);
        }
      }

      if (isServoMotionCurrent(key, generation)) {
        setServoMotionStatus(ids, "idle");
        addSystemLog("logs.linkageCommandSent");
      }
      return true;
    } catch {
      if (isServoMotionCurrent(key, generation)) {
        cancelServoMotionForLinkage(group.id, "idle");
        addSystemLog("logs.commandInvalid", "error");
      }
      return false;
    }
  }

  function handleMessage(message: InboundMessage) {
    addLog("rx", JSON.stringify(message), message.type === "error" ? "error" : "info");
    if (message.type === "ack") {
      handleAckMessage(message);
    }
    if (message.type === "error") {
      handleErrorMessage(message);
    }
    if (message.type === "log" && message.message.includes("TB6618 Arduino motor firmware ready")) {
      handleMotorFirmwareReadyLog();
    }
    if (message.type === "servo.feedback") {
      rememberServoFeedback(message);
    }
    if (message.type === "motor.feedback") {
      resolvePendingCommandResponse(message);
      setLastMotorError(null);
      if (message.commandedSpeedPercent !== undefined) {
        lastMotorSpeedByChannelRef.current[normalizeMotorChannel(message.channel)] = message.commandedSpeedPercent;
      }
      rememberMotorFeedback(message);
    }
  }

  function cancelLiveAngleMove(id?: number) {
    if (id === undefined) {
      for (const timer of Object.values(liveAngleTimerRef.current)) {
        window.clearTimeout(timer);
      }
      liveAngleTimerRef.current = {};
      pendingLiveAngleRef.current = {};
      for (const servo of servos) {
        cancelServoMotionForServo(servo.id);
      }
      return;
    }

    delete pendingLiveAngleRef.current[id];
    const timer = liveAngleTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete liveAngleTimerRef.current[id];
    }
    cancelServoMotionForServo(id);
  }

  function cancelLiveWheelMove(id?: number) {
    if (id === undefined) {
      for (const timer of Object.values(liveWheelTimerRef.current)) {
        window.clearTimeout(timer);
      }
      liveWheelTimerRef.current = {};
      pendingLiveWheelRef.current = {};
      for (const servo of servos) {
        cancelServoMotionForServo(servo.id);
      }
      return;
    }

    delete pendingLiveWheelRef.current[id];
    const timer = liveWheelTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete liveWheelTimerRef.current[id];
    }
    cancelServoMotionForServo(id);
  }

  function cancelArmLiveMove(status: ServoMotionDisplayStatus = "idle") {
    pendingArmConfigRef.current = null;
    if (armLiveTimerRef.current !== undefined) {
      window.clearTimeout(armLiveTimerRef.current);
      armLiveTimerRef.current = undefined;
    }
    cancelServoMotionForArm(status);
  }

  function cancelServoLinkageMove(id?: string) {
    if (id === undefined) {
      for (const timer of Object.values(linkageLiveTimerRef.current)) {
        window.clearTimeout(timer);
      }
      linkageLiveTimerRef.current = {};
      pendingLinkageMoveRef.current = {};
      for (const group of servoLinkageGroupsRef.current) {
        cancelServoMotionForLinkage(group.id);
      }
      return;
    }

    delete pendingLinkageMoveRef.current[id];
    const timer = linkageLiveTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete linkageLiveTimerRef.current[id];
    }
    cancelServoMotionForLinkage(id);
  }

  function cancelMotorLinkageMove(id?: string) {
    if (id === undefined) {
      for (const timer of Object.values(motorLinkageLiveTimerRef.current)) {
        window.clearTimeout(timer);
      }
      for (const group of motorLinkageGroupsRef.current) {
        motorLinkageGenerationRef.current[group.id] = (motorLinkageGenerationRef.current[group.id] ?? 0) + 1;
      }
      for (const groupId of Object.keys(pendingMotorLinkageMoveRef.current)) {
        motorLinkageGenerationRef.current[groupId] = (motorLinkageGenerationRef.current[groupId] ?? 0) + 1;
      }
      motorLinkageLiveTimerRef.current = {};
      pendingMotorLinkageMoveRef.current = {};
      return;
    }

    motorLinkageGenerationRef.current[id] = (motorLinkageGenerationRef.current[id] ?? 0) + 1;
    delete pendingMotorLinkageMoveRef.current[id];
    const timer = motorLinkageLiveTimerRef.current[id];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete motorLinkageLiveTimerRef.current[id];
    }
  }

  function cancelMotorLinkageMovesForChannels(channels: string[]) {
    const channelSet = new Set(channels.map(normalizeMotorChannel));
    for (const group of motorLinkageGroupsRef.current) {
      if (group.members.some((member) => channelSet.has(normalizeMotorChannel(member.channel)))) {
        cancelMotorLinkageMove(group.id);
      }
    }
  }

  function cancelSingleMotorMove(channel?: string) {
    const pending = pendingSingleMotorMoveRef.current;
    if (channel !== undefined && pending && normalizeMotorChannel(pending.channel) !== normalizeMotorChannel(channel)) {
      return;
    }

    singleMotorGenerationRef.current += 1;
    pendingSingleMotorMoveRef.current = null;
    if (singleMotorLiveTimerRef.current !== undefined) {
      window.clearTimeout(singleMotorLiveTimerRef.current);
      singleMotorLiveTimerRef.current = undefined;
    }
  }

  function cancelWheelTurnMonitor(key?: string) {
    if (key === undefined) {
      for (const timer of Object.values(wheelTurnTimerRef.current)) {
        window.clearInterval(timer);
      }
      wheelTurnTimerRef.current = {};
      wheelTurnStateRef.current = {};
      setWheelTurnProgress((current) =>
        Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, running: false }]))
      );
      return;
    }

    const timer = wheelTurnTimerRef.current[key];
    if (timer !== undefined) {
      window.clearInterval(timer);
      delete wheelTurnTimerRef.current[key];
    }
    delete wheelTurnStateRef.current[key];
    setWheelTurnProgress((current) => {
      const progress = current[key];
      return progress ? { ...current, [key]: { ...progress, running: false } } : current;
    });
  }

  function cancelServoLinkageWheelTurnMonitors(groupId: string) {
    const prefix = `linkage:${groupId}:`;
    for (const key of Object.keys(wheelTurnTimerRef.current)) {
      if (key.startsWith(prefix)) {
        cancelWheelTurnMonitor(key);
      }
    }
    for (const key of Object.keys(wheelTurnStateRef.current)) {
      if (key.startsWith(prefix)) {
        cancelWheelTurnMonitor(key);
      }
    }
  }

  async function holdServoAtCurrentPosition(servo: ServoProfile, speedRaw: number, acc: number | undefined, logFrame = true) {
    const packet = await sendServoFrames(buildReadFeedbackFrame(servo.id), logFrame ? 180 : 120);
    if (!packet || packet.status !== 0) {
      addSystemLog("logs.pauseReadFailed", "warn");
      return false;
    }

    const feedback = parseServoFeedback(packet);
    rememberServoFeedback(feedback);
    if (feedback.positionRaw === undefined) {
      addSystemLog("logs.pauseReadFailed", "warn");
      return false;
    }

    await sendServoFrames([
      buildTorqueFrame(servo.id, false),
      buildModeFrame(servo.id, "servo"),
      buildTorqueFrame(servo.id, true),
      buildWritePositionFrame({
        id: servo.id,
        name: servo.name,
        angleDeg: rawToAngleDeg(feedback.positionRaw),
        speedRaw,
        acc
      })
    ]);
    lastServoPhysicalAngleRef.current[servo.id] = rawToAngleDeg(feedback.positionRaw);
    lastServoWheelSpeedRef.current[servo.id] = 0;
    livePositionModeServoRef.current.add(servo.id);
    return true;
  }

  async function pauseWheelServo(servo: ServoProfile, state: ServoCommandState) {
    const acc = state.acc.trim() === "" ? undefined : Number(state.acc);
    await sendServoFrames([
      ...buildWheelModeSetupFrames(servo.id),
      ...buildWriteSpeedFrames({
        id: servo.id,
        name: servo.name,
        speedRaw: 0,
        acc
      })
    ]);
    livePositionModeServoRef.current.delete(servo.id);
    lastServoWheelSpeedRef.current[servo.id] = 0;
    updateServoCommandField(servo.id, "wheelSliderDeg", String(WHEEL_SLIDER_CENTER_DEG));
  }

  async function pauseServoLinkageWheelTargets(targets: ServoLinkageWheelTarget[]) {
    await enqueueServoSerialTask(async () => {
      for (const target of targets) {
        for (const frame of [
          ...buildWheelModeSetupFrames(target.servoId),
          ...buildWriteSpeedFrames({
            id: target.servoId,
            name: target.name,
            speedRaw: 0,
            acc: target.acc
          })
        ]) {
          await sendServoFrameUnlocked(frame, 60, true);
        }
        livePositionModeServoRef.current.delete(target.servoId);
        lastServoWheelSpeedRef.current[target.servoId] = 0;
      }
    });
  }

  async function pauseServo(servo: ServoProfile, state: ServoCommandState) {
    try {
      cancelLiveAngleMove(servo.id);
      cancelLiveWheelMove(servo.id);
      cancelServoSafetyMonitor(servo.id);
      cancelServoMotionForServo(servo.id, "paused");
      cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));
      if (state.mode === "wheel") {
        await pauseWheelServo(servo, state);
      } else {
        const speedValue = Number(state.speedRaw);
        const acc = state.acc.trim() === "" ? undefined : Number(state.acc);
        await holdServoAtCurrentPosition(servo, Number.isFinite(speedValue) && speedValue >= 0 ? speedValue : 800, acc);
      }
      addSystemLog("logs.servoPaused");
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function pauseServoLinkageGroup(group: ServoLinkageGroup) {
    cancelServoLinkageMove(group.id);
    cancelServoMotionForLinkage(group.id, "paused");
    cancelServoLinkageWheelTurnMonitors(group.id);
    for (const member of group.members) {
      cancelServoSafetyMonitor(member.servoId);
    }
    if (group.mode === "wheel") {
      const targets = calculateServoLinkageWheelTargets(group, servos, "clockwise");
      if (targets.length === 0) {
        addSystemLog("logs.linkageNoTargets", "warn");
        return;
      }

      if (!serialRef.current || !connected || connectionMode !== "servo-bus") {
        addSystemLog("logs.servoBusRequired", "warn");
        return;
      }

      await pauseServoLinkageWheelTargets(targets);
      setLinkageWheelDirectionByGroup((current) => ({ ...current, [group.id]: "paused" }));
      addSystemLog("logs.linkagePaused");
      return;
    }

    const targets = calculateServoLinkageTargets(group, servos);
    if (targets.length === 0) {
      addSystemLog("logs.linkageNoTargets", "warn");
      return;
    }

    for (const target of targets) {
      await holdServoAtCurrentPosition(target.servo, target.speedRaw, target.acc);
    }
    addSystemLog("logs.linkagePaused");
  }

  async function startWheelTurnMonitor(options: {
    key: string;
    servo: ServoProfile;
    targetTurns: number;
    effectiveSpeedRaw: number;
    pause: () => Promise<void>;
    onComplete?: () => Promise<void>;
    onFailure?: () => Promise<void>;
  }) {
    cancelWheelTurnMonitor(options.key);
    if (!Number.isFinite(options.targetTurns) || options.targetTurns <= 0 || options.effectiveSpeedRaw === 0) {
      addSystemLog("logs.wheelTurnsInvalid", "warn");
      return false;
    }

    const packet = await sendServoFrame(buildReadFeedbackFrame(options.servo.id), 140, false);
    if (!packet || packet.status !== 0) {
      addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
      await (options.onFailure ?? options.pause)();
      return false;
    }

    const feedback = parseServoFeedback(packet);
    rememberServoFeedback(feedback);
    if (feedback.positionRaw === undefined) {
      addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
      await (options.onFailure ?? options.pause)();
      return false;
    }

    wheelTurnStateRef.current[options.key] = {
      servo: options.servo,
      previousRaw: feedback.positionRaw,
      completedTurns: 0,
      targetTurns: options.targetTurns,
      speedRaw: options.effectiveSpeedRaw,
      polling: false,
      pause: options.pause,
      onComplete: options.onComplete,
      onFailure: options.onFailure
    };
    setWheelTurnProgress((current) => ({
      ...current,
      [options.key]: { completedTurns: 0, targetTurns: options.targetTurns, running: true }
    }));
    wheelTurnTimerRef.current[options.key] = window.setInterval(() => {
      void pollWheelTurnProgress(options.key);
    }, 180);
    return true;
  }

  async function pollWheelTurnProgress(key: string) {
    const runtime = wheelTurnStateRef.current[key];
    if (!runtime || runtime.polling) {
      return;
    }

    runtime.polling = true;
    try {
      const packet = await sendServoFrame(buildReadFeedbackFrame(runtime.servo.id), 120, false);
      if (!packet || packet.status !== 0) {
        cancelWheelTurnMonitor(key);
        addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
        await (runtime.onFailure ?? runtime.pause)();
        return;
      }

      const feedback = parseServoFeedback(packet);
      rememberServoFeedback(feedback);
      if (feedback.positionRaw === undefined || runtime.previousRaw === undefined) {
        cancelWheelTurnMonitor(key);
        addSystemLog("logs.wheelTurnFeedbackFailed", "warn");
        await (runtime.onFailure ?? runtime.pause)();
        return;
      }

      runtime.completedTurns += calculateWheelTurnDelta(runtime.previousRaw, feedback.positionRaw, runtime.speedRaw);
      runtime.previousRaw = feedback.positionRaw;
      setWheelTurnProgress((current) => ({
        ...current,
        [key]: {
          completedTurns: Math.min(runtime.completedTurns, runtime.targetTurns),
          targetTurns: runtime.targetTurns,
          running: true
        }
      }));

      if (runtime.completedTurns >= runtime.targetTurns) {
        cancelWheelTurnMonitor(key);
        setWheelTurnProgress((current) => ({
          ...current,
          [key]: {
            completedTurns: runtime.targetTurns,
            targetTurns: runtime.targetTurns,
            running: false
          }
        }));
        await (runtime.onComplete ?? runtime.pause)();
        addSystemLog("logs.wheelTurnsComplete");
      }
    } finally {
      const current = wheelTurnStateRef.current[key];
      if (current) {
        current.polling = false;
      }
    }
  }

  function updateServoCommand(id: number, updater: (current: ServoCommandState) => ServoCommandState) {
    setServoCommandById((current) => ({
      ...current,
      [id]: updater(getServoCommandState(current, id))
    }));
  }

  function syncServoLinkageTargetsToCommands(group: ServoLinkageGroup) {
    if (group.mode !== "position") {
      return;
    }

    const targets = calculateServoLinkageTargets(group, servos);
    if (targets.length === 0) {
      return;
    }

    setServoCommandById((current) => {
      const next = { ...current };
      for (const target of targets) {
        const currentState = getServoCommandState(current, target.servoId);
        const speedValue = Number(currentState.speedRaw);
        next[target.servoId] = {
          ...currentState,
          mode: "position",
          speedRaw: Number.isFinite(target.speedRaw) && target.speedRaw >= 0 ? String(target.speedRaw) : Number.isFinite(speedValue) && speedValue >= 0 ? currentState.speedRaw : "800",
          acc: String(target.acc),
          reverse: target.reverse,
          angleDeg: formatServoAngle(target.logicalAngleDeg)
        };
      }
      return next;
    });
  }

  function syncServoLinkageWheelTargetsToCommands(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) {
    const targets = calculateServoLinkageWheelTargets(group, servos, direction);
    if (targets.length === 0) {
      return;
    }

    setServoCommandById((current) => {
      const next = { ...current };
      for (const target of targets) {
        const currentState = getServoCommandState(current, target.servoId);
        const maxSpeedRaw = normalizeWheelMaxSpeedRaw(target.speedRaw);
        const wheelSliderDeg = commandSpeedRawToWheelSliderDeg(target.commandSpeedRaw, maxSpeedRaw);
        next[target.servoId] = {
          ...currentState,
          mode: "wheel",
          speedRaw: String(maxSpeedRaw),
          acc: String(target.acc),
          reverse: target.reverse,
          wheelSliderDeg: formatServoAngle(wheelSliderDeg)
        };
      }
      return next;
    });
  }

  function addServoLinkageGroup() {
    setServoLinkageGroups((current) => {
      const name = nextServoLinkageGroupName(current);
      return [
        ...current,
        {
          id: `linkage-${Date.now().toString(36)}-${current.length + 1}`,
          name,
          enabled: false,
          mode: "position",
          masterPercent: 100,
          wheelTurnLimitEnabled: false,
          wheelClockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
          wheelCounterclockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
          members: []
        }
      ];
    });
  }

  function removeServoLinkageGroup(id: string) {
    const group = servoLinkageGroups.find((item) => item.id === id);
    cancelServoLinkageMove(id);
    cancelServoLinkageWheelTurnMonitors(id);
    for (const member of group?.members ?? []) {
      cancelServoSafetyMonitor(member.servoId);
    }
    setExpandedServoLinkageGroupIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setLinkageWheelDirectionByGroup((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setServoLinkageGroups((current) => current.filter((group) => group.id !== id));
  }

  function updateServoLinkageGroupName(id: string, name: string) {
    setServoLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, name } : group)));
  }

  function toggleServoLinkageGroupExpanded(id: string) {
    setExpandedServoLinkageGroupIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function updateServoLinkageGroupMode(id: string, mode: ServoControlMode) {
    const group = servoLinkageGroups.find((item) => item.id === id);
    if (!group || group.mode === mode) {
      return;
    }

    cancelServoLinkageMove(id);
    cancelServoLinkageWheelTurnMonitors(id);
    for (const member of group.members) {
      cancelServoSafetyMonitor(member.servoId);
    }
    if (group.mode === "wheel") {
      void pauseServoLinkageGroup(group);
    }

    const nextGroup = {
      ...group,
      mode,
      members:
        mode === "wheel"
          ? group.members.map((member) => ({ ...member, speedRaw: clamp(member.speedRaw, 0, DEFAULT_WHEEL_SPEED_LIMIT) }))
          : group.members
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === id ? nextGroup : item)));
    if (mode === "position") {
      syncServoLinkageTargetsToCommands(nextGroup);
    }
  }

  function updateServoLinkageWheelTurnLimit(id: string, enabled: boolean) {
    setServoLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, wheelTurnLimitEnabled: enabled } : group)));
    if (!enabled) {
      cancelServoLinkageWheelTurnMonitors(id);
    }
  }

  function updateServoLinkageWheelTurnTarget(id: string, field: "wheelClockwiseTurnsTarget" | "wheelCounterclockwiseTurnsTarget", value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    setServoLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, [field]: Math.max(0.01, numericValue) } : group)));
  }

  function updateServoLinkageGroupEnabled(id: string, enabled: boolean) {
    if (!enabled) {
      cancelServoLinkageMove(id);
      cancelServoLinkageWheelTurnMonitors(id);
      const group = servoLinkageGroups.find((item) => item.id === id);
      for (const member of group?.members ?? []) {
        cancelServoSafetyMonitor(member.servoId);
      }
    }

    const group = servoLinkageGroups.find((item) => item.id === id);
    if (group && enabled && group.mode === "position") {
      syncServoLinkageTargetsToCommands({ ...group, enabled });
    }
    setServoLinkageGroups((current) => current.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }

  function updateServoLinkageMaster(id: string, value: string, live = true) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const group = servoLinkageGroups.find((item) => item.id === id);
    if (!group) {
      return;
    }

    const nextGroup = { ...group, masterPercent: clamp(numericValue, 0, 100) };
    setServoLinkageGroups((current) => current.map((item) => (item.id === id ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
    if (live && nextGroup.enabled && nextGroup.mode === "position") {
      scheduleServoLinkageMove(nextGroup);
    }
  }

  function addServoToLinkageGroup(groupId: string, value: string) {
    const servoId = Number(value);
    const group = servoLinkageGroups.find((item) => item.id === groupId);
    if (!group || !servos.some((servo) => servo.id === servoId) || group.members.some((member) => member.servoId === servoId)) {
      return;
    }

    const nextGroup = {
      ...group,
      members: [
        ...group.members,
        {
          servoId,
          weightPercent: 100,
          speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
          acc: DEFAULT_LINKAGE_MEMBER_ACC,
          reverse: false
        }
      ]
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
  }

  function removeServoFromLinkageGroup(groupId: string, servoId: number) {
    cancelWheelTurnMonitor(linkageWheelTurnProgressKey(groupId, servoId));
    cancelServoSafetyMonitor(servoId);
    setServoLinkageGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, members: group.members.filter((member) => member.servoId !== servoId) } : group))
    );
  }

  function updateServoLinkageMemberWeight(groupId: string, servoId: number, value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const group = servoLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.servoId === servoId ? { ...member, weightPercent: clamp(numericValue, 0, 100) } : member))
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
  }

  function updateServoLinkageMemberNumber(groupId: string, servoId: number, field: "speedRaw" | "acc", value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const group = servoLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextValue =
      field === "speedRaw"
        ? clamp(Math.round(numericValue), 0, group.mode === "wheel" ? DEFAULT_WHEEL_SPEED_LIMIT : 4095)
        : clamp(Math.round(numericValue), 0, 254);
    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.servoId === servoId ? { ...member, [field]: nextValue } : member))
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
  }

  function updateServoLinkageMemberReverse(groupId: string, servoId: number, reverse: boolean) {
    const group = servoLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.servoId === servoId ? { ...member, reverse } : member))
    };
    setServoLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    syncServoLinkageTargetsToCommands(nextGroup);
  }

  function scheduleServoLinkageMove(group: ServoLinkageGroup) {
    if (!group.enabled || group.mode !== "position" || group.members.length === 0) {
      return;
    }

    pendingLinkageMoveRef.current[group.id] = group;
    if (linkageLiveTimerRef.current[group.id] !== undefined || linkageLiveSendingRef.current[group.id]) {
      return;
    }

    linkageLiveTimerRef.current[group.id] = window.setTimeout(() => {
      delete linkageLiveTimerRef.current[group.id];
      void flushServoLinkageMove(group.id);
    }, 60);
  }

  async function flushServoLinkageMove(id: string) {
    if (linkageLiveSendingRef.current[id]) {
      return;
    }

    const pending = pendingLinkageMoveRef.current[id];
    delete pendingLinkageMoveRef.current[id];
    const currentGroup = servoLinkageGroupsRef.current.find((group) => group.id === id);
    if (!pending || !currentGroup?.enabled) {
      return;
    }

    linkageLiveSendingRef.current[id] = true;
    try {
      if (servoSmoothingEnabled) {
        void sendServoLinkageGroup(currentGroup, true);
      } else {
        await sendServoLinkageGroup(currentGroup, true);
      }
    } finally {
      linkageLiveSendingRef.current[id] = false;
      if (pendingLinkageMoveRef.current[id] && linkageLiveTimerRef.current[id] === undefined) {
        linkageLiveTimerRef.current[id] = window.setTimeout(() => {
          delete linkageLiveTimerRef.current[id];
          void flushServoLinkageMove(id);
        }, 60);
      }
    }
  }

  function updateServoCommandField<K extends keyof ServoCommandState>(id: number, field: K, value: ServoCommandState[K]) {
    updateServoCommand(id, (current) => ({ ...current, [field]: value }));
  }

  function handleServoModeChange(id: number, mode: ServoControlMode) {
    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    if (armConfig.joints.some((joint) => joint.servoId === id)) {
      cancelArmLiveMove();
    }
    cancelWheelTurnMonitor(singleWheelTurnProgressKey(id));
    cancelServoSafetyMonitor(id);
    livePositionModeServoRef.current.delete(id);
    updateServoCommand(id, (current) => {
      if (mode === "wheel") {
        const speedValue = Number(current.speedRaw);
        const wheelSliderDeg = clampWheelSliderDeg(
          current.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : Number(current.wheelSliderDeg)
        );
        return {
          ...current,
          mode,
          speedRaw: String(normalizeWheelMaxSpeedRaw(Number.isFinite(speedValue) ? speedValue : 300)),
          acc: "50",
          wheelSliderDeg: formatServoAngle(wheelSliderDeg)
        };
      }

      const speedValue = Number(current.speedRaw);
      return {
        ...current,
        mode,
        speedRaw: Number.isFinite(speedValue) && speedValue >= 0 ? current.speedRaw : "800"
      };
    });
  }

  function handleLiveDragToggle(id: number, enabled: boolean) {
    if (!enabled) {
      cancelLiveAngleMove(id);
    }
    updateServoCommandField(id, "liveDragEnabled", enabled);
  }

  function updateServoLogicalAngle(servo: ServoProfile, value: string) {
    if (value.trim() === "") {
      updateServoCommandField(servo.id, "angleDeg", "");
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }
    updateServoCommandField(servo.id, "angleDeg", formatServoAngle(clampServoLogicalAngle(servo, numericValue)));
  }

  function scheduleLiveAngleMove(servo: ServoProfile, state: ServoCommandState, angle: number) {
    if (
      !state.liveDragEnabled ||
      state.mode !== "position" ||
      !connected ||
      connectionMode !== "servo-bus" ||
      !Number.isFinite(angle)
    ) {
      return;
    }

    pendingLiveAngleRef.current[servo.id] = { servo, state: { ...state, angleDeg: String(angle) }, angle };
    if (liveAngleTimerRef.current[servo.id] !== undefined || liveAngleSendingRef.current[servo.id]) {
      return;
    }

    liveAngleTimerRef.current[servo.id] = window.setTimeout(() => {
      delete liveAngleTimerRef.current[servo.id];
      void flushLiveAngleMove(servo.id);
    }, 60);
  }

  async function flushLiveAngleMove(id: number) {
    if (liveAngleSendingRef.current[id]) {
      return;
    }

    const pending = pendingLiveAngleRef.current[id];
    delete pendingLiveAngleRef.current[id];
    if (
      !pending ||
      !pending.state.liveDragEnabled ||
      pending.state.mode !== "position" ||
      !connected ||
      connectionMode !== "servo-bus"
    ) {
      return;
    }

    liveAngleSendingRef.current[id] = true;
    try {
      if (servoSmoothingEnabled) {
        void runServoPositionMotion(pending.servo, pending.state, pending.angle, { live: true });
      } else {
        await runServoPositionMotion(pending.servo, pending.state, pending.angle, { live: true });
      }
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      liveAngleSendingRef.current[id] = false;
      if (pendingLiveAngleRef.current[id] && liveAngleTimerRef.current[id] === undefined) {
        liveAngleTimerRef.current[id] = window.setTimeout(() => {
          delete liveAngleTimerRef.current[id];
          void flushLiveAngleMove(id);
        }, 60);
      }
    }
  }

  function scheduleLiveWheelMove(servo: ServoProfile, state: ServoCommandState) {
    if (state.mode !== "wheel" || !connected || connectionMode !== "servo-bus") {
      return;
    }

    pendingLiveWheelRef.current[servo.id] = { servo, state };
    if (liveWheelTimerRef.current[servo.id] !== undefined || liveWheelSendingRef.current[servo.id]) {
      return;
    }

    liveWheelTimerRef.current[servo.id] = window.setTimeout(() => {
      delete liveWheelTimerRef.current[servo.id];
      void flushLiveWheelMove(servo.id);
    }, 60);
  }

  async function flushLiveWheelMove(id: number) {
    if (liveWheelSendingRef.current[id]) {
      return;
    }

    const pending = pendingLiveWheelRef.current[id];
    delete pendingLiveWheelRef.current[id];
    if (!pending || pending.state.mode !== "wheel" || !connected || connectionMode !== "servo-bus") {
      return;
    }

    liveWheelSendingRef.current[id] = true;
    try {
      if (servoSmoothingEnabled) {
        void sendMoveForServo(pending.servo, pending.state, { live: true });
      } else {
        await sendMoveForServo(pending.servo, pending.state, { live: true });
      }
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      liveWheelSendingRef.current[id] = false;
      if (pendingLiveWheelRef.current[id] && liveWheelTimerRef.current[id] === undefined) {
        liveWheelTimerRef.current[id] = window.setTimeout(() => {
          delete liveWheelTimerRef.current[id];
          void flushLiveWheelMove(id);
        }, 60);
      }
    }
  }

  function handleAngleSliderChange(servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) {
    const nextAngle = event.target.value;
    updateServoLogicalAngle(servo, nextAngle);
    scheduleLiveAngleMove(servo, state, Number(nextAngle));
  }

  function updateServoWheelSlider(servo: ServoProfile, state: ServoCommandState, value: string) {
    if (value.trim() === "") {
      updateServoCommandField(servo.id, "wheelSliderDeg", "");
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const wheelSliderDeg = clampWheelSliderDeg(numericValue);
    const nextState = { ...state, wheelSliderDeg: formatServoAngle(wheelSliderDeg) };
    updateServoCommand(servo.id, () => nextState);
    scheduleLiveWheelMove(servo, nextState);
  }

  function updateServoWheelMaxSpeed(servo: ServoProfile, state: ServoCommandState, value: string) {
    if (value.trim() === "") {
      updateServoCommandField(servo.id, "speedRaw", "");
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const nextState = { ...state, speedRaw: String(normalizeWheelMaxSpeedRaw(numericValue)) };
    updateServoCommand(servo.id, () => nextState);
    scheduleLiveWheelMove(servo, nextState);
  }

  function handleWheelSliderChange(servo: ServoProfile, state: ServoCommandState, event: ChangeEvent<HTMLInputElement>) {
    updateServoWheelSlider(servo, state, event.target.value);
  }

  function updateArmConfigState(updater: (current: ArmConfig) => ArmConfig, live = false) {
    setArmConfig((current) => {
      const next = normalizeArmConfig(updater(current), servos);
      if (live && next.liveDragEnabled) {
        scheduleArmLiveMove(next);
      }
      return next;
    });
  }

  function armServoForJoint(joint: ArmJointConfig) {
    return servos.find((servo) => servo.id === joint.servoId);
  }

  function nextArmJointName(joints: ArmJointConfig[]) {
    const names = new Set(joints.map((joint) => joint.name.trim().toLowerCase()));
    for (let index = 1; index <= 99; index += 1) {
      const name = `Joint ${index}`;
      if (!names.has(name.toLowerCase())) {
        return name;
      }
    }
    return `Joint ${joints.length + 1}`;
  }

  function addArmJoint() {
    const usedServoIds = new Set(armConfig.joints.map((joint) => joint.servoId));
    const servo = servos.find((item) => !usedServoIds.has(item.id));
    if (!servo) {
      addSystemLog("logs.armNoAvailableServo", "warn");
      return;
    }

    const normalizedServo = normalizeServoProfile(servo);
    const neutralDeg = clamp(90, 0, servoLogicalSpan(normalizedServo));
    const id = `arm-joint-${Date.now().toString(36)}`;
    const joint: ArmJointConfig = {
      id,
      name: nextArmJointName(armConfig.joints),
      servoId: normalizedServo.id,
      lengthPx: 88,
      angleDeg: neutralDeg,
      neutralDeg,
      speedRaw: 800,
      acc: 30,
      reverse: false,
      enabled: true
    };
    updateArmConfigState((current) => ({ ...current, joints: [...current.joints, joint], selectedJointId: id }));
  }

  function removeArmJoint(id: string) {
    updateArmConfigState((current) => {
      const joints = current.joints.filter((joint) => joint.id !== id);
      return {
        ...current,
        joints,
        selectedJointId: current.selectedJointId === id ? joints[0]?.id ?? null : current.selectedJointId
      };
    });
  }

  function moveArmJoint(id: string, delta: number) {
    updateArmConfigState((current) => {
      const index = current.joints.findIndex((joint) => joint.id === id);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.joints.length) {
        return current;
      }
      const joints = [...current.joints];
      const [joint] = joints.splice(index, 1);
      joints.splice(nextIndex, 0, joint);
      return { ...current, joints };
    });
  }

  function updateArmJoint(id: string, updater: (joint: ArmJointConfig) => ArmJointConfig, live = false) {
    updateArmConfigState(
      (current) => ({
        ...current,
        selectedJointId: id,
        joints: current.joints.map((joint) => (joint.id === id ? updater(joint) : joint))
      }),
      live
    );
  }

  function updateArmJointNumber(id: string, field: "lengthPx" | "angleDeg" | "neutralDeg" | "speedRaw" | "acc", value: string, live = false) {
    if (value.trim() === "") {
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    updateArmJoint(
      id,
      (joint) => {
        const servo = armServoForJoint(joint);
        const span = servo ? servoLogicalSpan(servo) : 360;
        if (field === "lengthPx") {
          return { ...joint, lengthPx: clamp(Math.round(numericValue), ARM_MIN_JOINT_LENGTH_PX, ARM_MAX_JOINT_LENGTH_PX) };
        }
        if (field === "speedRaw") {
          return { ...joint, speedRaw: clamp(Math.round(numericValue), 0, 4095) };
        }
        if (field === "acc") {
          return { ...joint, acc: clamp(Math.round(numericValue), 0, 254) };
        }
        return { ...joint, [field]: clamp(numericValue, 0, span) };
      },
      live
    );
  }

  function updateArmJointServo(id: string, servoId: number) {
    const servo = servos.find((item) => item.id === servoId);
    if (!servo) {
      return;
    }
    const normalizedServo = normalizeServoProfile(servo);
    const neutralDeg = clamp(90, 0, servoLogicalSpan(normalizedServo));
    updateArmJoint(id, (joint) => ({
      ...joint,
      servoId: normalizedServo.id,
      angleDeg: clamp(joint.angleDeg, 0, servoLogicalSpan(normalizedServo)),
      neutralDeg: clamp(Number.isFinite(joint.neutralDeg) ? joint.neutralDeg : neutralDeg, 0, servoLogicalSpan(normalizedServo))
    }));
  }

  function setArmLiveDragEnabled(enabled: boolean) {
    if (!enabled) {
      cancelArmLiveMove();
    }
    updateArmConfigState((current) => ({ ...current, liveDragEnabled: enabled }));
  }

  function scheduleArmLiveMove(config: ArmConfig) {
    if (!config.liveDragEnabled || !connected || connectionMode !== "servo-bus") {
      return;
    }

    pendingArmConfigRef.current = config;
    if (armLiveTimerRef.current !== undefined || armLiveSendingRef.current) {
      return;
    }

    armLiveTimerRef.current = window.setTimeout(() => {
      armLiveTimerRef.current = undefined;
      void flushArmLiveMove();
    }, 60);
  }

  async function flushArmLiveMove() {
    if (armLiveSendingRef.current) {
      return;
    }

    const pending = pendingArmConfigRef.current;
    pendingArmConfigRef.current = null;
    if (!pending || !pending.liveDragEnabled || !connected || connectionMode !== "servo-bus") {
      return;
    }

    armLiveSendingRef.current = true;
    try {
      if (servoSmoothingEnabled) {
        void runArmPositionMotion(pending, true);
      } else {
        await runArmPositionMotion(pending, true);
      }
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    } finally {
      armLiveSendingRef.current = false;
      if (pendingArmConfigRef.current && armLiveTimerRef.current === undefined) {
        armLiveTimerRef.current = window.setTimeout(() => {
          armLiveTimerRef.current = undefined;
          void flushArmLiveMove();
        }, 60);
      }
    }
  }

  function handleArmJointDrag(joint: ArmJointConfig, pointer: { x: number; y: number }) {
    const jointIndex = armConfig.joints.findIndex((item) => item.id === joint.id);
    const servo = armServoForJoint(joint);
    if (jointIndex < 0 || !servo) {
      return;
    }

    const previousPose = jointIndex > 0 ? armSegmentPoses[jointIndex - 1] : undefined;
    const currentPose = armSegmentPoses[jointIndex];
    const anchor = currentPose ? { x: currentPose.startX, y: currentPose.startY } : { x: 300, y: 250 };
    const nextAngle = calculateArmDragAngle({
      anchor,
      pointer,
      parentGlobalDeg: previousPose?.globalDeg ?? 0,
      neutralDeg: joint.neutralDeg,
      servoSpanDeg: servoLogicalSpan(servo),
      currentAngleDeg: joint.angleDeg
    });
    updateArmJointNumber(joint.id, "angleDeg", String(nextAngle), true);
  }

  function armSvgPoint(event: ReactPointerEvent<SVGElement>) {
    const svg = event.currentTarget instanceof SVGSVGElement ? event.currentTarget : event.currentTarget.ownerSVGElement;
    if (!svg) {
      return { x: 300, y: 250 };
    }
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 600,
      y: ((event.clientY - rect.top) / rect.height) * 420
    };
  }

  function handleArmPointerDown(event: ReactPointerEvent<SVGElement>, joint: ArmJointConfig) {
    event.preventDefault();
    draggingArmJointIdRef.current = joint.id;
    setArmConfig((current) => ({ ...current, selectedJointId: joint.id }));
    handleArmJointDrag(joint, armSvgPoint(event));
  }

  function handleArmPointerMove(event: ReactPointerEvent<SVGElement>) {
    const jointId = draggingArmJointIdRef.current;
    if (!jointId) {
      return;
    }
    const joint = armConfig.joints.find((item) => item.id === jointId);
    if (!joint) {
      return;
    }
    handleArmJointDrag(joint, armSvgPoint(event));
  }

  function handleArmPointerEnd() {
    draggingArmJointIdRef.current = null;
  }

  async function sendArmPose() {
    await runArmPositionMotion(armConfig);
  }

  async function pauseArm() {
    cancelArmLiveMove("paused");
    const targets = calculateArmMotionTargets(armConfig);
    if (targets.length === 0) {
      addSystemLog("logs.armNoTargets", "warn");
      return;
    }
    if (!servoBusConnected()) {
      addSystemLog("logs.servoBusRequired", "warn");
      return;
    }
    for (const target of targets) {
      cancelServoSafetyMonitor(target.servoId);
      await holdServoAtCurrentPosition(target.servo, target.speedRaw, target.acc);
    }
    addSystemLog("logs.armPaused");
  }

  async function connectSerial() {
    if (!webSerialAvailable) {
      addSystemLog("serial.errors.unsupportedWebSerial", "error");
      return;
    }

    try {
      const mode: ConnectionMode = isServoBusModule(activeModule) ? "servo-bus" : "controller";
      const client = new WebSerialClient(handleMessage);
      await client.connect(mode === "servo-bus" ? 1000000 : 115200, mode === "servo-bus" ? "binary" : "json");
      serialRef.current = client;
      setConnectionMode(mode);
      setConnected(true);
      resetMotorDebugHandshake();
      addLog("system", mode === "servo-bus" ? "飞特总线已连接：1000000 baud" : "控制器串口已连接：115200 baud");
      if (mode === "controller") {
        await writeDebugSetToClient(client, activeModule, debugEnabled);
      }
    } catch (error) {
      addErrorLog(error, "logs.serialConnectFailed");
    }
  }

  async function disconnectSerial() {
    await stopAllMotors(true);
    await serialRef.current?.disconnect();
    serialRef.current = null;
    cancelLiveAngleMove();
    cancelLiveWheelMove();
    cancelArmLiveMove();
    livePositionModeServoRef.current.clear();
    cancelServoMotion();
    cancelServoSafetyMonitor();
    lastServoWheelSpeedRef.current = {};
    servoSerialQueueRef.current = Promise.resolve();
    setConnectionMode(null);
    setConnected(false);
    resetMotorDebugHandshake();
    addSystemLog("logs.serialClosed");
  }

  async function selectModule(module: ActiveModule) {
    const nextMode: ConnectionMode = isServoBusModule(module) ? "servo-bus" : "controller";
    if (connected && connectionMode && connectionMode !== nextMode) {
      await disconnectSerial();
    }
    setActiveModule(module);
    if (debugEnabled && module !== "mapping" && !isServoBusModule(module)) {
      await sendDebugSet(module, true);
    }
  }

  function moduleForComponentPanel(panel: ComponentPanel): ActiveModule {
    return panel === "arm" ? "arm" : "camera";
  }

  function moduleForSection(section: AppSection): ActiveModule {
    if (section === "console") {
      return "camera";
    }
    if (section === "components") {
      return moduleForComponentPanel(activeComponent);
    }
    if (section === "tests") {
      return activeTest;
    }
    return "mapping";
  }

  async function selectSection(section: AppSection) {
    setActiveSection(section);
    await selectModule(moduleForSection(section));
  }

  async function selectComponentPanel(panel: ComponentPanel) {
    setActiveSection("components");
    setActiveComponent(panel);
    await selectModule(moduleForComponentPanel(panel));
  }

  async function selectTestPanel(panel: TestPanel) {
    setActiveSection("tests");
    setActiveTest(panel);
    await selectModule(panel);
  }

  async function toggleDebugMode() {
    if (isServoBusModule(activeModule)) {
      addLog("system", "舵机模块已改为 PC 直连飞特总线，不需要调试模式开关");
      return;
    }
    await setDebugMode(!debugEnabled, activeModule);
  }

  async function setDebugMode(enabled: boolean, module: ActiveModule) {
    if (isServoBusModule(module)) {
      return true;
    }
    if (enabled && (!serialRef.current || !connected)) {
      addSystemLog("logs.serialDisconnected", "warn");
      return false;
    }

    setDebugEnabled(enabled);
    const sent = await sendDebugSet(module, enabled);
    if (!sent && enabled) {
      setDebugEnabled(false);
    }
    return sent;
  }

  async function ensureDebugMode(module: ActiveModule) {
    if (debugEnabled) {
      return true;
    }
    return setDebugMode(true, module);
  }

  async function changeLanguage(event: ChangeEvent<HTMLSelectElement>) {
    const language = event.target.value as SupportedLanguage;
    if (!isSupportedLanguage(language)) {
      return;
    }
    saveLanguagePreference(language);
    await i18n.changeLanguage(language);
  }

  function updateCameraText(value: string) {
    setCameraConfig((current) => ({ ...current, streamUrl: value }));
    setCameraConfigError(null);
  }

  function updateCameraNumber(field: CameraNumberField, value: string) {
    const numericValue = Number(value);
    setCameraConfig((current) => ({ ...current, [field]: Number.isFinite(numericValue) ? numericValue : 0 }));
    setCameraConfigError(null);
  }

  function saveCameraSettings(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const error = validateCameraConfig(cameraConfig);
    if (error) {
      setCameraConfigError(error);
      addSystemLog("logs.cameraConfigInvalid", "error");
      return;
    }

    saveCameraConfig(cameraConfig);
    setCameraConfigError(null);
    addSystemLog("logs.cameraConfigSaved");
  }

  function addServo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateServoDraft(servoDraft, servos);
    if (error) {
      setServoLibraryError(error);
      return;
    }

    const servo = normalizeServoProfile({ id: Number(servoDraft.id), name: servoDraft.name.trim() });
    setServos((current) => [...current, servo].sort((a, b) => a.id - b.id));
    setSelectedId(servo.id);
    setServoDraft({ id: String(servo.id + 1), name: `J${servo.id + 1}` });
    setServoLibraryError(null);
  }

  function removeServo(id: number) {
    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    cancelWheelTurnMonitor(singleWheelTurnProgressKey(id));
    cancelServoSafetyMonitor(id);
    cancelServoLinkageMove();
    livePositionModeServoRef.current.delete(id);
    delete lastServoPhysicalAngleRef.current[id];
    delete lastServoWheelSpeedRef.current[id];
    setServos((current) => current.filter((servo) => servo.id !== id));
    setServoCommandById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setServoFeedback((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setServoMotionStatusById((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (selectedId === id) {
      setSelectedId("");
    }
  }

  function updateServoLimit(id: number, field: "minDeg" | "maxDeg", value: string) {
    const numericValue = Number(value);
    const servo = servos.find((item) => item.id === id);
    if (!servo || !Number.isFinite(numericValue)) {
      return;
    }

    const current = normalizeServoProfile(servo);
    const clampedValue = clamp(numericValue, 0, 360);
    const minDeg = field === "minDeg" ? clampedValue : current.minDeg!;
    const maxDeg = field === "maxDeg" ? clampedValue : current.maxDeg!;
    if (minDeg >= maxDeg) {
      return;
    }
    const next = normalizeServoProfile({ ...current, minDeg, maxDeg });

    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    setServos((items) => items.map((item) => (item.id === id ? next : item)));
    updateServoCommand(id, (state) => clampServoCommandStateToLimits(state, next));
  }

  function updateServoDirection(id: number, reversed: boolean) {
    const servo = servos.find((item) => item.id === id);
    if (!servo) {
      return;
    }

    const next = normalizeServoProfile({ ...servo, direction: reversed ? -1 : 1 });
    cancelLiveAngleMove(id);
    cancelLiveWheelMove(id);
    setServos((items) => items.map((item) => (item.id === id ? next : item)));
    updateServoCommand(id, (state) => clampServoCommandStateToLimits(state, next));
  }

  function addMotor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateMotorDraft(motorDraft, motors);
    if (error) {
      setMotorLibraryError(error);
      return;
    }

    const motor = { channel: normalizeMotorChannel(motorDraft.channel), name: motorDraft.name.trim() };
    const nextMotors = [...motors, motor].sort((a, b) => a.channel.localeCompare(b.channel, undefined, { numeric: true }));
    setMotors(nextMotors);
    setSelectedChannel(motor.channel);
    setMotorDraft(nextMotorDraft(nextMotors));
    setMotorLibraryError(null);
  }

  function removeMotor(channel: string) {
    const normalized = normalizeMotorChannel(channel);
    setMotors((current) => current.filter((motor) => motor.channel !== normalized));
    setMotorFeedback((current) => {
      const next = { ...current };
      delete next[normalized];
      return next;
    });
    if (selectedChannel === normalized) {
      setSelectedChannel("");
    }
  }

  function updateSelectedMotorMapping(field: MotorMappingField, value: string) {
    if (!selectedMotor) {
      return;
    }
    setMotorConfigError(null);
    setMotors((current) =>
      current.map((motor) => (motor.channel === selectedMotor.channel ? { ...motor, [field]: value } : motor))
    );
  }

  function saveMotorMapping() {
    if (!selectedMotor) {
      addSystemLog("logs.selectMotorFirst", "warn");
      return false;
    }

    const error = validateMotorMapping(selectedMotor);
    if (error) {
      setMotorConfigError(error);
      addSystemLog("logs.motorMappingInvalid", "error");
      return false;
    }

    setMotorConfigError(null);
    saveMotors(motors);
    addSystemLog("logs.motorMappingSaved");
    return true;
  }

  function downloadArduinoFirmware() {
    const blob = new Blob([buildTb6618MotorDebuggerIno(motors)], { type: "text/x-arduino;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = TB6618_MOTOR_DEBUGGER_INO_FILENAME;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function sendMotorConfig() {
    if (!selectedMotor) {
      addSystemLog("logs.selectMotorFirst", "warn");
      return;
    }

    const error = validateMotorMapping(selectedMotor);
    if (error) {
      setMotorConfigError(error);
      addSystemLog("logs.motorMappingInvalid", "error");
      return;
    }

    try {
      const sent = await sendMotorCommand(
        buildMotorConfigCommand(nextSeq(), {
          channel: selectedMotor.channel,
          driver: "tb6618",
          pwmPin: selectedMotor.pwmPin ?? "",
          in1Pin: selectedMotor.in1Pin ?? "",
          in2Pin: selectedMotor.in2Pin ?? "",
          enablePin: selectedMotor.enablePin,
          sensorPin: selectedMotor.sensorPin
        })
      );
      if (sent) {
        setMotorConfigError(null);
        saveMotors(motors);
        addSystemLog("logs.motorConfigSent");
      }
    } catch {
      setMotorConfigError("validation.invalidMotorPin");
      addSystemLog("logs.motorMappingInvalid", "error");
    }
  }

  function addMotorLinkageGroup() {
    setMotorLinkageGroups((current) => {
      const name = nextMotorLinkageGroupName(current);
      return [
        ...current,
        {
          id: `motor-linkage-${Date.now().toString(36)}-${current.length + 1}`,
          name,
          enabled: false,
          masterSpeedPercent: 0,
          members: []
        }
      ];
    });
  }

  function removeMotorLinkageGroup(id: string) {
    cancelMotorLinkageMove(id);
    setExpandedMotorLinkageGroupIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setMotorLinkageGroups((current) => current.filter((group) => group.id !== id));
  }

  function updateMotorLinkageGroupName(id: string, name: string) {
    setMotorLinkageGroups((current) => current.map((group) => (group.id === id ? { ...group, name } : group)));
  }

  function toggleMotorLinkageGroupExpanded(id: string) {
    setExpandedMotorLinkageGroupIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function updateMotorLinkageGroupEnabled(id: string, enabled: boolean) {
    const group = motorLinkageGroups.find((item) => item.id === id);
    if (!group) {
      return;
    }

    if (!enabled) {
      cancelMotorLinkageMove(id);
      void stopMotorLinkageGroup(group, true);
    }
    setMotorLinkageGroups((current) => current.map((item) => (item.id === id ? { ...item, enabled } : item)));
  }

  function updateMotorLinkageMaster(id: string, value: string, live = true) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const group = motorLinkageGroups.find((item) => item.id === id);
    if (!group) {
      return;
    }

    const nextGroup = { ...group, masterSpeedPercent: clamp(numericValue, -100, 100) };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === id ? nextGroup : item)));
    if (live && nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  function addMotorToLinkageGroup(groupId: string, value: string) {
    const channel = normalizeMotorChannel(value);
    const group = motorLinkageGroups.find((item) => item.id === groupId);
    if (!group || !motors.some((motor) => motor.channel === channel) || group.members.some((member) => member.channel === channel)) {
      return;
    }

    const nextGroup = {
      ...group,
      members: [...group.members, { channel, weightPercent: 100, reverse: false }]
    };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    if (nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  function removeMotorFromLinkageGroup(groupId: string, channel: string) {
    const normalized = normalizeMotorChannel(channel);
    setMotorLinkageGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, members: group.members.filter((member) => member.channel !== normalized) } : group))
    );
  }

  function updateMotorLinkageMemberWeight(groupId: string, channel: string, value: string) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const normalized = normalizeMotorChannel(channel);
    const group = motorLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.channel === normalized ? { ...member, weightPercent: clamp(numericValue, 0, 100) } : member))
    };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    if (nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  function updateMotorLinkageMemberReverse(groupId: string, channel: string, reverse: boolean) {
    const normalized = normalizeMotorChannel(channel);
    const group = motorLinkageGroups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const nextGroup = {
      ...group,
      members: group.members.map((member) => (member.channel === normalized ? { ...member, reverse } : member))
    };
    setMotorLinkageGroups((current) => current.map((item) => (item.id === groupId ? nextGroup : item)));
    if (nextGroup.enabled) {
      scheduleMotorLinkageMove(nextGroup);
    }
  }

  async function sendMotorLinkageGroup(group: MotorLinkageGroup, live = false, generation?: number) {
    const targets = calculateMotorLinkageTargets(group, motors);
    if (targets.length === 0) {
      if (!live) {
        addSystemLog("logs.motorLinkageNoTargets", "warn");
      }
      return false;
    }
    if (!connected || connectionMode === "servo-bus") {
      if (!live) {
        addSystemLog("logs.motorDebugRequired", "warn");
      }
      return false;
    }

    try {
      const sent = await sendMotorCommandBatch(
        targets.map((target) => buildMotorSetCommand(nextSeq(), { channel: target.channel, speedPercent: target.speedPercent, stopMode })),
        {
          log: !live,
          shouldRun: live && generation !== undefined ? () => (motorLinkageGenerationRef.current[group.id] ?? 0) === generation : undefined
        }
      );
      if (sent && !live) {
        addSystemLog("logs.motorLinkageCommandSent");
      }
      return sent;
    } catch {
      if (!live) {
        addSystemLog("logs.motorCommandInvalid", "error");
      }
      return false;
    }
  }

  async function stopMotorLinkageGroup(group: MotorLinkageGroup, quiet = false) {
    cancelMotorLinkageMove(group.id);
    const targets = calculateMotorLinkageTargets(group, motors);
    if (targets.length === 0) {
      if (!quiet) {
        addSystemLog("logs.motorLinkageNoTargets", "warn");
      }
      return false;
    }
    if (!connected || connectionMode === "servo-bus") {
      if (!quiet) {
        addSystemLog("logs.serialDisconnected", "warn");
      }
      setMotorLinkageGroups((current) => current.map((item) => (item.id === group.id ? { ...item, masterSpeedPercent: 0 } : item)));
      return false;
    }

    const sent = await sendMotorCommandBatch(
      targets.map((target) => buildMotorStopCommand(nextSeq(), { channel: target.channel, stopMode })),
      { log: !quiet }
    );
    setMotorLinkageGroups((current) => current.map((item) => (item.id === group.id ? { ...item, masterSpeedPercent: 0 } : item)));
    if (sent && !quiet) {
      addSystemLog("logs.motorLinkageStopped");
    }
    return sent;
  }

  function scheduleMotorLinkageMove(group: MotorLinkageGroup) {
    if (!group.enabled || group.members.length === 0) {
      return;
    }

    pendingMotorLinkageMoveRef.current[group.id] = group;
    if (motorLinkageLiveTimerRef.current[group.id] !== undefined || motorLinkageLiveSendingRef.current[group.id]) {
      return;
    }

    motorLinkageLiveTimerRef.current[group.id] = window.setTimeout(() => {
      delete motorLinkageLiveTimerRef.current[group.id];
      void flushMotorLinkageMove(group.id);
    }, 60);
  }

  async function flushMotorLinkageMove(id: string) {
    if (motorLinkageLiveSendingRef.current[id]) {
      return;
    }

    const pending = pendingMotorLinkageMoveRef.current[id];
    delete pendingMotorLinkageMoveRef.current[id];
    const latestGroup = motorLinkageGroupsRef.current.find((group) => group.id === id);
    const currentGroup = pending ?? latestGroup;
    const generation = motorLinkageGenerationRef.current[id] ?? 0;
    if (!pending || !currentGroup?.enabled || latestGroup?.enabled === false) {
      return;
    }

    motorLinkageLiveSendingRef.current[id] = true;
    try {
      await sendMotorLinkageGroup(currentGroup, true, generation);
    } finally {
      motorLinkageLiveSendingRef.current[id] = false;
      if (pendingMotorLinkageMoveRef.current[id] && motorLinkageLiveTimerRef.current[id] === undefined) {
        motorLinkageLiveTimerRef.current[id] = window.setTimeout(() => {
          delete motorLinkageLiveTimerRef.current[id];
          void flushMotorLinkageMove(id);
        }, 60);
      }
    }
  }

  function updateSingleMotorSpeed(value: string, live = false) {
    setMotorSpeed(value);
    const speedPercent = Number(value);
    if (!live) {
      if (selectedMotor) {
        cancelSingleMotorMove(selectedMotor.channel);
      }
      return;
    }
    if (!selectedMotor || !Number.isFinite(speedPercent)) {
      return;
    }

    scheduleSingleMotorMove(selectedMotor.channel, speedPercent);
  }

  function scheduleSingleMotorMove(channel: string, speedPercent: number) {
    const normalizedChannel = normalizeMotorChannel(channel);
    cancelMotorLinkageMovesForChannels([normalizedChannel]);
    pendingSingleMotorMoveRef.current = {
      channel: normalizedChannel,
      speedPercent: clamp(speedPercent, -100, 100),
      stopMode,
      generation: singleMotorGenerationRef.current
    };
    if (singleMotorLiveTimerRef.current !== undefined || singleMotorLiveSendingRef.current) {
      return;
    }

    singleMotorLiveTimerRef.current = window.setTimeout(() => {
      singleMotorLiveTimerRef.current = undefined;
      void flushSingleMotorMove();
    }, 60);
  }

  async function flushSingleMotorMove() {
    if (singleMotorLiveSendingRef.current) {
      return;
    }

    const pending = pendingSingleMotorMoveRef.current;
    pendingSingleMotorMoveRef.current = null;
    if (!pending || !connected || connectionMode === "servo-bus") {
      return;
    }

    singleMotorLiveSendingRef.current = true;
    try {
      await sendMotorCommandBatch(
        [buildMotorSetCommand(nextSeq(), { channel: pending.channel, speedPercent: pending.speedPercent, stopMode: pending.stopMode })],
        {
          log: false,
          shouldRun: () => singleMotorGenerationRef.current === pending.generation
        }
      );
    } finally {
      singleMotorLiveSendingRef.current = false;
      if (pendingSingleMotorMoveRef.current && singleMotorLiveTimerRef.current === undefined) {
        singleMotorLiveTimerRef.current = window.setTimeout(() => {
          singleMotorLiveTimerRef.current = undefined;
          void flushSingleMotorMove();
        }, 60);
      }
    }
  }

  async function sendMoveForServo(servo: ServoProfile, state: ServoCommandState, options: { live?: boolean } = {}) {
    try {
      const live = options.live ?? false;
      const wheelMaxSpeedRaw = normalizeWheelMaxSpeedRaw(Number(state.speedRaw));
      const wheelSliderDeg = state.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : Number(state.wheelSliderDeg);
      const commandWheelSpeedRaw = wheelSliderToCommandSpeedRaw(wheelSliderDeg, wheelMaxSpeedRaw);
      const effectiveWheelSpeed = applyServoWheelDirection(servo, commandWheelSpeedRaw, state.reverse);
      const sent =
        state.mode === "wheel"
          ? await runServoWheelMotion(servo, { ...state, speedRaw: String(wheelMaxSpeedRaw) }, effectiveWheelSpeed, { live, log: !live })
          : await runServoPositionMotion(servo, state, Number(state.angleDeg));

      if (!sent) {
        return;
      }
      if (connected && connectionMode === "servo-bus" && state.mode === "wheel") {
        if (state.wheelTurnsEnabled && effectiveWheelSpeed !== 0) {
          await startWheelTurnMonitor({
            key: singleWheelTurnProgressKey(servo.id),
            servo,
            targetTurns: Number(state.wheelTurnsTarget),
            effectiveSpeedRaw: effectiveWheelSpeed,
            pause: () => pauseWheelServo(servo, state)
          });
        } else {
          cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));
        }
      }
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function sendServoLinkageGroup(group: ServoLinkageGroup, live = false) {
    if (group.mode !== "position") {
      await sendServoLinkageWheelGroup(group, "clockwise");
      return;
    }
    await runServoLinkagePositionMotion(group, live);
  }

  async function sendServoLinkageWheelGroup(group: ServoLinkageGroup, direction: ServoLinkageWheelDirection) {
    const targets = calculateServoLinkageWheelTargets(group, servos, direction);

    try {
      const sent = await runServoLinkageWheelMotion(group, direction);
      if (!sent) {
        return;
      }

      setLinkageWheelDirectionByGroup((current) => ({ ...current, [group.id]: direction }));
      if (group.wheelTurnLimitEnabled) {
        const targetTurns = direction === "clockwise" ? group.wheelClockwiseTurnsTarget : group.wheelCounterclockwiseTurnsTarget;
        for (const target of targets) {
          const started = await startWheelTurnMonitor({
            key: linkageWheelTurnProgressKey(group.id, target.servoId),
            servo: target.servo,
            targetTurns,
            effectiveSpeedRaw: target.effectiveSpeedRaw,
            pause: () => pauseServoLinkageWheelTargets([target]),
            onComplete: () => pauseServoLinkageGroup(group),
            onFailure: () => pauseServoLinkageGroup(group)
          });
          if (!started) {
            break;
          }
        }
      }
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function stopServo(servo: ServoProfile, state: ServoCommandState) {
    try {
      cancelLiveAngleMove(servo.id);
      cancelLiveWheelMove(servo.id);
      cancelServoSafetyMonitor(servo.id);
      cancelServoMotionForServo(servo.id, "paused");
      await sendServoFrames([
        ...buildWheelModeSetupFrames(servo.id),
        ...buildWriteSpeedFrames({
          id: servo.id,
          name: servo.name,
          speedRaw: 0,
          acc: state.acc.trim() === "" ? undefined : Number(state.acc)
        })
      ]);
      livePositionModeServoRef.current.delete(servo.id);
      lastServoWheelSpeedRef.current[servo.id] = 0;
      updateServoCommandField(servo.id, "wheelSliderDeg", String(WHEEL_SLIDER_CENTER_DEG));
    } catch {
      addSystemLog("logs.commandInvalid", "error");
    }
  }

  async function pingServo(servo: ServoProfile) {
    const packet = await sendServoFrames(buildPingFrame(servo.id), 140);
    if (packet?.status === 0) {
      addLog("system", `ID${servo.id} ping ok`);
    } else if (packet) {
      addLog("system", `ID${servo.id} ping status=${packet.status}`, "warn");
    } else {
      addLog("system", `ID${servo.id} ping 无回包`, "warn");
    }
  }

  async function readServo(servo: ServoProfile) {
    const packet = await sendServoFrames(buildReadFeedbackFrame(servo.id), 180);
    if (!packet) {
      addLog("system", `ID${servo.id} 读取无回包`, "warn");
      return;
    }
    if (packet.status !== 0) {
      addLog("system", `ID${servo.id} 读取状态错误 ${packet.status}`, "warn");
      return;
    }
    const feedback = parseServoFeedback(packet);
    rememberServoFeedback(feedback);
  }

  async function setTorqueForServo(servo: ServoProfile, enabled: boolean) {
    await sendServoFrames(buildTorqueFrame(servo.id, enabled));
    if (!enabled) {
      cancelLiveAngleMove(servo.id);
      cancelLiveWheelMove(servo.id);
      cancelServoSafetyMonitor(servo.id);
      cancelServoMotionForServo(servo.id, "idle");
      cancelWheelTurnMonitor(singleWheelTurnProgressKey(servo.id));
      livePositionModeServoRef.current.delete(servo.id);
    }
  }

  async function nudgeCamera(deltaPan: number, deltaTilt: number) {
    await sendCameraGimbalMove(cameraConfig.panAngleDeg + deltaPan, cameraConfig.tiltAngleDeg + deltaTilt);
  }

  async function centerCamera() {
    await sendCameraGimbalMove(
      (cameraConfig.panMinDeg + cameraConfig.panMaxDeg) / 2,
      (cameraConfig.tiltMinDeg + cameraConfig.tiltMaxDeg) / 2
    );
  }

  async function sendCameraGimbalMove(panAngleDeg: number, tiltAngleDeg: number) {
    const error = validateCameraConfig(cameraConfig);
    if (error) {
      setCameraConfigError(error);
      addSystemLog("logs.cameraConfigInvalid", "error");
      return;
    }

    const nextConfig = {
      ...cameraConfig,
      panAngleDeg: clamp(panAngleDeg, cameraConfig.panMinDeg, cameraConfig.panMaxDeg),
      tiltAngleDeg: clamp(tiltAngleDeg, cameraConfig.tiltMinDeg, cameraConfig.tiltMaxDeg)
    };

    setCameraConfig(nextConfig);
    try {
      const sent = await send(
        buildServoMoveCommand(
          nextSeq(),
          [
            {
              id: nextConfig.panServoId,
              name: "Camera Pan",
              angleDeg: nextConfig.panAngleDeg,
              speedRaw: nextConfig.speedRaw,
              acc: nextConfig.acc
            },
            {
              id: nextConfig.tiltServoId,
              name: "Camera Tilt",
              angleDeg: nextConfig.tiltAngleDeg,
              speedRaw: nextConfig.speedRaw,
              acc: nextConfig.acc
            }
          ],
          true
        )
      );
      if (sent) {
        saveCameraConfig(nextConfig);
      }
    } catch {
      addSystemLog("logs.cameraCommandInvalid", "error");
    }
  }

  async function sendMotorSet() {
    if (!selectedMotor) {
      addSystemLog("logs.selectMotorFirst", "warn");
      return;
    }

    try {
      cancelSingleMotorMove(selectedMotor.channel);
      cancelMotorLinkageMovesForChannels([selectedMotor.channel]);
      await sendMotorCommand(buildMotorSetCommand(nextSeq(), { channel: selectedMotor.channel, speedPercent: Number(motorSpeed), stopMode }));
    } catch {
      addSystemLog("logs.motorCommandInvalid", "error");
    }
  }

  async function stopMotor() {
    if (!selectedMotor) {
      return;
    }
    cancelSingleMotorMove(selectedMotor.channel);
    cancelMotorLinkageMovesForChannels([selectedMotor.channel]);
    await sendMotorCommand(buildMotorStopCommand(nextSeq(), { channel: selectedMotor.channel, stopMode }));
    setMotorSpeed("0");
  }

  async function stopAllMotors(quiet = false) {
    lastDriveCommandRef.current = "";
    cancelSingleMotorMove();
    cancelMotorLinkageMove();
    if (quiet && (!serialRef.current || !connected || connectionMode === "servo-bus")) {
      setMotorSpeed("0");
      return;
    }
    await sendMotorCommand(buildMotorStopCommand(nextSeq(), { all: true, stopMode }), { log: !quiet });
    setMotorSpeed("0");
  }

  async function readMotor() {
    if (!selectedMotor) {
      return;
    }
    await sendMotorCommand({ type: "motor.read", seq: nextSeq(), channel: selectedMotor.channel });
  }

  async function selectDriveBase(base: DriveBase) {
    if (base !== activeDriveBase) {
      await stopAllMotors(true);
      lastDriveCommandRef.current = "";
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

    if (justPressed(inputMapping.gamepad.buttons.stop)) {
      void stopAllMotors();
    }
    if (justPressed(inputMapping.gamepad.buttons.selectTracked)) {
      void selectDriveBase("tracked");
    }
    if (justPressed(inputMapping.gamepad.buttons.selectMecanum)) {
      void selectDriveBase("mecanum");
    }

    previousGamepadButtonsRef.current[gamepad.index] = current;
  }

  function saveMappingSettings() {
    const normalized = normalizeInputMapping(mappingDraft);
    setInputMapping(normalized);
    setMappingDraft(cloneMapping(normalized));
    saveInputMapping(normalized);
    addSystemLog("logs.inputMappingSaved");
  }

  function resetMappingSettings() {
    const defaults = cloneMapping(DEFAULT_INPUT_MAPPING);
    setInputMapping(defaults);
    setMappingDraft(cloneMapping(defaults));
    saveInputMapping(defaults);
    setCapturingKey(null);
    addSystemLog("logs.inputMappingReset");
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

  function formatDirectionLabel(direction: MotorDirection | string) {
    if (direction === "forward") {
      return t("direction.forward");
    }
    if (direction === "reverse") {
      return t("direction.reverse");
    }
    return t("direction.stopped");
  }

  function formatLinkageMemberDirection(reverse: boolean) {
    return reverse ? t("fields.reverseRotation") : t("fields.forwardRotation");
  }

  function formatWheelSliderDirectionLabel(direction: ReturnType<typeof wheelSliderDirection>) {
    if (direction === "counterclockwise") {
      return t("actions.counterclockwise");
    }
    if (direction === "clockwise") {
      return t("actions.clockwise");
    }
    return t("direction.stopped");
  }

  function availableServosForLinkageGroup(groupId: string) {
    const group = servoLinkageGroups.find((item) => item.id === groupId);
    return servos.filter((servo) => !group?.members.some((member) => member.servoId === servo.id));
  }

  function renderServoLinkageGroupEditor(group: ServoLinkageGroup) {
    const availableServos = availableServosForLinkageGroup(group.id);
    const isExpanded = expandedServoLinkageGroupIds.has(group.id);
    const modeLabel = group.mode === "wheel" ? t("fields.wheelMode") : t("fields.positionMode");

    return (
      <article className={`${group.enabled ? "servo-linkage-group enabled" : "servo-linkage-group"} ${isExpanded ? "expanded" : ""}`.trim()} key={group.id}>
        <div className="servo-linkage-group-header">
          <button className="linkage-summary-button" onClick={() => toggleServoLinkageGroupExpanded(group.id)} type="button" aria-expanded={isExpanded}>
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span className="linkage-summary-text">
              <strong>{group.name || t("fields.linkageName")}</strong>
              <small>
                {modeLabel} / {group.members.length} {t("metrics.members")}
              </small>
            </span>
          </button>
          <label className="checkbox-field linkage-enable">
            <input type="checkbox" checked={group.enabled} onChange={(event) => updateServoLinkageGroupEnabled(group.id, event.target.checked)} />
            <span>{t("fields.enabled")}</span>
          </label>
          <button className="delete-hit" onClick={() => removeServoLinkageGroup(group.id)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: group.name })}>
            <Trash2 size={16} />
          </button>
        </div>

        {isExpanded && (
          <div className="servo-linkage-group-body">
            <input
              className="linkage-name-input"
              aria-label={t("fields.linkageName")}
              value={group.name}
              onChange={(event) => updateServoLinkageGroupName(group.id, event.target.value)}
            />

            <div className="linkage-mode-control" role="group" aria-label={t("fields.linkageMode")}>
              <button className={group.mode === "position" ? "active" : ""} onClick={() => updateServoLinkageGroupMode(group.id, "position")} type="button">
                {t("fields.positionMode")}
              </button>
              <button className={group.mode === "wheel" ? "active" : ""} onClick={() => updateServoLinkageGroupMode(group.id, "wheel")} type="button">
                {t("fields.wheelMode")}
              </button>
            </div>

            {group.mode === "wheel" && (
              <div className="linkage-wheel-settings">
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={group.wheelTurnLimitEnabled}
                    onChange={(event) => updateServoLinkageWheelTurnLimit(group.id, event.target.checked)}
                  />
                  <span>{t("fields.limitTurns")}</span>
                </label>
                <label>
                  <span>{t("fields.clockwiseTurns")}</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    disabled={!group.wheelTurnLimitEnabled}
                    value={group.wheelClockwiseTurnsTarget}
                    onChange={(event) => updateServoLinkageWheelTurnTarget(group.id, "wheelClockwiseTurnsTarget", event.target.value)}
                  />
                </label>
                <label>
                  <span>{t("fields.counterclockwiseTurns")}</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.1}
                    disabled={!group.wheelTurnLimitEnabled}
                    value={group.wheelCounterclockwiseTurnsTarget}
                    onChange={(event) => updateServoLinkageWheelTurnTarget(group.id, "wheelCounterclockwiseTurnsTarget", event.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="servo-linkage-members">
              {group.members.length === 0 ? (
                <div className="empty-state compact">{t("empty.noLinkageMembers")}</div>
              ) : (
                group.members.map((member) => {
                  const servo = servos.find((item) => item.id === member.servoId);
                  if (!servo) {
                    return null;
                  }

                  return (
                    <div className={`linkage-member-row ${group.mode}`} key={member.servoId}>
                      <span className="device-id">ID {servo.id}</span>
                      <span className="linkage-member-name">{servo.name}</span>
                      {group.mode === "position" && (
                        <label>
                          <span>{t("fields.weightPercent")}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={member.weightPercent}
                            onChange={(event) => updateServoLinkageMemberWeight(group.id, member.servoId, event.target.value)}
                          />
                        </label>
                      )}
                      <label>
                        <span>{t("fields.speedRaw")}</span>
                        <input
                          type="number"
                          min={0}
                          max={group.mode === "wheel" ? DEFAULT_WHEEL_SPEED_LIMIT : 4095}
                          step={1}
                          value={member.speedRaw}
                          onChange={(event) => updateServoLinkageMemberNumber(group.id, member.servoId, "speedRaw", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>{t("fields.acceleration")}</span>
                        <input
                          type="number"
                          min={0}
                          max={254}
                          step={1}
                          value={member.acc}
                          onChange={(event) => updateServoLinkageMemberNumber(group.id, member.servoId, "acc", event.target.value)}
                        />
                      </label>
                      <div className="linkage-member-direction">
                        <span>{t("fields.memberDirection")}</span>
                        <div className="linkage-direction-toggle" role="group" aria-label={`${servo.name} ${t("fields.memberDirection")}`}>
                          <button
                            className={!member.reverse ? "active" : ""}
                            onClick={() => updateServoLinkageMemberReverse(group.id, member.servoId, false)}
                            type="button"
                          >
                            {t("fields.forwardRotation")}
                          </button>
                          <button
                            className={member.reverse ? "active" : ""}
                            onClick={() => updateServoLinkageMemberReverse(group.id, member.servoId, true)}
                            type="button"
                          >
                            {t("fields.reverseRotation")}
                          </button>
                        </div>
                      </div>
                      <button className="delete-hit" onClick={() => removeServoFromLinkageGroup(group.id, member.servoId)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: servo.name })}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {availableServos.length > 0 ? (
              <select className="linkage-add-select" value="" onChange={(event) => addServoToLinkageGroup(group.id, event.target.value)}>
                <option value="">{t("placeholders.addServoToGroup")}</option>
                {availableServos.map((servo) => (
                  <option key={servo.id} value={servo.id}>
                    ID {servo.id} {servo.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="empty-state compact">{t("empty.noAvailableServos")}</div>
            )}
          </div>
        )}
      </article>
    );
  }

  function renderServoLinkageRunCard(group: ServoLinkageGroup) {
    if (group.mode === "wheel") {
      return renderServoLinkageWheelRunCard(group);
    }

    const targets = calculateServoLinkageTargets(group, servos);

    return (
      <section className="servo-linkage-run-card" key={group.id} aria-label={group.name}>
        <div className="servo-linkage-run-header">
          <div>
            <span>{t("panels.servoLinkage")}</span>
            <strong>{group.name || t("fields.linkageName")}</strong>
          </div>
          <div className="linkage-run-actions">
            <button className="icon-button primary" disabled={targets.length === 0} onClick={() => sendServoLinkageGroup(group)} type="button">
              <Send size={18} />
              <span>{t("actions.sendLinkage")}</span>
            </button>
            <button className="icon-button danger" disabled={targets.length === 0} onClick={() => pauseServoLinkageGroup(group)} type="button">
              <Square size={18} />
              <span>{t("actions.pauseGroup")}</span>
            </button>
          </div>
        </div>

        <div className="linkage-master-control">
          <label>
            <span>{t("fields.masterPercent")}</span>
            <div className="range-number-control">
              <input
                className="angle-range"
                aria-label={`${group.name} ${t("fields.masterPercent")}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={group.masterPercent}
                onChange={(event) => updateServoLinkageMaster(group.id, event.target.value, true)}
              />
              <input
                className="angle-number"
                aria-label={`${group.name} ${t("fields.masterPercent")}`}
                type="number"
                min={0}
                max={100}
                step={1}
                value={group.masterPercent}
                onChange={(event) => updateServoLinkageMaster(group.id, event.target.value, true)}
              />
            </div>
          </label>
        </div>

        <div className="linkage-target-preview">
          {targets.length === 0 ? (
            <div className="empty-state compact">{t("empty.noLinkageMembers")}</div>
          ) : (
            targets.map((target) => (
              <span key={target.servoId}>
                <strong>
                  ID {target.servoId} {target.name}
                </strong>
                <code>
                  {formatServoAngle(target.logicalAngleDeg)} deg / {formatServoAngle(target.physicalAngleDeg)} phys
                </code>
                <code>
                  {target.speedRaw} raw / acc {target.acc} / {formatLinkageMemberDirection(target.reverse)}
                </code>
              </span>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderServoLinkageWheelRunCard(group: ServoLinkageGroup) {
    const clockwiseTargets = calculateServoLinkageWheelTargets(group, servos, "clockwise");
    const counterclockwiseTargets = calculateServoLinkageWheelTargets(group, servos, "counterclockwise");
    const activeDirection = linkageWheelDirectionByGroup[group.id] ?? "paused";
    const previewTargets = activeDirection === "counterclockwise" ? counterclockwiseTargets : clockwiseTargets;
    const hasTargets = clockwiseTargets.length > 0;

    return (
      <section className="servo-linkage-run-card wheel" key={group.id} aria-label={group.name}>
        <div className="servo-linkage-run-header">
          <div>
            <span>{t("panels.servoLinkage")}</span>
            <strong>{group.name || t("fields.linkageName")}</strong>
          </div>
          <div className="linkage-run-actions three-buttons">
            <button className="icon-button primary" disabled={!hasTargets} onClick={() => sendServoLinkageWheelGroup(group, "clockwise")} type="button">
              <RotateCw size={18} />
              <span>{t("actions.clockwise")}</span>
            </button>
            <button className="icon-button primary" disabled={!hasTargets} onClick={() => sendServoLinkageWheelGroup(group, "counterclockwise")} type="button">
              <RotateCcw size={18} />
              <span>{t("actions.counterclockwise")}</span>
            </button>
            <button className="icon-button danger" disabled={!hasTargets} onClick={() => pauseServoLinkageGroup(group)} type="button">
              <Square size={18} />
              <span>{t("actions.pause")}</span>
            </button>
          </div>
        </div>

        <div className="linkage-wheel-run-status">
          <Metric label={t("metrics.mode")} value={t("fields.wheelMode")} />
          <Metric
            label={t("metrics.activeDirection")}
            value={activeDirection === "clockwise" ? t("actions.clockwise") : activeDirection === "counterclockwise" ? t("actions.counterclockwise") : t("actions.pause")}
            tone={activeDirection === "paused" ? "neutral" : "warning"}
          />
          <Metric
            label={t("fields.clockwiseTurns")}
            value={group.wheelTurnLimitEnabled ? group.wheelClockwiseTurnsTarget : "--"}
          />
          <Metric
            label={t("fields.counterclockwiseTurns")}
            value={group.wheelTurnLimitEnabled ? group.wheelCounterclockwiseTurnsTarget : "--"}
          />
        </div>

        <div className="linkage-target-preview">
          {previewTargets.length === 0 ? (
            <div className="empty-state compact">{t("empty.noLinkageMembers")}</div>
          ) : (
            previewTargets.map((target) => {
              const progress = wheelTurnProgress[linkageWheelTurnProgressKey(group.id, target.servoId)];
              return (
                <span key={target.servoId}>
                  <strong>
                    ID {target.servoId} {target.name}
                  </strong>
                  <code>
                    {target.effectiveSpeedRaw} raw / acc {target.acc} / {formatLinkageMemberDirection(target.reverse)}
                  </code>
                  <code>
                    {t("metrics.turnProgress")}: {progress ? `${progress.completedTurns.toFixed(2)} / ${progress.targetTurns}` : "--"}
                  </code>
                </span>
              );
            })
          )}
        </div>
      </section>
    );
  }

  function renderMotorLinkageGroupEditor(group: MotorLinkageGroup) {
    const isExpanded = expandedMotorLinkageGroupIds.has(group.id);
    const availableMotors = motors.filter((motor) => !group.members.some((member) => member.channel === motor.channel));

    return (
      <article className={`${group.enabled ? "servo-linkage-group enabled" : "servo-linkage-group"} ${isExpanded ? "expanded" : ""}`.trim()} key={group.id}>
        <div className="servo-linkage-group-header">
          <button className="linkage-summary-button" onClick={() => toggleMotorLinkageGroupExpanded(group.id)} type="button" aria-expanded={isExpanded}>
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="linkage-summary-text">
              <strong>{group.name || t("fields.linkageName")}</strong>
              <small>
                {group.members.length} {t("metrics.members")} / {group.masterSpeedPercent}%
              </small>
            </span>
          </button>
          <label className="checkbox-field linkage-enable">
            <input type="checkbox" checked={group.enabled} onChange={(event) => updateMotorLinkageGroupEnabled(group.id, event.target.checked)} />
            <span>{t("fields.enabled")}</span>
          </label>
          <button className="delete-hit" onClick={() => removeMotorLinkageGroup(group.id)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: group.name })}>
            <Trash2 size={16} />
          </button>
        </div>

        {isExpanded && (
          <div className="servo-linkage-group-body">
            <input
              className="linkage-name-input"
              aria-label={t("fields.linkageName")}
              value={group.name}
              onChange={(event) => updateMotorLinkageGroupName(group.id, event.target.value)}
            />

            <div className="servo-linkage-members">
              {group.members.length === 0 ? (
                <div className="empty-state compact">{t("empty.noMotorLinkageMembers")}</div>
              ) : (
                group.members.map((member) => {
                  const motor = motors.find((item) => item.channel === member.channel);
                  if (!motor) {
                    return null;
                  }

                  return (
                    <div className="linkage-member-row position" key={member.channel}>
                      <span className="device-id">{motor.channel}</span>
                      <span className="linkage-member-name">{motor.name}</span>
                      <label>
                        <span>{t("fields.weightPercent")}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={member.weightPercent}
                          onChange={(event) => updateMotorLinkageMemberWeight(group.id, member.channel, event.target.value)}
                        />
                      </label>
                      <div className="linkage-member-direction">
                        <span>{t("fields.memberDirection")}</span>
                        <div className="linkage-direction-toggle" role="group" aria-label={`${motor.name} ${t("fields.memberDirection")}`}>
                          <button
                            className={!member.reverse ? "active" : ""}
                            onClick={() => updateMotorLinkageMemberReverse(group.id, member.channel, false)}
                            type="button"
                          >
                            {t("fields.forwardRotation")}
                          </button>
                          <button
                            className={member.reverse ? "active" : ""}
                            onClick={() => updateMotorLinkageMemberReverse(group.id, member.channel, true)}
                            type="button"
                          >
                            {t("fields.reverseRotation")}
                          </button>
                        </div>
                      </div>
                      <button className="delete-hit" onClick={() => removeMotorFromLinkageGroup(group.id, member.channel)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: motor.name })}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {availableMotors.length > 0 ? (
              <select className="linkage-add-select" value="" onChange={(event) => addMotorToLinkageGroup(group.id, event.target.value)}>
                <option value="">{t("placeholders.addMotorToGroup")}</option>
                {availableMotors.map((motor) => (
                  <option key={motor.channel} value={motor.channel}>
                    {motor.channel} {motor.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="empty-state compact">{t("empty.noAvailableMotors")}</div>
            )}
          </div>
        )}
      </article>
    );
  }

  function renderMotorLinkageRunCard(group: MotorLinkageGroup) {
    const targets = calculateMotorLinkageTargets(group, motors);

    return (
      <section className="servo-linkage-run-card" key={group.id} aria-label={group.name}>
        <div className="servo-linkage-run-header">
          <div>
            <span>{t("panels.motorLinkage")}</span>
            <strong>{group.name || t("fields.linkageName")}</strong>
          </div>
          <div className="linkage-run-actions">
            <button className="icon-button primary" disabled={targets.length === 0} onClick={() => sendMotorLinkageGroup(group)} type="button">
              <Send size={18} />
              <span>{t("actions.sendMotorLinkage")}</span>
            </button>
            <button className="icon-button danger" disabled={targets.length === 0} onClick={() => stopMotorLinkageGroup(group)} type="button">
              <Square size={18} />
              <span>{t("actions.stopGroup")}</span>
            </button>
          </div>
        </div>

        <div className="linkage-master-control">
          <label>
            <span>{t("fields.masterSpeedPercent")}</span>
            <div className="range-number-control">
              <input
                className="angle-range"
                aria-label={`${group.name} ${t("fields.masterSpeedPercent")}`}
                type="range"
                min={-100}
                max={100}
                step={1}
                value={group.masterSpeedPercent}
                onChange={(event) => updateMotorLinkageMaster(group.id, event.target.value, true)}
              />
              <input
                className="angle-number"
                aria-label={`${group.name} ${t("fields.masterSpeedPercent")}`}
                type="number"
                min={-100}
                max={100}
                step={1}
                value={group.masterSpeedPercent}
                onChange={(event) => updateMotorLinkageMaster(group.id, event.target.value, true)}
              />
            </div>
          </label>
        </div>

        <div className="linkage-target-preview">
          {targets.length === 0 ? (
            <div className="empty-state compact">{t("empty.noMotorLinkageMembers")}</div>
          ) : (
            targets.map((target) => (
              <span key={target.channel}>
                <strong>
                  {target.channel} {target.name}
                </strong>
                <code>
                  {formatSignedPercent(target.speedPercent)} / {target.weightPercent}% / {formatLinkageMemberDirection(target.reverse)}
                </code>
                <code>
                  {t("metrics.direction")}: {formatDirectionLabel(motorFeedback[target.channel]?.direction ?? "stopped")}
                </code>
              </span>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderArmLibrary() {
    return (
      <div className="arm-library-stack">
        <div className="action-grid">
          <button className="icon-button primary" disabled={servos.length === 0 || armConfig.joints.length >= servos.length} onClick={addArmJoint} type="button">
            <ListPlus size={18} />
            <span>{t("actions.addArmJoint")}</span>
          </button>
        </div>
        {armConfig.joints.length === 0 ? (
          <div className="empty-state">{servos.length === 0 ? t("empty.noServos") : t("empty.noArmJoints")}</div>
        ) : (
          <div className="device-list arm-joint-list">
            {armConfig.joints.map((joint, index) => {
              const servo = armServoForJoint(joint);
              return (
                <div className={armConfig.selectedJointId === joint.id ? "device-row arm-joint-row selected" : "device-row arm-joint-row"} key={joint.id}>
                  <button className="device-select" onClick={() => setArmConfig((current) => ({ ...current, selectedJointId: joint.id }))} type="button">
                    <span className="device-id">ID {joint.servoId}</span>
                    <span className="device-info">
                      <span className="device-name">{joint.name}</span>
                      <span className="device-meta">
                        {servo ? `${servo.name} · ${formatServoAngle(joint.angleDeg)} deg · ${joint.lengthPx}px` : t("device.noTelemetry")}
                      </span>
                    </span>
                    <span className={joint.enabled ? "device-signal" : "device-signal muted"}>{joint.enabled ? t("fields.enabled") : t("status.standby")}</span>
                  </button>
                  <div className="arm-joint-actions">
                    <button className="icon-only" disabled={index === 0} onClick={() => moveArmJoint(joint.id, -1)} title={t("actions.moveUp")} type="button" aria-label={t("actions.moveUp")}>
                      <ArrowUp size={16} />
                    </button>
                    <button className="icon-only" disabled={index === armConfig.joints.length - 1} onClick={() => moveArmJoint(joint.id, 1)} title={t("actions.moveDown")} type="button" aria-label={t("actions.moveDown")}>
                      <ArrowDown size={16} />
                    </button>
                    <button className="delete-hit" onClick={() => removeArmJoint(joint.id)} title={t("common.delete")} type="button" aria-label={t("device.deleteNamed", { name: joint.name })}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderArmCanvas() {
    const selectedJointId = armConfig.selectedJointId;
    const activeTargets = calculateArmMotionTargets(armConfig);

    return (
      <div className="arm-simulator">
        <svg
          className="arm-svg"
          viewBox="0 0 600 420"
          role="img"
          aria-label={t("aria.armSimulator")}
          onPointerMove={handleArmPointerMove}
          onPointerUp={handleArmPointerEnd}
          onPointerLeave={handleArmPointerEnd}
        >
          <defs>
            <pattern id="arm-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" />
            </pattern>
          </defs>
          <rect className="arm-grid-bg" x="0" y="0" width="600" height="420" fill="url(#arm-grid)" />
          <line className="arm-axis" x1="40" y1="250" x2="560" y2="250" />
          <line className="arm-axis" x1="300" y1="56" x2="300" y2="364" />
          <circle className="arm-base" cx="300" cy="250" r="10" />
          {armSegmentPoses.map((pose) => {
            const joint = armConfig.joints.find((item) => item.id === pose.jointId);
            const selected = pose.jointId === selectedJointId;
            if (!joint) {
              return null;
            }
            return (
              <g className={selected ? "arm-segment selected" : "arm-segment"} key={pose.jointId}>
                <line x1={pose.startX} y1={pose.startY} x2={pose.endX} y2={pose.endY} />
                <circle
                  className="arm-handle"
                  cx={pose.endX}
                  cy={pose.endY}
                  r={selected ? 12 : 10}
                  tabIndex={0}
                  onPointerDown={(event) => handleArmPointerDown(event, joint)}
                />
                <text className="arm-label" x={pose.endX + 12} y={pose.endY - 12}>
                  ID {pose.servoId} · {formatServoAngle(pose.angleDeg)}° · {pose.lengthPx}px
                </text>
              </g>
            );
          })}
        </svg>
        <div className="arm-status-strip">
          <Metric label={t("metrics.members")} value={activeTargets.length} />
          <Metric label={t("metrics.activeMode")} value={armConfig.liveDragEnabled ? t("arm.live") : t("arm.preview")} tone={armConfig.liveDragEnabled ? "warning" : "neutral"} />
          <Metric label={t("metrics.serial")} value={servoBusConnected() ? t("status.online") : t("status.offline")} tone={servoBusConnected() ? "online" : "danger"} />
        </div>
      </div>
    );
  }

  function renderArmJointEditor() {
    if (!selectedArmJoint) {
      return <div className="empty-state servo-command-empty">{t("empty.noArmJoints")}</div>;
    }

    const servo = armServoForJoint(selectedArmJoint);
    const logicalSpan = servo ? servoLogicalSpan(servo) : 360;
    const usedServoIds = new Set(armConfig.joints.filter((joint) => joint.id !== selectedArmJoint.id).map((joint) => joint.servoId));
    const pose = armSegmentPoses.find((item) => item.jointId === selectedArmJoint.id);
    const target = calculateArmMotionTargets({ ...armConfig, joints: [selectedArmJoint] })[0];
    const framePreview = target ? safeFramePreview(target.servoId, target.servo.name, target.physicalAngleDeg, target.speedRaw, target.acc) : "";

    return (
      <div className="arm-editor-stack">
        {renderArmCanvas()}
        <div className="command-grid arm-editor-grid">
          <label>
            <span>{t("fields.name")}</span>
            <input value={selectedArmJoint.name} onChange={(event) => updateArmJoint(selectedArmJoint.id, (joint) => ({ ...joint, name: event.target.value }))} />
          </label>
          <label>
            <span>{t("fields.targetServo")}</span>
            <select value={selectedArmJoint.servoId} onChange={(event) => updateArmJointServo(selectedArmJoint.id, Number(event.target.value))}>
              {servos.map((item) => (
                <option key={item.id} value={item.id} disabled={usedServoIds.has(item.id)}>
                  ID {item.id} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={selectedArmJoint.enabled} onChange={(event) => updateArmJoint(selectedArmJoint.id, (joint) => ({ ...joint, enabled: event.target.checked }))} />
            <span>{t("fields.enabled")}</span>
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={selectedArmJoint.reverse} onChange={(event) => updateArmJoint(selectedArmJoint.id, (joint) => ({ ...joint, reverse: event.target.checked }), true)} />
            <span>{t("fields.temporaryReverse")}</span>
          </label>
          <label className="angle-combo-field">
            <span>{t("fields.angleDeg")}</span>
            <div className="range-number-control">
              <input type="range" min={0} max={logicalSpan} step={1} value={selectedArmJoint.angleDeg} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "angleDeg", event.target.value, true)} />
              <input type="number" min={0} max={logicalSpan} step={1} value={formatServoAngle(selectedArmJoint.angleDeg)} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "angleDeg", event.target.value, true)} />
            </div>
          </label>
          <label>
            <span>{t("fields.neutralDeg")}</span>
            <input type="number" min={0} max={logicalSpan} step={1} value={formatServoAngle(selectedArmJoint.neutralDeg)} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "neutralDeg", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.segmentLength")}</span>
            <input type="number" min={ARM_MIN_JOINT_LENGTH_PX} max={ARM_MAX_JOINT_LENGTH_PX} step={1} value={selectedArmJoint.lengthPx} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "lengthPx", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.speedRaw")}</span>
            <input type="number" min={0} max={4095} step={1} value={selectedArmJoint.speedRaw} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "speedRaw", event.target.value)} />
          </label>
          <label>
            <span>{t("fields.acceleration")}</span>
            <input type="number" min={0} max={254} step={1} value={selectedArmJoint.acc} onChange={(event) => updateArmJointNumber(selectedArmJoint.id, "acc", event.target.value)} />
          </label>
        </div>
        <div className="preview-grid arm-preview-grid">
          <Metric label={t("metrics.relativeAngle")} value={pose ? formatServoAngle(pose.relativeDeg) : "--"} suffix={pose ? " deg" : ""} />
          <Metric label={t("metrics.globalAngle")} value={pose ? formatServoAngle(pose.globalDeg) : "--"} suffix={pose ? " deg" : ""} />
          <Metric label={t("metrics.rawPosition")} value={target ? angleDegToRaw(target.physicalAngleDeg) : "--"} />
          <Metric className="frame-preview" label={t("metrics.frame")} value={framePreview || "--"} code />
        </div>
        <div className="action-grid">
          <label className="checkbox-field arm-live-toggle">
            <input type="checkbox" checked={armConfig.liveDragEnabled} onChange={(event) => setArmLiveDragEnabled(event.target.checked)} />
            <span>{t("fields.liveDrag")}</span>
          </label>
          <button className="icon-button primary" onClick={sendArmPose} type="button">
            <Send size={18} />
            <span>{t("actions.sendArmPose")}</span>
          </button>
          <button className="icon-button danger" onClick={pauseArm} type="button">
            <Square size={18} />
            <span>{t("actions.pauseArm")}</span>
          </button>
        </div>
      </div>
    );
  }

  function renderServoCommandCard(servo: ServoProfile) {
    const state = getServoCommandState(servoCommandById, servo.id);
    const numericAngle = Number(state.angleDeg);
    const numericSpeed = Number(state.speedRaw);
    const numericAcc = state.acc.trim() === "" ? undefined : Number(state.acc);
    const logicalSpan = servoLogicalSpan(servo);
    const clampedLogicalAngle = clampServoLogicalAngle(servo, numericAngle);
    const physicalAngle = servoLogicalToPhysicalAngleWithReverse(servo, numericAngle, state.reverse);
    const wheelSliderValue =
      state.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : clampWheelSliderDeg(Number(state.wheelSliderDeg));
    const wheelSliderInputValue = state.wheelSliderDeg.trim() === "" ? "" : formatServoAngle(wheelSliderValue);
    const wheelMaxSpeedRaw = state.speedRaw.trim() === "" ? 0 : normalizeWheelMaxSpeedRaw(numericSpeed);
    const commandWheelSpeedRaw = state.mode === "wheel" ? wheelSliderToCommandSpeedRaw(wheelSliderValue, wheelMaxSpeedRaw) : 0;
    const wheelDirection = wheelSliderDirection(wheelSliderValue);
    const effectiveWheelSpeed =
      state.mode === "wheel"
        ? applyServoWheelDirection(servo, commandWheelSpeedRaw, state.reverse)
        : Number.isFinite(numericSpeed)
          ? applyServoWheelDirection(servo, numericSpeed, state.reverse)
          : Number.NaN;
    const angleSliderValue = Number.isFinite(numericAngle) ? formatServoAngle(clampedLogicalAngle) : "0";
    const rawPosition = state.mode === "position" && Number.isFinite(numericAngle) ? angleDegToRaw(physicalAngle) : "--";
    const speedRpm = state.mode === "wheel" ? Math.abs(commandWheelSpeedRaw) * 0.732 : Number.isFinite(numericSpeed) ? Math.abs(numericSpeed) * 0.732 : 0;
    const turnProgress = wheelTurnProgress[singleWheelTurnProgressKey(servo.id)];
    const motionStatus = servoMotionStatusById[servo.id] ?? "idle";
    const previewFrame =
      (state.mode === "wheel" || Number.isFinite(numericSpeed)) && (state.mode === "wheel" || Number.isFinite(numericAngle))
        ? state.mode === "wheel"
          ? safeSpeedFramePreview(servo.id, servo.name, effectiveWheelSpeed, numericAcc)
          : safeFramePreview(servo.id, servo.name, physicalAngle, numericSpeed, numericAcc)
        : "";
    const feedback = servoFeedback[servo.id];
    const safetyStatus = servoSafetyStatusById[servo.id];
    const safetyTone = servoSafetyStatusTone(safetyStatus);

    return (
      <article className={selectedId === servo.id ? "servo-command-card selected" : "servo-command-card"} key={servo.id}>
        <div className="servo-command-card-header">
          <button className="servo-card-select" onClick={() => setSelectedId(servo.id)} type="button">
            <span className="device-id">ID {servo.id}</span>
            <span className="device-name">{servo.name}</span>
          </button>
          <div className="servo-card-status-stack">
            <span className={motionStatus === "smoothing" ? "device-signal motion" : motionStatus === "paused" ? "device-signal motion paused" : "device-signal motion muted"}>
              {servoMotionStatusLabel(motionStatus)}
            </span>
            <span className={`device-signal safety ${safetyTone}`}>
              {servoSafetyStatusLabel(safetyStatus)}
            </span>
            <span className={feedback ? "device-signal" : "device-signal muted"}>
              {feedback ? (feedback.moving ? "运动中" : t("device.data")) : t("device.idle")}
            </span>
          </div>
        </div>

        <div className="command-grid servo-command-grid">
          <label>
            <span>控制模式</span>
            <select value={state.mode} onChange={(event) => handleServoModeChange(servo.id, event.target.value as ServoControlMode)}>
              <option value="position">位置角度</option>
              <option value="wheel">轮模式速度</option>
            </select>
          </label>
          {state.mode === "wheel" ? (
            <div className="angle-combo-field wheel-slider-field">
              <div className="angle-field-heading">
                <span>{t("fields.wheelSliderDeg")}</span>
                <span className={`wheel-direction-pill ${wheelDirection}`}>{formatWheelSliderDirectionLabel(wheelDirection)}</span>
              </div>
              <div className="range-number-control">
                <input
                  className="angle-range"
                  aria-label={`${servo.name} ${t("fields.wheelSliderDeg")}`}
                  type="range"
                  min={WHEEL_SLIDER_MIN_DEG}
                  max={WHEEL_SLIDER_MAX_DEG}
                  step={1}
                  value={formatServoAngle(wheelSliderValue)}
                  onChange={(event) => handleWheelSliderChange(servo, state, event)}
                />
                <input
                  className="angle-number"
                  aria-label={`${servo.name} ${t("fields.wheelSliderDeg")}`}
                  type="number"
                  min={WHEEL_SLIDER_MIN_DEG}
                  max={WHEEL_SLIDER_MAX_DEG}
                  step={1}
                  value={wheelSliderInputValue}
                  onChange={(event) => updateServoWheelSlider(servo, state, event.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="angle-combo-field">
              <div className="angle-field-heading">
                <span>{t("fields.angleDeg")}</span>
                <label className="live-drag-toggle">
                  <input
                    checked={state.liveDragEnabled}
                    type="checkbox"
                    onChange={(event) => handleLiveDragToggle(servo.id, event.target.checked)}
                  />
                  <span>实时拖动</span>
                </label>
              </div>
              <div className="range-number-control">
                <input
                  className="angle-range"
                  aria-label={`${servo.name} ${t("fields.angleDeg")}`}
                  type="range"
                  min={0}
                  max={logicalSpan}
                  step={1}
                  value={angleSliderValue}
                  onChange={(event) => handleAngleSliderChange(servo, state, event)}
                />
                <input
                  className="angle-number"
                  aria-label={`${servo.name} ${t("fields.angleDeg")}`}
                  type="number"
                  min={0}
                  max={logicalSpan}
                  step={1}
                  value={state.angleDeg}
                  onChange={(event) => updateServoLogicalAngle(servo, event.target.value)}
                />
              </div>
            </div>
          )}
          <label>
            <span>{state.mode === "wheel" ? t("fields.wheelMaxSpeedRaw") : t("fields.speedRaw")}</span>
            <input
              type="number"
              min={0}
              max={state.mode === "wheel" ? DEFAULT_WHEEL_SPEED_LIMIT : 4095}
              step={1}
              value={state.speedRaw}
              onChange={(event) =>
                state.mode === "wheel"
                  ? updateServoWheelMaxSpeed(servo, state, event.target.value)
                  : updateServoCommandField(servo.id, "speedRaw", event.target.value)
              }
            />
          </label>
          <label>
            <span>{t("fields.acceleration")}</span>
            <input
              type="number"
              min={0}
              max={254}
              step={1}
              value={state.acc}
              onChange={(event) => updateServoCommandField(servo.id, "acc", event.target.value)}
            />
          </label>
        </div>

        <div className="servo-extra-grid">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={state.reverse}
              onChange={(event) => updateServoCommandField(servo.id, "reverse", event.target.checked)}
            />
            <span>{t("fields.temporaryReverse")}</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={state.wheelTurnsEnabled}
              disabled={state.mode !== "wheel"}
              onChange={(event) => updateServoCommandField(servo.id, "wheelTurnsEnabled", event.target.checked)}
            />
            <span>{t("fields.limitTurns")}</span>
          </label>
          <label>
            <span>{t("fields.turnsTarget")}</span>
            <input
              type="number"
              min={0.01}
              step={0.1}
              disabled={state.mode !== "wheel" || !state.wheelTurnsEnabled}
              value={state.wheelTurnsTarget}
              onChange={(event) => updateServoCommandField(servo.id, "wheelTurnsTarget", event.target.value)}
            />
          </label>
          <Metric
            label={t("metrics.turnProgress")}
            value={turnProgress ? `${turnProgress.completedTurns.toFixed(2)} / ${turnProgress.targetTurns}` : "--"}
            tone={turnProgress?.running ? "warning" : "neutral"}
          />
        </div>

        <div className="preview-grid servo-card-preview-grid">
          <Metric
            label="实际角度"
            value={state.mode === "position" && Number.isFinite(numericAngle) ? physicalAngle.toFixed(0) : "--"}
            suffix={state.mode === "position" && Number.isFinite(numericAngle) ? " deg" : ""}
          />
          <Metric label={t("metrics.rawPosition")} value={rawPosition} />
          {state.mode === "wheel" ? (
            <>
              <Metric label={t("metrics.direction")} value={formatWheelSliderDirectionLabel(wheelDirection)} />
              <Metric label={t("metrics.commandSpeedRaw")} value={commandWheelSpeedRaw} suffix=" raw" />
            </>
          ) : null}
          <Metric label={t("metrics.speed")} value={Number.isFinite(speedRpm) ? speedRpm.toFixed(1) : "--"} suffix={Number.isFinite(speedRpm) ? " rpm" : ""} />
          <Metric className="frame-preview" label={t("metrics.frame")} value={previewFrame || "--"} code />
        </div>

        <div className="servo-card-telemetry">
          <span>
            <small>{t("metrics.position")}</small>
            <strong>{feedback?.positionRaw ?? "--"}</strong>
          </span>
          <span>
            <small>{t("metrics.load")}</small>
            <strong>{feedback?.loadRaw ?? "--"}</strong>
          </span>
          <span>
            <small>{t("metrics.voltage")}</small>
            <strong>{feedback?.voltageRaw ?? "--"}</strong>
          </span>
          <span>
            <small>{t("metrics.temp")}</small>
            <strong>{feedback ? `${feedback.temperatureC}°C` : "--"}</strong>
          </span>
          <span>
            <small>{t("metrics.moving")}</small>
            <strong>{feedback ? (feedback.moving ? t("common.yes") : t("common.no")) : "--"}</strong>
          </span>
          <span>
            <small>{t("metrics.current")}</small>
            <strong>{feedback?.currentRaw ?? "--"}</strong>
          </span>
          <span>
            <small>{t("metrics.safety")}</small>
            <strong>{servoSafetyStatusLabel(safetyStatus)}</strong>
          </span>
        </div>

        <div className="action-grid servo-card-actions">
          <button className="icon-button primary" onClick={() => sendMoveForServo(servo, state)} type="button">
            <Send size={18} />
            <span>{t("actions.sendCommand")}</span>
          </button>
          <button className="icon-button danger" onClick={() => pauseServo(servo, state)} type="button">
            <Square size={18} />
            <span>{t("actions.pause")}</span>
          </button>
          <button className="icon-button" onClick={() => pingServo(servo)} type="button">
            <Radar size={18} />
            <span>{t("actions.ping")}</span>
          </button>
          <button className="icon-button" onClick={() => readServo(servo)} type="button">
            <Activity size={18} />
            <span>{t("actions.readFeedback")}</span>
          </button>
          <button className="icon-button" onClick={() => setTorqueForServo(servo, true)} type="button">
            <Power size={18} />
            <span>{t("actions.torqueOn")}</span>
          </button>
          <button className="icon-button" onClick={() => setTorqueForServo(servo, false)} type="button">
            <PowerOff size={18} />
            <span>{t("actions.torqueOff")}</span>
          </button>
        </div>
      </article>
    );
  }

  function renderContextTabs() {
    if (activeSection === "console") {
      return null;
    }

    return (
      <section className="panel context-tabs-panel" aria-label={t("aria.contextTabs")}>
        <div className="context-tabs-title">
          <strong>{activeSectionLabel}</strong>
          <span>{activeModuleLabel}</span>
        </div>
        {activeSection === "components" ? (
          <div className="context-tabs" role="tablist">
            <button className={activeComponent === "arm" ? "module-tab active" : "module-tab"} onClick={() => selectComponentPanel("arm")} type="button">
              <SlidersHorizontal size={17} />
              <span>{t("componentTabs.arm")}</span>
            </button>
            <button className={activeComponent === "drive" ? "module-tab active" : "module-tab"} onClick={() => selectComponentPanel("drive")} type="button">
              <Gamepad2 size={17} />
              <span>{t("componentTabs.drive")}</span>
            </button>
            <button className={activeComponent === "camera" ? "module-tab active" : "module-tab"} onClick={() => selectComponentPanel("camera")} type="button">
              <Camera size={17} />
              <span>{t("componentTabs.camera")}</span>
            </button>
          </div>
        ) : activeSection === "tests" ? (
          <div className="context-tabs" role="tablist">
            <button className={activeTest === "servo" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("servo")} type="button">
              <Settings size={17} />
              <span>{t("testTabs.servo")}</span>
            </button>
            <button className={activeTest === "motor" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("motor")} type="button">
              <Cpu size={17} />
              <span>{t("testTabs.motor")}</span>
            </button>
          </div>
        ) : (
          <div className="context-tabs" role="tablist">
            <button className="module-tab active" onClick={() => selectModule("mapping")} type="button">
              <Keyboard size={17} />
              <span>{t("settingsTabs.input")}</span>
            </button>
          </div>
        )}
      </section>
    );
  }

  function renderVirtualJoystick(kind: "camera" | "drive", label: string, caption: string, x: number, y: number) {
    return (
      <div className="virtual-joystick">
        <div className="virtual-joystick-head">
          <strong>{label}</strong>
          <small>{caption}</small>
        </div>
        <div
          className="joystick-base"
          role="application"
          tabIndex={0}
          aria-label={`${label} ${t("aria.virtualJoystick")}`}
          onPointerDown={(event) => handleVirtualStickDown(event, kind)}
          onPointerMove={(event) => handleVirtualStickMove(event, kind)}
          onPointerUp={() => resetVirtualStick(kind)}
          onPointerCancel={() => resetVirtualStick(kind)}
        >
          <span className="joystick-axis horizontal" />
          <span className="joystick-axis vertical" />
          <span
            className="joystick-knob"
            style={{ transform: `translate(calc(-50% + ${x * 42}px), calc(-50% + ${y * 42}px))` }}
          />
        </div>
      </div>
    );
  }

  function renderConsolePage() {
    const servoTelemetryItems = Object.values(servoFeedback);
    const voltageValue = servoTelemetryItems.find((item) => item.voltageRaw !== undefined)?.voltageRaw ?? "--";
    const currentValue = servoTelemetryItems.find((item) => item.currentRaw !== undefined)?.currentRaw ?? "--";
    const temperatureValue = servoTelemetryItems.find((item) => item.temperatureC !== undefined)?.temperatureC ?? "--";
    const movingServoCount = servoTelemetryItems.filter((item) => item.moving).length;
    const driveStickX = activeDriveBase === "mecanum" ? virtualDriveInput.strafe : virtualDriveInput.turn;
    const driveStickY = -virtualDriveInput.forward;
    const cameraStickX = virtualDriveInput.cameraPan;
    const cameraStickY = -virtualDriveInput.cameraTilt;

    return (
      <section className="panel console-page-panel" aria-labelledby="main-console-title">
        <PanelTitle icon={<Gauge size={18} />} id="main-console-title" meta={activeSectionLabel} title={t("console.main")} />

        <div className="console-grid">
          <section className="console-card console-telemetry" aria-labelledby="robot-telemetry-title">
            <div className="drive-section-title">
              <Activity size={17} />
              <h3 id="robot-telemetry-title">{t("console.robotTelemetry")}</h3>
            </div>
            <div className="console-metric-grid">
              <Metric label={t("metrics.voltage")} value={voltageValue} />
              <Metric label={t("metrics.current")} value={currentValue} />
              <Metric label={t("metrics.temp")} value={temperatureValue} suffix={temperatureValue === "--" ? "" : "°C"} />
              <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
              <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} />
              <Metric label={t("metrics.activeBase")} value={activeDriveBase === "tracked" ? t("drive.tracked") : t("drive.mecanum")} />
              <Metric label={t("metrics.servoCount")} value={servos.length} />
              <Metric label={t("metrics.motorCount")} value={`${completeMotorMappingCount}/${motors.length}`} />
              <Metric label={t("metrics.moving")} value={movingServoCount} tone={movingServoCount > 0 ? "warning" : "neutral"} />
              <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} />
            </div>
            <p className="console-note">{t("console.telemetryNote")}</p>
          </section>

          <section className="console-card console-camera" aria-labelledby="console-camera-title">
            <div className="drive-section-title">
              <Video size={17} />
              <h3 id="console-camera-title">{t("console.camera")}</h3>
            </div>
            <div className="camera-viewer console-camera-viewer">
              {cameraStreamUrl ? (
                <img
                  alt={t("camera.streamAlt")}
                  src={cameraStreamUrl}
                  onError={() => {
                    setCameraStreamLoaded(false);
                    setCameraStreamFailed(true);
                  }}
                  onLoad={() => {
                    setCameraStreamLoaded(true);
                    setCameraStreamFailed(false);
                  }}
                />
              ) : (
                <div className="camera-placeholder">
                  <VideoOff size={42} />
                  <span>{t("empty.noCameraStream")}</span>
                </div>
              )}
              <span className={cameraStreamFailed ? "camera-stream-badge error" : cameraStreamLoaded ? "camera-stream-badge online" : "camera-stream-badge"}>
                {cameraStreamUrl
                  ? cameraStreamFailed
                    ? t("status.streamError")
                    : cameraStreamLoaded
                      ? t("status.streamOnline")
                      : t("status.streamLoading")
                  : t("status.streamMissing")}
              </span>
            </div>
          </section>

          <section className="console-card console-pose" aria-labelledby="robot-pose-title">
            <div className="drive-section-title">
              <SlidersHorizontal size={17} />
              <h3 id="robot-pose-title">{t("console.pose")}</h3>
            </div>
            <div className="console-arm-preview">{renderArmCanvas()}</div>
            <div className="drive-vector-grid console-vector-grid">
              <Metric label={t("metrics.forward")} value={Math.round(driveInput.forward * 100)} suffix="%" />
              <Metric label={t("metrics.strafe")} value={Math.round(driveInput.strafe * 100)} suffix="%" />
              <Metric label={t("metrics.turn")} value={Math.round(driveInput.turn * 100)} suffix="%" />
            </div>
          </section>

          <section className="console-card console-control" aria-labelledby="console-control-title">
            <div className="drive-section-title">
              <Gamepad2 size={17} />
              <h3 id="console-control-title">{t("console.control")}</h3>
            </div>
            <div className="drive-base-switch console-base-switch" aria-label={t("aria.driveBase")}>
              <button className={activeDriveBase === "tracked" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("tracked")} type="button">
                <span>{t("drive.tracked")}</span>
              </button>
              <button className={activeDriveBase === "mecanum" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("mecanum")} type="button">
                <span>{t("drive.mecanum")}</span>
              </button>
            </div>
            <div className="joystick-grid">
              {renderVirtualJoystick("drive", t("console.driveStick"), activeDriveBase === "mecanum" ? t("console.driveStickMecanum") : t("console.driveStickTracked"), driveStickX, driveStickY)}
              {renderVirtualJoystick("camera", t("console.cameraStick"), t("console.cameraStickHint"), cameraStickX, cameraStickY)}
            </div>
            <button className="icon-button danger drive-stop-button" onClick={() => stopAllMotors()} type="button">
              <Square size={18} />
              <span>{t("actions.stopAll")}</span>
            </button>
            <div className="preview-grid console-output-grid">
              <Metric className="frame-preview" label={t("metrics.driveOutput")} value={drivePreviewCommand || "--"} code />
              <Metric className="frame-preview" label={t("metrics.cameraOutput")} value={cameraPreviewCommand || "--"} code />
            </div>
          </section>

          <section className="console-card console-log" aria-labelledby="console-log-title">
            <div className="drive-section-title">
              <Activity size={17} />
              <h3 id="console-log-title">{t("panels.eventLog")}</h3>
            </div>
            <div className="console-log-list">
              {logs.length === 0 ? (
                <div className="empty-state">{t("empty.noLogs")}</div>
              ) : (
                logs.slice(0, 8).map((log) => (
                  <div className={`log-entry ${log.direction} ${log.level ?? "info"}`} key={log.id}>
                    <span>{log.direction.toUpperCase()}</span>
                    <code>{log.text ?? t(log.messageKey ?? "", log.values)}</code>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderDrivePage() {
    return (
      <section className="panel drive-page-panel" aria-labelledby="drive-page-title">
        <div className="drive-page-header">
          <PanelTitle
            icon={<Video size={18} />}
            id="drive-page-title"
            meta={driveCanCommand ? t("status.ready") : t("status.standby")}
            title={t("panels.driveCamera")}
          />
        </div>

        <div className="drive-page-grid">
          <section className="drive-page-status" aria-labelledby="drive-status-title">
            <div className="drive-section-title">
              <Play size={17} />
              <h3 id="drive-status-title">{t("panels.driveStatus")}</h3>
            </div>
            <div className="drive-status-grid">
              <Metric
                label={t("metrics.stream")}
                value={
                  cameraStreamUrl
                    ? cameraStreamFailed
                      ? t("status.streamError")
                      : cameraStreamLoaded
                        ? t("status.streamOnline")
                        : t("status.streamLoading")
                    : t("status.streamMissing")
                }
                tone={cameraStreamFailed ? "danger" : cameraStreamLoaded ? "online" : "neutral"}
              />
              <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
              <Metric label={t("status.debugMode")} value={debugEnabled ? t("status.debug") : t("status.standby")} tone={debugEnabled ? "warning" : "neutral"} />
              <Metric label={t("metrics.gimbal")} value={cameraValidationError ? t("status.configInvalid") : cameraCanCommand ? t("status.ready") : t("status.standby")} tone={cameraValidationError ? "danger" : cameraCanCommand ? "online" : "neutral"} />
              <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} />
              <Metric label={t("metrics.activeBase")} value={activeDriveBase === "tracked" ? t("drive.tracked") : t("drive.mecanum")} />
              <Metric label={t("metrics.forward")} value={Math.round(driveInput.forward * 100)} suffix="%" />
              <Metric label={t("metrics.strafe")} value={Math.round(driveInput.strafe * 100)} suffix="%" />
              <Metric label={t("metrics.turn")} value={Math.round(driveInput.turn * 100)} suffix="%" />
              <Metric label={t("metrics.cameraPan")} value={Math.round(driveInput.cameraPan * 100)} suffix="%" />
              <Metric label={t("metrics.cameraTilt")} value={Math.round(driveInput.cameraTilt * 100)} suffix="%" />
              <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} />
            </div>
            <div className="drive-target-list drive-status-targets" aria-label={t("aria.driveTargets")}>
              {driveTargets.map((target) => (
                <div className="drive-target-row" key={target.channel}>
                  <span>{target.channel}</span>
                  <strong>{target.speedPercent}%</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="drive-page-camera" aria-label={t("panels.driveCamera")}>
            <div className="camera-viewer">
              {cameraStreamUrl ? (
                <img
                  alt={t("camera.streamAlt")}
                  src={cameraStreamUrl}
                  onError={() => {
                    setCameraStreamLoaded(false);
                    setCameraStreamFailed(true);
                  }}
                  onLoad={() => {
                    setCameraStreamLoaded(true);
                    setCameraStreamFailed(false);
                  }}
                />
              ) : (
                <div className="camera-placeholder">
                  <VideoOff size={42} />
                  <span>{t("empty.noCameraStream")}</span>
                </div>
              )}
              <span className={cameraStreamFailed ? "camera-stream-badge error" : cameraStreamLoaded ? "camera-stream-badge online" : "camera-stream-badge"}>
                {cameraStreamUrl
                  ? cameraStreamFailed
                    ? t("status.streamError")
                    : cameraStreamLoaded
                      ? t("status.streamOnline")
                      : t("status.streamLoading")
                  : t("status.streamMissing")}
              </span>
            </div>
          </section>

          <section className="drive-page-controller" aria-labelledby="drive-controller-title">
            <div className="drive-section-title">
              <Gamepad2 size={17} />
              <h3 id="drive-controller-title">{t("panels.driveController")}</h3>
            </div>
            <div className="drive-base-switch" aria-label={t("aria.driveBase")}>
              <button className={activeDriveBase === "tracked" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("tracked")} type="button">
                <span>{t("drive.tracked")}</span>
              </button>
              <button className={activeDriveBase === "mecanum" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("mecanum")} type="button">
                <span>{t("drive.mecanum")}</span>
              </button>
            </div>

            <button className="icon-button danger drive-stop-button" onClick={() => stopAllMotors()} type="button">
              <Square size={18} />
              <span>{t("actions.stopAll")}</span>
            </button>

            <div className="gimbal-pad" aria-label={t("aria.gimbalControls")}>
              <button className="icon-only pad-up" disabled={!cameraCanCommand} onClick={() => nudgeCamera(0, cameraConfig.stepDeg)} title={t("actions.tiltUp")} type="button" aria-label={t("actions.tiltUp")}>
                <ArrowUp size={18} />
              </button>
              <button className="icon-only pad-left" disabled={!cameraCanCommand} onClick={() => nudgeCamera(-cameraConfig.stepDeg, 0)} title={t("actions.panLeft")} type="button" aria-label={t("actions.panLeft")}>
                <ArrowLeft size={18} />
              </button>
              <button className="icon-only pad-center" disabled={!cameraCanCommand} onClick={centerCamera} title={t("actions.centerCamera")} type="button" aria-label={t("actions.centerCamera")}>
                <Crosshair size={18} />
              </button>
              <button className="icon-only pad-right" disabled={!cameraCanCommand} onClick={() => nudgeCamera(cameraConfig.stepDeg, 0)} title={t("actions.panRight")} type="button" aria-label={t("actions.panRight")}>
                <ArrowRight size={18} />
              </button>
              <button className="icon-only pad-down" disabled={!cameraCanCommand} onClick={() => nudgeCamera(0, -cameraConfig.stepDeg)} title={t("actions.tiltDown")} type="button" aria-label={t("actions.tiltDown")}>
                <ArrowDown size={18} />
              </button>
            </div>

            <div className="drive-controller-notes">
              <div className="camera-command-note">
                {driveCanCommand ? t("drive.commandReady") : connected ? t("drive.enableDebug") : t("drive.connectSerial")}
              </div>
              <div className="camera-command-note">
                {cameraCanCommand ? t("camera.gimbalReady") : connected ? t("camera.enableDebug") : t("camera.connectSerial")}
              </div>
            </div>

            <div className="preview-grid drive-controller-preview">
              <Metric className="frame-preview" label={t("metrics.driveOutput")} value={drivePreviewCommand || "--"} code />
              <Metric className="frame-preview" label={t("metrics.cameraOutput")} value={cameraPreviewCommand || "--"} code />
            </div>
          </section>

          <form className="drive-page-params" onSubmit={saveCameraSettings} aria-labelledby="drive-params-title">
            <div className="drive-section-title full-field">
              <SlidersHorizontal size={17} />
              <h3 id="drive-params-title">{t("panels.driveParameters")}</h3>
            </div>
            <label>
              <span>{t("fields.speedLimit")}: {speedLimitPercent.toFixed(0)}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={driveSpeedLimit}
                onChange={(event) => setDriveSpeedLimit(event.target.value)}
              />
            </label>
            <label>
              <span>{t("fields.stopMode")}</span>
              <select value={stopMode} onChange={(event) => setStopMode(event.target.value as MotorStopMode)}>
                <option value="coast">{t("stopMode.coast")}</option>
                <option value="brake">{t("stopMode.brake")}</option>
              </select>
            </label>
            <label className="drive-param-wide">
              <span>{t("fields.streamUrl")}</span>
              <input
                placeholder={t("placeholders.streamUrl")}
                type="url"
                value={cameraConfig.streamUrl}
                onChange={(event) => updateCameraText(event.target.value)}
              />
            </label>
            <label>
              <span>{t("fields.panServoId")}</span>
              <input inputMode="numeric" min={0} max={253} step={1} type="number" value={cameraConfig.panServoId} onChange={(event) => updateCameraNumber("panServoId", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.tiltServoId")}</span>
              <input inputMode="numeric" min={0} max={253} step={1} type="number" value={cameraConfig.tiltServoId} onChange={(event) => updateCameraNumber("tiltServoId", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.panMinDeg")}</span>
              <input type="number" min={0} max={360} step={1} value={cameraConfig.panMinDeg} onChange={(event) => updateCameraNumber("panMinDeg", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.panMaxDeg")}</span>
              <input type="number" min={0} max={360} step={1} value={cameraConfig.panMaxDeg} onChange={(event) => updateCameraNumber("panMaxDeg", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.tiltMinDeg")}</span>
              <input type="number" min={0} max={360} step={1} value={cameraConfig.tiltMinDeg} onChange={(event) => updateCameraNumber("tiltMinDeg", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.tiltMaxDeg")}</span>
              <input type="number" min={0} max={360} step={1} value={cameraConfig.tiltMaxDeg} onChange={(event) => updateCameraNumber("tiltMaxDeg", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.stepDeg")}</span>
              <input type="number" min={1} max={90} step={1} value={cameraConfig.stepDeg} onChange={(event) => updateCameraNumber("stepDeg", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.speedRaw")}</span>
              <input type="number" min={0} max={4095} step={1} value={cameraConfig.speedRaw} onChange={(event) => updateCameraNumber("speedRaw", event.target.value)} />
            </label>
            <label>
              <span>{t("fields.acceleration")}</span>
              <input type="number" min={0} max={254} step={1} value={cameraConfig.acc} onChange={(event) => updateCameraNumber("acc", event.target.value)} />
            </label>
            <button className="icon-button primary drive-param-save" type="submit">
              <Save size={18} />
              <span>{t("actions.saveCamera")}</span>
            </button>
            {(cameraConfigError || cameraValidationError) && <p className="form-error full-field">{t(cameraConfigError ?? cameraValidationError ?? "")}</p>}
          </form>
        </div>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar glass-surface">
        <div className="brand-block">
          <span className="brand-mark">RR</span>
          <div className="brand-copy">
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
            <p className="system-line">
              {isServoBusModule(activeModule) ? `USB Serial · 1000000 baud · ${activeModuleLabel}` : t("app.systemLine", { module: activeModuleLabel })}
            </p>
          </div>
        </div>
        <div className="system-strip" aria-label={t("aria.systemStatus")}>
          <StatusCard label={t("status.serialLink")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
          <StatusCard label={t("status.debugMode")} value={debugLabel} tone={debugEnabled ? "warning" : "neutral"} />
          <StatusCard label={t("database.label")} value={databaseStatusValue} tone={databaseStatusTone(databaseStatus)} />
          <StatusCard label={t("database.project")} value={projectStatusValue} tone={currentProject ? "online" : "warning"} />
          <StatusCard label={t("database.lastSave")} value={databaseDetailValue} tone={databaseStatusTone(databaseStatus)} />
          <StatusCard
            label={t("status.module")}
            value={
              activeModule === "servo"
                ? t("module.servoValue")
                : activeModule === "arm"
                  ? t("module.armValue")
                  : activeModule === "motor"
                    ? t("module.motorValue")
                    : activeModule === "mapping"
                      ? t("module.mappingValue")
                      : t("module.cameraValue")
            }
            tone="neutral"
          />
        </div>
      </header>

      <section className="control-bar glass-surface" aria-label={t("aria.connectionControls")}>
        <div className="control-actions">
          <button className="icon-button primary" onClick={connected ? disconnectSerial : connectSerial} type="button">
            {connected ? <Unplug size={18} /> : <Usb size={18} />}
            <span>{connected ? t("actions.disconnectSerial") : t("actions.connectSerial")}</span>
          </button>
          <button
            className={debugEnabled ? "icon-button danger" : "icon-button"}
            disabled={isServoBusModule(activeModule)}
            onClick={toggleDebugMode}
            title={isServoBusModule(activeModule) ? t("arm.directBusHint") : ""}
            type="button"
          >
            <Cable size={18} />
            <span>{debugEnabled ? t("actions.exitDebug") : t("actions.enterDebug")}</span>
          </button>
        </div>

        <div className="module-switch" aria-label={t("aria.debugModule")}>
          <button className={activeModule === "servo" ? "module-tab active" : "module-tab"} onClick={() => selectModule("servo")} type="button">
            <Settings size={17} />
            <span>{t("module.servo")}</span>
          </button>
          <button className={activeModule === "arm" ? "module-tab active" : "module-tab"} onClick={() => selectModule("arm")} type="button">
            <SlidersHorizontal size={17} />
            <span>{t("module.arm")}</span>
          </button>
          <button className={activeModule === "motor" ? "module-tab active" : "module-tab"} onClick={() => selectModule("motor")} type="button">
            <Cpu size={17} />
            <span>{t("module.motor")}</span>
          </button>
          <button className={activeModule === "camera" ? "module-tab active" : "module-tab"} onClick={() => selectModule("camera")} type="button">
            <Camera size={17} />
            <span>{t("module.camera")}</span>
          </button>
          <button className={activeModule === "mapping" ? "module-tab active" : "module-tab"} onClick={() => selectModule("mapping")} type="button">
            <Keyboard size={17} />
            <span>{t("module.mapping")}</span>
          </button>
        </div>

        <div className="project-switch" aria-label={t("database.project")}>
          <select
            aria-label={t("database.selectProject")}
            disabled={databaseStatus === "offline" || databaseStatus === "loading" || projects.length === 0}
            value={currentProject?.id ?? ""}
            onChange={(event) => void changeCurrentProject(event.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">{t("database.noProject")}</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            )}
          </select>
          <input
            aria-label={t("database.newProject")}
            disabled={databaseStatus === "offline"}
            placeholder={t("database.newProject")}
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
          />
          <button className="icon-button" disabled={databaseStatus === "offline" || !newProjectName.trim()} onClick={() => void createNewProject()} type="button">
            <ListPlus size={18} />
            <span>{t("database.createProject")}</span>
          </button>
        </div>

        <div className={webSerialAvailable ? "serial-note" : "serial-note unavailable"}>
          {webSerialAvailable ? (isServoBusModule(activeModule) ? "Feetech Bus · 1000000 baud" : t("webSerial.ready")) : t("webSerial.unavailable")}
        </div>

        <label className="language-select">
          <span>
            <Languages size={16} />
            {t("language.label")}
          </span>
          <select aria-label={t("language.select")} value={currentLanguage} onChange={changeLanguage}>
            {supportedLanguages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="workspace">
        {activeModule === "camera" ? (
          renderDrivePage()
        ) : (
          <>
        <section className="panel library-panel" aria-labelledby="device-library-title">
          <PanelTitle
            icon={<ListPlus size={18} />}
            id="device-library-title"
            meta={activeModuleMeta}
            title={
              activeModule === "servo"
                ? t("panels.servoLibrary")
                : activeModule === "arm"
                  ? t("panels.armJoints")
                  : activeModule === "motor"
                    ? t("panels.motorLibrary")
                    : activeModule === "mapping"
                      ? t("panels.inputSettings")
                      : t("panels.cameraSettings")
            }
          />

          {activeModule === "mapping" ? (
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
                </span>
              </div>

              <label className="speed-slider-field">
                <span>{t("fields.deadzone")}: {mappingDraft.gamepad.deadzone.toFixed(2)}</span>
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
          ) : activeModule === "arm" ? (
            renderArmLibrary()
          ) : false ? (
            <form className="camera-settings-grid" onSubmit={saveCameraSettings}>
              <label className="full-field">
                <span>{t("fields.streamUrl")}</span>
                <input
                  placeholder={t("placeholders.streamUrl")}
                  type="url"
                  value={cameraConfig.streamUrl}
                  onChange={(event) => updateCameraText(event.target.value)}
                />
              </label>
              <label>
                <span>{t("fields.panServoId")}</span>
                <input
                  inputMode="numeric"
                  min={0}
                  max={253}
                  step={1}
                  type="number"
                  value={cameraConfig.panServoId}
                  onChange={(event) => updateCameraNumber("panServoId", event.target.value)}
                />
              </label>
              <label>
                <span>{t("fields.tiltServoId")}</span>
                <input
                  inputMode="numeric"
                  min={0}
                  max={253}
                  step={1}
                  type="number"
                  value={cameraConfig.tiltServoId}
                  onChange={(event) => updateCameraNumber("tiltServoId", event.target.value)}
                />
              </label>
              <label>
                <span>{t("fields.panMinDeg")}</span>
                <input type="number" min={0} max={360} step={1} value={cameraConfig.panMinDeg} onChange={(event) => updateCameraNumber("panMinDeg", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.panMaxDeg")}</span>
                <input type="number" min={0} max={360} step={1} value={cameraConfig.panMaxDeg} onChange={(event) => updateCameraNumber("panMaxDeg", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.tiltMinDeg")}</span>
                <input type="number" min={0} max={360} step={1} value={cameraConfig.tiltMinDeg} onChange={(event) => updateCameraNumber("tiltMinDeg", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.tiltMaxDeg")}</span>
                <input type="number" min={0} max={360} step={1} value={cameraConfig.tiltMaxDeg} onChange={(event) => updateCameraNumber("tiltMaxDeg", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.stepDeg")}</span>
                <input type="number" min={1} max={90} step={1} value={cameraConfig.stepDeg} onChange={(event) => updateCameraNumber("stepDeg", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.speedRaw")}</span>
                <input type="number" min={0} max={4095} step={1} value={cameraConfig.speedRaw} onChange={(event) => updateCameraNumber("speedRaw", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.acceleration")}</span>
                <input type="number" min={0} max={254} step={1} value={cameraConfig.acc} onChange={(event) => updateCameraNumber("acc", event.target.value)} />
              </label>
              <button className="icon-button primary full-field" type="submit">
                <Save size={18} />
                <span>{t("actions.saveCamera")}</span>
              </button>
              {(cameraConfigError || cameraValidationError) && <p className="form-error full-field">{t(cameraConfigError ?? cameraValidationError ?? "")}</p>}
            </form>
          ) : activeModule === "servo" ? (
            <>
              <form className="entity-form" onSubmit={addServo}>
                <label>
                  <span>ID</span>
                  <input
                    inputMode="numeric"
                    min={0}
                    max={253}
                    type="number"
                    value={servoDraft.id}
                    onChange={(event) => setServoDraft((current) => ({ ...current, id: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t("fields.name")}</span>
                  <input
                    value={servoDraft.name}
                    onChange={(event) => setServoDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <button className="icon-only" title={t("actions.addServo")} type="submit" aria-label={t("actions.addServo")}>
                  <Save size={18} />
                </button>
              </form>
              {servoLibraryError && <p className="form-error">{t(servoLibraryError)}</p>}

              <div className="device-list">
                {servos.length === 0 ? (
                  <div className="empty-state">{t("empty.noServos")}</div>
                ) : (
                  servos.map((servo) => {
                    const normalizedServo = normalizeServoProfile(servo);
                    return (
                      <div className={selectedId === servo.id ? "device-row servo-device-row selected" : "device-row servo-device-row"} key={servo.id}>
                        <button className="device-select" onClick={() => setSelectedId(servo.id)} type="button">
                          <span className="device-id">ID {servo.id}</span>
                          <span className="device-info">
                            <span className="device-name">{servo.name}</span>
                            <span className="device-meta">
                              {servoFeedback[servo.id]?.positionRaw !== undefined
                                ? t("device.positionTelemetry", { value: servoFeedback[servo.id].positionRaw })
                                : t("device.noTelemetry")}
                            </span>
                          </span>
                          <span className={servoFeedback[servo.id] ? "device-signal" : "device-signal muted"}>
                            {servoFeedback[servo.id] ? t("device.data") : t("device.idle")}
                          </span>
                        </button>
                        <button
                          className="delete-hit"
                          onClick={() => removeServo(servo.id)}
                          title={t("common.delete")}
                          type="button"
                          aria-label={t("device.deleteNamed", { name: servo.name })}
                        >
                          <Trash2 size={16} />
                        </button>
                        <div className="servo-limit-grid">
                          <label>
                            <span>最小角</span>
                            <input
                              type="number"
                              min={0}
                              max={360}
                              step={1}
                              value={normalizedServo.minDeg}
                              onChange={(event) => updateServoLimit(servo.id, "minDeg", event.target.value)}
                            />
                          </label>
                          <label>
                            <span>最大角</span>
                            <input
                              type="number"
                              min={0}
                              max={360}
                              step={1}
                              value={normalizedServo.maxDeg}
                              onChange={(event) => updateServoLimit(servo.id, "maxDeg", event.target.value)}
                            />
                          </label>
                          <label className="checkbox-field servo-reverse-field">
                            <input
                              type="checkbox"
                              checked={normalizedServo.direction === -1}
                              onChange={(event) => updateServoDirection(servo.id, event.target.checked)}
                            />
                            <span>反转</span>
                          </label>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="servo-linkage-config">
                <div className="servo-linkage-config-header">
                  <div className="drive-section-title">
                    <SlidersHorizontal size={17} />
                    <h3>{t("panels.servoLinkage")}</h3>
                  </div>
                  <button className="icon-only" title={t("actions.addLinkageGroup")} type="button" aria-label={t("actions.addLinkageGroup")} onClick={addServoLinkageGroup}>
                    <ListPlus size={18} />
                  </button>
                </div>
                {servoLinkageGroups.length === 0 ? (
                  <div className="empty-state">{t("empty.noLinkageGroups")}</div>
                ) : (
                  <div className="servo-linkage-group-list">
                    {servoLinkageGroups.map((group) => renderServoLinkageGroupEditor(group))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <form className="entity-form" onSubmit={addMotor}>
                <label>
                  <span>{t("fields.channel")}</span>
                  <input
                    value={motorDraft.channel}
                    onChange={(event) => setMotorDraft((current) => ({ ...current, channel: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t("fields.name")}</span>
                  <input value={motorDraft.name} onChange={(event) => setMotorDraft((current) => ({ ...current, name: event.target.value }))} />
                </label>
                <button className="icon-only" title={t("actions.addMotor")} type="submit" aria-label={t("actions.addMotor")}>
                  <Save size={18} />
                </button>
              </form>
              {motorLibraryError && <p className="form-error">{t(motorLibraryError)}</p>}

              <div className="device-list">
                {motors.length === 0 ? (
                  <div className="empty-state">{t("empty.noMotors")}</div>
                ) : (
                  motors.map((motor) => (
                    <div className={selectedChannel === motor.channel ? "device-row selected" : "device-row"} key={motor.channel}>
                      <button className="device-select" onClick={() => setSelectedChannel(motor.channel)} type="button">
                        <span className="device-id">{motor.channel}</span>
                        <span className="device-info">
                          <span className="device-name">{motor.name}</span>
                          <span className="device-meta">
                            {motorPinSummary(motor) ||
                            (motorFeedback[motor.channel]?.commandedSpeedPercent !== undefined
                              ? t("device.commandTelemetry", { value: motorFeedback[motor.channel].commandedSpeedPercent })
                              : t("device.noPinMapping"))}
                          </span>
                        </span>
                        <span className={motorFeedback[motor.channel] ? "device-signal" : "device-signal muted"}>
                          {motorFeedback[motor.channel] ? t("device.data") : t("device.idle")}
                        </span>
                      </button>
                      <button
                        className="delete-hit"
                        onClick={() => removeMotor(motor.channel)}
                        title={t("common.delete")}
                        type="button"
                        aria-label={t("device.deleteNamed", { name: motor.name })}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="servo-linkage-config">
                <div className="servo-linkage-config-header">
                  <div className="drive-section-title">
                    <SlidersHorizontal size={17} />
                    <h3>{t("panels.motorLinkage")}</h3>
                  </div>
                  <button className="icon-only" title={t("actions.addMotorLinkageGroup")} type="button" aria-label={t("actions.addMotorLinkageGroup")} onClick={addMotorLinkageGroup}>
                    <ListPlus size={18} />
                  </button>
                </div>
                {motorLinkageGroups.length === 0 ? (
                  <div className="empty-state">{t("empty.noMotorLinkageGroups")}</div>
                ) : (
                  <div className="servo-linkage-group-list">
                    {motorLinkageGroups.map((group) => renderMotorLinkageGroupEditor(group))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <section className="panel command-panel" aria-labelledby="command-title">
          <PanelTitle
            icon={activeModule === "mapping" ? <SlidersHorizontal size={18} /> : <Gauge size={18} />}
            id="command-title"
            meta={debugEnabled ? t("status.debugActive") : t("status.standby")}
            title={
              activeModule === "servo"
                ? t("panels.servoCommand")
                : activeModule === "arm"
                  ? t("panels.armControl")
                  : activeModule === "motor"
                    ? t("panels.motorCommand")
                    : activeModule === "mapping"
                      ? t("panels.inputMapping")
                      : t("panels.driveCamera")
            }
          />

          {false ? (
            <>
              <div className="camera-viewer">
                {cameraStreamUrl ? (
                  <img
                    alt={t("camera.streamAlt")}
                    src={cameraStreamUrl}
                    onError={() => {
                      setCameraStreamLoaded(false);
                      setCameraStreamFailed(true);
                    }}
                    onLoad={() => {
                      setCameraStreamLoaded(true);
                      setCameraStreamFailed(false);
                    }}
                  />
                ) : (
                  <div className="camera-placeholder">
                    <VideoOff size={42} />
                    <span>{t("empty.noCameraStream")}</span>
                  </div>
                )}
                <span className={cameraStreamFailed ? "camera-stream-badge error" : cameraStreamLoaded ? "camera-stream-badge online" : "camera-stream-badge"}>
                  {cameraStreamUrl
                    ? cameraStreamFailed
                      ? t("status.streamError")
                      : cameraStreamLoaded
                        ? t("status.streamOnline")
                        : t("status.streamLoading")
                    : t("status.streamMissing")}
                </span>
              </div>

              <div className="drive-console">
                <div className="drive-toolbar">
                  <div className="drive-base-switch" aria-label={t("aria.driveBase")}>
                    <button className={activeDriveBase === "tracked" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("tracked")} type="button">
                      <span>{t("drive.tracked")}</span>
                    </button>
                    <button className={activeDriveBase === "mecanum" ? "module-tab active" : "module-tab"} onClick={() => selectDriveBase("mecanum")} type="button">
                      <span>{t("drive.mecanum")}</span>
                    </button>
                  </div>

                  <label className="drive-speed-limit">
                    <span>{t("fields.speedLimit")}: {speedLimitPercent.toFixed(0)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={driveSpeedLimit}
                      onChange={(event) => setDriveSpeedLimit(event.target.value)}
                    />
                  </label>

                  <button className="icon-button danger" onClick={() => stopAllMotors()} type="button">
                    <Square size={18} />
                    <span>{t("actions.stopAll")}</span>
                  </button>
                </div>

                <div className="drive-vector-grid">
                  <Metric label={t("metrics.activeBase")} value={activeDriveBase === "tracked" ? t("drive.tracked") : t("drive.mecanum")} />
                  <Metric label={t("metrics.forward")} value={Math.round(driveInput.forward * 100)} suffix="%" />
                  <Metric label={t("metrics.strafe")} value={Math.round(driveInput.strafe * 100)} suffix="%" />
                  <Metric label={t("metrics.turn")} value={Math.round(driveInput.turn * 100)} suffix="%" />
                </div>

                <div className="drive-target-list" aria-label={t("aria.driveTargets")}>
                  {driveTargets.map((target) => (
                    <div className="drive-target-row" key={target.channel}>
                      <span>{target.channel}</span>
                      <strong>{target.speedPercent}%</strong>
                    </div>
                  ))}
                </div>

                <div className="camera-command-note">
                  {driveCanCommand ? t("drive.commandReady") : connected ? t("drive.enableDebug") : t("drive.connectSerial")}
                </div>
              </div>

              <div className="camera-control-row">
                <div className="gimbal-pad" aria-label={t("aria.gimbalControls")}>
                  <button className="icon-only pad-up" disabled={!cameraCanCommand} onClick={() => nudgeCamera(0, cameraConfig.stepDeg)} title={t("actions.tiltUp")} type="button" aria-label={t("actions.tiltUp")}>
                    <ArrowUp size={18} />
                  </button>
                  <button className="icon-only pad-left" disabled={!cameraCanCommand} onClick={() => nudgeCamera(-cameraConfig.stepDeg, 0)} title={t("actions.panLeft")} type="button" aria-label={t("actions.panLeft")}>
                    <ArrowLeft size={18} />
                  </button>
                  <button className="icon-only pad-center" disabled={!cameraCanCommand} onClick={centerCamera} title={t("actions.centerCamera")} type="button" aria-label={t("actions.centerCamera")}>
                    <Crosshair size={18} />
                  </button>
                  <button className="icon-only pad-right" disabled={!cameraCanCommand} onClick={() => nudgeCamera(cameraConfig.stepDeg, 0)} title={t("actions.panRight")} type="button" aria-label={t("actions.panRight")}>
                    <ArrowRight size={18} />
                  </button>
                  <button className="icon-only pad-down" disabled={!cameraCanCommand} onClick={() => nudgeCamera(0, -cameraConfig.stepDeg)} title={t("actions.tiltDown")} type="button" aria-label={t("actions.tiltDown")}>
                    <ArrowDown size={18} />
                  </button>
                </div>
                <div className="camera-command-note">
                  {cameraCanCommand ? t("camera.gimbalReady") : connected ? t("camera.enableDebug") : t("camera.connectSerial")}
                </div>
              </div>

              <div className="preview-grid camera-preview-grid">
                <Metric label={t("metrics.panAngle")} value={Number.isFinite(cameraConfig.panAngleDeg) ? cameraConfig.panAngleDeg.toFixed(0) : "--"} suffix={Number.isFinite(cameraConfig.panAngleDeg) ? " deg" : ""} />
                <Metric label={t("metrics.tiltAngle")} value={Number.isFinite(cameraConfig.tiltAngleDeg) ? cameraConfig.tiltAngleDeg.toFixed(0) : "--"} suffix={Number.isFinite(cameraConfig.tiltAngleDeg) ? " deg" : ""} />
                <Metric className="frame-preview" label={t("metrics.driveOutput")} value={drivePreviewCommand || "--"} code />
                <Metric className="frame-preview" label={t("metrics.cameraOutput")} value={cameraPreviewCommand || "--"} code />
              </div>
            </>
          ) : activeModule === "arm" ? (
            renderArmJointEditor()
          ) : activeModule === "mapping" ? (
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
                  {(["forward", "strafe", "turn"] as GamepadAxisName[]).map((axis) => (
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
                  {(["stop", "selectTracked", "selectMecanum", "cameraUp", "cameraDown", "cameraLeft", "cameraRight"] as GamepadButtonName[]).map((button) => (
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
          ) : activeModule === "servo" ? (
            <>
              <div className="servo-smoothing-panel">
                <label className="checkbox-field servo-smoothing-toggle">
                  <input
                    type="checkbox"
                    checked={servoSmoothingEnabled}
                    onChange={(event) => {
                      setServoSmoothingEnabled(event.target.checked);
                      if (!event.target.checked) {
                        cancelServoMotion();
                      }
                    }}
                  />
                  <span>平滑控制</span>
                </label>
                <label>
                  <span>平滑档位</span>
                  <select
                    value={servoSmoothPreset}
                    disabled={!servoSmoothingEnabled}
                    onChange={(event) => setServoSmoothPreset(event.target.value as ServoSmoothPreset)}
                  >
                    <option value="soft">柔和</option>
                    <option value="standard">标准</option>
                    <option value="fast">快速</option>
                  </select>
                </label>
                <div className="servo-smoothing-meta">
                  {servoSmoothingEnabled
                    ? `${currentServoSmoothConfig.tickMs}ms tick / ${currentServoSmoothConfig.positionDegPerSec} deg/s / ${currentServoSmoothConfig.wheelRawPerSec} raw/s`
                    : "直发模式"}
                </div>
                <label className="checkbox-field servo-smoothing-toggle">
                  <input
                    type="checkbox"
                    checked={servoSafetyEnabled}
                    onChange={(event) => setServoSafetyEnabled(event.target.checked)}
                  />
                  <span>{t("fields.feedbackProtection")}</span>
                </label>
                <label>
                  <span>{t("fields.safetyPreset")}</span>
                  <select
                    value={servoSafetyPreset}
                    disabled={!servoSafetyEnabled}
                    onChange={(event) => setServoSafetyPreset(event.target.value as ServoSafetyPreset)}
                  >
                    <option value="relaxed">{t("fields.safetyRelaxed")}</option>
                    <option value="standard">{t("fields.safetyStandard")}</option>
                    <option value="sensitive">{t("fields.safetySensitive")}</option>
                  </select>
                </label>
                <div className="servo-smoothing-meta">
                  {servoSafetyEnabled
                    ? `${currentServoSafetyConfig.pollMs}ms poll / load ${currentServoSafetyConfig.loadLimitRaw} / current ${currentServoSafetyConfig.currentLimitRaw} / ${currentServoSafetyConfig.temperatureLimitC}°C`
                    : t("safety.disabled")}
                </div>
              </div>
              {servos.length === 0 ? (
                <div className="empty-state servo-command-empty">{t("empty.noServos")}</div>
              ) : (
                <>
                  {enabledServoLinkageGroups.length > 0 && (
                    <div className="servo-linkage-run-list">
                      {enabledServoLinkageGroups.map((group) => renderServoLinkageRunCard(group))}
                    </div>
                  )}
                  <div className="servo-command-list">
                    {servos.map((servo) => renderServoCommandCard(servo))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {enabledMotorLinkageGroups.length > 0 && (
                <div className="servo-linkage-run-list">
                  {enabledMotorLinkageGroups.map((group) => renderMotorLinkageRunCard(group))}
                </div>
              )}
              <div className="command-grid motor-command-grid">
                <label>
                  <span>{t("fields.targetPort")}</span>
                  <select value={selectedChannel} onChange={(event) => setSelectedChannel(event.target.value)}>
                    <option value="">{t("placeholders.selectMotor")}</option>
                    {motors.map((motor) => (
                      <option key={motor.channel} value={motor.channel}>
                        {motor.channel} · {motor.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("fields.speedPercent")}</span>
                  <input type="number" min={-100} max={100} step={1} value={motorSpeed} onChange={(event) => updateSingleMotorSpeed(event.target.value)} />
                </label>
                <label>
                  <span>{t("fields.stopMode")}</span>
                  <select value={stopMode} onChange={(event) => setStopMode(event.target.value as MotorStopMode)}>
                    <option value="coast">{t("stopMode.coast")}</option>
                    <option value="brake">{t("stopMode.brake")}</option>
                  </select>
                </label>
              </div>

              <div className="preview-grid motor-debug-status-grid">
                <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
                <Metric label={t("metrics.uiDebug")} value={debugEnabled ? t("status.debug") : t("status.standby")} tone={debugEnabled ? "warning" : "neutral"} />
                <Metric label={t("metrics.arduinoDebug")} value={motorDebugHandshakeLabel} tone={motorDebugHandshakeTone} />
                <Metric label={t("metrics.lastError")} value={lastMotorErrorLabel} tone={lastMotorError ? "danger" : "neutral"} />
              </div>

              <div className="port-config-panel">
                <div className="port-config-title">
                  <Settings size={17} />
                  <span>{t("panels.motorPortMapping")}</span>
                </div>
                <div className="port-config-grid">
                  <label>
                    <span>{t("fields.pwmPin")}</span>
                    <input
                      disabled={!selectedMotor}
                      placeholder={t("placeholders.pwmPin")}
                      value={selectedMotor?.pwmPin ?? ""}
                      onChange={(event) => updateSelectedMotorMapping("pwmPin", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t("fields.in1Pin")}</span>
                    <input
                      disabled={!selectedMotor}
                      placeholder={t("placeholders.in1Pin")}
                      value={selectedMotor?.in1Pin ?? ""}
                      onChange={(event) => updateSelectedMotorMapping("in1Pin", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t("fields.in2Pin")}</span>
                    <input
                      disabled={!selectedMotor}
                      placeholder={t("placeholders.in2Pin")}
                      value={selectedMotor?.in2Pin ?? ""}
                      onChange={(event) => updateSelectedMotorMapping("in2Pin", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t("fields.enablePin")}</span>
                    <input
                      disabled={!selectedMotor}
                      placeholder={t("placeholders.optionalPin")}
                      value={selectedMotor?.enablePin ?? ""}
                      onChange={(event) => updateSelectedMotorMapping("enablePin", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>{t("fields.sensorPin")}</span>
                    <input
                      disabled={!selectedMotor}
                      placeholder={t("placeholders.optionalPin")}
                      value={selectedMotor?.sensorPin ?? ""}
                      onChange={(event) => updateSelectedMotorMapping("sensorPin", event.target.value)}
                    />
                  </label>
                </div>
                {motorConfigError && <p className="form-error">{t(motorConfigError)}</p>}
                <div className="action-grid port-config-actions">
                  <button className="icon-button" disabled={!selectedMotor} onClick={saveMotorMapping} type="button">
                    <Save size={18} />
                    <span>{t("actions.savePortMapping")}</span>
                  </button>
                  <button className="icon-button primary" disabled={!connected || connectionMode === "servo-bus" || !selectedMotor} onClick={sendMotorConfig} type="button">
                    <Send size={18} />
                    <span>{t("actions.sendPortMapping")}</span>
                  </button>
                  <button className="icon-button" onClick={downloadArduinoFirmware} type="button">
                    <Download size={18} />
                    <span>{t("actions.downloadArduinoFirmware")}</span>
                  </button>
                </div>
                <div className="firmware-upload-panel">
                  <div className="port-config-title">
                    <Cpu size={17} />
                    <span>{t("panels.firmwareUpload")}</span>
                  </div>
                  <div className="firmware-upload-grid">
                    <label>
                      <span>{t("fields.board")}</span>
                      <select
                        disabled={firmwareBusy}
                        value={firmwareBoard}
                        onChange={(event) => {
                          setFirmwareBoard(event.target.value as FirmwareBoardId);
                          setFirmwareJob(null);
                          setFirmwareStatus("idle");
                        }}
                      >
                        {FIRMWARE_BOARD_OPTIONS.map((board) => (
                          <option key={board.id} value={board.id}>
                            {board.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{t("fields.serialPort")}</span>
                      <select disabled={firmwareBusy || firmwarePorts.length === 0} value={selectedFirmwarePort} onChange={(event) => setSelectedFirmwarePort(event.target.value)}>
                        {firmwarePorts.length === 0 ? (
                          <option value="">{t("empty.noFirmwarePorts")}</option>
                        ) : (
                          firmwarePorts.map((port) => (
                          <option key={port.path} value={port.path}>
                              {port.path} {port.description ? `- ${port.description}` : ""}
                          </option>
                          ))
                        )}
                      </select>
                    </label>
                  </div>
                  <div className="preview-grid firmware-status-grid">
                    <Metric label={t("metrics.firmwareHelper")} value={firmwareHelperLabel} tone={firmwareHelperTone} />
                    <Metric label={t("metrics.firmware")} value={t(`firmware.status.${firmwareStatus}`)} tone={firmwareStatusTone} />
                    <Metric label={t("metrics.hexSize")} value={firmwareHexLabel} />
                    <Metric code label={t("metrics.serialPort")} value={selectedFirmwarePort || "--"} />
                  </div>
                  <div className="action-grid port-config-actions">
                    <button className="icon-button" disabled={firmwareBusy} onClick={() => checkFirmwareHelper()} type="button">
                      <RotateCw size={18} />
                      <span>{t("actions.checkFirmwareHelper")}</span>
                    </button>
                    <button className="icon-button" disabled={firmwareBusy || firmwareHelperHealth?.pioAvailable !== true} onClick={refreshFirmwarePorts} type="button">
                      <Usb size={18} />
                      <span>{t("actions.refreshFirmwarePorts")}</span>
                    </button>
                    <button className="icon-button primary" disabled={!canCompileFirmware} onClick={compileArduinoFirmware} type="button">
                      <Cpu size={18} />
                      <span>{t("actions.compileFirmware")}</span>
                    </button>
                    <button className="icon-button" disabled={!canUploadFirmware} onClick={uploadCompiledArduinoFirmware} type="button">
                      <Upload size={18} />
                      <span>{t("actions.uploadFirmware")}</span>
                    </button>
                  </div>
                  {firmwareError && <p className="form-error">{firmwareError}</p>}
                  {firmwareLogs && <pre className="firmware-log">{firmwareLogs}</pre>}
                </div>
              </div>

              <label className="speed-slider-field">
                <span>{t("fields.speedSlider")}</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={Number.isFinite(numericMotorSpeed) ? String(numericMotorSpeed) : "0"}
                  onChange={(event) => updateSingleMotorSpeed(event.target.value, true)}
                />
              </label>

              <div className="preview-grid motor-preview-grid">
                <Metric label={t("metrics.direction")} value={formatDirectionLabel(motorDirection)} />
                <Metric label={t("metrics.duty")} value={Number.isFinite(motorDuty) ? motorDuty.toFixed(0) : "--"} suffix={Number.isFinite(motorDuty) ? "%" : ""} />
                <Metric className="frame-preview" label={t("metrics.json")} value={motorPreviewCommand || "--"} code />
              </div>

              <div className="action-grid">
                <button className="icon-button primary" disabled={!connected || connectionMode === "servo-bus" || !selectedMotor} onClick={sendMotorSet} type="button">
                  <Send size={18} />
                  <span>{t("actions.sendCommand")}</span>
                </button>
                <button className="icon-button danger" disabled={!connected || connectionMode === "servo-bus" || !selectedMotor} onClick={stopMotor} type="button">
                  <Square size={18} />
                  <span>{t("actions.stop")}</span>
                </button>
                <button className="icon-button" disabled={!connected || connectionMode === "servo-bus"} onClick={() => stopAllMotors()} type="button">
                  <RotateCcw size={18} />
                  <span>{t("actions.stopAll")}</span>
                </button>
                <button className="icon-button" disabled={!connected || connectionMode === "servo-bus" || !selectedMotor} onClick={readMotor} type="button">
                  <Activity size={18} />
                  <span>{t("actions.readFeedback")}</span>
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="side-stack">
          <section className="panel feedback-panel" aria-labelledby="feedback-title">
            <PanelTitle
              icon={<Play size={18} />}
              id="feedback-title"
              meta={
                activeModule === "servo"
                  ? selectedServo?.name ?? t("meta.noTarget")
                  : activeModule === "arm"
                    ? selectedArmJoint?.name ?? t("meta.noTarget")
                    : activeModule === "motor"
                      ? selectedMotor?.channel ?? t("meta.noTarget")
                      : activeModule === "mapping"
                        ? activeGamepad
                          ? `#${activeGamepad.index}`
                          : t("mapping.noGamepad")
                        : cameraStreamUrl
                          ? t("meta.streamConfigured")
                          : t("meta.noStream")
              }
              title={activeModule === "mapping" ? t("panels.inputStatus") : t("panels.telemetry")}
            />
            {false ? (
              <div className="feedback-grid">
                <Metric
                  label={t("metrics.stream")}
                  value={
                    cameraStreamUrl
                      ? cameraStreamFailed
                        ? t("status.streamError")
                        : cameraStreamLoaded
                          ? t("status.streamOnline")
                          : t("status.streamLoading")
                      : t("status.streamMissing")
                  }
                  tone={cameraStreamFailed ? "danger" : cameraStreamLoaded ? "online" : "neutral"}
                />
                <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
                <Metric label={t("metrics.panServo")} value={`ID ${cameraConfig.panServoId}`} />
                <Metric label={t("metrics.tiltServo")} value={`ID ${cameraConfig.tiltServoId}`} />
                <Metric label={t("metrics.step")} value={cameraConfig.stepDeg} suffix=" deg" />
                <Metric label={t("metrics.gimbal")} value={cameraValidationError ? t("status.configInvalid") : cameraCanCommand ? t("status.ready") : t("status.standby")} tone={cameraValidationError ? "danger" : cameraCanCommand ? "online" : "neutral"} />
                <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} />
              </div>
            ) : activeModule === "mapping" ? (
              <div className="feedback-grid">
                <Metric label={t("metrics.forward")} value={Math.round(driveInput.forward * 100)} suffix="%" />
                <Metric label={t("metrics.strafe")} value={Math.round(driveInput.strafe * 100)} suffix="%" />
                <Metric label={t("metrics.turn")} value={Math.round(driveInput.turn * 100)} suffix="%" />
                <Metric label={t("metrics.cameraPan")} value={Math.round(driveInput.cameraPan * 100)} suffix="%" />
                <Metric label={t("metrics.cameraTilt")} value={Math.round(driveInput.cameraTilt * 100)} suffix="%" />
                <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} />
              </div>
            ) : activeModule === "arm" ? (
              selectedArmJoint && selectedArmFeedback ? (
                <div className="feedback-grid">
                  <Metric label={t("metrics.position")} value={selectedArmFeedback.positionRaw} />
                  <Metric label={t("metrics.speed")} value={selectedArmFeedback.speedRaw} />
                  <Metric label={t("metrics.load")} value={selectedArmFeedback.loadRaw} />
                  <Metric label={t("metrics.voltage")} value={selectedArmFeedback.voltageRaw} />
                  <Metric label={t("metrics.temp")} value={selectedArmFeedback.temperatureC} suffix="°C" />
                  <Metric label={t("metrics.current")} value={selectedArmFeedback.currentRaw} />
                  <Metric label={t("fields.angleDeg")} value={formatServoAngle(selectedArmJoint.angleDeg)} suffix=" deg" />
                  <Metric label={t("metrics.moving")} value={selectedArmFeedback.moving ? t("common.yes") : t("common.no")} tone={selectedArmFeedback.moving ? "warning" : "neutral"} />
                </div>
              ) : (
                <div className="empty-state">{t("empty.noFeedback")}</div>
              )
            ) : activeModule === "servo" ? (
              selectedServo && servoFeedback[selectedServo.id] ? (
                <div className="feedback-grid">
                  <Metric label={t("metrics.position")} value={servoFeedback[selectedServo.id].positionRaw} />
                  <Metric label={t("metrics.speed")} value={servoFeedback[selectedServo.id].speedRaw} />
                  <Metric label={t("metrics.load")} value={servoFeedback[selectedServo.id].loadRaw} />
                  <Metric label={t("metrics.voltage")} value={servoFeedback[selectedServo.id].voltageRaw} />
                  <Metric label={t("metrics.temp")} value={servoFeedback[selectedServo.id].temperatureC} suffix="°C" />
                  <Metric label={t("metrics.current")} value={servoFeedback[selectedServo.id].currentRaw} />
                  <Metric
                    label={t("metrics.moving")}
                    value={servoFeedback[selectedServo.id].moving ? t("common.yes") : t("common.no")}
                    tone={servoFeedback[selectedServo.id].moving ? "warning" : "neutral"}
                  />
                </div>
              ) : (
                <div className="empty-state">{t("empty.noFeedback")}</div>
              )
            ) : selectedMotor && motorFeedback[selectedMotor.channel] ? (
              <div className="feedback-grid">
                <Metric label={t("metrics.command")} value={motorFeedback[selectedMotor.channel].commandedSpeedPercent} suffix="%" />
                <Metric label={t("metrics.duty")} value={motorFeedback[selectedMotor.channel].dutyPercent} suffix="%" />
                <Metric label={t("metrics.direction")} value={formatDirectionLabel(motorFeedback[selectedMotor.channel].direction ?? "stopped")} />
                <Metric label={t("metrics.rpm")} value={motorFeedback[selectedMotor.channel].speedRpm} />
                <Metric label={t("metrics.pulseHz")} value={motorFeedback[selectedMotor.channel].pulseHz} />
                <Metric label={t("metrics.ticks")} value={motorFeedback[selectedMotor.channel].encoderTicks} />
              </div>
            ) : (
              <div className="empty-state">{t("empty.noFeedback")}</div>
            )}
          </section>

          <LogPanel logs={logs} />
        </aside>
          </>
        )}
      </div>
    </main>
  );
}

function PanelTitle({ icon, id, meta, title }: { icon: ReactNode; id?: string; meta?: string; title: string }) {
  return (
    <div className="panel-title">
      <div className="panel-title-main">
        {icon}
        <h2 id={id}>{title}</h2>
      </div>
      {meta && <span className="panel-meta">{meta}</span>}
    </div>
  );
}

function StatusCard({ label, tone = "neutral", value }: { label: string; tone?: "danger" | "neutral" | "online" | "warning"; value: string }) {
  return (
    <div className={`status-card ${tone}`}>
      <span className="status-led" />
      <span className="status-copy">
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function Metric({
  className = "",
  code = false,
  label,
  suffix = "",
  tone = "neutral",
  value
}: {
  className?: string;
  code?: boolean;
  label: string;
  suffix?: string;
  tone?: "neutral" | "online" | "warning" | "danger";
  value: unknown;
}) {
  const displayValue = value === undefined || value === null ? "--" : String(value);

  return (
    <div className={`metric ${tone} ${className}`.trim()}>
      <span>{label}</span>
      {code ? (
        <code>{displayValue}</code>
      ) : (
        <strong>
          {displayValue}
          {displayValue === "--" ? "" : suffix}
        </strong>
      )}
    </div>
  );
}

function LogPanel({ logs }: { logs: LogEntry[] }) {
  const { t } = useTranslation();

  return (
    <section className="panel log-panel" aria-labelledby="log-title">
      <PanelTitle icon={<Activity size={18} />} id="log-title" meta={t("meta.eventCount", { count: logs.length })} title={t("panels.eventLog")} />
      <div className="log-list">
        {logs.length === 0 ? (
          <div className="empty-state">{t("empty.noLogs")}</div>
        ) : (
          logs.map((log) => (
            <div className={`log-entry ${log.direction} ${log.level ?? "info"}`} key={log.id}>
              <span>{log.direction.toUpperCase()}</span>
              <code>{log.text ?? t(log.messageKey ?? "", log.values)}</code>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function nextMotorDraft(motors: MotorProfile[]) {
  const channels = new Set(motors.map((motor) => motor.channel));
  for (let index = 1; index <= 99; index += 1) {
    const channel = `M${index}`;
    if (!channels.has(channel)) {
      return { channel, name: `Motor ${index}` };
    }
  }
  return defaultMotorDraft;
}

function nextServoLinkageGroupName(groups: ServoLinkageGroup[]) {
  const names = new Set(groups.map((group) => group.name.trim().toLowerCase()));
  for (let index = 1; index <= 99; index += 1) {
    const name = `Linkage ${index}`;
    if (!names.has(name.toLowerCase())) {
      return name;
    }
  }
  return `Linkage ${groups.length + 1}`;
}

function nextMotorLinkageGroupName(groups: MotorLinkageGroup[]) {
  const names = new Set(groups.map((group) => group.name.trim().toLowerCase()));
  for (let index = 1; index <= 99; index += 1) {
    const name = `Motor Linkage ${index}`;
    if (!names.has(name.toLowerCase())) {
      return name;
    }
  }
  return `Motor Linkage ${groups.length + 1}`;
}

function formatSignedPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function safeFramePreview(id: number, name: string, angleDeg: number, speedRaw: number, acc: number | undefined) {
  try {
    return toHex(buildWritePositionFrame({ id, name, angleDeg, speedRaw, acc }));
  } catch {
    return "";
  }
}

function safeSpeedFramePreview(id: number, name: string, speedRaw: number, acc: number | undefined) {
  try {
    return buildWriteSpeedFrames({ id, name, speedRaw, acc })
      .map((frame) => toHex(frame))
      .join(" | ");
  } catch {
    return "";
  }
}

function safeMotorCommandPreview(channel: string, speedPercent: number, stopMode: MotorStopMode) {
  try {
    return JSON.stringify(buildMotorSetCommand(0, { channel, speedPercent, stopMode }));
  } catch {
    return "";
  }
}

function motorPinSummary(motor: MotorProfile) {
  const parts = [
    motor.pwmPin ? `PWM ${motor.pwmPin}` : "",
    motor.in1Pin ? `IN1 ${motor.in1Pin}` : "",
    motor.in2Pin ? `IN2 ${motor.in2Pin}` : "",
    motor.enablePin ? `EN ${motor.enablePin}` : "",
    motor.sensorPin ? `SNS ${motor.sensorPin}` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

function safeDriveCommandPreview(targets: MotorTarget[], stopMode: MotorStopMode) {
  try {
    return JSON.stringify(targets.map((target) => buildMotorSetCommand(0, { ...target, stopMode })));
  } catch {
    return "";
  }
}

function safeCameraGimbalCommandPreview(config: CameraConfig) {
  try {
    return JSON.stringify(
      buildServoMoveCommand(
        0,
        [
          {
            id: config.panServoId,
            name: "Camera Pan",
            angleDeg: config.panAngleDeg,
            speedRaw: config.speedRaw,
            acc: config.acc
          },
          {
            id: config.tiltServoId,
            name: "Camera Tilt",
            angleDeg: config.tiltAngleDeg,
            speedRaw: config.speedRaw,
            acc: config.acc
          }
        ],
        true
      )
    );
  } catch {
    return "";
  }
}

function debugModuleFor(module: ActiveModule): DebugModule {
  if (module === "mapping") {
    return "camera";
  }
  if (module === "arm") {
    return "servo";
  }
  return module;
}

function isServoBusModule(module: ActiveModule): boolean {
  return module === "servo" || module === "arm";
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}
