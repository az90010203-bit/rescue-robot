import { describe, expect, it } from "vitest";
import {
  CAMERA_CONFIG_STORAGE_KEY,
  DEFAULT_CAMERA_CONFIG,
  DEFAULT_LINKAGE_MEMBER_ACC,
  DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
  DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
  DEFAULT_SERVOS,
  MOTOR_LINKAGE_GROUPS_STORAGE_KEY,
  SERVO_LINKAGE_GROUPS_STORAGE_KEY,
  SERVO_LIBRARY_STORAGE_KEY,
  ARM_CONFIG_STORAGE_KEY,
  calculateArmDragAngle,
  calculateArmSegmentPoses,
  calculateMotorLinkageTargets,
  calculateServoLinkageWheelTargets,
  calculateServoLinkageTargets,
  loadArmConfig,
  loadCameraConfig,
  loadMotorLinkageGroups,
  loadServoLinkageGroups,
  loadServos,
  normalizeArmConfig,
  saveArmConfig,
  saveCameraConfig,
  saveMotorLinkageGroups,
  saveServoLinkageGroups,
  validateCameraConfig,
  validateMotorDraft,
  validateMotorMapping,
  validateServoDraft
} from "./storage";

describe("servo library validation", () => {
  const existing = [{ id: 1, name: "J1" }];

  it("accepts a new servo id and name", () => {
    expect(validateServoDraft({ id: "2", name: "J2" }, existing)).toBeNull();
  });

  it("rejects broadcast and duplicate ids", () => {
    expect(validateServoDraft({ id: "254", name: "broadcast" }, existing)).toBe("validation.servoIdRange");
    expect(validateServoDraft({ id: "1", name: "JX" }, existing)).toBe("validation.duplicateServoId");
  });

  it("rejects empty and duplicate names", () => {
    expect(validateServoDraft({ id: "3", name: "" }, existing)).toBe("validation.nameRequired");
    expect(validateServoDraft({ id: "3", name: "j1" }, existing)).toBe("validation.duplicateServoName");
  });

  it("loads ID22 as the default direct-bus test servo", () => {
    expect(loadServos(createStorage())).toEqual(DEFAULT_SERVOS);
  });

  it("normalizes stored servo limits and direction", () => {
    const storage = createStorage();
    storage.setItem(
      SERVO_LIBRARY_STORAGE_KEY,
      JSON.stringify([
        { id: 1, name: "J1" },
        { id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 },
        { id: 3, name: "Bad", minDeg: 240, maxDeg: 120, direction: 1 }
      ])
    );

    expect(loadServos(storage)).toEqual([
      { id: 1, name: "J1", minDeg: 0, maxDeg: 360, direction: 1 },
      { id: 2, name: "J2", minDeg: 0, maxDeg: 180, direction: -1 },
      { id: 3, name: "Bad", minDeg: 0, maxDeg: 360, direction: 1 }
    ]);
  });
});

describe("arm config storage and geometry", () => {
  const servos = [
    { id: 1, name: "Base", minDeg: 0, maxDeg: 360, direction: 1 as const },
    { id: 2, name: "Shoulder", minDeg: 0, maxDeg: 180, direction: 1 as const },
    { id: 3, name: "Elbow", minDeg: 30, maxDeg: 150, direction: -1 as const },
    { id: 4, name: "Spare", minDeg: 0, maxDeg: 90, direction: 1 as const }
  ];

  it("creates a default preview arm from the first three servos", () => {
    const config = loadArmConfig(servos, createStorage());

    expect(config.liveDragEnabled).toBe(false);
    expect(config.selectedJointId).toBe("arm-joint-1");
    expect(config.joints.map((joint) => [joint.servoId, joint.angleDeg, joint.neutralDeg, joint.enabled])).toEqual([
      [1, 90, 90, true],
      [2, 90, 90, true],
      [3, 90, 90, true]
    ]);
  });

  it("normalizes saved joints and filters invalid servo bindings", () => {
    const config = normalizeArmConfig(
      {
        liveDragEnabled: true,
        selectedJointId: "joint-2",
        joints: [
          { id: "joint-1", name: "Base", servoId: 1, lengthPx: 400, angleDeg: 420, neutralDeg: -20, speedRaw: 5000, acc: 300, reverse: true, enabled: true },
          { id: "bad-servo", name: "Bad", servoId: 99, lengthPx: 90, angleDeg: 40, neutralDeg: 0, speedRaw: 800, acc: 30, reverse: false, enabled: true },
          { id: "joint-2", name: "Shoulder", servoId: 2, lengthPx: 12, angleDeg: -30, neutralDeg: 100, speedRaw: 700, acc: 20, reverse: false, enabled: false },
          { id: "duplicate", name: "Duplicate", servoId: 2, lengthPx: 80, angleDeg: 30, neutralDeg: 30, speedRaw: 800, acc: 30, reverse: false, enabled: true }
        ]
      },
      servos
    );

    expect(config.liveDragEnabled).toBe(true);
    expect(config.selectedJointId).toBe("joint-2");
    expect(config.joints).toEqual([
      { id: "joint-1", name: "Base", servoId: 1, lengthPx: 180, angleDeg: 360, neutralDeg: 0, speedRaw: 4095, acc: 254, reverse: true, enabled: true },
      { id: "joint-2", name: "Shoulder", servoId: 2, lengthPx: 30, angleDeg: 0, neutralDeg: 100, speedRaw: 700, acc: 20, reverse: false, enabled: false }
    ]);
  });

  it("persists arm config through local storage", () => {
    const storage = createStorage();
    const config = {
      liveDragEnabled: true,
      selectedJointId: "base",
      joints: [{ id: "base", name: "Base", servoId: 1, lengthPx: 100, angleDeg: 45, neutralDeg: 90, speedRaw: 800, acc: 30, reverse: false, enabled: true }]
    };

    saveArmConfig(config, servos, storage);

    expect(storage.getItem(ARM_CONFIG_STORAGE_KEY)).toContain("Base");
    expect(loadArmConfig(servos, storage)).toEqual(config);
  });

  it("calculates forward kinematics using angle minus neutral", () => {
    const poses = calculateArmSegmentPoses(
      [
        { id: "base", name: "Base", servoId: 1, lengthPx: 100, angleDeg: 90, neutralDeg: 90, speedRaw: 800, acc: 30, reverse: false, enabled: true },
        { id: "elbow", name: "Elbow", servoId: 2, lengthPx: 50, angleDeg: 180, neutralDeg: 90, speedRaw: 800, acc: 30, reverse: false, enabled: true }
      ],
      { x: 0, y: 0 }
    );

    expect(poses[0]).toMatchObject({ startX: 0, startY: 0, endX: 100, endY: 0, globalDeg: 0 });
    expect(Math.round(poses[1].endX)).toBe(100);
    expect(Math.round(poses[1].endY)).toBe(-50);
    expect(poses[1].globalDeg).toBe(90);
  });

  it("converts joint handle drag to a clamped logical angle", () => {
    expect(
      calculateArmDragAngle({
        anchor: { x: 0, y: 0 },
        pointer: { x: 0, y: -100 },
        parentGlobalDeg: 0,
        neutralDeg: 90,
        servoSpanDeg: 180,
        currentAngleDeg: 90
      })
    ).toBe(180);
    expect(
      calculateArmDragAngle({
        anchor: { x: 0, y: 0 },
        pointer: { x: 0, y: 100 },
        parentGlobalDeg: 0,
        neutralDeg: 0,
        servoSpanDeg: 360,
        currentAngleDeg: 270
      })
    ).toBe(270);
  });
});

describe("servo linkage group storage and calculation", () => {
  const servos = [
    { id: 1, name: "J1" },
    { id: 2, name: "J2" }
  ];

  it("loads no linkage groups by default", () => {
    expect(loadServoLinkageGroups(servos, createStorage())).toEqual([]);
  });

  it("saves and loads valid linkage groups", () => {
    const storage = createStorage();
    const groups = [
      {
        id: "arm",
        name: "Arm",
        enabled: true,
        mode: "wheel" as const,
        masterPercent: 50,
        wheelTurnLimitEnabled: true,
        wheelClockwiseTurnsTarget: 2,
        wheelCounterclockwiseTurnsTarget: 3,
        members: [
          { servoId: 1, weightPercent: 40, speedRaw: 600, acc: 20, reverse: true },
          { servoId: 2, weightPercent: 60, speedRaw: 900, acc: 30, reverse: false }
        ]
      }
    ];

    saveServoLinkageGroups(groups, servos, storage);

    expect(storage.getItem(SERVO_LINKAGE_GROUPS_STORAGE_KEY)).toContain("Arm");
    expect(loadServoLinkageGroups(servos, storage)).toEqual(groups);
  });

  it("normalizes old members, filters invalid members, and allows the same servo in different groups", () => {
    const storage = createStorage();
    storage.setItem(
      SERVO_LINKAGE_GROUPS_STORAGE_KEY,
      JSON.stringify([
        { id: "bad-master", name: "Bad Master", enabled: true, masterPercent: 101, members: [{ servoId: 1, weightPercent: 50 }] },
        {
          id: "valid",
          name: "Valid",
          enabled: true,
          mode: "turbo",
          masterPercent: 75,
          wheelTurnLimitEnabled: true,
          wheelClockwiseTurnsTarget: -5,
          wheelCounterclockwiseTurnsTarget: Number.NaN,
          members: [
            { servoId: 1, weightPercent: 40 },
            { servoId: 999, weightPercent: 50 },
            { servoId: 2, weightPercent: -1 },
            { servoId: 1, weightPercent: 60 },
            { servoId: 2, weightPercent: 60, speedRaw: 900, acc: 40, reverse: true }
          ]
        },
        { id: "second", name: "Second", enabled: true, mode: "wheel", masterPercent: 20, members: [{ servoId: 2, weightPercent: 30 }] }
      ])
    );

    expect(loadServoLinkageGroups(servos, storage)).toEqual([
      {
        id: "valid",
        name: "Valid",
        enabled: true,
        mode: "position",
        masterPercent: 75,
        wheelTurnLimitEnabled: true,
        wheelClockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
        wheelCounterclockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
        members: [
          { servoId: 1, weightPercent: 40, speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW, acc: DEFAULT_LINKAGE_MEMBER_ACC, reverse: false },
          { servoId: 2, weightPercent: 60, speedRaw: 900, acc: 40, reverse: true }
        ]
      },
      {
        id: "second",
        name: "Second",
        enabled: true,
        mode: "wheel",
        masterPercent: 20,
        wheelTurnLimitEnabled: false,
        wheelClockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
        wheelCounterclockwiseTurnsTarget: DEFAULT_LINKAGE_WHEEL_TURNS_TARGET,
        members: [{ servoId: 2, weightPercent: 30, speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW, acc: DEFAULT_LINKAGE_MEMBER_ACC, reverse: false }]
      }
    ]);
  });

  it("calculates weighted logical target angles", () => {
    const group = {
      id: "arm",
      name: "Arm",
      enabled: true,
      mode: "position" as const,
      masterPercent: 100,
      wheelTurnLimitEnabled: false,
      wheelClockwiseTurnsTarget: 1,
      wheelCounterclockwiseTurnsTarget: 1,
      members: [
        { servoId: 1, weightPercent: 40, speedRaw: 800, acc: 30, reverse: false },
        { servoId: 2, weightPercent: 60, speedRaw: 900, acc: 40, reverse: true }
      ]
    };

    expect(calculateServoLinkageTargets(group, servos).map((target) => target.logicalAngleDeg)).toEqual([144, 216]);
    expect(calculateServoLinkageTargets({ ...group, masterPercent: 50 }, servos).map((target) => target.logicalAngleDeg)).toEqual([72, 108]);
    expect(calculateServoLinkageTargets(group, servos).map((target) => [target.speedRaw, target.acc, target.reverse])).toEqual([
      [800, 30, false],
      [900, 40, true]
    ]);
  });

  it("lets each linkage member choose forward or reverse position direction independently", () => {
    const group = {
      id: "paired",
      name: "Paired",
      enabled: true,
      mode: "position" as const,
      masterPercent: 25,
      wheelTurnLimitEnabled: false,
      wheelClockwiseTurnsTarget: 1,
      wheelCounterclockwiseTurnsTarget: 1,
      members: [
        { servoId: 1, weightPercent: 100, speedRaw: 800, acc: 30, reverse: false },
        { servoId: 2, weightPercent: 100, speedRaw: 800, acc: 30, reverse: true }
      ]
    };

    expect(calculateServoLinkageTargets(group, servos).map((target) => [target.servoId, target.reverse, target.physicalAngleDeg])).toEqual([
      [1, false, 90],
      [2, true, 270]
    ]);
  });

  it("respects custom ranges and reversed servo direction", () => {
    const [target] = calculateServoLinkageTargets(
      {
        id: "wrist",
        name: "Wrist",
        enabled: true,
        mode: "position",
        masterPercent: 100,
        wheelTurnLimitEnabled: false,
        wheelClockwiseTurnsTarget: 1,
        wheelCounterclockwiseTurnsTarget: 1,
        members: [{ servoId: 3, weightPercent: 40, speedRaw: 800, acc: 30, reverse: false }]
      },
      [{ id: 3, name: "J3", minDeg: 30, maxDeg: 150, direction: -1 }]
    );

    expect(target.logicalAngleDeg).toBe(48);
    expect(target.physicalAngleDeg).toBe(102);
  });

  it("combines permanent direction and temporary reverse for linkage targets", () => {
    const [target] = calculateServoLinkageTargets(
      {
        id: "wrist",
        name: "Wrist",
        enabled: true,
        mode: "position",
        masterPercent: 100,
        wheelTurnLimitEnabled: false,
        wheelClockwiseTurnsTarget: 1,
        wheelCounterclockwiseTurnsTarget: 1,
        members: [{ servoId: 3, weightPercent: 40, speedRaw: 800, acc: 30, reverse: true }]
      },
      [{ id: 3, name: "J3", minDeg: 30, maxDeg: 150, direction: -1 }]
    );

    expect(target.logicalAngleDeg).toBe(48);
    expect(target.physicalAngleDeg).toBe(78);
  });

  it("calculates wheel linkage direction with permanent and temporary reverse", () => {
    const group = {
      id: "wheels",
      name: "Wheels",
      enabled: true,
      mode: "wheel" as const,
      masterPercent: 100,
      wheelTurnLimitEnabled: true,
      wheelClockwiseTurnsTarget: 2,
      wheelCounterclockwiseTurnsTarget: 3,
      members: [
        { servoId: 1, weightPercent: 100, speedRaw: 300, acc: 50, reverse: false },
        { servoId: 2, weightPercent: 100, speedRaw: 1200, acc: 60, reverse: true }
      ]
    };

    expect(calculateServoLinkageWheelTargets(group, [{ id: 1, name: "J1", direction: 1 }, { id: 2, name: "J2", direction: -1 }], "clockwise").map((target) => [target.commandSpeedRaw, target.effectiveSpeedRaw])).toEqual([
      [300, 300],
      [1000, 1000]
    ]);
    expect(calculateServoLinkageWheelTargets(group, [{ id: 1, name: "J1", direction: 1 }, { id: 2, name: "J2", direction: -1 }], "counterclockwise").map((target) => [target.commandSpeedRaw, target.effectiveSpeedRaw])).toEqual([
      [-300, -300],
      [-1000, -1000]
    ]);
  });

  it("lets each wheel linkage member choose forward or reverse speed independently", () => {
    const group = {
      id: "wheels",
      name: "Wheels",
      enabled: true,
      mode: "wheel" as const,
      masterPercent: 100,
      wheelTurnLimitEnabled: false,
      wheelClockwiseTurnsTarget: 1,
      wheelCounterclockwiseTurnsTarget: 1,
      members: [
        { servoId: 1, weightPercent: 100, speedRaw: 300, acc: 50, reverse: false },
        { servoId: 2, weightPercent: 100, speedRaw: 300, acc: 50, reverse: true }
      ]
    };

    expect(calculateServoLinkageWheelTargets(group, servos, "clockwise").map((target) => [target.servoId, target.reverse, target.effectiveSpeedRaw])).toEqual([
      [1, false, 300],
      [2, true, -300]
    ]);
  });
});

describe("motor library validation", () => {
  const existing = [{ channel: "M1", name: "Left motor" }];

  it("accepts a new motor channel and name", () => {
    expect(validateMotorDraft({ channel: "M2", name: "Right motor" }, existing)).toBeNull();
  });

  it("rejects empty, malformed, and duplicate channels", () => {
    expect(validateMotorDraft({ channel: "", name: "Empty" }, existing)).toBe("validation.invalidMotorChannel");
    expect(validateMotorDraft({ channel: "1M", name: "Bad" }, existing)).toBe("validation.invalidMotorChannel");
    expect(validateMotorDraft({ channel: "m1", name: "Duplicate" }, existing)).toBe("validation.duplicateMotorChannel");
  });

  it("rejects empty and duplicate motor names", () => {
    expect(validateMotorDraft({ channel: "M3", name: "" }, existing)).toBe("validation.nameRequired");
    expect(validateMotorDraft({ channel: "M3", name: "left motor" }, existing)).toBe("validation.duplicateMotorName");
  });

  it("validates motor board pin mappings", () => {
    expect(validateMotorMapping({ channel: "M1", name: "Left motor", pwmPin: "D5", in1Pin: "D4", in2Pin: "D7" })).toBeNull();
    expect(validateMotorMapping({ channel: "M1", name: "Left motor", pwmPin: "", in1Pin: "D4", in2Pin: "D7" })).toBe("validation.motorMappingRequired");
    expect(validateMotorMapping({ channel: "M1", name: "Left motor", pwmPin: "D 5", in1Pin: "D4", in2Pin: "D7" })).toBe("validation.invalidMotorPin");
  });
});

describe("motor linkage group storage and calculation", () => {
  const motors = [
    { channel: "M1", name: "Left motor" },
    { channel: "M2", name: "Right motor" },
    { channel: "M3", name: "Aux motor" }
  ];

  it("loads no motor linkage groups by default", () => {
    expect(loadMotorLinkageGroups(motors, createStorage())).toEqual([]);
  });

  it("saves and loads valid motor linkage groups", () => {
    const storage = createStorage();
    const groups = [
      {
        id: "tracks",
        name: "Tracks",
        enabled: true,
        masterSpeedPercent: 50,
        members: [
          { channel: "M1", weightPercent: 100, reverse: false },
          { channel: "M2", weightPercent: 80, reverse: true }
        ]
      }
    ];

    saveMotorLinkageGroups(groups, motors, storage);

    expect(storage.getItem(MOTOR_LINKAGE_GROUPS_STORAGE_KEY)).toContain("Tracks");
    expect(loadMotorLinkageGroups(motors, storage)).toEqual(groups);
  });

  it("normalizes motor linkage groups and filters invalid or duplicate members", () => {
    const storage = createStorage();
    storage.setItem(
      MOTOR_LINKAGE_GROUPS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "pair",
          name: "Pair",
          enabled: true,
          masterSpeedPercent: -75,
          members: [
            { channel: "m1", weightPercent: 100 },
            { channel: "M9", weightPercent: 100 },
            { channel: "M2", weightPercent: -1 },
            { channel: "M1", weightPercent: 50 },
            { channel: "M2", weightPercent: 60, reverse: true }
          ]
        },
        {
          id: "pair",
          name: "",
          enabled: false,
          masterSpeedPercent: 120,
          members: [{ channel: "M3", weightPercent: 30 }]
        }
      ])
    );

    expect(loadMotorLinkageGroups(motors, storage)).toEqual([
      {
        id: "pair",
        name: "Pair",
        enabled: true,
        masterSpeedPercent: -75,
        members: [
          { channel: "M1", weightPercent: 100, reverse: false },
          { channel: "M2", weightPercent: 60, reverse: true }
        ]
      },
      {
        id: "pair-2",
        name: "Motor Linkage 2",
        enabled: false,
        masterSpeedPercent: 0,
        members: [{ channel: "M3", weightPercent: 30, reverse: false }]
      }
    ]);
  });

  it("calculates weighted signed motor linkage targets", () => {
    const group = {
      id: "tracks",
      name: "Tracks",
      enabled: true,
      masterSpeedPercent: 50,
      members: [
        { channel: "M1", weightPercent: 100, reverse: false },
        { channel: "M2", weightPercent: 80, reverse: true },
        { channel: "M3", weightPercent: 0, reverse: false }
      ]
    };

    expect(calculateMotorLinkageTargets(group, motors).map((target) => [target.channel, target.speedPercent])).toEqual([
      ["M1", 50],
      ["M2", -40],
      ["M3", 0]
    ]);
    expect(calculateMotorLinkageTargets({ ...group, masterSpeedPercent: 140 }, motors)[0].speedPercent).toBe(100);
  });
});

describe("camera config storage and validation", () => {
  it("loads the default camera config when storage is empty", () => {
    expect(loadCameraConfig(createStorage())).toEqual(DEFAULT_CAMERA_CONFIG);
  });

  it("saves and loads a valid camera config", () => {
    const storage = createStorage();
    const config = {
      ...DEFAULT_CAMERA_CONFIG,
      streamUrl: "http://192.168.1.20:8080/stream.mjpg",
      panServoId: 3,
      tiltServoId: 4,
      panAngleDeg: 120
    };

    saveCameraConfig(config, storage);

    expect(storage.getItem(CAMERA_CONFIG_STORAGE_KEY)).toContain("stream.mjpg");
    expect(loadCameraConfig(storage)).toEqual(config);
  });

  it("rejects invalid camera servo ids and angle ranges", () => {
    expect(validateCameraConfig({ ...DEFAULT_CAMERA_CONFIG, tiltServoId: DEFAULT_CAMERA_CONFIG.panServoId })).toBe("validation.cameraServoIds");
    expect(validateCameraConfig({ ...DEFAULT_CAMERA_CONFIG, panMinDeg: 180, panMaxDeg: 90 })).toBe("validation.cameraPanRange");
    expect(validateCameraConfig({ ...DEFAULT_CAMERA_CONFIG, tiltAngleDeg: 200 })).toBe("validation.cameraAngles");
    expect(validateCameraConfig({ ...DEFAULT_CAMERA_CONFIG, speedRaw: 4096 })).toBe("validation.cameraMotion");
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
