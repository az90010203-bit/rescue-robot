import { describe, expect, it } from "vitest";
import type { ComponentDefinition, PluginInstance, RobotDefinition } from "@platform/architecture";
import {
  ROBOT_ASSEMBLY_HARDWARE_TEMPLATES,
  addSourceToAssembly,
  createActionButtonPreview,
  createAssemblyEdge,
  createDefaultActionButton,
  createDefaultRobotAssembly,
  deleteAssemblyEdge,
  inferRobotAssemblyVisualKind,
  isTrackedBaseComponent,
  motionToneForNode,
  motionToneForPlugin,
  normalizeRobotActionButtons,
  normalizeRobotAssemblyConfig,
  removeSourceFromAssembly,
  toggleHarnessHidden,
  updateAssemblyEdge,
  upsertAssemblyHarness,
  validateRobotAssembly
} from "@domains/robot-assembly/robotAssembly";

describe("robot assembly model", () => {
  it("creates a v2 default assembly from robot components and direct plugins", () => {
    const assembly = createDefaultRobotAssembly(context);

    expect(assembly).toMatchObject({ version: 2, edges: [], controlMappings: [] });
    expect(assembly.nodes.map((node) => [node.sourceType, node.sourceId, node.visualKind])).toEqual([
      ["component", driveComponent.id, "tracked-base"],
      ["component", armComponent.id, "robot-arm"],
      ["plugin", cameraPlugin.id, "plugin"]
    ]);
    expect(assembly.ports?.some((port) => port.kind === "ground")).toBe(true);
  });

  it("migrates persisted v1 nodes and node-level edges to v2 port edges", () => {
    const assembly = normalizeRobotAssemblyConfig(
      {
        version: 1,
        nodes: [
          { id: "drive-node", sourceType: "component", sourceId: driveComponent.id, x: -20, y: 900, w: 240, h: 132, visualKind: "tracked-base" },
          { id: "missing", sourceType: "plugin", sourceId: "missing", x: 10, y: 10, w: 10, h: 10, visualKind: "plugin" }
        ],
        edges: [
          { id: "ok", fromNodeId: "drive-node", toNodeId: "plugin:camera", kind: "signal", label: "legacy" },
          { id: "bad", fromNodeId: "drive-node", toNodeId: "missing", kind: "signal", label: "bad" }
        ],
        controlMappings: [{ id: "map-1", label: "Left stick", enabled: true }]
      },
      context
    );

    expect(assembly.nodes[0]).toMatchObject({ id: "drive-node", x: 0, y: 588, visualKind: "tracked-base" });
    expect(assembly.nodes.some((node) => node.sourceId === "missing")).toBe(false);
    expect(assembly.edges).toHaveLength(1);
    expect(assembly.edges[0]).toMatchObject({ id: "ok", fromNodeId: "drive-node", toNodeId: "plugin:camera", kind: "signal", label: "legacy" });
    expect(assembly.edges[0].fromPortId).toMatch(/^drive-node:port:/);
    expect(assembly.controlMappings).toEqual([{ id: "map-1", label: "Left stick", enabled: true }]);
  });

  it("adds hardware templates with schematic ports", () => {
    const withPi = addSourceToAssembly(createDefaultRobotAssembly(context), { sourceType: "hardware", sourceId: "hardware.raspberry-pi" }, { x: 420, y: 80 }, context);
    const piNode = withPi.nodes.find((node) => node.sourceId === "hardware.raspberry-pi");
    const piPorts = withPi.ports?.filter((port) => port.nodeId === piNode?.id).map((port) => port.label);

    expect(ROBOT_ASSEMBLY_HARDWARE_TEMPLATES.map((template) => template.kind)).toEqual(expect.arrayContaining(["esp32", "robomaster-a", "raspberry-pi", "tb6612", "tb6618", "power-module"]));
    expect(piNode).toMatchObject({ sourceType: "hardware", hardwareKind: "raspberry-pi", visualKind: "hardware-board" });
    expect(piPorts).toEqual(expect.arrayContaining(["Pin 32 TXD5", "Pin 33 RXD5", "Pin 30 GND"]));
  });

  it("creates, updates, hides, and deletes port-level assembly edges", () => {
    const withHardware = addSourceToAssembly(createDefaultRobotAssembly(context), { sourceType: "hardware", sourceId: "hardware.raspberry-pi" }, { x: 420, y: 80 }, context);
    const from = withHardware.ports!.find((port) => port.label === "Pin 32 TXD5")!;
    const to = withHardware.ports!.find((port) => port.label === "Pin 33 RXD5")!;
    const withHarness = upsertAssemblyHarness(withHardware, { id: "harness:uart5", name: "UART5", color: "#38bdf8" });
    const withEdge = createAssemblyEdge(withHarness, from.id, to.id, { serialName: "/dev/ttyAMA5", baudRate: 115200, harnessId: "harness:uart5" });
    const duplicate = createAssemblyEdge(withEdge, from.id, to.id);
    const updated = updateAssemblyEdge(duplicate, withEdge.edges[0].id, { protocol: "serial-json", label: "A board UART" });
    const hiddenHarness = toggleHarnessHidden(updated, "harness:uart5");
    const deleted = deleteAssemblyEdge(hiddenHarness, withEdge.edges[0].id);

    expect(withEdge.edges).toHaveLength(1);
    expect(duplicate.edges).toHaveLength(1);
    expect(updated.edges[0]).toMatchObject({ kind: "uart", label: "A board UART", serialName: "/dev/ttyAMA5", baudRate: 115200 });
    expect(hiddenHarness.harnesses?.[0]).toMatchObject({ hidden: true });
    expect(deleted.edges).toHaveLength(0);
  });

  it("validates UART, power, CAN, and shared ground risks", () => {
    const withBoards = addSourceToAssembly(
      addSourceToAssembly(createDefaultRobotAssembly(context), { sourceType: "hardware", sourceId: "hardware.raspberry-pi" }, { x: 420, y: 80 }, context),
      { sourceType: "hardware", sourceId: "hardware.robomaster-a" },
      { x: 720, y: 80 },
      context
    );
    const piTx = withBoards.ports!.find((port) => port.label === "Pin 32 TXD5")!;
    const aTx = withBoards.ports!.find((port) => port.label === "PD5 USART2_TX")!;
    const badUart = createAssemblyEdge(withBoards, piTx.id, aTx.id, { serialName: "/dev/ttyAMA5" });
    const warnings = validateRobotAssembly(badUart);

    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "error", message: "UART must connect TX to RX." })]));
    expect(warnings).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "warning", message: "UART connection should set a baud rate." })]));
    expect(warnings.some((item) => item.message.includes("share ground"))).toBe(true);
  });

  it("normalizes structured action buttons and blocks preview on schematic errors", () => {
    const buttons = normalizeRobotActionButtons(
      [
        {
          id: "btn-ready",
          name: "Ready Pose",
          confirmRequired: true,
          timeoutMs: 9000,
          steps: [
            { kind: "parallel", label: "Pose", steps: [{ kind: "servo.move", pluginInstanceId: servoPlugin.id, angleDeg: 120, speedRaw: 700, acc: 20 }] },
            { kind: "motor.stop", pluginInstanceId: leftMotor.id, stopMode: "brake" }
          ]
        }
      ],
      plugins
    );
    const preview = createActionButtonPreview(buttons[0], plugins, [{ id: "bad", severity: "error", targetId: "edge", message: "UART bad" }]);

    expect(buttons[0]).toMatchObject({ name: "Ready Pose", confirmRequired: true, timeoutMs: 9000 });
    expect(preview.lines).toEqual(expect.arrayContaining(["Arm Servo -> 120 deg", "Left Track stop brake"]));
    expect(preview.blocked).toBe(true);
    expect(createDefaultActionButton(plugins).steps.length).toBeGreaterThan(0);
  });

  it("adds and removes optional plugin view nodes without duplicating sources", () => {
    const assembly = createDefaultRobotAssembly(context);
    const withMotorNode = addSourceToAssembly(assembly, { sourceType: "plugin", sourceId: leftMotor.id }, { x: 320, y: 220 }, context);
    const duplicate = addSourceToAssembly(withMotorNode, { sourceType: "plugin", sourceId: leftMotor.id }, { x: 600, y: 220 }, context);

    expect(withMotorNode.nodes.find((node) => node.sourceId === leftMotor.id)?.visualKind).toBe("motor-driver");
    expect(duplicate.nodes.filter((node) => node.sourceId === leftMotor.id)).toHaveLength(1);

    const removed = removeSourceFromAssembly(withMotorNode, { sourceType: "plugin", sourceId: leftMotor.id });
    expect(removed.nodes.some((node) => node.sourceId === leftMotor.id)).toBe(false);
  });

  it("infers tracked bases and runtime color tones", () => {
    expect(isTrackedBaseComponent(driveComponent, plugins)).toBe(true);
    expect(inferRobotAssemblyVisualKind({ sourceType: "component", sourceId: driveComponent.id }, context)).toBe("tracked-base");

    expect(motionToneForPlugin(leftMotor, { driveTargets: [{ channel: "M1", speedPercent: 35 }] })).toBe("forward");
    expect(motionToneForPlugin(rightMotor, { motorFeedback: { M2: { commandedSpeedPercent: -40 } } })).toBe("reverse");
    expect(motionToneForPlugin(servoPlugin, { servoFeedback: { 7: { moving: true } } })).toBe("moving");

    const driveNode = createDefaultRobotAssembly(context).nodes.find((node) => node.sourceId === driveComponent.id)!;
    expect(motionToneForNode(driveNode, context, { driveTargets: [{ channel: "M1", speedPercent: 25 }, { channel: "M2", speedPercent: -25 }] })).toBe("mixed");
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

const cameraPlugin: PluginInstance = {
  id: "camera",
  name: "Front Camera",
  type: "camera",
  catalogItemId: null,
  brand: "Generic",
  model: "Camera",
  driverId: "driver.camera-gimbal",
  transportId: "transport.controller-json",
  capabilities: [{ id: "camera", features: ["gimbal"] }],
  config: {},
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

const plugins = [leftMotor, rightMotor, cameraPlugin, servoPlugin];

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
  pluginInstanceIds: [cameraPlugin.id],
  config: {},
  tags: []
};

const context = {
  robot,
  components: [driveComponent, armComponent],
  pluginInstances: plugins
};
