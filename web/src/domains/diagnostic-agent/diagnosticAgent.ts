import { createPlatformCommand, type PlatformCommand, type PlatformCommandType } from "@platform/commands";
import type { DeviceStateSnapshot } from "@platform/types";

export type DiagnosticAgentIntent =
  | "general_check"
  | "camera"
  | "servo_feedback"
  | "program_run"
  | "ai_vision"
  | "firmware"
  | "pi"
  | "motor"
  | "unknown";

export type DiagnosticIssueSeverity = "info" | "warning" | "danger";
export type DiagnosticAgentActionRisk = "low" | "confirm" | "blocked";

export interface DiagnosticAgentLogEntry {
  direction?: string;
  level?: "info" | "warn" | "error";
  messageKey?: string;
  text?: string;
}

export interface DiagnosticDeviceSummary {
  id: string | number;
  name: string;
}

export interface DiagnosticCameraSourceSummary {
  id: string;
  label: string;
  streamUrl: string;
}

export interface DiagnosticAgentContext {
  activeModule?: string;
  activeSection?: string;
  activeCameraSource?: DiagnosticCameraSourceSummary | null;
  cameraVideoSources?: DiagnosticCameraSourceSummary[];
  currentProjectName?: string | null;
  logs?: DiagnosticAgentLogEntry[];
  motors?: DiagnosticDeviceSummary[];
  platformState: Record<string, DeviceStateSnapshot>;
  servos?: DiagnosticDeviceSummary[];
}

export interface DiagnosticAgentIssue {
  id: string;
  severity: DiagnosticIssueSeverity;
  title: string;
  message: string;
  evidence: string[];
  targetDeviceId?: string;
  actionHint?: string;
}

export interface DiagnosticAgentAction {
  id: string;
  label: string;
  description: string;
  risk: DiagnosticAgentActionRisk;
  issueId?: string;
  command?: PlatformCommand;
}

export interface DiagnosticAgentMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  createdAt: number;
  intent?: DiagnosticAgentIntent;
  issues?: DiagnosticAgentIssue[];
  actions?: DiagnosticAgentAction[];
}

export interface DiagnosticAgentResponse {
  intent: DiagnosticAgentIntent;
  summary: string;
  issues: DiagnosticAgentIssue[];
  actions: DiagnosticAgentAction[];
}

export type DiagnosticTextValues = Record<string, string | number>;
export type DiagnosticTextResolver = (key: string, values?: DiagnosticTextValues) => string;

const DEFAULT_DIAGNOSTIC_TEXT: Record<string, string> = {
  "actions.analyzeFrame.description": "Capture one frame from the current video source and update detections.",
  "actions.analyzeFrame.label": "Analyze frame again",
  "actions.checkAiVision.description": "Confirm whether the local vision helper is online.",
  "actions.checkAiVision.label": "Check AI Vision",
  "actions.checkCamera.description": "Ask the Pi helper to check camera devices and stream service.",
  "actions.checkCamera.label": "Check camera",
  "actions.checkFirmwareHelper.description": "Confirm whether the local firmware helper is online.",
  "actions.checkFirmwareHelper.label": "Check firmware helper",
  "actions.checkPi.description": "Read Pi helper and SSH target status.",
  "actions.checkPi.label": "Check Pi connection",
  "actions.configureVideoSource.description": "Fill in streamUrl from camera settings.",
  "actions.configureVideoSource.label": "Configure video source",
  "actions.connectSerial.description": "Browser serial permission must be confirmed manually by the operator.",
  "actions.connectSerial.label": "Connect control serial",
  "actions.readMotorFeedback.description": "Read the latest feedback from {{targetDeviceId}}.",
  "actions.readMotorFeedback.label": "Read motor feedback",
  "actions.readServoFeedback.description": "Read current position feedback from {{targetDeviceId}}.",
  "actions.readServoFeedback.label": "Read servo feedback",
  "actions.refreshFirmwarePorts.description": "Refresh locally available flashing ports.",
  "actions.refreshFirmwarePorts.label": "Refresh firmware ports",
  "issues.aiVisionHelperOffline.actionHint": "Check AI Vision helper first.",
  "issues.aiVisionHelperOffline.message": "The local vision helper is offline, so frame capture and analysis are unavailable.",
  "issues.aiVisionHelperOffline.title": "AI Vision helper offline",
  "issues.aiVisionNoDetections.actionHint": "Run analysis again after confirming the video source.",
  "issues.aiVisionNoDetections.message": "AI Vision helper is online, but the latest analysis did not find targets.",
  "issues.aiVisionNoDetections.title": "No current vision detections",
  "issues.cameraStreamNotReady.actionHint": "Run a camera check to confirm the device, port, and stream service.",
  "issues.cameraStreamNotReady.message": "A video URL exists, but the camera state is not online yet.",
  "issues.cameraStreamNotReady.title": "Camera not confirmed online",
  "issues.cameraStreamUrlMissing.actionHint": "Restore or fill in the MJPEG stream URL in camera settings.",
  "issues.cameraStreamUrlMissing.message": "The active video source has no streamUrl, so preview and vision analysis have no input.",
  "issues.cameraStreamUrlMissing.title": "Camera stream URL is empty",
  "issues.firmwareHelperOffline.actionHint": "Check firmware helper, then refresh ports.",
  "issues.firmwareHelperOffline.message": "The local firmware compile/port refresh helper is not ready.",
  "issues.firmwareHelperOffline.title": "Firmware helper offline",
  "issues.motorFeedbackMissing.actionHint": "Read motor feedback or confirm A-board bridge status.",
  "issues.motorFeedbackMissing.message": "{{targetDeviceId}} has no recent feedback yet.",
  "issues.motorFeedbackMissing.title": "Motor {{motorChannel}} feedback missing",
  "issues.piConnectionOffline.actionHint": "Run one Pi connection check first.",
  "issues.piConnectionOffline.message": "Pi helper exists, but SSH/target connection has not been confirmed online.",
  "issues.piConnectionOffline.title": "Pi connection not confirmed",
  "issues.piHelperOffline.actionHint": "Run a Pi connection check to confirm the local helper and SSH target.",
  "issues.piHelperOffline.message": "The local Pi helper check channel is unavailable, so camera and remote actions may not be confirmed.",
  "issues.piHelperOffline.title": "Pi helper not ready",
  "issues.recentLogs.actionHint": "Compare the latest error with the related helper or device.",
  "issues.recentLogs.message": "System logs contain recent warnings or errors that may be related.",
  "issues.recentLogs.title": "Recent logs contain problems",
  "issues.serialOffline.actionHint": "Connect browser serial or the Pi servo bridge, then retry hardware actions.",
  "issues.serialOffline.message": "The control serial link is offline, so servo, motor, and gimbal actions will not reach the controller.",
  "issues.serialOffline.title": "Control serial offline",
  "issues.servoFeedbackMissing.actionHint": "Read servo feedback once and confirm ID, bus, and power.",
  "issues.servoFeedbackMissing.message": "{{targetDeviceId}} has no positionRaw feedback yet.",
  "issues.servoFeedbackMissing.title": "Servo {{servoId}} feedback missing",
  "issues.systemReady.actionHint": "If hardware still does not move, inspect the concrete command result and wiring.",
  "issues.systemReady.message": "Platform state does not show a direct diagnostic blocker.",
  "issues.systemReady.title": "No obvious blocker",
  "summaries.blocking": "I checked the current state. Start with {{title}}; there are {{blockingExtra}} more high-priority items and {{lowRiskCount}} low-risk checks I can run.",
  "summaries.ready": "I checked the current state and found no obvious blocker. {{hint}}",
  "summaries.readyLowRiskHint": "Low-risk checks can continue for confirmation.",
  "summaries.readyManualHint": "Next, inspect the concrete action result.",
  "summaries.unknown": "I could not map that sentence to a specific device, but the current state has no obvious blocker. You can ask me to check the camera, servo feedback, Pi, or firmware helper.",
  "summaries.warning": "I found {{warningCount}} states to confirm. Start with {{title}}. {{hint}}",
  "summaries.warningLowRiskHint": "I can run the low-risk checks directly.",
  "summaries.warningManualHint": "This mainly needs manual configuration or wiring confirmation."
};

export const LOW_RISK_DIAGNOSTIC_COMMAND_TYPES = new Set<PlatformCommandType>([
  "pi.check",
  "pi.camera.check",
  "firmware.helper.check",
  "firmware.ports.refresh",
  "ai-vision.helper.check",
  "ai-vision.analyze",
  "servo.read_feedback",
  "motor.read_feedback"
]);

const CONFIRM_ONLY_COMMAND_TYPES = new Set<PlatformCommandType>([
  "servo.set_position",
  "servo.set_speed",
  "servo.set_torque",
  "motor.set_speed",
  "motor.stop",
  "motor.configure",
  "camera.set_gimbal",
  "camera.center_gimbal",
  "camera.stream.start",
  "camera.stream.stop",
  "robot-arm.set_pose",
  "robot-arm.pause",
  "robot-arm.teach.start",
  "robot-arm.teach.stop",
  "robot-arm.teach.play",
  "pi.setup",
  "pi.upload_file",
  "firmware.compile",
  "firmware.upload",
  "ai-vision.samples.capture"
]);

const BLOCKED_COMMAND_TYPES = new Set<PlatformCommandType>([
  "servo.set_id",
  "pi.exec",
  "pi.upload_and_exec",
  "pi.camera.start",
  "pi.camera.stop",
  "pi.camera.install_tools"
]);

export function detectDiagnosticIntent(input: string): DiagnosticAgentIntent {
  const text = normalizeText(input);
  if (!text) {
    return "general_check";
  }
  if (hasAny(text, ["摄像头", "相机", "画面", "视频", "stream", "camera", "video"])) {
    return "camera";
  }
  if (hasAny(text, ["ai vision", "视觉", "识别", "检测", "目标", "假人", "detection"])) {
    return "ai_vision";
  }
  if (hasAny(text, ["舵机", "servo", "反馈", "读不到", "没反馈", "positionraw"])) {
    return "servo_feedback";
  }
  if (hasAny(text, ["电机", "motor", "m1", "m2", "底盘", "履带"])) {
    return "motor";
  }
  if (hasAny(text, ["运行", "不能运行", "为什么不能", "程序", "workflow", "blockly", "run"])) {
    return "program_run";
  }
  if (hasAny(text, ["固件", "烧录", "上传", "firmware", "compile", "port"])) {
    return "firmware";
  }
  if (hasAny(text, ["树莓派", "raspberry", "ssh", "pi helper", "pi"])) {
    return "pi";
  }
  if (hasAny(text, ["检查", "诊断", "看看", "帮我", "check", "diagnose", "status"])) {
    return "general_check";
  }
  return "unknown";
}

export function classifyDiagnosticActionRisk(command: PlatformCommand): DiagnosticAgentActionRisk {
  if (LOW_RISK_DIAGNOSTIC_COMMAND_TYPES.has(command.type)) {
    return "low";
  }
  if (CONFIRM_ONLY_COMMAND_TYPES.has(command.type)) {
    return "confirm";
  }
  if (BLOCKED_COMMAND_TYPES.has(command.type)) {
    return "blocked";
  }
  return "blocked";
}

export function canAutoRunDiagnosticAction(action: DiagnosticAgentAction): boolean {
  return Boolean(action.command) && action.risk === "low";
}

export function createDiagnosticAgentResponse(
  input: string,
  context: DiagnosticAgentContext,
  text: DiagnosticTextResolver = defaultDiagnosticText
): DiagnosticAgentResponse {
  const intent = detectDiagnosticIntent(input);
  const issues = prioritizeIssues(localizeDiagnosticIssues(analyzeDiagnosticContext(context, intent), text), intent);
  const actions = createDiagnosticActions(context, issues, intent, text);
  return {
    intent,
    summary: summarizeDiagnosticResponse(intent, issues, actions, text),
    issues,
    actions
  };
}

export function analyzeDiagnosticContext(context: DiagnosticAgentContext, intent: DiagnosticAgentIntent = "general_check"): DiagnosticAgentIssue[] {
  const issues: DiagnosticAgentIssue[] = [];
  const state = context.platformState;
  const serial = state["connection:serial"];
  const pi = state["pi:main"];
  const firmware = state["firmware:local"];
  const aiVision = state["ai-vision:local"];
  const activeCameraDeviceId = cameraDeviceIdForSource(context.activeCameraSource?.id);
  const activeCamera = state[activeCameraDeviceId] ?? state["camera:main"];
  const streamUrl = activeCameraStreamUrl(context, activeCamera);

  if (!serial || serial.status === "offline") {
    issues.push(issue({
      id: "serial.offline",
      severity: "danger",
      title: "控制串口离线",
      message: "当前串口没有在线，舵机、电机和云台动作不会发到控制器。",
      targetDeviceId: "connection:serial",
      evidence: [`connection:serial status=${serial?.status ?? "missing"}`],
      actionHint: "先连接浏览器串口或 Pi 舵机桥，再重试硬件动作。"
    }));
  }

  if (!pi || boolValue(pi, "helperReady") === false) {
    issues.push(issue({
      id: "pi.helper.offline",
      severity: intent === "pi" || intent === "camera" ? "danger" : "warning",
      title: "Pi helper 未就绪",
      message: "本机到树莓派 helper 的检查通道不可用，摄像头和远程动作可能无法确认。",
      targetDeviceId: "pi:main",
      evidence: [`pi:main helperReady=${boolValue(pi, "helperReady")}`],
      actionHint: "运行 Pi 连接检查，确认本地 helper 与 SSH 目标。"
    }));
  } else if (boolValue(pi, "connectionReady") === false) {
    issues.push(issue({
      id: "pi.connection.offline",
      severity: "warning",
      title: "Pi 连接未确认",
      message: "Pi helper 存在，但 SSH/目标连接还没有确认在线。",
      targetDeviceId: "pi:main",
      evidence: [`pi:main connectionReady=${boolValue(pi, "connectionReady")}`],
      actionHint: "先做一次 Pi 连接检查。"
    }));
  }

  if (!streamUrl) {
    issues.push(issue({
      id: "camera.stream-url.missing",
      severity: intent === "camera" || intent === "ai_vision" ? "danger" : "warning",
      title: "摄像头地址为空",
      message: "当前视频源没有 streamUrl，画面和视觉分析都没有输入。",
      targetDeviceId: activeCamera?.deviceId ?? activeCameraDeviceId,
      evidence: [`active source=${context.activeCameraSource?.id ?? "main"}`, "streamUrl empty"],
      actionHint: "先在摄像头设置里填写或恢复 MJPEG stream 地址。"
    }));
  } else if (activeCamera?.status !== "online") {
    issues.push(issue({
      id: "camera.stream.not-ready",
      severity: intent === "camera" ? "danger" : "warning",
      title: "摄像头未确认在线",
      message: "视频地址存在，但当前状态不是 online，可能需要检查 Pi 摄像头服务。",
      targetDeviceId: activeCamera?.deviceId ?? activeCameraDeviceId,
      evidence: [`${activeCamera?.deviceId ?? activeCameraDeviceId} status=${activeCamera?.status ?? "missing"}`, `streamUrl=${streamUrl}`],
      actionHint: "运行摄像头检查，确认设备、端口和 stream 服务。"
    }));
  }

  if (!firmware || boolValue(firmware, "helperReady") === false) {
    issues.push(issue({
      id: "firmware.helper.offline",
      severity: intent === "firmware" ? "danger" : "warning",
      title: "固件 helper 离线",
      message: "本地固件编译/端口刷新 helper 没有就绪。",
      targetDeviceId: "firmware:local",
      evidence: [`firmware:local helperReady=${boolValue(firmware, "helperReady")}`],
      actionHint: "先检查固件 helper，再刷新端口。"
    }));
  }

  if (!aiVision || boolValue(aiVision, "helperReady") === false) {
    issues.push(issue({
      id: "ai-vision.helper.offline",
      severity: intent === "ai_vision" ? "danger" : "warning",
      title: "AI Vision helper 离线",
      message: "本地视觉 helper 不在线，无法抓帧分析。",
      targetDeviceId: "ai-vision:local",
      evidence: [`ai-vision:local helperReady=${boolValue(aiVision, "helperReady")}`],
      actionHint: "先检查 AI Vision helper。"
    }));
  } else if (numberValue(aiVision, "detectionCount") === 0) {
    issues.push(issue({
      id: "ai-vision.no-detections",
      severity: intent === "ai_vision" ? "warning" : "info",
      title: "视觉当前没有检测结果",
      message: "AI Vision helper 在线，但最近一次分析没有目标。",
      targetDeviceId: "ai-vision:local",
      evidence: [`detectionCount=${numberValue(aiVision, "detectionCount")}`, `sourceId=${stringValue(aiVision, "sourceId") ?? context.activeCameraSource?.id ?? "main"}`],
      actionHint: streamUrl ? "可以重新分析当前视频源。" : "先恢复摄像头视频源，再分析。"
    }));
  }

  for (const servo of (context.servos ?? []).slice(0, 3)) {
    const servoId = Number(servo.id);
    if (!Number.isInteger(servoId)) {
      continue;
    }
    const servoState = state[`servo:${servoId}`];
    if (!servoState || servoState.values.positionRaw === null || servoState.values.positionRaw === undefined) {
      issues.push(issue({
        id: `servo.feedback-missing.${servoId}`,
        severity: intent === "servo_feedback" ? "danger" : "warning",
        title: `舵机 ${servoId} 缺少反馈`,
        message: `${servo.name || `ID ${servoId}`} 还没有 positionRaw 反馈，无法确认真实姿态。`,
        targetDeviceId: `servo:${servoId}`,
        evidence: [`servo:${servoId} state=${servoState?.status ?? "missing"}`],
        actionHint: "读取一次舵机反馈，确认 ID、总线和供电。"
      }));
    }
  }

  if (intent === "motor") {
    for (const motor of (context.motors ?? []).slice(0, 2)) {
      const channel = String(motor.id).toUpperCase();
      const motorState = state[`motor:${channel}`];
      if (!motorState) {
        issues.push(issue({
          id: `motor.feedback-missing.${channel}`,
          severity: "warning",
          title: `电机 ${channel} 缺少反馈`,
          message: `${motor.name || channel} 还没有最近反馈。`,
          targetDeviceId: `motor:${channel}`,
          evidence: [`motor:${channel} state=missing`],
          actionHint: "读取一次电机反馈或确认 A 板桥接状态。"
        }));
      }
    }
  }

  const recentProblemLogs = (context.logs ?? [])
    .filter((entry) => entry.level === "error" || entry.level === "warn")
    .slice(0, 2);
  if (recentProblemLogs.length > 0) {
    issues.push(issue({
      id: "logs.recent-problems",
      severity: recentProblemLogs.some((entry) => entry.level === "error") ? "danger" : "warning",
      title: "最近日志有异常",
      message: "系统日志里有新的警告或错误，可能和当前问题相关。",
      evidence: recentProblemLogs.map((entry) => logText(entry)),
      actionHint: "先对照最后一条错误检查对应 helper 或设备。"
    }));
  }

  if (issues.length === 0) {
    issues.push(issue({
      id: "system.ready",
      severity: "info",
      title: "当前没有明显阻塞",
      message: "平台状态里没有发现会直接阻塞诊断的异常。",
      evidence: [`states=${Object.keys(state).length}`, `module=${context.activeModule ?? "unknown"}`],
      actionHint: "如果硬件仍然不动，下一步看具体命令结果和现场接线。"
    }));
  }

  return dedupeIssues(issues);
}

function localizeDiagnosticIssues(issues: DiagnosticAgentIssue[], text: DiagnosticTextResolver): DiagnosticAgentIssue[] {
  return issues.map((item) => {
    const baseKey = diagnosticIssueBaseKey(item.id);
    if (!baseKey) {
      return item;
    }
    const values = diagnosticIssueTextValues(item);
    return {
      ...item,
      title: text(`${baseKey}.title`, values),
      message: text(`${baseKey}.message`, values),
      actionHint: text(`${baseKey}.actionHint`, values)
    };
  });
}

function diagnosticIssueBaseKey(id: string): string {
  if (id === "serial.offline") {
    return "issues.serialOffline";
  }
  if (id === "pi.helper.offline") {
    return "issues.piHelperOffline";
  }
  if (id === "pi.connection.offline") {
    return "issues.piConnectionOffline";
  }
  if (id === "camera.stream-url.missing") {
    return "issues.cameraStreamUrlMissing";
  }
  if (id === "camera.stream.not-ready") {
    return "issues.cameraStreamNotReady";
  }
  if (id === "firmware.helper.offline") {
    return "issues.firmwareHelperOffline";
  }
  if (id === "ai-vision.helper.offline") {
    return "issues.aiVisionHelperOffline";
  }
  if (id === "ai-vision.no-detections") {
    return "issues.aiVisionNoDetections";
  }
  if (id.startsWith("servo.feedback-missing.")) {
    return "issues.servoFeedbackMissing";
  }
  if (id.startsWith("motor.feedback-missing.")) {
    return "issues.motorFeedbackMissing";
  }
  if (id === "logs.recent-problems") {
    return "issues.recentLogs";
  }
  if (id === "system.ready") {
    return "issues.systemReady";
  }
  return "";
}

function diagnosticIssueTextValues(item: DiagnosticAgentIssue): DiagnosticTextValues {
  const servoId = item.id.startsWith("servo.feedback-missing.") ? item.id.slice("servo.feedback-missing.".length) : "";
  const motorChannel = item.id.startsWith("motor.feedback-missing.") ? item.id.slice("motor.feedback-missing.".length) : "";
  return {
    motorChannel,
    servoId,
    targetDeviceId: item.targetDeviceId ?? ""
  };
}

export function createDiagnosticActions(
  context: DiagnosticAgentContext,
  issues: DiagnosticAgentIssue[],
  intent: DiagnosticAgentIntent,
  text: DiagnosticTextResolver = defaultDiagnosticText
): DiagnosticAgentAction[] {
  const actions: DiagnosticAgentAction[] = [];
  const streamUrl = activeCameraStreamUrl(context, context.platformState[cameraDeviceIdForSource(context.activeCameraSource?.id)] ?? context.platformState["camera:main"]);
  const sourceId = context.activeCameraSource?.id ?? "main";

  for (const item of issues) {
    if (item.id === "pi.helper.offline" || item.id === "pi.connection.offline") {
      actions.push(commandAction(item, text("actions.checkPi.label"), text("actions.checkPi.description"), createPlatformCommand("pi.check", "pi:main")));
    }
    if (item.id === "camera.stream.not-ready") {
      actions.push(commandAction(item, text("actions.checkCamera.label"), text("actions.checkCamera.description"), createPlatformCommand("pi.camera.check", "pi:main")));
    }
    if (item.id === "camera.stream-url.missing") {
      actions.push(manualAction(item, text("actions.configureVideoSource.label"), text("actions.configureVideoSource.description"), "blocked"));
    }
    if (item.id === "firmware.helper.offline") {
      actions.push(commandAction(item, text("actions.checkFirmwareHelper.label"), text("actions.checkFirmwareHelper.description"), createPlatformCommand("firmware.helper.check", "firmware:local")));
    }
    if (item.id === "ai-vision.helper.offline") {
      actions.push(commandAction(item, text("actions.checkAiVision.label"), text("actions.checkAiVision.description"), createPlatformCommand("ai-vision.helper.check", "ai-vision:local")));
    }
    if (item.id === "ai-vision.no-detections" && streamUrl) {
      actions.push(commandAction(item, text("actions.analyzeFrame.label"), text("actions.analyzeFrame.description"), createPlatformCommand("ai-vision.analyze", "ai-vision:local", { sourceId, streamUrl })));
    }
    if (item.id.startsWith("servo.feedback-missing.") && item.targetDeviceId) {
      actions.push(commandAction(
        item,
        text("actions.readServoFeedback.label"),
        text("actions.readServoFeedback.description", { targetDeviceId: item.targetDeviceId }),
        createPlatformCommand("servo.read_feedback", item.targetDeviceId)
      ));
    }
    if (item.id.startsWith("motor.feedback-missing.") && item.targetDeviceId) {
      actions.push(commandAction(
        item,
        text("actions.readMotorFeedback.label"),
        text("actions.readMotorFeedback.description", { targetDeviceId: item.targetDeviceId }),
        createPlatformCommand("motor.read_feedback", item.targetDeviceId)
      ));
    }
    if (item.id === "serial.offline") {
      actions.push(manualAction(item, text("actions.connectSerial.label"), text("actions.connectSerial.description"), "blocked"));
    }
  }

  if (intent === "firmware") {
    actions.push(commandAction(undefined, text("actions.refreshFirmwarePorts.label"), text("actions.refreshFirmwarePorts.description"), createPlatformCommand("firmware.ports.refresh", "firmware:local")));
  }

  return dedupeActions(actions).slice(0, 6);
}

function summarizeDiagnosticResponse(
  intent: DiagnosticAgentIntent,
  issues: DiagnosticAgentIssue[],
  actions: DiagnosticAgentAction[],
  text: DiagnosticTextResolver = defaultDiagnosticText
): string {
  const blocking = issues.filter((item) => item.severity === "danger");
  const warning = issues.filter((item) => item.severity === "warning");
  const lowRisk = actions.filter((action) => action.risk === "low");
  if (blocking.length > 0) {
    return text("summaries.blocking", {
      blockingExtra: Math.max(0, blocking.length - 1),
      lowRiskCount: lowRisk.length,
      title: blocking[0].title
    });
  }
  if (warning.length > 0) {
    return text("summaries.warning", {
      hint: text(lowRisk.length > 0 ? "summaries.warningLowRiskHint" : "summaries.warningManualHint"),
      title: warning[0].title,
      warningCount: warning.length
    });
  }
  if (intent === "unknown") {
    return text("summaries.unknown");
  }
  return text("summaries.ready", {
    hint: text(lowRisk.length > 0 ? "summaries.readyLowRiskHint" : "summaries.readyManualHint")
  });
}

function commandAction(
  item: DiagnosticAgentIssue | undefined,
  label: string,
  description: string,
  command: PlatformCommand
): DiagnosticAgentAction {
  return {
    id: `action:${command.type}:${command.targetDeviceId}:${item?.id ?? "manual"}`,
    label,
    description,
    risk: classifyDiagnosticActionRisk(command),
    issueId: item?.id,
    command
  };
}

function manualAction(
  item: DiagnosticAgentIssue,
  label: string,
  description: string,
  risk: DiagnosticAgentActionRisk
): DiagnosticAgentAction {
  return {
    id: `action:manual:${item.id}`,
    label,
    description,
    risk,
    issueId: item.id
  };
}

function prioritizeIssues(issues: DiagnosticAgentIssue[], intent: DiagnosticAgentIntent): DiagnosticAgentIssue[] {
  return [...issues].sort((left, right) => issueScore(right, intent) - issueScore(left, intent));
}

function issueScore(item: DiagnosticAgentIssue, intent: DiagnosticAgentIntent): number {
  const severityScore = item.severity === "danger" ? 100 : item.severity === "warning" ? 50 : 10;
  const intentBoost =
    (intent === "camera" && item.id.startsWith("camera."))
    || (intent === "ai_vision" && item.id.startsWith("ai-vision."))
    || (intent === "servo_feedback" && item.id.startsWith("servo."))
    || (intent === "firmware" && item.id.startsWith("firmware."))
    || (intent === "pi" && item.id.startsWith("pi."))
    || (intent === "motor" && item.id.startsWith("motor."))
      ? 30
      : 0;
  return severityScore + intentBoost;
}

function issue(item: DiagnosticAgentIssue): DiagnosticAgentIssue {
  return item;
}

function dedupeIssues(issues: DiagnosticAgentIssue[]): DiagnosticAgentIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function dedupeActions(actions: DiagnosticAgentAction[]): DiagnosticAgentAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = action.command
      ? `${action.command.type}:${action.command.targetDeviceId}:${JSON.stringify(action.command.payload)}`
      : action.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function cameraDeviceIdForSource(sourceId: string | undefined): string {
  return sourceId === "secondary" ? "camera:secondary" : "camera:main";
}

function activeCameraStreamUrl(context: DiagnosticAgentContext, camera: DeviceStateSnapshot | undefined): string {
  return (context.activeCameraSource?.streamUrl ?? stringValue(camera, "streamUrl") ?? "").trim();
}

function boolValue(snapshot: DeviceStateSnapshot | undefined, key: string): boolean | null {
  const value = snapshot?.values[key];
  return typeof value === "boolean" ? value : null;
}

function numberValue(snapshot: DeviceStateSnapshot | undefined, key: string): number | null {
  const value = snapshot?.values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(snapshot: DeviceStateSnapshot | undefined, key: string): string | null {
  const value = snapshot?.values[key];
  return typeof value === "string" ? value : null;
}

function logText(entry: DiagnosticAgentLogEntry): string {
  return entry.text || entry.messageKey || `${entry.direction ?? "log"}:${entry.level ?? "info"}`;
}

function defaultDiagnosticText(key: string, values?: DiagnosticTextValues): string {
  return formatDiagnosticText(DEFAULT_DIAGNOSTIC_TEXT[key] ?? key, values);
}

function formatDiagnosticText(template: string, values: DiagnosticTextValues = {}): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, token: string) => {
    const value = values[token];
    return value === undefined ? match : String(value);
  });
}

function normalizeText(input: string): string {
  return input.trim().toLowerCase();
}

function hasAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => text.includes(token));
}
