import { createPlatformCommand, type PlatformCommand, type PlatformCommandResult, type PlatformCommandType } from "@platform/commands";
import type { DeviceStateSnapshot } from "@platform/types";

export type BootSelfCheckStepId =
  | "data-service"
  | "pi-helper"
  | "pi-ssh"
  | "a-board-bridge"
  | "pi-servo-bridge"
  | "control-serial"
  | "camera"
  | "servo-feedback"
  | "motor-feedback"
  | "gamepad"
  | "architecture";

export type BootSelfCheckStatus = "idle" | "running" | "passed" | "warning" | "failed" | "cancelled";
export type BootSelfCheckStepStatus = "pending" | "running" | "passed" | "warning" | "failed" | "skipped" | "cancelled";
export type BootSelfCheckRepairKind = "platform-command" | "local-action" | "navigate";
export type BootSelfCheckLocalAction =
  | "check-a-board-bridge"
  | "start-a-board-bridge"
  | "check-pi-servo-bridge"
  | "start-pi-servo-bridge";
export type BootSelfCheckNavigateTarget = "camera" | "mapping" | "plugins";

export interface BootSelfCheckDeviceSummary {
  id: string | number;
  name: string;
}

export interface BootSelfCheckCameraSourceSummary {
  id: string;
  label: string;
  streamUrl: string;
}

export interface BootSelfCheckInput {
  activeCameraSource?: BootSelfCheckCameraSourceSummary | null;
  aBoardBridgeStatus: string;
  cameraVideoSources?: BootSelfCheckCameraSourceSummary[];
  connected: boolean;
  connectionMode: "servo-bus" | "controller" | null;
  databaseStatus: string;
  gamepads?: BootSelfCheckDeviceSummary[];
  motors?: BootSelfCheckDeviceSummary[];
  piHost: string;
  piServoBridgeStatus: string;
  platformState: Record<string, DeviceStateSnapshot>;
  pluginInstanceCount?: number;
  projectId?: string | null;
  projectName?: string | null;
  servos?: BootSelfCheckDeviceSummary[];
}

export interface BootSelfCheckRepairAction {
  id: string;
  stepId: BootSelfCheckStepId;
  label: string;
  description: string;
  kind: BootSelfCheckRepairKind;
  command?: PlatformCommand;
  localAction?: BootSelfCheckLocalAction;
  navigateTo?: BootSelfCheckNavigateTarget;
  status?: "pending" | "running" | "done" | "failed";
  result?: string;
}

export interface BootSelfCheckStep {
  id: BootSelfCheckStepId;
  title: string;
  description: string;
  critical: boolean;
  status: BootSelfCheckStepStatus;
  message: string;
  evidence: string[];
  repairActions: BootSelfCheckRepairAction[];
  startedAt?: number;
  completedAt?: number;
}

export interface BootSelfCheckRun {
  id: string;
  signature: string;
  status: BootSelfCheckStatus;
  summary: string;
  activeStepId?: BootSelfCheckStepId;
  startedAt: number;
  completedAt?: number;
  steps: BootSelfCheckStep[];
  repairActions: BootSelfCheckRepairAction[];
  auditLog: string[];
  overrideActive?: boolean;
}

export interface BootSelfCheckGateState {
  locked: boolean;
  overrideActive: boolean;
  reason: string;
  blockedStepIds: BootSelfCheckStepId[];
}

export interface BootSelfCheckStepExecution {
  status: BootSelfCheckStepStatus;
  message: string;
  evidence: string[];
  repairActions: BootSelfCheckRepairAction[];
}

export interface BootSelfCheckStepCommandPlan {
  commands: PlatformCommand[];
  skipReason?: string;
}

const DANGEROUS_PLATFORM_COMMAND_TYPES = new Set<PlatformCommandType>([
  "servo.set_position",
  "servo.set_speed",
  "servo.set_torque",
  "motor.set_speed",
  "motor.configure",
  "camera.set_gimbal",
  "camera.center_gimbal",
  "robot-arm.set_pose",
  "robot-arm.teach.play",
  "mecanum-drive.set_velocity",
  "can-servo-group.set_positions"
]);

const DANGEROUS_PC_COMMAND_TYPES = new Set([
  "motor.set",
  "motor.target",
  "mecanum.target",
  "can_servo.move",
  "can_servo.group_move",
  "servo.move",
  "servo.wheel"
]);

const STEP_META: Record<BootSelfCheckStepId, Pick<BootSelfCheckStep, "title" | "description" | "critical">> = {
  "data-service": {
    title: "数据核心",
    description: "确认本地项目数据服务和保存状态。",
    critical: false
  },
  "pi-helper": {
    title: "Pi helper",
    description: "确认本机到树莓派 helper 的检查通道。",
    critical: false
  },
  "pi-ssh": {
    title: "Pi SSH",
    description: "确认树莓派目标主机和账号可达。",
    critical: false
  },
  "a-board-bridge": {
    title: "A 板桥接",
    description: "确认 RoboMaster A 板串口桥状态。",
    critical: true
  },
  "pi-servo-bridge": {
    title: "舵机桥",
    description: "确认 Pi 舵机串口桥状态。",
    critical: true
  },
  "control-serial": {
    title: "控制链路",
    description: "确认浏览器串口或 Pi 舵机桥可以承载控制命令。",
    critical: true
  },
  camera: {
    title: "相机链路",
    description: "确认当前视频源配置和相机检查结果。",
    critical: false
  },
  "servo-feedback": {
    title: "舵机反馈",
    description: "读取已配置舵机的当前位置反馈。",
    critical: true
  },
  "motor-feedback": {
    title: "电机反馈",
    description: "读取已配置电机通道反馈。",
    critical: true
  },
  gamepad: {
    title: "手柄输入",
    description: "确认浏览器当前是否有活跃手柄。",
    critical: false
  },
  architecture: {
    title: "插件拓扑",
    description: "确认当前项目已有可调试插件实例。",
    critical: false
  }
};

export const BOOT_SELF_CHECK_STEP_ORDER: BootSelfCheckStepId[] = [
  "data-service",
  "pi-helper",
  "pi-ssh",
  "a-board-bridge",
  "pi-servo-bridge",
  "control-serial",
  "camera",
  "servo-feedback",
  "motor-feedback",
  "gamepad",
  "architecture"
];

export const DEFAULT_BOOT_SELF_CHECK_GATE: BootSelfCheckGateState = {
  locked: false,
  overrideActive: false,
  reason: "开机自检尚未锁定控制。",
  blockedStepIds: []
};

export function createBootSelfCheckSignature(input: BootSelfCheckInput): string {
  const cameraSignature = (input.cameraVideoSources ?? [])
    .map((source) => `${source.id}:${source.streamUrl}`)
    .join("|");
  return [
    input.projectId ?? input.projectName ?? "project",
    input.piHost.trim() || "no-pi-host",
    `servos:${input.servos?.length ?? 0}`,
    `motors:${input.motors?.length ?? 0}`,
    `plugins:${input.pluginInstanceCount ?? 0}`,
    `camera:${cameraSignature}`
  ].join("::");
}

export function createInitialBootSelfCheckRun(input: BootSelfCheckInput, now = Date.now()): BootSelfCheckRun {
  const steps = BOOT_SELF_CHECK_STEP_ORDER.map((id) => createPendingStep(id));
  return {
    id: `boot-check:${now.toString(36)}`,
    signature: createBootSelfCheckSignature(input),
    status: "idle",
    summary: "开机自检待运行。",
    startedAt: now,
    steps,
    repairActions: [],
    auditLog: []
  };
}

export function createPendingStep(id: BootSelfCheckStepId): BootSelfCheckStep {
  return {
    id,
    ...STEP_META[id],
    status: "pending",
    message: "等待巡检。",
    evidence: [],
    repairActions: []
  };
}

export function markBootSelfCheckStepRunning(run: BootSelfCheckRun, stepId: BootSelfCheckStepId, now = Date.now()): BootSelfCheckRun {
  return {
    ...run,
    status: "running",
    activeStepId: stepId,
    summary: `正在检查：${STEP_META[stepId].title}`,
    steps: run.steps.map((step) => step.id === stepId ? { ...step, status: "running", message: "巡检中。", startedAt: now } : step)
  };
}

export function completeBootSelfCheckStep(
  run: BootSelfCheckRun,
  stepId: BootSelfCheckStepId,
  execution: BootSelfCheckStepExecution,
  now = Date.now()
): BootSelfCheckRun {
  const steps = run.steps.map((step) =>
    step.id === stepId
      ? {
          ...step,
          status: execution.status,
          message: execution.message,
          evidence: execution.evidence,
          repairActions: execution.repairActions,
          completedAt: now
        }
      : step
  );
  const repairActions = dedupeRepairActions(steps.flatMap((step) => step.repairActions));
  return summarizeRun({
    ...run,
    steps,
    repairActions,
    activeStepId: run.activeStepId === stepId ? undefined : run.activeStepId
  });
}

export function cancelBootSelfCheckRun(run: BootSelfCheckRun, now = Date.now()): BootSelfCheckRun {
  const steps = run.steps.map((step) =>
    step.status === "pending" || step.status === "running"
      ? { ...step, status: "cancelled" as const, message: "自检已取消。", completedAt: now }
      : step
  );
  return {
    ...summarizeRun({ ...run, steps, activeStepId: undefined }),
    status: "cancelled",
    completedAt: now,
    summary: "开机自检已取消。"
  };
}

export function evaluateBootSelfCheckStep(
  stepId: BootSelfCheckStepId,
  input: BootSelfCheckInput,
  commandResults: PlatformCommandResult[] = []
): BootSelfCheckStepExecution {
  switch (stepId) {
    case "data-service":
      return evaluateDataService(input);
    case "pi-helper":
      return evaluatePiHelper(input, commandResults);
    case "pi-ssh":
      return evaluatePiSsh(input, commandResults);
    case "a-board-bridge":
      return evaluateBridgeStep("a-board-bridge", input.aBoardBridgeStatus, [
        localRepair("a-board-bridge", "check-a-board-bridge", "重新检查 A 板桥", "只读取 A 板桥 health 状态。"),
        localRepair("a-board-bridge", "start-a-board-bridge", "启动 A 板桥", "确认后通过 Pi helper 启动 A 板串口桥服务。")
      ]);
    case "pi-servo-bridge":
      return evaluateBridgeStep("pi-servo-bridge", input.piServoBridgeStatus, [
        localRepair("pi-servo-bridge", "check-pi-servo-bridge", "重新检查舵机桥", "只读取 Pi 舵机桥 health 状态。"),
        localRepair("pi-servo-bridge", "start-pi-servo-bridge", "启动舵机桥", "确认后通过 Pi helper 启动舵机串口桥服务。")
      ]);
    case "control-serial":
      return evaluateControlSerial(input);
    case "camera":
      return evaluateCamera(input, commandResults);
    case "servo-feedback":
      return evaluateFeedbackStep("servo-feedback", input.servos ?? [], input.platformState, commandResults, "servo");
    case "motor-feedback":
      return evaluateFeedbackStep("motor-feedback", input.motors ?? [], input.platformState, commandResults, "motor");
    case "gamepad":
      return evaluateGamepad(input);
    case "architecture":
      return evaluateArchitecture(input);
  }
}

export function planBootSelfCheckStepCommands(stepId: BootSelfCheckStepId, input: BootSelfCheckInput): BootSelfCheckStepCommandPlan {
  if (stepId === "pi-helper" || stepId === "pi-ssh") {
    return { commands: [createPlatformCommand("pi.check", "pi:main")] };
  }
  if (stepId === "camera") {
    const source = input.activeCameraSource;
    const streamUrl = source?.streamUrl.trim() ?? "";
    if (!streamUrl) {
      return { commands: [], skipReason: "相机视频源没有 streamUrl。" };
    }
    return { commands: [createPlatformCommand("pi.camera.check", "pi:main", { sourceId: source?.id ?? "main", streamUrl })] };
  }
  if (stepId === "servo-feedback") {
    const servos = (input.servos ?? []).slice(0, 4);
    return {
      commands: servos.map((servo) => createPlatformCommand("servo.read_feedback", `servo:${servo.id}`)),
      skipReason: servos.length === 0 ? "当前没有已配置舵机。" : undefined
    };
  }
  if (stepId === "motor-feedback") {
    const motors = (input.motors ?? []).slice(0, 4);
    return {
      commands: motors.map((motor) => createPlatformCommand("motor.read_feedback", `motor:${String(motor.id).toUpperCase()}`)),
      skipReason: motors.length === 0 ? "当前没有已配置电机。" : undefined
    };
  }
  return { commands: [] };
}

export function createBootSelfCheckGateState(run: BootSelfCheckRun | null, overrideActive = false): BootSelfCheckGateState {
  if (!run) {
    return { ...DEFAULT_BOOT_SELF_CHECK_GATE };
  }
  const blockedSteps = run.steps.filter((step) => step.critical && (step.status === "failed" || step.status === "running"));
  const locked = !overrideActive && (run.status === "running" || blockedSteps.length > 0);
  if (!locked) {
    return {
      locked: false,
      overrideActive,
      reason: overrideActive ? "已临时解除自检门禁。" : "开机自检门禁已放行。",
      blockedStepIds: []
    };
  }
  return {
    locked: true,
    overrideActive,
    reason: blockedSteps.length > 0
      ? `危险动作已锁定：${blockedSteps.map((step) => step.title).join("、")} 未通过。`
      : "开机自检运行中，危险动作暂时锁定。",
    blockedStepIds: blockedSteps.map((step) => step.id)
  };
}

export function shouldBlockPlatformCommand(command: PlatformCommand, gate: BootSelfCheckGateState): boolean {
  return gate.locked && DANGEROUS_PLATFORM_COMMAND_TYPES.has(command.type);
}

export function blockedPlatformCommandResult(command: PlatformCommand, gate: BootSelfCheckGateState): PlatformCommandResult {
  return {
    commandId: command.id,
    deviceId: command.targetDeviceId,
    status: "failed",
    message: gate.reason
  };
}

export function pcCommandIsDangerous(command: { type?: unknown }): boolean {
  return typeof command.type === "string" && DANGEROUS_PC_COMMAND_TYPES.has(command.type);
}

export function bootSelfCheckStepTone(status: BootSelfCheckStepStatus): "neutral" | "online" | "warning" | "danger" {
  if (status === "passed") {
    return "online";
  }
  if (status === "warning" || status === "running") {
    return "warning";
  }
  if (status === "failed" || status === "cancelled") {
    return "danger";
  }
  return "neutral";
}

export function bootSelfCheckRunTone(status: BootSelfCheckStatus): "neutral" | "online" | "warning" | "danger" {
  if (status === "passed") {
    return "online";
  }
  if (status === "warning" || status === "running") {
    return "warning";
  }
  if (status === "failed" || status === "cancelled") {
    return "danger";
  }
  return "neutral";
}

function evaluateDataService(input: BootSelfCheckInput): BootSelfCheckStepExecution {
  if (input.databaseStatus === "offline" || input.databaseStatus === "error") {
    return stepExecution("failed", "数据服务不可用，项目状态可能无法保存。", [`database=${input.databaseStatus}`], []);
  }
  if (input.databaseStatus === "loading" || input.databaseStatus === "saving") {
    return stepExecution("warning", "数据服务正在同步，稍后会自动恢复。", [`database=${input.databaseStatus}`], []);
  }
  return stepExecution("passed", "数据服务已就绪。", [`database=${input.databaseStatus}`], []);
}

function evaluatePiHelper(input: BootSelfCheckInput, results: PlatformCommandResult[]): BootSelfCheckStepExecution {
  const pi = input.platformState["pi:main"];
  const helperReady = boolValue(pi, "helperReady");
  if (helperReady === true || hasSentResult(results)) {
    return stepExecution("passed", "Pi helper 检查通道可用。", [`host=${input.piHost || "--"}`, resultEvidence(results)], [
      platformRepair("pi-helper", "重新检查 Pi", "再次读取 Pi helper 与 SSH 状态。", createPlatformCommand("pi.check", "pi:main"))
    ]);
  }
  return stepExecution("warning", "Pi helper 暂未确认，远程相机和桥接修复可能受影响。", [`helperReady=${helperReady ?? "unknown"}`, resultEvidence(results)], [
    platformRepair("pi-helper", "重新检查 Pi", "再次读取 Pi helper 与 SSH 状态。", createPlatformCommand("pi.check", "pi:main"))
  ]);
}

function evaluatePiSsh(input: BootSelfCheckInput, results: PlatformCommandResult[]): BootSelfCheckStepExecution {
  const pi = input.platformState["pi:main"];
  const connectionReady = boolValue(pi, "connectionReady");
  if (connectionReady === true || hasSentResult(results)) {
    return stepExecution("passed", "Pi SSH 目标已确认。", [`host=${input.piHost || "--"}`, resultEvidence(results)], [
      platformRepair("pi-ssh", "重新检查 Pi", "再次验证 SSH 目标状态。", createPlatformCommand("pi.check", "pi:main"))
    ]);
  }
  return stepExecution("warning", "Pi SSH 目标未确认。", [`connectionReady=${connectionReady ?? "unknown"}`, resultEvidence(results)], [
    platformRepair("pi-ssh", "重新检查 Pi", "再次验证 SSH 目标状态。", createPlatformCommand("pi.check", "pi:main"))
  ]);
}

function evaluateBridgeStep(stepId: BootSelfCheckStepId, status: string, repairs: BootSelfCheckRepairAction[]): BootSelfCheckStepExecution {
  if (status === "connected") {
    return stepExecution("passed", `${STEP_META[stepId].title} 已在线。`, [`status=${status}`], repairs.slice(0, 1));
  }
  if (status === "checking" || status === "starting") {
    return stepExecution("warning", `${STEP_META[stepId].title} 正在握手。`, [`status=${status}`], repairs.slice(0, 1));
  }
  return stepExecution("failed", `${STEP_META[stepId].title} 未在线，危险动作保持锁定。`, [`status=${status || "unknown"}`], repairs);
}

function evaluateControlSerial(input: BootSelfCheckInput): BootSelfCheckStepExecution {
  if (input.connected || input.piServoBridgeStatus === "connected") {
    return stepExecution("passed", "控制链路可承载硬件命令。", [
      `browserSerial=${input.connected}`,
      `mode=${input.connectionMode ?? "none"}`,
      `piServoBridge=${input.piServoBridgeStatus}`
    ], []);
  }
  return stepExecution("failed", "控制串口和 Pi 舵机桥都未在线。", [
    `browserSerial=${input.connected}`,
    `mode=${input.connectionMode ?? "none"}`,
    `piServoBridge=${input.piServoBridgeStatus}`
  ], [
    localRepair("control-serial", "check-pi-servo-bridge", "重新检查舵机桥", "只读取 Pi 舵机桥 health 状态。")
  ]);
}

function evaluateCamera(input: BootSelfCheckInput, results: PlatformCommandResult[]): BootSelfCheckStepExecution {
  const source = input.activeCameraSource;
  const streamUrl = source?.streamUrl.trim() ?? "";
  if (!streamUrl) {
    return stepExecution("warning", "当前相机视频源缺少 streamUrl。", [`source=${source?.id ?? "main"}`, "streamUrl=empty"], [
      navigateRepair("camera", "打开相机设置", "跳到相机页面补全视频源。", "camera")
    ]);
  }
  const cameraState = input.platformState[source?.id === "secondary" ? "camera:secondary" : "camera:main"];
  if (cameraState?.status === "online" || hasSentResult(results)) {
    return stepExecution("passed", "相机链路已确认。", [`source=${source?.id ?? "main"}`, `streamUrl=${streamUrl}`, resultEvidence(results)], [
      platformRepair("camera", "重新检查相机", "再次读取相机设备和服务状态。", createPlatformCommand("pi.camera.check", "pi:main", { sourceId: source?.id ?? "main", streamUrl }))
    ]);
  }
  return stepExecution("warning", "相机配置存在，但在线状态未确认。", [`status=${cameraState?.status ?? "missing"}`, `streamUrl=${streamUrl}`, resultEvidence(results)], [
    platformRepair("camera", "重新检查相机", "再次读取相机设备和服务状态。", createPlatformCommand("pi.camera.check", "pi:main", { sourceId: source?.id ?? "main", streamUrl }))
  ]);
}

function evaluateFeedbackStep(
  stepId: "servo-feedback" | "motor-feedback",
  devices: BootSelfCheckDeviceSummary[],
  state: Record<string, DeviceStateSnapshot>,
  results: PlatformCommandResult[],
  prefix: "servo" | "motor"
): BootSelfCheckStepExecution {
  if (devices.length === 0) {
    return stepExecution("skipped", `当前项目没有已配置${prefix === "servo" ? "舵机" : "电机"}。`, ["configured=0"], []);
  }
  const missing = devices.filter((device) => !state[`${prefix}:${String(device.id).toUpperCase()}`]);
  const sentCount = results.filter((result) => result.status === "sent").length;
  const commands = devices.slice(0, 4).map((device) =>
    createPlatformCommand(prefix === "servo" ? "servo.read_feedback" : "motor.read_feedback", `${prefix}:${String(device.id).toUpperCase()}`)
  );
  const repairs = commands.map((command) =>
    platformRepair(stepId, prefix === "servo" ? "读取舵机反馈" : "读取电机反馈", `重新读取 ${command.targetDeviceId} 的反馈。`, command)
  );
  if (missing.length === 0 || sentCount === Math.min(devices.length, 4)) {
    return stepExecution("passed", `${STEP_META[stepId].title} 已确认。`, [
      `configured=${devices.length}`,
      `missing=${missing.length}`,
      resultEvidence(results)
    ], repairs);
  }
  return stepExecution("failed", `${missing.length} 个${prefix === "servo" ? "舵机" : "电机"}缺少反馈。`, [
    `configured=${devices.length}`,
    `missing=${missing.map((device) => device.id).join(",")}`,
    resultEvidence(results)
  ], repairs);
}

function evaluateGamepad(input: BootSelfCheckInput): BootSelfCheckStepExecution {
  const count = input.gamepads?.length ?? 0;
  if (count > 0) {
    return stepExecution("passed", "手柄输入已发现。", [`gamepads=${count}`], []);
  }
  return stepExecution("warning", "未发现活跃手柄，整机仍可用键盘/面板调试。", ["gamepads=0"], [
    navigateRepair("gamepad", "打开映射设置", "跳到手柄/键盘映射页面检查输入。", "mapping")
  ]);
}

function evaluateArchitecture(input: BootSelfCheckInput): BootSelfCheckStepExecution {
  const count = input.pluginInstanceCount ?? 0;
  if (count > 0) {
    return stepExecution("passed", "插件拓扑已有可调试设备。", [`plugins=${count}`], []);
  }
  return stepExecution("warning", "当前项目还没有插件实例，建议先自动检测或添加插件。", [`plugins=${count}`], [
    navigateRepair("architecture", "打开插件后台", "进入插件页添加或自动检测设备。", "plugins")
  ]);
}

function summarizeRun(run: BootSelfCheckRun): BootSelfCheckRun {
  const steps = run.steps;
  const active = steps.some((step) => step.status === "running");
  const failed = steps.filter((step) => step.status === "failed");
  const warnings = steps.filter((step) => step.status === "warning");
  const unfinished = steps.some((step) => step.status === "pending");
  if (active || unfinished) {
    return {
      ...run,
      status: "running",
      summary: active ? run.summary : "开机自检准备继续。"
    };
  }
  if (failed.length > 0) {
    return {
      ...run,
      status: "failed",
      summary: `自检发现 ${failed.length} 个阻塞项，危险动作已锁定。`
    };
  }
  if (warnings.length > 0) {
    return {
      ...run,
      status: "warning",
      summary: `自检通过关键链路，还有 ${warnings.length} 个状态建议确认。`
    };
  }
  return {
    ...run,
    status: "passed",
    summary: "开机自检通过，整机调试已放行。"
  };
}

function stepExecution(
  status: BootSelfCheckStepStatus,
  message: string,
  evidence: string[],
  repairActions: BootSelfCheckRepairAction[]
): BootSelfCheckStepExecution {
  return {
    status,
    message,
    evidence: evidence.filter(Boolean),
    repairActions
  };
}

function platformRepair(
  stepId: BootSelfCheckStepId,
  label: string,
  description: string,
  command: PlatformCommand
): BootSelfCheckRepairAction {
  return {
    id: `repair:${stepId}:${command.type}:${command.targetDeviceId}`,
    stepId,
    label,
    description,
    kind: "platform-command",
    command,
    status: "pending"
  };
}

function localRepair(
  stepId: BootSelfCheckStepId,
  localAction: BootSelfCheckLocalAction,
  label: string,
  description: string
): BootSelfCheckRepairAction {
  return {
    id: `repair:${stepId}:${localAction}`,
    stepId,
    label,
    description,
    kind: "local-action",
    localAction,
    status: "pending"
  };
}

function navigateRepair(
  stepId: BootSelfCheckStepId,
  label: string,
  description: string,
  navigateTo: BootSelfCheckNavigateTarget
): BootSelfCheckRepairAction {
  return {
    id: `repair:${stepId}:navigate:${navigateTo}`,
    stepId,
    label,
    description,
    kind: "navigate",
    navigateTo,
    status: "pending"
  };
}

function dedupeRepairActions(actions: BootSelfCheckRepairAction[]): BootSelfCheckRepairAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) {
      return false;
    }
    seen.add(action.id);
    return true;
  });
}

function hasSentResult(results: PlatformCommandResult[]): boolean {
  return results.some((result) => result.status === "sent");
}

function resultEvidence(results: PlatformCommandResult[]): string {
  if (results.length === 0) {
    return "";
  }
  return `results=${results.map((result) => `${result.deviceId}:${result.status}`).join(",")}`;
}

function boolValue(snapshot: DeviceStateSnapshot | undefined, key: string): boolean | null {
  const value = snapshot?.values[key];
  return typeof value === "boolean" ? value : null;
}
