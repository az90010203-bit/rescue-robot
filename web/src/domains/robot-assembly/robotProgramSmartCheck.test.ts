import { describe, expect, it } from "vitest";
import { createPlatformCommand, type PlatformCommand } from "@platform/commands";
import type { ComponentDefinition, PluginInstance, RobotDefinition, RobotAssemblyWarning } from "@platform/architecture";
import type { WorkflowDefinition } from "@platform/workflow";
import { createRobotProgramRuntimeState } from "@domains/robot-assembly/robotProgram";
import {
  analyzeRobotProgramReadiness,
  analyzeRobotProgramRunResult,
  hasBlockingSmartCheckIssue
} from "@domains/robot-assembly/robotProgramSmartCheck";

describe("robot program smart checks", () => {
  it("blocks empty or structurally invalid workflows", () => {
    const emptyIssues = analyzeRobotProgramReadiness({
      workflow: workflowWithCommands([]),
      commandCount: 0,
      dispatchAvailable: true,
      runtimeState
    });
    const invalidIssues = analyzeRobotProgramReadiness({
      workflow: {
        id: "invalid",
        name: "Invalid",
        nodes: [{ id: "start", kind: "event" }],
        edges: [{ from: "start", to: "missing" }]
      },
      commandCount: 1,
      dispatchAvailable: true,
      runtimeState
    });

    expect(issueIds(emptyIssues)).toContain("program.no-commands");
    expect(hasBlockingSmartCheckIssue(emptyIssues)).toBe(true);
    expect(issueIds(invalidIssues)).toContain("workflow.invalid");
  });

  it("blocks schematic errors and invalid command targets", () => {
    const schematicWarnings: RobotAssemblyWarning[] = [{ id: "bad-uart", severity: "error", targetId: "edge:1", message: "UART must connect TX to RX." }];
    const invalidTarget = createPlatformCommand("servo.ping", "camera:main");
    const issues = analyzeRobotProgramReadiness({
      workflow: workflowWithCommands([invalidTarget]),
      commandCount: 1,
      dispatchAvailable: true,
      runtimeState,
      schematicWarnings
    });

    expect(issueIds(issues)).toEqual(expect.arrayContaining(["schematic.bad-uart", "command.invalid.command-0"]));
    expect(hasBlockingSmartCheckIssue(issues)).toBe(true);
  });

  it("detects helper and serial offline states", () => {
    const piCommand = createPlatformCommand("pi.exec", "pi:main", { command: "python3 main.py" });
    const servoCommand = createPlatformCommand("servo.ping", "servo:7");
    const helperIssues = analyzeRobotProgramReadiness({
      workflow: workflowWithCommands([piCommand]),
      commandCount: 1,
      dispatchAvailable: true,
      runtimeState: createRobotProgramRuntimeState(context, { piHelperReady: false, piConnectionReady: false })
    });
    const serialIssues = analyzeRobotProgramReadiness({
      workflow: workflowWithCommands([servoCommand]),
      commandCount: 1,
      dispatchAvailable: true,
      runtimeState,
      serialConnected: false
    });

    expect(issueIds(helperIssues)).toEqual(expect.arrayContaining(["device.offline.pi:main", "helper.pi-offline"]));
    expect(issueIds(serialIssues)).toContain("serial.offline");
    expect(hasBlockingSmartCheckIssue([...helperIssues, ...serialIssues])).toBe(true);
  });

  it("warns about missing servo feedback without blocking", () => {
    const command = createPlatformCommand("servo.set_position", "servo:7", { angleDeg: 120, speedRaw: 700 });
    const issues = analyzeRobotProgramReadiness({
      workflow: workflowWithCommands([command]),
      commandCount: 1,
      dispatchAvailable: true,
      runtimeState,
      serialConnected: true
    });

    expect(issueIds(issues)).toContain("servo.feedback-missing.servo:7");
    expect(issues.find((issue) => issue.id === "servo.feedback-missing.servo:7")).toMatchObject({ severity: "warning", blocksRun: false });
  });

  it("blocks motor speed commands that do not stop later", () => {
    const unsafe = createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 35, stopMode: "brake" });
    const safeSet = createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 35, stopMode: "brake" });
    const safeStop = createPlatformCommand("motor.stop", "motor:M1", { stopMode: "brake" });

    const unsafeIssues = analyzeRobotProgramReadiness({
      workflow: workflowWithCommands([unsafe]),
      commandCount: 1,
      dispatchAvailable: true,
      runtimeState,
      serialConnected: true
    });
    const safeIssues = analyzeRobotProgramReadiness({
      workflow: workflowWithCommands([safeSet, safeStop]),
      commandCount: 2,
      dispatchAvailable: true,
      runtimeState,
      serialConnected: true
    });

    expect(issueIds(unsafeIssues)).toContain("motor.no-stop.motor:M1");
    expect(issueIds(safeIssues)).not.toContain("motor.no-stop.motor:M1");
  });

  it("diagnoses failed, timed out, and skipped command results after a run", () => {
    const failed = createPlatformCommand("motor.stop", "motor:M1", { stopMode: "brake" });
    const skipped = createPlatformCommand("servo.ping", "servo:7");
    const issues = analyzeRobotProgramRunResult({
      workflow: workflowWithCommands([failed, skipped]),
      runResult: {
        status: "failed",
        visitedNodeIds: ["start", "command-0", "command-1"],
        commandResults: [
          { commandId: failed.id, deviceId: failed.targetDeviceId, status: "timeout", message: "motor timed out" },
          { commandId: skipped.id, deviceId: skipped.targetDeviceId, status: "skipped", message: "platform command was not handled" }
        ]
      },
      runtimeState
    });

    expect(issues.map((issue) => issue.severity)).toEqual(["danger", "warning"]);
    expect(issues.map((issue) => issue.targetId)).toEqual(["motor:M1", "servo:7"]);
  });
});

function workflowWithCommands(commands: PlatformCommand[]): WorkflowDefinition {
  const nodes: WorkflowDefinition["nodes"] = [{ id: "start", kind: "event" }];
  const edges: WorkflowDefinition["edges"] = [];
  commands.forEach((command, index) => {
    const id = `command-${index}`;
    nodes.push({ id, kind: "command", config: { command } });
    edges.push({ from: index === 0 ? "start" : `command-${index - 1}`, to: id });
  });
  return { id: "workflow:test", name: "Test workflow", nodes, edges };
}

function issueIds(issues: Array<{ id: string }>): string[] {
  return issues.map((issue) => issue.id);
}

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
  pluginInstanceIds: [leftMotor.id],
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
  pluginInstances: [leftMotor, servoPlugin]
};

const runtimeState = createRobotProgramRuntimeState(context, { connected: true });
