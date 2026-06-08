import { clamp, normalizeMotorChannel } from "@adapters/hardware/protocol";
import { createDefaultArmConfig, normalizeArmConfig } from "@adapters/persistence/storage";
import { createPlatformCommand, type PlatformCommand } from "@platform/commands";
import type {
  ComponentDefinition,
  PluginInstance,
  RobotProgram
} from "@platform/architecture";
import {
  effectivePluginInstancesForComponent,
  effectivePluginInstancesForRobot,
  pluginInstanceDeviceId,
  pluginInstancesToMotorProfiles,
  pluginInstancesToServoProfiles
} from "@platform/architecture";
import type { DeviceStateSnapshot } from "@platform/types";
import { validateWorkflow, type WorkflowDefinition, type WorkflowEdge, type WorkflowNode } from "@platform/workflow";
import type { RobotAssemblyContext, RobotAssemblyStatusContext } from "@domains/robot-assembly/robotAssembly";

export const ROBOT_PROGRAM_DEFAULT_TIMEOUT_MS = 12_000;

export type RobotProgramCompileSeverity = "warning" | "error";

export interface RobotProgramCompileIssue {
  severity: RobotProgramCompileSeverity;
  message: string;
  blockId?: string;
}

export interface RobotProgramBlockSnapshot {
  id: string;
  type: string;
  fields?: Record<string, string | number | boolean | null | undefined>;
  inputs?: Record<string, RobotProgramBlockSnapshot | null | undefined>;
  next?: RobotProgramBlockSnapshot | null;
}

export interface RobotProgramCompileResult {
  workflow: WorkflowDefinition;
  previewLines: string[];
  issues: RobotProgramCompileIssue[];
  commandCount: number;
  blocked: boolean;
}

interface ProgramInstructionBase {
  id: string;
  label: string;
}

interface CommandInstruction extends ProgramInstructionBase {
  kind: "command";
  command: PlatformCommand;
}

interface DelayInstruction extends ProgramInstructionBase {
  kind: "delay";
  ms: number;
}

interface LogInstruction extends ProgramInstructionBase {
  kind: "log";
  message: string;
}

interface ConditionInstruction extends ProgramInstructionBase {
  kind: "condition";
  deviceId: string;
  field: string;
  equals: string | number | boolean;
  instructions: RobotProgramInstruction[];
}

type RobotProgramInstruction = CommandInstruction | DelayInstruction | LogInstruction | ConditionInstruction;

export interface RobotProgramBlockOption {
  label: string;
  value: string;
}

export interface RobotProgramBlockOptions {
  motors: RobotProgramBlockOption[];
  servos: RobotProgramBlockOption[];
  armComponents: RobotProgramBlockOption[];
  cameras: RobotProgramBlockOption[];
  conditionDevices: RobotProgramBlockOption[];
}

export const ROBOT_PROGRAM_BLOCK_FIELDS: Record<string, string[]> = {
  robot_motor_set: ["PLUGIN", "SPEED", "STOP_MODE"],
  robot_motor_stop: ["PLUGIN", "STOP_MODE"],
  robot_servo_move: ["PLUGIN", "ANGLE", "SPEED", "ACC"],
  robot_arm_pose: ["COMPONENT"],
  robot_camera_gimbal: ["TARGET", "PAN", "TILT"],
  robot_wait: ["MS"],
  robot_log: ["MESSAGE"],
  robot_repeat: ["COUNT"],
  robot_if_state: ["DEVICE", "FIELD", "EQUALS"],
  robot_emergency_stop: []
};

export function createDefaultRobotProgram(index = 0): RobotProgram {
  const id = `program:${index + 1}`;
  const name = `Program ${index + 1}`;
  return {
    id,
    name,
    target: "pc",
    blocklyWorkspaceJson: createDefaultRobotProgramWorkspaceJson(),
    workflow: createEmptyWorkflow(id, name),
    timeoutMs: ROBOT_PROGRAM_DEFAULT_TIMEOUT_MS
  };
}

export function createDefaultRobotProgramWorkspaceJson(): Record<string, unknown> {
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "robot_program_start",
          id: "robot-program-start",
          x: 24,
          y: 24
        }
      ]
    }
  };
}

export function normalizeRobotPrograms(value: unknown): RobotProgram[] {
  const raw = Array.isArray(value) ? value : [];
  const seenIds = new Set<string>();
  const programs = raw
    .filter(isObject)
    .map((item, index) => normalizeRobotProgram(item, index, seenIds));
  return programs.length > 0 ? programs : [createDefaultRobotProgram(0)];
}

export function createRobotProgramBlockOptions(context: RobotAssemblyContext): RobotProgramBlockOptions {
  const effectivePlugins = effectivePluginInstancesForRobot(context.robot, context.components, context.pluginInstances);
  const motors = effectivePlugins
    .filter((plugin) => plugin.type === "motor" && pluginInstancesToMotorProfiles([plugin]).length > 0)
    .map((plugin) => option(plugin.name, plugin.id));
  const servos = effectivePlugins
    .filter((plugin) => plugin.type === "servo" && pluginInstancesToServoProfiles([plugin]).length > 0)
    .map((plugin) => option(plugin.name, plugin.id));
  const armComponents = context.robot.componentIds
    .map((componentId) => context.components.find((component) => component.id === componentId))
    .filter((component): component is ComponentDefinition => Boolean(component && component.kind === "robot-arm"))
    .map((component) => option(component.name, component.id));
  const cameras = effectivePlugins
    .filter((plugin) => plugin.type === "camera")
    .map((plugin) => option(plugin.name, "camera:main"));
  const conditionDevices = [
    ...motors.map((item) => option(`Motor ${item.label}`, deviceIdForPluginValue(item.value, context.pluginInstances))),
    ...servos.map((item) => option(`Servo ${item.label}`, deviceIdForPluginValue(item.value, context.pluginInstances))),
    ...armComponents.map((item) => option(`Arm ${item.label}`, `robot-arm:${item.value}`)),
    option("Raspberry Pi", "pi:main"),
    option("Main camera", "camera:main")
  ].filter((item) => item.value.trim());

  return {
    motors: withEmptyOption(motors, "No motor"),
    servos: withEmptyOption(servos, "No servo"),
    armComponents: withEmptyOption(armComponents, "No robot arm"),
    cameras: withEmptyOption(dedupeOptions(cameras.length > 0 ? cameras : [option("Main camera", "camera:main")]), "No camera"),
    conditionDevices: withEmptyOption(dedupeOptions(conditionDevices), "No device")
  };
}

export function compileRobotProgramFromBlocks(
  program: Pick<RobotProgram, "id" | "name">,
  root: RobotProgramBlockSnapshot | null | undefined,
  context: RobotAssemblyContext
): RobotProgramCompileResult {
  const issues: RobotProgramCompileIssue[] = [];
  const start = root?.type === "robot_program_start" ? root.inputs?.DO ?? null : root ?? null;
  const instructions = compileStatementChain(start, context, issues, 0);
  if (instructions.length === 0) {
    issues.push({ severity: "warning", message: "Program has no executable blocks." });
  }
  const workflow = createWorkflowFromInstructions(program.id, program.name, instructions);
  const validation = validateWorkflow(workflow);
  if (validation) {
    issues.push({ severity: "error", message: validation });
  }
  const previewLines = previewInstructions(instructions);
  return {
    workflow,
    previewLines,
    issues,
    commandCount: countCommands(instructions),
    blocked: issues.some((issue) => issue.severity === "error")
  };
}

export function createRobotProgramRuntimeState(context: RobotAssemblyContext, status: RobotAssemblyStatusContext = {}): Record<string, DeviceStateSnapshot> {
  const state: Record<string, DeviceStateSnapshot> = {};
  const updatedAt = Date.now();
  for (const plugin of effectivePluginInstancesForRobot(context.robot, context.components, context.pluginInstances)) {
    const deviceId = pluginInstanceDeviceId(plugin);
    if (plugin.type === "motor") {
      const channel = normalizeMotorChannel(String(plugin.config.channel ?? ""));
      const feedback = status.motorFeedback?.[channel] ?? Object.values(status.motorFeedback ?? {}).find((item) => normalizeMotorChannel(String(item.channel ?? "")) === channel);
      const driveTarget = status.driveTargets?.find((target) => normalizeMotorChannel(target.channel) === channel);
      state[deviceId] = {
        deviceId,
        status: feedback || driveTarget ? "online" : "standby",
        values: {
          channel,
          commandedSpeedPercent: feedback?.commandedSpeedPercent ?? driveTarget?.speedPercent ?? null,
          dutyPercent: feedback?.dutyPercent ?? null
        },
        updatedAt
      };
    } else if (plugin.type === "servo") {
      const servo = pluginInstancesToServoProfiles([plugin])[0];
      const feedback = servo ? status.servoFeedback?.[servo.id] : undefined;
      state[deviceId] = {
        deviceId,
        status: feedback ? "online" : "standby",
        values: {
          servoId: servo?.id ?? null,
          moving: feedback?.moving ?? null,
          positionRaw: feedback?.positionRaw ?? null
        },
        updatedAt
      };
    } else {
      state[deviceId] = {
        deviceId,
        status: "standby",
        values: {},
        updatedAt
      };
    }
  }
  for (const componentId of context.robot.componentIds) {
    const component = context.components.find((item) => item.id === componentId);
    if (component?.kind === "robot-arm") {
      state[`robot-arm:${component.id}`] = {
        deviceId: `robot-arm:${component.id}`,
        status: "standby",
        values: {
          jointCount: currentArmConfigForComponent(component, context.pluginInstances).joints.length
        },
        updatedAt
      };
    }
  }
  state["pi:main"] = {
    deviceId: "pi:main",
    status: status.piConnectionReady ? "online" : status.piHelperReady ? "standby" : "offline",
    values: {
      helperReady: status.piHelperReady ?? false,
      connectionReady: status.piConnectionReady ?? false
    },
    updatedAt
  };
  state["camera:main"] = {
    deviceId: "camera:main",
    status: "standby",
    values: {},
    updatedAt
  };
  return state;
}

function normalizeRobotProgram(value: Record<string, unknown>, index: number, seenIds: Set<string>): RobotProgram {
  const fallback = createDefaultRobotProgram(index);
  const rawId = stringField(value.id, fallback.id);
  const id = uniqueId(rawId, seenIds);
  seenIds.add(id);
  const name = stringField(value.name, fallback.name);
  const workflow = normalizeWorkflow(value.workflow, id, name);
  return {
    id,
    name,
    target: "pc",
    blocklyWorkspaceJson: isObject(value.blocklyWorkspaceJson) ? value.blocklyWorkspaceJson : fallback.blocklyWorkspaceJson,
    workflow,
    timeoutMs: clampInteger(Number(value.timeoutMs), 500, 120_000, ROBOT_PROGRAM_DEFAULT_TIMEOUT_MS),
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : undefined
  };
}

function normalizeWorkflow(value: unknown, id: string, name: string): WorkflowDefinition {
  if (!isObject(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return createEmptyWorkflow(id, name);
  }
  const workflow = {
    id: stringField(value.id, `workflow:${id}`),
    name: stringField(value.name, name),
    nodes: value.nodes as WorkflowNode[],
    edges: value.edges as WorkflowEdge[]
  };
  return validateWorkflow(workflow) ? createEmptyWorkflow(id, name) : workflow;
}

function createEmptyWorkflow(programId: string, name: string): WorkflowDefinition {
  return {
    id: `workflow:${programId}`,
    name,
    nodes: [{ id: `${programId}:start`, kind: "event", label: "Start" }],
    edges: []
  };
}

function compileStatementChain(
  block: RobotProgramBlockSnapshot | null | undefined,
  context: RobotAssemblyContext,
  issues: RobotProgramCompileIssue[],
  depth: number
): RobotProgramInstruction[] {
  if (!block || depth > 8) {
    if (depth > 8) {
      issues.push({ severity: "error", message: "Program nesting is too deep.", blockId: block?.id });
    }
    return [];
  }
  const instructions: RobotProgramInstruction[] = [];
  const seen = new Set<string>();
  let current: RobotProgramBlockSnapshot | null | undefined = block;
  while (current) {
    if (seen.has(current.id)) {
      issues.push({ severity: "error", message: "Block chain cycle detected.", blockId: current.id });
      break;
    }
    seen.add(current.id);
    instructions.push(...compileBlock(current, context, issues, depth));
    current = current.next;
  }
  return instructions;
}

function compileBlock(
  block: RobotProgramBlockSnapshot,
  context: RobotAssemblyContext,
  issues: RobotProgramCompileIssue[],
  depth: number
): RobotProgramInstruction[] {
  if (block.type === "robot_wait") {
    const ms = clampInteger(numberField(block, "MS", 500), 0, 60_000, 500);
    return [{ id: block.id, kind: "delay", label: `Wait ${ms} ms`, ms }];
  }
  if (block.type === "robot_log") {
    const message = stringField(block.fields?.MESSAGE, "Program checkpoint");
    return [{ id: block.id, kind: "log", label: message, message }];
  }
  if (block.type === "robot_repeat") {
    const count = clampInteger(numberField(block, "COUNT", 2), 1, 12, 2);
    const body = compileStatementChain(block.inputs?.DO, context, issues, depth + 1);
    return Array.from({ length: count }, (_, index) => body.map((instruction) => cloneInstruction(instruction, `${block.id}:repeat-${index + 1}`))).flat();
  }
  if (block.type === "robot_if_state") {
    const deviceId = stringField(block.fields?.DEVICE, "");
    const field = stringField(block.fields?.FIELD, "status");
    if (!deviceId) {
      issues.push({ severity: "error", message: "Condition block requires a device.", blockId: block.id });
      return [];
    }
    return [{
      id: block.id,
      kind: "condition",
      label: `If ${deviceId}.${field}`,
      deviceId,
      field,
      equals: parseConditionValue(block.fields?.EQUALS),
      instructions: compileStatementChain(block.inputs?.DO, context, issues, depth + 1)
    }];
  }
  if (block.type === "robot_motor_set") {
    const plugin = pluginById(context, stringField(block.fields?.PLUGIN, ""), "motor");
    if (!plugin) {
      issues.push({ severity: "error", message: "Motor speed block requires a valid motor plugin.", blockId: block.id });
      return [];
    }
    const speedPercent = clamp(Math.round(numberField(block, "SPEED", 0)), -100, 100);
    const stopMode = stopModeField(block);
    return [commandInstruction(block, `${plugin.name} -> ${speedPercent}%`, createPlatformCommand("motor.set_speed", pluginInstanceDeviceId(plugin), { speedPercent, stopMode }))];
  }
  if (block.type === "robot_motor_stop") {
    const plugin = pluginById(context, stringField(block.fields?.PLUGIN, ""), "motor");
    if (!plugin) {
      issues.push({ severity: "error", message: "Motor stop block requires a valid motor plugin.", blockId: block.id });
      return [];
    }
    const stopMode = stopModeField(block);
    return [commandInstruction(block, `${plugin.name} stop ${stopMode}`, createPlatformCommand("motor.stop", pluginInstanceDeviceId(plugin), { stopMode }))];
  }
  if (block.type === "robot_servo_move") {
    const plugin = pluginById(context, stringField(block.fields?.PLUGIN, ""), "servo");
    if (!plugin) {
      issues.push({ severity: "error", message: "Servo move block requires a valid servo plugin.", blockId: block.id });
      return [];
    }
    const angleDeg = clamp(Math.round(numberField(block, "ANGLE", 90)), 0, 360);
    const speedRaw = clampInteger(numberField(block, "SPEED", 600), 0, 4095, 600);
    const acc = clampInteger(numberField(block, "ACC", 30), 0, 254, 30);
    return [commandInstruction(block, `${plugin.name} -> ${angleDeg} deg`, createPlatformCommand("servo.set_position", pluginInstanceDeviceId(plugin), { angleDeg, speedRaw, acc }))];
  }
  if (block.type === "robot_arm_pose") {
    const component = armComponentById(context, stringField(block.fields?.COMPONENT, ""));
    if (!component) {
      issues.push({ severity: "error", message: "Arm pose block requires a valid robot-arm component.", blockId: block.id });
      return [];
    }
    const servos = pluginInstancesToServoProfiles(effectivePluginInstancesForComponent(component, context.pluginInstances));
    const config = currentArmConfigForComponent(component, context.pluginInstances);
    return [commandInstruction(block, `${component.name} pose`, createPlatformCommand("robot-arm.set_pose", `robot-arm:${component.id}`, { joints: config.joints, live: false, servos }))];
  }
  if (block.type === "robot_camera_gimbal") {
    const targetDeviceId = stringField(block.fields?.TARGET, "camera:main") || "camera:main";
    const panAngleDeg = clamp(Math.round(numberField(block, "PAN", 180)), 0, 360);
    const tiltAngleDeg = clamp(Math.round(numberField(block, "TILT", 180)), 0, 360);
    return [commandInstruction(block, `Camera gimbal ${panAngleDeg}/${tiltAngleDeg}`, createPlatformCommand("camera.set_gimbal", targetDeviceId, { panAngleDeg, tiltAngleDeg }))];
  }
  if (block.type === "robot_emergency_stop") {
    const commands = emergencyStopCommands(block, context);
    if (commands.length === 0) {
      issues.push({ severity: "warning", message: "Emergency stop has no motor or arm target.", blockId: block.id });
    }
    return commands;
  }
  if (block.type !== "robot_program_start") {
    issues.push({ severity: "warning", message: `Unsupported block ignored: ${block.type}`, blockId: block.id });
  }
  return [];
}

function createWorkflowFromInstructions(programId: string, name: string, instructions: RobotProgramInstruction[]): WorkflowDefinition {
  const nodes: WorkflowNode[] = [{ id: `${programId}:start`, kind: "event", label: "Start" }];
  const edges: WorkflowEdge[] = [];
  const usedIds = new Set(nodes.map((node) => node.id));
  appendInstructions(instructions, `${programId}:start`, nodes, edges, usedIds);
  return { id: `workflow:${programId}`, name, nodes, edges };
}

function appendInstructions(
  instructions: RobotProgramInstruction[],
  fromId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  usedIds: Set<string>,
  firstWhen?: WorkflowEdge["when"]
): string {
  let previous = fromId;
  instructions.forEach((instruction, index) => {
    if (instruction.kind === "condition") {
      const conditionId = uniqueNodeId(instruction.id, usedIds);
      nodes.push({
        id: conditionId,
        kind: "condition",
        label: instruction.label,
        config: { source: "state", deviceId: instruction.deviceId, field: instruction.field, equals: instruction.equals }
      });
      edges.push({ from: previous, to: conditionId, ...(index === 0 && firstWhen ? { when: firstWhen } : {}) });
      const joinId = uniqueNodeId(`${instruction.id}:join`, usedIds);
      nodes.push({ id: joinId, kind: "noop", label: "End if" });
      if (instruction.instructions.length > 0) {
        const branchLast = appendInstructions(instruction.instructions, conditionId, nodes, edges, usedIds, "true");
        edges.push({ from: branchLast, to: joinId });
      } else {
        edges.push({ from: conditionId, to: joinId, when: "true" });
      }
      edges.push({ from: conditionId, to: joinId, when: "false" });
      previous = joinId;
      return;
    }
    const nodeId = uniqueNodeId(instruction.id, usedIds);
    const node = instructionToWorkflowNode(instruction, nodeId);
    nodes.push(node);
    edges.push({ from: previous, to: nodeId, ...(index === 0 && firstWhen ? { when: firstWhen } : {}) });
    previous = nodeId;
  });
  return previous;
}

function instructionToWorkflowNode(instruction: Exclude<RobotProgramInstruction, ConditionInstruction>, id: string): WorkflowNode {
  if (instruction.kind === "command") {
    return { id, kind: "command", label: instruction.label, config: { command: instruction.command } };
  }
  if (instruction.kind === "delay") {
    return { id, kind: "delay", label: instruction.label, config: { ms: instruction.ms } };
  }
  return { id, kind: "log", label: instruction.label, config: { message: instruction.message } };
}

function emergencyStopCommands(block: RobotProgramBlockSnapshot, context: RobotAssemblyContext): RobotProgramInstruction[] {
  const instructions: RobotProgramInstruction[] = [];
  const effectivePlugins = effectivePluginInstancesForRobot(context.robot, context.components, context.pluginInstances);
  for (const plugin of effectivePlugins.filter((item) => item.type === "motor")) {
    instructions.push(commandInstruction(
      { ...block, id: `${block.id}:motor:${plugin.id}` },
      `${plugin.name} emergency stop`,
      createPlatformCommand("motor.stop", pluginInstanceDeviceId(plugin), { stopMode: "brake" })
    ));
  }
  for (const componentId of context.robot.componentIds) {
    const component = armComponentById(context, componentId);
    if (component) {
      const config = currentArmConfigForComponent(component, context.pluginInstances);
      const servos = pluginInstancesToServoProfiles(effectivePluginInstancesForComponent(component, context.pluginInstances));
      instructions.push(commandInstruction(
        { ...block, id: `${block.id}:arm:${component.id}` },
        `${component.name} pause`,
        createPlatformCommand("robot-arm.pause", `robot-arm:${component.id}`, { joints: config.joints, servos })
      ));
    }
  }
  return instructions;
}

function commandInstruction(block: Pick<RobotProgramBlockSnapshot, "id">, label: string, command: PlatformCommand): CommandInstruction {
  return { id: block.id, kind: "command", label, command };
}

function previewInstructions(instructions: RobotProgramInstruction[], prefix = ""): string[] {
  return instructions.flatMap((instruction) => {
    if (instruction.kind === "condition") {
      return [
        `${prefix}If ${instruction.deviceId}.${instruction.field} == ${String(instruction.equals)}`,
        ...previewInstructions(instruction.instructions, `${prefix}  `)
      ];
    }
    return [`${prefix}${instruction.label}`];
  });
}

function countCommands(instructions: RobotProgramInstruction[]): number {
  return instructions.reduce((total, instruction) => total + (instruction.kind === "command" ? 1 : instruction.kind === "condition" ? countCommands(instruction.instructions) : 0), 0);
}

function cloneInstruction(instruction: RobotProgramInstruction, prefix: string): RobotProgramInstruction {
  if (instruction.kind === "condition") {
    return {
      ...instruction,
      id: `${prefix}:${instruction.id}`,
      instructions: instruction.instructions.map((child) => cloneInstruction(child, prefix))
    };
  }
  return { ...instruction, id: `${prefix}:${instruction.id}` };
}

function currentArmConfigForComponent(component: ComponentDefinition, pluginInstances: PluginInstance[]) {
  const servos = pluginInstancesToServoProfiles(effectivePluginInstancesForComponent(component, pluginInstances));
  const saved = component.config?.armConfig;
  const normalized = saved ? normalizeArmConfig(saved, servos) : createDefaultArmConfig(servos);
  return normalized.joints.length === 0 && servos.length > 0 ? createDefaultArmConfig(servos) : normalized;
}

function pluginById(context: RobotAssemblyContext, pluginId: string, type: PluginInstance["type"]): PluginInstance | null {
  const plugin = effectivePluginInstancesForRobot(context.robot, context.components, context.pluginInstances).find((item) => item.id === pluginId);
  return plugin?.type === type ? plugin : null;
}

function armComponentById(context: RobotAssemblyContext, componentId: string): ComponentDefinition | null {
  const component = context.components.find((item) => item.id === componentId && context.robot.componentIds.includes(item.id));
  return component?.kind === "robot-arm" ? component : null;
}

function deviceIdForPluginValue(pluginId: string, pluginInstances: PluginInstance[]): string {
  const plugin = pluginInstances.find((item) => item.id === pluginId);
  return plugin ? pluginInstanceDeviceId(plugin) : "";
}

function numberField(block: RobotProgramBlockSnapshot, field: string, fallback: number): number {
  const value = Number(block.fields?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

function stopModeField(block: RobotProgramBlockSnapshot): "coast" | "brake" {
  return block.fields?.STOP_MODE === "coast" ? "coast" : "brake";
}

function parseConditionValue(value: unknown): string | number | boolean {
  if (value === true || value === false || value === "true" || value === "false") {
    return value === true || value === "true";
  }
  const numberValue = Number(value);
  if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(numberValue)) {
    return stringField(value, "online");
  }
  return numberValue;
}

function option(label: string, value: string): RobotProgramBlockOption {
  return { label, value };
}

function withEmptyOption(options: RobotProgramBlockOption[], label: string): RobotProgramBlockOption[] {
  return options.length > 0 ? options : [option(label, "")];
}

function dedupeOptions(options: RobotProgramBlockOption[]): RobotProgramBlockOption[] {
  const seen = new Set<string>();
  return options.filter((item) => {
    if (seen.has(item.value)) {
      return false;
    }
    seen.add(item.value);
    return true;
  });
}

function uniqueNodeId(base: string, usedIds: Set<string>): string {
  const safe = base.replace(/[^a-zA-Z0-9:_-]/g, "-").slice(0, 80) || "node";
  let candidate = safe;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${safe}:${index}`;
    index += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function uniqueId(base: string, usedIds: Set<string>): string {
  const safe = stringField(base, "program").replace(/\s+/g, "-");
  let candidate = safe;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${safe}-${index}`;
    index += 1;
  }
  return candidate;
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  return Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
