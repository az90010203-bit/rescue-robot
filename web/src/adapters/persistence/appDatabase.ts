import { SupportedLanguage, defaultLanguage, getInitialLanguage, isSupportedLanguage, saveLanguagePreference } from "../../i18n/languages";
import { InputMapping, loadInputMapping, normalizeInputMapping, saveInputMapping } from "@domains/drive/inputMapping";
import { ArmTeachTrack, normalizeArmTeachTracks } from "@domains/arm/armTeach";
import { ServoSafetyPreset } from "@domains/servo/servoSafety";
import { ServoSmoothPreset } from "@domains/servo/servoMotion";
import { WHEEL_SLIDER_CENTER_DEG, WHEEL_SLIDER_MAX_DEG, WHEEL_SLIDER_MIN_DEG, normalizeWheelMaxSpeedRaw } from "@domains/servo/servoWheelSlider";
import {
  ArmConfig,
  CameraConfig,
  CAMERA_CONFIG_STORAGE_KEY,
  MOTOR_LIBRARY_STORAGE_KEY,
  MotorLinkageGroup,
  SERVO_LIBRARY_STORAGE_KEY,
  ServoLinkageGroup,
  loadCameraConfig,
  loadArmConfig,
  loadMotorLinkageGroups,
  loadMotors,
  loadServoLinkageGroups,
  loadServos,
  normalizeArmConfig,
  normalizeMotorLinkageGroups,
  normalizeServoLinkageGroups,
  saveCameraConfig,
  saveArmConfig,
  saveMotorLinkageGroups,
  saveMotors,
  saveServoLinkageGroups,
  saveServos
} from "@adapters/persistence/storage";
import { DEFAULT_WHEEL_SPEED_LIMIT, MotorProfile, ServoProfile, clamp, clampServoLogicalAngle, normalizeServoProfile } from "@adapters/hardware/protocol";

export const APP_DATABASE_NAME = "rescue-robot-control-db";
export const APP_DATABASE_VERSION = 1;
const APP_CONFIG_STORE = "config";
const APP_CONFIG_KEY = "app";

export type PersistedActiveModule = "servo" | "arm" | "motor" | "camera" | "mapping";
export type PersistedServoControlMode = "position" | "wheel";

export interface PersistedServoCommandState {
  mode: PersistedServoControlMode;
  angleDeg: string;
  speedRaw: string;
  acc: string;
  liveDragEnabled: boolean;
  reverse: boolean;
  wheelTurnsEnabled: boolean;
  wheelTurnsTarget: string;
  wheelSliderDeg: string;
}

export type PersistedServoCommandMap = Record<number, PersistedServoCommandState>;

export interface ServoSmoothingSettings {
  enabled: boolean;
  preset: ServoSmoothPreset;
}

export interface ServoSafetySettings {
  enabled: boolean;
  preset: ServoSafetyPreset;
}

export interface AppConfigSnapshot {
  version: 1;
  servos: ServoProfile[];
  servoCommands: PersistedServoCommandMap;
  servoLinkageGroups: ServoLinkageGroup[];
  servoSmoothing: ServoSmoothingSettings;
  servoSafety: ServoSafetySettings;
  motors: MotorProfile[];
  motorLinkageGroups: MotorLinkageGroup[];
  armConfig: ArmConfig;
  armTeachTracks: ArmTeachTrack[];
  cameraConfig: CameraConfig;
  inputMapping: InputMapping;
  language: SupportedLanguage;
  lastActiveModule: PersistedActiveModule;
  updatedAt: number;
}

export type AppStateSnapshotVersion = 2;
export type PersistedDriveBase = "tracked" | "mecanum";
export type PersistedMotorStopMode = "coast" | "brake";
export type PersistedLogDirection = "tx" | "rx" | "system";
export type PersistedLogLevel = "info" | "warn" | "error";

export interface PersistedLogEntry {
  id?: number;
  direction: PersistedLogDirection;
  level?: PersistedLogLevel;
  messageKey?: string;
  text?: string;
  values?: Record<string, string | number | boolean>;
  createdAt?: number;
}

export interface AppUiSnapshot {
  activeModule: PersistedActiveModule;
  selectedServoId: number | "";
  selectedMotorChannel: string;
  expandedServoLinkageGroupIds: string[];
  expandedMotorLinkageGroupIds: string[];
  linkageWheelDirectionByGroup: Record<string, "clockwise" | "counterclockwise" | "paused">;
  servoDraft: { id: string; name: string };
  motorDraft: { channel: string; name: string };
  motorSpeed: string;
  stopMode: PersistedMotorStopMode;
  activeDriveBase: PersistedDriveBase;
  driveSpeedLimit: string;
  selectedGamepadIndex: number | "";
  firmwareBoard: string;
  selectedFirmwarePort: string;
}

export interface AppRuntimeSnapshot {
  stale: boolean;
  logs: PersistedLogEntry[];
  servoFeedback: Record<string, Record<string, unknown>>;
  motorFeedback: Record<string, Record<string, unknown>>;
  wheelTurnProgress: Record<string, Record<string, unknown>>;
  lastMotorError: Record<string, unknown> | null;
}

export interface AppStateSnapshotV2 {
  version: AppStateSnapshotVersion;
  config: AppConfigSnapshot;
  ui: AppUiSnapshot;
  runtime: AppRuntimeSnapshot;
  updatedAt: number;
}

export type AppConfigSnapshotSource = "database" | "legacy" | "legacy-unavailable";

export interface ProjectStateRepository<TSnapshot> {
  load(): Promise<TSnapshot | null>;
  save(snapshot: TSnapshot): Promise<void>;
  clear?(): Promise<void>;
}

export interface BrowserProjectStateRepository extends ProjectStateRepository<AppConfigSnapshot> {
  loadOrMigrate(): Promise<{ snapshot: AppConfigSnapshot; source: AppConfigSnapshotSource }>;
  saveLegacyBackup(snapshot: AppConfigSnapshot): void;
}

export const DEFAULT_SERVO_SMOOTHING_SETTINGS: ServoSmoothingSettings = {
  enabled: true,
  preset: "standard"
};

export const DEFAULT_SERVO_SAFETY_SETTINGS: ServoSafetySettings = {
  enabled: true,
  preset: "standard"
};

const DEFAULT_SERVO_COMMAND_STATE: PersistedServoCommandState = {
  mode: "position",
  angleDeg: "90",
  speedRaw: "300",
  acc: "30",
  liveDragEnabled: true,
  reverse: false,
  wheelTurnsEnabled: false,
  wheelTurnsTarget: "1",
  wheelSliderDeg: String(WHEEL_SLIDER_CENTER_DEG)
};

export function normalizeAppConfigSnapshot(value: unknown): AppConfigSnapshot {
  const draft = isObject(value) ? value : {};
  const servos = normalizeServoList(draft.servos);
  const motors = normalizeMotorList(draft.motors);

  const armConfig = normalizeArmConfig(draft.armConfig, servos);
  return {
    version: 1,
    servos,
    servoCommands: normalizeServoCommandMap(draft.servoCommands, servos),
    servoLinkageGroups: normalizeServoLinkageGroups(draft.servoLinkageGroups, servos),
    servoSmoothing: normalizeServoSmoothing(draft.servoSmoothing),
    servoSafety: normalizeServoSafety(draft.servoSafety),
    motors,
    motorLinkageGroups: normalizeMotorLinkageGroups(draft.motorLinkageGroups, motors),
    armConfig,
    armTeachTracks: normalizeArmTeachTracks(draft.armTeachTracks, armConfig),
    cameraConfig: normalizeCameraConfigValue(draft.cameraConfig),
    inputMapping: normalizeInputMapping(draft.inputMapping),
    language: typeof draft.language === "string" && isSupportedLanguage(draft.language) ? draft.language : defaultLanguage,
    lastActiveModule: normalizeActiveModule(draft.lastActiveModule),
    updatedAt: typeof draft.updatedAt === "number" && Number.isFinite(draft.updatedAt) ? draft.updatedAt : Date.now()
  };
}

export function createAppConfigSnapshot(value: Omit<AppConfigSnapshot, "version" | "updatedAt" | "armTeachTracks"> & { armTeachTracks?: ArmTeachTrack[]; updatedAt?: number }): AppConfigSnapshot {
  return normalizeAppConfigSnapshot({
    ...value,
    version: 1,
    updatedAt: value.updatedAt ?? Date.now()
  });
}

export function createAppStateSnapshotV2(value: {
  config: AppConfigSnapshot;
  ui?: Partial<AppUiSnapshot>;
  runtime?: Partial<AppRuntimeSnapshot>;
  updatedAt?: number;
}): AppStateSnapshotV2 {
  return normalizeAppStateSnapshotV2({
    version: 2,
    config: value.config,
    ui: value.ui,
    runtime: value.runtime,
    updatedAt: value.updatedAt ?? Date.now()
  });
}

export function normalizeAppStateSnapshotV2(value: unknown): AppStateSnapshotV2 {
  const draft = isObject(value) ? value : {};
  const config = normalizeAppConfigSnapshot(isObject(draft.config) ? draft.config : draft);
  return {
    version: 2,
    config,
    ui: normalizeAppUiSnapshot(draft.ui, config),
    runtime: normalizeAppRuntimeSnapshot(draft.runtime),
    updatedAt: typeof draft.updatedAt === "number" && Number.isFinite(draft.updatedAt) ? draft.updatedAt : Date.now()
  };
}

export function loadLegacyAppConfigSnapshot(storage: Storage | undefined = getBrowserLocalStorage()): AppConfigSnapshot {
  const legacyStorage = storage ?? createMemoryStorage();
  const servos = loadServos(legacyStorage);
  const motors = loadMotors(legacyStorage);
  return createAppConfigSnapshot({
    servos,
    servoCommands: {},
    servoLinkageGroups: loadServoLinkageGroups(servos, legacyStorage),
    servoSmoothing: DEFAULT_SERVO_SMOOTHING_SETTINGS,
    servoSafety: DEFAULT_SERVO_SAFETY_SETTINGS,
    motors,
    motorLinkageGroups: loadMotorLinkageGroups(motors, legacyStorage),
    armConfig: loadArmConfig(servos, legacyStorage),
    armTeachTracks: [],
    cameraConfig: loadCameraConfig(legacyStorage),
    inputMapping: loadInputMapping(legacyStorage),
    language: getInitialLanguage(legacyStorage),
    lastActiveModule: "servo"
  });
}

export function saveLegacyAppConfigBackup(snapshot: AppConfigSnapshot, storage: Storage | undefined = getBrowserLocalStorage()): void {
  if (!storage) {
    return;
  }

  const normalized = normalizeAppConfigSnapshot(snapshot);
  saveServos(normalized.servos, storage);
  saveServoLinkageGroups(normalized.servoLinkageGroups, normalized.servos, storage);
  saveArmConfig(normalized.armConfig, normalized.servos, storage);
  saveMotors(normalized.motors, storage);
  saveMotorLinkageGroups(normalized.motorLinkageGroups, normalized.motors, storage);
  saveCameraConfig(normalized.cameraConfig, storage);
  saveInputMapping(normalized.inputMapping, storage);
  saveLanguagePreference(normalized.language, storage);
}

export async function loadOrMigrateAppConfigSnapshot(options: {
  indexedDb?: IDBFactory;
  legacyStorage?: Storage;
} = {}): Promise<{ snapshot: AppConfigSnapshot; source: AppConfigSnapshotSource }> {
  const indexedDb = options.indexedDb ?? getBrowserIndexedDb();
  if (!indexedDb) {
    return {
      snapshot: loadLegacyAppConfigSnapshot(options.legacyStorage),
      source: "legacy-unavailable"
    };
  }

  const databaseSnapshot = await loadAppDatabaseSnapshot(indexedDb);
  if (databaseSnapshot) {
    return { snapshot: databaseSnapshot, source: "database" };
  }

  const legacySnapshot = loadLegacyAppConfigSnapshot(options.legacyStorage);
  await saveAppDatabaseSnapshot(legacySnapshot, indexedDb);
  return { snapshot: legacySnapshot, source: "legacy" };
}

export async function loadAppDatabaseSnapshot(indexedDb: IDBFactory | undefined = getBrowserIndexedDb()): Promise<AppConfigSnapshot | null> {
  if (!indexedDb) {
    return null;
  }

  const db = await openAppDatabase(indexedDb);
  try {
    const raw = await getFromStore<unknown>(db, APP_CONFIG_KEY);
    return raw ? normalizeAppConfigSnapshot(raw) : null;
  } finally {
    db.close();
  }
}

export async function saveAppDatabaseSnapshot(snapshot: AppConfigSnapshot, indexedDb: IDBFactory | undefined = getBrowserIndexedDb()): Promise<void> {
  if (!indexedDb) {
    throw new Error("IndexedDB is unavailable");
  }

  const db = await openAppDatabase(indexedDb);
  try {
    await putInStore(db, APP_CONFIG_KEY, normalizeAppConfigSnapshot(snapshot));
  } finally {
    db.close();
  }
}

export async function clearAppDatabaseSnapshot(indexedDb: IDBFactory | undefined = getBrowserIndexedDb()): Promise<void> {
  if (!indexedDb) {
    return;
  }

  const db = await openAppDatabase(indexedDb);
  try {
    await deleteFromStore(db, APP_CONFIG_KEY);
  } finally {
    db.close();
  }
}

export function createBrowserProjectStateRepository(options: {
  indexedDb?: IDBFactory;
  legacyStorage?: Storage;
} = {}): BrowserProjectStateRepository {
  return {
    load() {
      return loadAppDatabaseSnapshot(options.indexedDb);
    },
    save(snapshot) {
      return saveAppDatabaseSnapshot(snapshot, options.indexedDb);
    },
    clear() {
      return clearAppDatabaseSnapshot(options.indexedDb);
    },
    loadOrMigrate() {
      return loadOrMigrateAppConfigSnapshot(options);
    },
    saveLegacyBackup(snapshot) {
      saveLegacyAppConfigBackup(snapshot, options.legacyStorage);
    }
  };
}

function normalizeServoList(value: unknown): ServoProfile[] {
  return loadServos(createMemoryStorage({ [SERVO_LIBRARY_STORAGE_KEY]: JSON.stringify(value) }));
}

function normalizeMotorList(value: unknown): MotorProfile[] {
  return loadMotors(createMemoryStorage({ [MOTOR_LIBRARY_STORAGE_KEY]: JSON.stringify(value) }));
}

function normalizeCameraConfigValue(value: unknown): CameraConfig {
  return loadCameraConfig(createMemoryStorage({ [CAMERA_CONFIG_STORAGE_KEY]: JSON.stringify(value) }));
}

function normalizeServoCommandMap(value: unknown, servos: ServoProfile[]): PersistedServoCommandMap {
  if (!isObject(value)) {
    return {};
  }

  const servoById = new Map(servos.map((servo) => [servo.id, normalizeServoProfile(servo)]));
  const commands: PersistedServoCommandMap = {};
  for (const [idText, rawCommand] of Object.entries(value)) {
    const id = Number(idText);
    const servo = servoById.get(id);
    if (!servo || !isObject(rawCommand)) {
      continue;
    }
    commands[id] = normalizeServoCommand(rawCommand, servo);
  }
  return commands;
}

function normalizeServoCommand(value: Record<string, unknown>, servo: ServoProfile): PersistedServoCommandState {
  const mode: PersistedServoControlMode = value.mode === "wheel" ? "wheel" : "position";
  const defaults = mode === "wheel" ? { ...DEFAULT_SERVO_COMMAND_STATE, mode, speedRaw: "300", acc: "50" } : DEFAULT_SERVO_COMMAND_STATE;
  const angle = numberFromString(value.angleDeg);
  const clampedAngle = clampServoLogicalAngle(servo, Number.isFinite(angle) ? angle : Number(defaults.angleDeg));
  const speedLimit = mode === "wheel" ? DEFAULT_WHEEL_SPEED_LIMIT : 4095;
  const speedValue = numberFromString(value.speedRaw);

  return {
    mode,
    angleDeg: formatPersistedNumber(clampedAngle),
    speedRaw:
      mode === "wheel"
        ? formatPersistedNumber(normalizeWheelMaxSpeedRaw(Number.isFinite(speedValue) ? speedValue : Number(defaults.speedRaw)))
        : normalizeNumberField(value.speedRaw, defaults.speedRaw, 0, speedLimit, true),
    acc: normalizeAccField(value.acc, defaults.acc),
    liveDragEnabled: typeof value.liveDragEnabled === "boolean" ? value.liveDragEnabled : defaults.liveDragEnabled,
    reverse: typeof value.reverse === "boolean" ? value.reverse : defaults.reverse,
    wheelTurnsEnabled: typeof value.wheelTurnsEnabled === "boolean" ? value.wheelTurnsEnabled : defaults.wheelTurnsEnabled,
    wheelTurnsTarget: normalizeNumberField(value.wheelTurnsTarget, defaults.wheelTurnsTarget, 0.01, 999, false),
    wheelSliderDeg: normalizeNumberField(value.wheelSliderDeg, defaults.wheelSliderDeg, WHEEL_SLIDER_MIN_DEG, WHEEL_SLIDER_MAX_DEG, true)
  };
}

function normalizeServoSmoothing(value: unknown): ServoSmoothingSettings {
  if (!isObject(value)) {
    return DEFAULT_SERVO_SMOOTHING_SETTINGS;
  }

  const preset = value.preset === "soft" || value.preset === "fast" || value.preset === "standard" ? value.preset : "standard";
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    preset
  };
}

function normalizeServoSafety(value: unknown): ServoSafetySettings {
  if (!isObject(value)) {
    return DEFAULT_SERVO_SAFETY_SETTINGS;
  }

  const preset = value.preset === "relaxed" || value.preset === "sensitive" || value.preset === "standard" ? value.preset : "standard";
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    preset
  };
}

function normalizeActiveModule(value: unknown): PersistedActiveModule {
  return value === "arm" || value === "motor" || value === "camera" || value === "mapping" || value === "servo" ? value : "servo";
}

function normalizeAppUiSnapshot(value: unknown, config: AppConfigSnapshot): AppUiSnapshot {
  const draft = isObject(value) ? value : {};
  const selectedServoId = typeof draft.selectedServoId === "number" && config.servos.some((servo) => servo.id === draft.selectedServoId) ? draft.selectedServoId : config.servos[0]?.id ?? "";
  const selectedMotorChannel =
    typeof draft.selectedMotorChannel === "string" && config.motors.some((motor) => motor.channel === draft.selectedMotorChannel)
      ? draft.selectedMotorChannel
      : config.motors[0]?.channel ?? "";

  return {
    activeModule: normalizeActiveModule(draft.activeModule ?? config.lastActiveModule),
    selectedServoId,
    selectedMotorChannel,
    expandedServoLinkageGroupIds: normalizeStringArray(draft.expandedServoLinkageGroupIds),
    expandedMotorLinkageGroupIds: normalizeStringArray(draft.expandedMotorLinkageGroupIds),
    linkageWheelDirectionByGroup: normalizeLinkageWheelDirectionByGroup(draft.linkageWheelDirectionByGroup),
    servoDraft: normalizeServoDraftSnapshot(draft.servoDraft),
    motorDraft: normalizeMotorDraftSnapshot(draft.motorDraft),
    motorSpeed: normalizeString(draft.motorSpeed, "0"),
    stopMode: draft.stopMode === "brake" ? "brake" : "coast",
    activeDriveBase: draft.activeDriveBase === "mecanum" ? "mecanum" : "tracked",
    driveSpeedLimit: normalizeNumberField(draft.driveSpeedLimit, "60", 0, 100, true),
    selectedGamepadIndex: typeof draft.selectedGamepadIndex === "number" && Number.isInteger(draft.selectedGamepadIndex) ? draft.selectedGamepadIndex : "",
    firmwareBoard: normalizeString(draft.firmwareBoard, "arduino-uno"),
    selectedFirmwarePort: normalizeString(draft.selectedFirmwarePort, "")
  };
}

function normalizeAppRuntimeSnapshot(value: unknown): AppRuntimeSnapshot {
  const draft = isObject(value) ? value : {};
  return {
    stale: draft.stale === true,
    logs: Array.isArray(draft.logs) ? draft.logs.map(normalizeLogEntry).filter((entry): entry is PersistedLogEntry => entry !== null).slice(0, 120) : [],
    servoFeedback: normalizeRecordOfObjects(draft.servoFeedback),
    motorFeedback: normalizeRecordOfObjects(draft.motorFeedback),
    wheelTurnProgress: normalizeRecordOfObjects(draft.wheelTurnProgress),
    lastMotorError: isObject(draft.lastMotorError) ? draft.lastMotorError : null
  };
}

function normalizeLogEntry(value: unknown): PersistedLogEntry | null {
  if (!isObject(value)) {
    return null;
  }
  const direction = value.direction === "tx" || value.direction === "rx" || value.direction === "system" ? value.direction : null;
  if (!direction) {
    return null;
  }
  return {
    ...(typeof value.id === "number" && Number.isFinite(value.id) ? { id: value.id } : {}),
    direction,
    level: value.level === "warn" || value.level === "error" || value.level === "info" ? value.level : "info",
    ...(typeof value.messageKey === "string" ? { messageKey: value.messageKey } : {}),
    ...(typeof value.text === "string" ? { text: value.text } : {}),
    ...(isLogValues(value.values) ? { values: value.values } : {}),
    ...(typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? { createdAt: value.createdAt } : {})
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function normalizeLinkageWheelDirectionByGroup(value: unknown): Record<string, "clockwise" | "counterclockwise" | "paused"> {
  if (!isObject(value)) {
    return {};
  }
  const normalized: Record<string, "clockwise" | "counterclockwise" | "paused"> = {};
  for (const [groupId, direction] of Object.entries(value)) {
    if (direction === "clockwise" || direction === "counterclockwise" || direction === "paused") {
      normalized[groupId] = direction;
    }
  }
  return normalized;
}

function normalizeServoDraftSnapshot(value: unknown): { id: string; name: string } {
  const draft = isObject(value) ? value : {};
  return {
    id: normalizeString(draft.id, "23"),
    name: normalizeString(draft.name, "ID23")
  };
}

function normalizeMotorDraftSnapshot(value: unknown): { channel: string; name: string } {
  const draft = isObject(value) ? value : {};
  return {
    channel: normalizeString(draft.channel, "M9"),
    name: normalizeString(draft.name, "Motor 9")
  };
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeRecordOfObjects(value: unknown): Record<string, Record<string, unknown>> {
  if (!isObject(value)) {
    return {};
  }
  const normalized: Record<string, Record<string, unknown>> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isObject(item)) {
      normalized[key] = item;
    }
  }
  return normalized;
}

function isLogValues(value: unknown): value is Record<string, string | number | boolean> {
  return (
    isObject(value) &&
    Object.values(value).every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")
  );
}

function normalizeNumberField(value: unknown, fallback: string, min: number, max: number, integer: boolean): string {
  const numeric = numberFromString(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const clamped = clamp(integer ? Math.round(numeric) : numeric, min, max);
  return formatPersistedNumber(clamped);
}

function normalizeAccField(value: unknown, fallback: string): string {
  if (value === "") {
    return "";
  }
  return normalizeNumberField(value, fallback, 0, 254, true);
}

function numberFromString(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  return typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
}

function formatPersistedNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function openAppDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(APP_DATABASE_NAME, APP_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(APP_CONFIG_STORE)) {
        db.createObjectStore(APP_CONFIG_STORE);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onsuccess = () => resolve(request.result);
  });
}

function getFromStore<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(APP_CONFIG_STORE, "readonly");
    const request = transaction.objectStore(APP_CONFIG_STORE).get(key);
    request.onerror = () => reject(request.error ?? new Error("Failed to read IndexedDB"));
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
}

function putInStore(db: IDBDatabase, key: string, value: AppConfigSnapshot): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(APP_CONFIG_STORE, "readwrite");
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to write IndexedDB"));
    transaction.oncomplete = () => resolve();
    transaction.objectStore(APP_CONFIG_STORE).put(value, key);
  });
}

function deleteFromStore(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(APP_CONFIG_STORE, "readwrite");
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to delete IndexedDB entry"));
    transaction.oncomplete = () => resolve();
    transaction.objectStore(APP_CONFIG_STORE).delete(key);
  });
}

function getBrowserIndexedDb(): IDBFactory | undefined {
  return typeof window === "undefined" ? undefined : window.indexedDB;
}

function getBrowserLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
