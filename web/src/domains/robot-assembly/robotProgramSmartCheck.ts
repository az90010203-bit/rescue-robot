import type { PlatformCommand } from "@platform/commands";
import { validatePlatformCommand } from "@platform/commands";
import type { RobotAssemblyWarning } from "@platform/architecture";
import type { DeviceStateSnapshot } from "@platform/types";
import type { WorkflowDefinition, WorkflowRunResult } from "@platform/workflow";
import { validateWorkflow } from "@platform/workflow";
import type { RobotProgramCompileIssue } from "@domains/robot-assembly/robotProgram";

export type SmartCheckSeverity = "ok" | "warning" | "danger";

export interface SmartCheckIssue {
  id: string;
  severity: SmartCheckSeverity;
  title: string;
  message: string;
  targetId?: string;
  actionHint?: string;
  blocksRun: boolean;
}

export interface RobotProgramReadinessContext {
  workflow: WorkflowDefinition;
  commandCount: number;
  compileIssues?: RobotProgramCompileIssue[];
  schematicWarnings?: RobotAssemblyWarning[];
  runtimeState?: Record<string, DeviceStateSnapshot>;
  dispatchAvailable?: boolean;
  serialConnected?: boolean;
  timeoutMs?: number;
}

export interface RobotProgramRunResultContext {
  workflow: WorkflowDefinition;
  runResult: WorkflowRunResult;
  runtimeState?: Record<string, DeviceStateSnapshot>;
}

interface WorkflowCommandNode {
  index: number;
  nodeId: string;
  command: PlatformCommand;
}

const CONTROLLER_SERIAL_COMMAND_PREFIXES = ["servo.", "motor.", "robot-arm."] as const;

export function analyzeRobotProgramReadiness(context: RobotProgramReadinessContext): SmartCheckIssue[] {
  const issues: SmartCheckIssue[] = [];
  const commands = workflowCommands(context.workflow);
  const validation = validateWorkflow(context.workflow);

  if (!context.dispatchAvailable) {
    issues.push(danger("runtime.dispatcher-missing", "运行通道未就绪", "当前页面还没有可用的命令发送器，程序无法发给硬件。", undefined, "先等待控制台初始化完成，或切换到支持机器人程序的工作区。"));
  }
  if (context.commandCount <= 0 || commands.length === 0) {
    issues.push(danger("program.no-commands", "没有硬件动作", "这个程序没有可发送的硬件命令。", undefined, "添加电机、舵机、机械臂或云台动作后再运行。"));
  }
  if (validation) {
    issues.push(danger("workflow.invalid", "程序结构无效", validation, undefined, "保存或重新整理积木结构后再运行。"));
  }

  for (const issue of context.compileIssues ?? []) {
    if (issue.severity === "error") {
      issues.push(danger(`compile.${issue.blockId ?? issue.message}`, "积木编译错误", issue.message, issue.blockId, "修正对应积木后再运行。"));
    } else if (issue.message !== "Program has no executable blocks.") {
      issues.push(warning(`compile.${issue.blockId ?? issue.message}`, "积木提示", issue.message, issue.blockId, "检查预览确认这符合预期。"));
    }
  }

  for (const warningItem of context.schematicWarnings ?? []) {
    const factory = warningItem.severity === "error" ? danger : warning;
    issues.push(factory(`schematic.${warningItem.id}`, "装配图检查", warningItem.message, warningItem.targetId, warningItem.severity === "error" ? "修正装配图错误后再运行。" : "确认接线和共地后再运行。"));
  }

  analyzeTimeout(context, issues);
  analyzeCommands(commands, context, issues);
  analyzeContinuousMotors(commands, issues);

  return dedupeIssues(issues);
}

export function analyzeRobotProgramRunResult(context: RobotProgramRunResultContext): SmartCheckIssue[] {
  const issues: SmartCheckIssue[] = [];
  const commandsById = new Map(workflowCommands(context.workflow).map((item) => [item.command.id, item.command]));

  for (const result of context.runResult.commandResults) {
    if (result.status === "sent") {
      continue;
    }
    const command = commandsById.get(result.commandId);
    const actionHint = result.status === "skipped"
      ? "检查目标设备是否有对应插件或本地 helper。"
      : "先处理失败设备，再重新运行程序。";
    const factory = result.status === "skipped" ? warning : danger;
    issues.push(factory(
      `run.command.${result.commandId}.${result.status}`,
      command ? `${command.type} 未完成` : "命令未完成",
      result.message ?? `命令返回 ${result.status}。`,
      result.deviceId,
      actionHint
    ));
  }

  if (context.runResult.status === "failed" && issues.length === 0) {
    issues.push(danger(
      "run.workflow.failed",
      "程序运行中止",
      context.runResult.message ?? "workflow 在完成前停止。",
      undefined,
      "查看运行日志中的最后一步，再按提示检查对应设备。"
    ));
  }

  return dedupeIssues(issues);
}

export function hasBlockingSmartCheckIssue(issues: SmartCheckIssue[]): boolean {
  return issues.some((issue) => issue.blocksRun);
}

function analyzeTimeout(context: RobotProgramReadinessContext, issues: SmartCheckIssue[]) {
  const timeoutMs = normalizeTimeout(context.timeoutMs);
  const delayMs = sumWorkflowDelayMs(context.workflow);
  if (delayMs > 0 && timeoutMs < delayMs + 250) {
    issues.push(danger("timeout.too-short", "超时时间过短", `程序等待总时长约 ${delayMs} ms，但超时只有 ${timeoutMs} ms。`, undefined, "把超时时间调高到等待总时长以上。"));
  } else if (timeoutMs < 800 && context.commandCount > 0) {
    issues.push(warning("timeout.short", "超时时间偏短", `当前超时是 ${timeoutMs} ms，硬件动作可能还没完成就被中止。`, undefined, "常规动作建议至少 1000 ms。"));
  }
  if (timeoutMs > 60_000) {
    issues.push(warning("timeout.long", "超时时间偏长", `当前超时是 ${timeoutMs} ms，异常动作可能持续较久。`, undefined, "确认程序内有停止或急停动作。"));
  }
}

function analyzeCommands(commands: WorkflowCommandNode[], context: RobotProgramReadinessContext, issues: SmartCheckIssue[]) {
  for (const item of commands) {
    const { command } = item;
    const validation = validatePlatformCommand(command);
    if (validation) {
      issues.push(danger(`command.invalid.${item.nodeId}`, "命令目标不匹配", validation, command.targetDeviceId, "检查积木选择的设备类型和目标。"));
      continue;
    }

    const targetState = context.runtimeState?.[command.targetDeviceId];
    if (targetState?.status === "offline" || targetState?.status === "error") {
      issues.push(danger(`device.offline.${command.targetDeviceId}`, "目标设备离线", `${command.targetDeviceId} 当前是 ${targetState.status}。`, command.targetDeviceId, deviceActionHint(command.targetDeviceId)));
    }

    if (requiresControllerSerial(command) && context.serialConnected === false) {
      issues.push(danger("serial.offline", "控制串口离线", "程序包含需要控制串口的硬件动作，但当前串口未连接。", command.targetDeviceId, "先连接控制串口并确认状态在线。"));
    }

    if (command.type.startsWith("pi.") && context.runtimeState?.["pi:main"]?.status === "offline") {
      issues.push(danger("helper.pi-offline", "Pi helper 离线", "程序包含 Raspberry Pi 动作，但 Pi/helper 状态不可用。", "pi:main", "先执行 Pi 连接测试或启动本地 Pi helper。"));
    }

    if (command.type === "robot-arm.set_pose" && command.payload.live === true) {
      issues.push(warning("arm.live-pose", "机械臂 live 模式", "程序会以 live 模式发送机械臂姿态。", command.targetDeviceId, "确认机械臂周围安全后再运行。"));
    }

    analyzeServoFeedback(command, context.runtimeState, issues);
  }
}

function analyzeContinuousMotors(commands: WorkflowCommandNode[], issues: SmartCheckIssue[]) {
  commands.forEach((item, commandIndex) => {
    const { command } = item;
    if (command.type !== "motor.set_speed" || Number(command.payload.speedPercent) === 0) {
      return;
    }
    const hasLaterStop = commands.slice(commandIndex + 1).some((later) =>
      later.command.targetDeviceId === command.targetDeviceId
      && (later.command.type === "motor.stop" || (later.command.type === "motor.set_speed" && Number(later.command.payload.speedPercent) === 0))
    );
    if (!hasLaterStop) {
      issues.push(danger(`motor.no-stop.${command.targetDeviceId}`, "电机缺少停止动作", `${command.targetDeviceId} 设置速度后没有后续停止命令。`, command.targetDeviceId, "在程序末尾添加电机停止或紧急停止积木。"));
    }
  });
}

function analyzeServoFeedback(command: PlatformCommand, runtimeState: Record<string, DeviceStateSnapshot> | undefined, issues: SmartCheckIssue[]) {
  if (!runtimeState) {
    return;
  }
  if (command.type === "servo.set_position") {
    addServoFeedbackIssue(command.targetDeviceId, runtimeState, issues);
  }
  if (command.type === "robot-arm.set_pose" || command.type === "robot-arm.pause") {
    for (const joint of Array.isArray(command.payload.joints) ? command.payload.joints : []) {
      if (isObject(joint) && Number.isInteger(Number(joint.servoId))) {
        addServoFeedbackIssue(`servo:${Number(joint.servoId)}`, runtimeState, issues);
      }
    }
  }
}

function addServoFeedbackIssue(deviceId: string, runtimeState: Record<string, DeviceStateSnapshot>, issues: SmartCheckIssue[]) {
  const state = runtimeState[deviceId];
  if (state && state.values.positionRaw === null) {
    issues.push(warning(`servo.feedback-missing.${deviceId}`, "舵机缺少位置反馈", `${deviceId} 还没有 positionRaw 反馈。`, deviceId, "先读取一次舵机反馈，确认 ID 和总线都正常。"));
  }
}

function workflowCommands(workflow: WorkflowDefinition): WorkflowCommandNode[] {
  return workflow.nodes.flatMap((node, index) => {
    const command = node.config?.command;
    return isPlatformCommand(command) ? [{ index, nodeId: node.id, command }] : [];
  });
}

function sumWorkflowDelayMs(workflow: WorkflowDefinition): number {
  return workflow.nodes.reduce((total, node) => {
    if (node.kind !== "delay") {
      return total;
    }
    const ms = Number(node.config?.ms);
    return Number.isFinite(ms) && ms > 0 ? total + ms : total;
  }, 0);
}

function requiresControllerSerial(command: PlatformCommand): boolean {
  return CONTROLLER_SERIAL_COMMAND_PREFIXES.some((prefix) => command.type.startsWith(prefix))
    || command.type === "camera.set_gimbal"
    || command.type === "camera.center_gimbal";
}

function deviceActionHint(deviceId: string): string {
  if (deviceId.startsWith("pi:")) {
    return "先检查 Pi 连接和本地 Pi helper。";
  }
  if (deviceId.startsWith("servo:")) {
    return "先连接舵机总线并读取反馈。";
  }
  if (deviceId.startsWith("motor:")) {
    return "先确认控制串口和电机通道映射。";
  }
  return "先确认设备插件和连接状态。";
}

function normalizeTimeout(value: number | undefined): number {
  return Number.isFinite(value) ? Math.min(120_000, Math.max(500, Math.round(value!))) : 12_000;
}

function warning(id: string, title: string, message: string, targetId?: string, actionHint?: string): SmartCheckIssue {
  return { id, severity: "warning", title, message, targetId, actionHint, blocksRun: false };
}

function danger(id: string, title: string, message: string, targetId?: string, actionHint?: string): SmartCheckIssue {
  return { id, severity: "danger", title, message, targetId, actionHint, blocksRun: true };
}

function dedupeIssues(issues: SmartCheckIssue[]): SmartCheckIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) {
      return false;
    }
    seen.add(issue.id);
    return true;
  });
}

function isPlatformCommand(value: unknown): value is PlatformCommand {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.type === "string"
    && typeof value.targetDeviceId === "string"
    && isObject(value.payload);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
