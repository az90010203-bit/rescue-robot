import { Activity, AlertTriangle, Boxes, Cable, CircleDot, Cpu, Eye, EyeOff, GitBranch, Link2, MousePointer2, Play, PlugZap, Plus, Power, Radio, Save, Square, Trash2, Unplug, Zap } from "lucide-react";
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MotorTarget } from "../../lib/protocol";
import type { PlatformCommandResult, PlatformCommandType } from "../../platform/commands";
import type {
  ComponentDefinition,
  PluginInstance,
  PluginUsage,
  RobotActionButton,
  RobotActionButtonStep,
  RobotAssemblyConfig,
  RobotAssemblyEdge,
  RobotAssemblyHarness,
  RobotAssemblyNode,
  RobotAssemblyNodeSourceType,
  RobotAssemblyPort,
  RobotDefinition
} from "../../platform/architecture";
import {
  effectivePluginInstancesForComponent,
  pluginInstanceDeviceId,
  pluginInstancesToMotorProfiles
} from "../../platform/architecture";
import type { MotorFeedbackMap, ServoFeedbackMap } from "../../platform/stateStore";
import {
  ROBOT_ASSEMBLY_CANVAS_HEIGHT,
  ROBOT_ASSEMBLY_CANVAS_WIDTH,
  ROBOT_ASSEMBLY_HARDWARE_TEMPLATES,
  addSourceToAssembly,
  createActionButtonPreview,
  createAssemblyEdge,
  createDefaultActionButton,
  deleteAssemblyEdge,
  edgeDisplayLabel,
  flattenActionSteps,
  motionToneForNode,
  motionToneForPlugin,
  motorSpeedForPlugin,
  moveAssemblyNode,
  nodePorts,
  normalizeRobotActionButtons,
  normalizeRobotAssemblyConfig,
  removeSourceFromAssembly,
  robotEffectivePluginIds,
  sourceLabel,
  sourceNodeId,
  toggleHarnessHidden,
  updateAssemblyEdge,
  upsertAssemblyHarness,
  validateRobotAssembly,
  type RobotAssemblyContext,
  type RobotAssemblySource
} from "./robotAssembly";

const SOURCE_DRAG_MIME = "application/x-rescue-robot-source";

interface RobotAssemblyWorkspaceProps {
  robot: RobotDefinition;
  robots: RobotDefinition[];
  components: ComponentDefinition[];
  pluginInstances: PluginInstance[];
  usage: Map<string, PluginUsage[]>;
  driveTargets: MotorTarget[];
  motorFeedback: MotorFeedbackMap;
  servoFeedback: ServoFeedbackMap;
  onSaveRobot: (robotId: string, patch: Partial<RobotDefinition>) => Promise<RobotDefinition>;
  onRunPluginCommand?: (instance: PluginInstance, commandType: PlatformCommandType, payload?: Record<string, unknown>) => Promise<PlatformCommandResult>;
  renderPluginDebug: (instance: PluginInstance) => ReactNode;
}

type SelectedAssemblyItem =
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "port"; id: string }
  | { type: "action"; id: string };

type SaveState = "idle" | "saving" | "error";
type ActionRunState = "idle" | "preview" | "running" | "done" | "error" | "aborted";

export function RobotAssemblyWorkspace({
  robot,
  robots,
  components,
  pluginInstances,
  usage,
  driveTargets,
  motorFeedback,
  servoFeedback,
  onSaveRobot,
  onRunPluginCommand,
  renderPluginDebug
}: RobotAssemblyWorkspaceProps) {
  const context = useMemo<RobotAssemblyContext>(() => ({ robot, components, pluginInstances }), [components, pluginInstances, robot]);
  const normalizedFromRobot = useMemo(() => normalizeRobotAssemblyConfig(robot.config?.assembly, context), [context, robot.config]);
  const actionButtonsFromRobot = useMemo(() => normalizeRobotActionButtons(robot.config?.actionButtons, pluginInstances), [pluginInstances, robot.config]);
  const gridPatternId = useMemo(() => `robot-assembly-grid-${safeSvgId(robot.id)}`, [robot.id]);
  const [assembly, setAssembly] = useState<RobotAssemblyConfig>(() => normalizedFromRobot);
  const [actionButtons, setActionButtons] = useState<RobotActionButton[]>(() => actionButtonsFromRobot);
  const [selected, setSelected] = useState<SelectedAssemblyItem | null>(null);
  const [connectFromPortId, setConnectFromPortId] = useState<string | null>(null);
  const [debugPluginId, setDebugPluginId] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [runState, setRunState] = useState<ActionRunState>("idle");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [previewActionId, setPreviewActionId] = useState("");
  const abortRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const lastSavedSignatureRef = useRef("");
  const lastSavedActionsSignatureRef = useRef("");
  const assemblyRef = useRef(assembly);
  const draggingRef = useRef<{
    nodeId: string;
    pointerId: number;
    startPoint: { x: number; y: number };
    startNode: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const statusContext = useMemo(() => ({ driveTargets, motorFeedback, servoFeedback }), [driveTargets, motorFeedback, servoFeedback]);
  const componentById = useMemo(() => new Map(components.map((component) => [component.id, component])), [components]);
  const pluginById = useMemo(() => new Map(pluginInstances.map((plugin) => [plugin.id, plugin])), [pluginInstances]);
  const portById = useMemo(() => new Map((assembly.ports ?? []).map((port) => [port.id, port])), [assembly.ports]);
  const nodeById = useMemo(() => new Map(assembly.nodes.map((node) => [node.id, node])), [assembly.nodes]);
  const harnessById = useMemo(() => new Map((assembly.harnesses ?? []).map((harness) => [harness.id, harness])), [assembly.harnesses]);
  const effectivePluginIds = useMemo(() => robotEffectivePluginIds(robot, components), [components, robot]);
  const warnings = useMemo(() => validateRobotAssembly(assembly), [assembly]);
  const blockingWarnings = warnings.filter((item) => item.severity === "error");
  const selectedNode = selected?.type === "node" ? assembly.nodes.find((node) => node.id === selected.id) ?? null : null;
  const selectedEdge = selected?.type === "edge" ? assembly.edges.find((edge) => edge.id === selected.id) ?? null : null;
  const selectedPort = selected?.type === "port" ? portById.get(selected.id) ?? null : null;
  const selectedAction = selected?.type === "action" ? actionButtons.find((button) => button.id === selected.id) ?? null : null;
  const selectedPlugin = selectedNode?.sourceType === "plugin" ? pluginById.get(selectedNode.sourceId) ?? null : null;
  const selectedComponent = selectedNode?.sourceType === "component" ? componentById.get(selectedNode.sourceId) ?? null : null;
  const debugPlugin = selectedPlugin ?? (debugPluginId ? pluginById.get(debugPluginId) ?? null : null);
  const previewAction = previewActionId ? actionButtons.find((button) => button.id === previewActionId) ?? null : null;
  const preview = previewAction ? createActionButtonPreview(previewAction, pluginInstances, warnings) : null;

  useEffect(() => {
    assemblyRef.current = assembly;
  }, [assembly]);

  useEffect(() => {
    const signature = assemblySignature(normalizedFromRobot);
    if (signature === lastSavedSignatureRef.current) {
      return;
    }
    setAssembly(normalizedFromRobot);
    assemblyRef.current = normalizedFromRobot;
    setSelected(null);
    setDebugPluginId("");
    setConnectFromPortId(null);
    lastSavedSignatureRef.current = signature;
  }, [normalizedFromRobot, robot.id]);

  useEffect(() => {
    const signature = JSON.stringify(actionButtonsFromRobot);
    if (signature === lastSavedActionsSignatureRef.current) {
      return;
    }
    setActionButtons(actionButtonsFromRobot);
    lastSavedActionsSignatureRef.current = signature;
  }, [actionButtonsFromRobot, robot.id]);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    function handleSafetyAbort() {
      if (runState === "running") {
        abortRef.current = true;
        setRunState("aborted");
        setRunLog((current) => [...current, "Auto abort: page hidden or blurred."]);
      }
    }
    window.addEventListener("blur", handleSafetyAbort);
    document.addEventListener("visibilitychange", handleSafetyAbort);
    return () => {
      window.removeEventListener("blur", handleSafetyAbort);
      document.removeEventListener("visibilitychange", handleSafetyAbort);
    };
  }, [runState]);

  function setAssemblyState(next: RobotAssemblyConfig) {
    assemblyRef.current = next;
    setAssembly(next);
  }

  function scheduleAssemblySave(next: RobotAssemblyConfig) {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveAssemblyNow(next);
    }, 420);
  }

  async function saveAssemblyNow(next: RobotAssemblyConfig, patch: Partial<Pick<RobotDefinition, "componentIds" | "pluginInstanceIds">> = {}) {
    const signature = assemblySignature(next);
    lastSavedSignatureRef.current = signature;
    setSaveState("saving");
    setError("");
    try {
      await onSaveRobot(robot.id, {
        ...patch,
        config: {
          ...(robot.config ?? {}),
          assembly: next,
          actionButtons
        }
      });
      setSaveState("idle");
    } catch (nextError) {
      setSaveState("error");
      setError(nextError instanceof Error ? nextError.message : "Robot schematic save failed");
    }
  }

  async function saveActionButtonsNow(next: RobotActionButton[]) {
    lastSavedActionsSignatureRef.current = JSON.stringify(next);
    setSaveState("saving");
    setError("");
    try {
      await onSaveRobot(robot.id, {
        config: {
          ...(robot.config ?? {}),
          assembly,
          actionButtons: next
        }
      });
      setSaveState("idle");
    } catch (nextError) {
      setSaveState("error");
      setError(nextError instanceof Error ? nextError.message : "Action buttons save failed");
    }
  }

  function commitAssembly(next: RobotAssemblyConfig, options: { save?: boolean } = {}) {
    setAssemblyState(next);
    if (options.save !== false) {
      scheduleAssemblySave(next);
    }
  }

  function commitActionButtons(next: RobotActionButton[]) {
    setActionButtons(next);
    void saveActionButtonsNow(next);
  }

  function canvasPoint(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * ROBOT_ASSEMBLY_CANVAS_WIDTH,
      y: ((clientY - rect.top) / rect.height) * ROBOT_ASSEMBLY_CANVAS_HEIGHT
    };
  }

  function handleDrop(event: DragEvent<SVGSVGElement>) {
    event.preventDefault();
    const source = parseDraggedSource(event);
    if (!source) {
      return;
    }
    const point = canvasPoint(event.clientX, event.clientY);
    void addSource(source, { x: point.x - 105, y: point.y - 68 });
  }

  async function addSource(source: RobotAssemblySource, point: { x: number; y: number }) {
    const nextComponentIds = source.sourceType === "component" && !robot.componentIds.includes(source.sourceId)
      ? [...robot.componentIds, source.sourceId]
      : robot.componentIds;
    const nextPluginIds = source.sourceType === "plugin" && !effectivePluginIds.has(source.sourceId)
      ? [...robot.pluginInstanceIds, source.sourceId]
      : robot.pluginInstanceIds;
    const nextRobot = { ...robot, componentIds: nextComponentIds, pluginInstanceIds: nextPluginIds };
    const nextContext = { robot: nextRobot, components, pluginInstances };
    const nextAssembly = addSourceToAssembly(assemblyRef.current, source, point, nextContext);
    setAssemblyState(nextAssembly);
    const nodeId = sourceNodeId(source.sourceType, source.sourceId);
    setSelected({ type: "node", id: nodeId });
    setDebugPluginId(source.sourceType === "plugin" ? source.sourceId : "");
    await saveAssemblyNow(nextAssembly, {
      componentIds: nextComponentIds,
      pluginInstanceIds: nextPluginIds
    });
  }

  function startNodeDrag(event: ReactPointerEvent<SVGGElement>, node: RobotAssemblyNode) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const point = canvasPoint(event.clientX, event.clientY);
    draggingRef.current = {
      nodeId: node.id,
      pointerId: event.pointerId,
      startPoint: point,
      startNode: { x: node.x, y: node.y },
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = draggingRef.current;
    if (!drag) {
      return;
    }
    const point = canvasPoint(event.clientX, event.clientY);
    const deltaX = point.x - drag.startPoint.x;
    const deltaY = point.y - drag.startPoint.y;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      drag.moved = true;
    }
    setAssemblyState(moveAssemblyNode(assemblyRef.current, drag.nodeId, { x: drag.startNode.x + deltaX, y: drag.startNode.y + deltaY }));
  }

  function finishPointerInteraction() {
    const drag = draggingRef.current;
    if (!drag) {
      return;
    }
    draggingRef.current = null;
    if (drag.moved) {
      scheduleAssemblySave(assemblyRef.current);
    }
  }

  function selectNode(node: RobotAssemblyNode) {
    const drag = draggingRef.current;
    if (drag?.moved) {
      return;
    }
    setSelected({ type: "node", id: node.id });
    setDebugPluginId(node.sourceType === "plugin" ? node.sourceId : "");
  }

  function selectOrConnectPort(port: RobotAssemblyPort) {
    if (connectFromPortId && connectFromPortId !== port.id) {
      const next = createAssemblyEdge(assemblyRef.current, connectFromPortId, port.id);
      commitAssembly(next);
      const created = next.edges[next.edges.length - 1];
      setSelected(created ? { type: "edge", id: created.id } : { type: "port", id: port.id });
      setConnectFromPortId(null);
      return;
    }
    setSelected({ type: "port", id: port.id });
    setConnectFromPortId(port.id);
  }

  function removeSelectedNode() {
    if (!selectedNode) {
      return;
    }
    const source = { sourceType: selectedNode.sourceType, sourceId: selectedNode.sourceId };
    let nextAssembly = removeSourceFromAssembly(assemblyRef.current, source);
    let nextComponentIds = robot.componentIds;
    let nextPluginIds = robot.pluginInstanceIds;
    if (source.sourceType === "component") {
      const component = componentById.get(source.sourceId);
      const componentPluginIds = new Set(component?.pluginInstanceIds ?? []);
      nextComponentIds = robot.componentIds.filter((id) => id !== source.sourceId);
      nextAssembly = {
        ...nextAssembly,
        nodes: nextAssembly.nodes.filter((node) => node.sourceType !== "plugin" || !componentPluginIds.has(node.sourceId)),
        ports: (nextAssembly.ports ?? []).filter((port) => nextAssembly.nodes.some((node) => node.id === port.nodeId)),
        edges: nextAssembly.edges.filter((edge) => {
          const nodeIds = new Set(nextAssembly.nodes.map((node) => node.id));
          return nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId);
        })
      };
    } else if (source.sourceType === "plugin" && robot.pluginInstanceIds.includes(source.sourceId)) {
      nextPluginIds = robot.pluginInstanceIds.filter((id) => id !== source.sourceId);
    }
    setSelected(null);
    setDebugPluginId("");
    setAssemblyState(nextAssembly);
    void saveAssemblyNow(nextAssembly, { componentIds: nextComponentIds, pluginInstanceIds: nextPluginIds });
  }

  function startDragSource(event: DragEvent<HTMLElement>, sourceType: RobotAssemblyNodeSourceType, sourceId: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(SOURCE_DRAG_MIME, JSON.stringify({ sourceType, sourceId }));
  }

  function addHarness() {
    const next = upsertAssemblyHarness(assemblyRef.current, { id: `harness:${(assembly.harnesses ?? []).length + 1}` });
    commitAssembly(next);
  }

  function addActionButton() {
    const nextButton = createDefaultActionButton(pluginInstances);
    const next = [...actionButtons, nextButton];
    setSelected({ type: "action", id: nextButton.id });
    commitActionButtons(next);
  }

  async function runActionButton(button: RobotActionButton) {
    if (blockingWarnings.length > 0) {
      setRunState("error");
      setRunLog(["Blocked by schematic errors.", ...blockingWarnings.map((item) => item.message)]);
      return;
    }
    if (!onRunPluginCommand) {
      setRunState("error");
      setRunLog(["No command executor is attached to the robot assembly workspace."]);
      return;
    }
    abortRef.current = false;
    setRunState("running");
    setRunLog([`Run ${button.name}`]);
    const timeout = window.setTimeout(() => {
      abortRef.current = true;
      setRunState("aborted");
      setRunLog((current) => [...current, `Timeout after ${button.timeoutMs} ms.`]);
    }, button.timeoutMs);
    try {
      for (const step of button.steps) {
        await runActionStep(step);
      }
      if (!abortRef.current) {
        setRunState("done");
        setRunLog((current) => [...current, "Done."]);
      }
    } catch (nextError) {
      setRunState("error");
      setRunLog((current) => [...current, nextError instanceof Error ? nextError.message : "Action failed."]);
    } finally {
      window.clearTimeout(timeout);
      setPreviewActionId("");
    }
  }

  async function runActionStep(step: RobotActionButtonStep): Promise<void> {
    if (abortRef.current) {
      throw new Error("Action aborted.");
    }
    if (step.kind === "parallel") {
      await Promise.all((step.steps ?? []).map((child) => runActionStep(child)));
      return;
    }
    if (step.kind === "wait") {
      await delay(step.durationMs ?? 0);
      setRunLog((current) => [...current, `Wait ${step.durationMs ?? 0} ms`]);
      return;
    }
    const plugin = step.pluginInstanceId ? pluginById.get(step.pluginInstanceId) : null;
    if (!plugin || !onRunPluginCommand) {
      throw new Error(`Missing plugin for step ${step.label}.`);
    }
    if (step.kind === "servo.move") {
      await onRunPluginCommand(plugin, "servo.set_position", { angleDeg: step.angleDeg ?? 0, speedRaw: step.speedRaw ?? 600, acc: step.acc ?? 30 });
      setRunLog((current) => [...current, `${plugin.name} -> ${step.angleDeg ?? 0} deg`]);
      return;
    }
    if (step.kind === "motor.set") {
      await onRunPluginCommand(plugin, "motor.set_speed", { speedPercent: step.speedPercent ?? 0 });
      setRunLog((current) => [...current, `${plugin.name} -> ${step.speedPercent ?? 0}%`]);
      return;
    }
    if (step.kind === "motor.stop") {
      await onRunPluginCommand(plugin, "motor.stop", { stopMode: step.stopMode ?? "coast" });
      setRunLog((current) => [...current, `${plugin.name} stop ${step.stopMode ?? "coast"}`]);
    }
  }

  function abortAction() {
    abortRef.current = true;
    setRunState("aborted");
    setRunLog((current) => [...current, "Manual abort."]);
  }

  function renderNode(node: RobotAssemblyNode) {
    const label = sourceLabel(node, context);
    const tone = motionToneForNode(node, context, statusContext);
    const selectedClass = selected?.type === "node" && selected.id === node.id ? " selected" : "";
    const subtitle = node.sourceType === "plugin"
      ? pluginMeta(pluginById.get(node.sourceId))
      : node.sourceType === "hardware"
        ? hardwareMeta(node)
        : componentMeta(componentById.get(node.sourceId), pluginInstances);
    return (
      <g
        className={`robot-assembly-node tone-${tone}${selectedClass} visual-${node.visualKind}`}
        key={node.id}
        onClick={(event) => {
          event.stopPropagation();
          selectNode(node);
        }}
        onPointerDown={(event) => startNodeDrag(event, node)}
        transform={`translate(${node.x} ${node.y})`}
      >
        <rect className="robot-assembly-node-body" width={node.w} height={node.h} rx="8" />
        <text className="robot-assembly-node-kicker" x="14" y="19">{node.sourceType.toUpperCase()}</text>
        <text className="robot-assembly-node-title" x="14" y="39">{truncate(label, 27)}</text>
        <text className="robot-assembly-node-subtitle" x="14" y="58">{truncate(subtitle, 34)}</text>
        {node.visualKind === "tracked-base" ? renderTrackedBaseNode(node) : renderSimpleNodeGlyph(node)}
        {nodePorts(assembly, node.id).map((port) => renderPort(node, port))}
      </g>
    );
  }

  function renderPort(node: RobotAssemblyNode, port: RobotAssemblyPort) {
    const selectedClass = selected?.type === "port" && selected.id === port.id ? " selected" : "";
    const connectingClass = connectFromPortId === port.id ? " connecting" : "";
    return (
      <g
        className={`robot-assembly-port-anchor kind-${port.kind}${selectedClass}${connectingClass}`}
        key={port.id}
        onClick={(event) => {
          event.stopPropagation();
          selectOrConnectPort(port);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => {
          event.stopPropagation();
          if (connectFromPortId && connectFromPortId !== port.id) {
            selectOrConnectPort(port);
          }
        }}
        transform={`translate(${port.x} ${port.y})`}
      >
        <circle r="6" />
        <text x={port.side === "left" ? 10 : port.side === "right" ? -10 : 8} y="4" textAnchor={port.side === "right" ? "end" : "start"}>{truncate(port.label, 13)}</text>
      </g>
    );
  }

  function renderTrackedBaseNode(node: RobotAssemblyNode) {
    const component = componentById.get(node.sourceId);
    const motors = component ? effectivePluginInstancesForComponent(component, pluginInstances).filter((plugin) => plugin.type === "motor") : [];
    return (
      <g className="robot-assembly-tracked-base">
        {motors.slice(0, 4).map((plugin, index) => {
          const tone = motionToneForPlugin(plugin, statusContext);
          const speed = motorSpeedForPlugin(plugin, statusContext) ?? 0;
          const x = 16 + (index % 2) * ((node.w - 46) / 2 + 12);
          const y = 78 + Math.floor(index / 2) * 36;
          return (
            <g className={`robot-assembly-motor-block tone-${tone}`} key={plugin.id} transform={`translate(${x} ${y})`}>
              <rect width={(node.w - 46) / 2} height="28" rx="5" />
              <text x="8" y="18">{truncate(`${plugin.name} ${pluginInstanceDeviceId(plugin)} ${speed}%`, 19)}</text>
            </g>
          );
        })}
      </g>
    );
  }

  function renderSimpleNodeGlyph(node: RobotAssemblyNode) {
    const iconText = node.visualKind === "robot-arm" ? "ARM" : node.visualKind === "power-module" ? "PWR" : node.visualKind === "motor-driver" ? "DRV" : node.sourceType === "hardware" ? "HW" : node.sourceType === "plugin" ? "PLG" : "CMP";
    return (
      <g className="robot-assembly-simple-glyph" transform={`translate(16 ${node.h - 42})`}>
        <rect width="62" height="28" rx="5" />
        <text x="12" y="18">{iconText}</text>
      </g>
    );
  }

  function renderEdge(edge: RobotAssemblyEdge) {
    const fromPort = edge.fromPortId ? portById.get(edge.fromPortId) : null;
    const toPort = edge.toPortId ? portById.get(edge.toPortId) : null;
    const fromNode = fromPort ? nodeById.get(fromPort.nodeId) : nodeById.get(edge.fromNodeId);
    const toNode = toPort ? nodeById.get(toPort.nodeId) : nodeById.get(edge.toNodeId);
    if (!fromNode || !toNode || !fromPort || !toPort) {
      return null;
    }
    const harness = edge.harnessId ? harnessById.get(edge.harnessId) : null;
    const hidden = edge.hidden === true || harness?.hidden === true;
    const fromPoint = { x: fromNode.x + fromPort.x, y: fromNode.y + fromPort.y };
    const toPoint = { x: toNode.x + toPort.x, y: toNode.y + toPort.y };
    const midX = (fromPoint.x + toPoint.x) / 2;
    const midY = (fromPoint.y + toPoint.y) / 2;
    const selectedClass = selected?.type === "edge" && selected.id === edge.id ? " selected" : "";
    const color = harness?.color ?? edgeColor(edge.kind);
    if (hidden) {
      return (
        <g className={`robot-assembly-edge hidden${selectedClass}`} key={edge.id} onClick={(event) => { event.stopPropagation(); setSelected({ type: "edge", id: edge.id }); }}>
          <circle className="robot-assembly-hidden-edge-badge" cx={midX} cy={midY} r="14" style={{ stroke: color }} />
          <text className="robot-assembly-hidden-edge-label" x={midX} y={midY + 4}>{harness?.name?.slice(0, 2) ?? "H"}</text>
        </g>
      );
    }
    return (
      <g
        className={`robot-assembly-edge kind-${edge.kind}${selectedClass}`}
        key={edge.id}
        onClick={(event) => {
          event.stopPropagation();
          setSelected({ type: "edge", id: edge.id });
          setDebugPluginId("");
        }}
      >
        <path className="robot-assembly-edge-hit" d={edgePath(fromPoint, toPoint)} />
        <path className="robot-assembly-edge-line" d={edgePath(fromPoint, toPoint)} style={{ stroke: color }} />
        <text className="robot-assembly-edge-label" x={midX - 34} y={midY - 8}>{truncate(edgeDisplayLabel(edge), 18)}</text>
      </g>
    );
  }

  return (
    <div className="robot-assembly-backend">
      <div className="robot-assembly-workspace">
        <section className="robot-assembly-palette" aria-label="robot assembly palette">
          {renderPaletteGroup("Components", <Boxes size={17} />, `${components.length}`, components.map((component) => {
            const owner = robots.find((item) => item.id !== robot.id && item.componentIds.includes(component.id));
            const inRobot = robot.componentIds.includes(component.id);
            return {
              id: component.id,
              label: component.name,
              meta: componentMeta(component, pluginInstances),
              active: inRobot,
              disabled: Boolean(owner),
              title: owner ? `Used by ${owner.name}` : component.name,
              source: { sourceType: "component" as const, sourceId: component.id }
            };
          }))}
          {renderPaletteGroup("Plugins", <PlugZap size={17} />, `${pluginInstances.length}`, pluginInstances.map((plugin) => {
            const availability = pluginAvailability(plugin, robot, components, usage);
            return {
              id: plugin.id,
              label: plugin.name,
              meta: pluginMeta(plugin),
              active: effectivePluginIds.has(plugin.id),
              disabled: !availability.available,
              title: availability.available ? plugin.name : availability.reason,
              source: { sourceType: "plugin" as const, sourceId: plugin.id }
            };
          }))}
          {renderPaletteGroup("Hardware", <Cpu size={17} />, `${ROBOT_ASSEMBLY_HARDWARE_TEMPLATES.length}`, ROBOT_ASSEMBLY_HARDWARE_TEMPLATES.map((template) => ({
            id: template.id,
            label: template.name,
            meta: template.subtitle,
            active: assembly.nodes.some((node) => node.sourceType === "hardware" && node.sourceId === template.id),
            disabled: false,
            title: template.name,
            source: { sourceType: "hardware" as const, sourceId: template.id }
          })))}
        </section>

        <section className="robot-assembly-canvas-panel">
          <div className="robot-assembly-toolbar">
            <div className="robot-assembly-toolbar-left">
              <span className={saveState === "error" ? "platform-status-pill error" : saveState === "saving" ? "platform-status-pill standby" : "platform-status-pill online"}>
                {saveState === "saving" ? "Saving" : saveState === "error" ? "Save failed" : "Saved"}
              </span>
              <span className={blockingWarnings.length > 0 ? "platform-status-pill error" : warnings.length > 0 ? "platform-status-pill standby" : "platform-status-pill online"}>
                {blockingWarnings.length > 0 ? `${blockingWarnings.length} errors` : `${warnings.length} warnings`}
              </span>
            </div>
            {connectFromPortId ? (
              <button className="icon-button" onClick={() => setConnectFromPortId(null)} type="button">
                <Unplug size={16} />
                <span>Cancel wire</span>
              </button>
            ) : (
              <span className="robot-assembly-toolbar-hint"><MousePointer2 size={15} />Drag nodes, click ports</span>
            )}
          </div>
          {error ? <p className="form-error robot-assembly-error">{error}</p> : null}
          <svg
            ref={svgRef}
            className="robot-assembly-canvas schematic"
            role="img"
            aria-label={`${robot.name} schematic`}
            viewBox={`0 0 ${ROBOT_ASSEMBLY_CANVAS_WIDTH} ${ROBOT_ASSEMBLY_CANVAS_HEIGHT}`}
            onClick={() => {
              setSelected(null);
              setDebugPluginId("");
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointerInteraction}
            onPointerCancel={finishPointerInteraction}
          >
            <defs>
              <pattern id={gridPatternId} width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" />
              </pattern>
            </defs>
            <rect className="robot-assembly-grid-bg" width={ROBOT_ASSEMBLY_CANVAS_WIDTH} height={ROBOT_ASSEMBLY_CANVAS_HEIGHT} fill={`url(#${gridPatternId})`} />
            {assembly.edges.map(renderEdge)}
            {assembly.nodes.map(renderNode)}
          </svg>
        </section>

        <section className="robot-assembly-inspector" aria-label="robot assembly inspector">
          {renderInspector()}
        </section>
      </div>
      {renderActionDock()}
      {previewAction && preview ? renderPreviewOverlay(previewAction, preview) : null}
    </div>
  );

  function renderPaletteGroup(title: string, icon: ReactNode, meta: string, items: Array<{ id: string; label: string; meta: string; active: boolean; disabled: boolean; title: string; source: RobotAssemblySource }>) {
    return (
      <div className="robot-assembly-palette-group" key={title}>
        <div className="robot-assembly-panel-head">
          <span>{icon}{title}</span>
          <small>{meta}</small>
        </div>
        <div className="robot-assembly-source-list">
          {items.map((item) => (
            <button
              className={item.active ? "robot-assembly-source active" : "robot-assembly-source"}
              disabled={item.disabled}
              draggable={!item.disabled}
              key={item.id}
              onDragStart={(event) => startDragSource(event, item.source.sourceType, item.source.sourceId)}
              onClick={() => !item.disabled && void addSource(item.source, nextPaletteDropPoint(assemblyRef.current))}
              title={item.title}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.meta}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderInspector() {
    return (
      <>
        <div className="robot-assembly-panel-head">
          <span><CircleDot size={17} />Inspector</span>
          <small>{assembly.nodes.length} nodes / {assembly.edges.length} wires</small>
        </div>
        {selectedNode ? renderNodeInspector(selectedNode) : null}
        {selectedPort ? renderPortInspector(selectedPort) : null}
        {selectedEdge ? renderEdgeInspector(selectedEdge) : null}
        {selectedAction ? renderActionInspector(selectedAction) : null}
        {!selectedNode && !selectedPort && !selectedEdge && !selectedAction ? renderSystemInspector() : null}
      </>
    );
  }

  function renderNodeInspector(node: RobotAssemblyNode) {
    const ports = nodePorts(assembly, node.id);
    return (
      <div className="robot-assembly-inspector-stack">
        <div className="robot-assembly-selection-summary">
          <strong>{sourceLabel(node, context)}</strong>
          <small>{node.sourceType === "component" ? componentMeta(selectedComponent, pluginInstances) : node.sourceType === "plugin" ? pluginMeta(selectedPlugin) : hardwareMeta(node)}</small>
        </div>
        <div className="robot-assembly-action-row">
          <button className="icon-button" onClick={() => ports[0] && setConnectFromPortId(ports[0].id)} type="button">
            <Link2 size={16} />
            <span>Wire from port</span>
          </button>
          <button className="icon-button danger" onClick={removeSelectedNode} type="button">
            <Trash2 size={16} />
            <span>Remove</span>
          </button>
        </div>
        <div className="robot-assembly-port-list">
          {ports.map((port) => (
            <button key={port.id} onClick={() => setSelected({ type: "port", id: port.id })} type="button">
              <span className={`robot-assembly-mini-led kind-${port.kind}`} />
              <span>{port.label}</span>
              <small>{port.kind}{port.voltage ? ` / ${port.voltage}` : ""}</small>
            </button>
          ))}
        </div>
        {selectedComponent ? (
          <div className="robot-assembly-plugin-pick-list">
            {effectivePluginInstancesForComponent(selectedComponent, pluginInstances).map((plugin) => (
              <button key={plugin.id} onClick={() => setDebugPluginId(plugin.id)} type="button">
                <span className={`robot-assembly-mini-led tone-${motionToneForPlugin(plugin, statusContext)}`} />
                <span>{plugin.name}</span>
                <small>{pluginInstanceDeviceId(plugin)}</small>
              </button>
            ))}
          </div>
        ) : null}
        {debugPlugin ? renderPluginDebug(debugPlugin) : null}
      </div>
    );
  }

  function renderPortInspector(port: RobotAssemblyPort) {
    const node = nodeById.get(port.nodeId);
    return (
      <div className="robot-assembly-inspector-stack">
        <div className="robot-assembly-selection-summary">
          <strong>{port.label}</strong>
          <small>{node ? sourceLabel(node, context) : port.nodeId} / {port.kind} / {port.direction}</small>
        </div>
        <div className="robot-assembly-action-row">
          <button className="icon-button primary" onClick={() => setConnectFromPortId(port.id)} type="button">
            <Cable size={16} />
            <span>Start wire</span>
          </button>
          <button className="icon-button" onClick={() => setConnectFromPortId(null)} type="button">
            <Unplug size={16} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    );
  }

  function renderEdgeInspector(edge: RobotAssemblyEdge) {
    const from = edge.fromPortId ? portById.get(edge.fromPortId) : null;
    const to = edge.toPortId ? portById.get(edge.toPortId) : null;
    return (
      <div className="robot-assembly-inspector-stack">
        <div className="robot-assembly-selection-summary">
          <strong>{edgeDisplayLabel(edge)}</strong>
          <small>{from?.label ?? edge.fromNodeId} {"->"} {to?.label ?? edge.toNodeId}</small>
        </div>
        <label><span>Kind</span><input value={edge.kind} onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { kind: event.target.value }))} /></label>
        <label><span>Label</span><input value={edge.label} onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { label: event.target.value }))} /></label>
        <label><span>Serial name</span><input value={edge.serialName ?? ""} placeholder="/dev/ttyAMA5" onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { serialName: event.target.value }))} /></label>
        <label><span>Baud rate</span><input value={edge.baudRate ?? ""} placeholder="115200" onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { baudRate: Number(event.target.value) }))} /></label>
        <label><span>Protocol</span><input value={edge.protocol ?? ""} placeholder="serial-json / CAN1 / PWM" onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { protocol: event.target.value }))} /></label>
        <label><span>Voltage</span><input value={edge.voltage ?? ""} placeholder="5V / 12V / 0V" onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { voltage: event.target.value }))} /></label>
        <label><span>Harness</span><select value={edge.harnessId ?? ""} onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { harnessId: event.target.value }))}>
          <option value="">None</option>
          {(assembly.harnesses ?? []).map((harness) => <option key={harness.id} value={harness.id}>{harness.name}</option>)}
        </select></label>
        <label className="robot-assembly-check-row"><input checked={edge.hidden === true} onChange={(event) => commitAssembly(updateAssemblyEdge(assemblyRef.current, edge.id, { hidden: event.target.checked }))} type="checkbox" /><span>Hide this wire</span></label>
        <button className="icon-button danger" onClick={() => { commitAssembly(deleteAssemblyEdge(assemblyRef.current, edge.id)); setSelected(null); }} type="button">
          <Trash2 size={16} />
          <span>Delete wire</span>
        </button>
      </div>
    );
  }

  function renderActionInspector(button: RobotActionButton) {
    const nextName = (value: string) => actionButtons.map((item) => item.id === button.id ? { ...item, name: value } : item);
    const nextTimeout = (value: number) => actionButtons.map((item) => item.id === button.id ? { ...item, timeoutMs: value } : item);
    return (
      <div className="robot-assembly-inspector-stack">
        <div className="robot-assembly-selection-summary">
          <strong>{button.name}</strong>
          <small>{flattenActionSteps(button.steps).length} executable steps / {button.timeoutMs} ms</small>
        </div>
        <label><span>Name</span><input value={button.name} onChange={(event) => commitActionButtons(nextName(event.target.value))} /></label>
        <label><span>Timeout ms</span><input value={button.timeoutMs} onChange={(event) => commitActionButtons(nextTimeout(Number(event.target.value)))} /></label>
        <label className="robot-assembly-check-row"><input checked={button.confirmRequired} onChange={(event) => commitActionButtons(actionButtons.map((item) => item.id === button.id ? { ...item, confirmRequired: event.target.checked } : item))} type="checkbox" /><span>Preview before run</span></label>
        {button.steps.map((step) => <ActionStepView key={step.id} step={step} pluginById={pluginById} />)}
        <button className="icon-button danger" onClick={() => { commitActionButtons(actionButtons.filter((item) => item.id !== button.id)); setSelected(null); }} type="button">
          <Trash2 size={16} />
          <span>Delete button</span>
        </button>
      </div>
    );
  }

  function renderSystemInspector() {
    return (
      <div className="robot-assembly-inspector-stack">
        <div className="robot-assembly-empty">
          <Cpu size={22} />
          <strong>{robot.name}</strong>
          <small>Select a node, port, wire, harness, or action.</small>
        </div>
        <section className="robot-assembly-harness-panel">
          <div className="robot-assembly-panel-head"><span><GitBranch size={16} />Harnesses</span><button className="icon-only" onClick={addHarness} title="Add harness" type="button"><Plus size={15} /></button></div>
          {(assembly.harnesses ?? []).length === 0 ? <small className="robot-assembly-muted">No harnesses yet.</small> : null}
          {(assembly.harnesses ?? []).map((harness) => (
            <div className="robot-assembly-harness-row" key={harness.id}>
              <span style={{ background: harness.color }} />
              <strong>{harness.name}</strong>
              <button className="icon-only" onClick={() => commitAssembly(toggleHarnessHidden(assemblyRef.current, harness.id))} title={harness.hidden ? "Show harness" : "Hide harness"} type="button">
                {harness.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          ))}
        </section>
        <section className="robot-assembly-warning-panel">
          <div className="robot-assembly-panel-head"><span><AlertTriangle size={16} />Schematic check</span><small>{warnings.length}</small></div>
          {warnings.length === 0 ? <small className="robot-assembly-muted">No schematic warnings.</small> : warnings.map((item) => (
            <p className={`robot-assembly-warning ${item.severity}`} key={item.id}>{item.message}</p>
          ))}
        </section>
      </div>
    );
  }

  function renderActionDock() {
    return (
      <section className="robot-assembly-action-dock">
        <div className="robot-assembly-panel-head">
          <span><Zap size={17} />Action buttons</span>
          <button className="icon-button" onClick={addActionButton} type="button"><Plus size={16} /><span>New action</span></button>
        </div>
        <div className="robot-assembly-action-grid">
          {actionButtons.map((button) => (
            <div className={selected?.type === "action" && selected.id === button.id ? "robot-action-button selected" : "robot-action-button"} key={button.id} onClick={() => setSelected({ type: "action", id: button.id })} role="button" tabIndex={0}>
              <span className="robot-action-button-light" style={{ background: button.color }} />
              <strong>{button.name}</strong>
              <small>{flattenActionSteps(button.steps).length} steps</small>
              <button className="icon-only" onClick={(event) => { event.stopPropagation(); button.confirmRequired ? setPreviewActionId(button.id) : void runActionButton(button); }} title="Run action" type="button"><Play size={15} /></button>
            </div>
          ))}
          {actionButtons.length === 0 ? <div className="robot-assembly-muted">No action buttons yet.</div> : null}
        </div>
        <div className={`robot-assembly-run-log state-${runState}`}>
          <div><Activity size={15} /><span>{runState.toUpperCase()}</span></div>
          {runState === "running" ? <button className="icon-button danger" onClick={abortAction} type="button"><Square size={15} /><span>Abort</span></button> : null}
          <pre>{runLog.slice(-8).join("\n")}</pre>
        </div>
      </section>
    );
  }

  function renderPreviewOverlay(button: RobotActionButton, actionPreview: { blocked: boolean; lines: string[]; warnings: Array<{ message: string }> }) {
    return (
      <div className="robot-action-preview-backdrop" role="dialog" aria-modal="true">
        <div className="robot-action-preview">
          <div className="robot-assembly-panel-head">
            <span><Play size={17} />Preview {button.name}</span>
            <button className="icon-only" onClick={() => setPreviewActionId("")} title="Close" type="button"><Unplug size={15} /></button>
          </div>
          {actionPreview.warnings.map((item) => <p className="robot-assembly-warning error" key={item.message}>{item.message}</p>)}
          <ol>{actionPreview.lines.map((line) => <li key={line}>{line}</li>)}</ol>
          <div className="robot-assembly-action-row">
            <button className="icon-button" onClick={() => setPreviewActionId("")} type="button">Cancel</button>
            <button className="icon-button primary" disabled={actionPreview.blocked} onClick={() => void runActionButton(button)} type="button"><Play size={16} /><span>Confirm run</span></button>
          </div>
        </div>
      </div>
    );
  }
}

function ActionStepView({ pluginById, step }: { pluginById: Map<string, PluginInstance>; step: RobotActionButtonStep }) {
  if (step.kind === "parallel") {
    return (
      <div className="robot-action-step parallel">
        <strong>{step.label}</strong>
        {(step.steps ?? []).map((child) => <ActionStepView key={child.id} pluginById={pluginById} step={child} />)}
      </div>
    );
  }
  const plugin = step.pluginInstanceId ? pluginById.get(step.pluginInstanceId) : null;
  return (
    <div className="robot-action-step">
      <strong>{step.label}</strong>
      <small>{step.kind} / {plugin?.name ?? step.pluginInstanceId ?? `${step.durationMs ?? 0} ms`}</small>
    </div>
  );
}

function parseDraggedSource(event: DragEvent<SVGSVGElement>): RobotAssemblySource | null {
  try {
    const value = JSON.parse(event.dataTransfer.getData(SOURCE_DRAG_MIME));
    if ((value?.sourceType === "component" || value?.sourceType === "plugin" || value?.sourceType === "hardware") && typeof value.sourceId === "string") {
      return { sourceType: value.sourceType, sourceId: value.sourceId };
    }
  } catch {
    return null;
  }
  return null;
}

function componentMeta(component: ComponentDefinition | null | undefined, pluginInstances: PluginInstance[]): string {
  if (!component) {
    return "--";
  }
  const motors = pluginInstancesToMotorProfiles(effectivePluginInstancesForComponent(component, pluginInstances)).length;
  const kind = component.kind === "robot-arm" ? "robot arm" : motors >= 2 ? "tracked base" : "component";
  return `${kind} / ${component.pluginInstanceIds.length} plugins`;
}

function pluginMeta(plugin: PluginInstance | null | undefined): string {
  if (!plugin) {
    return "--";
  }
  return `${pluginInstanceDeviceId(plugin)} / ${plugin.driverId}`;
}

function hardwareMeta(node: RobotAssemblyNode): string {
  return `${node.hardwareKind ?? "hardware"} / ${node.visualKind}`;
}

function pluginAvailability(plugin: PluginInstance, robot: RobotDefinition, components: ComponentDefinition[], usage: Map<string, PluginUsage[]>) {
  const owners = usage.get(plugin.id) ?? [];
  const currentComponentIds = new Set(robot.componentIds);
  const currentOwners = owners.filter((owner) => owner.ownerKind === "robot" ? owner.ownerId === robot.id : currentComponentIds.has(owner.ownerId));
  const blockingOwner = owners.find((owner) => !currentOwners.includes(owner));
  if (blockingOwner) {
    return { available: false, reason: `Used by ${blockingOwner.ownerName}` };
  }
  return { available: true, reason: "" };
}

function nextPaletteDropPoint(assembly: RobotAssemblyConfig) {
  const index = assembly.nodes.length;
  return {
    x: 48 + (index % 4) * 250,
    y: 68 + Math.floor(index / 4) * 174
  };
}

function assemblySignature(assembly: RobotAssemblyConfig): string {
  return JSON.stringify(assembly);
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  return `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
}

function edgeColor(kind: string): string {
  if (kind === "power") {
    return "#f97316";
  }
  if (kind === "uart") {
    return "#38bdf8";
  }
  if (kind === "can") {
    return "#a78bfa";
  }
  if (kind === "pwm") {
    return "#22c55e";
  }
  return "#94a3b8";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 1))}…` : value;
}

function safeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}
