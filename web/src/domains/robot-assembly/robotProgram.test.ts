import { describe, expect, it } from "vitest";
import type { ComponentDefinition, PluginInstance, RobotDefinition } from "@platform/architecture";
import { runWorkflow } from "@platform/workflow";
import {
  compileRobotProgramFromBlocks,
  createRobotProgramRuntimeState,
  normalizeRobotPrograms,
  type RobotProgramBlockSnapshot
} from "@domains/robot-assembly/robotProgram";

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

  it("compiles mecanum drive blocks into component-level velocity commands", async () => {
    const root: RobotProgramBlockSnapshot = {
      id: "mecanum",
      type: "robot_mecanum_drive",
      fields: { COMPONENT: mecanumComponent.id, FORWARD: 0.5, STRAFE: 0.25, TURN: -0.25, SPEED: 70, DURATION: 250, STOP_MODE: "brake" }
    };
    const compiled = compileRobotProgramFromBlocks({ id: "program:mecanum", name: "Mecanum" }, root, mecanumContext);
    const dispatched: string[] = [];
    const waited: number[] = [];

    expect(compiled.blocked).toBe(false);
    expect(compiled.commandCount).toBe(2);
    expect(compiled.previewLines).toEqual(expect.arrayContaining(["Mecanum Base mecanum f0.5 s0.25 r-0.25 @ 70%", "Wait 250 ms", "Mecanum Base mecanum stop brake"]));

    const result = await runWorkflow(compiled.workflow, {
      dispatchCommand: async (command) => {
        dispatched.push(`${command.type}:${command.targetDeviceId}`);
        return { commandId: command.id, deviceId: command.targetDeviceId, status: "sent" };
      },
      wait: async (ms) => {
        waited.push(ms);
      }
    });

    expect(result.status).toBe("completed");
    expect(dispatched).toEqual(["mecanum-drive.set_velocity:mecanum-drive:mecanum", "mecanum-drive.stop:mecanum-drive:mecanum"]);
    expect(waited).toEqual([250]);
  });

  it("compiles preset action blocks into one servo-preset platform command", async () => {
    const presetRobot: RobotDefinition = {
      ...robot,
      config: {
        actionButtons: [{
          id: "button:ready",
          name: "Ready Pose",
          color: "#38bdf8",
          icon: "spark",
          confirmRequired: false,
          timeoutMs: 8000,
          steps: [{
            id: "step:pose",
            kind: "servo.pose",
            label: "Pose",
            speedRaw: 500,
            acc: 20,
            targets: [{ id: "target:servo", pluginInstanceId: servoPlugin.id, angleDeg: 120, enabled: true }]
          }]
        }]
      }
    };
    const root: RobotProgramBlockSnapshot = {
      id: "preset",
      type: "robot_action_preset",
      fields: { ACTION: "button:ready" }
    };
    const compiled = compileRobotProgramFromBlocks({ id: "program:preset", name: "Preset" }, root, { ...context, robot: presetRobot });
    const dispatched: Array<{ type: string; target: string; payload: Record<string, unknown> }> = [];

    expect(compiled.blocked).toBe(false);
    expect(compiled.commandCount).toBe(1);
    expect(compiled.previewLines).toEqual(["Ready Pose preset"]);

    const result = await runWorkflow(compiled.workflow, {
      dispatchCommand: async (command) => {
        dispatched.push({ type: command.type, target: command.targetDeviceId, payload: command.payload });
        return { commandId: command.id, deviceId: command.targetDeviceId, status: "sent" };
      }
    });

    expect(result.status).toBe("completed");
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe("servo-preset.run");
    expect(dispatched[0].target).toBe("servo-preset:button:ready");
    expect(dispatched[0].payload.pcCommands).toEqual([{
      type: "servo.move",
      seq: 1,
      sync: true,
      targets: [{ id: 7, name: "Arm Servo", angleDeg: 120, speedRaw: 500, acc: 20 }]
    }]);
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

const rearRightMotor: PluginInstance = {
  ...leftMotor,
  id: "rear-right",
  name: "Rear Right",
  config: { channel: "M3" }
};

const frontRightMotor: PluginInstance = {
  ...leftMotor,
  id: "front-right",
  name: "Front Right",
  config: { channel: "M4" }
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

const mecanumComponent: ComponentDefinition = {
  id: "mecanum",
  name: "Mecanum Base",
  kind: "mecanum-drive",
  pluginInstanceIds: [leftMotor.id, rightMotor.id, rearRightMotor.id, frontRightMotor.id],
  config: {
    wheels: {
      frontLeft: leftMotor.id,
      frontRight: frontRightMotor.id,
      rearLeft: rightMotor.id,
      rearRight: rearRightMotor.id
    },
    closedLoop: true,
    maxRpm: 6000,
    encoderTicksPerRev: 52
  },
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

const mecanumContext = {
  robot: {
    ...robot,
    componentIds: [mecanumComponent.id]
  },
  components: [mecanumComponent],
  pluginInstances: [leftMotor, rightMotor, rearRightMotor, frontRightMotor]
};
