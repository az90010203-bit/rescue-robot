import {
  MotorProfile,
  ServoProfile,
  clamp,
  isValidMotorChannel,
  isValidMotorPin,
  isValidServoId,
  normalizeServoProfile,
  normalizeMotorChannel,
  normalizeMotorPin,
  DEFAULT_WHEEL_SPEED_LIMIT,
  applyServoWheelDirection,
  servoLogicalSpan,
  servoLogicalToPhysicalAngleWithReverse
} from "./protocol";

export const SERVO_LIBRARY_STORAGE_KEY = "rescue-robot.servo-library.v1";
export const MOTOR_LIBRARY_STORAGE_KEY = "rescue-robot.motor-library.v1";
export const CAMERA_CONFIG_STORAGE_KEY = "rescue-robot.camera-config.v1";
export const SERVO_LINKAGE_GROUPS_STORAGE_KEY = "rescue-robot.servo-linkage-groups.v1";
export const MOTOR_LINKAGE_GROUPS_STORAGE_KEY = "rescue-robot.motor-linkage-groups.v1";
export const ARM_CONFIG_STORAGE_KEY = "rescue-robot.arm-config.v1";

export interface ServoDraft {
  id: string;
  name: string;
}

export interface MotorDraft {
  channel: string;
  name: string;
}

export type CameraStreamMode = "mjpeg" | "webrtc";
export type CameraLatencyProfile = "lowLatency" | "balanced" | "sharp";
export type CameraVideoLayout = "single" | "dual";

export interface CameraProfileSettings {
  width: number;
  height: number;
  fps: number;
}

export interface CameraVideoSource {
  id: string;
  label: string;
  devicePath: string;
  port: number;
  streamUrl: string;
}

export interface CameraConfig {
  streamUrl: string;
  webrtcOfferUrl: string;
  streamMode: CameraStreamMode;
  latencyProfile: CameraLatencyProfile;
  videoSources: CameraVideoSource[];
  activeVideoSourceId: string;
  videoLayout: CameraVideoLayout;
  panServoId: number;
  tiltServoId: number;
  panMinDeg: number;
  panMaxDeg: number;
  tiltMinDeg: number;
  tiltMaxDeg: number;
  panAngleDeg: number;
  tiltAngleDeg: number;
  stepDeg: number;
  speedRaw: number;
  acc: number;
}

export interface ServoLinkageMember {
  servoId: number;
  weightPercent: number;
  speedRaw: number;
  acc: number;
  reverse: boolean;
}

export type ServoLinkageMode = "position" | "wheel";
export type ServoLinkageWheelDirection = "clockwise" | "counterclockwise";

export interface ServoLinkageGroup {
  id: string;
  name: string;
  enabled: boolean;
  mode: ServoLinkageMode;
  masterPercent: number;
  wheelTurnLimitEnabled: boolean;
  wheelClockwiseTurnsTarget: number;
  wheelCounterclockwiseTurnsTarget: number;
  members: ServoLinkageMember[];
}

export interface ServoLinkageTarget {
  servo: ServoProfile;
  servoId: number;
  name: string;
  weightPercent: number;
  speedRaw: number;
  acc: number;
  reverse: boolean;
  logicalAngleDeg: number;
  physicalAngleDeg: number;
}

export interface ServoLinkageWheelTarget {
  servo: ServoProfile;
  servoId: number;
  name: string;
  speedRaw: number;
  commandSpeedRaw: number;
  effectiveSpeedRaw: number;
  acc: number;
  reverse: boolean;
}

export interface MotorLinkageMember {
  channel: string;
  weightPercent: number;
  reverse: boolean;
}

export interface MotorLinkageGroup {
  id: string;
  name: string;
  enabled: boolean;
  masterSpeedPercent: number;
  members: MotorLinkageMember[];
}

export interface MotorLinkageTarget {
  motor: MotorProfile;
  channel: string;
  name: string;
  weightPercent: number;
  reverse: boolean;
  speedPercent: number;
}

export interface ArmJointConfig {
  id: string;
  name: string;
  servoId: number;
  lengthPx: number;
  angleDeg: number;
  neutralDeg: number;
  speedRaw: number;
  acc: number;
  reverse: boolean;
  enabled: boolean;
}

export interface ArmConfig {
  joints: ArmJointConfig[];
  liveDragEnabled: boolean;
  selectedJointId: string | null;
}

export interface ArmSegmentPose {
  jointId: string;
  name: string;
  servoId: number;
  lengthPx: number;
  angleDeg: number;
  neutralDeg: number;
  relativeDeg: number;
  globalDeg: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface ArmPoint {
  x: number;
  y: number;
}

export type ValidationErrorKey =
  | "validation.servoIdRange"
  | "validation.nameRequired"
  | "validation.duplicateServoId"
  | "validation.duplicateServoName"
  | "validation.invalidMotorChannel"
  | "validation.motorMappingRequired"
  | "validation.invalidMotorPin"
  | "validation.duplicateMotorChannel"
  | "validation.duplicateMotorName"
  | "validation.cameraServoIds"
  | "validation.cameraPanRange"
  | "validation.cameraTiltRange"
  | "validation.cameraAngles"
  | "validation.cameraMotion";

export const DEFAULT_SERVOS: ServoProfile[] = [normalizeServoProfile({ id: 22, name: "ID22" })];

export const DEFAULT_MOTORS: MotorProfile[] = [
  { channel: "M1", name: "Left Track", pwmPin: "D5", in1Pin: "D4", in2Pin: "D7", enablePin: "D10" },
  { channel: "M2", name: "Right Track", pwmPin: "D6", in1Pin: "D8", in2Pin: "D9", enablePin: "D10" },
  { channel: "M3", name: "Mecanum Front Left" },
  { channel: "M4", name: "Mecanum Front Right" },
  { channel: "M5", name: "Mecanum Rear Left" },
  { channel: "M6", name: "Mecanum Rear Right" }
];

export const CAMERA_LATENCY_PROFILE_SETTINGS: Record<CameraLatencyProfile, CameraProfileSettings> = {
  lowLatency: { width: 320, height: 240, fps: 30 },
  balanced: { width: 640, height: 480, fps: 30 },
  sharp: { width: 1280, height: 720, fps: 30 }
};

export const DEFAULT_CAMERA_STREAM_URL = "http://192.168.55.220:8080/stream";
export const DEFAULT_SECONDARY_CAMERA_STREAM_URL = "http://192.168.55.220:8081/stream";
export const DEFAULT_CAMERA_WEBRTC_OFFER_URL = "http://192.168.55.220:8080/offer";
export const MAIN_CAMERA_SOURCE_ID = "main";
export const SECONDARY_CAMERA_SOURCE_ID = "secondary";

export const DEFAULT_CAMERA_VIDEO_SOURCES: CameraVideoSource[] = [
  {
    id: MAIN_CAMERA_SOURCE_ID,
    label: "Main Camera",
    devicePath: "/dev/video0",
    port: 8080,
    streamUrl: DEFAULT_CAMERA_STREAM_URL
  },
  {
    id: SECONDARY_CAMERA_SOURCE_ID,
    label: "Second Camera",
    devicePath: "/dev/video1",
    port: 8081,
    streamUrl: DEFAULT_SECONDARY_CAMERA_STREAM_URL
  }
];

export const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  streamUrl: DEFAULT_CAMERA_STREAM_URL,
  webrtcOfferUrl: DEFAULT_CAMERA_WEBRTC_OFFER_URL,
  streamMode: "mjpeg",
  latencyProfile: "lowLatency",
  videoSources: DEFAULT_CAMERA_VIDEO_SOURCES,
  activeVideoSourceId: MAIN_CAMERA_SOURCE_ID,
  videoLayout: "single",
  panServoId: 1,
  tiltServoId: 2,
  panMinDeg: 0,
  panMaxDeg: 180,
  tiltMinDeg: 0,
  tiltMaxDeg: 180,
  panAngleDeg: 90,
  tiltAngleDeg: 90,
  stepDeg: 5,
  speedRaw: 800,
  acc: 30
};

export const DEFAULT_LINKAGE_MEMBER_SPEED_RAW = 800;
export const DEFAULT_LINKAGE_MEMBER_ACC = 30;
export const DEFAULT_LINKAGE_WHEEL_TURNS_TARGET = 1;
export const DEFAULT_ARM_JOINT_LENGTH_PX = 88;
export const ARM_MIN_JOINT_LENGTH_PX = 30;
export const ARM_MAX_JOINT_LENGTH_PX = 180;

export function validateServoDraft(draft: ServoDraft, existing: ServoProfile[]): ValidationErrorKey | null {
  const id = Number(draft.id);
  const name = draft.name.trim();

  if (!Number.isInteger(id) || !isValidServoId(id)) {
    return "validation.servoIdRange";
  }
  if (!name) {
    return "validation.nameRequired";
  }
  if (existing.some((servo) => servo.id === id)) {
    return "validation.duplicateServoId";
  }
  if (existing.some((servo) => servo.name.trim().toLowerCase() === name.toLowerCase())) {
    return "validation.duplicateServoName";
  }

  return null;
}

export function validateMotorDraft(draft: MotorDraft, existing: MotorProfile[]): ValidationErrorKey | null {
  const channel = normalizeMotorChannel(draft.channel);
  const name = draft.name.trim();

  if (!isValidMotorChannel(channel)) {
    return "validation.invalidMotorChannel";
  }
  if (!name) {
    return "validation.nameRequired";
  }
  if (existing.some((motor) => normalizeMotorChannel(motor.channel) === channel)) {
    return "validation.duplicateMotorChannel";
  }
  if (existing.some((motor) => motor.name.trim().toLowerCase() === name.toLowerCase())) {
    return "validation.duplicateMotorName";
  }

  return null;
}

export function validateMotorMapping(motor: MotorProfile): ValidationErrorKey | null {
  if (!motor.pwmPin?.trim() || !motor.in1Pin?.trim() || !motor.in2Pin?.trim()) {
    return "validation.motorMappingRequired";
  }
  if (
    !isValidMotorPin(motor.pwmPin, true) ||
    !isValidMotorPin(motor.in1Pin, true) ||
    !isValidMotorPin(motor.in2Pin, true) ||
    !isValidMotorPin(motor.enablePin) ||
    !isValidMotorPin(motor.sensorPin)
  ) {
    return "validation.invalidMotorPin";
  }

  return null;
}

export function validateCameraConfig(config: CameraConfig): ValidationErrorKey | null {
  if (!isValidServoId(config.panServoId) || !isValidServoId(config.tiltServoId) || config.panServoId === config.tiltServoId) {
    return "validation.cameraServoIds";
  }
  if (!isValidAngleRange(config.panMinDeg, config.panMaxDeg)) {
    return "validation.cameraPanRange";
  }
  if (!isValidAngleRange(config.tiltMinDeg, config.tiltMaxDeg)) {
    return "validation.cameraTiltRange";
  }
  if (!isFiniteNumber(config.panAngleDeg) || config.panAngleDeg < config.panMinDeg || config.panAngleDeg > config.panMaxDeg) {
    return "validation.cameraAngles";
  }
  if (!isFiniteNumber(config.tiltAngleDeg) || config.tiltAngleDeg < config.tiltMinDeg || config.tiltAngleDeg > config.tiltMaxDeg) {
    return "validation.cameraAngles";
  }
  if (!Number.isInteger(config.speedRaw) || config.speedRaw < 0 || config.speedRaw > 4095) {
    return "validation.cameraMotion";
  }
  if (!Number.isInteger(config.acc) || config.acc < 0 || config.acc > 254) {
    return "validation.cameraMotion";
  }
  if (!isFiniteNumber(config.stepDeg) || config.stepDeg <= 0 || config.stepDeg > 90) {
    return "validation.cameraMotion";
  }

  return null;
}

export function loadServos(storage: Storage = window.localStorage): ServoProfile[] {
  const raw = storage.getItem(SERVO_LIBRARY_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_SERVOS;
  }

  try {
    const parsed = JSON.parse(raw) as ServoProfile[];
    if (!Array.isArray(parsed)) {
      return DEFAULT_SERVOS;
    }
    const valid = parsed
      .filter((servo) => isValidServoId(servo.id) && typeof servo.name === "string" && servo.name.trim())
      .map((servo) => normalizeServoProfile(servo));
    return valid.length > 0 ? valid : DEFAULT_SERVOS;
  } catch {
    return DEFAULT_SERVOS;
  }
}

export function saveServos(servos: ServoProfile[], storage: Storage = window.localStorage): void {
  storage.setItem(SERVO_LIBRARY_STORAGE_KEY, JSON.stringify(servos.map((servo) => normalizeServoProfile(servo))));
}

export function loadServoLinkageGroups(servos: ServoProfile[], storage: Storage = window.localStorage): ServoLinkageGroup[] {
  const raw = storage.getItem(SERVO_LINKAGE_GROUPS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return normalizeServoLinkageGroups(JSON.parse(raw), servos);
  } catch {
    return [];
  }
}

export function saveServoLinkageGroups(groups: ServoLinkageGroup[], servos: ServoProfile[], storage: Storage = window.localStorage): void {
  storage.setItem(SERVO_LINKAGE_GROUPS_STORAGE_KEY, JSON.stringify(normalizeServoLinkageGroups(groups, servos)));
}

export function createDefaultArmConfig(servos: ServoProfile[]): ArmConfig {
  const joints = servos.slice(0, 3).map((servo, index) => createDefaultArmJoint(servo, index));
  return {
    joints,
    liveDragEnabled: false,
    selectedJointId: joints[0]?.id ?? null
  };
}

export function loadArmConfig(servos: ServoProfile[], storage: Storage = window.localStorage): ArmConfig {
  const raw = storage.getItem(ARM_CONFIG_STORAGE_KEY);
  if (!raw) {
    return createDefaultArmConfig(servos);
  }

  try {
    return normalizeArmConfig(JSON.parse(raw), servos);
  } catch {
    return createDefaultArmConfig(servos);
  }
}

export function saveArmConfig(config: ArmConfig, servos: ServoProfile[], storage: Storage = window.localStorage): void {
  storage.setItem(ARM_CONFIG_STORAGE_KEY, JSON.stringify(normalizeArmConfig(config, servos)));
}

export function calculateArmSegmentPoses(joints: ArmJointConfig[], origin: ArmPoint = { x: 300, y: 250 }): ArmSegmentPose[] {
  const poses: ArmSegmentPose[] = [];
  let startX = origin.x;
  let startY = origin.y;
  let globalDeg = 0;

  for (const joint of joints) {
    const relativeDeg = joint.angleDeg - joint.neutralDeg;
    globalDeg += relativeDeg;
    const radians = degreesToRadians(globalDeg);
    const endX = startX + Math.cos(radians) * joint.lengthPx;
    const endY = startY - Math.sin(radians) * joint.lengthPx;
    poses.push({
      jointId: joint.id,
      name: joint.name,
      servoId: joint.servoId,
      lengthPx: joint.lengthPx,
      angleDeg: joint.angleDeg,
      neutralDeg: joint.neutralDeg,
      relativeDeg,
      globalDeg,
      startX,
      startY,
      endX,
      endY
    });
    startX = endX;
    startY = endY;
  }

  return poses;
}

export function calculateArmDragAngle(options: {
  anchor: ArmPoint;
  pointer: ArmPoint;
  parentGlobalDeg: number;
  neutralDeg: number;
  servoSpanDeg: number;
  currentAngleDeg?: number;
}): number {
  const rawGlobalDeg = radiansToDegrees(Math.atan2(options.anchor.y - options.pointer.y, options.pointer.x - options.anchor.x));
  const baseAngleDeg = rawGlobalDeg - options.parentGlobalDeg + options.neutralDeg;
  const span = clamp(Number.isFinite(options.servoSpanDeg) ? options.servoSpanDeg : 0, 0, 360);
  const currentAngle = clamp(Number.isFinite(options.currentAngleDeg) ? options.currentAngleDeg! : options.neutralDeg, 0, span);
  const candidates = [-720, -360, 0, 360, 720]
    .map((offset) => baseAngleDeg + offset)
    .filter((angle) => angle >= 0 && angle <= span);

  if (candidates.length === 0) {
    return clamp(baseAngleDeg, 0, span);
  }

  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - currentAngle) < Math.abs(best - currentAngle) ? candidate : best
  );
}

export function calculateServoLinkageTargets(group: ServoLinkageGroup, servos: ServoProfile[]): ServoLinkageTarget[] {
  const servoById = new Map(servos.map((servo) => [servo.id, normalizeServoProfile(servo)]));
  const masterRatio = clamp(group.masterPercent, 0, 100) / 100;

  return group.members
    .map((member) => {
      const servo = servoById.get(member.servoId);
      if (!servo) {
        return null;
      }

      const weightRatio = clamp(member.weightPercent, 0, 100) / 100;
      const logicalAngleDeg = clamp(servoLogicalSpan(servo) * masterRatio * weightRatio, 0, servoLogicalSpan(servo));
      return {
        servo,
        servoId: servo.id,
        name: servo.name,
        weightPercent: member.weightPercent,
        speedRaw: member.speedRaw,
        acc: member.acc,
        reverse: member.reverse,
        logicalAngleDeg,
        physicalAngleDeg: servoLogicalToPhysicalAngleWithReverse(servo, logicalAngleDeg, member.reverse)
      };
    })
    .filter((target): target is ServoLinkageTarget => target !== null);
}

export function calculateServoLinkageWheelTargets(group: ServoLinkageGroup, servos: ServoProfile[], direction: ServoLinkageWheelDirection): ServoLinkageWheelTarget[] {
  const servoById = new Map(servos.map((servo) => [servo.id, normalizeServoProfile(servo)]));
  const directionSign = direction === "clockwise" ? 1 : -1;

  return group.members
    .map((member) => {
      const servo = servoById.get(member.servoId);
      if (!servo) {
        return null;
      }

      const speedRaw = clamp(Math.round(member.speedRaw), 0, DEFAULT_WHEEL_SPEED_LIMIT);
      const commandSpeedRaw = speedRaw * directionSign;
      return {
        servo,
        servoId: servo.id,
        name: servo.name,
        speedRaw,
        commandSpeedRaw,
        effectiveSpeedRaw: applyServoWheelDirection(servo, commandSpeedRaw, member.reverse),
        acc: member.acc,
        reverse: member.reverse
      };
    })
    .filter((target): target is ServoLinkageWheelTarget => target !== null);
}

export function loadMotors(storage: Storage = window.localStorage): MotorProfile[] {
  const raw = storage.getItem(MOTOR_LIBRARY_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_MOTORS;
  }

  try {
    const parsed = JSON.parse(raw) as MotorProfile[];
    if (!Array.isArray(parsed)) {
      return DEFAULT_MOTORS;
    }
    const valid = parsed
      .filter((motor) => typeof motor.channel === "string" && isValidMotorChannel(motor.channel) && typeof motor.name === "string" && motor.name.trim())
      .map((motor) => normalizeMotorProfile(motor));
    return valid.length > 0 ? valid : DEFAULT_MOTORS;
  } catch {
    return DEFAULT_MOTORS;
  }
}

export function saveMotors(motors: MotorProfile[], storage: Storage = window.localStorage): void {
  storage.setItem(MOTOR_LIBRARY_STORAGE_KEY, JSON.stringify(motors.map((motor) => normalizeMotorProfile(motor))));
}

export function loadMotorLinkageGroups(motors: MotorProfile[], storage: Storage = window.localStorage): MotorLinkageGroup[] {
  const raw = storage.getItem(MOTOR_LINKAGE_GROUPS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return normalizeMotorLinkageGroups(JSON.parse(raw), motors);
  } catch {
    return [];
  }
}

export function saveMotorLinkageGroups(groups: MotorLinkageGroup[], motors: MotorProfile[], storage: Storage = window.localStorage): void {
  storage.setItem(MOTOR_LINKAGE_GROUPS_STORAGE_KEY, JSON.stringify(normalizeMotorLinkageGroups(groups, motors)));
}

export function calculateMotorLinkageTargets(group: MotorLinkageGroup, motors: MotorProfile[]): MotorLinkageTarget[] {
  const motorByChannel = new Map(motors.map((motor) => [normalizeMotorChannel(motor.channel), normalizeMotorProfile(motor)]));
  const masterSpeed = clamp(group.masterSpeedPercent, -100, 100);

  return group.members
    .map((member) => {
      const channel = normalizeMotorChannel(member.channel);
      const motor = motorByChannel.get(channel);
      if (!motor) {
        return null;
      }

      const direction = member.reverse ? -1 : 1;
      const speedPercent = clamp((masterSpeed * clamp(member.weightPercent, 0, 100) * direction) / 100, -100, 100);
      return {
        motor,
        channel,
        name: motor.name,
        weightPercent: member.weightPercent,
        reverse: member.reverse,
        speedPercent
      };
    })
    .filter((target): target is MotorLinkageTarget => target !== null);
}

export function loadCameraConfig(storage: Storage = window.localStorage): CameraConfig {
  const raw = storage.getItem(CAMERA_CONFIG_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_CAMERA_CONFIG;
  }

  try {
    return normalizeCameraConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_CAMERA_CONFIG;
  }
}

export function saveCameraConfig(config: CameraConfig, storage: Storage = window.localStorage): void {
  storage.setItem(CAMERA_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function normalizeCameraConfig(value: unknown): CameraConfig {
  if (!value || typeof value !== "object") {
    return DEFAULT_CAMERA_CONFIG;
  }

  const draft = value as Partial<CameraConfig>;
  const legacyStreamUrl = typeof draft.streamUrl === "string" ? draft.streamUrl.trim() : DEFAULT_CAMERA_CONFIG.streamUrl;
  const savedVideoSources = Array.isArray(draft.videoSources) ? normalizeCameraVideoSources(draft.videoSources, "") : null;
  const savedMainSource = savedVideoSources?.find((source) => source.id === MAIN_CAMERA_SOURCE_ID);
  const mainStreamUrl =
    !savedVideoSources || (legacyStreamUrl && legacyStreamUrl !== DEFAULT_CAMERA_CONFIG.streamUrl && savedMainSource?.streamUrl === DEFAULT_CAMERA_STREAM_URL)
      ? legacyStreamUrl
      : "";
  const videoSources = normalizeCameraVideoSources(draft.videoSources, mainStreamUrl);
  const mainSource = videoSources.find((source) => source.id === MAIN_CAMERA_SOURCE_ID) ?? videoSources[0] ?? DEFAULT_CAMERA_VIDEO_SOURCES[0];
  const draftActiveVideoSourceId = typeof draft.activeVideoSourceId === "string" ? draft.activeVideoSourceId.trim() : "";
  const activeVideoSourceId =
    draftActiveVideoSourceId && videoSources.some((source) => source.id === draftActiveVideoSourceId)
      ? draftActiveVideoSourceId
      : MAIN_CAMERA_SOURCE_ID;
  const config: CameraConfig = {
    streamUrl: mainSource.streamUrl,
    webrtcOfferUrl: typeof draft.webrtcOfferUrl === "string" ? draft.webrtcOfferUrl.trim() : buildCameraOfferUrl(mainSource.streamUrl),
    streamMode: draft.streamMode === "webrtc" ? "webrtc" : "mjpeg",
    latencyProfile: draft.latencyProfile === "balanced" || draft.latencyProfile === "sharp" ? draft.latencyProfile : "lowLatency",
    videoSources,
    activeVideoSourceId,
    videoLayout: draft.videoLayout === "dual" ? "dual" : "single",
    panServoId: numberOrDefault(draft.panServoId, DEFAULT_CAMERA_CONFIG.panServoId),
    tiltServoId: numberOrDefault(draft.tiltServoId, DEFAULT_CAMERA_CONFIG.tiltServoId),
    panMinDeg: numberOrDefault(draft.panMinDeg, DEFAULT_CAMERA_CONFIG.panMinDeg),
    panMaxDeg: numberOrDefault(draft.panMaxDeg, DEFAULT_CAMERA_CONFIG.panMaxDeg),
    tiltMinDeg: numberOrDefault(draft.tiltMinDeg, DEFAULT_CAMERA_CONFIG.tiltMinDeg),
    tiltMaxDeg: numberOrDefault(draft.tiltMaxDeg, DEFAULT_CAMERA_CONFIG.tiltMaxDeg),
    panAngleDeg: numberOrDefault(draft.panAngleDeg, DEFAULT_CAMERA_CONFIG.panAngleDeg),
    tiltAngleDeg: numberOrDefault(draft.tiltAngleDeg, DEFAULT_CAMERA_CONFIG.tiltAngleDeg),
    stepDeg: numberOrDefault(draft.stepDeg, DEFAULT_CAMERA_CONFIG.stepDeg),
    speedRaw: numberOrDefault(draft.speedRaw, DEFAULT_CAMERA_CONFIG.speedRaw),
    acc: numberOrDefault(draft.acc, DEFAULT_CAMERA_CONFIG.acc)
  };

  return validateCameraConfig(config) ? DEFAULT_CAMERA_CONFIG : config;
}

function normalizeCameraVideoSources(value: unknown, mainStreamUrl: string): CameraVideoSource[] {
  const defaults = DEFAULT_CAMERA_VIDEO_SOURCES.map((source) => ({
    ...source,
    streamUrl: source.id === MAIN_CAMERA_SOURCE_ID && mainStreamUrl ? mainStreamUrl : source.streamUrl
  }));
  const byId = new Map(defaults.map((source) => [source.id, source]));

  if (Array.isArray(value)) {
    for (const item of value) {
      const source = normalizeCameraVideoSource(item);
      if (source) {
        byId.set(source.id, {
          ...byId.get(source.id),
          ...source,
          streamUrl: source.id === MAIN_CAMERA_SOURCE_ID && mainStreamUrl ? mainStreamUrl : source.streamUrl
        });
      }
    }
  }

  return defaults
    .map((source) => byId.get(source.id) ?? source)
    .concat(Array.from(byId.values()).filter((source) => !defaults.some((defaultSource) => defaultSource.id === source.id)));
}

function normalizeCameraVideoSource(value: unknown): CameraVideoSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const draft = value as Partial<CameraVideoSource>;
  const id = typeof draft.id === "string" ? draft.id.trim() : "";
  const label = typeof draft.label === "string" && draft.label.trim() ? draft.label.trim() : id;
  const devicePath = typeof draft.devicePath === "string" && draft.devicePath.trim() ? draft.devicePath.trim() : "";
  const port = normalizeCameraPort(draft.port);
  const streamUrl = typeof draft.streamUrl === "string" ? draft.streamUrl.trim() : "";
  if (!id || !label || !devicePath || !port || !streamUrl) {
    return null;
  }
  return { id, label, devicePath, port, streamUrl };
}

function normalizeCameraPort(value: unknown): number | null {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function buildCameraOfferUrl(streamUrl: string): string {
  try {
    const url = new URL(streamUrl);
    url.pathname = "/offer";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return DEFAULT_CAMERA_CONFIG.webrtcOfferUrl;
  }
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isValidAngleRange(min: number, max: number): boolean {
  return isFiniteNumber(min) && isFiniteNumber(max) && min >= 0 && max <= 360 && min < max;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveNumberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeArmConfig(value: unknown, servos: ServoProfile[]): ArmConfig {
  if (!value || typeof value !== "object") {
    return createDefaultArmConfig(servos);
  }

  const draft = value as Partial<ArmConfig>;
  const validServoIds = new Set(servos.map((servo) => servo.id));
  const servoById = new Map(servos.map((servo) => [servo.id, normalizeServoProfile(servo)]));
  const usedJointIds = new Set<string>();
  const usedServoIds = new Set<number>();
  const joints = Array.isArray(draft.joints)
    ? draft.joints
        .map((joint, index) => normalizeArmJoint(joint, index, validServoIds, servoById, usedJointIds, usedServoIds))
        .filter((joint): joint is ArmJointConfig => joint !== null)
    : createDefaultArmConfig(servos).joints;
  const selectedJointId =
    typeof draft.selectedJointId === "string" && joints.some((joint) => joint.id === draft.selectedJointId)
      ? draft.selectedJointId
      : joints[0]?.id ?? null;

  return {
    joints,
    liveDragEnabled: draft.liveDragEnabled === true,
    selectedJointId
  };
}

export function normalizeServoLinkageGroups(value: unknown, servos: ServoProfile[]): ServoLinkageGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const validServoIds = new Set(servos.map((servo) => servo.id));
  const usedGroupIds = new Set<string>();
  const groups: ServoLinkageGroup[] = [];

  value.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const draft = item as Partial<ServoLinkageGroup>;
    if (!isValidPercent(draft.masterPercent)) {
      return;
    }

    const groupServoIds = new Set<number>();
    const members = Array.isArray(draft.members)
      ? draft.members
          .map((member) => normalizeServoLinkageMember(member, validServoIds, groupServoIds))
          .filter((member): member is ServoLinkageMember => member !== null)
      : [];
    const fallbackId = `linkage-${index + 1}`;
    const rawId = typeof draft.id === "string" && draft.id.trim() ? draft.id.trim() : fallbackId;
    const id = uniqueLinkageGroupId(rawId, usedGroupIds);
    usedGroupIds.add(id);

    groups.push({
      id,
      name: typeof draft.name === "string" && draft.name.trim() ? draft.name.trim() : `Linkage ${index + 1}`,
      enabled: draft.enabled === true,
      mode: draft.mode === "wheel" ? "wheel" : "position",
      masterPercent: draft.masterPercent,
      wheelTurnLimitEnabled: draft.wheelTurnLimitEnabled === true,
      wheelClockwiseTurnsTarget: positiveNumberOrDefault(draft.wheelClockwiseTurnsTarget, DEFAULT_LINKAGE_WHEEL_TURNS_TARGET),
      wheelCounterclockwiseTurnsTarget: positiveNumberOrDefault(draft.wheelCounterclockwiseTurnsTarget, DEFAULT_LINKAGE_WHEEL_TURNS_TARGET),
      members
    });
  });

  return groups;
}

export function normalizeMotorLinkageGroups(value: unknown, motors: MotorProfile[]): MotorLinkageGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const validChannels = new Set(motors.map((motor) => normalizeMotorChannel(motor.channel)));
  const usedGroupIds = new Set<string>();
  const groups: MotorLinkageGroup[] = [];

  value.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const draft = item as Partial<MotorLinkageGroup>;
    const groupChannels = new Set<string>();
    const members = Array.isArray(draft.members)
      ? draft.members
          .map((member) => normalizeMotorLinkageMember(member, validChannels, groupChannels))
          .filter((member): member is MotorLinkageMember => member !== null)
      : [];
    const fallbackId = `motor-linkage-${index + 1}`;
    const rawId = typeof draft.id === "string" && draft.id.trim() ? draft.id.trim() : fallbackId;
    const id = uniqueLinkageGroupId(rawId, usedGroupIds);
    usedGroupIds.add(id);

    groups.push({
      id,
      name: typeof draft.name === "string" && draft.name.trim() ? draft.name.trim() : `Motor Linkage ${index + 1}`,
      enabled: draft.enabled === true,
      masterSpeedPercent: isValidSignedPercent(draft.masterSpeedPercent) ? draft.masterSpeedPercent : 0,
      members
    });
  });

  return groups;
}

function normalizeMotorLinkageMember(value: unknown, validChannels: ReadonlySet<string>, groupChannels: Set<string>): MotorLinkageMember | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const draft = value as Partial<MotorLinkageMember>;
  const channel = normalizeMotorChannel(draft.channel ?? "");
  if (!isValidMotorChannel(channel) || !validChannels.has(channel) || groupChannels.has(channel)) {
    return null;
  }
  if (!isValidPercent(draft.weightPercent)) {
    return null;
  }

  groupChannels.add(channel);
  return {
    channel,
    weightPercent: draft.weightPercent,
    reverse: draft.reverse === true
  };
}

function normalizeServoLinkageMember(value: unknown, validServoIds: ReadonlySet<number>, groupServoIds: Set<number>): ServoLinkageMember | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const draft = value as Partial<ServoLinkageMember>;
  if (!isValidServoId(draft.servoId ?? -1) || !validServoIds.has(draft.servoId!) || groupServoIds.has(draft.servoId!)) {
    return null;
  }
  if (!isValidPercent(draft.weightPercent)) {
    return null;
  }

  const speedRaw = numberOrDefault(draft.speedRaw, DEFAULT_LINKAGE_MEMBER_SPEED_RAW);
  const acc = numberOrDefault(draft.acc, DEFAULT_LINKAGE_MEMBER_ACC);
  if (!Number.isInteger(speedRaw) || speedRaw < 0 || speedRaw > 4095 || !Number.isInteger(acc) || acc < 0 || acc > 254) {
    return null;
  }

  groupServoIds.add(draft.servoId!);
  return {
    servoId: draft.servoId!,
    weightPercent: draft.weightPercent!,
    speedRaw,
    acc,
    reverse: draft.reverse === true
  };
}

function createDefaultArmJoint(servo: ServoProfile, index: number): ArmJointConfig {
  const normalized = normalizeServoProfile(servo);
  const neutralDeg = clamp(90, 0, servoLogicalSpan(normalized));
  return {
    id: `arm-joint-${index + 1}`,
    name: `Joint ${index + 1}`,
    servoId: normalized.id,
    lengthPx: DEFAULT_ARM_JOINT_LENGTH_PX,
    angleDeg: neutralDeg,
    neutralDeg,
    speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
    acc: DEFAULT_LINKAGE_MEMBER_ACC,
    reverse: false,
    enabled: true
  };
}

function normalizeArmJoint(
  value: unknown,
  index: number,
  validServoIds: ReadonlySet<number>,
  servoById: ReadonlyMap<number, ServoProfile>,
  usedJointIds: Set<string>,
  usedServoIds: Set<number>
): ArmJointConfig | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const draft = value as Partial<ArmJointConfig>;
  if (!isValidServoId(draft.servoId ?? -1) || !validServoIds.has(draft.servoId!) || usedServoIds.has(draft.servoId!)) {
    return null;
  }

  const servo = servoById.get(draft.servoId!);
  if (!servo) {
    return null;
  }

  const fallbackId = `arm-joint-${index + 1}`;
  const rawId = typeof draft.id === "string" && draft.id.trim() ? draft.id.trim() : fallbackId;
  const id = uniqueLinkageGroupId(rawId, usedJointIds);
  const span = servoLogicalSpan(servo);
  const neutralDeg = clamp(numberOrDefault(draft.neutralDeg, clamp(90, 0, span)), 0, span);
  const speedRaw = clamp(Math.round(numberOrDefault(draft.speedRaw, DEFAULT_LINKAGE_MEMBER_SPEED_RAW)), 0, 4095);
  const acc = clamp(Math.round(numberOrDefault(draft.acc, DEFAULT_LINKAGE_MEMBER_ACC)), 0, 254);

  usedJointIds.add(id);
  usedServoIds.add(draft.servoId!);
  return {
    id,
    name: typeof draft.name === "string" && draft.name.trim() ? draft.name.trim() : `Joint ${index + 1}`,
    servoId: draft.servoId!,
    lengthPx: clamp(Math.round(numberOrDefault(draft.lengthPx, DEFAULT_ARM_JOINT_LENGTH_PX)), ARM_MIN_JOINT_LENGTH_PX, ARM_MAX_JOINT_LENGTH_PX),
    angleDeg: clamp(numberOrDefault(draft.angleDeg, neutralDeg), 0, span),
    neutralDeg,
    speedRaw,
    acc,
    reverse: draft.reverse === true,
    enabled: draft.enabled !== false
  };
}

function isValidPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isValidSignedPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -100 && value <= 100;
}

function uniqueLinkageGroupId(id: string, usedIds: ReadonlySet<string>): string {
  if (!usedIds.has(id)) {
    return id;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${id}-${suffix}`;
    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }
}

function degreesToRadians(value: number): number {
  return (value / 180) * Math.PI;
}

function radiansToDegrees(value: number): number {
  return (value / Math.PI) * 180;
}

function normalizeMotorProfile(motor: MotorProfile): MotorProfile {
  const legacyDirPin = normalizeMotorPin(motor.dirPin);
  const legacyBrakePin = normalizeMotorPin(motor.brakePin);
  return {
    channel: normalizeMotorChannel(motor.channel),
    name: motor.name.trim(),
    ...(normalizeMotorPin(motor.pwmPin) ? { pwmPin: normalizeMotorPin(motor.pwmPin) } : {}),
    ...(normalizeMotorPin(motor.in1Pin) || legacyDirPin ? { in1Pin: normalizeMotorPin(motor.in1Pin) ?? legacyDirPin } : {}),
    ...(normalizeMotorPin(motor.in2Pin) ? { in2Pin: normalizeMotorPin(motor.in2Pin) } : {}),
    ...(normalizeMotorPin(motor.enablePin) || legacyBrakePin ? { enablePin: normalizeMotorPin(motor.enablePin) ?? legacyBrakePin } : {}),
    ...(normalizeMotorPin(motor.sensorPin) ? { sensorPin: normalizeMotorPin(motor.sensorPin) } : {})
  };
}
