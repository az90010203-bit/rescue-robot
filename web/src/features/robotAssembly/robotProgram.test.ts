import { describe, expect, it } from "vitest";
import type { ComponentDefinition, PluginInstance, RobotDefinition } from "../../platform/architecture";
import { runWorkflow } from "../../platform/workflow";
import {
  compileRobotProgramFromBlocks,
  createRobotProgramRuntimeState,
  normalizeRobotPrograms,
  type RobotProgramBlockSnapshot
} from "./robotProgram";

describe("robot graphical program model", () => {
  it("compiles Blockly snapshots into safe platform workflow commands", async () => {
    const root: RobotProgramBlockSnapshot = {
      id: "start",
      type: "robot_program_start",
      inputs: {
        DO: {
          id: "motor-set",
          type: "robot_motor_set",
          fields: { PLUGIN: leftMotor.id, SPEED: 35, STOP_MODE: "brake" },
          next: {
            id: "wait",
            type: "robot_wait",
            fields: { MS: 150 },
            next: {
              id: "servo",
              type: "robot_servo_move",
              fields: { PLUGIN: servoPlugin.id, ANGLE: 120, SPEED: 700, ACC: 20 }
            }
          }
        }
      }
    };

    const compiled = compileRobotProgramFromBlocks({ id: "program:test", name: "Test" }, root, context);
    const dispatched: string[] = [];
    const waited: number[] = [];

    expect(compiled.blocked).toBe(false);
    expect(compiled.commandCount).toBe(2);
    expect(compiled.previewLines).toEqual(expect.arrayContaining(["Left Track -> 35%", "Wait 150 ms", "Arm Servo -> 120 deg"]));

    const result = await runWorkflow(compiled.workflow, {
      dispatchCommand: async (command) => {
        dispatched.push(`${command.type}:${command.targetDeviceId}`);
        return { commandId: command.id, deviceId: command.targetDeviceId, status: "sent" };
      },
      wait: async (ms) => {
        waited.push(ms);
      },
      stopOnCommandFailure: true
    });

    expect(result.status).toBe("completed");
    expect(dispatched).toEqual(["motor.set_speed:motor:M1", "servo.set_position:servo:7"]);
    expect(waited).toEqual([150]);
  });

  it("unrolls repeat blocks, gates branches on runtime state, and expands emergency stop", async () => {
    const root: RobotProgramBlockSnapshot = {
      id: "start",
      type: "robot_program_start",
      inputs: {
        DO: {
          id: "repeat",
          type: "robot_repeat",
          fields: { COUNT: 2 },
          inputs: {
            DO: { id: "stop-left", type: "robot_motor_stop", fields: { PLUGIN: leftMotor.id, STOP_MODE: "coast" } }
          },
          next: {
            id: "if-online",
            type: "robot_if_state",
            fields: { DEVICE: "motor:M1", FIELD: "status", EQUALS: "online" },
            inputs: {
              DO: { id: "estop", type: "robot_emergency_stop" }
            }
          }
        }
      }
    };
    const compiled = compileRobotProgramFromBlocks({ id: "program:estop", name: "E-stop" }, root, context);
    const dispatched: string[] = [];

    expect(compiled.blocked).toBe(false);
    expect(compiled.commandCount).toBe(5);

    const result = await runWorkflow(compiled.workflow, {
      state: createRobotProgramRuntimeState(context, { driveTargets: [{ channel: "M1", speedPercent: 10 }] }),
      dispatchCommand: async (command) => {
        dispatched.push(`${command.type}:${command.targetDeviceId}`);
        return { commandId: command.id, deviceId: command.targetDeviceId, status: "sent" };
      }
    });

    expect(result.status).toBe("completed");
    expect(dispatched.filter((item) => item === "motor.stop:motor:M1")).toHaveLength(3);
    expect(dispatched).toEqual(expect.arrayContaining(["motor.stop:motor:M2", "robot-arm.pause:robot-arm:arm"]));
  });

  it("blocks invalid targets and normalizes stored program targets to PC runtime", () => {
    const compiled = compileRobotProgramFromBlocks(
      { id: "program:bad", name: "Bad" },
      { id: "bad", type: "robot_motor_set", fields: { PLUGIN: "missing", SPEED: 50 } },
      context
    );
    const programs = normalizeRobotPrograms([{ id: "p", name: "Remote", target: "pi", timeoutMs: 5 }]);

    expect(compiled.blocked).toBe(true);
    expect(compiled.issues[0]).toMatchObject({ severity: "error" });
    expect(programs[0]).toMatchObject({ id: "p", target: "pc", timeoutMs: 500 });
  });
});

const leftMotor: PluginInstance = {
  id: "left",
  name: "Left Track",
  type: "motor",
  catalogItemId: null,
  brand: "Toshiba",
  model: "TB6618",
  driverId: "driver.tb6618-motor",
  transportId: "transport.controller-json",
  capabilities: [{ id: "motor", features: ["pwm_control"] }],
  config: { channel: "M1" },
  tags: []
};

const rightMotor: PluginInstance = {
  ...leftMotor,
  id: "right",
  name: "Right Track",
  config: { channel: "M2" }
};

const servoPlugin: PluginInstance = {
  id: "servo",
  name: "Arm Servo",
  type: "servo",
  catalogItemId: null,
  brand: "Feetech",
  model: "STS3215",
  driverId: "driver.feetech-servo",
  transportId: "transport.web-serial",
  capabilities: [{ id: "servo", features: ["position_control"] }],
  config: { servoId: 7 },
  tags: []
};

const driveComponent: ComponentDefinition = {
  id: "drive",
  name: "Tracked Base",
  kind: "custom",
  pluginInstanceIds: [leftMotor.id, rightMotor.id],
  config: {},
  tags: []
};

const armComponent: ComponentDefinition = {
  id: "arm",
  name: "Arm",
  kind: "robot-arm",
  pluginInstanceIds: [servoPlugin.id],
  config: {},
  tags: []
};

const robot: RobotDefinition = {
  id: "robot",
  name: "Robot",
  componentIds: [driveComponent.id, armComponent.id],
  pluginInstanceIds: [],
  config: {},
  tags: []
};

const context = {
  robot,
  components: [driveComponent, armComponent],
  pluginInstances: [leftMotor, rightMotor, servoPlugin]
};
