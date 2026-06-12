import { describe, expect, it } from "vitest";
import { asmgMdDegreesToPositionRaw } from "@adapters/hardware/asmgMdCanServo";
import {
  CAN_SERVO_GROUP_DEFAULT_SPEED_RAW,
  CAN_SERVO_GROUP_SLOTS,
  canServoGroupCenterPositions,
  canServoGroupPluginIds,
  canServoGroupTargets,
  compileCanServoGroupPositionCommands,
  createDefaultCanServoGroupConfig,
  normalizeCanServoGroupConfig,
  validateCanServoGroupComponentConfig
} from "@domains/can-servo/canServoGroupComponent";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";

function canServo(id: string, servoId: number, config: Record<string, unknown> = {}): PluginInstance {
  return {
    id,
    name: id,
    type: "servo",
    catalogItemId: "catalog.asme.asme-se-can-servo",
    brand: "ASME",
    model: "ASME-SE",
    driverId: "driver.asme-can-servo",
    transportId: "transport.a-board-can1",
    capabilities: [{ id: "servo", features: ["can1"] }],
    config: { servoId, bitrateKbps: 250, canBus: "CAN1", minDeg: 0, maxDeg: 360, direction: 1, ...config },
    tags: []
  };
}

function component(config: unknown): ComponentDefinition {
  const normalized = normalizeCanServoGroupConfig(config, plugins);
  return {
    id: "group",
    name: "CAN group",
    kind: "can-servo-group",
    pluginInstanceIds: canServoGroupPluginIds(normalized),
    config: normalized,
    tags: []
  };
}

const plugins = [
  canServo("can-a", 1, { minDeg: 10, maxDeg: 110 }),
  canServo("can-b", 2, { minDeg: 20, maxDeg: 120, direction: -1 }),
  canServo("can-c", 3),
  canServo("can-d", 4)
];

describe("CAN servo group component", () => {
  it("defaults to the first four ASME CAN servo plugins", () => {
    const config = createDefaultCanServoGroupConfig(plugins);

    expect(CAN_SERVO_GROUP_SLOTS.map((slot) => config.servos[slot])).toEqual(["can-a", "can-b", "can-c", "can-d"]);
    expect(validateCanServoGroupComponentConfig(component(config), plugins)).toBeNull();
  });

  it("rejects duplicate or mixed-bitrate group mappings", () => {
    expect(validateCanServoGroupComponentConfig(component({
      servos: { servo1: "can-a", servo2: "can-a", servo3: "can-c", servo4: "can-d" }
    }), plugins)).toContain("unique");

    const mixedPlugins = [...plugins.slice(0, 3), canServo("can-d", 4, { bitrateKbps: 500 })];
    expect(validateCanServoGroupComponentConfig(component({
      servos: { servo1: "can-a", servo2: "can-b", servo3: "can-c", servo4: "can-d" }
    }), mixedPlugins)).toContain("same CAN bus and bitrate");
  });

  it("converts logical group targets through plugin limits and direction", () => {
    const config = createDefaultCanServoGroupConfig(plugins);
    const targets = canServoGroupTargets(config, plugins, {
      servo1: 50,
      servo2: 30,
      servo3: 360,
      servo4: 999
    }, 300);

    expect(targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: "servo1", id: 1, logicalAngleDeg: 50, physicalAngleDeg: 60, position: asmgMdDegreesToPositionRaw(60), speed: 300 }),
      expect.objectContaining({ slot: "servo2", id: 2, logicalAngleDeg: 30, physicalAngleDeg: 90, position: asmgMdDegreesToPositionRaw(90), speed: 300 }),
      expect.objectContaining({ slot: "servo3", id: 3, logicalAngleDeg: 360, position: asmgMdDegreesToPositionRaw(360), speed: 300 }),
      expect.objectContaining({ slot: "servo4", id: 4, logicalAngleDeg: 360, position: asmgMdDegreesToPositionRaw(360), speed: 300 })
    ]));
  });

  it("clamps speed to the ASMG-MD range", () => {
    const targets = canServoGroupTargets(createDefaultCanServoGroupConfig(plugins), plugins, {}, Number.NaN);

    expect(targets.every((target) => target.speed === CAN_SERVO_GROUP_DEFAULT_SPEED_RAW)).toBe(true);
  });

  it("centers each slot at its plugin logical midpoint", () => {
    expect(canServoGroupCenterPositions(createDefaultCanServoGroupConfig(plugins), plugins)).toEqual({
      servo1: 50,
      servo2: 50,
      servo3: 180,
      servo4: 180
    });
  });

  it("compiles four logical targets into one A-board group move JSON command", () => {
    let seq = 20;
    const config = createDefaultCanServoGroupConfig(plugins);
    const compiled = compileCanServoGroupPositionCommands(config, plugins, {
      servo1: 50,
      servo2: 30,
      servo3: 90,
      servo4: 180
    }, 300, {
      configure: true,
      nextSeq: () => seq++
    });

    expect(compiled.commands).toEqual([
      { type: "can_servo.config", seq: 20, bitrateKbps: 250 },
      {
        type: "can_servo.group_move",
        seq: 21,
        targets: [
          { id: 1, position: asmgMdDegreesToPositionRaw(60) },
          { id: 2, position: asmgMdDegreesToPositionRaw(90) },
          { id: 3, position: asmgMdDegreesToPositionRaw(90) },
          { id: 4, position: asmgMdDegreesToPositionRaw(180) }
        ],
        speed: 300
      }
    ]);
    expect(compiled.targets).toHaveLength(4);
  });

  it("compiles live drags as one group move without reconfiguring CAN", () => {
    let seq = 30;
    const config = createDefaultCanServoGroupConfig(plugins);
    const compiled = compileCanServoGroupPositionCommands(config, plugins, {
      servo1: 50,
      servo2: 30,
      servo3: 90,
      servo4: 180
    }, 300, {
      configure: false,
      nextSeq: () => seq++
    });

    expect(compiled.commands).toEqual([
      {
        type: "can_servo.group_move",
        seq: 30,
        targets: [
          { id: 1, position: asmgMdDegreesToPositionRaw(60) },
          { id: 2, position: asmgMdDegreesToPositionRaw(90) },
          { id: 3, position: asmgMdDegreesToPositionRaw(90) },
          { id: 4, position: asmgMdDegreesToPositionRaw(180) }
        ],
        speed: 300
      }
    ]);
  });
});
