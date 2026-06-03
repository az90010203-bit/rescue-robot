import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { languageStorageKey } from "../i18n/languages";
import { DEFAULT_INPUT_MAPPING, INPUT_MAPPING_STORAGE_KEY } from "./inputMapping";
import {
  AppConfigSnapshot,
  DEFAULT_SERVO_SAFETY_SETTINGS,
  DEFAULT_SERVO_SMOOTHING_SETTINGS,
  createAppConfigSnapshot,
  createAppStateSnapshotV2,
  loadAppDatabaseSnapshot,
  loadOrMigrateAppConfigSnapshot,
  normalizeAppConfigSnapshot,
  normalizeAppStateSnapshotV2,
  saveAppDatabaseSnapshot,
  saveLegacyAppConfigBackup
} from "./appDatabase";
import {
  ARM_CONFIG_STORAGE_KEY,
  CAMERA_CONFIG_STORAGE_KEY,
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_MOTORS,
  DEFAULT_SERVOS,
  MOTOR_LINKAGE_GROUPS_STORAGE_KEY,
  MOTOR_LIBRARY_STORAGE_KEY,
  SERVO_LINKAGE_GROUPS_STORAGE_KEY,
  SERVO_LIBRARY_STORAGE_KEY,
  createDefaultArmConfig
} from "./storage";

describe("app database snapshots", () => {
  it("migrates an empty IndexedDB from legacy localStorage values", async () => {
    const indexedDb = createIndexedDb();
    const legacyStorage = createStorage({
      [SERVO_LIBRARY_STORAGE_KEY]: JSON.stringify([{ id: 7, name: "J7", minDeg: 30, maxDeg: 180, direction: -1 }]),
      [SERVO_LINKAGE_GROUPS_STORAGE_KEY]: JSON.stringify([
        {
          id: "arm",
          name: "Arm",
          enabled: true,
          mode: "position",
          masterPercent: 50,
          members: [{ servoId: 7, weightPercent: 80, speedRaw: 900, acc: 40, reverse: true }]
        }
      ]),
      [ARM_CONFIG_STORAGE_KEY]: JSON.stringify({
        liveDragEnabled: true,
        selectedJointId: "base",
        joints: [{ id: "base", name: "Base", servoId: 7, lengthPx: 120, angleDeg: 45, neutralDeg: 90, speedRaw: 800, acc: 30, reverse: false, enabled: true }]
      }),
      [MOTOR_LIBRARY_STORAGE_KEY]: JSON.stringify([{ channel: "M9", name: "Lift", pwmPin: "D5", in1Pin: "D4", in2Pin: "D7" }]),
      [MOTOR_LINKAGE_GROUPS_STORAGE_KEY]: JSON.stringify([
        {
          id: "lift-pair",
          name: "Lift Pair",
          enabled: true,
          masterSpeedPercent: 40,
          members: [{ channel: "M9", weightPercent: 100, reverse: false }]
        }
      ]),
      [CAMERA_CONFIG_STORAGE_KEY]: JSON.stringify({ ...DEFAULT_CAMERA_CONFIG, streamUrl: "http://camera.local/stream", panServoId: 7 }),
      [INPUT_MAPPING_STORAGE_KEY]: JSON.stringify({ ...DEFAULT_INPUT_MAPPING, keyboard: { ...DEFAULT_INPUT_MAPPING.keyboard, forward: "KeyI" } }),
      [languageStorageKey]: "en-US"
    });

    const result = await loadOrMigrateAppConfigSnapshot({ indexedDb, legacyStorage });
    const stored = await loadAppDatabaseSnapshot(indexedDb);

    expect(result.source).toBe("legacy");
    expect(result.snapshot.servos).toEqual([{ id: 7, name: "J7", minDeg: 30, maxDeg: 180, direction: -1 }]);
    expect(result.snapshot.servoLinkageGroups[0].members[0]).toMatchObject({ servoId: 7, speedRaw: 900, acc: 40 });
    expect(result.snapshot.armConfig.joints[0]).toMatchObject({ id: "base", servoId: 7, lengthPx: 120, angleDeg: 45 });
    expect(result.snapshot.motors[0]).toMatchObject({ channel: "M9", name: "Lift", pwmPin: "D5", in1Pin: "D4", in2Pin: "D7" });
    expect(result.snapshot.motorLinkageGroups[0]).toMatchObject({ id: "lift-pair", name: "Lift Pair", masterSpeedPercent: 40 });
    expect(result.snapshot.cameraConfig.streamUrl).toBe("http://camera.local/stream");
    expect(result.snapshot.inputMapping.keyboard.forward).toBe("KeyI");
    expect(result.snapshot.language).toBe("en-US");
    expect(stored?.servos).toEqual(result.snapshot.servos);
  });

  it("prefers an existing IndexedDB snapshot over legacy localStorage", async () => {
    const indexedDb = createIndexedDb();
    const databaseSnapshot = createSnapshot({
      servos: [{ id: 9, name: "DB Servo" }],
      language: "ja-JP",
      lastActiveModule: "arm"
    });
    const legacyStorage = createStorage({
      [SERVO_LIBRARY_STORAGE_KEY]: JSON.stringify([{ id: 4, name: "Legacy Servo" }]),
      [languageStorageKey]: "en-US"
    });
    await saveAppDatabaseSnapshot(databaseSnapshot, indexedDb);

    const result = await loadOrMigrateAppConfigSnapshot({ indexedDb, legacyStorage });

    expect(result.source).toBe("database");
    expect(result.snapshot.servos[0]).toMatchObject({ id: 9, name: "DB Servo" });
    expect(result.snapshot.language).toBe("ja-JP");
    expect(result.snapshot.lastActiveModule).toBe("arm");
  });

  it("fills defaults when an old snapshot is missing fields", () => {
    const snapshot = normalizeAppConfigSnapshot({
      version: 1,
      servos: [{ id: 1, name: "J1" }],
      updatedAt: 10
    });

    expect(snapshot.servos).toEqual([{ id: 1, name: "J1", minDeg: 0, maxDeg: 360, direction: 1 }]);
    expect(snapshot.servoCommands).toEqual({});
    expect(snapshot.servoSafety).toEqual(DEFAULT_SERVO_SAFETY_SETTINGS);
    expect(snapshot.servoSmoothing).toEqual(DEFAULT_SERVO_SMOOTHING_SETTINGS);
    expect(snapshot.armConfig.joints).toHaveLength(1);
    expect(snapshot.armConfig.liveDragEnabled).toBe(false);
    expect(snapshot.motorLinkageGroups).toEqual([]);
    expect(snapshot.inputMapping).toEqual(DEFAULT_INPUT_MAPPING);
    expect(snapshot.lastActiveModule).toBe("servo");
    expect(snapshot.updatedAt).toBe(10);
  });

  it("drops persisted servo commands whose servos no longer exist", () => {
    const snapshot = normalizeAppConfigSnapshot({
      servos: [{ id: 1, name: "J1" }],
      servoCommands: {
        1: { mode: "position", angleDeg: "45", speedRaw: "800", acc: "30", liveDragEnabled: true, reverse: false, wheelTurnsEnabled: false, wheelTurnsTarget: "1", wheelSliderDeg: "90" },
        2: { mode: "position", angleDeg: "90", speedRaw: "800", acc: "30", liveDragEnabled: true, reverse: false, wheelTurnsEnabled: false, wheelTurnsTarget: "1", wheelSliderDeg: "90" }
      }
    });

    expect(Object.keys(snapshot.servoCommands)).toEqual(["1"]);
  });

  it("clamps persisted command angles to the servo limits", () => {
    const snapshot = normalizeAppConfigSnapshot({
      servos: [{ id: 1, name: "J1", minDeg: 0, maxDeg: 90, direction: 1 }],
      servoCommands: {
        1: { mode: "position", angleDeg: "200", speedRaw: "800", acc: "30", liveDragEnabled: true, reverse: false, wheelTurnsEnabled: false, wheelTurnsTarget: "1", wheelSliderDeg: "90" }
      }
    });

    expect(snapshot.servoCommands[1].angleDeg).toBe("90");
  });

  it("persists smoothing and safety settings and writes a legacy compatibility backup", async () => {
    const indexedDb = createIndexedDb();
    const legacyStorage = createStorage();
    const snapshot = createSnapshot({
      servoSmoothing: { enabled: false, preset: "fast" },
      servoSafety: { enabled: false, preset: "sensitive" },
      servoCommands: {
        22: { mode: "wheel", angleDeg: "90", speedRaw: "-300", acc: "50", liveDragEnabled: false, reverse: true, wheelTurnsEnabled: true, wheelTurnsTarget: "2", wheelSliderDeg: "150" }
      }
    });

    await saveAppDatabaseSnapshot(snapshot, indexedDb);
    saveLegacyAppConfigBackup(snapshot, legacyStorage);
    const stored = await loadAppDatabaseSnapshot(indexedDb);

    expect(stored?.servoSmoothing).toEqual({ enabled: false, preset: "fast" });
    expect(stored?.servoSafety).toEqual({ enabled: false, preset: "sensitive" });
    expect(stored?.servoCommands[22]).toMatchObject({ mode: "wheel", speedRaw: "300", wheelTurnsTarget: "2", wheelSliderDeg: "150" });
    expect(legacyStorage.getItem(SERVO_LIBRARY_STORAGE_KEY)).toContain("ID22");
    expect(legacyStorage.getItem(MOTOR_LINKAGE_GROUPS_STORAGE_KEY)).toBe("[]");
  });

  it("fills and clamps wheel slider values for old command snapshots", () => {
    const missingSlider = normalizeAppConfigSnapshot({
      servos: [{ id: 1, name: "J1" }],
      servoCommands: {
        1: { mode: "wheel", angleDeg: "90", speedRaw: "-1200", acc: "50", liveDragEnabled: true, reverse: false, wheelTurnsEnabled: false, wheelTurnsTarget: "1" }
      }
    });
    const outOfRangeSlider = normalizeAppConfigSnapshot({
      servos: [{ id: 1, name: "J1" }],
      servoCommands: {
        1: { mode: "wheel", angleDeg: "90", speedRaw: "300", acc: "50", liveDragEnabled: true, reverse: false, wheelTurnsEnabled: false, wheelTurnsTarget: "1", wheelSliderDeg: "220" }
      }
    });

    expect(missingSlider.servoCommands[1]).toMatchObject({ speedRaw: "1000", wheelSliderDeg: "90" });
    expect(outOfRangeSlider.servoCommands[1].wheelSliderDeg).toBe("180");
  });

  it("wraps config, UI state, and runtime in a V2 app state snapshot", () => {
    const config = createSnapshot({
      servos: [{ id: 7, name: "J7" }],
      motors: [{ channel: "M2", name: "Drive" }],
      lastActiveModule: "motor"
    });

    const snapshot = createAppStateSnapshotV2({
      config,
      ui: {
        activeModule: "motor",
        selectedServoId: 7,
        selectedMotorChannel: "M2",
        expandedServoLinkageGroupIds: ["arm"],
        motorSpeed: "40",
        activeDriveBase: "mecanum"
      },
      runtime: {
        stale: false,
        logs: [{ direction: "system", messageKey: "logs.ready", level: "info" }],
        servoFeedback: { 7: { type: "servo.feedback", id: 7, positionRaw: 512 } }
      }
    });

    expect(snapshot.version).toBe(2);
    expect(snapshot.config.servos[0]).toMatchObject({ id: 7, name: "J7" });
    expect(snapshot.ui).toMatchObject({
      activeModule: "motor",
      selectedServoId: 7,
      selectedMotorChannel: "M2",
      activeDriveBase: "mecanum"
    });
    expect(snapshot.runtime.logs[0]).toMatchObject({ direction: "system", messageKey: "logs.ready" });
    expect(snapshot.runtime.servoFeedback[7]).toMatchObject({ positionRaw: 512 });
  });

  it("normalizes stale or partial V2 snapshots back to safe defaults", () => {
    const snapshot = normalizeAppStateSnapshotV2({
      config: { servos: [{ id: 4, name: "J4" }] },
      ui: { selectedServoId: 99, selectedMotorChannel: "M404", stopMode: "hold", driveSpeedLimit: "200" },
      runtime: { logs: [{ direction: "rx", level: "loud", text: "ok" }, { direction: "bad" }] }
    });

    expect(snapshot.ui.selectedServoId).toBe(4);
    expect(snapshot.ui.selectedMotorChannel).toBe("M1");
    expect(snapshot.ui.stopMode).toBe("coast");
    expect(snapshot.ui.driveSpeedLimit).toBe("100");
    expect(snapshot.runtime.logs).toEqual([{ direction: "rx", level: "info", text: "ok" }]);
  });
});

function createSnapshot(overrides: Partial<Omit<AppConfigSnapshot, "version" | "updatedAt">> = {}): AppConfigSnapshot {
  return createAppConfigSnapshot({
    servos: DEFAULT_SERVOS,
    servoCommands: {},
    servoLinkageGroups: [],
    servoSmoothing: DEFAULT_SERVO_SMOOTHING_SETTINGS,
    servoSafety: DEFAULT_SERVO_SAFETY_SETTINGS,
    armConfig: createDefaultArmConfig(DEFAULT_SERVOS),
    motors: DEFAULT_MOTORS,
    motorLinkageGroups: [],
    cameraConfig: DEFAULT_CAMERA_CONFIG,
    inputMapping: DEFAULT_INPUT_MAPPING,
    language: "zh-CN",
    lastActiveModule: "servo",
    ...overrides,
    updatedAt: 123
  });
}

function createIndexedDb(): IDBFactory {
  return new FakeIDBFactory() as IDBFactory;
}

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map<string, string>(Object.entries(initial));
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
