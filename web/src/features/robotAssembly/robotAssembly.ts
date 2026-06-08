import type { MotorTarget } from "../../lib/protocol";
import { clamp, normalizeMotorChannel } from "../../lib/protocol";
import {
  type ComponentDefinition,
  type PluginInstance,
  type RobotActionButton,
  type RobotActionButtonStep,
  type RobotAssemblyConfig,
  type RobotAssemblyEdge,
  type RobotAssemblyHardwareKind,
  type RobotAssemblyHarness,
  type RobotAssemblyNode,
  type RobotAssemblyNodeSourceType,
  type RobotAssemblyPort,
  type RobotAssemblyPortDirection,
  type RobotAssemblyPortKind,
  type RobotAssemblyVisualKind,
  type RobotAssemblyWarning,
  type RobotControlMapping,
  type RobotDefinition,
  effectivePluginInstancesForComponent,
  pluginInstanceDeviceId,
  pluginInstancesToMotorProfiles,
  pluginInstancesToServoProfiles
} from "../../platform/architecture";
export type { RobotAssemblyWarning } from "../../platform/architecture";

export const ROBOT_ASSEMBLY_VERSION = 2;
export const ROBOT_ASSEMBLY_CANVAS_WIDTH = 1120;
export const ROBOT_ASSEMBLY_CANVAS_HEIGHT = 720;
export const ROBOT_ASSEMBLY_NODE_WIDTH = 210;
export const ROBOT_ASSEMBLY_NODE_HEIGHT = 136;

const DEFAULT_HARNESS_COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#ef4444"];

export type RobotAssemblyMotionTone = "neutral" | "forward" | "reverse" | "mixed" | "online" | "moving" | "offline";

export interface RobotAssemblyContext {
  robot: RobotDefinition;
  components: ComponentDefinition[];
  pluginInstances: PluginInstance[];
}

export interface RobotAssemblySource {
  sourceType: RobotAssemblyNodeSourceType;
  sourceId: string;
}

export interface MotorFeedbackLike {
  channel?: string | null;
  commandedSpeedPercent?: number | null;
  dutyPercent?: number | null;
}

export interface ServoFeedbackLike {
  moving?: boolean | null;
  positionRaw?: number | null;
}

export interface RobotAssemblyStatusContext {
  driveTargets?: MotorTarget[];
  motorFeedback?: Record<string, MotorFeedbackLike>;
  servoFeedback?: Record<number, ServoFeedbackLike>;
  piHelperReady?: boolean;
  piConnectionReady?: boolean;
  connected?: boolean;
}

export interface HardwareTemplate {
  id: string;
  kind: RobotAssemblyHardwareKind;
  name: string;
  subtitle: string;
  visualKind: RobotAssemblyVisualKind;
  w: number;
  h: number;
  ports: Array<Omit<RobotAssemblyPort, "id" | "nodeId">>;
}

export interface ActionButtonPreview {
  blocked: boolean;
  lines: string[];
  warnings: RobotAssemblyWarning[];
}

export const ROBOT_ASSEMBLY_HARDWARE_TEMPLATES: HardwareTemplate[] = [
  {
    id: "hardware.esp32-json-controller",
    kind: "esp32",
    name: "ESP32 JSON Controller",
    subtitle: "USB serial / PWM / GPIO",
    visualKind: "hardware-board",
    w: 230,
    h: 164,
    ports: [
      port("USB", "USB", "usb", "bidirectional", "left", 0, 42),
      port("TX0", "TX0", "uart-tx", "out", "left", 0, 76),
      port("RX0", "RX0", "uart-rx", "in", "left", 0, 110),
      port("GND", "GND", "ground", "power", "bottom", 50, 164, "0V", true),
      port("5V", "5V", "power", "power", "bottom", 102, 164, "5V"),
      port("M1_PWM", "M1 PWM", "pwm", "out", "right", 230, 44),
      port("M1_IN1", "M1 IN1", "gpio", "out", "right", 230, 74),
      port("M1_IN2", "M1 IN2", "gpio", "out", "right", 230, 104),
      port("SERVO", "Servo bus", "servo-bus", "bidirectional", "right", 230, 134)
    ]
  },
  {
    id: "hardware.robomaster-a",
    kind: "robomaster-a",
    name: "RoboMaster Type A",
    subtitle: "STM32 / UART5 / CAN1 / PWM",
    visualKind: "hardware-board",
    w: 248,
    h: 176,
    ports: [
      port("PD5_TX", "PD5 USART2_TX", "uart-tx", "out", "left", 0, 42),
      port("PD6_RX", "PD6 USART2_RX", "uart-rx", "in", "left", 0, 76),
      port("CAN1", "CAN1", "can", "bidirectional", "left", 0, 112),
      port("PGND", "PGND", "ground", "power", "bottom", 56, 176, "0V", true),
      port("PD12_PWM", "PD12 PWM", "pwm", "out", "right", 248, 42),
      port("PA2_DIR", "PA2 DIR", "gpio", "out", "right", 248, 76),
      port("PA3_DIR", "PA3 DIR", "gpio", "out", "right", 248, 110),
      port("PI5_STBY", "PI5 STBY", "gpio", "out", "right", 248, 144)
    ]
  },
  {
    id: "hardware.raspberry-pi",
    kind: "raspberry-pi",
    name: "Raspberry Pi",
    subtitle: "SSH / UART bridges / camera",
    visualKind: "hardware-board",
    w: 238,
    h: 176,
    ports: [
      port("PIN8_TXD0", "Pin 8 TXD0", "uart-tx", "out", "right", 238, 42),
      port("PIN10_RXD0", "Pin 10 RXD0", "uart-rx", "in", "right", 238, 76),
      port("PIN32_TXD5", "Pin 32 TXD5", "uart-tx", "out", "right", 238, 110),
      port("PIN33_RXD5", "Pin 33 RXD5", "uart-rx", "in", "right", 238, 144),
      port("PIN30_GND", "Pin 30 GND", "ground", "power", "bottom", 66, 176, "0V", true),
      port("PIN2_5V", "Pin 2 5V", "power", "power", "bottom", 128, 176, "5V"),
      port("USB", "USB", "usb", "bidirectional", "left", 0, 50),
      port("LAN", "LAN", "signal", "bidirectional", "left", 0, 100)
    ]
  },
  {
    id: "hardware.tb6612-driver",
    kind: "tb6612",
    name: "TB6612 Driver",
    subtitle: "H-bridge / VM / PWMA",
    visualKind: "motor-driver",
    w: 220,
    h: 164,
    ports: [
      port("VM", "VM 12V", "power", "power", "left", 0, 42, "12V", true),
      port("VCC", "VCC 5V", "power", "power", "left", 0, 74, "5V"),
      port("GND", "GND", "ground", "power", "left", 0, 106, "0V", true),
      port("PWMA", "PWMA", "pwm", "in", "right", 220, 42),
      port("AIN1", "AIN1", "gpio", "in", "right", 220, 74),
      port("AIN2", "AIN2", "gpio", "in", "right", 220, 106),
      port("STBY", "STBY", "gpio", "in", "right", 220, 138)
    ]
  },
  {
    id: "hardware.tb6618-driver",
    kind: "tb6618",
    name: "TB6618 Driver",
    subtitle: "PWM / IN1 / IN2 / VM",
    visualKind: "motor-driver",
    w: 220,
    h: 164,
    ports: [
      port("VM", "VM 12V", "power", "power", "left", 0, 42, "12V", true),
      port("GND", "GND", "ground", "power", "left", 0, 82, "0V", true),
      port("PWM", "PWM", "pwm", "in", "right", 220, 42),
      port("IN1", "IN1", "gpio", "in", "right", 220, 76),
      port("IN2", "IN2", "gpio", "in", "right", 220, 110),
      port("EN", "EN/STBY", "gpio", "in", "right", 220, 144)
    ]
  },
  {
    id: "hardware.power-module",
    kind: "power-module",
    name: "Power Module",
    subtitle: "12V / 5V / common ground",
    visualKind: "power-module",
    w: 212,
    h: 146,
    ports: [
      port("BAT_12V", "12V OUT", "power", "power", "right", 212, 42, "12V"),
      port("REG_5V", "5V OUT", "power", "power", "right", 212, 78, "5V"),
      port("GND", "GND", "ground", "power", "right", 212, 114, "0V", true),
      port("BAT_IN", "BAT IN", "power", "power", "left", 0, 62, "12V"),
      port("BAT_GND", "BAT GND", "ground", "power", "left", 0, 100, "0V", true)
    ]
  }
];

export function sourceNodeId(sourceType: RobotAssemblyNodeSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

export function createDefaultRobotAssembly(context: RobotAssemblyContext): RobotAssemblyConfig {
  return normalizeRobotAssemblyConfig(undefined, context);
}

export function normalizeRobotAssemblyConfig(value: unknown, context: RobotAssemblyContext): RobotAssemblyConfig {
  const raw = isObject(value) ? value as Partial<RobotAssemblyConfig> : {};
  const validSources = validRobotAssemblySources(context);
  const seenSourceKeys = new Set<string>();
  const seenNodeIds = new Set<string>();
  const nodes: RobotAssemblyNode[] = [];

  for (const item of Array.isArray(raw.nodes) ? raw.nodes : []) {
    const node = normalizeNode(item, context, validSources, seenNodeIds);
    if (!node) {
      continue;
    }
    const sourceKey = sourceNodeId(node.sourceType, node.sourceId);
    if (seenSourceKeys.has(sourceKey)) {
      continue;
    }
    seenSourceKeys.add(sourceKey);
    seenNodeIds.add(node.id);
    nodes.push(node);
  }

  for (const node of defaultNodesForRobot(context, seenSourceKeys, seenNodeIds)) {
    seenSourceKeys.add(sourceNodeId(node.sourceType, node.sourceId));
    seenNodeIds.add(node.id);
    nodes.push(node);
  }

  const ports = normalizePorts(raw.ports, nodes, context);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const portIds = new Set(ports.map((item) => item.id));
  const harnesses = normalizeHarnesses(raw.harnesses);
  const edges = normalizeEdges(raw.edges, nodeIds, portIds, ports, harnesses);

  return {
    version: ROBOT_ASSEMBLY_VERSION,
    nodes,
    ports,
    edges,
    harnesses,
    controlMappings: normalizeControlMappings(raw.controlMappings)
  };
}

export function addSourceToAssembly(
  assembly: RobotAssemblyConfig,
  source: RobotAssemblySource,
  point: { x: number; y: number },
  context: RobotAssemblyContext
): RobotAssemblyConfig {
  const normalized = normalizeRobotAssemblyConfig(assembly, context);
  if (normalized.nodes.some((node) => node.sourceType === source.sourceType && node.sourceId === source.sourceId)) {
    return normalized;
  }
  const validSources = validRobotAssemblySources(context);
  if (!validSources.has(sourceNodeId(source.sourceType, source.sourceId))) {
    return normalized;
  }
  const node = createNode(source, point.x, point.y, context, new Set(normalized.nodes.map((item) => item.id)));
  const ports = [...normalized.ports ?? [], ...portsForNode(node, context, [])];
  return normalizeRobotAssemblyConfig({
    ...normalized,
    nodes: [...normalized.nodes, node],
    ports
  }, context);
}

export function removeSourceFromAssembly(assembly: RobotAssemblyConfig, source: RobotAssemblySource): RobotAssemblyConfig {
  const removeNodeIds = new Set(
    assembly.nodes
      .filter((node) => node.sourceType === source.sourceType && node.sourceId === source.sourceId)
      .map((node) => node.id)
  );
  const removePortIds = new Set((assembly.ports ?? []).filter((item) => removeNodeIds.has(item.nodeId)).map((item) => item.id));
  return {
    ...assembly,
    nodes: assembly.nodes.filter((node) => !removeNodeIds.has(node.id)),
    ports: (assembly.ports ?? []).filter((item) => !removePortIds.has(item.id)),
    edges: assembly.edges.filter((edge) => !removeNodeIds.has(edge.fromNodeId) && !removeNodeIds.has(edge.toNodeId) && !removePortIds.has(edge.fromPortId ?? "") && !removePortIds.has(edge.toPortId ?? ""))
  };
}

export function moveAssemblyNode(assembly: RobotAssemblyConfig, nodeId: string, point: { x: number; y: number }): RobotAssemblyConfig {
  return {
    ...assembly,
    nodes: assembly.nodes.map((node) => (
      node.id === nodeId
        ? { ...node, x: clampNodeX(point.x, node.w), y: clampNodeY(point.y, node.h) }
        : node
    ))
  };
}

export function createAssemblyEdge(
  assembly: RobotAssemblyConfig,
  fromId: string,
  toId: string,
  patch: Partial<Pick<RobotAssemblyEdge, "kind" | "label" | "serialName" | "baudRate" | "protocol" | "voltage" | "harnessId" | "hidden">> = {}
): RobotAssemblyConfig {
  if (!fromId || !toId || fromId === toId) {
    return assembly;
  }
  const ports = assembly.ports ?? [];
  const fromPort = findPortForConnection(assembly, fromId, "out");
  const toPort = findPortForConnection(assembly, toId, "in");
  if (!fromPort || !toPort || fromPort.id === toPort.id) {
    return assembly;
  }
  if (assembly.edges.some((edge) => edge.fromPortId === fromPort.id && edge.toPortId === toPort.id)) {
    return assembly;
  }
  const fromNodeId = fromPort.nodeId;
  const toNodeId = toPort.nodeId;
  const kind = cleanText(patch.kind, inferEdgeKind(fromPort, toPort));
  const id = uniqueEdgeId(`edge:${fromPort.id}:${toPort.id}`, assembly.edges);
  const edge: RobotAssemblyEdge = {
    id,
    fromNodeId,
    toNodeId,
    fromPortId: fromPort.id,
    toPortId: toPort.id,
    kind,
    label: cleanText(patch.label, defaultEdgeLabel(kind, fromPort, toPort, patch)),
    serialName: optionalText(patch.serialName),
    baudRate: numberOrNull(patch.baudRate) ?? undefined,
    protocol: optionalText(patch.protocol),
    voltage: optionalText(patch.voltage ?? fromPort.voltage ?? toPort.voltage),
    harnessId: optionalText(patch.harnessId),
    hidden: patch.hidden === true
  };
  return {
    ...assembly,
    ports,
    edges: [...assembly.edges, edge]
  };
}

export function updateAssemblyEdge(assembly: RobotAssemblyConfig, edgeId: string, patch: Partial<Omit<RobotAssemblyEdge, "id" | "fromNodeId" | "toNodeId">>): RobotAssemblyConfig {
  return {
    ...assembly,
    edges: assembly.edges.map((edge) => (
      edge.id === edgeId
        ? {
            ...edge,
            ...(patch.fromPortId !== undefined ? { fromPortId: optionalText(patch.fromPortId) } : {}),
            ...(patch.toPortId !== undefined ? { toPortId: optionalText(patch.toPortId) } : {}),
            ...(patch.kind !== undefined ? { kind: cleanText(patch.kind, edge.kind) } : {}),
            ...(patch.label !== undefined ? { label: cleanText(patch.label, "") } : {}),
            ...(patch.serialName !== undefined ? { serialName: optionalText(patch.serialName) } : {}),
            ...(patch.baudRate !== undefined ? { baudRate: numberOrNull(patch.baudRate) ?? undefined } : {}),
            ...(patch.protocol !== undefined ? { protocol: optionalText(patch.protocol) } : {}),
            ...(patch.voltage !== undefined ? { voltage: optionalText(patch.voltage) } : {}),
            ...(patch.harnessId !== undefined ? { harnessId: optionalText(patch.harnessId) } : {}),
            ...(patch.hidden !== undefined ? { hidden: patch.hidden === true } : {})
          }
        : edge
    ))
  };
}

export function deleteAssemblyEdge(assembly: RobotAssemblyConfig, edgeId: string): RobotAssemblyConfig {
  return {
    ...assembly,
    edges: assembly.edges.filter((edge) => edge.id !== edgeId)
  };
}

export function upsertAssemblyHarness(assembly: RobotAssemblyConfig, patch: Partial<RobotAssemblyHarness>): RobotAssemblyConfig {
  const harnesses = assembly.harnesses ?? [];
  const id = cleanText(patch.id, `harness:${harnesses.length + 1}`);
  const next: RobotAssemblyHarness = {
    id,
    name: cleanText(patch.name, `Harness ${harnesses.length + 1}`),
    color: cleanText(patch.color, DEFAULT_HARNESS_COLORS[harnesses.length % DEFAULT_HARNESS_COLORS.length]),
    hidden: patch.hidden === true
  };
  return {
    ...assembly,
    harnesses: harnesses.some((item) => item.id === id)
      ? harnesses.map((item) => item.id === id ? { ...item, ...next } : item)
      : [...harnesses, next]
  };
}

export function toggleHarnessHidden(assembly: RobotAssemblyConfig, harnessId: string): RobotAssemblyConfig {
  return {
    ...assembly,
    harnesses: (assembly.harnesses ?? []).map((item) => item.id === harnessId ? { ...item, hidden: !item.hidden } : item)
  };
}

export function inferRobotAssemblyVisualKind(source: RobotAssemblySource, context: RobotAssemblyContext): RobotAssemblyVisualKind {
  if (source.sourceType === "plugin") {
    const plugin = context.pluginInstances.find((item) => item.id === source.sourceId);
    return plugin?.type === "motor" ? "motor-driver" : "plugin";
  }
  if (source.sourceType === "hardware") {
    return hardwareTemplate(source.sourceId)?.visualKind ?? "hardware-board";
  }
  const component = context.components.find((item) => item.id === source.sourceId);
  if (!component) {
    return "component";
  }
  if (component.kind === "robot-arm") {
    return "robot-arm";
  }
  return isTrackedBaseComponent(component, context.pluginInstances) ? "tracked-base" : "component";
}

export function isTrackedBaseComponent(component: ComponentDefinition, pluginInstances: PluginInstance[]): boolean {
  return pluginInstancesToMotorProfiles(effectivePluginInstancesForComponent(component, pluginInstances)).length >= 2;
}

export function robotEffectivePluginIds(robot: RobotDefinition, components: ComponentDefinition[]): Set<string> {
  const ids = new Set(robot.pluginInstanceIds);
  const componentById = new Map(components.map((component) => [component.id, component]));
  for (const componentId of robot.componentIds) {
    for (const pluginId of componentById.get(componentId)?.pluginInstanceIds ?? []) {
      ids.add(pluginId);
    }
  }
  return ids;
}

export function motorSpeedForPlugin(instance: PluginInstance, status: RobotAssemblyStatusContext = {}): number | null {
  const motor = pluginInstancesToMotorProfiles([instance])[0];
  if (!motor) {
    return null;
  }
  const channel = normalizeMotorChannel(motor.channel);
  const feedback = status.motorFeedback?.[channel] ?? Object.values(status.motorFeedback ?? {}).find((item) => normalizeMotorChannel(String(item.channel ?? "")) === channel);
  const feedbackSpeed = numberOrNull(feedback?.commandedSpeedPercent) ?? numberOrNull(feedback?.dutyPercent);
  if (feedbackSpeed !== null) {
    return clamp(Math.round(feedbackSpeed), -100, 100);
  }
  const driveTarget = status.driveTargets?.find((target) => normalizeMotorChannel(target.channel) === channel);
  return driveTarget ? clamp(Math.round(driveTarget.speedPercent), -100, 100) : 0;
}

export function motionToneForPlugin(instance: PluginInstance, status: RobotAssemblyStatusContext = {}): RobotAssemblyMotionTone {
  if (instance.type === "motor") {
    const speed = motorSpeedForPlugin(instance, status);
    if (speed === null || speed === 0) {
      return "neutral";
    }
    return speed > 0 ? "forward" : "reverse";
  }
  if (instance.type === "servo") {
    const servo = pluginInstancesToServoProfiles([instance])[0];
    if (!servo) {
      return "offline";
    }
    const feedback = status.servoFeedback?.[servo.id];
    if (!feedback) {
      return "offline";
    }
    return feedback.moving === true ? "moving" : "online";
  }
  if (instance.type === "raspberry-pi") {
    return status.piConnectionReady ? "online" : status.piHelperReady ? "neutral" : "offline";
  }
  return "neutral";
}

export function motionToneForNode(node: RobotAssemblyNode, context: RobotAssemblyContext, status: RobotAssemblyStatusContext = {}): RobotAssemblyMotionTone {
  if (node.sourceType === "plugin") {
    const plugin = context.pluginInstances.find((item) => item.id === node.sourceId);
    return plugin ? motionToneForPlugin(plugin, status) : "offline";
  }
  if (node.sourceType === "hardware") {
    if (node.hardwareKind === "raspberry-pi") {
      return status.piConnectionReady ? "online" : status.piHelperReady ? "neutral" : "offline";
    }
    if (node.hardwareKind === "esp32") {
      return status.connected ? "online" : "offline";
    }
    return "neutral";
  }
  const component = context.components.find((item) => item.id === node.sourceId);
  if (!component) {
    return "offline";
  }
  const motorTones = effectivePluginInstancesForComponent(component, context.pluginInstances)
    .filter((instance) => instance.type === "motor")
    .map((instance) => motionToneForPlugin(instance, status))
    .filter((tone) => tone === "forward" || tone === "reverse");
  if (motorTones.includes("forward") && motorTones.includes("reverse")) {
    return "mixed";
  }
  return motorTones[0] ?? "neutral";
}

export function sourceLabel(source: RobotAssemblySource, context: RobotAssemblyContext): string {
  if (source.sourceType === "component") {
    return context.components.find((component) => component.id === source.sourceId)?.name ?? source.sourceId;
  }
  if (source.sourceType === "plugin") {
    return context.pluginInstances.find((plugin) => plugin.id === source.sourceId)?.name ?? source.sourceId;
  }
  return hardwareTemplate(source.sourceId)?.name ?? source.sourceId;
}

export function nodePorts(assembly: RobotAssemblyConfig, nodeId: string): RobotAssemblyPort[] {
  return (assembly.ports ?? []).filter((portItem) => portItem.nodeId === nodeId);
}

export function edgeDisplayLabel(edge: RobotAssemblyEdge): string {
  return edge.label || edge.serialName || edge.protocol || edge.voltage || edge.kind;
}

export function validateRobotAssembly(assembly: RobotAssemblyConfig): RobotAssemblyWarning[] {
  const ports = assembly.ports ?? [];
  const portById = new Map(ports.map((portItem) => [portItem.id, portItem]));
  const warnings: RobotAssemblyWarning[] = [];

  for (const edge of assembly.edges) {
    const from = edge.fromPortId ? portById.get(edge.fromPortId) : undefined;
    const to = edge.toPortId ? portById.get(edge.toPortId) : undefined;
    if (!from || !to) {
      warnings.push(warning("error", edge.id, "Connection is missing an endpoint port."));
      continue;
    }
    if (from.nodeId === to.nodeId) {
      warnings.push(warning("warning", edge.id, "Connection loops back to the same node."));
    }
    if (isUartPort(from) || isUartPort(to) || edge.kind === "uart") {
      const txRxOk = (from.kind === "uart-tx" && to.kind === "uart-rx") || (from.kind === "uart-rx" && to.kind === "uart-tx") || from.kind === "uart" || to.kind === "uart";
      if (!txRxOk) {
        warnings.push(warning("error", edge.id, "UART must connect TX to RX."));
      }
      if (!edge.serialName) {
        warnings.push(warning("warning", edge.id, "UART connection should name the serial port."));
      }
      if (!edge.baudRate) {
        warnings.push(warning("warning", edge.id, "UART connection should set a baud rate."));
      }
    }
    if (isPowerPort(from) || isPowerPort(to) || edge.kind === "power") {
      if (from.kind === "ground" || to.kind === "ground") {
        if (from.kind !== "ground" || to.kind !== "ground") {
          warnings.push(warning("error", edge.id, "Ground must connect to ground, not a powered rail."));
        }
      }
      const fromVoltage = normalizeVoltage(from.voltage);
      const toVoltage = normalizeVoltage(to.voltage);
      const edgeVoltage = normalizeVoltage(edge.voltage);
      const mismatch = fromVoltage && toVoltage && fromVoltage !== toVoltage;
      if (mismatch) {
        warnings.push(warning("error", edge.id, `Voltage mismatch: ${from.voltage} to ${to.voltage}.`));
      }
      if (!edgeVoltage && from.kind !== "ground" && to.kind !== "ground") {
        warnings.push(warning("warning", edge.id, "Power connection should declare voltage."));
      }
    }
    if (edge.kind === "pwm" || from.kind === "pwm" || to.kind === "pwm") {
      if (![from.kind, to.kind].includes("pwm")) {
        warnings.push(warning("warning", edge.id, "PWM connection has no PWM endpoint."));
      }
    }
    if (edge.kind === "can" || from.kind === "can" || to.kind === "can") {
      if (from.kind !== "can" || to.kind !== "can") {
        warnings.push(warning("error", edge.id, "CAN must connect CAN endpoints."));
      }
    }
  }

  const groundedNodes = new Set(assembly.edges.flatMap((edge) => {
    const from = edge.fromPortId ? portById.get(edge.fromPortId) : undefined;
    const to = edge.toPortId ? portById.get(edge.toPortId) : undefined;
    return from?.kind === "ground" && to?.kind === "ground" ? [from.nodeId, to.nodeId] : [];
  }));
  for (const node of assembly.nodes) {
    const requiredGround = ports.some((portItem) => portItem.nodeId === node.id && portItem.kind === "ground" && portItem.required === true);
    if (requiredGround && !groundedNodes.has(node.id)) {
      warnings.push(warning("warning", node.id, `${sourceIdLabel(node)} should share ground with the system.`));
    }
  }
  return warnings;
}

export function normalizeRobotActionButtons(value: unknown, pluginInstances: PluginInstance[]): RobotActionButton[] {
  const raw = Array.isArray(value) ? value : [];
  const validPluginIds = new Set(pluginInstances.map((plugin) => plugin.id));
  return raw
    .filter(isObject)
    .map((item, index) => normalizeActionButton(item, index, validPluginIds))
    .filter((button) => button.steps.length > 0);
}

export function createDefaultActionButton(pluginInstances: PluginInstance[]): RobotActionButton {
  const firstServo = pluginInstances.find((plugin) => plugin.type === "servo");
  const motors = pluginInstances.filter((plugin) => plugin.type === "motor");
  const steps: RobotActionButtonStep[] = [];
  if (firstServo) {
    steps.push({
      id: "step:servo-ready",
      kind: "servo.move",
      label: "Move first servo",
      pluginInstanceId: firstServo.id,
      angleDeg: 90,
      speedRaw: 600,
      acc: 30
    });
  }
  if (motors.length > 0) {
    steps.push({
      id: "step:stop-motors",
      kind: "parallel",
      label: "Stop all motors",
      steps: motors.map((motor, index) => ({
        id: `step:stop-motor-${index + 1}`,
        kind: "motor.stop",
        label: `Stop ${motor.name}`,
        pluginInstanceId: motor.id,
        stopMode: "brake"
      }))
    });
  }
  if (steps.length === 0) {
    steps.push({ id: "step:wait", kind: "wait", label: "Wait", durationMs: 300 });
  }
  return {
    id: `button:${Date.now()}`,
    name: "One-key Pose",
    color: "#38bdf8",
    icon: "spark",
    confirmRequired: true,
    timeoutMs: 8000,
    steps
  };
}

export function createActionButtonPreview(button: RobotActionButton, pluginInstances: PluginInstance[], warnings: RobotAssemblyWarning[] = []): ActionButtonPreview {
  const pluginById = new Map(pluginInstances.map((plugin) => [plugin.id, plugin]));
  const lines = flattenActionSteps(button.steps).map((step) => {
    const plugin = step.pluginInstanceId ? pluginById.get(step.pluginInstanceId) : null;
    if (step.kind === "servo.move") {
      return `${plugin?.name ?? step.pluginInstanceId ?? "Servo"} -> ${step.angleDeg ?? 0} deg`;
    }
    if (step.kind === "motor.set") {
      return `${plugin?.name ?? step.pluginInstanceId ?? "Motor"} -> ${step.speedPercent ?? 0}%`;
    }
    if (step.kind === "motor.stop") {
      return `${plugin?.name ?? step.pluginInstanceId ?? "Motor"} stop ${step.stopMode ?? "coast"}`;
    }
    if (step.kind === "wait") {
      return `Wait ${step.durationMs ?? 0} ms`;
    }
    return step.label;
  });
  const blocking = warnings.filter((item) => item.severity === "error");
  return {
    blocked: blocking.length > 0,
    lines,
    warnings: blocking
  };
}

export function flattenActionSteps(steps: RobotActionButtonStep[]): RobotActionButtonStep[] {
  return steps.flatMap((step) => step.kind === "parallel" ? flattenActionSteps(step.steps ?? []) : [step]);
}

function validRobotAssemblySources(context: RobotAssemblyContext): Set<string> {
  const sources = new Set<string>();
  for (const componentId of context.robot.componentIds) {
    sources.add(sourceNodeId("component", componentId));
  }
  for (const pluginId of robotEffectivePluginIds(context.robot, context.components)) {
    sources.add(sourceNodeId("plugin", pluginId));
  }
  for (const template of ROBOT_ASSEMBLY_HARDWARE_TEMPLATES) {
    sources.add(sourceNodeId("hardware", template.id));
  }
  return sources;
}

function defaultNodesForRobot(context: RobotAssemblyContext, seenSourceKeys: Set<string>, seenNodeIds: Set<string>): RobotAssemblyNode[] {
  const nodes: RobotAssemblyNode[] = [];
  const sources: RobotAssemblySource[] = [
    ...context.robot.componentIds.map((sourceId) => ({ sourceType: "component" as const, sourceId })),
    ...context.robot.pluginInstanceIds.map((sourceId) => ({ sourceType: "plugin" as const, sourceId }))
  ];
  for (const source of sources) {
    const key = sourceNodeId(source.sourceType, source.sourceId);
    if (seenSourceKeys.has(key)) {
      continue;
    }
    const index = nodes.length + seenSourceKeys.size;
    const x = 48 + (index % 3) * 270;
    const y = 68 + Math.floor(index / 3) * 180;
    nodes.push(createNode(source, x, y, context, seenNodeIds));
  }
  return nodes;
}

function createNode(source: RobotAssemblySource, x: number, y: number, context: RobotAssemblyContext, seenNodeIds: Set<string>): RobotAssemblyNode {
  const baseId = sourceNodeId(source.sourceType, source.sourceId);
  let id = baseId;
  let index = 2;
  while (seenNodeIds.has(id)) {
    id = `${baseId}:${index}`;
    index += 1;
  }
  const visualKind = inferRobotAssemblyVisualKind(source, context);
  const template = source.sourceType === "hardware" ? hardwareTemplate(source.sourceId) : null;
  const w = template?.w ?? (visualKind === "tracked-base" ? 240 : visualKind === "robot-arm" ? 230 : ROBOT_ASSEMBLY_NODE_WIDTH);
  const h = template?.h ?? (visualKind === "tracked-base" ? 148 : ROBOT_ASSEMBLY_NODE_HEIGHT);
  return {
    id,
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    hardwareKind: template?.kind,
    x: clampNodeX(x, w),
    y: clampNodeY(y, h),
    w,
    h,
    visualKind
  };
}

function normalizeNode(
  value: unknown,
  context: RobotAssemblyContext,
  validSources: Set<string>,
  seenNodeIds: Set<string>
): RobotAssemblyNode | null {
  if (!isObject(value)) {
    return null;
  }
  const sourceType = value.sourceType === "component" || value.sourceType === "plugin" || value.sourceType === "hardware" ? value.sourceType : null;
  const sourceId = cleanText(value.sourceId, "");
  if (!sourceType || !sourceId || !validSources.has(sourceNodeId(sourceType, sourceId))) {
    return null;
  }
  const template = sourceType === "hardware" ? hardwareTemplate(sourceId) : null;
  const visualKind = normalizeVisualKind(value.visualKind, inferRobotAssemblyVisualKind({ sourceType, sourceId }, context));
  const w = clampInteger(value.w, 132, 340, template?.w ?? (visualKind === "tracked-base" ? 240 : ROBOT_ASSEMBLY_NODE_WIDTH));
  const h = clampInteger(value.h, 88, 240, template?.h ?? (visualKind === "tracked-base" ? 148 : ROBOT_ASSEMBLY_NODE_HEIGHT));
  const id = uniqueNodeId(cleanText(value.id, sourceNodeId(sourceType, sourceId)), seenNodeIds);
  return {
    id,
    sourceType,
    sourceId,
    hardwareKind: normalizeHardwareKind(value.hardwareKind, template?.kind),
    x: clampNodeX(numberOrFallback(value.x, 48), w),
    y: clampNodeY(numberOrFallback(value.y, 68), h),
    w,
    h,
    visualKind
  };
}

function normalizePorts(value: unknown, nodes: RobotAssemblyNode[], context: RobotAssemblyContext): RobotAssemblyPort[] {
  const rawPorts: Record<string, unknown>[] = Array.isArray(value) ? value.filter(isObject) : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of rawPorts) {
    const id = cleanText(item.id, "");
    if (id) {
      byId.set(id, item);
    }
  }
  const ports: RobotAssemblyPort[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const defaultPort of portsForNode(node, context, rawPorts)) {
      const persisted = byId.get(defaultPort.id);
      const next = normalizePort({ ...defaultPort, ...(persisted ?? {}) }, node);
      if (!next || seen.has(next.id)) {
        continue;
      }
      seen.add(next.id);
      ports.push(next);
    }
  }
  return ports;
}

function portsForNode(node: RobotAssemblyNode, context: RobotAssemblyContext, rawPorts: Record<string, unknown>[]): RobotAssemblyPort[] {
  if (node.sourceType === "hardware") {
    const template = hardwareTemplate(node.sourceId);
    return (template?.ports ?? []).map((item) => materializePort(node, item));
  }
  if (node.sourceType === "plugin") {
    const plugin = context.pluginInstances.find((item) => item.id === node.sourceId);
    if (!plugin) {
      return [];
    }
    return pluginPorts(node, plugin);
  }
  const component = context.components.find((item) => item.id === node.sourceId);
  const motors = component ? pluginInstancesToMotorProfiles(effectivePluginInstancesForComponent(component, context.pluginInstances)) : [];
  const servos = component ? pluginInstancesToServoProfiles(effectivePluginInstancesForComponent(component, context.pluginInstances)) : [];
  const base = [
    materializePort(node, port("PWR", "PWR", "power", "power", "left", 0, 46)),
    materializePort(node, port("GND", "GND", "ground", "power", "left", 0, 82, "0V", true)),
    materializePort(node, port("DATA", "DATA", "signal", "bidirectional", "right", node.w, 64))
  ];
  if (motors.length > 0) {
    base.push(materializePort(node, port("MOTOR_BUS", "Motor bus", "pwm", "in", "right", node.w, 104)));
  }
  if (servos.length > 0 || component?.kind === "robot-arm") {
    base.push(materializePort(node, port("SERVO_BUS", "Servo bus", "servo-bus", "bidirectional", "right", node.w, 128)));
  }
  for (const raw of rawPorts) {
    if (raw.nodeId === node.id && cleanText(raw.id, "").startsWith(`${node.id}:custom:`)) {
      const normalized = normalizePort(raw, node);
      if (normalized) {
        base.push(normalized);
      }
    }
  }
  return base;
}

function pluginPorts(node: RobotAssemblyNode, plugin: PluginInstance): RobotAssemblyPort[] {
  if (plugin.type === "motor") {
    const channel = pluginInstancesToMotorProfiles([plugin])[0]?.channel ?? String(plugin.config.channel ?? "M1");
    return [
      materializePort(node, port("PWR", "PWR", "power", "power", "left", 0, 44)),
      materializePort(node, port("GND", "GND", "ground", "power", "left", 0, 82, "0V", true)),
      materializePort(node, port("PWM", `${normalizeMotorChannel(channel)} PWM`, "pwm", "in", "right", node.w, 48)),
      materializePort(node, port("DIR", `${normalizeMotorChannel(channel)} DIR`, "gpio", "in", "right", node.w, 86)),
      materializePort(node, port("FEEDBACK", "Feedback", "signal", "out", "right", node.w, 124))
    ];
  }
  if (plugin.type === "servo") {
    return [
      materializePort(node, port("PWR", "Servo PWR", "power", "power", "left", 0, 44)),
      materializePort(node, port("GND", "GND", "ground", "power", "left", 0, 82, "0V", true)),
      materializePort(node, port("BUS", pluginInstanceDeviceId(plugin), "servo-bus", "bidirectional", "right", node.w, 72))
    ];
  }
  if (plugin.type === "raspberry-pi") {
    return portsForNode({ ...node, sourceType: "hardware", sourceId: "hardware.raspberry-pi", hardwareKind: "raspberry-pi" }, { robot: {} as RobotDefinition, components: [], pluginInstances: [] }, []);
  }
  return [
    materializePort(node, port("IN", "IN", "signal", "in", "left", 0, 58)),
    materializePort(node, port("OUT", "OUT", "signal", "out", "right", node.w, 58)),
    materializePort(node, port("GND", "GND", "ground", "power", "bottom", 70, node.h, "0V"))
  ];
}

function normalizePort(value: unknown, node: RobotAssemblyNode): RobotAssemblyPort | null {
  if (!isObject(value)) {
    return null;
  }
  const id = cleanText(value.id, "");
  if (!id) {
    return null;
  }
  return {
    id,
    nodeId: node.id,
    name: cleanText(value.name, lastSegment(id, ":")),
    label: cleanText(value.label, cleanText(value.name, id)),
    kind: normalizePortKind(value.kind),
    direction: normalizePortDirection(value.direction),
    side: value.side === "left" || value.side === "right" || value.side === "top" || value.side === "bottom" ? value.side : "right",
    x: clamp(numberOrFallback(value.x, node.w), 0, node.w),
    y: clamp(numberOrFallback(value.y, node.h / 2), 0, node.h),
    voltage: optionalText(value.voltage),
    required: value.required === true
  };
}

function normalizeEdges(value: unknown, nodeIds: Set<string>, portIds: Set<string>, ports: RobotAssemblyPort[], harnesses: RobotAssemblyHarness[]): RobotAssemblyEdge[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const edges: RobotAssemblyEdge[] = [];
  const portById = new Map(ports.map((portItem) => [portItem.id, portItem]));
  const harnessIds = new Set(harnesses.map((harness) => harness.id));
  for (const item of value) {
    if (!isObject(item)) {
      continue;
    }
    let fromPortId = optionalText(item.fromPortId);
    let toPortId = optionalText(item.toPortId);
    const legacyFromNodeId = cleanText(item.fromNodeId, "");
    const legacyToNodeId = cleanText(item.toNodeId, "");
    if ((!fromPortId || !toPortId) && nodeIds.has(legacyFromNodeId) && nodeIds.has(legacyToNodeId)) {
      fromPortId = findPortForConnection({ nodes: [], ports, edges: [] }, legacyFromNodeId, "out")?.id;
      toPortId = findPortForConnection({ nodes: [], ports, edges: [] }, legacyToNodeId, "in")?.id;
    }
    if (!fromPortId || !toPortId || !portIds.has(fromPortId) || !portIds.has(toPortId) || fromPortId === toPortId) {
      continue;
    }
    const from = portById.get(fromPortId)!;
    const to = portById.get(toPortId)!;
    const pairKey = `${fromPortId}->${toPortId}`;
    if (seen.has(pairKey)) {
      continue;
    }
    seen.add(pairKey);
    const kind = cleanText(item.kind, inferEdgeKind(from, to));
    edges.push({
      id: cleanText(item.id, `edge:${pairKey}`),
      fromNodeId: from.nodeId,
      toNodeId: to.nodeId,
      fromPortId,
      toPortId,
      kind,
      label: cleanText(item.label, defaultEdgeLabel(kind, from, to, item)),
      serialName: optionalText(item.serialName),
      baudRate: numberOrNull(item.baudRate) ?? undefined,
      protocol: optionalText(item.protocol),
      voltage: optionalText(item.voltage ?? from.voltage ?? to.voltage),
      harnessId: harnessIds.has(String(item.harnessId)) ? String(item.harnessId) : undefined,
      hidden: item.hidden === true
    });
  }
  return edges;
}

function normalizeHarnesses(value: unknown): RobotAssemblyHarness[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const harnesses: RobotAssemblyHarness[] = [];
  for (const item of value) {
    if (!isObject(item)) {
      continue;
    }
    const id = cleanText(item.id, "");
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    harnesses.push({
      id,
      name: cleanText(item.name, id),
      color: cleanText(item.color, DEFAULT_HARNESS_COLORS[harnesses.length % DEFAULT_HARNESS_COLORS.length]),
      hidden: item.hidden === true
    });
  }
  return harnesses;
}

function normalizeControlMappings(value: unknown): RobotControlMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(isObject)
    .map((item, index) => ({
      id: cleanText(item.id, `mapping:${index + 1}`),
      label: cleanText(item.label, "Mapping"),
      sourceId: optionalText(item.sourceId),
      targetNodeId: optionalText(item.targetNodeId),
      action: optionalText(item.action),
      enabled: item.enabled === true
    }));
}

function normalizeActionButton(value: Record<string, unknown>, index: number, validPluginIds: Set<string>): RobotActionButton {
  return {
    id: cleanText(value.id, `button:${index + 1}`),
    name: cleanText(value.name, `Action ${index + 1}`),
    color: cleanText(value.color, DEFAULT_HARNESS_COLORS[index % DEFAULT_HARNESS_COLORS.length]),
    icon: cleanText(value.icon, "spark"),
    confirmRequired: value.confirmRequired !== false,
    timeoutMs: clampInteger(value.timeoutMs, 1000, 60000, 8000),
    steps: normalizeActionSteps(value.steps, validPluginIds)
  };
}

function normalizeActionSteps(value: unknown, validPluginIds: Set<string>): RobotActionButtonStep[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isObject).map((item, index) => {
    const kind = normalizeActionStepKind(item.kind);
    const pluginInstanceId = optionalText(item.pluginInstanceId);
    const step: RobotActionButtonStep = {
      id: cleanText(item.id, `step:${index + 1}`),
      kind,
      label: cleanText(item.label, kind)
    };
    if (pluginInstanceId && validPluginIds.has(pluginInstanceId)) {
      step.pluginInstanceId = pluginInstanceId;
    }
    if (kind === "servo.move") {
      step.angleDeg = clamp(numberOrFallback(item.angleDeg, 90), 0, 360);
      step.speedRaw = clampInteger(item.speedRaw, 0, 4095, 600);
      step.acc = clampInteger(item.acc, 0, 254, 30);
    } else if (kind === "motor.set") {
      step.speedPercent = clampInteger(item.speedPercent, -100, 100, 0);
    } else if (kind === "motor.stop") {
      step.stopMode = item.stopMode === "brake" ? "brake" : "coast";
    } else if (kind === "wait") {
      step.durationMs = clampInteger(item.durationMs, 0, 60000, 300);
    } else if (kind === "parallel") {
      step.steps = normalizeActionSteps(item.steps, validPluginIds);
    }
    return step;
  }).filter((step) => step.kind === "wait" || step.kind === "parallel" || Boolean(step.pluginInstanceId));
}

function normalizeActionStepKind(value: unknown): RobotActionButtonStep["kind"] {
  return value === "servo.move" || value === "motor.set" || value === "motor.stop" || value === "wait" || value === "parallel" ? value : "wait";
}

function findPortForConnection(assembly: Pick<RobotAssemblyConfig, "nodes" | "ports" | "edges">, id: string, role: "in" | "out"): RobotAssemblyPort | undefined {
  const ports = assembly.ports ?? [];
  const direct = ports.find((portItem) => portItem.id === id);
  if (direct) {
    return direct;
  }
  const nodePorts = ports.filter((portItem) => portItem.nodeId === id);
  const preferred = role === "out"
    ? nodePorts.find((portItem) => portItem.direction === "out" || portItem.direction === "bidirectional" || portItem.direction === "power")
    : nodePorts.find((portItem) => portItem.direction === "in" || portItem.direction === "bidirectional" || portItem.direction === "power");
  return preferred ?? nodePorts[0];
}

function inferEdgeKind(from: RobotAssemblyPort, to: RobotAssemblyPort): string {
  if (isUartPort(from) || isUartPort(to)) {
    return "uart";
  }
  if (from.kind === "ground" || to.kind === "ground" || from.kind === "power" || to.kind === "power") {
    return "power";
  }
  if (from.kind === "can" || to.kind === "can") {
    return "can";
  }
  if (from.kind === "pwm" || to.kind === "pwm") {
    return "pwm";
  }
  if (from.kind === "servo-bus" || to.kind === "servo-bus") {
    return "servo-bus";
  }
  return "signal";
}

function defaultEdgeLabel(kind: string, from: RobotAssemblyPort, to: RobotAssemblyPort, source: Record<string, unknown> = {}): string {
  const serialName = optionalText(source.serialName);
  const baudRate = numberOrNull(source.baudRate);
  if (serialName && baudRate) {
    return `${serialName} @${baudRate}`;
  }
  if (serialName) {
    return serialName;
  }
  const voltage = optionalText(source.voltage ?? from.voltage ?? to.voltage);
  if (kind === "power" && voltage) {
    return voltage;
  }
  if (kind === "pwm") {
    return `${from.label} -> ${to.label}`;
  }
  return kind.toUpperCase();
}

function normalizeVisualKind(value: unknown, fallback: RobotAssemblyVisualKind): RobotAssemblyVisualKind {
  return value === "component" || value === "plugin" || value === "robot-arm" || value === "tracked-base" || value === "hardware-board" || value === "motor-driver" || value === "power-module" ? value : fallback;
}

function normalizeHardwareKind(value: unknown, fallback?: RobotAssemblyHardwareKind): RobotAssemblyHardwareKind | undefined {
  return value === "esp32" || value === "robomaster-a" || value === "raspberry-pi" || value === "tb6612" || value === "tb6618" || value === "power-module" ? value : fallback;
}

function normalizePortKind(value: unknown): RobotAssemblyPortKind {
  return value === "uart-tx" || value === "uart-rx" || value === "uart" || value === "can" || value === "pwm" || value === "gpio" || value === "power" || value === "ground" || value === "usb" || value === "servo-bus" || value === "signal" ? value : "signal";
}

function normalizePortDirection(value: unknown): RobotAssemblyPortDirection {
  return value === "in" || value === "out" || value === "bidirectional" || value === "power" ? value : "bidirectional";
}

function port(
  name: string,
  label: string,
  kind: RobotAssemblyPortKind,
  direction: RobotAssemblyPortDirection,
  side: RobotAssemblyPort["side"],
  x: number,
  y: number,
  voltage?: string,
  required?: boolean
): Omit<RobotAssemblyPort, "id" | "nodeId"> {
  return { name, label, kind, direction, side, x, y, voltage, required };
}

function materializePort(node: RobotAssemblyNode, definition: Omit<RobotAssemblyPort, "id" | "nodeId">): RobotAssemblyPort {
  return {
    ...definition,
    id: `${node.id}:port:${safePortId(definition.name)}`,
    nodeId: node.id
  };
}

function hardwareTemplate(sourceId: string): HardwareTemplate | undefined {
  return ROBOT_ASSEMBLY_HARDWARE_TEMPLATES.find((template) => template.id === sourceId);
}

function isUartPort(portItem: RobotAssemblyPort): boolean {
  return portItem.kind === "uart" || portItem.kind === "uart-tx" || portItem.kind === "uart-rx";
}

function isPowerPort(portItem: RobotAssemblyPort): boolean {
  return portItem.kind === "power" || portItem.kind === "ground";
}

function warning(severity: RobotAssemblyWarning["severity"], targetId: string, message: string): RobotAssemblyWarning {
  return { id: `${severity}:${targetId}:${message}`, severity, targetId, message };
}

function sourceIdLabel(node: RobotAssemblyNode): string {
  return lastSegment(node.sourceId, ".");
}

function lastSegment(value: string, separator: string): string {
  const parts = value.split(separator);
  return parts[parts.length - 1] ?? value;
}

function normalizeVoltage(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "") : "";
}

function uniqueEdgeId(baseId: string, edges: RobotAssemblyEdge[]): string {
  const seen = new Set(edges.map((edge) => edge.id));
  let id = baseId;
  let index = 2;
  while (seen.has(id)) {
    id = `${baseId}:${index}`;
    index += 1;
  }
  return id;
}

function safePortId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "port";
}

function clampNodeX(value: number, width: number): number {
  return clamp(Math.round(value), 0, ROBOT_ASSEMBLY_CANVAS_WIDTH - width);
}

function clampNodeY(value: number, height: number): number {
  return clamp(Math.round(value), 0, ROBOT_ASSEMBLY_CANVAS_HEIGHT - height);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? clamp(numeric, min, max) : fallback;
}

function numberOrFallback(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function numberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueNodeId(baseId: string, seenNodeIds: Set<string>): string {
  let id = baseId;
  let index = 2;
  while (seenNodeIds.has(id)) {
    id = `${baseId}:${index}`;
    index += 1;
  }
  return id;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
