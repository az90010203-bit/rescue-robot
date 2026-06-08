import { Activity, ArrowDown, ArrowLeft, ArrowUp, Bot, Boxes, Code2, Crosshair, Filter, GripVertical, Play, Plus, Radar, RotateCcw, Save, Send, Square, Trash2, Wrench } from "lucide-react";
import { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createComponent,
  createDeviceCatalogItem,
  createPluginInstance,
  createRobot,
  deleteComponent,
  deletePluginInstance,
  deleteRobot,
  listComponents,
  listDeviceCatalog,
  listPluginInstances,
  listRobots,
  loadPanelLayout,
  savePanelLayout,
  updateComponent,
  updatePluginInstance,
  updateRobot
} from "@adapters/data-service/dataService";
import { createPlatformCommand, PlatformCommand, PlatformCommandResult, PlatformCommandType } from "@platform/commands";
import {
  ComponentKind,
  ComponentDefinition,
  DeviceCatalogItem,
  DeviceConfig,
  DeviceConfigField,
  PanelLayoutItem,
  PluginInstance,
  RobotDefinition,
  availablePluginInstancesForComponent,
  configWithCatalogDefaults,
  createDeviceDescriptorFromPluginInstance,
  defaultPanelLayoutItems,
  deviceCatalogBrands,
  deviceCatalogModels,
  deviceCodeLibraryItemsFromCatalog,
  driverLibraryItemsFromPackages,
  effectivePluginInstancesForComponent,
  filterDeviceCodeLibraryItems,
  mergePanelLayoutItems,
  panelTargetsForPluginInstances,
  pluginInstanceDeviceId,
  pluginInstanceDisplayName,
  pluginInstancesToMotorProfiles,
  pluginInstancesToServoProfiles,
  pluginUsageMap,
  reorderPanelLayoutItems
} from "@platform/architecture";
import { BUILTIN_PLUGIN_PACKAGES } from "@platform/builtinPlugins";
import { CapabilityId, DeviceDescriptor, UiControlSchema, UiPanelSchema } from "@platform/types";
import { findPlatformUiPanelForDevice, platformCommandForControl, platformControlDefaultsForDevice } from "@platform/ui";
import { LocalCameraView } from "@domains/camera/LocalCameraView";
import { RobotAssemblyWorkspace } from "@domains/robot-assembly/RobotAssemblyWorkspace";
import { PluginAutoDetectPanel } from "@domains/plugin-auto-detect/PluginAutoDetectPanel";
import { ArchitectureCreatePanel } from "@workspaces/architecture/ArchitectureCreatePanel";
import { ArchitectureMetric as Metric, ArchitecturePanelHeading as PanelHeading, EntitySelector, SelectableInstanceList } from "@workspaces/architecture/ArchitectureWorkspacePrimitives";
import {
  customCatalogDraft,
  driverSourceForInstance,
  formatArmNumber,
  normalizeArmDisplayDegrees,
  normalizeConfigDraft,
  nextPluginName,
  platformActionControls,
  servoSetIdLogLines,
  servoSetIdResponseFromResult,
  sleepMs,
  toggleSet,
  type ArchitectureDraftValues as DraftValues,
  type ArchitectureMetricTone as MetricTone,
  type PluginDebugDraft
} from "@workspaces/architecture/architectureWorkspaceUtils";
import type { GamepadDetectionSummary, PiDetectionProfile } from "@domains/plugin-auto-detect/pluginAutoDetect";
import { DataProject } from "@adapters/data-service/dataService";
import type { AboardBridgeCommandResult } from "@adapters/pi/piAboardBridge";
import {
  ARM_MAX_JOINT_LENGTH_PX,
  ARM_MIN_JOINT_LENGTH_PX,
  ArmConfig,
  ArmJointConfig,
  ArmPoint,
  ArmSegmentPose,
  armJointLocalEndDirectionDeg,
  armJointShapeSegments,
  calculateArmDragAngle,
  calculateArmSegmentPoses,
  DEFAULT_ARM_JOINT_LENGTH_PX,
  DEFAULT_LINKAGE_MEMBER_ACC,
  DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
  normalizeArmConfig
} from "@adapters/persistence/storage";
import {
  clamp,
  FeetechStatusPacket,
  MotorProfile,
  MotorTarget,
  MotorStopMode,
  normalizeMotorChannel,
  normalizeServoProfile,
  parseServoFeedback,
  PcCommand,
  rawToAngleDeg,
  ServoProfile,
  servoLogicalSpan,
  servoPhysicalToLogicalAngleWithReverse
} from "@adapters/hardware/protocol";
import {
  COMPONENT_ARM_AUTO_SAMPLE_INTERVAL_MS,
  applyComponentArmTrajectorySample,
  createComponentArmTrajectoryArchive,
  createComponentArmTrajectorySample,
  deleteComponentArmTrajectoryArchive,
  normalizeComponentArmAutoConfig,
  shouldScheduleComponentArmIkLiveMove,
  upsertComponentArmTrajectoryArchive,
  type ComponentArmAutoConfig,
  type ComponentArmIkSendMode,
  type ComponentArmTrajectoryArchive,
  type ComponentArmTrajectorySample
} from "@domains/arm/componentArmAuto";
import { solvePlanarIk, type ArmIkSolution } from "@domains/arm/armKinematics";
import type { MotorFeedbackMap, ServoFeedbackMap } from "@platform/stateStore";

export type ArchitectureLayer = "plugins" | "components" | "robots";
type SaveState = "idle" | "loading" | "saving" | "error";
type ServoFeedbackValue = ReturnType<typeof parseServoFeedback>;

interface ThreeLayerWorkspaceProps {
  layer: ArchitectureLayer;
  project: DataProject | null;
  dataServiceOnline: boolean;
  driveTargets?: MotorTarget[];
  gamepads?: GamepadDetectionSummary[];
  uiPanels: UiPanelSchema[];
  motorFeedback?: MotorFeedbackMap;
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  nextCommandSeq?: () => number;
  onPluginInstancesChange?: (instances: PluginInstance[]) => void;
  onPrepareCommand?: (capability: CapabilityId) => Promise<void> | void;
  piRemoteProfile?: PiDetectionProfile | null;
  renderPluginDebugPanel?: (instance: PluginInstance, context: { refreshArchitecture: () => Promise<void>; replacePluginInstance: (instance: PluginInstance) => void }) => ReactNode;
  sendAboardBridgeCanServoCommand?: (command: PcCommand, options?: { log?: boolean }) => Promise<AboardBridgeCommandResult | null>;
  servoFeedback?: ServoFeedbackMap;
}

const deviceTypes: CapabilityId[] = ["servo", "motor", "camera", "gamepad", "sensor"];
const ARM_WORKSPACE_ORIGIN: ArmPoint = { x: 300, y: 250 };
const fallbackTypeLabels: Record<CapabilityId, string> = {
  servo: "舵机",
  motor: "电机",
  camera: "摄像头",
  "robot-arm": "机械臂",
  "raspberry-pi": "树莓派",
  firmware: "固件",
  gamepad: "Gamepad",
  gpio: "GPIO",
  sensor: "传感器"
};

function servoFeedbackPhysicalAngle(response: unknown): number | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  const feedback = response as { positionDeg?: unknown; positionRaw?: unknown };
  if (typeof feedback.positionDeg === "number" && Number.isFinite(feedback.positionDeg)) {
    return feedback.positionDeg;
  }
  if (typeof feedback.positionRaw === "number" && Number.isFinite(feedback.positionRaw)) {
    return rawToAngleDeg(feedback.positionRaw);
  }
  return null;
}

function servoFeedbackFromResponse(response: unknown): ServoFeedbackValue | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  const maybeFeedback = response as Partial<ServoFeedbackValue>;
  if (maybeFeedback.type === "servo.feedback") {
    return maybeFeedback as ServoFeedbackValue;
  }
  const maybePacket = response as Partial<FeetechStatusPacket>;
  if (typeof maybePacket.id === "number" && Array.isArray(maybePacket.params) && typeof maybePacket.status === "number") {
    return parseServoFeedback({
      id: maybePacket.id,
      status: maybePacket.status,
      params: maybePacket.params,
      checksum: typeof maybePacket.checksum === "number" ? maybePacket.checksum : 0
    });
  }
  return null;
}

export function ThreeLayerWorkspace({
  layer,
  project,
  dataServiceOnline,
  driveTargets = [],
  gamepads = [],
  uiPanels,
  motorFeedback = {},
  dispatchPlatformCommand,
  nextCommandSeq,
  onPluginInstancesChange,
  onPrepareCommand,
  piRemoteProfile,
  renderPluginDebugPanel,
  sendAboardBridgeCanServoCommand,
  servoFeedback = {}
}: ThreeLayerWorkspaceProps) {
  const { t } = useTranslation();
  const uiText = (key: string, defaultValue: string, values: Record<string, unknown> = {}) => {
    const value = t(key, { defaultValue, ...values });
    return value === key ? defaultValue : value;
  };
  const [catalog, setCatalog] = useState<DeviceCatalogItem[]>([]);
  const [pluginInstances, setPluginInstances] = useState<PluginInstance[]>([]);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [robots, setRobots] = useState<RobotDefinition[]>([]);
  const [panelLayouts, setPanelLayouts] = useState<Record<string, PanelLayoutItem[]>>({});
  const [status, setStatus] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<CapabilityId | "">("servo");
  const [brandFilter, setBrandFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [queryFilter, setQueryFilter] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [customCatalogEnabled, setCustomCatalogEnabled] = useState(false);
  const [customBrand, setCustomBrand] = useState("Custom");
  const [customModel, setCustomModel] = useState("Custom Device");
  const [pluginName, setPluginName] = useState("");
  const [pluginCreateOpen, setPluginCreateOpen] = useState(false);
  const [configDraft, setConfigDraft] = useState<DraftValues>({});
  const [selectedPluginId, setSelectedPluginId] = useState("");
  const [pluginLibraryFilter, setPluginLibraryFilter] = useState<CapabilityId | "">("");
  const [componentName, setComponentName] = useState("New Component");
  const [componentKind, setComponentKind] = useState<ComponentKind>("custom");
  const [componentPluginIds, setComponentPluginIds] = useState<Set<string>>(() => new Set());
  const [componentCreateOpen, setComponentCreateOpen] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [armDraftByComponentId, setArmDraftByComponentId] = useState<Record<string, ArmConfig>>({});
  const [armAutoDraftByComponentId, setArmAutoDraftByComponentId] = useState<Record<string, ComponentArmAutoConfig>>({});
  const [armIkSolutionByComponentId, setArmIkSolutionByComponentId] = useState<Record<string, ArmIkSolution>>({});
  const [armAutoSamplesByComponentId, setArmAutoSamplesByComponentId] = useState<Record<string, ComponentArmTrajectorySample[]>>({});
  const [armAutoArchiveDraftByComponentId, setArmAutoArchiveDraftByComponentId] = useState<Record<string, { name: string; notes: string; selectedArchiveId: string }>>({});
  const [componentServoLimitDraftByInstanceId, setComponentServoLimitDraftByInstanceId] = useState<Record<string, { minDeg: string; maxDeg: string }>>({});
  const [componentServoLimitErrorByInstanceId, setComponentServoLimitErrorByInstanceId] = useState<Record<string, string>>({});
  const [draggingArmJointId, setDraggingArmJointId] = useState<string | null>(null);
  const [draggingArmIkComponentId, setDraggingArmIkComponentId] = useState<string | null>(null);
  const [armArchivePlayingId, setArmArchivePlayingId] = useState<string | null>(null);
  const [pluginDebugDraftById, setPluginDebugDraftById] = useState<Record<string, PluginDebugDraft>>({});
  const [pluginServoFeedbackById, setPluginServoFeedbackById] = useState<Record<string, ServoFeedbackValue>>({});
  const [pluginDebugMessageById, setPluginDebugMessageById] = useState<Record<string, { text: string; tone: MetricTone }>>({});
  const [pluginServoConfigBusyById, setPluginServoConfigBusyById] = useState<Record<string, boolean>>({});
  const [pluginSerialLogById, setPluginSerialLogById] = useState<Record<string, string[]>>({});
  const [robotName, setRobotName] = useState("New Robot");
  const [robotComponentIds, setRobotComponentIds] = useState<Set<string>>(() => new Set());
  const [robotPluginIds, setRobotPluginIds] = useState<Set<string>>(() => new Set());
  const [robotCreateOpen, setRobotCreateOpen] = useState(false);
  const [selectedRobotId, setSelectedRobotId] = useState("");
  const [controlDraftByDeviceId, setControlDraftByDeviceId] = useState<Record<string, Record<string, unknown>>>({});
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const armSaveTimerRef = useRef<Record<string, number>>({});
  const armLiveTimerRef = useRef<Record<string, number>>({});
  const armLiveSendingRef = useRef<Record<string, boolean>>({});
  const pendingArmLiveMoveRef = useRef<Record<string, { component: ComponentDefinition; config: ArmConfig }>>({});
  const armAutoRecordingStartRef = useRef<Record<string, number>>({});
  const armArchivePlaybackGenerationRef = useRef(0);
  const layerTitle = layer === "plugins" ? uiText("sections.plugins", "插件") : layer === "components" ? uiText("sections.components", "组件") : uiText("sections.robots", "机器人");
  const platformTypeLabel = (type: CapabilityId) => uiText(`platform.types.${type}`, fallbackTypeLabels[type] ?? type);
  const componentKindLabel = (kind: ComponentKind) => uiText(kind === "robot-arm" ? "architecture.components.kind.robotArm" : "architecture.components.kind.custom", kind === "robot-arm" ? "机械臂" : "普通组件");

  const driverLibrary = useMemo(() => driverLibraryItemsFromPackages(BUILTIN_PLUGIN_PACKAGES), []);
  const codeLibraries = useMemo(() => deviceCodeLibraryItemsFromCatalog(catalog, driverLibrary), [catalog, driverLibrary]);
  const catalogBrands = useMemo(() => deviceCatalogBrands(catalog, deviceTypeFilter), [catalog, deviceTypeFilter]);
  const catalogModels = useMemo(() => deviceCatalogModels(catalog, deviceTypeFilter, brandFilter), [brandFilter, catalog, deviceTypeFilter]);
  const shownCodeLibraries = useMemo(
    () => filterDeviceCodeLibraryItems(codeLibraries, { type: deviceTypeFilter, brand: brandFilter, model: modelFilter, query: queryFilter }),
    [brandFilter, codeLibraries, deviceTypeFilter, modelFilter, queryFilter]
  );
  const selectedCodeLibrary = shownCodeLibraries.find((item) => item.catalogItemId === selectedCatalogId) ?? shownCodeLibraries[0] ?? null;
  const selectedCatalog = useMemo(
    () => catalog.find((item) => item.id === selectedCodeLibrary?.catalogItemId) ?? null,
    [catalog, selectedCodeLibrary?.catalogItemId]
  );
  const activeCatalog = customCatalogEnabled && selectedCodeLibrary ? customCatalogDraft(selectedCodeLibrary, customBrand, customModel, selectedCatalog) : selectedCatalog;
  const usage = useMemo(() => pluginUsageMap(components, robots), [components, robots]);
  const availableForComponents = useMemo(
    () => availablePluginInstancesForComponent(pluginInstances, components, robots, selectedComponentId || undefined),
    [components, pluginInstances, robots, selectedComponentId]
  );
  const availableServoPluginsForComponents = useMemo(
    () => availableForComponents.filter((instance) => instance.type === "servo" && instance.driverId === "driver.feetech-servo"),
    [availableForComponents]
  );
  const componentSelectableInstances = componentKind === "robot-arm" ? availableServoPluginsForComponents : availableForComponents;
  const selectedComponent = components.find((component) => component.id === selectedComponentId) ?? components[0];
  const selectedRobot = robots.find((robot) => robot.id === selectedRobotId) ?? robots[0];
  const selectedPlugin = pluginInstances.find((instance) => instance.id === selectedPluginId) ?? null;
  const shownPluginInstances = useMemo(
    () => pluginInstances.filter((instance) => !pluginLibraryFilter || instance.type === pluginLibraryFilter),
    [pluginInstances, pluginLibraryFilter]
  );

  useEffect(() => {
    if (selectedPlugin) {
      void onPrepareCommand?.(selectedPlugin.type);
    }
  }, [selectedPlugin?.id, selectedPlugin?.type]);

  useEffect(() => {
    if (!project || !dataServiceOnline) {
      return;
    }
    void refreshArchitecture(project.id);
  }, [dataServiceOnline, project?.id]);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(armSaveTimerRef.current)) {
        window.clearTimeout(timer);
      }
      for (const timer of Object.values(armLiveTimerRef.current)) {
        window.clearTimeout(timer);
      }
      armSaveTimerRef.current = {};
      armLiveTimerRef.current = {};
      armLiveSendingRef.current = {};
      pendingArmLiveMoveRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (selectedComponent?.kind === "robot-arm") {
      void onPrepareCommand?.("robot-arm");
    }
  }, [selectedComponent?.id, selectedComponent?.kind]);

  useEffect(() => {
    setBrandFilter("");
    setModelFilter("");
    setQueryFilter("");
    setSelectedCatalogId("");
    setCustomCatalogEnabled(false);
  }, [deviceTypeFilter]);

  useEffect(() => {
    if (!brandFilter && catalogBrands[0]) {
      setBrandFilter(catalogBrands[0]);
      return;
    }
    if (brandFilter && catalogBrands.length > 0 && !catalogBrands.includes(brandFilter)) {
      setBrandFilter(catalogBrands[0]);
    }
  }, [brandFilter, catalogBrands]);

  useEffect(() => {
    if (!modelFilter && catalogModels[0]) {
      setModelFilter(catalogModels[0]);
      return;
    }
    if (modelFilter && catalogModels.length > 0 && !catalogModels.includes(modelFilter)) {
      setModelFilter(catalogModels[0]);
    }
    if (modelFilter && catalogModels.length === 0) {
      setModelFilter("");
    }
  }, [catalogModels, modelFilter]);

  useEffect(() => {
    if (selectedCodeLibrary && selectedCodeLibrary.catalogItemId !== selectedCatalogId) {
      setSelectedCatalogId(selectedCodeLibrary.catalogItemId);
    }
  }, [selectedCodeLibrary?.catalogItemId, selectedCatalogId]);

  useEffect(() => {
    if (componentKind !== "robot-arm") {
      return;
    }
    const servoIds = new Set(availableServoPluginsForComponents.map((instance) => instance.id));
    setComponentPluginIds((current) => new Set(Array.from(current).filter((id) => servoIds.has(id))));
  }, [availableServoPluginsForComponents, componentKind]);

  useEffect(() => {
    if (selectedCodeLibrary && !customCatalogEnabled) {
      setCustomBrand(selectedCodeLibrary.brand);
      setCustomModel(selectedCodeLibrary.model);
    }
  }, [customCatalogEnabled, selectedCodeLibrary?.brand, selectedCodeLibrary?.model]);

  useEffect(() => {
    if (!activeCatalog) {
      setConfigDraft({});
      return;
    }
    setConfigDraft(configWithCatalogDefaults(activeCatalog, configDraft));
    if (!pluginName.trim()) {
      setPluginName(nextPluginName(activeCatalog, pluginInstances));
    }
  }, [activeCatalog?.id, customCatalogEnabled]);

  useEffect(() => {
    if (selectedComponent && !selectedComponentId) {
      setSelectedComponentId(selectedComponent.id);
    }
  }, [selectedComponent, selectedComponentId]);

  useEffect(() => {
    if (selectedRobot && !selectedRobotId) {
      setSelectedRobotId(selectedRobot.id);
    }
  }, [selectedRobot, selectedRobotId]);

  async function refreshArchitecture(projectId = project?.id) {
    if (!projectId) {
      return;
    }
    setStatus("loading");
    try {
      const [nextCatalog, nextPlugins, nextComponents, nextRobots] = await Promise.all([
        listDeviceCatalog(),
        listPluginInstances(projectId),
        listComponents(projectId),
        listRobots(projectId)
      ]);
      setCatalog(nextCatalog);
      setPluginInstances(nextPlugins);
      setComponents(nextComponents);
      setRobots(nextRobots);
      onPluginInstancesChange?.(nextPlugins);
      setSelectedPluginId((current) => (nextPlugins.some((plugin) => plugin.id === current) ? current : ""));
      setSelectedComponentId((current) => current || nextComponents[0]?.id || "");
      setSelectedRobotId((current) => current || nextRobots[0]?.id || "");
      const scopes = [
        ...nextComponents.map((component) => `component:${component.id}`),
        ...nextRobots.map((robot) => `robot:${robot.id}`)
      ];
      const layouts = await Promise.all(scopes.map((scopeId) => loadPanelLayout(projectId, scopeId).catch(() => ({ scopeId, layout: [], updatedAt: null }))));
      setPanelLayouts(Object.fromEntries(layouts.map((layout) => [layout.scopeId, layout.layout])));
      setError("");
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "数据服务不可用");
      setStatus("error");
    }
  }

  function replacePluginInstance(updated: PluginInstance) {
    const nextPlugins = pluginInstances.some((plugin) => plugin.id === updated.id)
      ? pluginInstances.map((plugin) => (plugin.id === updated.id ? updated : plugin))
      : [...pluginInstances, updated];
    setPluginInstances(nextPlugins);
    onPluginInstancesChange?.(nextPlugins);
  }

  function replaceComponent(updated: ComponentDefinition) {
    setComponents((current) => (
      current.some((component) => component.id === updated.id)
        ? current.map((component) => (component.id === updated.id ? updated : component))
        : [updated, ...current]
    ));
  }

  function replaceRobot(updated: RobotDefinition) {
    setRobots((current) => (
      current.some((robot) => robot.id === updated.id)
        ? current.map((robot) => (robot.id === updated.id ? updated : robot))
        : [updated, ...current]
    ));
    setSelectedRobotId(updated.id);
  }

  function componentServoProfiles(component: ComponentDefinition): ServoProfile[] {
    return pluginInstancesToServoProfiles(effectivePluginInstancesForComponent(component, pluginInstances));
  }

  function componentPluginInstances(component: ComponentDefinition): PluginInstance[] {
    return effectivePluginInstancesForComponent(component, pluginInstances);
  }

  function pluginDebugDraft(instance: PluginInstance): PluginDebugDraft {
    const existing = pluginDebugDraftById[instance.id];
    const servo = pluginInstancesToServoProfiles([instance])[0];
    const motor = pluginInstancesToMotorProfiles([instance])[0];
    const minDeg = servo?.minDeg ?? 0;
    const maxDeg = servo?.maxDeg ?? 360;
    const span = Math.max(1, maxDeg - minDeg);
    const resetDeg = clamp(Number.isFinite(Number(instance.config.resetDeg)) ? Number(instance.config.resetDeg) : span / 2, 0, span);
    const defaults: PluginDebugDraft = {
      mode: "position",
      angleDeg: formatArmNumber(resetDeg),
      newServoId: String(instance.config.servoId ?? servo?.id ?? ""),
      confirmSingleServo: false,
      speedRaw: "800",
      acc: "30",
      liveDragEnabled: true,
      reverse: false,
      minDeg: formatArmNumber(minDeg),
      maxDeg: formatArmNumber(maxDeg),
      resetDeg: formatArmNumber(resetDeg),
      motorSpeedPercent: "0",
      stopMode: "brake",
      pwmPin: motor?.pwmPin ?? String(instance.config.pwmPin ?? ""),
      in1Pin: motor?.in1Pin ?? String(instance.config.in1Pin ?? ""),
      in2Pin: motor?.in2Pin ?? String(instance.config.in2Pin ?? ""),
      enablePin: motor?.enablePin ?? String(instance.config.enablePin ?? ""),
      sensorPin: motor?.sensorPin ?? String(instance.config.sensorPin ?? "")
    };
    return existing ? { ...defaults, ...existing } : defaults;
  }

  function updatePluginDebugDraft(instanceId: string, patch: Partial<PluginDebugDraft>) {
    const instance = pluginInstances.find((item) => item.id === instanceId);
    setPluginDebugDraftById((current) => ({
      ...current,
      [instanceId]: {
        ...(instance ? pluginDebugDraft(instance) : current[instanceId]),
        ...patch
      } as PluginDebugDraft
    }));
  }

  function setPluginDebugMessage(instanceId: string, text: string, tone: MetricTone = "neutral") {
    setPluginDebugMessageById((current) => ({ ...current, [instanceId]: { text, tone } }));
  }

  function setPluginServoConfigBusy(instanceId: string, busy: boolean) {
    setPluginServoConfigBusyById((current) => ({ ...current, [instanceId]: busy }));
  }

  function appendPluginSerialLog(instanceId: string, lines: string[]) {
    if (lines.length === 0) {
      return;
    }
    setPluginSerialLogById((current) => ({
      ...current,
      [instanceId]: [...(current[instanceId] ?? []), ...lines].slice(-40)
    }));
  }

  function servoLogicalSpanForInstance(instance: PluginInstance): number {
    const servo = pluginInstancesToServoProfiles([instance])[0];
    return servo ? servoLogicalSpan(servo) : 360;
  }

  function clampPluginServoLogical(instance: PluginInstance, value: number): number {
    return clamp(Number.isFinite(value) ? value : 0, 0, servoLogicalSpanForInstance(instance));
  }

  function componentServoLimitDraft(instance: PluginInstance, servo: ServoProfile) {
    return componentServoLimitDraftByInstanceId[instance.id] ?? {
      minDeg: formatArmNumber(servo.minDeg ?? 0),
      maxDeg: formatArmNumber(servo.maxDeg ?? 360)
    };
  }

  function updateComponentServoLimitDraft(instance: PluginInstance, servo: ServoProfile, field: "minDeg" | "maxDeg", value: string) {
    setComponentServoLimitErrorByInstanceId((current) => {
      const next = { ...current };
      delete next[instance.id];
      return next;
    });
    setComponentServoLimitDraftByInstanceId((current) => ({
      ...current,
      [instance.id]: {
        ...componentServoLimitDraft(instance, servo),
        [field]: value
      }
    }));
  }

  async function saveComponentServoLimits(component: ComponentDefinition, instance: PluginInstance, servo: ServoProfile) {
    if (!project) {
      return;
    }
    const draft = componentServoLimitDraft(instance, servo);
    const minDeg = clamp(Number(draft.minDeg), 0, 360);
    const maxDeg = clamp(Number(draft.maxDeg), 0, 360);
    if (!Number.isFinite(minDeg) || !Number.isFinite(maxDeg) || minDeg >= maxDeg) {
      setComponentServoLimitErrorByInstanceId((current) => ({
        ...current,
        [instance.id]: "限位范围必须在 0-360 度，并且最小值小于最大值"
      }));
      return;
    }

    setStatus("saving");
    try {
      const updated = await updatePluginInstance(project.id, instance.id, {
        config: {
          ...instance.config,
          minDeg,
          maxDeg,
          resetDeg: clamp(Number.isFinite(Number(instance.config.resetDeg)) ? Number(instance.config.resetDeg) : (minDeg + maxDeg) / 2, minDeg, maxDeg)
        }
      });
      replacePluginInstance(updated);
      const updatedServo = pluginInstancesToServoProfiles([updated])[0];
      if (updatedServo) {
        const nextServos = componentServoProfiles(component).map((item) => (item.id === updatedServo.id ? updatedServo : item));
        const nextConfig = normalizeArmConfig(currentArmConfigForComponent(component), nextServos);
        setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
        scheduleComponentArmConfigSave(component, nextConfig);
      }
      setComponentServoLimitDraftByInstanceId((current) => ({
        ...current,
        [instance.id]: {
          minDeg: formatArmNumber(minDeg),
          maxDeg: formatArmNumber(maxDeg)
        }
      }));
      setComponentServoLimitErrorByInstanceId((current) => {
        const next = { ...current };
        delete next[instance.id];
        return next;
      });
      setError("");
      setStatus("idle");
    } catch (nextError) {
      setComponentServoLimitErrorByInstanceId((current) => ({
        ...current,
        [instance.id]: nextError instanceof Error ? nextError.message : "限位保存失败"
      }));
      setStatus("error");
    }
  }

  function createArmConfigFromServos(servos: ServoProfile[]): ArmConfig {
    const joints = servos.map((servo, index) => {
      const normalized = normalizeServoProfile(servo);
      const neutralDeg = clamp(90, 0, servoLogicalSpan(normalized));
      return {
        id: `arm-joint-${index + 1}`,
        name: `Joint ${index + 1}`,
        servoId: normalized.id,
        lengthPx: DEFAULT_ARM_JOINT_LENGTH_PX,
        angleDeg: neutralDeg,
        neutralDeg,
        speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW,
        acc: DEFAULT_LINKAGE_MEMBER_ACC,
        reverse: false,
        enabled: true,
        shapeSegments: [{ id: "main", name: "主段", lengthPx: DEFAULT_ARM_JOINT_LENGTH_PX, directionDeg: 0 }],
        childFrameOffsetDeg: 0
      };
    });
    return { joints, liveDragEnabled: false, selectedJointId: joints[0]?.id ?? null };
  }

  function armConfigForComponent(component: ComponentDefinition): ArmConfig {
    const servos = componentServoProfiles(component);
    const saved = component.config?.armConfig;
    const normalized = saved ? normalizeArmConfig(saved, servos) : createArmConfigFromServos(servos);
    return normalized.joints.length === 0 && servos.length > 0 ? createArmConfigFromServos(servos) : normalized;
  }

  function currentArmConfigForComponent(component: ComponentDefinition): ArmConfig {
    return armDraftByComponentId[component.id] ?? armConfigForComponent(component);
  }

  function armAutoConfigForComponent(component: ComponentDefinition, config = armConfigForComponent(component)): ComponentArmAutoConfig {
    return normalizeComponentArmAutoConfig(component.config?.armAuto, config);
  }

  function currentArmAutoConfigForComponent(component: ComponentDefinition, config = currentArmConfigForComponent(component)): ComponentArmAutoConfig {
    return armAutoDraftByComponentId[component.id] ?? armAutoConfigForComponent(component, config);
  }

  async function persistComponentArmConfig(component: ComponentDefinition, config: ArmConfig) {
    if (!project) {
      return;
    }
    const armAuto = currentArmAutoConfigForComponent(component, config);
    const updated = await updateComponent(project.id, component.id, {
      config: {
        ...component.config,
        armConfig: config,
        armAuto
      }
    });
    replaceComponent(updated);
  }

  async function persistComponentArmAutoConfig(component: ComponentDefinition, autoConfig: ComponentArmAutoConfig, config = currentArmConfigForComponent(component)) {
    if (!project) {
      return;
    }
    const normalized = normalizeComponentArmAutoConfig(autoConfig, config);
    const updated = await updateComponent(project.id, component.id, {
      config: {
        ...component.config,
        armConfig: config,
        armAuto: normalized
      }
    });
    replaceComponent(updated);
    setArmAutoDraftByComponentId((current) => ({ ...current, [component.id]: normalized }));
  }

  function updateComponentArmAutoConfig(component: ComponentDefinition, updater: (current: ComponentArmAutoConfig) => ComponentArmAutoConfig) {
    const config = currentArmConfigForComponent(component);
    const next = normalizeComponentArmAutoConfig(updater(currentArmAutoConfigForComponent(component, config)), config);
    setArmAutoDraftByComponentId((current) => ({ ...current, [component.id]: next }));
    void persistComponentArmAutoConfig(component, next, config).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "组件机械臂自动配置保存失败");
      setStatus("error");
    });
  }

  function recordComponentIkSample(component: ComponentDefinition, config: ArmConfig, options: { force?: boolean } = {}) {
    const startedAt = armAutoRecordingStartRef.current[component.id] ?? Date.now();
    const sample = createComponentArmTrajectorySample(config, Date.now() - startedAt, componentServoProfiles(component));
    setArmAutoSamplesByComponentId((current) => {
      const samples = current[component.id] ?? [];
      const lastSample = samples[samples.length - 1];
      if (!options.force && lastSample && sample.tMs - lastSample.tMs < COMPONENT_ARM_AUTO_SAMPLE_INTERVAL_MS) {
        return current;
      }
      return { ...current, [component.id]: [...samples, sample].slice(-1200) };
    });
  }

  function solveComponentArmIkTarget(component: ComponentDefinition, target: ArmPoint, options: { record?: boolean; forceRecord?: boolean } = {}) {
    const servos = componentServoProfiles(component);
    const currentConfig = currentArmConfigForComponent(component);
    const solution = solvePlanarIk(currentConfig, target, { servos, origin: ARM_WORKSPACE_ORIGIN });
    const nextConfig = normalizeArmConfig(solution.config, servos);
    const nextSolution = { ...solution, config: nextConfig };
    const currentAuto = currentArmAutoConfigForComponent(component, nextConfig);
    const nextAuto = normalizeComponentArmAutoConfig({ ...currentAuto, mode: "ik", target }, nextConfig);

    setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
    setArmIkSolutionByComponentId((current) => ({ ...current, [component.id]: nextSolution }));
    setArmAutoDraftByComponentId((current) => ({ ...current, [component.id]: nextAuto }));
    scheduleComponentArmConfigSave(component, nextConfig);

    if (options.record) {
      recordComponentIkSample(component, nextConfig, { force: options.forceRecord });
    }
    if (shouldScheduleComponentArmIkLiveMove(currentAuto, nextConfig)) {
      scheduleComponentArmLiveMove(component, nextConfig);
    }

    return { config: nextConfig, solution: nextSolution, autoConfig: nextAuto };
  }

  function startComponentArmIkDrag(component: ComponentDefinition, target: ArmPoint) {
    armAutoRecordingStartRef.current[component.id] = Date.now();
    setDraggingArmIkComponentId(component.id);
    setDraggingArmJointId(null);
    setArmAutoSamplesByComponentId((current) => ({ ...current, [component.id]: [] }));
    solveComponentArmIkTarget(component, target, { record: true, forceRecord: true });
  }

  function finishComponentArmIkDrag(component: ComponentDefinition) {
    if (draggingArmIkComponentId !== component.id) {
      return;
    }
    delete armAutoRecordingStartRef.current[component.id];
    setDraggingArmIkComponentId(null);
    const config = currentArmConfigForComponent(component);
    const autoConfig = currentArmAutoConfigForComponent(component, config);
    void persistComponentArmAutoConfig(component, autoConfig, config).catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "组件机械臂自动配置保存失败");
      setStatus("error");
    });
  }

  function componentArmArchiveDraft(componentId: string, autoConfig: ComponentArmAutoConfig) {
    return armAutoArchiveDraftByComponentId[componentId] ?? {
      name: "IK 轨迹",
      notes: "",
      selectedArchiveId: autoConfig.archives[0]?.id ?? ""
    };
  }

  function updateComponentArmArchiveDraft(componentId: string, values: Partial<{ name: string; notes: string; selectedArchiveId: string }>) {
    setArmAutoArchiveDraftByComponentId((current) => ({
      ...current,
      [componentId]: {
        name: current[componentId]?.name ?? "IK 轨迹",
        notes: current[componentId]?.notes ?? "",
        selectedArchiveId: current[componentId]?.selectedArchiveId ?? "",
        ...values
      }
    }));
  }

  function selectComponentArmArchive(component: ComponentDefinition, archive: ComponentArmTrajectoryArchive | null) {
    updateComponentArmArchiveDraft(component.id, {
      selectedArchiveId: archive?.id ?? "",
      name: archive?.name ?? "IK 轨迹",
      notes: archive?.notes ?? ""
    });
  }

  async function saveCurrentComponentArmArchive(component: ComponentDefinition) {
    const config = currentArmConfigForComponent(component);
    const autoConfig = currentArmAutoConfigForComponent(component, config);
    const draft = componentArmArchiveDraft(component.id, autoConfig);
    const samples = armAutoSamplesByComponentId[component.id]?.length
      ? armAutoSamplesByComponentId[component.id]
      : [createComponentArmTrajectorySample(config, 0, componentServoProfiles(component))];
    const now = Date.now();
    const archive = createComponentArmTrajectoryArchive({
      name: draft.name,
      notes: draft.notes,
      target: autoConfig.target,
      armConfig: config,
      samples,
      createdAt: now,
      updatedAt: now
    });
    const nextAuto = normalizeComponentArmAutoConfig({
      ...autoConfig,
      archives: upsertComponentArmTrajectoryArchive(autoConfig.archives, archive)
    }, config);

    setStatus("saving");
    try {
      await persistComponentArmAutoConfig(component, nextAuto, config);
      setArmAutoSamplesByComponentId((current) => ({ ...current, [component.id]: [] }));
      setArmAutoArchiveDraftByComponentId((current) => ({
        ...current,
        [component.id]: {
          name: archive.name,
          notes: archive.notes ?? "",
          selectedArchiveId: archive.id
        }
      }));
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "组件机械臂轨迹保存失败");
      setStatus("error");
    }
  }

  async function saveComponentArmArchiveMetadata(component: ComponentDefinition, archive: ComponentArmTrajectoryArchive) {
    const config = currentArmConfigForComponent(component);
    const autoConfig = currentArmAutoConfigForComponent(component, config);
    const draft = componentArmArchiveDraft(component.id, autoConfig);
    const updatedArchive: ComponentArmTrajectoryArchive = {
      ...archive,
      name: draft.name.trim() || archive.name,
      notes: draft.notes.trim() || undefined,
      updatedAt: Date.now()
    };
    const nextAuto = normalizeComponentArmAutoConfig({
      ...autoConfig,
      archives: upsertComponentArmTrajectoryArchive(autoConfig.archives, updatedArchive)
    }, config);

    setStatus("saving");
    try {
      await persistComponentArmAutoConfig(component, nextAuto, config);
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "组件机械臂轨迹备注保存失败");
      setStatus("error");
    }
  }

  async function deleteComponentArmArchive(component: ComponentDefinition, archiveId: string) {
    const config = currentArmConfigForComponent(component);
    const autoConfig = currentArmAutoConfigForComponent(component, config);
    const nextArchives = deleteComponentArmTrajectoryArchive(autoConfig.archives, archiveId);
    const nextAuto = normalizeComponentArmAutoConfig({ ...autoConfig, archives: nextArchives }, config);

    setStatus("saving");
    try {
      await persistComponentArmAutoConfig(component, nextAuto, config);
      selectComponentArmArchive(component, nextAuto.archives[0] ?? null);
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "组件机械臂轨迹删除失败");
      setStatus("error");
    }
  }

  async function playComponentArchive(component: ComponentDefinition, archive: ComponentArmTrajectoryArchive) {
    const generation = armArchivePlaybackGenerationRef.current + 1;
    armArchivePlaybackGenerationRef.current = generation;
    setArmArchivePlayingId(archive.id);

    const servos = componentServoProfiles(component);
    const autoConfig = currentArmAutoConfigForComponent(component);
    let nextConfig = currentArmConfigForComponent(component);
    let previousTMs = archive.samples[0]?.tMs ?? 0;

    for (const sample of archive.samples) {
      const delayMs = Math.max(0, sample.tMs - previousTMs);
      previousTMs = sample.tMs;
      if (delayMs > 0) {
        await sleepMs(delayMs);
      }
      if (armArchivePlaybackGenerationRef.current !== generation) {
        return;
      }
      nextConfig = normalizeArmConfig(applyComponentArmTrajectorySample(nextConfig, sample, servos), servos);
      setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
      if (autoConfig.sendMode === "live") {
        await sendComponentArmPose(component, nextConfig, true);
      }
    }

    if (armArchivePlaybackGenerationRef.current === generation) {
      scheduleComponentArmConfigSave(component, nextConfig);
      setArmArchivePlayingId(null);
    }
  }

  function pauseComponentArchivePlayback(component: ComponentDefinition) {
    armArchivePlaybackGenerationRef.current += 1;
    setArmArchivePlayingId(null);
    void pauseComponentArm(component);
  }

  function scheduleComponentArmConfigSave(component: ComponentDefinition, config: ArmConfig) {
    const current = armSaveTimerRef.current[component.id];
    if (current !== undefined) {
      window.clearTimeout(current);
    }
    armSaveTimerRef.current[component.id] = window.setTimeout(() => {
      delete armSaveTimerRef.current[component.id];
      void persistComponentArmConfig(component, config).catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "机械臂姿态保存失败");
        setStatus("error");
      });
    }, 500);
  }

  function updateComponentArmConfig(component: ComponentDefinition, updater: (current: ArmConfig) => ArmConfig, options: { live?: boolean } = {}) {
    const servos = componentServoProfiles(component);
    const next = normalizeArmConfig(updater(currentArmConfigForComponent(component)), servos);
    setArmDraftByComponentId((current) => ({ ...current, [component.id]: next }));
    scheduleComponentArmConfigSave(component, next);
    if (options.live && next.liveDragEnabled) {
      scheduleComponentArmLiveMove(component, next);
    }
  }

  function scheduleComponentArmLiveMove(component: ComponentDefinition, config: ArmConfig) {
    if (!config.liveDragEnabled) {
      return;
    }
    pendingArmLiveMoveRef.current[component.id] = { component, config };
    if (armLiveTimerRef.current[component.id] !== undefined || armLiveSendingRef.current[component.id]) {
      return;
    }
    armLiveTimerRef.current[component.id] = window.setTimeout(() => {
      delete armLiveTimerRef.current[component.id];
      void flushComponentArmLiveMove(component.id);
    }, 60);
  }

  async function flushComponentArmLiveMove(componentId: string) {
    if (armLiveSendingRef.current[componentId]) {
      return;
    }
    const pending = pendingArmLiveMoveRef.current[componentId];
    delete pendingArmLiveMoveRef.current[componentId];
    if (!pending?.config.liveDragEnabled) {
      return;
    }

    armLiveSendingRef.current[componentId] = true;
    try {
      await sendComponentArmPose(pending.component, pending.config, true);
    } finally {
      delete armLiveSendingRef.current[componentId];
      if (pendingArmLiveMoveRef.current[componentId] && armLiveTimerRef.current[componentId] === undefined) {
        armLiveTimerRef.current[componentId] = window.setTimeout(() => {
          delete armLiveTimerRef.current[componentId];
          void flushComponentArmLiveMove(componentId);
        }, 60);
      }
    }
  }

  async function saveComponentArmConfigNow(component: ComponentDefinition, config = currentArmConfigForComponent(component)) {
    const current = armSaveTimerRef.current[component.id];
    if (current !== undefined) {
      window.clearTimeout(current);
      delete armSaveTimerRef.current[component.id];
    }
    setStatus("saving");
    try {
      await persistComponentArmConfig(component, config);
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "机械臂姿态保存失败");
      setStatus("error");
    }
  }

  async function sendComponentArmPose(component: ComponentDefinition, config = currentArmConfigForComponent(component), live = false) {
    await onPrepareCommand?.("robot-arm");
    const result = await dispatchPlatformCommand(createPlatformCommand("robot-arm.set_pose", `robot-arm:${component.id}`, { joints: config.joints, live, servos: componentServoProfiles(component) }));
    if (result.status === "failed" || result.status === "timeout") {
      setError(result.message ?? "机械臂姿态发送失败");
      setStatus("error");
    }
  }

  async function pauseComponentArm(component: ComponentDefinition, config = currentArmConfigForComponent(component)) {
    await onPrepareCommand?.("robot-arm");
    const result = await dispatchPlatformCommand(createPlatformCommand("robot-arm.pause", `robot-arm:${component.id}`, { joints: config.joints, servos: componentServoProfiles(component) }));
    if (result.status === "failed" || result.status === "timeout") {
      setError(result.message ?? "机械臂暂停失败");
      setStatus("error");
    }
  }

  async function syncComponentArmPoseFromHardware(component: ComponentDefinition, config = currentArmConfigForComponent(component)) {
    const servos = componentServoProfiles(component);
    const servoById = new Map(servos.map((servo) => [servo.id, normalizeServoProfile(servo)]));
    const nextAngles = new Map<string, number>();
    setStatus("loading");
    try {
      await onPrepareCommand?.("robot-arm");
      for (const joint of config.joints) {
        if (!joint.enabled) {
          continue;
        }
        const servo = servoById.get(joint.servoId);
        if (!servo) {
          continue;
        }
        const result = await dispatchPlatformCommand(createPlatformCommand("servo.read_feedback", `servo:${joint.servoId}`));
        if (result.status === "failed" || result.status === "timeout") {
          continue;
        }
        const physicalAngle = servoFeedbackPhysicalAngle(result.response);
        if (physicalAngle === null) {
          continue;
        }
        nextAngles.set(joint.id, servoPhysicalToLogicalAngleWithReverse(servo, physicalAngle, joint.reverse));
      }

      if (nextAngles.size === 0) {
        setError("没有读到舵机当前位置，请确认串口已连接到 Feetech 总线");
        setStatus("error");
        return;
      }

      const nextConfig = normalizeArmConfig(
        {
          ...config,
          joints: config.joints.map((joint) => (
            nextAngles.has(joint.id)
              ? { ...joint, angleDeg: nextAngles.get(joint.id)! }
              : joint
          ))
        },
        servos
      );
      setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
      scheduleComponentArmConfigSave(component, nextConfig);
      setError("");
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "实际姿态同步失败");
      setStatus("error");
    }
  }

  async function savePluginServoSettings(instance: PluginInstance) {
    if (!project) {
      return;
    }
    const draft = pluginDebugDraft(instance);
    const minDeg = clamp(Number(draft.minDeg), 0, 360);
    const maxDeg = clamp(Number(draft.maxDeg), 0, 360);
    if (!Number.isFinite(minDeg) || !Number.isFinite(maxDeg) || minDeg >= maxDeg) {
      setPluginDebugMessage(instance.id, "限位范围必须在 0-360 度，并且最小值小于最大值", "danger");
      return;
    }
    const resetDeg = clamp(Number.isFinite(Number(draft.resetDeg)) ? Number(draft.resetDeg) : (maxDeg - minDeg) / 2, 0, maxDeg - minDeg);
    setStatus("saving");
    try {
      const updated = await updatePluginInstance(project.id, instance.id, {
        config: {
          ...instance.config,
          minDeg,
          maxDeg,
          resetDeg
        }
      });
      replacePluginInstance(updated);
      updatePluginDebugDraft(instance.id, {
        minDeg: formatArmNumber(minDeg),
        maxDeg: formatArmNumber(maxDeg),
        resetDeg: formatArmNumber(resetDeg),
        angleDeg: formatArmNumber(clampPluginServoLogical(updated, Number(draft.angleDeg)))
      });
      setPluginDebugMessage(instance.id, `已保存限位 ${formatArmNumber(minDeg)}-${formatArmNumber(maxDeg)} deg，复位 ${formatArmNumber(resetDeg)} deg`, "online");
      setStatus("idle");
    } catch (nextError) {
      setPluginDebugMessage(instance.id, nextError instanceof Error ? nextError.message : "插件舵机设置保存失败", "danger");
      setStatus("error");
    }
  }

  async function runPluginCommand(instance: PluginInstance, commandType: PlatformCommandType, payload: Record<string, unknown> = {}) {
    await onPrepareCommand?.(instance.type);
    const result = await dispatchPlatformCommand(createPlatformCommand(commandType, pluginInstanceDeviceId(instance), payload));
    const tone: MetricTone = result.status === "sent" ? "online" : result.status === "timeout" || result.status === "skipped" ? "warning" : "danger";
    setPluginDebugMessage(instance.id, result.message ?? `命令状态：${result.status}`, tone);
    return result;
  }

  async function readPluginServo(instance: PluginInstance) {
    const result = await runPluginCommand(instance, "servo.read_feedback");
    const feedback = servoFeedbackFromResponse(result.response);
    if (feedback) {
      setPluginServoFeedbackById((current) => ({ ...current, [instance.id]: feedback }));
      setPluginDebugMessage(instance.id, `已读取当前位置 ${feedback.positionDeg === undefined ? "--" : `${formatArmNumber(feedback.positionDeg)} deg`}`, "online");
    }
    return feedback;
  }

  async function sendPluginServoPosition(instance: PluginInstance, options: { live?: boolean; draft?: PluginDebugDraft } = {}) {
    const draft = options.draft ?? pluginDebugDraft(instance);
    const span = servoLogicalSpanForInstance(instance);
    const logicalAngle = clampPluginServoLogical(instance, Number(draft.angleDeg));
    const commandAngle = draft.reverse ? span - logicalAngle : logicalAngle;
    const speedRaw = clamp(Math.round(Number(draft.speedRaw)), 0, 4095);
    const acc = clamp(Math.round(Number(draft.acc)), 0, 254);
    await runPluginCommand(instance, "servo.set_position", { angleDeg: commandAngle, speedRaw, acc, live: options.live === true });
  }

  async function sendPluginServoWheel(instance: PluginInstance, draft = pluginDebugDraft(instance)) {
    const speedRaw = clamp(Math.round(Number(draft.speedRaw)), 0, 4095) * (draft.reverse ? -1 : 1);
    const acc = clamp(Math.round(Number(draft.acc)), 0, 254);
    await runPluginCommand(instance, "servo.set_speed", { speedRaw, acc });
  }

  async function resetPluginServo(instance: PluginInstance) {
    const draft = pluginDebugDraft(instance);
    const resetDeg = clampPluginServoLogical(instance, Number(draft.resetDeg));
    updatePluginDebugDraft(instance.id, { mode: "position", angleDeg: formatArmNumber(resetDeg) });
    const span = servoLogicalSpanForInstance(instance);
    const commandAngle = draft.reverse ? span - resetDeg : resetDeg;
    await runPluginCommand(instance, "servo.set_position", {
      angleDeg: commandAngle,
      speedRaw: clamp(Math.round(Number(draft.speedRaw)), 0, 4095),
      acc: clamp(Math.round(Number(draft.acc)), 0, 254)
    });
    setPluginDebugMessage(instance.id, `已发送复位 ${formatArmNumber(resetDeg)} deg`, "online");
  }

  function setPluginServoResetFromFeedback(instance: PluginInstance) {
    const feedback = pluginServoFeedbackById[instance.id];
    const servo = pluginInstancesToServoProfiles([instance])[0];
    if (!feedback || !servo || feedback.positionDeg === undefined) {
      setPluginDebugMessage(instance.id, "没有当前位置反馈，请先点击读取反馈", "warning");
      return;
    }
    const logical = servoPhysicalToLogicalAngleWithReverse(servo, feedback.positionDeg, pluginDebugDraft(instance).reverse);
    updatePluginDebugDraft(instance.id, { resetDeg: formatArmNumber(clampPluginServoLogical(instance, logical)) });
    setPluginDebugMessage(instance.id, `复位角已设为当前位置 ${formatArmNumber(logical)} deg，请点击保存限位`, "online");
  }

  async function setPluginServoNeutralFromFeedback(instance: PluginInstance) {
    if (!project) {
      return;
    }
    const feedback = pluginServoFeedbackById[instance.id];
    const servo = pluginInstancesToServoProfiles([instance])[0];
    if (!feedback || !servo || feedback.positionDeg === undefined) {
      setPluginDebugMessage(instance.id, "没有当前位置反馈，请先点击读取反馈", "warning");
      return;
    }
    const neutralDeg = clampPluginServoLogical(instance, servoPhysicalToLogicalAngleWithReverse(servo, feedback.positionDeg, false));
    setPluginServoConfigBusy(instance.id, true);
    setStatus("saving");
    try {
      const updated = await updatePluginInstance(project.id, instance.id, {
        config: {
          ...instance.config,
          neutralDeg
        }
      });
      replacePluginInstance(updated);
      await syncRobotArmNeutralForPlugin(instance, servo.id, neutralDeg);
      updatePluginDebugDraft(instance.id, { angleDeg: formatArmNumber(neutralDeg) });
      setPluginDebugMessage(instance.id, `逻辑中位已设为当前位置 ${formatArmNumber(neutralDeg)} deg`, "online");
      setStatus("idle");
    } catch (nextError) {
      setPluginDebugMessage(instance.id, nextError instanceof Error ? nextError.message : "逻辑中位保存失败", "danger");
      setStatus("error");
    } finally {
      setPluginServoConfigBusy(instance.id, false);
    }
  }

  async function syncRobotArmNeutralForPlugin(instance: PluginInstance, servoId: number, neutralDeg: number) {
    if (!project) {
      return;
    }
    for (const component of components) {
      if (component.kind !== "robot-arm" || !component.pluginInstanceIds.includes(instance.id)) {
        continue;
      }
      const currentConfig = currentArmConfigForComponent(component);
      const nextConfig = normalizeArmConfig(
        {
          ...currentConfig,
          joints: currentConfig.joints.map((joint) => (
            joint.servoId === servoId
              ? { ...joint, neutralDeg, angleDeg: neutralDeg }
              : joint
          ))
        },
        componentServoProfiles(component)
      );
      setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
      const updated = await updateComponent(project.id, component.id, {
        config: {
          ...component.config,
          armConfig: nextConfig
        }
      });
      replaceComponent(updated);
    }
  }

  async function syncRobotArmServoIdForPlugin(instance: PluginInstance, updated: PluginInstance, oldServoId: number, newServoId: number) {
    if (!project) {
      return;
    }
    const nextPluginInstances = pluginInstances.map((item) => (item.id === updated.id ? updated : item));
    for (const component of components) {
      if (component.kind !== "robot-arm" || !component.pluginInstanceIds.includes(instance.id)) {
        continue;
      }
      const rawConfig = (armDraftByComponentId[component.id] ?? component.config?.armConfig ?? currentArmConfigForComponent(component)) as ArmConfig;
      const nextServos = pluginInstancesToServoProfiles(effectivePluginInstancesForComponent(component, nextPluginInstances));
      const nextConfig = normalizeArmConfig(
        {
          ...rawConfig,
          joints: rawConfig.joints.map((joint) => (
            joint.servoId === oldServoId
              ? { ...joint, servoId: newServoId }
              : joint
          ))
        },
        nextServos
      );
      setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
      const nextComponent = await updateComponent(project.id, component.id, {
        config: {
          ...component.config,
          armConfig: nextConfig
        }
      });
      replaceComponent(nextComponent);
    }
  }

  async function writePluginServoPhysicalId(instance: PluginInstance) {
    if (!project) {
      return;
    }
    const servo = pluginInstancesToServoProfiles([instance])[0];
    if (!servo) {
      setPluginDebugMessage(instance.id, "这个舵机插件缺少有效 servoId，无法写入 ID", "danger");
      return;
    }
    const draft = pluginDebugDraft(instance);
    const newServoId = Number(draft.newServoId);
    if (!Number.isInteger(newServoId) || newServoId < 0 || newServoId > 253) {
      setPluginDebugMessage(instance.id, "新 ID 必须是 0-253 的整数", "danger");
      return;
    }
    if (newServoId === servo.id) {
      setPluginDebugMessage(instance.id, "新 ID 需要和当前 ID 不同", "warning");
      return;
    }
    if (!draft.confirmSingleServo) {
      setPluginDebugMessage(instance.id, "改 ID 前请确认总线上只连接这一只舵机", "warning");
      return;
    }

    setPluginServoConfigBusy(instance.id, true);
    setStatus("saving");
    try {
      const result = await runPluginCommand(instance, "servo.set_id", { newId: newServoId, confirmSingleServo: true });
      const setIdResponse = servoSetIdResponseFromResult(result.response);
      if (setIdResponse) {
        appendPluginSerialLog(instance.id, servoSetIdLogLines(setIdResponse));
      }
      if (result.status !== "sent") {
        setPluginDebugMessage(instance.id, result.message ?? `ID ${servo.id} 写入失败`, "danger");
        setStatus("idle");
        return;
      }

      const updated = await updatePluginInstance(project.id, instance.id, {
        config: {
          ...instance.config,
          servoId: newServoId
        }
      });
      replacePluginInstance(updated);
      await syncRobotArmServoIdForPlugin(instance, updated, servo.id, newServoId);
      updatePluginDebugDraft(instance.id, {
        newServoId: String(newServoId),
        confirmSingleServo: false
      });
      setPluginDebugMessage(instance.id, `舵机本体 ID 已从 ${servo.id} 改为 ${newServoId}，插件配置已同步`, "online");
      setStatus("idle");
    } catch (nextError) {
      setPluginDebugMessage(instance.id, nextError instanceof Error ? nextError.message : "舵机 ID 写入失败", "danger");
      setStatus("error");
    } finally {
      setPluginServoConfigBusy(instance.id, false);
    }
  }

  async function savePluginMotorMapping(instance: PluginInstance) {
    if (!project) {
      return;
    }
    const draft = pluginDebugDraft(instance);
    setStatus("saving");
    try {
      const updated = await updatePluginInstance(project.id, instance.id, {
        config: {
          ...instance.config,
          pwmPin: draft.pwmPin.trim(),
          in1Pin: draft.in1Pin.trim(),
          in2Pin: draft.in2Pin.trim(),
          enablePin: draft.enablePin.trim(),
          sensorPin: draft.sensorPin.trim()
        }
      });
      replacePluginInstance(updated);
      setPluginDebugMessage(instance.id, "电机端口映射已保存", "online");
      setStatus("idle");
    } catch (nextError) {
      setPluginDebugMessage(instance.id, nextError instanceof Error ? nextError.message : "电机端口映射保存失败", "danger");
      setStatus("error");
    }
  }

  async function sendPluginMotorMapping(instance: PluginInstance) {
    const draft = pluginDebugDraft(instance);
    await runPluginCommand(instance, "motor.configure", {
      pwmPin: draft.pwmPin.trim(),
      in1Pin: draft.in1Pin.trim(),
      in2Pin: draft.in2Pin.trim(),
      enablePin: draft.enablePin.trim() || undefined,
      sensorPin: draft.sensorPin.trim() || undefined
    });
  }

  async function sendPluginMotorSpeed(instance: PluginInstance) {
    const draft = pluginDebugDraft(instance);
    await runPluginCommand(instance, "motor.set_speed", {
      speedPercent: clamp(Math.round(Number(draft.motorSpeedPercent)), -100, 100),
      stopMode: draft.stopMode
    });
  }

  async function handleCreatePluginInstance() {
    if (!project || !activeCatalog) {
      return;
    }
    setStatus("saving");
    try {
      const catalogItem = customCatalogEnabled ? await createDeviceCatalogItem({ ...activeCatalog, defaultConfig: normalizeConfigDraft(activeCatalog.configSchema, configDraft), userDefined: true }) : activeCatalog;
      await createPluginInstance(project.id, {
        name: pluginName.trim() || nextPluginName(catalogItem, pluginInstances),
        catalogItemId: catalogItem.id,
        config: normalizeConfigDraft(catalogItem.configSchema, configDraft)
      });
      setSelectedPluginId("");
      setPluginName("");
      setCustomCatalogEnabled(false);
      await refreshArchitecture(project.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "插件实例创建失败");
      setStatus("error");
    }
  }

  async function handleDeletePlugin(instanceId: string) {
    if (!project) {
      return;
    }
    setStatus("saving");
    try {
      await deletePluginInstance(project.id, instanceId);
      setSelectedPluginId("");
      await refreshArchitecture(project.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "插件实例删除失败");
      setStatus("error");
    }
  }

  async function handleCreateComponent() {
    if (!project) {
      return;
    }
    setStatus("saving");
    try {
      const intendedKind = componentKind;
      const selectedIds = Array.from(componentPluginIds);
      const selectedInstances = selectedIds.map((id) => pluginInstances.find((instance) => instance.id === id)).filter((instance): instance is PluginInstance => Boolean(instance));
      const armConfig = intendedKind === "robot-arm" ? createArmConfigFromServos(pluginInstancesToServoProfiles(selectedInstances)) : undefined;
      const componentPayload: Partial<ComponentDefinition> = {
        name: componentName.trim() || "New Component",
        kind: intendedKind,
        pluginInstanceIds: selectedIds,
        config: armConfig ? { armConfig } : {}
      };
      let component = await createComponent(project.id, componentPayload);
      if (intendedKind === "robot-arm" && component.kind !== "robot-arm") {
        component = await updateComponent(project.id, component.id, componentPayload);
      }
      if (intendedKind === "robot-arm" && component.kind !== "robot-arm") {
        throw new Error("data-service 仍按旧版本保存组件，请重启 data-service 后再生成机械臂");
      }
      replaceComponent(component);
      setSelectedComponentId(component.id);
      setComponentName("New Component");
      setComponentKind("custom");
      setComponentPluginIds(new Set());
      await refreshArchitecture(project.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "组件创建失败");
      setStatus("error");
    }
  }

  async function handleDeleteComponent(componentId: string) {
    if (!project) {
      return;
    }
    setStatus("saving");
    try {
      await deleteComponent(project.id, componentId);
      await refreshArchitecture(project.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "组件删除失败");
      setStatus("error");
    }
  }

  async function handleCreateRobot() {
    if (!project) {
      return;
    }
    setStatus("saving");
    try {
      const robot = await createRobot(project.id, {
        name: robotName.trim() || "New Robot",
        componentIds: Array.from(robotComponentIds),
        pluginInstanceIds: Array.from(robotPluginIds)
      });
      setSelectedRobotId(robot.id);
      setRobotName("New Robot");
      setRobotComponentIds(new Set());
      setRobotPluginIds(new Set());
      await refreshArchitecture(project.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "机器人创建失败");
      setStatus("error");
    }
  }

  async function handleDeleteRobot(robotId: string) {
    if (!project) {
      return;
    }
    setStatus("saving");
    try {
      await deleteRobot(project.id, robotId);
      await refreshArchitecture(project.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "机器人删除失败");
      setStatus("error");
    }
  }

  async function saveRobotPatch(robotId: string, patch: Partial<RobotDefinition>) {
    if (!project) {
      throw new Error("project is required");
    }
    setStatus("saving");
    try {
      const updated = await updateRobot(project.id, robotId, patch);
      replaceRobot(updated);
      setError("");
      setStatus("idle");
      return updated;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "机器人保存失败");
      setStatus("error");
      throw nextError;
    }
  }

  async function persistPanelLayout(scopeId: string, layout: PanelLayoutItem[]) {
    if (!project) {
      setPanelLayouts((current) => ({ ...current, [scopeId]: layout }));
      return;
    }
    setPanelLayouts((current) => ({ ...current, [scopeId]: layout }));
    try {
      const saved = await savePanelLayout(project.id, scopeId, layout);
      setPanelLayouts((current) => ({ ...current, [scopeId]: saved.layout }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "面板布局保存失败");
    }
  }

  function renderConfigFields(item: DeviceCatalogItem | null) {
    if (!item) {
      return <div className="empty-state">{t("architecture.empty.selectOrCreateDevice")}</div>;
    }
    return (
      <div className="architecture-form-grid">
        {item.configSchema.map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            {renderConfigInput(field)}
          </label>
        ))}
      </div>
    );
  }

  function renderConfigInput(field: DeviceConfigField) {
    const value = configDraft[field.id] ?? "";
    if (field.kind === "toggle") {
      return <input type="checkbox" checked={value === true} onChange={(event) => setConfigDraftValue(field.id, event.target.checked)} />;
    }
    if (field.kind === "select") {
      return (
        <select value={String(value)} onChange={(event) => setConfigDraftValue(field.id, event.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type={field.kind === "number" ? "number" : "text"}
        min={field.min}
        max={field.max}
        step={field.step}
        value={String(value)}
        onChange={(event) => setConfigDraftValue(field.id, event.target.value)}
      />
    );
  }

  function setConfigDraftValue(key: string, value: string | number | boolean) {
    setConfigDraft((current) => ({ ...current, [key]: value }));
  }

  async function savePluginInstanceConfig(instance: PluginInstance, patch: DeviceConfig) {
    if (!project) {
      return;
    }
    setStatus("saving");
    try {
      const updated = await updatePluginInstance(project.id, instance.id, {
        config: {
          ...instance.config,
          ...patch
        }
      });
      replacePluginInstance(updated);
      setError("");
      setStatus("idle");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Plugin configuration save failed");
      setStatus("error");
    }
  }

  function renderControl(device: DeviceDescriptor, control: UiControlSchema, instance?: PluginInstance): ReactNode {
    if (control.kind === "button") {
      return null;
    }
    if (control.kind === "group") {
      return (
        <div className="architecture-control-group" key={control.id}>
          <span>{control.label}</span>
          <div className="architecture-panel-controls">{(control.controls ?? []).map((child) => renderControl(device, child, instance))}</div>
        </div>
      );
    }
    if (control.kind === "metric") {
      return (
        <div className="architecture-metric" key={control.id}>
          <span>{control.label}</span>
          <strong>{String(controlDraftValue(device, control) ?? "--") || "--"}</strong>
        </div>
      );
    }
    if (control.kind === "toggle") {
      return (
        <label className="checkbox-field" key={control.id}>
          <input type="checkbox" checked={Boolean(controlDraftValue(device, control))} onChange={(event) => updateControlDraft(device.id, control.id, event.target.checked)} />
          <span>{control.label}</span>
        </label>
      );
    }
    if (control.kind === "select") {
      return (
        <label key={control.id}>
          <span>{control.label}</span>
          <select value={String(controlDraftValue(device, control) ?? "")} onChange={(event) => updateControlDraft(device.id, control.id, event.target.value)}>
            {(control.options ?? []).map((option) => (
              <option key={String(option.value)} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    }
    if (control.kind === "cameraView") {
      const url = String(controlDraftValue(device, control) ?? "");
      return (
        <div className="architecture-camera-view" key={control.id}>
          {url ? <img alt={control.label} src={url} /> : <div className="empty-state">{t("architecture.empty.noCameraStream")}</div>}
        </div>
      );
    }
    if (control.kind === "localCameraView") {
      return (
        <LocalCameraView
          fps={typeof device.metadata?.fps === "boolean" ? null : device.metadata?.fps}
          height={typeof device.metadata?.height === "boolean" ? null : device.metadata?.height}
          key={control.id}
          label={control.label}
          onDeviceSelected={(deviceId) => {
            updateControlDraft(device.id, "preferredDeviceId", deviceId);
            if (instance) {
              void savePluginInstanceConfig(instance, { preferredDeviceId: deviceId });
            }
          }}
          preferredDeviceId={String(device.metadata?.preferredDeviceId ?? "")}
          width={typeof device.metadata?.width === "boolean" ? null : device.metadata?.width}
        />
      );
    }
    if (control.kind === "textarea" || control.kind === "output") {
      return (
        <label className="architecture-wide-field" key={control.id}>
          <span>{control.label}</span>
          <textarea value={String(controlDraftValue(device, control) ?? "")} onChange={(event) => updateControlDraft(device.id, control.id, event.target.value)} />
        </label>
      );
    }
    return (
      <label key={control.id}>
        <span>{control.label}</span>
        <input
          type={control.kind === "slider" ? "range" : "number"}
          min={control.min}
          max={control.max}
          step={control.step}
          value={String(controlDraftValue(device, control) ?? "")}
          onChange={(event) => updateControlDraft(device.id, control.id, event.target.value)}
        />
      </label>
    );
  }

  function controlDraftValue(device: DeviceDescriptor, control: UiControlSchema): unknown {
    const draft = controlDraftByDeviceId[device.id] ?? platformControlDefaultsForDevice(device);
    return control.id in draft ? draft[control.id] : "";
  }

  function updateControlDraft(deviceId: string, key: string, value: unknown) {
    const device = pluginInstances.map((instance) => createDeviceDescriptorFromPluginInstance(instance)).find((item) => item.id === deviceId);
    const defaults = platformControlDefaultsForDevice(device);
    setControlDraftByDeviceId((current) => ({
      ...current,
      [deviceId]: {
        ...defaults,
        ...current[deviceId],
        [key]: value
      }
    }));
  }

  async function runControlAction(device: DeviceDescriptor, actionId: string | undefined) {
    const command = platformCommandForControl(device, actionId, controlDraftByDeviceId[device.id] ?? platformControlDefaultsForDevice(device));
    if (typeof command === "string") {
      setError(command);
      return;
    }
    try {
      await onPrepareCommand?.(device.type);
      const result = await dispatchPlatformCommand(command);
      setError(result.message ?? "");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "命令发送失败");
    }
  }

  function renderPanelForInstance(instance: PluginInstance, layout?: PanelLayoutItem) {
    const device = createDeviceDescriptorFromPluginInstance(instance);
    const panel = findPlatformUiPanelForDevice(device, uiPanels);
    const actions = platformActionControls(panel?.controls ?? []);
    const style = layout ? ({ gridColumn: `${layout.x + 1} / span ${layout.w}`, gridRow: `span ${layout.h}` } as CSSProperties) : undefined;
    return (
      <article
        className="architecture-panel-card"
        draggable={Boolean(layout)}
        key={layout?.id ?? instance.id}
        onDragStart={() => layout && setDraggingPanelId(layout.id)}
        onDragOver={(event) => layout && event.preventDefault()}
        onDrop={() => {
          if (!layout || !draggingPanelId || draggingPanelId === layout.id) {
            return;
          }
          const scopeId = layout.scopeId;
          void persistPanelLayout(scopeId, reorderPanelLayoutItems(panelLayouts[scopeId] ?? [], draggingPanelId, layout.id));
          setDraggingPanelId(null);
        }}
        style={style}
      >
        <header className="architecture-panel-card-head">
          {layout && <GripVertical size={17} />}
          <span>
            <strong>{layout?.title ?? instance.name}</strong>
            <small>{platformTypeLabel(instance.type)} · {pluginInstanceDeviceId(instance)}</small>
          </span>
        </header>
        {!panel ? (
          <div className="empty-state">{t("architecture.empty.noDedicatedPanel")}</div>
        ) : (
          <>
            <div className="architecture-panel-controls">{panel.controls.map((control) => renderControl(device, control, instance))}</div>
            <div className="architecture-actions">
              {actions.map((control) => (
                <button className="icon-button" key={`${device.id}:${control.id}`} onClick={() => void runControlAction(device, control.actionId)} type="button">
                  <Send size={16} />
                  <span>{control.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </article>
    );
  }

  function renderPanelGrid(scopeId: string, instances: PluginInstance[]) {
    const targets = panelTargetsForPluginInstances(instances, uiPanels);
    const layout = mergePanelLayoutItems(scopeId, panelLayouts[scopeId] ?? defaultPanelLayoutItems(scopeId, targets), targets);
    const instanceByTarget = new Map(instances.map((instance) => [pluginInstanceDeviceId(instance), instance]));
    return (
      <div className="architecture-layout-grid">
        {layout.map((item) => {
          const instance = instanceByTarget.get(item.targetId);
          return instance ? renderPanelForInstance(instance, item) : null;
        })}
      </div>
    );
  }

  function renderPluginDebug(instance: PluginInstance) {
    if (renderPluginDebugPanel) {
      const customDebugPanel = renderPluginDebugPanel(instance, { refreshArchitecture, replacePluginInstance });
      if (customDebugPanel !== null && customDebugPanel !== undefined) {
        return customDebugPanel;
      }
    }
    if (instance.type === "servo") {
      return renderServoPluginDebug(instance);
    }
    if (instance.type === "motor") {
      return renderMotorPluginDebug(instance);
    }
    return renderPanelForInstance(instance);
  }

  function renderServoPluginDebug(instance: PluginInstance) {
    const servo = pluginInstancesToServoProfiles([instance])[0];
    if (!servo) {
      return <div className="empty-state">{t("architecture.empty.invalidServoPlugin")}</div>;
    }
    const draft = pluginDebugDraft(instance);
    const feedback = pluginServoFeedbackById[instance.id];
    const message = pluginDebugMessageById[instance.id];
    const span = servoLogicalSpan(servo);
    const logicalAngle = clampPluginServoLogical(instance, Number(draft.angleDeg));
    const resetDeg = clampPluginServoLogical(instance, Number(draft.resetDeg));
    const neutralDeg = clampPluginServoLogical(
      instance,
      Number.isFinite(Number(instance.config.neutralDeg)) ? Number(instance.config.neutralDeg) : span / 2
    );
    const speedRaw = clamp(Math.round(Number(draft.speedRaw)), 0, 4095);
    const acc = clamp(Math.round(Number(draft.acc)), 0, 254);
    const servoConfigBusy = pluginServoConfigBusyById[instance.id] === true;
    const serialLogs = pluginSerialLogById[instance.id] ?? [];

    function updateAngle(value: string, live = false) {
      const nextDraft = { ...draft, angleDeg: value };
      updatePluginDebugDraft(instance.id, { angleDeg: value });
      if (live && draft.liveDragEnabled && draft.mode === "position" && !servoConfigBusy) {
        void sendPluginServoPosition(instance, { live: true, draft: nextDraft });
      }
    }

    return (
      <div className="plugin-instance-debug-stack">
        <article className="servo-command-card selected plugin-debug-card">
          <div className="servo-command-card-header">
            <button className="servo-card-select" type="button">
              <span className="device-id">ID {servo.id}</span>
              <span className="device-name">{servo.name}</span>
            </button>
            <div className="servo-card-status-stack">
              <span className={feedback ? "device-signal" : "device-signal muted"}>{feedback ? t("architecture.servoDebug.feedback") : t("architecture.servoDebug.notRead")}</span>
              <span className="device-signal motion muted">{draft.mode === "position" ? t("fields.positionMode") : t("fields.wheelMode")}</span>
            </div>
          </div>

          <div className="command-grid servo-command-grid">
            <label>
              <span>{t("fields.controlMode")}</span>
              <select disabled={servoConfigBusy} value={draft.mode} onChange={(event) => updatePluginDebugDraft(instance.id, { mode: event.target.value as PluginDebugDraft["mode"] })}>
                <option value="position">{t("fields.positionMode")}</option>
                <option value="wheel">{t("fields.wheelMode")}</option>
              </select>
            </label>
            {draft.mode === "position" ? (
              <div className="angle-combo-field">
                <div className="angle-field-heading">
                  <span>{t("fields.angleDeg")}</span>
                  <label className="live-drag-toggle">
                    <input checked={draft.liveDragEnabled} disabled={servoConfigBusy} type="checkbox" onChange={(event) => updatePluginDebugDraft(instance.id, { liveDragEnabled: event.target.checked })} />
                    <span>{t("fields.liveDrag")}</span>
                  </label>
                </div>
                <div className="range-number-control">
                  <input className="angle-range" disabled={servoConfigBusy} type="range" min={0} max={span} step={1} value={formatArmNumber(logicalAngle)} onChange={(event) => updateAngle(event.target.value, true)} />
                  <input className="angle-number" disabled={servoConfigBusy} type="number" min={0} max={span} step={1} value={draft.angleDeg} onChange={(event) => updateAngle(event.target.value)} />
                </div>
              </div>
            ) : (
              <label>
                <span>{t("fields.wheelMaxSpeedRaw")}</span>
                <input disabled={servoConfigBusy} type="number" min={-4095} max={4095} step={1} value={draft.speedRaw} onChange={(event) => updatePluginDebugDraft(instance.id, { speedRaw: event.target.value })} />
              </label>
            )}
            {draft.mode === "position" ? (
              <label>
                <span>{t("fields.speedRaw")}</span>
                <input disabled={servoConfigBusy} type="number" min={0} max={4095} step={1} value={draft.speedRaw} onChange={(event) => updatePluginDebugDraft(instance.id, { speedRaw: event.target.value })} />
              </label>
            ) : null}
            <label>
              <span>{t("fields.acceleration")}</span>
              <input disabled={servoConfigBusy} type="number" min={0} max={254} step={1} value={draft.acc} onChange={(event) => updatePluginDebugDraft(instance.id, { acc: event.target.value })} />
            </label>
          </div>

          <div className="servo-extra-grid">
            <label className="checkbox-field">
              <input type="checkbox" checked={draft.reverse} disabled={servoConfigBusy} onChange={(event) => updatePluginDebugDraft(instance.id, { reverse: event.target.checked })} />
              <span>{t("fields.temporaryReverse")}</span>
            </label>
            <Metric label={t("architecture.servoDebug.logicalRange")} value={`0-${formatArmNumber(span)} deg`} />
            <Metric label={t("architecture.servoDebug.physicalLimit")} value={`${draft.minDeg}-${draft.maxDeg} deg`} />
          </div>

          <div className="servo-card-telemetry">
            <span><small>{t("metrics.position")}</small><strong>{feedback?.positionDeg === undefined ? "--" : `${feedback.positionDeg.toFixed(1)}°`}</strong></span>
            <span><small>{t("metrics.load")}</small><strong>{feedback?.loadPercent === undefined ? "--" : `${feedback.loadPercent.toFixed(1)}%`}</strong></span>
            <span><small>{t("metrics.voltage")}</small><strong>{feedback?.voltageV === undefined ? "--" : `${feedback.voltageV.toFixed(1)}V`}</strong></span>
            <span><small>{t("metrics.temp")}</small><strong>{feedback?.temperatureC === undefined ? "--" : `${feedback.temperatureC}°C`}</strong></span>
            <span><small>{t("metrics.current")}</small><strong>{feedback?.currentMa === undefined ? "--" : `${feedback.currentMa.toFixed(1)}mA`}</strong></span>
            <span><small>{t("metrics.moving")}</small><strong>{feedback ? (feedback.moving ? t("common.yes") : t("common.no")) : "--"}</strong></span>
          </div>

          <div className="action-grid servo-card-actions">
            <button className="icon-button primary" disabled={servoConfigBusy} onClick={() => (draft.mode === "wheel" ? void sendPluginServoWheel(instance) : void sendPluginServoPosition(instance))} type="button">
              <Send size={18} />
              <span>{draft.mode === "wheel" ? t("platform.controls.set_speed") : t("platform.controls.set_position")}</span>
            </button>
            <button className="icon-button danger" disabled={servoConfigBusy} onClick={() => void runPluginCommand(instance, draft.mode === "wheel" ? "servo.set_speed" : "servo.set_position", draft.mode === "wheel" ? { speedRaw: 0, acc } : { angleDeg: logicalAngle, speedRaw: 0, acc })} type="button">
              <Square size={18} />
              <span>{t("actions.pause")}</span>
            </button>
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => void runPluginCommand(instance, "servo.ping")} type="button"><Radar size={18} /><span>Ping</span></button>
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => void readPluginServo(instance)} type="button"><Activity size={18} /><span>{t("actions.readFeedback")}</span></button>
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => void runPluginCommand(instance, "servo.set_torque", { enabled: true })} type="button"><Wrench size={18} /><span>{t("actions.torqueOn")}</span></button>
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => void runPluginCommand(instance, "servo.set_torque", { enabled: false })} type="button"><Wrench size={18} /><span>{t("actions.torqueOff")}</span></button>
          </div>
        </article>

        <section className="plugin-servo-limiter">
          <div className="plugin-servo-limiter-head">
            <div>
              <strong>{t("architecture.servoDebug.resetTitle")}</strong>
              <span>{t("architecture.servoDebug.resetHint")}</span>
            </div>
            <div className="plugin-servo-limiter-metrics">
              <Metric label={t("architecture.servoDebug.resetAngle")} value={`${formatArmNumber(resetDeg)} deg`} tone="online" />
              <Metric label={t("architecture.servoDebug.logicalCenter")} value={`${formatArmNumber(neutralDeg)} deg`} />
              <Metric label={t("fields.canServoId")} value={servo.id} />
            </div>
          </div>
          <div className="command-grid plugin-servo-limit-grid">
            <label>
              <span>{t("fields.minAngle")}</span>
              <input disabled={servoConfigBusy} type="number" min={0} max={360} step={1} value={draft.minDeg} onChange={(event) => updatePluginDebugDraft(instance.id, { minDeg: event.target.value })} />
            </label>
            <label>
              <span>{t("fields.maxAngle")}</span>
              <input disabled={servoConfigBusy} type="number" min={0} max={360} step={1} value={draft.maxDeg} onChange={(event) => updatePluginDebugDraft(instance.id, { maxDeg: event.target.value })} />
            </label>
            <label>
              <span>{t("architecture.servoDebug.resetAngle")}</span>
              <input disabled={servoConfigBusy} type="number" min={0} max={span} step={1} value={draft.resetDeg} onChange={(event) => updatePluginDebugDraft(instance.id, { resetDeg: event.target.value })} />
            </label>
          </div>
          <div className="action-grid plugin-servo-limit-actions">
            <button className="icon-button primary" disabled={servoConfigBusy} onClick={() => void savePluginServoSettings(instance)} type="button"><Save size={18} /><span>{t("architecture.actions.saveLimits")}</span></button>
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => setPluginServoResetFromFeedback(instance)} type="button"><Activity size={18} /><span>{t("architecture.actions.setResetPoint")}</span></button>
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => void setPluginServoNeutralFromFeedback(instance)} type="button"><Activity size={18} /><span>{t("architecture.actions.setLogicalCenter")}</span></button>
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => void resetPluginServo(instance)} type="button"><RotateCcw size={18} /><span>{t("architecture.actions.reset")}</span></button>
          </div>
        </section>

        <section className="plugin-servo-limiter plugin-servo-advanced">
          <div className="plugin-servo-limiter-head">
            <div>
              <strong>{t("architecture.servoDebug.internalTitle")}</strong>
              <span>{t("architecture.servoDebug.internalHint")}</span>
            </div>
            <div className="plugin-servo-limiter-metrics">
              <Metric label={t("architecture.servoDebug.currentId")} value={servo.id} tone="warning" />
              <Metric label={t("architecture.servoDebug.targetId")} value={draft.newServoId || "--"} />
            </div>
          </div>
          <div className="command-grid plugin-servo-advanced-grid">
            <label>
              <span>{t("architecture.servoDebug.newId")}</span>
              <input disabled={servoConfigBusy} type="number" min={0} max={253} step={1} value={draft.newServoId} onChange={(event) => updatePluginDebugDraft(instance.id, { newServoId: event.target.value })} />
            </label>
            <label className="checkbox-field plugin-servo-confirm">
              <input checked={draft.confirmSingleServo} disabled={servoConfigBusy} type="checkbox" onChange={(event) => updatePluginDebugDraft(instance.id, { confirmSingleServo: event.target.checked })} />
              <span>{t("architecture.servoDebug.singleServoConfirm")}</span>
            </label>
          </div>
          <div className="action-grid plugin-servo-limit-actions">
            <button className="icon-button" disabled={servoConfigBusy} onClick={() => void runPluginCommand(instance, "servo.ping")} type="button"><Radar size={18} /><span>{t("architecture.actions.pingCurrentId")}</span></button>
            <button className="icon-button danger" disabled={servoConfigBusy || !draft.confirmSingleServo} onClick={() => void writePluginServoPhysicalId(instance)} type="button"><Wrench size={18} /><span>{servoConfigBusy ? t("architecture.actions.writing") : t("architecture.actions.writeNewId")}</span></button>
          </div>
        </section>

        <section className="plugin-serial-monitor">
          <div className="plugin-serial-monitor-head">
            <div>
              <strong>{t("architecture.servoDebug.serialTitle")}</strong>
              <span>{t("architecture.servoDebug.serialHint")}</span>
            </div>
            <button className="icon-button" disabled={serialLogs.length === 0} onClick={() => setPluginSerialLogById((current) => ({ ...current, [instance.id]: [] }))} type="button">
              <Trash2 size={16} />
              <span>{t("architecture.actions.clear")}</span>
            </button>
          </div>
          <div className="plugin-serial-log-list">
            {serialLogs.length === 0 ? <div className="empty-state">{t("architecture.empty.noAdvancedWrites")}</div> : serialLogs.map((line, index) => <code key={`${line}-${index}`}>{line}</code>)}
          </div>
        </section>

        {message ? <div className={`architecture-debug-message ${message.tone}`}>{message.text}</div> : null}
      </div>
    );
  }

  function renderMotorPluginDebug(instance: PluginInstance) {
    const motor = pluginInstancesToMotorProfiles([instance])[0];
    if (!motor) {
      return <div className="empty-state">{t("architecture.empty.invalidMotorPlugin")}</div>;
    }
    const draft = pluginDebugDraft(instance);
    const message = pluginDebugMessageById[instance.id];
    const speed = clamp(Math.round(Number(draft.motorSpeedPercent)), -100, 100);
    return (
      <div className="plugin-instance-debug-stack">
        <article className="servo-command-card selected plugin-debug-card">
          <div className="servo-command-card-header">
            <button className="servo-card-select" type="button">
              <span className="device-id">{normalizeMotorChannel(motor.channel)}</span>
              <span className="device-name">{motor.name}</span>
            </button>
            <span className="device-signal motion muted">TB6618 {t("platform.types.motor")}</span>
          </div>
          <div className="command-grid motor-command-grid">
            <label>
              <span>{t("fields.speedPercent")}</span>
              <input type="number" min={-100} max={100} step={1} value={draft.motorSpeedPercent} onChange={(event) => updatePluginDebugDraft(instance.id, { motorSpeedPercent: event.target.value })} />
            </label>
            <label>
              <span>{t("fields.stopMode")}</span>
              <select value={draft.stopMode} onChange={(event) => updatePluginDebugDraft(instance.id, { stopMode: event.target.value as MotorStopMode })}>
                <option value="coast">{t("stopMode.coast")}</option>
                <option value="brake">{t("stopMode.brake")}</option>
              </select>
            </label>
          </div>
          <label className="speed-slider-field">
            <span>{t("fields.speedSlider")}</span>
            <input type="range" min={-100} max={100} step={1} value={speed} onChange={(event) => updatePluginDebugDraft(instance.id, { motorSpeedPercent: event.target.value })} />
          </label>
          <div className="port-config-panel plugin-motor-config-panel">
            <div className="port-config-title">
              <Wrench size={17} />
              <span>{t("panels.motorPortMapping")}</span>
            </div>
            <div className="port-config-grid">
              <label><span>PWM</span><input value={draft.pwmPin} onChange={(event) => updatePluginDebugDraft(instance.id, { pwmPin: event.target.value })} /></label>
              <label><span>IN1</span><input value={draft.in1Pin} onChange={(event) => updatePluginDebugDraft(instance.id, { in1Pin: event.target.value })} /></label>
              <label><span>IN2</span><input value={draft.in2Pin} onChange={(event) => updatePluginDebugDraft(instance.id, { in2Pin: event.target.value })} /></label>
              <label><span>EN/STBY</span><input value={draft.enablePin} onChange={(event) => updatePluginDebugDraft(instance.id, { enablePin: event.target.value })} /></label>
              <label><span>{t("fields.sensorPin")}</span><input value={draft.sensorPin} onChange={(event) => updatePluginDebugDraft(instance.id, { sensorPin: event.target.value })} /></label>
            </div>
          </div>
          <div className="preview-grid motor-preview-grid">
            <Metric label={t("fields.targetPort")} value={normalizeMotorChannel(motor.channel)} />
            <Metric label={t("metrics.speed")} value={`${speed}%`} tone={speed === 0 ? "neutral" : "warning"} />
            <Metric label={t("fields.stopMode")} value={draft.stopMode === "brake" ? t("stopMode.brake") : t("stopMode.coast")} />
          </div>
          <div className="action-grid">
            <button className="icon-button primary" onClick={() => void sendPluginMotorSpeed(instance)} type="button"><Send size={18} /><span>{t("platform.controls.set_speed")}</span></button>
            <button className="icon-button danger" onClick={() => void runPluginCommand(instance, "motor.stop", { stopMode: draft.stopMode })} type="button"><Square size={18} /><span>{t("actions.stop")}</span></button>
            <button className="icon-button" onClick={() => void runPluginCommand(instance, "motor.read_feedback")} type="button"><Activity size={18} /><span>{t("actions.readFeedback")}</span></button>
            <button className="icon-button" onClick={() => void savePluginMotorMapping(instance)} type="button"><Save size={18} /><span>{t("actions.savePortMapping")}</span></button>
            <button className="icon-button" onClick={() => void sendPluginMotorMapping(instance)} type="button"><Wrench size={18} /><span>{t("actions.sendPortMapping")}</span></button>
          </div>
        </article>
        {message ? <div className={`architecture-debug-message ${message.tone}`}>{message.text}</div> : null}
      </div>
    );
  }

  function renderRobotArmComponentPanel(component: ComponentDefinition) {
    const componentInstances = componentPluginInstances(component);
    const servoProfiles = componentServoProfiles(component);
    const config = currentArmConfigForComponent(component);
    const poses = calculateArmSegmentPoses(config.joints, { x: 300, y: 250 });
    const selectedJoint = config.joints.find((joint) => joint.id === config.selectedJointId) ?? config.joints[0] ?? null;
    const selectedServo = selectedJoint ? servoProfiles.find((servo) => servo.id === selectedJoint.servoId) : null;
    const selectedServoInstance = selectedJoint
      ? componentInstances.find((instance) => instance.type === "servo" && Number(instance.config.servoId) === selectedJoint.servoId) ?? null
      : null;
    const usedServoIds = new Set(config.joints.filter((joint) => joint.id !== selectedJoint?.id).map((joint) => joint.servoId));
    const selectedSpan = selectedServo ? servoLogicalSpan(selectedServo) : 360;
    const selectedJointIndex = selectedJoint ? config.joints.findIndex((joint) => joint.id === selectedJoint.id) : -1;
    const selectedLimitDraft = selectedServo && selectedServoInstance ? componentServoLimitDraft(selectedServoInstance, selectedServo) : null;
    const selectedLimitError = selectedServoInstance ? componentServoLimitErrorByInstanceId[selectedServoInstance.id] : "";
    const autoConfig = currentArmAutoConfigForComponent(component, config);
    const isIkMode = autoConfig.mode === "ik";
    const ikSolution = armIkSolutionByComponentId[component.id];
    const endEffector = poses[poses.length - 1];
    const targetPoint = ikSolution?.target ?? autoConfig.target ?? (endEffector ? { x: endEffector.endX, y: endEffector.endY } : ARM_WORKSPACE_ORIGIN);
    const recordedSamples = armAutoSamplesByComponentId[component.id] ?? [];
    const archiveDraft = componentArmArchiveDraft(component.id, autoConfig);
    const selectedArchive = autoConfig.archives.find((archive) => archive.id === archiveDraft.selectedArchiveId) ?? autoConfig.archives[0] ?? null;
    const archivePlaying = selectedArchive ? armArchivePlayingId === selectedArchive.id : false;
    const ikStatusTone: MetricTone = !ikSolution ? "neutral" : ikSolution.converged ? "online" : "warning";
    const ikStatusClass = !ikSolution ? "info" : ikSolution.converged ? "ok" : "warning";
    const selectedPose = selectedJoint ? poses.find((pose) => pose.jointId === selectedJoint.id) : undefined;
    const selectedJointNeutralFrameDeg = selectedJoint && selectedPose ? selectedPose.frameDeg - (selectedJoint.angleDeg - selectedJoint.neutralDeg) : 0;

    function updateArm(updater: (current: ArmConfig) => ArmConfig, live = false) {
      updateComponentArmConfig(component, updater, { live });
    }

    function setArmAutoMode(mode: ComponentArmAutoConfig["mode"]) {
      updateComponentArmAutoConfig(component, (current) => ({ ...current, mode }));
      if (mode === "manual") {
        setDraggingArmIkComponentId(null);
      }
    }

    function setArmIkSendMode(sendMode: ComponentArmIkSendMode) {
      updateComponentArmAutoConfig(component, (current) => ({ ...current, sendMode }));
    }

    function updateJoint(jointId: string, updater: (joint: ArmJointConfig) => ArmJointConfig, live = false) {
      updateArm(
        (current) => ({
          ...current,
          joints: current.joints.map((joint) => (joint.id === jointId ? updater(joint) : joint))
        }),
        live
      );
    }

    function updateJointNumber(jointId: string, field: "lengthPx" | "angleDeg" | "neutralDeg" | "speedRaw" | "acc", value: string, live = false) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      updateJoint(
        jointId,
        (joint) => {
          const servo = servoProfiles.find((item) => item.id === joint.servoId);
          const span = servo ? servoLogicalSpan(servo) : 360;
          if (field === "lengthPx") {
            const lengthPx = clamp(Math.round(numericValue), ARM_MIN_JOINT_LENGTH_PX, ARM_MAX_JOINT_LENGTH_PX);
            const shapeSegments = armJointShapeSegments(joint).map((segment, index) => (index === 0 ? { ...segment, lengthPx } : segment));
            return { ...joint, lengthPx, shapeSegments };
          }
          if (field === "speedRaw") {
            return { ...joint, speedRaw: clamp(Math.round(numericValue), 0, 4095) };
          }
          if (field === "acc") {
            return { ...joint, acc: clamp(Math.round(numericValue), 0, 254) };
          }
          return { ...joint, [field]: clamp(numericValue, 0, span) };
        },
        live
      );
    }

    function updateJointShapeSegment(
      jointId: string,
      segmentId: string,
      updater: (segment: ReturnType<typeof armJointShapeSegments>[number]) => ReturnType<typeof armJointShapeSegments>[number]
    ) {
      updateJoint(jointId, (joint) => {
        const shapeSegments = armJointShapeSegments(joint).map((segment) => (segment.id === segmentId ? updater(segment) : segment));
        return { ...joint, shapeSegments, lengthPx: shapeSegments[0]?.lengthPx ?? joint.lengthPx };
      });
    }

    function updateJointShapeSegmentNumber(jointId: string, segmentId: string, field: "lengthPx" | "directionDeg", value: string) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      updateJointShapeSegment(jointId, segmentId, (segment) => ({
        ...segment,
        [field]: field === "lengthPx"
          ? clamp(Math.round(numericValue), ARM_MIN_JOINT_LENGTH_PX, ARM_MAX_JOINT_LENGTH_PX)
          : ((numericValue % 360) + 360) % 360
      }));
    }

    function updateJointShapeSegmentCanvasDirection(jointId: string, segmentId: string, value: string) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      const localDirectionDeg = normalizeArmDisplayDegrees(numericValue - selectedJointNeutralFrameDeg);
      updateJointShapeSegmentNumber(jointId, segmentId, "directionDeg", String(localDirectionDeg));
    }

    function segmentCanvasDirectionDeg(directionDeg: number) {
      return normalizeArmDisplayDegrees(selectedJointNeutralFrameDeg + directionDeg);
    }

    function addJointShapeSegment(jointId: string) {
      updateJoint(jointId, (joint) => {
        const shapeSegments = armJointShapeSegments(joint);
        const id = `shape-${Date.now().toString(36)}`;
        const nextSegments = [
          ...shapeSegments,
          { id, name: `段 ${shapeSegments.length + 1}`, lengthPx: DEFAULT_ARM_JOINT_LENGTH_PX, directionDeg: 90 }
        ];
        return { ...joint, shapeSegments: nextSegments, lengthPx: nextSegments[0]?.lengthPx ?? joint.lengthPx };
      });
    }

    function removeJointShapeSegment(jointId: string, segmentId: string) {
      updateJoint(jointId, (joint) => {
        const shapeSegments = armJointShapeSegments(joint);
        if (shapeSegments.length <= 1) {
          return joint;
        }
        const nextSegments = shapeSegments.filter((segment) => segment.id !== segmentId);
        return { ...joint, shapeSegments: nextSegments, lengthPx: nextSegments[0]?.lengthPx ?? joint.lengthPx };
      });
    }

    function updateJointChildFrameOffset(jointId: string, value: string) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        return;
      }
      updateJoint(jointId, (joint) => ({ ...joint, childFrameOffsetDeg: clamp(numericValue, -180, 180) }));
    }

    function setJointIndex(jointId: string, nextIndex: number) {
      updateArm((current) => {
        const currentIndex = current.joints.findIndex((joint) => joint.id === jointId);
        if (currentIndex < 0) {
          return current;
        }
        const clampedIndex = clamp(Math.round(nextIndex), 0, current.joints.length - 1);
        if (clampedIndex === currentIndex) {
          return { ...current, selectedJointId: jointId };
        }
        const joints = [...current.joints];
        const [joint] = joints.splice(currentIndex, 1);
        joints.splice(clampedIndex, 0, joint);
        return { ...current, joints, selectedJointId: jointId };
      });
    }

    function moveJoint(jointId: string, direction: -1 | 1) {
      const currentIndex = config.joints.findIndex((joint) => joint.id === jointId);
      if (currentIndex >= 0) {
        setJointIndex(jointId, currentIndex + direction);
      }
    }

    function svgPoint(svg: SVGSVGElement, event: ReactPointerEvent<Element>) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const matrix = svg.getScreenCTM();
      return matrix ? point.matrixTransform(matrix.inverse()) : { x: point.x, y: point.y };
    }

    function dragJoint(joint: ArmJointConfig, pointer: { x: number; y: number }) {
      const jointIndex = config.joints.findIndex((item) => item.id === joint.id);
      const servo = servoProfiles.find((item) => item.id === joint.servoId);
      if (jointIndex < 0 || !servo) {
        return;
      }
      const previousPose = jointIndex > 0 ? poses[jointIndex - 1] : undefined;
      const currentPose = poses[jointIndex];
      const nextAngle = calculateArmDragAngle({
        anchor: previousPose ? { x: previousPose.endX, y: previousPose.endY } : { x: currentPose?.startX ?? 300, y: currentPose?.startY ?? 250 },
        pointer,
        parentGlobalDeg: previousPose?.childFrameDeg ?? 0,
        neutralDeg: joint.neutralDeg,
        servoSpanDeg: servoLogicalSpan(servo),
        currentAngleDeg: joint.angleDeg,
        localEndDirectionDeg: armJointLocalEndDirectionDeg(joint)
      });
      updateJointNumber(joint.id, "angleDeg", String(nextAngle), true);
    }

    function handleArmSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
      const pointer = svgPoint(event.currentTarget, event);
      if (isIkMode && draggingArmIkComponentId === component.id) {
        solveComponentArmIkTarget(component, pointer, { record: true });
        return;
      }
      const joint = !isIkMode ? config.joints.find((item) => item.id === draggingArmJointId) : null;
      if (joint) {
        dragJoint(joint, pointer);
      }
    }

    function finishArmPointerInteraction() {
      finishComponentArmIkDrag(component);
      setDraggingArmJointId(null);
    }

    if (servoProfiles.length === 0 || config.joints.length === 0) {
      return <div className="empty-state">{t("architecture.armComponent.empty.noServoPlugin")}</div>;
    }

    return (
      <div className="architecture-layout-grid">
        <article className="architecture-panel-card architecture-arm-panel" style={{ gridColumn: "1 / -1" }}>
          <header className="architecture-panel-card-head">
            <Bot size={18} />
            <span>
              <strong>{component.name}</strong>
              <small>{componentKindLabel("robot-arm")} · {t("architecture.armComponent.jointCount", { count: config.joints.length })}</small>
            </span>
          </header>

          <div className="arm-editor-stack">
            <div className="arm-simulator">
              <svg
                className="arm-svg"
                viewBox="0 0 600 420"
                role="img"
                aria-label={t("architecture.armComponent.poseAria", { name: component.name })}
                onPointerMove={handleArmSvgPointerMove}
                onPointerUp={finishArmPointerInteraction}
                onPointerCancel={finishArmPointerInteraction}
                onPointerLeave={(event) => {
                  if (event.buttons === 0) {
                    finishArmPointerInteraction();
                  }
                }}
              >
                <defs>
                  <pattern id={`arm-grid-${component.id}`} width="32" height="32" patternUnits="userSpaceOnUse">
                    <path d="M 32 0 L 0 0 0 32" fill="none" />
                  </pattern>
                </defs>
                <rect className="arm-grid-bg" x="0" y="0" width="600" height="420" fill={`url(#arm-grid-${component.id})`} />
                <line className="arm-axis" x1="40" y1="250" x2="560" y2="250" />
                <line className="arm-axis" x1="300" y1="56" x2="300" y2="364" />
                <circle className="arm-base" cx="300" cy="250" r="10" />
                {poses.map((pose) => {
                  const joint = config.joints.find((item) => item.id === pose.jointId);
                  const selected = pose.jointId === selectedJoint?.id;
                  if (!joint) {
                    return null;
                  }
                  return (
                    <g className={selected ? "arm-segment selected" : "arm-segment"} key={pose.jointId}>
                      <polyline points={pose.pathPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
                      <circle
                        className="arm-handle"
                        cx={pose.endX}
                        cy={pose.endY}
                        r={selected ? 12 : 10}
                        tabIndex={0}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          updateArm((current) => ({ ...current, selectedJointId: joint.id }));
                          if (isIkMode) {
                            return;
                          }
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDraggingArmJointId(joint.id);
                        }}
                      />
                      <text className="arm-label" x={pose.endX + 12} y={pose.endY - 12}>
                        ID {pose.servoId} · {formatArmNumber(pose.angleDeg)}° · {pose.lengthPx}px
                      </text>
                    </g>
                  );
                })}
                {isIkMode ? (
                  <g className="arm-ik-target-marker">
                    <line x1={targetPoint.x - 10} y1={targetPoint.y} x2={targetPoint.x + 10} y2={targetPoint.y} />
                    <line x1={targetPoint.x} y1={targetPoint.y - 10} x2={targetPoint.x} y2={targetPoint.y + 10} />
                  </g>
                ) : null}
                {poses.length > 0 ? (
                  <circle
                    className={isIkMode ? "arm-end-effector arm-ik-target" : "arm-end-effector"}
                    cx={poses[poses.length - 1].endX}
                    cy={poses[poses.length - 1].endY}
                    r={isIkMode ? 10 : 7}
                    tabIndex={isIkMode ? 0 : undefined}
                    onPointerDown={isIkMode ? (event) => {
                      const svg = event.currentTarget.ownerSVGElement;
                      if (!svg) {
                        return;
                      }
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      startComponentArmIkDrag(component, svgPoint(svg, event));
                    } : undefined}
                  />
                ) : null}
              </svg>
              <div className="arm-status-strip">
                <Metric label={t("architecture.armComponent.metrics.joints")} value={config.joints.filter((joint) => joint.enabled).length} />
                <Metric
                  label={t("architecture.armComponent.metrics.mode")}
                  value={isIkMode ? `${t("architecture.armComponent.modes.ik")} / ${autoConfig.sendMode === "live" ? t("architecture.armComponent.sendMode.live") : t("architecture.armComponent.sendMode.preview")}` : config.liveDragEnabled ? t("architecture.armComponent.modes.liveDrag") : t("architecture.armComponent.sendMode.preview")}
                  tone={isIkMode ? ikStatusTone : config.liveDragEnabled ? "warning" : "neutral"}
                />
                <Metric label={t("architecture.armComponent.metrics.selectedJoint")} value={selectedJoint?.name ?? "--"} />
              </div>
            </div>

            <section className="arm-kinematics-panel component-arm-auto-panel">
              <div className="panel-heading-row component-arm-auto-heading">
                <div className="port-config-title">
                  <Crosshair size={17} />
                  <span>{t("architecture.armComponent.autoIk")}</span>
                </div>
                <span className={`tuning-status ${ikStatusClass}`}>
                  {isIkMode ? (ikSolution ? (ikSolution.converged ? t("architecture.armComponent.ikStatus.converged") : t("architecture.armComponent.ikStatus.nearPose")) : t("architecture.armComponent.ikStatus.awaitingDrag")) : t("architecture.armComponent.modes.manual")}
                </span>
              </div>

              <div className="component-arm-mode-switch" role="group" aria-label={t("architecture.armComponent.modeAria")}>
                <button className={autoConfig.mode === "manual" ? "active" : ""} onClick={() => setArmAutoMode("manual")} type="button">{t("architecture.armComponent.modes.manual")}</button>
                <button className={autoConfig.mode === "ik" ? "active" : ""} onClick={() => setArmAutoMode("ik")} type="button">{t("architecture.armComponent.modes.ik")}</button>
              </div>

              {isIkMode ? (
                <>
                  <div className="component-arm-mode-switch compact" role="group" aria-label={t("architecture.armComponent.sendModeAria")}>
                    <button className={autoConfig.sendMode === "preview" ? "active" : ""} onClick={() => setArmIkSendMode("preview")} type="button">{t("architecture.armComponent.sendMode.preview")}</button>
                    <button className={autoConfig.sendMode === "live" ? "active" : ""} onClick={() => setArmIkSendMode("live")} type="button">{t("architecture.armComponent.sendMode.live")}</button>
                  </div>

                  <div className="arm-ik-result-list component-arm-ik-result-list">
                    <span><strong>{t("architecture.armComponent.ik.targetX")}</strong><code>{formatArmNumber(targetPoint.x)}</code></span>
                    <span><strong>{t("architecture.armComponent.ik.targetY")}</strong><code>{formatArmNumber(targetPoint.y)}</code></span>
                    <span><strong>{t("architecture.armComponent.ik.error")}</strong><code>{ikSolution ? `${formatArmNumber(ikSolution.errorPx)} px` : "--"}</code></span>
                    <span><strong>{t("architecture.armComponent.ik.steps")}</strong><code>{ikSolution?.iterations ?? "--"}</code></span>
                    <span><strong>{t("architecture.armComponent.ik.reachable")}</strong><code>{ikSolution ? (ikSolution.reachable ? t("common.yes") : t("common.no")) : "--"}</code></span>
                    <span><strong>{t("architecture.armComponent.ik.movedJoints")}</strong><code>{ikSolution?.movedJointIds.length ?? 0}</code></span>
                    <span><strong>{t("architecture.armComponent.ik.send")}</strong><code>{autoConfig.sendMode === "live" ? (config.liveDragEnabled ? t("architecture.armComponent.sendMode.live") : t("architecture.armComponent.sendMode.needsLiveDrag")) : t("architecture.armComponent.sendMode.preview")}</code></span>
                  </div>

                  <label className="checkbox-field component-arm-correction-row">
                    <input type="checkbox" checked={autoConfig.correctionEnabled} disabled readOnly />
                    <span>{t("architecture.armComponent.feedbackCorrection")}</span>
                  </label>

                  <div className="component-arm-archive-grid">
                    <label>
                      <span>{t("architecture.armComponent.archive.trackName")}</span>
                      <input value={archiveDraft.name} onChange={(event) => updateComponentArmArchiveDraft(component.id, { name: event.target.value })} />
                    </label>
                    <label>
                      <span>{t("architecture.armComponent.archive.notes")}</span>
                      <input value={archiveDraft.notes} onChange={(event) => updateComponentArmArchiveDraft(component.id, { notes: event.target.value })} />
                    </label>
                    <label>
                      <span>{t("architecture.armComponent.archive.archive")}</span>
                      <select
                        value={selectedArchive?.id ?? ""}
                        onChange={(event) => selectComponentArmArchive(component, autoConfig.archives.find((archive) => archive.id === event.target.value) ?? null)}
                      >
                        <option value="">{t("architecture.armComponent.archive.noneSelected")}</option>
                        {autoConfig.archives.map((archive) => (
                          <option key={archive.id} value={archive.id}>{archive.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="action-grid component-arm-archive-actions">
                    <button className="icon-button primary" onClick={() => void saveCurrentComponentArmArchive(component)} type="button">
                      <Save size={18} />
                      <span>{t("architecture.armComponent.archive.saveCurrent")}</span>
                    </button>
                    <button
                      className={archivePlaying ? "icon-button danger" : "icon-button"}
                      disabled={!selectedArchive}
                      onClick={() => {
                        if (!selectedArchive) {
                          return;
                        }
                        if (archivePlaying) {
                          pauseComponentArchivePlayback(component);
                          return;
                        }
                        void playComponentArchive(component, selectedArchive);
                      }}
                      type="button"
                    >
                      {archivePlaying ? <Square size={18} /> : <Play size={18} />}
                      <span>{archivePlaying ? t("architecture.armComponent.archive.stopPlayback") : t("architecture.armComponent.archive.playArchive")}</span>
                    </button>
                    <button className="icon-button" disabled={!selectedArchive} onClick={() => selectedArchive ? void saveComponentArmArchiveMetadata(component, selectedArchive) : undefined} type="button">
                      <Save size={18} />
                      <span>{t("architecture.armComponent.archive.saveNotes")}</span>
                    </button>
                    <button className="icon-button danger" disabled={!selectedArchive} onClick={() => selectedArchive ? void deleteComponentArmArchive(component, selectedArchive.id) : undefined} type="button">
                      <Trash2 size={18} />
                      <span>{t("architecture.armComponent.archive.deleteArchive")}</span>
                    </button>
                  </div>

                  <div className="arm-ik-result-list component-arm-archive-summary">
                    <span><strong>{t("architecture.armComponent.archive.currentSamples")}</strong><code>{recordedSamples.length}</code></span>
                    <span><strong>{t("architecture.armComponent.archive.currentDuration")}</strong><code>{recordedSamples.length ? `${recordedSamples[recordedSamples.length - 1].tMs} ms` : "--"}</code></span>
                    <span><strong>{t("architecture.armComponent.archive.archiveCount")}</strong><code>{autoConfig.archives.length}</code></span>
                    <span><strong>{t("architecture.armComponent.archive.selectedSamples")}</strong><code>{selectedArchive?.samples.length ?? 0}</code></span>
                    <span><strong>{t("architecture.armComponent.archive.selectedDuration")}</strong><code>{selectedArchive ? `${selectedArchive.durationMs} ms` : "--"}</code></span>
                  </div>
                </>
              ) : null}
            </section>

            <div className="device-list arm-joint-list">
              {config.joints.map((joint, index) => (
                <div className={selectedJoint?.id === joint.id ? "device-row arm-joint-row selected" : "device-row arm-joint-row"} key={joint.id}>
                  <button className="device-select" onClick={() => updateArm((current) => ({ ...current, selectedJointId: joint.id }))} type="button">
                      <span className="device-id">ID {joint.servoId}</span>
                      <span className="device-info">
                        <span className="device-name">{joint.name}</span>
                        <span className="device-meta">{t("architecture.armComponent.jointOrdinal", { index: index + 1 })} · {formatArmNumber(joint.angleDeg)} deg · {joint.lengthPx}px</span>
                      </span>
                    <span className={joint.enabled ? "device-signal" : "device-signal muted"}>{joint.enabled ? t("fields.enabled") : t("fields.disabled")}</span>
                  </button>
                  <div className="arm-joint-actions">
                    <button className="icon-only" disabled={index === 0} onClick={() => moveJoint(joint.id, -1)} title={t("actions.moveUp")} type="button" aria-label={t("architecture.armComponent.moveUpNamed", { name: joint.name })}>
                      <ArrowUp size={16} />
                    </button>
                    <button className="icon-only" disabled={index === config.joints.length - 1} onClick={() => moveJoint(joint.id, 1)} title={t("actions.moveDown")} type="button" aria-label={t("architecture.armComponent.moveDownNamed", { name: joint.name })}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {selectedJoint ? (
              <>
              <div className="command-grid arm-editor-grid">
                <label>
                  <span>{t("fields.name")}</span>
                  <input value={selectedJoint.name} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, name: event.target.value }))} />
                </label>
                <label>
                  <span>{t("architecture.armComponent.fields.jointIndex")}</span>
                  <select value={selectedJointIndex} onChange={(event) => setJointIndex(selectedJoint.id, Number(event.target.value))}>
                    {config.joints.map((joint, index) => (
                      <option key={joint.id} value={index}>
                        {t("architecture.armComponent.jointOrdinal", { index: index + 1 })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("fields.targetServo")}</span>
                  <select value={selectedJoint.servoId} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, servoId: Number(event.target.value) }))}>
                    {servoProfiles.map((servo) => (
                      <option key={servo.id} value={servo.id} disabled={usedServoIds.has(servo.id)}>
                        ID {servo.id} · {servo.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={selectedJoint.enabled} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, enabled: event.target.checked }))} />
                  <span>{t("fields.enabled")}</span>
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={selectedJoint.reverse} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, reverse: event.target.checked }))} />
                  <span>{t("fields.invertAxis")}</span>
                </label>
                <label>
                  <span>{t("architecture.armComponent.fields.lengthPx")}</span>
                  <input type="number" min={ARM_MIN_JOINT_LENGTH_PX} max={ARM_MAX_JOINT_LENGTH_PX} step={1} value={selectedJoint.lengthPx} onChange={(event) => updateJointNumber(selectedJoint.id, "lengthPx", event.target.value)} />
                </label>
                <label>
                  <span>{t("fields.angleDeg")}</span>
                  <input type="number" min={0} max={selectedSpan} step={1} value={formatArmNumber(selectedJoint.angleDeg)} onChange={(event) => updateJointNumber(selectedJoint.id, "angleDeg", event.target.value, true)} />
                </label>
                <label>
                  <span>{t("architecture.armComponent.fields.neutralDeg")}</span>
                  <input type="number" min={0} max={selectedSpan} step={1} value={formatArmNumber(selectedJoint.neutralDeg)} onChange={(event) => updateJointNumber(selectedJoint.id, "neutralDeg", event.target.value)} />
                </label>
                <label>
                  <span>{t("fields.speedRaw")}</span>
                  <input type="number" min={0} max={4095} step={1} value={selectedJoint.speedRaw} onChange={(event) => updateJointNumber(selectedJoint.id, "speedRaw", event.target.value)} />
                </label>
                <label>
                  <span>{t("fields.acceleration")}</span>
                  <input type="number" min={0} max={254} step={1} value={selectedJoint.acc} onChange={(event) => updateJointNumber(selectedJoint.id, "acc", event.target.value)} />
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={config.liveDragEnabled} onChange={(event) => updateArm((current) => ({ ...current, liveDragEnabled: event.target.checked }))} />
                  <span>{t("architecture.armComponent.modes.liveDrag")}</span>
                </label>
              </div>
              <section className="component-arm-shape-panel">
                <div className="panel-heading-row component-arm-shape-heading">
                  <div>
                    <strong>{t("architecture.armComponent.shape.title")}</strong>
                    <span>{t("architecture.armComponent.shape.hint")}</span>
                  </div>
                  <button className="icon-button" onClick={() => addJointShapeSegment(selectedJoint.id)} type="button">
                    <Plus size={16} />
                    <span>{t("architecture.armComponent.shape.addSegment")}</span>
                  </button>
                </div>
                <label className="component-arm-frame-offset">
                  <span>{t("architecture.armComponent.shape.childFrameOffset")}</span>
                  <input
                    type="number"
                    min={-180}
                    max={180}
                    step={1}
                    value={formatArmNumber(selectedJoint.childFrameOffsetDeg ?? 0)}
                    onChange={(event) => updateJointChildFrameOffset(selectedJoint.id, event.target.value)}
                  />
                </label>
                <div className="component-arm-shape-list">
                  {armJointShapeSegments(selectedJoint).map((segment, index) => (
                    <div className="component-arm-shape-row" key={segment.id}>
                      <label>
                        <span>{t("architecture.armComponent.shape.segmentName")}</span>
                        <input value={segment.name} onChange={(event) => updateJointShapeSegment(selectedJoint.id, segment.id, (item) => ({ ...item, name: event.target.value }))} />
                      </label>
                      <label>
                        <span>{t("architecture.armComponent.fields.lengthPx")}</span>
                        <input
                          type="number"
                          min={ARM_MIN_JOINT_LENGTH_PX}
                          max={ARM_MAX_JOINT_LENGTH_PX}
                          step={1}
                          value={segment.lengthPx}
                          onChange={(event) => updateJointShapeSegmentNumber(selectedJoint.id, segment.id, "lengthPx", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>{t("architecture.armComponent.shape.initialDirection")}</span>
                        <input
                          type="number"
                          min={0}
                          max={360}
                          step={1}
                          value={formatArmNumber(segmentCanvasDirectionDeg(segment.directionDeg))}
                          onChange={(event) => updateJointShapeSegmentCanvasDirection(selectedJoint.id, segment.id, event.target.value)}
                        />
                      </label>
                      <div className="component-arm-direction-presets" role="group" aria-label={t("architecture.armComponent.shape.initialDirectionFor", { name: segment.name })}>
                        <button type="button" onClick={() => updateJointShapeSegmentCanvasDirection(selectedJoint.id, segment.id, "0")}>+X</button>
                        <button type="button" onClick={() => updateJointShapeSegmentCanvasDirection(selectedJoint.id, segment.id, "90")}>+Y</button>
                        <button type="button" onClick={() => updateJointShapeSegmentCanvasDirection(selectedJoint.id, segment.id, "180")}>-X</button>
                        <button type="button" onClick={() => updateJointShapeSegmentCanvasDirection(selectedJoint.id, segment.id, "270")}>-Y</button>
                      </div>
                      <button className="icon-only danger" disabled={index === 0 && armJointShapeSegments(selectedJoint).length === 1} onClick={() => removeJointShapeSegment(selectedJoint.id, segment.id)} title={t("architecture.armComponent.shape.deleteSegment")} type="button" aria-label={t("architecture.armComponent.shape.deleteSegmentNamed", { name: segment.name })}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              {selectedServo && selectedServoInstance && selectedLimitDraft ? (
                <section className="plugin-servo-limiter">
                  <div className="plugin-servo-limiter-head">
                    <div>
                      <strong>{t("architecture.armComponent.limits.title")}</strong>
                      <span>{t("architecture.armComponent.limits.hint")}</span>
                    </div>
                    <div className="plugin-servo-limiter-metrics">
                      <Metric label={t("architecture.armComponent.limits.range")} value={`${formatArmNumber((selectedServo.maxDeg ?? 360) - (selectedServo.minDeg ?? 0))} deg`} />
                      <Metric label={t("architecture.armComponent.limits.currentServo")} value={`ID ${selectedServo.id}`} />
                    </div>
                  </div>
                  <div className="command-grid plugin-servo-limit-grid">
                    <label>
                      <span>{t("fields.minAngle")}</span>
                      <input type="number" min={0} max={360} step={1} value={selectedLimitDraft.minDeg} onChange={(event) => updateComponentServoLimitDraft(selectedServoInstance, selectedServo, "minDeg", event.target.value)} />
                    </label>
                    <label>
                      <span>{t("fields.maxAngle")}</span>
                      <input type="number" min={0} max={360} step={1} value={selectedLimitDraft.maxDeg} onChange={(event) => updateComponentServoLimitDraft(selectedServoInstance, selectedServo, "maxDeg", event.target.value)} />
                    </label>
                  </div>
                  {selectedLimitError ? <p className="form-error">{selectedLimitError}</p> : null}
                  <div className="action-grid plugin-servo-limit-actions">
                    <button className="icon-button primary" onClick={() => void saveComponentServoLimits(component, selectedServoInstance, selectedServo)} type="button">
                      <Save size={18} />
                      <span>{t("architecture.actions.saveLimits")}</span>
                    </button>
                  </div>
                </section>
              ) : null}
              </>
            ) : null}

            <div className="action-grid">
              <button className="icon-button" onClick={() => void syncComponentArmPoseFromHardware(component, config)} type="button">
                <Radar size={18} />
                <span>{t("architecture.armComponent.actions.syncActualPose")}</span>
              </button>
              <button className="icon-button primary" onClick={() => void sendComponentArmPose(component, config)} type="button">
                <Send size={18} />
                <span>{t("actions.sendArmPose")}</span>
              </button>
              <button className="icon-button danger" onClick={() => void pauseComponentArm(component, config)} type="button">
                <Square size={18} />
                <span>{t("actions.pause")}</span>
              </button>
              <button className="icon-button" onClick={() => void saveComponentArmConfigNow(component, config)} type="button">
                <Save size={18} />
                <span>{t("architecture.armComponent.actions.savePose")}</span>
              </button>
            </div>
          </div>
        </article>
      </div>
    );
  }

  if (!project || !dataServiceOnline) {
    return (
      <section className="architecture-workspace">
        <div className="panel architecture-empty">
          <Boxes size={22} />
          <strong>{t("architecture.dataServiceRequired")}</strong>
          <p>{t("architecture.dataServiceHint")}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="architecture-workspace" aria-label={t("architecture.aria")}>
      <div className="architecture-shell-head">
        <div>
          <span className="section-kicker">{t("architecture.sqliteProject")} · {project.name}</span>
          <h2>{layerTitle}</h2>
        </div>
        <div className="architecture-status">
          <span className={status === "error" ? "platform-status-pill error" : status === "saving" || status === "loading" ? "platform-status-pill standby" : "platform-status-pill online"}>
            {status === "loading" ? t("architecture.status.loading") : status === "saving" ? t("architecture.status.saving") : status === "error" ? t("architecture.status.error") : t("architecture.status.synced")}
          </span>
          <button className="icon-button" onClick={() => void refreshArchitecture()} type="button">
            <Activity size={17} />
            <span>{t("architecture.actions.refresh")}</span>
          </button>
        </div>
      </div>

      {error && <p className="form-error architecture-error">{error}</p>}

      {layer === "plugins" && (
        <div className={pluginCreateOpen ? "architecture-grid architecture-plugin-grid" : "architecture-grid architecture-plugin-grid architecture-grid-create-collapsed"}>
          <ArchitectureCreatePanel
            className="architecture-plugin-create-panel"
            icon={<Code2 size={18} />}
            meta={uiText("architecture.create.codeLibraryCount", `${shownCodeLibraries.length} 个代码库`, { count: shownCodeLibraries.length })}
            onToggle={() => setPluginCreateOpen((value) => !value)}
            open={pluginCreateOpen}
            steps={[
              { label: uiText("architecture.create.selectType", "选择类型"), tone: selectedCodeLibrary ? "done" : "active" },
              { label: uiText("architecture.create.configure", "配置参数"), tone: activeCatalog ? "active" : "muted" },
              { label: uiText("architecture.create.confirm", "创建确认"), tone: activeCatalog && pluginName.trim() ? "done" : "muted" }
            ]}
            summary={
              <>
                <span className="platform-status-pill standby">{deviceTypeFilter ? platformTypeLabel(deviceTypeFilter) : uiText("architecture.create.allDevices", "全部设备")}</span>
                <span className="architecture-summary-text">{selectedCodeLibrary ? `${selectedCodeLibrary.brand} / ${selectedCodeLibrary.model}` : uiText("architecture.create.noCodeLibrarySelected", "未选择代码库")}</span>
                <span className="architecture-summary-text">{pluginName.trim() || uiText("architecture.create.waitingName", "等待命名")}</span>
              </>
            }
            title={uiText("architecture.create.plugins", "创建插件实例")}
          >
            <PluginAutoDetectPanel
              gamepads={gamepads}
              motorFeedback={motorFeedback}
              nextCommandSeq={nextCommandSeq}
              onFinished={() => refreshArchitecture(project.id)}
              piProfile={piRemoteProfile}
              pluginInstances={pluginInstances}
              projectId={project.id}
              sendAboardBridgeCanServoCommand={sendAboardBridgeCanServoCommand}
              servoFeedback={servoFeedback}
            />
            <div className="architecture-library-filter architecture-driver-filter">
              <label>
                <span>{uiText("architecture.create.device", "设备")}</span>
                <select value={deviceTypeFilter} onChange={(event) => setDeviceTypeFilter(event.target.value as CapabilityId | "")}>
                  <option value="">{uiText("architecture.create.allDevices", "全部设备")}</option>
                  {deviceTypes.map((type) => <option key={type} value={type}>{platformTypeLabel(type)}</option>)}
                </select>
              </label>
              <label>
                <span>{uiText("architecture.create.brand", "品牌")}</span>
                <select value={brandFilter} onChange={(event) => { setBrandFilter(event.target.value); setModelFilter(""); setSelectedCatalogId(""); setCustomCatalogEnabled(false); }}>
                  {catalogBrands.length === 0 ? <option value="">{uiText("architecture.create.noBrands", "没有品牌")}</option> : catalogBrands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                </select>
              </label>
              <label>
                <span>{uiText("architecture.create.model", "型号")}</span>
                <select value={modelFilter} onChange={(event) => { setModelFilter(event.target.value); setSelectedCatalogId(""); setCustomCatalogEnabled(false); }}>
                  {catalogModels.length === 0 ? <option value="">{uiText("architecture.create.noModels", "没有型号")}</option> : catalogModels.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
              <label className="architecture-wide-field">
                <span>{uiText("architecture.create.codeLibrary", "代码库")}</span>
                <input value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} placeholder={uiText("architecture.create.searchPlaceholder", "搜索型号、代码文件、驱动")} />
              </label>
            </div>
            <div className="architecture-driver-list">
              {shownCodeLibraries.map((library) => (
                <button
                  className={selectedCodeLibrary?.catalogItemId === library.catalogItemId ? "device-row architecture-driver-card selected" : "device-row architecture-driver-card"}
                  key={library.id}
                  onClick={() => { setSelectedCatalogId(library.catalogItemId); setCustomCatalogEnabled(false); }}
                  type="button"
                >
                  <span className="device-info">
                    <span className="device-name">{library.brand} · {library.model}</span>
                    <span className="device-meta">{library.sourceFile}</span>
                    <span className="device-meta">{library.driverId} · {library.protocol ?? "no protocol"}</span>
                  </span>
                  <span className="architecture-driver-tags">
                    <span className="platform-status-pill standby">{platformTypeLabel(library.type)}</span>
                    <span className="platform-status-pill online">{library.transportId}</span>
                  </span>
                </button>
              ))}
              {shownCodeLibraries.length === 0 && <div className="empty-state">{uiText("architecture.create.noCodeLibraries", "这个设备和品牌下还没有代码库")}</div>}
            </div>

            {selectedCodeLibrary && selectedCatalog ? (
              <>
                <div className="architecture-driver-summary">
                  <strong>{selectedCodeLibrary.brand} · {selectedCodeLibrary.model}</strong>
                  <small>{selectedCodeLibrary.sourceFile}</small>
                  <span>{selectedCodeLibrary.driverId} · {selectedCodeLibrary.transportId}</span>
                </div>
                <div className="architecture-form-grid">
                  <label className="checkbox-field architecture-wide-field">
                    <input type="checkbox" checked={customCatalogEnabled} onChange={(event) => setCustomCatalogEnabled(event.target.checked)} />
                    <span>{uiText("architecture.create.customCatalog", "数据库没有这个型号，基于当前代码库创建自定义型号")}</span>
                  </label>
                  {customCatalogEnabled && (
                    <>
                      <label>
                        <span>{uiText("architecture.create.customBrand", "自定义品牌")}</span>
                        <input value={customBrand} onChange={(event) => setCustomBrand(event.target.value)} />
                      </label>
                      <label>
                        <span>{uiText("architecture.create.customModel", "自定义型号")}</span>
                        <input value={customModel} onChange={(event) => setCustomModel(event.target.value)} />
                      </label>
                    </>
                  )}
                  <label className="architecture-wide-field">
                    <span>{t("fields.name")}</span>
                    <input value={pluginName} onChange={(event) => setPluginName(event.target.value)} placeholder={uiText("architecture.create.instanceNamePlaceholder", "例如 Base joint / Left track")} />
                  </label>
                </div>
                {renderConfigFields(activeCatalog)}
              </>
            ) : (
              <div className="empty-state">{uiText("architecture.create.selectDeviceBrandCode", "请先选择设备、品牌和代码库")}</div>
            )}
            <button className="icon-button primary architecture-wide-button" disabled={!activeCatalog || status === "saving"} onClick={() => void handleCreatePluginInstance()} type="button">
              <Plus size={17} />
              <span>{uiText("architecture.actions.createPluginInstance", "生成插件实例")}</span>
            </button>
          </ArchitectureCreatePanel>

          <section className="panel architecture-library-panel">
            {selectedPlugin ? (
              <>
                <PanelHeading icon={<Send size={18} />} meta={pluginInstanceDeviceId(selectedPlugin)} title={t("architecture.library.pluginDebug")} />
                <div className="architecture-debug-head">
                  <button className="icon-button" onClick={() => setSelectedPluginId("")} type="button">
                    <ArrowLeft size={16} />
                    <span>{t("architecture.actions.backToPluginLibrary")}</span>
                  </button>
                  <button className="icon-button danger" onClick={() => void handleDeletePlugin(selectedPlugin.id)} type="button">
                    <Trash2 size={16} />
                    <span>{t("common.delete")}</span>
                  </button>
                </div>
                <div className="architecture-driver-summary">
                  <strong>{pluginInstanceDisplayName(selectedPlugin)}</strong>
                  <small>{driverSourceForInstance(selectedPlugin, driverLibrary)}</small>
                  <span>{selectedPlugin.brand} · {selectedPlugin.model}</span>
                </div>
                {renderPluginDebug(selectedPlugin)}
              </>
            ) : (
              <>
                <PanelHeading icon={<Filter size={18} />} meta={t("architecture.library.instanceCount", { shown: shownPluginInstances.length, total: pluginInstances.length })} title={t("architecture.library.pluginLibrary")} />
                <div className="architecture-library-filter">
                  <select value={pluginLibraryFilter} onChange={(event) => setPluginLibraryFilter(event.target.value as CapabilityId | "")}>
                    <option value="">{t("architecture.library.allTypes")}</option>
                    {deviceTypes.map((type) => <option key={type} value={type}>{platformTypeLabel(type)}</option>)}
                  </select>
                </div>
                <div className="architecture-device-list architecture-plugin-library-grid">
                  {shownPluginInstances.map((instance) => {
                    const ownerName = usage.get(instance.id)?.[0]?.ownerName;
                    return (
                      <article className="device-row architecture-plugin-card" key={instance.id}>
                        <button
                          className="architecture-plugin-open"
                          onClick={() => {
                            setSelectedPluginId(instance.id);
                            void onPrepareCommand?.(instance.type);
                          }}
                          type="button"
                        >
                          <span className="device-info">
                            <span className="device-name">{instance.name}</span>
                            <span className="device-meta">{instance.brand} · {instance.model} · {pluginInstanceDeviceId(instance)}</span>
                            <span className="device-meta">{driverSourceForInstance(instance, driverLibrary)}</span>
                          </span>
                        </button>
                        <span className="architecture-plugin-card-footer">
                          <span className="platform-status-pill standby">{ownerName ?? t("architecture.library.available")}</span>
                          {String(instance.config.detectedDeviceId ?? "").trim() && <span className="platform-status-pill online">{t("architecture.library.autoDetected")}</span>}
                          <button
                            aria-label={t("architecture.library.deleteNamed", { name: instance.name })}
                            className="icon-only architecture-plugin-delete"
                            disabled={Boolean(ownerName) || status === "saving"}
                            onClick={() => void handleDeletePlugin(instance.id)}
                            title={ownerName ? t("architecture.library.removeBeforeDelete", { owner: ownerName }) : t("architecture.actions.deletePluginInstance")}
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </span>
                      </article>
                    );
                  })}
                  {shownPluginInstances.length === 0 && <div className="empty-state">{pluginInstances.length === 0 ? t("architecture.library.noPlugins") : t("architecture.library.noMatchingPlugins")}</div>}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {layer === "components" && (
        <div className={componentCreateOpen ? "architecture-grid" : "architecture-grid architecture-grid-create-collapsed"}>
          <ArchitectureCreatePanel
            icon={<Wrench size={18} />}
            meta={uiText("architecture.components.availablePluginCount", `${componentSelectableInstances.length} 个可用插件`, { count: componentSelectableInstances.length })}
            onToggle={() => setComponentCreateOpen((value) => !value)}
            open={componentCreateOpen}
            steps={[
              { label: uiText("architecture.components.steps.type", "组件类型"), tone: "done" },
              { label: uiText("architecture.components.steps.bindPlugins", "绑定插件"), tone: componentPluginIds.size > 0 ? "done" : "active" },
              { label: uiText("architecture.create.confirm", "创建确认"), tone: componentPluginIds.size > 0 ? "active" : "muted" }
            ]}
            summary={
              <>
                <span className="platform-status-pill standby">{componentKindLabel(componentKind)}</span>
                <span className="architecture-summary-text">{componentName.trim() || uiText("architecture.create.waitingName", "等待命名")}</span>
                <span className="architecture-summary-text">{uiText("architecture.components.selectedPluginCount", `${componentPluginIds.size} 个插件已选`, { count: componentPluginIds.size })}</span>
              </>
            }
            title={uiText("architecture.components.createTitle", "创建组件")}
          >
            <label>
              <span>{uiText("architecture.components.type", "组件类型")}</span>
              <select value={componentKind} onChange={(event) => setComponentKind(event.target.value as ComponentKind)}>
                <option value="custom">{componentKindLabel("custom")}</option>
                <option value="robot-arm">{componentKindLabel("robot-arm")}</option>
              </select>
            </label>
            <label>
              <span>{uiText("architecture.components.name", "组件名称")}</span>
              <input value={componentName} onChange={(event) => setComponentName(event.target.value)} />
            </label>
            <SelectableInstanceList
              emptyLabel={uiText("architecture.components.noAvailablePluginInstances", "没有可用插件实例")}
              instances={componentSelectableInstances}
              selectedIds={componentPluginIds}
              typeLabel={platformTypeLabel}
              usage={usage}
              onToggle={(id) => setComponentPluginIds(toggleSet(componentPluginIds, id))}
            />
            <button className="icon-button primary architecture-wide-button" disabled={componentPluginIds.size === 0} onClick={() => void handleCreateComponent()} type="button">
              <Save size={17} />
              <span>{componentKind === "robot-arm" ? uiText("architecture.components.createRobotArm", "生成机械臂") : uiText("architecture.components.createComponent", "生成组件")}</span>
            </button>
          </ArchitectureCreatePanel>
          <section className="panel architecture-library-panel">
            <PanelHeading icon={<Boxes size={18} />} meta={uiText("architecture.components.count", `${components.length} 个组件`, { count: components.length })} title={uiText("architecture.components.panelTitle", "组件面板")} />
            <EntitySelector
              empty={uiText("architecture.components.empty", "还没有组件")}
              items={components}
              selectedId={selectedComponent?.id ?? ""}
              onDelete={handleDeleteComponent}
              onSelect={setSelectedComponentId}
              renderMeta={(component) => `${componentKindLabel(component.kind)} · ${uiText("architecture.components.pluginCount", `${component.pluginInstanceIds.length} 个插件`, { count: component.pluginInstanceIds.length })}`}
            />
            {selectedComponent
              ? selectedComponent.kind === "robot-arm"
                ? renderRobotArmComponentPanel(selectedComponent)
                : renderPanelGrid(`component:${selectedComponent.id}`, effectivePluginInstancesForComponent(selectedComponent, pluginInstances))
              : <div className="empty-state">{uiText("architecture.components.selectComponent", "请选择组件")}</div>}
          </section>
        </div>
      )}

      {layer === "robots" && (
        <div className={robotCreateOpen ? "architecture-grid" : "architecture-grid architecture-grid-create-collapsed"}>
          <ArchitectureCreatePanel
            icon={<Bot size={18} />}
            meta={uiText("architecture.components.count", `${components.length} 个组件`, { count: components.length })}
            onToggle={() => setRobotCreateOpen((value) => !value)}
            open={robotCreateOpen}
            steps={[
              { label: uiText("architecture.robots.steps.name", "命名"), tone: robotName.trim() ? "done" : "active" },
              { label: uiText("architecture.robots.steps.assets", "选择资产"), tone: robotComponentIds.size > 0 || robotPluginIds.size > 0 ? "done" : "active" },
              { label: uiText("architecture.create.confirm", "创建确认"), tone: robotComponentIds.size > 0 || robotPluginIds.size > 0 ? "active" : "muted" }
            ]}
            summary={
              <>
                <span className="platform-status-pill standby">{robotName.trim() || uiText("architecture.create.waitingName", "等待命名")}</span>
                <span className="architecture-summary-text">{uiText("architecture.components.count", `${robotComponentIds.size} 个组件`, { count: robotComponentIds.size })}</span>
                <span className="architecture-summary-text">{uiText("architecture.robots.directPluginCount", `${robotPluginIds.size} 个直属插件`, { count: robotPluginIds.size })}</span>
              </>
            }
            title={uiText("architecture.robots.createTitle", "创建机器人")}
          >
            <label>
              <span>{uiText("architecture.robots.name", "机器人名称")}</span>
              <input value={robotName} onChange={(event) => setRobotName(event.target.value)} />
            </label>
            <div className="architecture-select-block">
              <strong>{uiText("sections.components", "组件")}</strong>
              {components.map((component) => (
                <label className="checkbox-field" key={component.id}>
                  <input type="checkbox" checked={robotComponentIds.has(component.id)} onChange={() => setRobotComponentIds(toggleSet(robotComponentIds, component.id))} />
                  <span>{component.name}</span>
                </label>
              ))}
              {components.length === 0 && <div className="empty-state">{uiText("architecture.robots.createComponentFirst", "先创建组件")}</div>}
            </div>
            <div className="architecture-select-block">
              <strong>{uiText("architecture.robots.directPlugins", "直属插件")}</strong>
              <SelectableInstanceList
                emptyLabel={uiText("architecture.components.noAvailablePluginInstances", "没有可用插件实例")}
                instances={availablePluginInstancesForComponent(pluginInstances, components, robots)}
                selectedIds={robotPluginIds}
                typeLabel={platformTypeLabel}
                usage={usage}
                onToggle={(id) => setRobotPluginIds(toggleSet(robotPluginIds, id))}
              />
            </div>
            <button className="icon-button primary architecture-wide-button" disabled={robotComponentIds.size === 0 && robotPluginIds.size === 0} onClick={() => void handleCreateRobot()} type="button">
              <Save size={17} />
              <span>{uiText("architecture.robots.createRobot", "生成机器人")}</span>
            </button>
          </ArchitectureCreatePanel>
          <section className="panel architecture-library-panel">
            <PanelHeading icon={<Radar size={18} />} meta={uiText("architecture.robots.count", `${robots.length} 个机器人`, { count: robots.length })} title={uiText("architecture.robots.panelTitle", "机器人运行面板")} />
            <EntitySelector
              empty={uiText("architecture.robots.empty", "还没有机器人")}
              items={robots}
              selectedId={selectedRobot?.id ?? ""}
              onDelete={handleDeleteRobot}
              onSelect={setSelectedRobotId}
              renderMeta={(robot) => `${uiText("architecture.components.count", `${robot.componentIds.length} 个组件`, { count: robot.componentIds.length })} / ${uiText("architecture.robots.directPluginCount", `${robot.pluginInstanceIds.length} 个直属插件`, { count: robot.pluginInstanceIds.length })}`}
            />
            {selectedRobot ? (
              <RobotAssemblyWorkspace
                components={components}
                dispatchPlatformCommand={dispatchPlatformCommand}
                driveTargets={driveTargets}
                motorFeedback={motorFeedback}
                onSaveRobot={saveRobotPatch}
                onRunPluginCommand={runPluginCommand}
                pluginInstances={pluginInstances}
                renderPluginDebug={renderPluginDebug}
                robot={selectedRobot}
                robots={robots}
                servoFeedback={servoFeedback}
                usage={usage}
              />
            ) : <div className="empty-state">{uiText("architecture.robots.selectRobot", "请选择机器人")}</div>}
          </section>
        </div>
      )}
    </section>
  );
}
