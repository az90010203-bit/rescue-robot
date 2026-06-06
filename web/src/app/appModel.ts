import {
  DebugModule,
  InboundMessage,
  MotorProfile,
  MotorStopMode,
  MotorTarget,
  ServoProfile,
  buildMotorSetCommand,
  buildServoMoveCommand,
  buildWritePositionFrame,
  buildWriteSpeedFrames,
  clampServoLogicalAngle,
  toHex
} from "../lib/protocol";
import { ArmTeachSample } from "../lib/armTeach";
import { InputMapping } from "../lib/inputMapping";
import { PiSetupProfile } from "../lib/piRemote";
import { ServoSafetyRuntime, ServoSafetyTriggerReason } from "../lib/servoSafety";
import {
  WHEEL_SLIDER_CENTER_DEG,
  clampWheelSliderDeg,
  normalizeWheelMaxSpeedRaw
} from "../lib/servoWheelSlider";
import {
  ArmJointConfig,
  CameraConfig,
  MotorLinkageGroup,
  ServoLinkageGroup
} from "../lib/storage";

export type LogValues = Record<string, string | number | boolean>;

export interface LogEntry {
  id: number;
  direction: "tx" | "rx" | "system";
  level?: "info" | "warn" | "error";
  messageKey?: string;
  text?: string;
  values?: LogValues;
}

export type ActiveModule = "servo" | "arm" | "motor" | "camera" | "mapping";
export type ArchitectureSection = "plugins" | "components" | "robots";
export type AppSection = "console" | ArchitectureSection | "tests" | "settings";
export type TestPanel = "servo" | "motor" | "arm" | "driveCamera" | "pi";
export type ConnectionMode = "servo-bus" | "controller";
export type ServoControlMode = "position" | "wheel";
export type ServoMotionDisplayStatus = "idle" | "smoothing" | "paused";
export type ServoSafetyDisplayState = "idle" | "monitoring" | "stopped";
export type ArmTeachStatus = "idle" | "preparing" | "recording" | "stopped" | "playing" | "error";
export type DatabaseSaveStatus = "loading" | "saving" | "saved" | "error" | "offline";
export type MotorDebugHandshakeStatus = "unknown" | "syncing" | "ready" | "error";
export type FirmwareUploadStatus = "idle" | "checking" | "loadingPorts" | "compiling" | "compiled" | "uploading" | "uploaded" | "error";
export type PiRemoteStatus = "idle" | "checking" | "settingUp" | "ready" | "uploading" | "running" | "complete" | "error";
export type PiCameraStatus = "idle" | "checking" | "installing" | "starting" | "streaming" | "stopping" | "error";
export interface PiRemoteForm {
  host: string;
  port: string;
  username: string;
  password: string;
  authMode: PiSetupProfile["authMode"];
  privateKeyPath: string;
  workspaceDir: string;
  remotePath: string;
  command: string;
  cwd: string;
  timeoutSeconds: string;
}
export interface ServoCommandState {
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
export type ServoCommandStateMap = Record<number, ServoCommandState>;
export type ServoMotionStatusMap = Record<number, ServoMotionDisplayStatus>;
export interface ServoSafetyDisplayStatus {
  state: ServoSafetyDisplayState;
  reason?: ServoSafetyTriggerReason;
}
export interface ArmTeachRuntime {
  joints: ArmJointConfig[];
  startedAt: number;
  samples: ArmTeachSample[];
  sampling: boolean;
}
export type ServoSafetyStatusMap = Record<number, ServoSafetyDisplayStatus>;
export interface PendingLiveAngleMove {
  servo: ServoProfile;
  state: ServoCommandState;
  angle: number;
}
export interface PendingLiveWheelMove {
  servo: ServoProfile;
  state: ServoCommandState;
}
export interface PendingSingleMotorMove {
  channel: string;
  speedPercent: number;
  stopMode: MotorStopMode;
  generation: number;
}
export interface ArmMotionTarget {
  joint: ArmJointConfig;
  servo: ServoProfile;
  servoId: number;
  logicalAngleDeg: number;
  physicalAngleDeg: number;
  speedRaw: number;
  acc: number;
  reverse: boolean;
}
export interface WheelTurnProgress {
  completedTurns: number;
  targetTurns: number;
  running: boolean;
}
export interface WheelTurnRuntime {
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
export interface MotorErrorDisplay {
  command?: string;
  code?: string;
  message: string;
}
export interface PendingCommandResponse {
  command?: string;
  resolve: (message: InboundMessage | null) => void;
  timer: number;
}
export interface PendingDebugSet {
  module: DebugModule;
  enabled: boolean;
}
export interface ServoSafetyMonitor {
  servo: ServoProfile;
  runtime: ServoSafetyRuntime;
  affectedServoIds: number[];
  stop: () => Promise<void>;
  polling: boolean;
}
export type CameraNumberField = Exclude<
  keyof CameraConfig,
  "streamUrl" | "webrtcOfferUrl" | "streamMode" | "latencyProfile" | "videoSources" | "activeVideoSourceId" | "videoLayout"
>;
export type MotorMappingField = "pwmPin" | "in1Pin" | "in2Pin" | "enablePin" | "sensorPin";
export type ServoFeedbackMap = Record<number, InboundMessage & { type: "servo.feedback" }>;
export type MotorFeedbackMap = Record<string, InboundMessage & { type: "motor.feedback" }>;
export type GamepadAxisName = keyof InputMapping["gamepad"]["axes"];
export type GamepadButtonName = keyof InputMapping["gamepad"]["buttons"];

export interface GamepadSummary {
  index: number;
  id: string;
  axes: number;
  buttons: number;
  mapping: string;
  axesValues: number[];
  pressedButtons: number[];
}

export const defaultServoDraft = { id: "23", name: "ID23" };
export const defaultMotorDraft = { channel: "M7", name: "Motor 7" };
export const defaultPiRemoteForm: PiRemoteForm = {
  host: "raspberrypi.local",
  port: "22",
  username: "pi",
  password: "",
  authMode: "password",
  privateKeyPath: "",
  workspaceDir: "~/rescue-robot",
  remotePath: "/home/pi/rescue/uploaded.py",
  command: "python3 /home/pi/rescue/uploaded.py",
  cwd: "",
  timeoutSeconds: "30"
};
export const PI_SETUP_PROFILE_STORAGE_KEY = "rescue-robot.piSetupProfile.v1";
export const defaultServoCommandState: ServoCommandState = {
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

export function createDefaultServoCommandState(): ServoCommandState {
  return { ...defaultServoCommandState };
}

export function getServoCommandState(commands: ServoCommandStateMap, id: number): ServoCommandState {
  return { ...defaultServoCommandState, ...commands[id] };
}

export function formatServoAngle(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function servoMotionStatusLabel(status: ServoMotionDisplayStatus): string {
  if (status === "smoothing") {
    return "平滑中";
  }
  if (status === "paused") {
    return "急停后空闲";
  }
  return "空闲";
}

export function databaseStatusTone(status: DatabaseSaveStatus): "danger" | "neutral" | "online" | "warning" {
  if (status === "error") {
    return "danger";
  }
  if (status === "saving" || status === "loading" || status === "offline") {
    return "warning";
  }
  return "online";
}

export function singleWheelTurnProgressKey(servoId: number): string {
  return `servo:${servoId}`;
}

export function linkageWheelTurnProgressKey(groupId: string, servoId: number): string {
  return `linkage:${groupId}:${servoId}`;
}

export function clampServoCommandStateToLimits(state: ServoCommandState, servo: ServoProfile): ServoCommandState {
  const logicalAngle = Number(state.angleDeg);
  const clampedAngle = clampServoLogicalAngle(servo, logicalAngle);
  const wheelSliderDeg = clampWheelSliderDeg(state.wheelSliderDeg.trim() === "" ? WHEEL_SLIDER_CENTER_DEG : Number(state.wheelSliderDeg));
  const speedRaw =
    state.mode === "wheel" ? String(normalizeWheelMaxSpeedRaw(Number(state.speedRaw))) : state.speedRaw;
  return { ...state, angleDeg: formatServoAngle(clampedAngle), speedRaw, wheelSliderDeg: formatServoAngle(wheelSliderDeg) };
}

export function nextMotorDraft(motors: MotorProfile[]) {
  const channels = new Set(motors.map((motor) => motor.channel));
  for (let index = 1; index <= 99; index += 1) {
    const channel = `M${index}`;
    if (!channels.has(channel)) {
      return { channel, name: `Motor ${index}` };
    }
  }
  return defaultMotorDraft;
}

export function nextServoLinkageGroupName(groups: ServoLinkageGroup[]) {
  const names = new Set(groups.map((group) => group.name.trim().toLowerCase()));
  for (let index = 1; index <= 99; index += 1) {
    const name = `Linkage ${index}`;
    if (!names.has(name.toLowerCase())) {
      return name;
    }
  }
  return `Linkage ${groups.length + 1}`;
}

export function nextMotorLinkageGroupName(groups: MotorLinkageGroup[]) {
  const names = new Set(groups.map((group) => group.name.trim().toLowerCase()));
  for (let index = 1; index <= 99; index += 1) {
    const name = `Motor Linkage ${index}`;
    if (!names.has(name.toLowerCase())) {
      return name;
    }
  }
  return `Motor Linkage ${groups.length + 1}`;
}

export function formatSignedPercent(value: number) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function safeFramePreview(id: number, name: string, angleDeg: number, speedRaw: number, acc: number | undefined) {
  try {
    return toHex(buildWritePositionFrame({ id, name, angleDeg, speedRaw, acc }));
  } catch {
    return "";
  }
}

export function safeSpeedFramePreview(id: number, name: string, speedRaw: number, acc: number | undefined) {
  try {
    return buildWriteSpeedFrames({ id, name, speedRaw, acc })
      .map((frame) => toHex(frame))
      .join(" | ");
  } catch {
    return "";
  }
}

export function safeMotorCommandPreview(channel: string, speedPercent: number, stopMode: MotorStopMode) {
  try {
    return JSON.stringify(buildMotorSetCommand(0, { channel, speedPercent, stopMode }));
  } catch {
    return "";
  }
}

export function motorPinSummary(motor: MotorProfile) {
  const parts = [
    motor.pwmPin ? `PWM ${motor.pwmPin}` : "",
    motor.in1Pin ? `IN1 ${motor.in1Pin}` : "",
    motor.in2Pin ? `IN2 ${motor.in2Pin}` : "",
    motor.enablePin ? `EN ${motor.enablePin}` : "",
    motor.sensorPin ? `SNS ${motor.sensorPin}` : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

export function safeDriveCommandPreview(targets: MotorTarget[], stopMode: MotorStopMode) {
  try {
    return JSON.stringify(targets.map((target) => buildMotorSetCommand(0, { ...target, stopMode })));
  } catch {
    return "";
  }
}

export function safeCameraGimbalCommandPreview(config: CameraConfig) {
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

export function debugModuleFor(module: ActiveModule): DebugModule {
  if (module === "mapping") {
    return "camera";
  }
  if (module === "arm") {
    return "servo";
  }
  return module;
}

export function isServoBusModule(module: ActiveModule): boolean {
  return module === "servo" || module === "arm";
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}
