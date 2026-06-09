import { Activity, AlertTriangle, Code2, Play, Plus, Save, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import type { PlatformCommand, PlatformCommandResult } from "@platform/commands";
import type { ComponentDefinition, PluginInstance, RobotDefinition, RobotProgram } from "@platform/architecture";
import { runWorkflow } from "@platform/workflow";
import type { RobotAssemblyStatusContext, RobotAssemblyWarning } from "@domains/robot-assembly/robotAssembly";
import {
  ROBOT_PROGRAM_BLOCK_FIELDS,
  ROBOT_PROGRAM_DEFAULT_TIMEOUT_MS,
  compileRobotProgramFromBlocks,
  createDefaultRobotProgram,
  createRobotProgramBlockOptions,
  createRobotProgramRuntimeState,
  normalizeRobotPrograms,
  type RobotProgramBlockOption,
  type RobotProgramBlockOptions,
  type RobotProgramBlockSnapshot,
  type RobotProgramCompileResult
} from "@domains/robot-assembly/robotProgram";
import {
  analyzeRobotProgramReadiness,
  analyzeRobotProgramRunResult,
  hasBlockingSmartCheckIssue,
  type SmartCheckIssue
} from "@domains/robot-assembly/robotProgramSmartCheck";

type ProgramRunState = "idle" | "running" | "done" | "error" | "aborted";

const ROBOT_PROGRAM_TEXT: Record<string, string> = {
  "programs.title": "图形化程序",
  "programs.targetPc": "PC 执行",
  "programs.newProgram": "新建程序",
  "programs.saveProgram": "保存程序",
  "programs.runProgram": "运行程序",
  "programs.deleteProgram": "删除程序",
  "programs.defaultName": "程序 {{count}}",
  "programs.preview": "预览",
  "programs.issues": "检查",
  "programs.noPreview": "没有可执行积木。",
  "programs.noIssues": "程序检查通过。",
  "programs.saveFailed": "动作程序保存失败",
  "programs.runLog.start": "运行 {{name}}",
  "programs.smartCheck.title": "智能检查",
  "programs.smartCheck.ok": "READY",
  "programs.smartCheck.ready": "智能检查通过。",
  "programs.smartCheck.blocked": "智能检查已阻止运行。",
  "programs.smartCheck.blockedCount": "{{count}} 阻塞",
  "programs.smartCheck.warningCount": "{{count}} 提示",
  "programs.smartCheck.runDiagnosis": "运行诊断",
  "programs.smartCheck.noRunIssues": "本次运行没有诊断项。",
  "programs.smartCheck.logPrefix": "智能诊断",
  "programs.smartCheck.inspectLastStep": "查看运行日志中的最后一步，再检查对应设备。",
  "programs.categories.actions": "机器人动作",
  "programs.categories.flow": "流程",
  "programs.blocks.start": "程序开始",
  "programs.blocks.motorSet": "设置电机",
  "programs.blocks.motorStop": "停止电机",
  "programs.blocks.mecanumDrive": "麦轮底盘",
  "programs.blocks.servoMove": "移动舵机",
  "programs.blocks.armPose": "发送机械臂姿态",
  "programs.blocks.cameraGimbal": "设置云台",
  "programs.blocks.wait": "等待",
  "programs.blocks.log": "记录",
  "programs.blocks.repeat": "重复",
  "programs.blocks.ifState": "如果状态",
  "programs.blocks.emergencyStop": "紧急停止",
  "programs.fields.ms": "毫秒",
  "programs.fields.speed": "速度",
  "programs.fields.forward": "前进",
  "programs.fields.strafe": "横移",
  "programs.fields.turn": "旋转",
  "programs.fields.duration": "持续",
  "programs.fields.angle": "角度",
  "programs.fields.acc": "加速度",
  "programs.fields.pan": "水平",
  "programs.fields.tilt": "俯仰",
  "programs.fields.count": "次",
  "programs.fields.message": "消息",
  "programs.fields.device": "设备",
  "programs.fields.field": "字段",
  "programs.fields.equals": "等于",
  "programs.fields.stopMode": "停止",
  "programs.stopModes.brake": "刹车",
  "programs.stopModes.coast": "滑行",
  "programs.issueMessages.noExecutableBlocks": "没有可执行积木。",
  "runLog.autoAbort": "自动中止：页面隐藏或失焦。",
  "runLog.blockedByErrors": "已被结构错误阻止。",
  "runLog.timeout": "{{timeout}} ms 后超时。",
  "runLog.done": "完成。",
  "runLog.actionFailed": "动作失败。",
  "runLog.manualAbort": "手动中止。",
  "runState.idle": "待机",
  "runState.running": "运行中",
  "runState.done": "完成",
  "runState.error": "错误",
  "runState.aborted": "已中止",
  "abort": "中止",
  "fields.name": "名称",
  "fields.timeoutMs": "超时 ms"
};

interface RobotProgramPanelProps {
  robot: RobotDefinition;
  components: ComponentDefinition[];
  pluginInstances: PluginInstance[];
  schematicWarnings: RobotAssemblyWarning[];
  statusContext: RobotAssemblyStatusContext;
  onSavePrograms: (programs: RobotProgram[]) => Promise<void>;
  dispatchPlatformCommand?: (command: PlatformCommand) => Promise<PlatformCommandResult>;
}

export function RobotProgramPanel({
  robot,
  components,
  pluginInstances,
  schematicWarnings,
  statusContext,
  onSavePrograms,
  dispatchPlatformCommand
}: RobotProgramPanelProps) {
  const { t } = useTranslation();
  function programText(key: string, values: Record<string, unknown> = {}) {
    return t(`robotAssembly.${key}`, {
      defaultValue: ROBOT_PROGRAM_TEXT[key] ?? key,
      ...values
    });
  }

  function programIssueText(message: string) {
    if (message === "Program has no executable blocks.") {
      return programText("programs.issueMessages.noExecutableBlocks");
    }
    return compactProgramIds(message);
  }

  const context = useMemo(() => ({ robot, components, pluginInstances }), [components, pluginInstances, robot]);
  const programs = useMemo(() => normalizeRobotPrograms(robot.config?.programs), [robot.config?.programs]);
  const blockOptions = useMemo(() => createRobotProgramBlockOptions(context), [context]);
  const blockOptionSignature = useMemo(() => JSON.stringify(blockOptions), [blockOptions]);
  const [selectedProgramId, setSelectedProgramId] = useState(programs[0]?.id ?? "");
  const selectedProgram = programs.find((program) => program.id === selectedProgramId) ?? programs[0] ?? createDefaultRobotProgram(0);
  const [programName, setProgramName] = useState(selectedProgram.name);
  const [timeoutMs, setTimeoutMs] = useState(selectedProgram.timeoutMs);
  const [compileResult, setCompileResult] = useState<RobotProgramCompileResult>(() => compileRobotProgramFromBlocks(selectedProgram, null, context));
  const [runState, setRunState] = useState<ProgramRunState>("idle");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [runSmartIssues, setRunSmartIssues] = useState<SmartCheckIssue[]>([]);
  const [saveError, setSaveError] = useState("");
  const workspaceHostRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const abortRef = useRef(false);

  const blockingWarnings = schematicWarnings.filter((warning) => warning.severity === "error");
  const runtimeState = useMemo(() => createRobotProgramRuntimeState(context, statusContext), [context, statusContext]);
  const smartReadinessIssues = useMemo(() => analyzeRobotProgramReadiness({
    workflow: compileResult.workflow,
    commandCount: compileResult.commandCount,
    compileIssues: compileResult.issues,
    schematicWarnings,
    runtimeState,
    dispatchAvailable: Boolean(dispatchPlatformCommand),
    serialConnected: statusContext.connected,
    timeoutMs: normalizeTimeout(timeoutMs)
  }), [compileResult, dispatchPlatformCommand, runtimeState, schematicWarnings, statusContext.connected, timeoutMs]);
  const smartBlockingCount = smartReadinessIssues.filter((issue) => issue.blocksRun).length;
  const smartBlocksRun = hasBlockingSmartCheckIssue(smartReadinessIssues);
  const runDisabled = smartBlocksRun || blockingWarnings.length > 0 || compileResult.blocked || runState === "running" || !dispatchPlatformCommand;

  useEffect(() => {
    if (!programs.some((program) => program.id === selectedProgramId)) {
      setSelectedProgramId(programs[0]?.id ?? "");
    }
  }, [programs, selectedProgramId]);

  useEffect(() => {
    setProgramName(selectedProgram.name);
    setTimeoutMs(selectedProgram.timeoutMs);
  }, [selectedProgram.id, selectedProgram.name, selectedProgram.timeoutMs]);

  useEffect(() => {
    const host = workspaceHostRef.current;
    if (!host) {
      return;
    }
    defineRobotProgramBlocks(Blockly, blockOptions, {
      start: programText("programs.blocks.start"),
      motorSet: programText("programs.blocks.motorSet"),
      motorStop: programText("programs.blocks.motorStop"),
      mecanumDrive: programText("programs.blocks.mecanumDrive"),
      servoMove: programText("programs.blocks.servoMove"),
      armPose: programText("programs.blocks.armPose"),
      cameraGimbal: programText("programs.blocks.cameraGimbal"),
      wait: programText("programs.blocks.wait"),
      log: programText("programs.blocks.log"),
      repeat: programText("programs.blocks.repeat"),
      ifState: programText("programs.blocks.ifState"),
      emergencyStop: programText("programs.blocks.emergencyStop"),
      ms: programText("programs.fields.ms"),
      speed: programText("programs.fields.speed"),
      forward: programText("programs.fields.forward"),
      strafe: programText("programs.fields.strafe"),
      turn: programText("programs.fields.turn"),
      duration: programText("programs.fields.duration"),
      angle: programText("programs.fields.angle"),
      acc: programText("programs.fields.acc"),
      pan: programText("programs.fields.pan"),
      tilt: programText("programs.fields.tilt"),
      count: programText("programs.fields.count"),
      message: programText("programs.fields.message"),
      device: programText("programs.fields.device"),
      field: programText("programs.fields.field"),
      equals: programText("programs.fields.equals"),
      stopMode: programText("programs.fields.stopMode"),
      brake: programText("programs.stopModes.brake"),
      coast: programText("programs.stopModes.coast")
    });
    const workspace = Blockly.inject(host, {
      toolbox: createToolbox(programText),
      trashcan: true,
      scrollbars: true,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.85, maxScale: 1.2, minScale: 0.55, scaleSpeed: 1.1 }
    });
    workspaceRef.current = workspace;
    loadWorkspace(workspace, selectedProgram.blocklyWorkspaceJson);
    const refreshCompile = () => {
      setCompileResult(compileCurrentWorkspace(workspace, selectedProgram, context));
    };
    workspace.addChangeListener(refreshCompile);
    refreshCompile();
    Blockly.svgResize(workspace);
    return () => {
      workspace.removeChangeListener(refreshCompile);
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [blockOptionSignature, context, selectedProgram.id, t]);

  useEffect(() => {
    function handleAbort() {
      if (runState === "running") {
        abortRef.current = true;
        setRunState("aborted");
        setRunLog((current) => [...current, programText("runLog.autoAbort")]);
      }
    }
    window.addEventListener("blur", handleAbort);
    document.addEventListener("visibilitychange", handleAbort);
    return () => {
      window.removeEventListener("blur", handleAbort);
      document.removeEventListener("visibilitychange", handleAbort);
    };
  }, [runState, t]);

  async function saveCurrentProgram() {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    const workspaceJson = Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>;
    const result = compileCurrentWorkspace(workspace, selectedProgram, context);
    setCompileResult(result);
    const updated: RobotProgram = {
      ...selectedProgram,
      name: programName.trim() || selectedProgram.name,
      timeoutMs: normalizeTimeout(timeoutMs),
      target: "pc",
      blocklyWorkspaceJson: workspaceJson,
      workflow: result.workflow,
      updatedAt: Date.now()
    };
    const next = programs.some((program) => program.id === updated.id)
      ? programs.map((program) => (program.id === updated.id ? updated : program))
      : [updated, ...programs];
    try {
      setSaveError("");
      await onSavePrograms(next);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : programText("programs.saveFailed"));
    }
  }

  async function runCurrentProgram() {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    const result = compileCurrentWorkspace(workspace, selectedProgram, context);
    setCompileResult(result);
    const currentRuntimeState = createRobotProgramRuntimeState(context, statusContext);
    const currentReadinessIssues = analyzeRobotProgramReadiness({
      workflow: result.workflow,
      commandCount: result.commandCount,
      compileIssues: result.issues,
      schematicWarnings,
      runtimeState: currentRuntimeState,
      dispatchAvailable: Boolean(dispatchPlatformCommand),
      serialConnected: statusContext.connected,
      timeoutMs: normalizeTimeout(timeoutMs)
    });
    const blockingSmartIssues = currentReadinessIssues.filter((issue) => issue.blocksRun);
    if (blockingSmartIssues.length > 0) {
      setRunState("error");
      setRunSmartIssues([]);
      setRunLog([programText("programs.smartCheck.blocked"), ...blockingSmartIssues.map((issue) => smartIssueLogLine(issue, programText("programs.smartCheck.logPrefix")))]);
      return;
    }
    if (!dispatchPlatformCommand) {
      return;
    }
    abortRef.current = false;
    setRunState("running");
    setRunSmartIssues([]);
    setRunLog([programText("programs.runLog.start", { name: programName.trim() || selectedProgram.name })]);
    const timeout = window.setTimeout(() => {
      abortRef.current = true;
      setRunState("aborted");
      setRunLog((current) => [...current, programText("runLog.timeout", { timeout: normalizeTimeout(timeoutMs) })]);
    }, normalizeTimeout(timeoutMs));
    try {
      const workflowResult = await runWorkflow(result.workflow, {
        dispatchCommand: async (command) => {
          const commandResult = await dispatchPlatformCommand(command);
          setRunLog((current) => [...current, `${command.type} -> ${commandResult.status}`]);
          return commandResult;
        },
        log: (message) => setRunLog((current) => [...current, message]),
        wait: (ms) => waitWithAbort(ms, abortRef),
        shouldAbort: () => abortRef.current,
        stopOnCommandFailure: true,
        state: currentRuntimeState
      });
      const smartRunIssues = analyzeRobotProgramRunResult({
        workflow: result.workflow,
        runResult: workflowResult,
        runtimeState: currentRuntimeState
      });
      setRunSmartIssues(smartRunIssues);
      if (smartRunIssues.length > 0) {
        setRunLog((current) => [...current, ...smartRunIssues.slice(0, 4).map((issue) => smartIssueLogLine(issue, programText("programs.smartCheck.logPrefix")))]);
      }
      if (abortRef.current) {
        setRunState("aborted");
        return;
      }
      if (workflowResult.status === "completed") {
        setRunState("done");
        setRunLog((current) => [...current, programText("runLog.done")]);
      } else {
        setRunState("error");
        setRunLog((current) => [...current, workflowResult.message ?? programText("runLog.actionFailed")]);
      }
    } catch (error) {
      setRunState(abortRef.current ? "aborted" : "error");
      setRunSmartIssues(abortRef.current ? [] : [{
        id: "run.exception",
        severity: "danger",
        title: programText("runLog.actionFailed"),
        message: error instanceof Error ? error.message : programText("runLog.actionFailed"),
        actionHint: programText("programs.smartCheck.inspectLastStep"),
        blocksRun: false
      }]);
      setRunLog((current) => [...current, error instanceof Error ? error.message : programText("runLog.actionFailed")]);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function addProgram() {
    const nextProgram = {
      ...createDefaultRobotProgram(programs.length),
      id: `program:${Date.now().toString(36)}`,
      name: programText("programs.defaultName", { count: programs.length + 1 })
    };
    await onSavePrograms([...programs, nextProgram]);
    setSelectedProgramId(nextProgram.id);
  }

  async function deleteProgram() {
    const fallback = createDefaultRobotProgram(0);
    const next = programs.filter((program) => program.id !== selectedProgram.id);
    await onSavePrograms(next.length > 0 ? next : [fallback]);
    setSelectedProgramId(next[0]?.id ?? fallback.id);
  }

  function abortProgram() {
    abortRef.current = true;
    setRunState("aborted");
    setRunLog((current) => [...current, programText("runLog.manualAbort")]);
  }

  function smartReadinessSummary() {
    if (smartBlockingCount > 0) {
      return programText("programs.smartCheck.blockedCount", { count: smartBlockingCount });
    }
    if (smartReadinessIssues.length > 0) {
      return programText("programs.smartCheck.warningCount", { count: smartReadinessIssues.length });
    }
    return programText("programs.smartCheck.ok");
  }

  function renderSmartIssue(issue: SmartCheckIssue) {
    return (
      <p className={`robot-smart-check-issue robot-assembly-warning ${smartIssueClass(issue)}`} key={issue.id} title={issue.message}>
        <strong>{issue.title}</strong>
        <span>{compactProgramIds(issue.message)}</span>
        {issue.actionHint ? <small>{compactProgramIds(issue.actionHint)}</small> : null}
      </p>
    );
  }

  return (
    <section className="robot-program-panel">
      <div className="robot-assembly-panel-head">
        <span><Code2 size={17} />{programText("programs.title")}</span>
        <div className="robot-program-actions">
          <span className="platform-status-pill standby">{programText("programs.targetPc")}</span>
          <button className="icon-button" onClick={() => void addProgram()} type="button"><Plus size={16} /><span>{programText("programs.newProgram")}</span></button>
          <button className="icon-button" onClick={() => void saveCurrentProgram()} type="button"><Save size={16} /><span>{programText("programs.saveProgram")}</span></button>
          {runState === "running" ? (
            <button className="icon-button danger" onClick={abortProgram} type="button"><Square size={16} /><span>{programText("abort")}</span></button>
          ) : (
            <button className="icon-button primary" disabled={runDisabled} onClick={() => void runCurrentProgram()} type="button"><Play size={16} /><span>{programText("programs.runProgram")}</span></button>
          )}
        </div>
      </div>
      <div className="robot-program-grid">
        <aside className="robot-program-list">
          {programs.map((program) => (
            <button className={program.id === selectedProgram.id ? "selected" : ""} key={program.id} onClick={() => setSelectedProgramId(program.id)} type="button">
              <strong>{program.name}</strong>
              <small>{program.target.toUpperCase()} / {program.workflow.nodes.length} nodes</small>
            </button>
          ))}
        </aside>
        <div className="robot-program-editor">
          <div className="robot-program-fields">
            <label><span>{programText("fields.name")}</span><input value={programName} onChange={(event) => setProgramName(event.target.value)} /></label>
            <label><span>{programText("fields.timeoutMs")}</span><input value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} /></label>
            <button className="icon-button danger" disabled={programs.length <= 1} onClick={() => void deleteProgram()} type="button"><Trash2 size={16} /><span>{programText("programs.deleteProgram")}</span></button>
          </div>
          <div className="robot-program-blockly" ref={workspaceHostRef} />
        </div>
        <aside className="robot-program-side">
          <div className={`robot-assembly-run-log state-${runState}`}>
            <div><Activity size={15} /><span>{programText(`runState.${runState}`)}</span></div>
            <pre>{runLog.slice(-9).join("\n")}</pre>
          </div>
          <div className="robot-program-smart-check">
            <div className="robot-assembly-panel-head"><span><ShieldCheck size={15} />{programText("programs.smartCheck.title")}</span><small>{smartReadinessSummary()}</small></div>
            {smartReadinessIssues.length === 0 ? <small className="robot-assembly-muted">{programText("programs.smartCheck.ready")}</small> : null}
            {smartReadinessIssues.slice(0, 8).map(renderSmartIssue)}
          </div>
          <div className="robot-program-smart-check">
            <div className="robot-assembly-panel-head"><span><Activity size={15} />{programText("programs.smartCheck.runDiagnosis")}</span><small>{runSmartIssues.length}</small></div>
            {runSmartIssues.length === 0 ? <small className="robot-assembly-muted">{programText("programs.smartCheck.noRunIssues")}</small> : null}
            {runSmartIssues.slice(0, 6).map(renderSmartIssue)}
          </div>
          <div className="robot-program-preview">
            <div className="robot-assembly-panel-head"><span><Play size={15} />{programText("programs.preview")}</span><small>{compileResult.commandCount}</small></div>
            {compileResult.previewLines.length === 0 ? <small className="robot-assembly-muted">{programText("programs.noPreview")}</small> : null}
            <ol>{compileResult.previewLines.slice(0, 12).map((line, index) => <li key={`${line}:${index}`}>{line}</li>)}</ol>
          </div>
          <div className="robot-program-issues">
            <div className="robot-assembly-panel-head"><span><AlertTriangle size={15} />{programText("programs.issues")}</span><small>{compileResult.issues.length + blockingWarnings.length}</small></div>
            {saveError ? <p className="robot-assembly-warning error">{saveError}</p> : null}
            {blockingWarnings.map((warning) => <p className="robot-assembly-warning error" key={warning.id} title={warning.message}>{compactProgramIds(warning.message)}</p>)}
            {compileResult.issues.map((issue, index) => <p className={`robot-assembly-warning ${issue.severity}`} key={`${issue.message}:${index}`} title={issue.message}>{programIssueText(issue.message)}</p>)}
            {!saveError && blockingWarnings.length === 0 && compileResult.issues.length === 0 ? <small className="robot-assembly-muted">{programText("programs.noIssues")}</small> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}

function compileCurrentWorkspace(workspace: Blockly.WorkspaceSvg, program: Pick<RobotProgram, "id" | "name">, context: { robot: RobotDefinition; components: ComponentDefinition[]; pluginInstances: PluginInstance[] }) {
  return compileRobotProgramFromBlocks(program, workspaceToSnapshot(workspace), context);
}

function smartIssueClass(issue: SmartCheckIssue): "error" | "warning" {
  return issue.severity === "danger" ? "error" : "warning";
}

function smartIssueLogLine(issue: SmartCheckIssue, prefix: string) {
  return `${prefix}: ${issue.title} - ${issue.actionHint ?? issue.message}`;
}

function workspaceToSnapshot(workspace: Blockly.WorkspaceSvg): RobotProgramBlockSnapshot | null {
  const topBlocks = workspace.getTopBlocks(true);
  const start = topBlocks.find((block) => block.type === "robot_program_start") ?? topBlocks[0] ?? null;
  return start ? blockToSnapshot(start) : null;
}

function blockToSnapshot(block: Blockly.Block): RobotProgramBlockSnapshot {
  const fieldNames = ROBOT_PROGRAM_BLOCK_FIELDS[block.type] ?? [];
  const fields = Object.fromEntries(fieldNames.map((field) => [field, block.getFieldValue(field)]));
  const inputs: Record<string, RobotProgramBlockSnapshot | null> = {};
  for (const inputName of ["DO"]) {
    const child = block.getInputTargetBlock(inputName);
    if (child) {
      inputs[inputName] = blockToSnapshot(child);
    }
  }
  const next = block.getNextBlock();
  return {
    id: block.id,
    type: block.type,
    fields,
    inputs,
    next: next ? blockToSnapshot(next) : null
  };
}

function loadWorkspace(workspace: Blockly.WorkspaceSvg, workspaceJson: Record<string, unknown> | null) {
  workspace.clear();
  const fallbackWorkspaceJson = createDefaultRobotProgram(0).blocklyWorkspaceJson ?? {};
  try {
    Blockly.serialization.workspaces.load(workspaceJson ?? fallbackWorkspaceJson, workspace);
  } catch {
    Blockly.serialization.workspaces.load(fallbackWorkspaceJson, workspace);
  }
}

function compactProgramIds(value: string) {
  return value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (id) => `${id.slice(0, 8)}...`);
}

function createToolbox(text: (key: string) => string) {
  return {
    kind: "categoryToolbox",
    contents: [
      {
        kind: "category",
        name: text("programs.categories.actions"),
        colour: "205",
        contents: [
          { kind: "block", type: "robot_motor_set" },
          { kind: "block", type: "robot_motor_stop" },
          { kind: "block", type: "robot_mecanum_drive" },
          { kind: "block", type: "robot_servo_move" },
          { kind: "block", type: "robot_arm_pose" },
          { kind: "block", type: "robot_camera_gimbal" },
          { kind: "block", type: "robot_emergency_stop" }
        ]
      },
      {
        kind: "category",
        name: text("programs.categories.flow"),
        colour: "120",
        contents: [
          { kind: "block", type: "robot_wait" },
          { kind: "block", type: "robot_log" },
          { kind: "block", type: "robot_repeat" },
          { kind: "block", type: "robot_if_state" }
        ]
      }
    ]
  };
}

function defineRobotProgramBlocks(blockly: typeof Blockly, options: RobotProgramBlockOptions, labels: Record<string, string>) {
  const dropdown = (items: RobotProgramBlockOption[]) => items.map((item) => [item.label, item.value] as [string, string]);
  const stopModes: Array<[string, string]> = [[labels.brake, "brake"], [labels.coast, "coast"]];
  blockly.Blocks.robot_program_start = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.start);
      this.appendStatementInput("DO");
      this.setColour(205);
      this.setDeletable(false);
    }
  };
  blockly.Blocks.robot_motor_set = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.motorSet).appendField(new blockly.FieldDropdown(dropdown(options.motors)), "PLUGIN");
      this.appendDummyInput().appendField(labels.speed).appendField(new blockly.FieldNumber(40, -100, 100, 1), "SPEED").appendField("%").appendField(labels.stopMode).appendField(new blockly.FieldDropdown(stopModes), "STOP_MODE");
      statementBlock(this, 205);
    }
  };
  blockly.Blocks.robot_motor_stop = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.motorStop).appendField(new blockly.FieldDropdown(dropdown(options.motors)), "PLUGIN").appendField(labels.stopMode).appendField(new blockly.FieldDropdown(stopModes), "STOP_MODE");
      statementBlock(this, 205);
    }
  };
  blockly.Blocks.robot_mecanum_drive = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.mecanumDrive).appendField(new blockly.FieldDropdown(dropdown(options.mecanumDrives)), "COMPONENT");
      this.appendDummyInput()
        .appendField(labels.forward).appendField(new blockly.FieldNumber(0.5, -1, 1, 0.1), "FORWARD")
        .appendField(labels.strafe).appendField(new blockly.FieldNumber(0, -1, 1, 0.1), "STRAFE")
        .appendField(labels.turn).appendField(new blockly.FieldNumber(0, -1, 1, 0.1), "TURN");
      this.appendDummyInput()
        .appendField(labels.speed).appendField(new blockly.FieldNumber(60, 0, 100, 1), "SPEED").appendField("%")
        .appendField(labels.duration).appendField(new blockly.FieldNumber(0, 0, 60000, 100), "DURATION").appendField(labels.ms)
        .appendField(labels.stopMode).appendField(new blockly.FieldDropdown(stopModes), "STOP_MODE");
      statementBlock(this, 205);
    }
  };
  blockly.Blocks.robot_servo_move = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.servoMove).appendField(new blockly.FieldDropdown(dropdown(options.servos)), "PLUGIN");
      this.appendDummyInput().appendField(labels.angle).appendField(new blockly.FieldNumber(90, 0, 360, 1), "ANGLE").appendField(labels.speed).appendField(new blockly.FieldNumber(600, 0, 4095, 1), "SPEED").appendField(labels.acc).appendField(new blockly.FieldNumber(30, 0, 254, 1), "ACC");
      statementBlock(this, 205);
    }
  };
  blockly.Blocks.robot_arm_pose = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.armPose).appendField(new blockly.FieldDropdown(dropdown(options.armComponents)), "COMPONENT");
      statementBlock(this, 205);
    }
  };
  blockly.Blocks.robot_camera_gimbal = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.cameraGimbal).appendField(new blockly.FieldDropdown(dropdown(options.cameras)), "TARGET");
      this.appendDummyInput().appendField(labels.pan).appendField(new blockly.FieldNumber(180, 0, 360, 1), "PAN").appendField(labels.tilt).appendField(new blockly.FieldNumber(180, 0, 360, 1), "TILT");
      statementBlock(this, 205);
    }
  };
  blockly.Blocks.robot_wait = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.wait).appendField(new blockly.FieldNumber(500, 0, 60000, 100), "MS").appendField(labels.ms);
      statementBlock(this, 120);
    }
  };
  blockly.Blocks.robot_log = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.log).appendField(new blockly.FieldTextInput("checkpoint"), "MESSAGE");
      statementBlock(this, 120);
    }
  };
  blockly.Blocks.robot_repeat = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.repeat).appendField(new blockly.FieldNumber(2, 1, 12, 1), "COUNT").appendField(labels.count);
      this.appendStatementInput("DO");
      statementBlock(this, 120);
    }
  };
  blockly.Blocks.robot_if_state = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.ifState).appendField(new blockly.FieldDropdown(dropdown(options.conditionDevices)), "DEVICE");
      this.appendDummyInput().appendField(labels.field).appendField(new blockly.FieldDropdown([["status", "status"], ["moving", "moving"], ["commandedSpeedPercent", "commandedSpeedPercent"], ["connectionReady", "connectionReady"]] as Array<[string, string]>), "FIELD").appendField(labels.equals).appendField(new blockly.FieldTextInput("online"), "EQUALS");
      this.appendStatementInput("DO");
      statementBlock(this, 120);
    }
  };
  blockly.Blocks.robot_emergency_stop = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(labels.emergencyStop);
      statementBlock(this, 0);
    }
  };
}

function statementBlock(block: Blockly.Block, colour: number) {
  block.setPreviousStatement(true);
  block.setNextStatement(true);
  block.setColour(colour);
}

function normalizeTimeout(value: number): number {
  return Number.isFinite(value) ? Math.min(120_000, Math.max(500, Math.round(value))) : ROBOT_PROGRAM_DEFAULT_TIMEOUT_MS;
}

function waitWithAbort(ms: number, abortRef: { current: boolean }) {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + Math.max(0, ms);
    function tick() {
      if (abortRef.current) {
        reject(new Error("Program aborted."));
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.setTimeout(tick, Math.min(100, remaining));
    }
    tick();
  });
}
