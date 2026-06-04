import { Activity, ArrowDown, ArrowLeft, ArrowUp, Bot, Boxes, Code2, Filter, GripVertical, Plus, Radar, Save, Send, Square, Trash2, Wrench } from "lucide-react";
import { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  createComponent, createDeviceCatalogItem, createPluginInstance,
  createRobot, deleteComponent, deletePluginInstance,
  deleteRobot, listComponents, listDeviceCatalog,
  listPluginInstances, listRobots, loadPanelLayout,
  savePanelLayout, updateComponent, updatePluginInstance
} from "../lib/dataService";
import { createPlatformCommand, PlatformCommand, PlatformCommandResult } from "../platform/commands";
import {
  BUILTIN_DEVICE_CATALOG_ITEMS, ComponentKind, ComponentDefinition,
  DeviceCatalogItem, DeviceCodeLibraryItem, DeviceConfig,
  DeviceConfigField, DriverLibraryItem, PanelLayoutItem,
  PluginInstance, RobotDefinition, availablePluginInstancesForComponent,
  configWithCatalogDefaults, createDeviceDescriptorFromPluginInstance, defaultPanelLayoutItems,
  deviceCatalogBrands, deviceCodeLibraryItemsFromCatalog, driverLibraryItemsFromPackages,
  effectivePluginInstancesForComponent, effectivePluginInstancesForRobot, filterDeviceCodeLibraryItems,
  mergePanelLayoutItems, panelTargetsForPluginInstances, pluginInstanceDeviceId,
  pluginInstanceDisplayName, pluginInstancesToServoProfiles, pluginUsageMap,
  reorderPanelLayoutItems } from "../platform/architecture";
import { BUILTIN_PLUGIN_PACKAGES } from "../platform/builtinPlugins";
import { CapabilityId, DeviceDescriptor, UiControlSchema, UiPanelSchema } from "../platform/types";
import { platformCommandForControl, platformControlDefaultsForDevice } from "../platform/ui";
import { DataProject } from "../lib/dataService";
import {
  ARM_MAX_JOINT_LENGTH_PX, ARM_MIN_JOINT_LENGTH_PX, ArmConfig,
  ArmJointConfig, ArmSegmentPose, calculateArmDragAngle,
  calculateArmSegmentPoses, DEFAULT_ARM_JOINT_LENGTH_PX, DEFAULT_LINKAGE_MEMBER_ACC,
  DEFAULT_LINKAGE_MEMBER_SPEED_RAW, normalizeArmConfig } from "../lib/storage";
import { clamp, normalizeServoProfile, rawToAngleDeg, ServoProfile, servoLogicalSpan, servoPhysicalToLogicalAngleWithReverse } from "../lib/protocol";
export type ArchitectureLayer = "plugins" | "components" | "robots";
type SaveState = "idle" | "loading" | "saving" | "error";
type DraftValues = Record<string, string | number | boolean | null>;
type MetricTone = "neutral" | "online" | "warning" | "danger";
interface ThreeLayerWorkspaceProps {
  layer: ArchitectureLayer; project: DataProject | null; dataServiceOnline: boolean;
  uiPanels: UiPanelSchema[]; dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>; onPluginInstancesChange?: (instances: PluginInstance[]) => void;
  onPrepareCommand?: (capability: CapabilityId) => Promise<void> | void; renderPluginDebugPanel?: (instance: PluginInstance, context: { refreshArchitecture: () => Promise<void>; replacePluginInstance: (instance: PluginInstance) => void }) => ReactNode; }
const deviceTypes: CapabilityId[] = ["servo", "motor", "camera", "gamepad", "sensor"];
const fallbackTypeLabels: Record<CapabilityId, string> = {
  servo: "舵机", motor: "电机", camera: "摄像头",
  "robot-arm": "机械臂", "raspberry-pi": "树莓派", firmware: "固件",
  gamepad: "Gamepad", gpio: "GPIO", sensor: "传感器"
};
function servoFeedbackPhysicalAngle(response: unknown): number | null {
  if (!response || typeof response !== "object") { return null; }
  const feedback = response as { positionDeg?: unknown; positionRaw?: unknown };
  if (typeof feedback.positionDeg === "number" && Number.isFinite(feedback.positionDeg)) { return feedback.positionDeg; }
  if (typeof feedback.positionRaw === "number" && Number.isFinite(feedback.positionRaw)) { return rawToAngleDeg(feedback.positionRaw);
  } return null; }
export function ThreeLayerWorkspace({
  layer, project, dataServiceOnline,
  uiPanels, dispatchPlatformCommand, onPluginInstancesChange,
  onPrepareCommand, renderPluginDebugPanel }: ThreeLayerWorkspaceProps) {
  const [catalog, setCatalog] = useState<DeviceCatalogItem[]>([]);
  const [pluginInstances, setPluginInstances] = useState<PluginInstance[]>([]);
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [robots, setRobots] = useState<RobotDefinition[]>([]);
  const [panelLayouts, setPanelLayouts] = useState<Record<string, PanelLayoutItem[]>>({});
  const [status, setStatus] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [deviceTypeFilter, setDeviceTypeFilter] = useState<CapabilityId | "">("servo");
  const [brandFilter, setBrandFilter] = useState("");
  const [queryFilter, setQueryFilter] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [customCatalogEnabled, setCustomCatalogEnabled] = useState(false);
  const [customBrand, setCustomBrand] = useState("Custom");
  const [customModel, setCustomModel] = useState("Custom Device");
  const [pluginName, setPluginName] = useState("");
  const [configDraft, setConfigDraft] = useState<DraftValues>({});
  const [selectedPluginId, setSelectedPluginId] = useState("");
  const [pluginLibraryFilter, setPluginLibraryFilter] = useState<CapabilityId | "">("");
  const [componentName, setComponentName] = useState("New Component");
  const [componentKind, setComponentKind] = useState<ComponentKind>("custom");
  const [componentPluginIds, setComponentPluginIds] = useState<Set<string>>(() => new Set());
  const [selectedComponentId, setSelectedComponentId] = useState("");
  const [armDraftByComponentId, setArmDraftByComponentId] = useState<Record<string, ArmConfig>>({});
  const [componentServoLimitDraftByInstanceId, setComponentServoLimitDraftByInstanceId] = useState<Record<string, { minDeg: string; maxDeg: string }>>({});
  const [componentServoLimitErrorByInstanceId, setComponentServoLimitErrorByInstanceId] = useState<Record<string, string>>({});
  const [draggingArmJointId, setDraggingArmJointId] = useState<string | null>(null);
  const [robotName, setRobotName] = useState("New Robot");
  const [robotComponentIds, setRobotComponentIds] = useState<Set<string>>(() => new Set());
  const [robotPluginIds, setRobotPluginIds] = useState<Set<string>>(() => new Set());
  const [selectedRobotId, setSelectedRobotId] = useState("");
  const [controlDraftByDeviceId, setControlDraftByDeviceId] = useState<Record<string, Record<string, unknown>>>({});
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const armSaveTimerRef = useRef<Record<string, number>>({});
  const armLiveTimerRef = useRef<Record<string, number>>({});
  const armLiveSendingRef = useRef<Record<string, boolean>>({});
  const pendingArmLiveMoveRef = useRef<Record<string, { component: ComponentDefinition; config: ArmConfig }>>({});
  const layerTitle = layer === "plugins" ? "插件" : layer === "components" ? "组件" : "机器人"; const driverLibrary = useMemo(() => driverLibraryItemsFromPackages(BUILTIN_PLUGIN_PACKAGES), []);
  const codeLibraries = useMemo(() => deviceCodeLibraryItemsFromCatalog(catalog, driverLibrary), [catalog, driverLibrary]);
  const catalogBrands = useMemo(() => deviceCatalogBrands(catalog, deviceTypeFilter), [catalog, deviceTypeFilter]);
  const shownCodeLibraries = useMemo( () => filterDeviceCodeLibraryItems(codeLibraries, { type: deviceTypeFilter, brand: brandFilter, query: queryFilter }), [brandFilter, codeLibraries, deviceTypeFilter, queryFilter] );
  const selectedCodeLibrary = shownCodeLibraries.find((item) => item.catalogItemId === selectedCatalogId) ?? shownCodeLibraries[0] ?? null; const selectedCatalog = useMemo( () => catalog.find((item) => item.id === selectedCodeLibrary?.catalogItemId) ?? null, [catalog, selectedCodeLibrary?.catalogItemId] );
  const activeCatalog = customCatalogEnabled && selectedCodeLibrary ? customCatalogDraft(selectedCodeLibrary, customBrand, customModel, selectedCatalog) : selectedCatalog; const usage = useMemo(() => pluginUsageMap(components, robots), [components, robots]);
  const availableForComponents = useMemo( () => availablePluginInstancesForComponent(pluginInstances, components, robots, selectedComponentId || undefined), [components, pluginInstances, robots, selectedComponentId] );
  const availableServoPluginsForComponents = useMemo( () => availableForComponents.filter((instance) => instance.type === "servo"), [availableForComponents] );
  const componentSelectableInstances = componentKind === "robot-arm" ? availableServoPluginsForComponents : availableForComponents; const selectedComponent = components.find((component) => component.id === selectedComponentId) ?? components[0]; const selectedRobot = robots.find((robot) => robot.id === selectedRobotId) ?? robots[0];
  const selectedPlugin = pluginInstances.find((instance) => instance.id === selectedPluginId) ?? null; const shownPluginInstances = useMemo( () => pluginInstances.filter((instance) => !pluginLibraryFilter || instance.type === pluginLibraryFilter), [pluginInstances, pluginLibraryFilter] );
  useEffect(() => { if (selectedPlugin) { void onPrepareCommand?.(selectedPlugin.type);
    } }, [selectedPlugin?.id, selectedPlugin?.type]);
  useEffect(() => { if (!project || !dataServiceOnline) { return;
    } void refreshArchitecture(project.id);
  }, [dataServiceOnline, project?.id]);
  useEffect(() => { return () => { for (const timer of Object.values(armSaveTimerRef.current)) {
        window.clearTimeout(timer);
      } for (const timer of Object.values(armLiveTimerRef.current)) { window.clearTimeout(timer);
      } armSaveTimerRef.current = {};
      armLiveTimerRef.current = {};
      armLiveSendingRef.current = {};
      pendingArmLiveMoveRef.current = {};
    };
  }, []);
  useEffect(() => { if (selectedComponent?.kind === "robot-arm") { void onPrepareCommand?.("robot-arm");
    } }, [selectedComponent?.id, selectedComponent?.kind]);
  useEffect(() => { setBrandFilter("");
    setQueryFilter("");
    setSelectedCatalogId("");
    setCustomCatalogEnabled(false);
  }, [deviceTypeFilter]);
  useEffect(() => { if (!brandFilter && catalogBrands[0]) { setBrandFilter(catalogBrands[0]);
      return; } if (brandFilter && catalogBrands.length > 0 && !catalogBrands.includes(brandFilter)) {
      setBrandFilter(catalogBrands[0]);
    } }, [brandFilter, catalogBrands]);
  useEffect(() => { if (selectedCodeLibrary && selectedCodeLibrary.catalogItemId !== selectedCatalogId) { setSelectedCatalogId(selectedCodeLibrary.catalogItemId);
    } }, [selectedCodeLibrary?.catalogItemId, selectedCatalogId]);
  useEffect(() => { if (componentKind !== "robot-arm") { return;
    } const servoIds = new Set(availableServoPluginsForComponents.map((instance) => instance.id));
    setComponentPluginIds((current) => new Set(Array.from(current).filter((id) => servoIds.has(id))));
  }, [availableServoPluginsForComponents, componentKind]);
  useEffect(() => { if (selectedCodeLibrary && !customCatalogEnabled) { setCustomBrand(selectedCodeLibrary.brand);
    } }, [customCatalogEnabled, selectedCodeLibrary?.brand]);
  useEffect(() => { if (!activeCatalog) { setConfigDraft({});
      return; } setConfigDraft(configWithCatalogDefaults(activeCatalog, configDraft));
    if (!pluginName.trim()) { setPluginName(nextPluginName(activeCatalog, pluginInstances));
    } }, [activeCatalog?.id, customCatalogEnabled]);
  useEffect(() => { if (selectedComponent && !selectedComponentId) { setSelectedComponentId(selectedComponent.id);
    } }, [selectedComponent, selectedComponentId]);
  useEffect(() => { if (selectedRobot && !selectedRobotId) { setSelectedRobotId(selectedRobot.id);
    } }, [selectedRobot, selectedRobotId]);
  async function refreshArchitecture(projectId = project?.id) { if (!projectId) { return;
    } setStatus("loading");
    try { const [nextCatalog, nextPlugins, nextComponents, nextRobots] = await Promise.all([ listDeviceCatalog(), listPluginInstances(projectId), listComponents(projectId), listRobots(projectId) ]);
      setCatalog(nextCatalog);
      setPluginInstances(nextPlugins);
      setComponents(nextComponents);
      setRobots(nextRobots);
      onPluginInstancesChange?.(nextPlugins);
      setSelectedPluginId((current) => (nextPlugins.some((plugin) => plugin.id === current) ? current : ""));
      setSelectedComponentId((current) => current || nextComponents[0]?.id || "");
      setSelectedRobotId((current) => current || nextRobots[0]?.id || "");
      const scopes = [ ...nextComponents.map((component) => `component:${component.id}`), ...nextRobots.map((robot) => `robot:${robot.id}`) ]; const layouts = await Promise.all(scopes.map((scopeId) => loadPanelLayout(projectId, scopeId).catch(() => ({ scopeId, layout: [], updatedAt: null }))));
      setPanelLayouts(Object.fromEntries(layouts.map((layout) => [layout.scopeId, layout.layout])));
      setError("");
      setStatus("idle");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "数据服务不可用");
      setStatus("error");
    } } function replacePluginInstance(updated: PluginInstance) {
    const nextPlugins = pluginInstances.some((plugin) => plugin.id === updated.id) ? pluginInstances.map((plugin) => (plugin.id === updated.id ? updated : plugin)) : [...pluginInstances, updated]; setPluginInstances(nextPlugins);
    onPluginInstancesChange?.(nextPlugins);
  } function replaceComponent(updated: ComponentDefinition) { setComponents((current) => ( current.some((component) => component.id === updated.id) ? current.map((component) => (component.id === updated.id ? updated : component)) : [updated, ...current] ));
  } function componentServoProfiles(component: ComponentDefinition): ServoProfile[] { return pluginInstancesToServoProfiles(effectivePluginInstancesForComponent(component, pluginInstances));
  } function componentPluginInstances(component: ComponentDefinition): PluginInstance[] { return effectivePluginInstancesForComponent(component, pluginInstances);
  } function componentServoLimitDraft(instance: PluginInstance, servo: ServoProfile) { return componentServoLimitDraftByInstanceId[instance.id] ?? {
      minDeg: formatArmNumber(servo.minDeg ?? 0), maxDeg: formatArmNumber(servo.maxDeg ?? 360) };
  } function updateComponentServoLimitDraft(instance: PluginInstance, servo: ServoProfile, field: "minDeg" | "maxDeg", value: string) { setComponentServoLimitErrorByInstanceId((current) => {
      const next = { ...current };
      delete next[instance.id]; return next; });
    setComponentServoLimitDraftByInstanceId((current) => ({ ...current, [instance.id]: {
        ...componentServoLimitDraft(instance, servo), [field]: value }
    }));
  } async function saveComponentServoLimits(component: ComponentDefinition, instance: PluginInstance, servo: ServoProfile) { if (!project) {
      return; } const draft = componentServoLimitDraft(instance, servo);
    const minDeg = clamp(Number(draft.minDeg), 0, 360);
    const maxDeg = clamp(Number(draft.maxDeg), 0, 360);
    if (!Number.isFinite(minDeg) || !Number.isFinite(maxDeg) || minDeg >= maxDeg) { setComponentServoLimitErrorByInstanceId((current) => ({ ...current,
        [instance.id]: "限位范围必须在 0-360 度，并且最小值小于最大值" }));
      return; } setStatus("saving");
    try { const updated = await updatePluginInstance(project.id, instance.id, { config: {
          ...instance.config, minDeg, maxDeg,
          resetDeg: clamp(Number.isFinite(Number(instance.config.resetDeg)) ? Number(instance.config.resetDeg) : (minDeg + maxDeg) / 2, minDeg, maxDeg) } });
      replacePluginInstance(updated);
      const updatedServo = pluginInstancesToServoProfiles([updated])[0]; if (updatedServo) { const nextServos = componentServoProfiles(component).map((item) => (item.id === updatedServo.id ? updatedServo : item));
        const nextConfig = normalizeArmConfig(currentArmConfigForComponent(component), nextServos);
        setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
        scheduleComponentArmConfigSave(component, nextConfig);
      } setComponentServoLimitDraftByInstanceId((current) => ({ ...current,
        [instance.id]: { minDeg: formatArmNumber(minDeg), maxDeg: formatArmNumber(maxDeg)
        } }));
      setComponentServoLimitErrorByInstanceId((current) => { const next = { ...current };
        delete next[instance.id]; return next; });
      setError("");
      setStatus("idle");
    } catch (nextError) { setComponentServoLimitErrorByInstanceId((current) => ({ ...current,
        [instance.id]: nextError instanceof Error ? nextError.message : "限位保存失败" }));
      setStatus("error");
    } } function createArmConfigFromServos(servos: ServoProfile[]): ArmConfig {
    const joints = servos.map((servo, index) => { const normalized = normalizeServoProfile(servo);
      const neutralDeg = clamp(90, 0, servoLogicalSpan(normalized));
      return { id: `arm-joint-${index + 1}`, name: `Joint ${index + 1}`,
        servoId: normalized.id, lengthPx: DEFAULT_ARM_JOINT_LENGTH_PX, angleDeg: neutralDeg,
        neutralDeg, speedRaw: DEFAULT_LINKAGE_MEMBER_SPEED_RAW, acc: DEFAULT_LINKAGE_MEMBER_ACC,
        reverse: false, enabled: true };
    });
    return { joints, liveDragEnabled: false, selectedJointId: joints[0]?.id ?? null };
  } function armConfigForComponent(component: ComponentDefinition): ArmConfig { const servos = componentServoProfiles(component);
    const saved = component.config?.armConfig; const normalized = saved ? normalizeArmConfig(saved, servos) : createArmConfigFromServos(servos);
    return normalized.joints.length === 0 && servos.length > 0 ? createArmConfigFromServos(servos) : normalized; } function currentArmConfigForComponent(component: ComponentDefinition): ArmConfig {
    return armDraftByComponentId[component.id] ?? armConfigForComponent(component);
  } async function persistComponentArmConfig(component: ComponentDefinition, config: ArmConfig) { if (!project) {
      return; } const updated = await updateComponent(project.id, component.id, {
      config: { ...component.config, armConfig: config
      } });
    replaceComponent(updated);
  } function scheduleComponentArmConfigSave(component: ComponentDefinition, config: ArmConfig) { const current = armSaveTimerRef.current[component.id];
    if (current !== undefined) { window.clearTimeout(current);
    } armSaveTimerRef.current[component.id] = window.setTimeout(() => { delete armSaveTimerRef.current[component.id];
      void persistComponentArmConfig(component, config).catch((nextError) => { setError(nextError instanceof Error ? nextError.message : "机械臂姿态保存失败");
        setStatus("error");
      });
    }, 500);
  } function updateComponentArmConfig(component: ComponentDefinition, updater: (current: ArmConfig) => ArmConfig, options: { live?: boolean } = {}) { const servos = componentServoProfiles(component);
    const next = normalizeArmConfig(updater(currentArmConfigForComponent(component)), servos);
    setArmDraftByComponentId((current) => ({ ...current, [component.id]: next }));
    scheduleComponentArmConfigSave(component, next);
    if (options.live && next.liveDragEnabled) { scheduleComponentArmLiveMove(component, next);
    } } function scheduleComponentArmLiveMove(component: ComponentDefinition, config: ArmConfig) {
    if (!config.liveDragEnabled) { return; }
    pendingArmLiveMoveRef.current[component.id] = { component, config };
    if (armLiveTimerRef.current[component.id] !== undefined || armLiveSendingRef.current[component.id]) { return; }
    armLiveTimerRef.current[component.id] = window.setTimeout(() => { delete armLiveTimerRef.current[component.id]; void flushComponentArmLiveMove(component.id);
    }, 60);
  } async function flushComponentArmLiveMove(componentId: string) { if (armLiveSendingRef.current[componentId]) {
      return; } const pending = pendingArmLiveMoveRef.current[componentId];
    delete pendingArmLiveMoveRef.current[componentId]; if (!pending?.config.liveDragEnabled) { return;
    } armLiveSendingRef.current[componentId] = true; try {
      await sendComponentArmPose(pending.component, pending.config, true);
    } finally { delete armLiveSendingRef.current[componentId]; if (pendingArmLiveMoveRef.current[componentId] && armLiveTimerRef.current[componentId] === undefined) {
        armLiveTimerRef.current[componentId] = window.setTimeout(() => { delete armLiveTimerRef.current[componentId]; void flushComponentArmLiveMove(componentId);
        }, 60);
      } } }
  async function saveComponentArmConfigNow(component: ComponentDefinition, config = currentArmConfigForComponent(component)) { const current = armSaveTimerRef.current[component.id]; if (current !== undefined) {
      window.clearTimeout(current);
      delete armSaveTimerRef.current[component.id]; } setStatus("saving");
    try { await persistComponentArmConfig(component, config);
      setStatus("idle");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "机械臂姿态保存失败");
      setStatus("error");
    } } async function sendComponentArmPose(component: ComponentDefinition, config = currentArmConfigForComponent(component), live = false) {
    await onPrepareCommand?.("robot-arm");
    const result = await dispatchPlatformCommand(createPlatformCommand("robot-arm.set_pose", `robot-arm:${component.id}`, { joints: config.joints, live, servos: componentServoProfiles(component) }));
    if (result.status === "failed" || result.status === "timeout") { setError(result.message ?? "机械臂姿态发送失败");
      setStatus("error");
    } } async function pauseComponentArm(component: ComponentDefinition, config = currentArmConfigForComponent(component)) {
    await onPrepareCommand?.("robot-arm");
    const result = await dispatchPlatformCommand(createPlatformCommand("robot-arm.pause", `robot-arm:${component.id}`, { joints: config.joints, servos: componentServoProfiles(component) }));
    if (result.status === "failed" || result.status === "timeout") { setError(result.message ?? "机械臂暂停失败");
      setStatus("error");
    } } async function syncComponentArmPoseFromHardware(component: ComponentDefinition, config = currentArmConfigForComponent(component)) {
    const servos = componentServoProfiles(component);
    const servoById = new Map(servos.map((servo) => [servo.id, normalizeServoProfile(servo)]));
    const nextAngles = new Map<string, number>();
    setStatus("loading");
    try { await onPrepareCommand?.("robot-arm");
      for (const joint of config.joints) { if (!joint.enabled) { continue;
        } const servo = servoById.get(joint.servoId);
        if (!servo) { continue; }
        const result = await dispatchPlatformCommand(createPlatformCommand("servo.read_feedback", `servo:${joint.servoId}`));
        if (result.status === "failed" || result.status === "timeout") { continue; }
        const physicalAngle = servoFeedbackPhysicalAngle(result.response);
        if (physicalAngle === null) { continue; }
        nextAngles.set(joint.id, servoPhysicalToLogicalAngleWithReverse(servo, physicalAngle, joint.reverse));
      } if (nextAngles.size === 0) { setError("没有读到舵机当前位置，请确认串口已连接到 Feetech 总线");
        setStatus("error");
        return; } const nextConfig = normalizeArmConfig( { ...config, joints: config.joints.map((joint) => ( nextAngles.has(joint.id) ? { ...joint, angleDeg: nextAngles.get(joint.id)! } : joint )) }, servos );
      setArmDraftByComponentId((current) => ({ ...current, [component.id]: nextConfig }));
      scheduleComponentArmConfigSave(component, nextConfig);
      setError("");
      setStatus("idle");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "实际姿态同步失败");
      setStatus("error");
    } } async function handleCreatePluginInstance() {
    if (!project || !activeCatalog) { return; }
    setStatus("saving");
    try { const catalogItem = customCatalogEnabled ? await createDeviceCatalogItem({ ...activeCatalog, defaultConfig: normalizeConfigDraft(activeCatalog.configSchema, configDraft), userDefined: true }) : activeCatalog; await createPluginInstance(project.id, {
        name: pluginName.trim() || nextPluginName(catalogItem, pluginInstances), catalogItemId: catalogItem.id, config: normalizeConfigDraft(catalogItem.configSchema, configDraft)
      });
      setSelectedPluginId("");
      setPluginName("");
      setCustomCatalogEnabled(false);
      await refreshArchitecture(project.id);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "插件实例创建失败");
      setStatus("error");
    } } async function handleDeletePlugin(instanceId: string) {
    if (!project) { return; }
    setStatus("saving");
    try { await deletePluginInstance(project.id, instanceId);
      setSelectedPluginId("");
      await refreshArchitecture(project.id);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "插件实例删除失败");
      setStatus("error");
    } } async function handleCreateComponent() {
    if (!project) { return; }
    setStatus("saving");
    try { const intendedKind = componentKind; const selectedIds = Array.from(componentPluginIds);
      const selectedInstances = selectedIds.map((id) => pluginInstances.find((instance) => instance.id === id)).filter((instance): instance is PluginInstance => Boolean(instance));
      const armConfig = intendedKind === "robot-arm" ? createArmConfigFromServos(pluginInstancesToServoProfiles(selectedInstances)) : undefined; const componentPayload: Partial<ComponentDefinition> = { name: componentName.trim() || "New Component",
        kind: intendedKind, pluginInstanceIds: selectedIds, config: armConfig ? { armConfig } : {}
      };
      let component = await createComponent(project.id, componentPayload);
      if (intendedKind === "robot-arm" && component.kind !== "robot-arm") { component = await updateComponent(project.id, component.id, componentPayload);
      } if (intendedKind === "robot-arm" && component.kind !== "robot-arm") { throw new Error("data-service 仍按旧版本保存组件，请重启 data-service 后再生成机械臂");
      } replaceComponent(component);
      setSelectedComponentId(component.id);
      setComponentName("New Component");
      setComponentKind("custom");
      setComponentPluginIds(new Set());
      await refreshArchitecture(project.id);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "组件创建失败");
      setStatus("error");
    } } async function handleDeleteComponent(componentId: string) {
    if (!project) { return; }
    setStatus("saving");
    try { await deleteComponent(project.id, componentId);
      await refreshArchitecture(project.id);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "组件删除失败");
      setStatus("error");
    } } async function handleCreateRobot() {
    if (!project) { return; }
    setStatus("saving");
    try { const robot = await createRobot(project.id, { name: robotName.trim() || "New Robot",
        componentIds: Array.from(robotComponentIds), pluginInstanceIds: Array.from(robotPluginIds) });
      setSelectedRobotId(robot.id);
      setRobotName("New Robot");
      setRobotComponentIds(new Set());
      setRobotPluginIds(new Set());
      await refreshArchitecture(project.id);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "机器人创建失败");
      setStatus("error");
    } } async function handleDeleteRobot(robotId: string) {
    if (!project) { return; }
    setStatus("saving");
    try { await deleteRobot(project.id, robotId);
      await refreshArchitecture(project.id);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "机器人删除失败");
      setStatus("error");
    } } async function persistPanelLayout(scopeId: string, layout: PanelLayoutItem[]) {
    if (!project) { setPanelLayouts((current) => ({ ...current, [scopeId]: layout }));
      return; } setPanelLayouts((current) => ({ ...current, [scopeId]: layout }));
    try { const saved = await savePanelLayout(project.id, scopeId, layout);
      setPanelLayouts((current) => ({ ...current, [scopeId]: saved.layout }));
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "面板布局保存失败");
    } } function renderConfigFields(item: DeviceCatalogItem | null) {
    if (!item) { return <div className="empty-state">请选择或新建一个设备型号</div>; }
    return ( <div className="architecture-form-grid"> {item.configSchema.map((field) => ( <label key={field.id}> <span>{field.label}</span> {renderConfigInput(field)} </label> ))} </div> );
  } function renderConfigInput(field: DeviceConfigField) { const value = configDraft[field.id] ?? "";
    if (field.kind === "toggle") { return <input type="checkbox" checked={value === true} onChange={(event) => setConfigDraftValue(field.id, event.target.checked)} />; }
    if (field.kind === "select") { return ( <select value={String(value)} onChange={(event) => setConfigDraftValue(field.id, event.target.value)}> {(field.options ?? []).map((option) => ( <option key={String(option.value)} value={String(option.value)}> {option.label} </option> ))} </select> );
    } return ( <input type={field.kind === "number" ? "number" : "text"} min={field.min} max={field.max} step={field.step} value={String(value)} onChange={(event) => setConfigDraftValue(field.id, event.target.value)} /> );
  } function setConfigDraftValue(key: string, value: string | number | boolean) { setConfigDraft((current) => ({ ...current, [key]: value }));
  } function renderControl(device: DeviceDescriptor, control: UiControlSchema): ReactNode { if (control.kind === "button") {
      return null; } if (control.kind === "group") {
      return ( <div className="architecture-control-group" key={control.id}> <span>{control.label}</span> <div className="architecture-panel-controls">{(control.controls ?? []).map((child) => renderControl(device, child))}</div> </div> );
    } if (control.kind === "metric") { return ( <div className="architecture-metric" key={control.id}> <span>{control.label}</span> <strong>{String(controlDraftValue(device, control) ?? "--") || "--"}</strong> </div> );
    } if (control.kind === "toggle") { return ( <label className="checkbox-field" key={control.id}> <input type="checkbox" checked={Boolean(controlDraftValue(device, control))} onChange={(event) => updateControlDraft(device.id, control.id, event.target.checked)} /> <span>{control.label}</span> </label> );
    } if (control.kind === "select") { return ( <label key={control.id}> <span>{control.label}</span> <select value={String(controlDraftValue(device, control) ?? "")} onChange={(event) => updateControlDraft(device.id, control.id, event.target.value)}> {(control.options ?? []).map((option) => ( <option key={String(option.value)} value={String(option.value)}> {option.label} </option> ))} </select> </label> );
    } if (control.kind === "cameraView") { const url = String(controlDraftValue(device, control) ?? "");
      return ( <div className="architecture-camera-view" key={control.id}> {url ? <img alt={control.label} src={url} /> : <div className="empty-state">未配置视频流</div>} </div> );
    } if (control.kind === "textarea" || control.kind === "output") { return ( <label className="architecture-wide-field" key={control.id}> <span>{control.label}</span> <textarea value={String(controlDraftValue(device, control) ?? "")} onChange={(event) => updateControlDraft(device.id, control.id, event.target.value)} /> </label> );
    } return ( <label key={control.id}> <span>{control.label}</span> <input type={control.kind === "slider" ? "range" : "number"} min={control.min} max={control.max} step={control.step} value={String(controlDraftValue(device, control) ?? "")} onChange={(event) => updateControlDraft(device.id, control.id, event.target.value)} /> </label> );
  } function controlDraftValue(device: DeviceDescriptor, control: UiControlSchema): unknown { const draft = controlDraftByDeviceId[device.id] ?? platformControlDefaultsForDevice(device);
    return control.id in draft ? draft[control.id] : ""; } function updateControlDraft(deviceId: string, key: string, value: unknown) {
    const device = pluginInstances.map((instance) => createDeviceDescriptorFromPluginInstance(instance)).find((item) => item.id === deviceId);
    const defaults = platformControlDefaultsForDevice(device);
    setControlDraftByDeviceId((current) => ({ ...current, [deviceId]: {
        ...defaults, ...current[deviceId], [key]: value
      } }));
  } async function runControlAction(device: DeviceDescriptor, actionId: string | undefined) { const command = platformCommandForControl(device, actionId, controlDraftByDeviceId[device.id] ?? platformControlDefaultsForDevice(device));
    if (typeof command === "string") { setError(command);
      return; } try {
      await onPrepareCommand?.(device.type);
      const result = await dispatchPlatformCommand(command);
      setError(result.message ?? "");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "命令发送失败");
    } } function renderPanelForInstance(instance: PluginInstance, layout?: PanelLayoutItem) {
    const device = createDeviceDescriptorFromPluginInstance(instance);
    const panel = uiPanels.find((candidate) => candidate.capability === device.type || device.capabilities.some((capability) => capability.id === candidate.capability));
    const actions = platformActionControls(panel?.controls ?? []);
    const style = layout ? ({ gridColumn: `${layout.x + 1} / span ${layout.w}`, gridRow: `span ${layout.h}` } as CSSProperties) : undefined; return ( <article className="architecture-panel-card" draggable={Boolean(layout)} key={layout?.id ?? instance.id} onDragStart={() => layout && setDraggingPanelId(layout.id)} onDragOver={(event) => layout && event.preventDefault()} onDrop={() => { if (!layout || !draggingPanelId || draggingPanelId === layout.id) { return; } const scopeId = layout.scopeId; void persistPanelLayout(scopeId, reorderPanelLayoutItems(panelLayouts[scopeId] ?? [], draggingPanelId, layout.id)); setDraggingPanelId(null); }} style={style} > <header className="architecture-panel-card-head"> {layout && <GripVertical size={17} />} <span> <strong>{layout?.title ?? instance.name}</strong> <small>{fallbackTypeLabels[instance.type]} · {pluginInstanceDeviceId(instance)}</small> </span> </header> {!panel ? ( <div className="empty-state">该能力还没有专用面板</div> ) : ( <> <div className="architecture-panel-controls">{panel.controls.map((control) => renderControl(device, control))}</div> <div className="architecture-actions"> {actions.map((control) => ( <button className="icon-button" key={`${device.id}:${control.id}`} onClick={() => void runControlAction(device, control.actionId)} type="button"> <Send size={16} /> <span>{control.label}</span> </button> ))} </div> </> )} </article> );
  } function renderPanelGrid(scopeId: string, instances: PluginInstance[]) { const targets = panelTargetsForPluginInstances(instances, uiPanels);
    const layout = mergePanelLayoutItems(scopeId, panelLayouts[scopeId] ?? defaultPanelLayoutItems(scopeId, targets), targets);
    const instanceByTarget = new Map(instances.map((instance) => [pluginInstanceDeviceId(instance), instance]));
    return ( <div className="architecture-layout-grid"> {layout.map((item) => { const instance = instanceByTarget.get(item.targetId); return instance ? renderPanelForInstance(instance, item) : null; })} </div> );
  } function renderRobotArmComponentPanel(component: ComponentDefinition) { const componentInstances = componentPluginInstances(component);
    const servoProfiles = componentServoProfiles(component);
    const config = currentArmConfigForComponent(component);
    const poses = calculateArmSegmentPoses(config.joints, { x: 300, y: 250 });
    const selectedJoint = config.joints.find((joint) => joint.id === config.selectedJointId) ?? config.joints[0] ?? null; const selectedServo = selectedJoint ? servoProfiles.find((servo) => servo.id === selectedJoint.servoId) : null; const selectedServoInstance = selectedJoint ? componentInstances.find((instance) => instance.type === "servo" && Number(instance.config.servoId) === selectedJoint.servoId) ?? null : null;
    const usedServoIds = new Set(config.joints.filter((joint) => joint.id !== selectedJoint?.id).map((joint) => joint.servoId));
    const selectedSpan = selectedServo ? servoLogicalSpan(selectedServo) : 360; const selectedJointIndex = selectedJoint ? config.joints.findIndex((joint) => joint.id === selectedJoint.id) : -1; const selectedLimitDraft = selectedServo && selectedServoInstance ? componentServoLimitDraft(selectedServoInstance, selectedServo) : null;
    const selectedLimitError = selectedServoInstance ? componentServoLimitErrorByInstanceId[selectedServoInstance.id] : ""; function updateArm(updater: (current: ArmConfig) => ArmConfig, live = false) { updateComponentArmConfig(component, updater, { live });
    } function updateJoint(jointId: string, updater: (joint: ArmJointConfig) => ArmJointConfig, live = false) { updateArm(
        (current) => ({ ...current, joints: current.joints.map((joint) => (joint.id === jointId ? updater(joint) : joint))
        }), live );
    } function updateJointNumber(jointId: string, field: "lengthPx" | "angleDeg" | "neutralDeg" | "speedRaw" | "acc", value: string, live = false) { const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) { return; }
      updateJoint( jointId, (joint) => {
          const servo = servoProfiles.find((item) => item.id === joint.servoId);
          const span = servo ? servoLogicalSpan(servo) : 360; if (field === "lengthPx") { return { ...joint, lengthPx: clamp(Math.round(numericValue), ARM_MIN_JOINT_LENGTH_PX, ARM_MAX_JOINT_LENGTH_PX) };
          } if (field === "speedRaw") { return { ...joint, speedRaw: clamp(Math.round(numericValue), 0, 4095) };
          } if (field === "acc") { return { ...joint, acc: clamp(Math.round(numericValue), 0, 254) };
          } return { ...joint, [field]: clamp(numericValue, 0, span) };
        }, live );
    } function setJointIndex(jointId: string, nextIndex: number) { updateArm((current) => {
        const currentIndex = current.joints.findIndex((joint) => joint.id === jointId);
        if (currentIndex < 0) { return current; }
        const clampedIndex = clamp(Math.round(nextIndex), 0, current.joints.length - 1);
        if (clampedIndex === currentIndex) { return { ...current, selectedJointId: jointId };
        } const joints = [...current.joints]; const [joint] = joints.splice(currentIndex, 1);
        joints.splice(clampedIndex, 0, joint);
        return { ...current, joints, selectedJointId: jointId };
      });
    } function moveJoint(jointId: string, direction: -1 | 1) { const currentIndex = config.joints.findIndex((joint) => joint.id === jointId);
      if (currentIndex >= 0) { setJointIndex(jointId, currentIndex + direction);
      } } function svgPoint(svg: SVGSVGElement, event: ReactPointerEvent<Element>) {
      const point = svg.createSVGPoint();
      point.x = event.clientX; point.y = event.clientY; const matrix = svg.getScreenCTM();
      return matrix ? point.matrixTransform(matrix.inverse()) : { x: point.x, y: point.y };
    } function dragJoint(joint: ArmJointConfig, pointer: { x: number; y: number }) { const jointIndex = config.joints.findIndex((item) => item.id === joint.id);
      const servo = servoProfiles.find((item) => item.id === joint.servoId);
      if (jointIndex < 0 || !servo) { return; }
      const previousPose = jointIndex > 0 ? poses[jointIndex - 1] : undefined; const currentPose = poses[jointIndex]; const nextAngle = calculateArmDragAngle({
        anchor: previousPose ? { x: previousPose.endX, y: previousPose.endY } : { x: currentPose?.startX ?? 300, y: currentPose?.startY ?? 250 }, pointer, parentGlobalDeg: previousPose?.globalDeg ?? 0,
        neutralDeg: joint.neutralDeg, servoSpanDeg: servoLogicalSpan(servo), currentAngleDeg: joint.angleDeg
      });
      updateJointNumber(joint.id, "angleDeg", String(nextAngle), true);
    } if (servoProfiles.length === 0 || config.joints.length === 0) { return <div className="empty-state">机械臂组件需要至少一个舵机插件</div>;
    } return ( <div className="architecture-layout-grid"> <article className="architecture-panel-card architecture-arm-panel" style={{ gridColumn: "1 / -1" }}> <header className="architecture-panel-card-head"> <Bot size={18} /> <span> <strong>{component.name}</strong> <small>机械臂 · {config.joints.length} 个关节</small> </span> </header> <div className="arm-editor-stack"> <div className="arm-simulator"> <svg className="arm-svg" viewBox="0 0 600 420" role="img" aria-label={`${component.name} 机械臂姿态`} onPointerMove={(event) => { const joint = config.joints.find((item) => item.id === draggingArmJointId); if (joint) { dragJoint(joint, svgPoint(event.currentTarget, event)); } }} onPointerUp={() => setDraggingArmJointId(null)} onPointerCancel={() => setDraggingArmJointId(null)} onPointerLeave={(event) => { if (event.buttons === 0) { setDraggingArmJointId(null); } }} > <defs> <pattern id={`arm-grid-${component.id}`} width="32" height="32" patternUnits="userSpaceOnUse"> <path d="M 32 0 L 0 0 0 32" fill="none" /> </pattern> </defs> <rect className="arm-grid-bg" x="0" y="0" width="600" height="420" fill={`url(#arm-grid-${component.id})`} /> <line className="arm-axis" x1="40" y1="250" x2="560" y2="250" /> <line className="arm-axis" x1="300" y1="56" x2="300" y2="364" /> <circle className="arm-base" cx="300" cy="250" r="10" /> {poses.map((pose) => { const joint = config.joints.find((item) => item.id === pose.jointId); const selected = pose.jointId === selectedJoint?.id; if (!joint) { return null; } return ( <g className={selected ? "arm-segment selected" : "arm-segment"} key={pose.jointId}> <line x1={pose.startX} y1={pose.startY} x2={pose.endX} y2={pose.endY} /> <circle className="arm-handle" cx={pose.startX} cy={pose.startY} r={selected ? 12 : 10} tabIndex={0} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingArmJointId(joint.id); updateArm((current) => ({ ...current, selectedJointId: joint.id })); }} /> <text className="arm-label" x={pose.startX + 12} y={pose.startY - 12}> ID {pose.servoId} · {formatArmNumber(pose.angleDeg)}° · {pose.lengthPx}px </text> </g> );
                })} {poses.length > 0 ? ( <circle className="arm-end-effector" cx={poses[poses.length - 1].endX} cy={poses[poses.length - 1].endY} r="7" />
                ) : null} </svg> <div className="arm-status-strip">
                <Metric label="关节" value={config.joints.filter((joint) => joint.enabled).length} /> <Metric label="模式" value={config.liveDragEnabled ? "实时拖动" : "预览"} tone={config.liveDragEnabled ? "warning" : "neutral"} /> <Metric label="已选关节" value={selectedJoint?.name ?? "--"} />
              </div> </div> <div className="device-list arm-joint-list">
              {config.joints.map((joint, index) => ( <div className={selectedJoint?.id === joint.id ? "device-row arm-joint-row selected" : "device-row arm-joint-row"} key={joint.id}> <button className="device-select" onClick={() => updateArm((current) => ({ ...current, selectedJointId: joint.id }))} type="button">
                    <span className="device-id">ID {joint.servoId}</span> <span className="device-info"> <span className="device-name">{joint.name}</span>
                      <span className="device-meta">Joint {index + 1} · {formatArmNumber(joint.angleDeg)} deg · {joint.lengthPx}px</span> </span> <span className={joint.enabled ? "device-signal" : "device-signal muted"}>{joint.enabled ? "启用" : "停用"}</span>
                  </button> <div className="arm-joint-actions"> <button className="icon-only" disabled={index === 0} onClick={() => moveJoint(joint.id, -1)} title="上移" type="button" aria-label={`上移 ${joint.name}`}>
                      <ArrowUp size={16} /> </button> <button className="icon-only" disabled={index === config.joints.length - 1} onClick={() => moveJoint(joint.id, 1)} title="下移" type="button" aria-label={`下移 ${joint.name}`}>
                      <ArrowDown size={16} /> </button> </div>
                </div> ))} </div>
            {selectedJoint ? ( <> <div className="command-grid arm-editor-grid">
                <label> <span>名称</span> <input value={selectedJoint.name} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, name: event.target.value }))} />
                </label> <label> <span>关节序号</span>
                  <select value={selectedJointIndex} onChange={(event) => setJointIndex(selectedJoint.id, Number(event.target.value))}> {config.joints.map((joint, index) => ( <option key={joint.id} value={index}>
                        第 {index + 1} 关节 </option> ))}
                  </select> </label> <label>
                  <span>目标舵机</span> <select value={selectedJoint.servoId} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, servoId: Number(event.target.value) }))}> {servoProfiles.map((servo) => (
                      <option key={servo.id} value={servo.id} disabled={usedServoIds.has(servo.id)}> ID {servo.id} · {servo.name} </option>
                    ))} </select> </label>
                <label className="checkbox-field"> <input type="checkbox" checked={selectedJoint.enabled} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, enabled: event.target.checked }))} /> <span>启用</span>
                </label> <label className="checkbox-field"> <input type="checkbox" checked={selectedJoint.reverse} onChange={(event) => updateJoint(selectedJoint.id, (joint) => ({ ...joint, reverse: event.target.checked }))} />
                  <span>反向</span> </label> <label>
                  <span>杆长 px</span> <input type="number" min={ARM_MIN_JOINT_LENGTH_PX} max={ARM_MAX_JOINT_LENGTH_PX} step={1} value={selectedJoint.lengthPx} onChange={(event) => updateJointNumber(selectedJoint.id, "lengthPx", event.target.value)} /> </label>
                <label> <span>角度</span> <input type="number" min={0} max={selectedSpan} step={1} value={formatArmNumber(selectedJoint.angleDeg)} onChange={(event) => updateJointNumber(selectedJoint.id, "angleDeg", event.target.value, true)} />
                </label> <label> <span>中位</span>
                  <input type="number" min={0} max={selectedSpan} step={1} value={formatArmNumber(selectedJoint.neutralDeg)} onChange={(event) => updateJointNumber(selectedJoint.id, "neutralDeg", event.target.value)} /> </label> <label>
                  <span>速度 raw</span> <input type="number" min={0} max={4095} step={1} value={selectedJoint.speedRaw} onChange={(event) => updateJointNumber(selectedJoint.id, "speedRaw", event.target.value)} /> </label>
                <label> <span>加速度</span> <input type="number" min={0} max={254} step={1} value={selectedJoint.acc} onChange={(event) => updateJointNumber(selectedJoint.id, "acc", event.target.value)} />
                </label> <label className="checkbox-field"> <input type="checkbox" checked={config.liveDragEnabled} onChange={(event) => updateArm((current) => ({ ...current, liveDragEnabled: event.target.checked }))} />
                  <span>实时拖动</span> </label> </div>
              {selectedServo && selectedServoInstance && selectedLimitDraft ? ( <section className="plugin-servo-limiter"> <div className="plugin-servo-limiter-head">
                    <div> <strong>舵机限位</strong> <span>组件里的关节会按这个范围夹紧，保存后同步到插件实例</span>
                    </div> <div className="plugin-servo-limiter-metrics"> <Metric label="运行范围" value={`${formatArmNumber((selectedServo.maxDeg ?? 360) - (selectedServo.minDeg ?? 0))} deg`} />
                      <Metric label="当前舵机" value={`ID ${selectedServo.id}`} /> </div> </div>
                  <div className="command-grid plugin-servo-limit-grid"> <label> <span>最小角度</span>
                      <input type="number" min={0} max={360} step={1} value={selectedLimitDraft.minDeg} onChange={(event) => updateComponentServoLimitDraft(selectedServoInstance, selectedServo, "minDeg", event.target.value)} /> </label> <label>
                      <span>最大角度</span> <input type="number" min={0} max={360} step={1} value={selectedLimitDraft.maxDeg} onChange={(event) => updateComponentServoLimitDraft(selectedServoInstance, selectedServo, "maxDeg", event.target.value)} /> </label>
                  </div> {selectedLimitError ? <p className="form-error">{selectedLimitError}</p> : null} <div className="action-grid plugin-servo-limit-actions">
                    <button className="icon-button primary" onClick={() => void saveComponentServoLimits(component, selectedServoInstance, selectedServo)} type="button"> <Save size={18} /> <span>保存限位</span>
                    </button> </div> </section>
              ) : null} </> ) : null}
            <div className="action-grid"> <button className="icon-button" onClick={() => void syncComponentArmPoseFromHardware(component, config)} type="button"> <Radar size={18} />
                <span>同步实际姿态</span> </button> <button className="icon-button primary" onClick={() => void sendComponentArmPose(component, config)} type="button">
                <Send size={18} /> <span>发送姿态</span> </button>
              <button className="icon-button danger" onClick={() => void pauseComponentArm(component, config)} type="button"> <Square size={18} /> <span>暂停</span>
              </button> <button className="icon-button" onClick={() => void saveComponentArmConfigNow(component, config)} type="button"> <Save size={18} />
                <span>保存姿态</span> </button> </div>
          </div> </article> </div>
    );
  } if (!project || !dataServiceOnline) { return ( <section className="architecture-workspace"> <div className="panel architecture-empty"> <Boxes size={22} /> <strong>三层架构需要 SQLite 数据服务</strong> <p>请先启动 data-service，然后在项目里创建插件实例、组件和机器人。</p> </div> </section> );
  } return ( <section className="architecture-workspace" aria-label="three layer architecture"> <div className="architecture-shell-head"> <div> <span className="section-kicker">SQLite 项目 · {project.name}</span> <h2>{layerTitle}</h2> </div> <div className="architecture-status"> <span className={status === "error" ? "platform-status-pill error" : status === "saving" || status === "loading" ? "platform-status-pill standby" : "platform-status-pill online"}> {status === "loading" ? "加载中" : status === "saving" ? "保存中" : status === "error" ? "错误" : "已同步"} </span> <button className="icon-button" onClick={() => void refreshArchitecture()} type="button"> <Activity size={17} /> <span>刷新</span> </button> </div> </div> {error && <p className="form-error architecture-error">{error}</p>} {layer === "plugins" && ( <div className="architecture-grid architecture-plugin-grid"> <section className="panel architecture-builder-panel architecture-plugin-create-panel"> <PanelHeading icon={<Code2 size={18} />} meta={`${shownCodeLibraries.length} 个代码库`} title="创建插件实例" /> <div className="architecture-library-filter architecture-driver-filter"> <label> <span>设备</span> <select value={deviceTypeFilter} onChange={(event) => setDeviceTypeFilter(event.target.value as CapabilityId | "")}> <option value="">全部设备</option> {deviceTypes.map((type) => <option key={type} value={type}>{fallbackTypeLabels[type]}</option>)} </select> </label> <label> <span>品牌</span> <select value={brandFilter} onChange={(event) => { setBrandFilter(event.target.value); setSelectedCatalogId(""); setCustomCatalogEnabled(false); }}> {catalogBrands.length === 0 ? <option value="">没有品牌</option> : catalogBrands.map((brand) => <option key={brand} value={brand}>{brand}</option>)} </select> </label> <label className="architecture-wide-field"> <span>代码库</span> <input value={queryFilter} onChange={(event) => setQueryFilter(event.target.value)} placeholder="搜索型号、代码文件、驱动" /> </label> </div> <div className="architecture-driver-list"> {shownCodeLibraries.map((library) => ( <button className={selectedCodeLibrary?.catalogItemId === library.catalogItemId ? "device-row architecture-driver-card selected" : "device-row architecture-driver-card"} key={library.id} onClick={() => { setSelectedCatalogId(library.catalogItemId); setCustomCatalogEnabled(false); }} type="button" > <span className="device-info"> <span className="device-name">{library.brand} · {library.model}</span> <span className="device-meta">{library.sourceFile}</span> <span className="device-meta">{library.driverId} · {library.protocol ?? "no protocol"}</span> </span> <span className="architecture-driver-tags"> <span className="platform-status-pill standby">{fallbackTypeLabels[library.type]}</span> <span className="platform-status-pill online">{library.transportId}</span> </span> </button> ))} {shownCodeLibraries.length === 0 && <div className="empty-state">这个设备和品牌下还没有代码库</div>} </div> {selectedCodeLibrary && selectedCatalog ? ( <> <div className="architecture-driver-summary"> <strong>{selectedCodeLibrary.brand} · {selectedCodeLibrary.model}</strong> <small>{selectedCodeLibrary.sourceFile}</small> <span>{selectedCodeLibrary.driverId} · {selectedCodeLibrary.transportId}</span> </div> <div className="architecture-form-grid"> <label className="checkbox-field architecture-wide-field"> <input type="checkbox" checked={customCatalogEnabled} onChange={(event) => setCustomCatalogEnabled(event.target.checked)} /> <span>数据库没有这个型号，基于当前代码库创建自定义型号</span> </label> {customCatalogEnabled && ( <> <label> <span>自定义品牌</span> <input value={customBrand} onChange={(event) => setCustomBrand(event.target.value)} /> </label> <label> <span>自定义型号</span> <input value={customModel} onChange={(event) => setCustomModel(event.target.value)} /> </label> </> )} <label className="architecture-wide-field"> <span>名称</span> <input value={pluginName} onChange={(event) => setPluginName(event.target.value)} placeholder="例如 Base joint / Left track" /> </label> </div> {renderConfigFields(activeCatalog)} </> ) : ( <div className="empty-state">请先选择设备、品牌和代码库</div> )} <button className="icon-button primary architecture-wide-button" disabled={!activeCatalog || status === "saving"} onClick={() => void handleCreatePluginInstance()} type="button"> <Plus size={17} /> <span>生成插件实例</span> </button> </section> <section className="panel architecture-library-panel"> {selectedPlugin ? ( <> <PanelHeading icon={<Send size={18} />} meta={pluginInstanceDeviceId(selectedPlugin)} title="插件调试" /> <div className="architecture-debug-head"> <button className="icon-button" onClick={() => setSelectedPluginId("")} type="button"> <ArrowLeft size={16} /> <span>返回插件库</span> </button> <button className="icon-button danger" onClick={() => void handleDeletePlugin(selectedPlugin.id)} type="button"> <Trash2 size={16} /> <span>删除</span> </button> </div> <div className="architecture-driver-summary"> <strong>{pluginInstanceDisplayName(selectedPlugin)}</strong> <small>{driverSourceForInstance(selectedPlugin, driverLibrary)}</small> <span>{selectedPlugin.brand} · {selectedPlugin.model}</span> </div> {renderPluginDebugPanel?.(selectedPlugin, { refreshArchitecture, replacePluginInstance }) ?? renderPanelForInstance(selectedPlugin)} </> ) : ( <> <PanelHeading icon={<Filter size={18} />} meta={`${shownPluginInstances.length} / ${pluginInstances.length} 个实例`} title="插件库" /> <div className="architecture-library-filter"> <select value={pluginLibraryFilter} onChange={(event) => setPluginLibraryFilter(event.target.value as CapabilityId | "")}> <option value="">全部类型</option> {deviceTypes.map((type) => <option key={type} value={type}>{fallbackTypeLabels[type]}</option>)} </select> </div> <div className="architecture-device-list architecture-plugin-library-grid"> {shownPluginInstances.map((instance) => { const ownerName = usage.get(instance.id)?.[0]?.ownerName; return ( <article className="device-row architecture-plugin-card" key={instance.id}> <button className="architecture-plugin-open" onClick={() => { setSelectedPluginId(instance.id); void onPrepareCommand?.(instance.type); }} type="button" > <span className="device-info"> <span className="device-name">{instance.name}</span> <span className="device-meta">{instance.brand} · {instance.model} · {pluginInstanceDeviceId(instance)}</span> <span className="device-meta">{driverSourceForInstance(instance, driverLibrary)}</span> </span> </button> <span className="architecture-plugin-card-footer"> <span className="platform-status-pill standby">{ownerName ?? "可用"}</span> <button aria-label={`删除 ${instance.name}`} className="icon-only architecture-plugin-delete" disabled={Boolean(ownerName) || status === "saving"} onClick={() => void handleDeletePlugin(instance.id)} title={ownerName ? `请先从 ${ownerName} 移除后再删除` : "删除插件实例"} type="button" > <Trash2 size={16} /> </button> </span> </article> );
                  })} {shownPluginInstances.length === 0 && <div className="empty-state">{pluginInstances.length === 0 ? "还没有插件实例" : "没有匹配的插件实例"}</div>} </div>
              </> )} </section>
        </div> )} {layer === "components" && (
        <div className="architecture-grid"> <section className="panel architecture-builder-panel"> <PanelHeading icon={<Wrench size={18} />} meta={`${componentSelectableInstances.length} 个可用插件`} title="创建组件" />
            <label> <span>组件类型</span> <select value={componentKind} onChange={(event) => setComponentKind(event.target.value as ComponentKind)}>
                <option value="custom">普通组件</option> <option value="robot-arm">机械臂</option> </select>
            </label> <label> <span>组件名称</span>
              <input value={componentName} onChange={(event) => setComponentName(event.target.value)} /> </label> <SelectableInstanceList
              instances={componentSelectableInstances} selectedIds={componentPluginIds} usage={usage}
              onToggle={(id) => setComponentPluginIds(toggleSet(componentPluginIds, id))} /> <button className="icon-button primary architecture-wide-button" disabled={componentPluginIds.size === 0} onClick={() => void handleCreateComponent()} type="button">
              <Save size={17} /> <span>{componentKind === "robot-arm" ? "生成机械臂" : "生成组件"}</span> </button>
          </section> <section className="panel architecture-library-panel"> <PanelHeading icon={<Boxes size={18} />} meta={`${components.length} 个组件`} title="组件面板" />
            <EntitySelector empty="还没有组件" items={components}
              selectedId={selectedComponent?.id ?? ""} onDelete={handleDeleteComponent} onSelect={setSelectedComponentId}
              renderMeta={(component) => `${component.kind === "robot-arm" ? "机械臂" : "普通组件"} · ${component.pluginInstanceIds.length} 个插件`} /> {selectedComponent
              ? selectedComponent.kind === "robot-arm" ? renderRobotArmComponentPanel(selectedComponent) : renderPanelGrid(`component:${selectedComponent.id}`, effectivePluginInstancesForComponent(selectedComponent, pluginInstances))
              : <div className="empty-state">请选择组件</div>} </section> </div>
      )} {layer === "robots" && ( <div className="architecture-grid">
          <section className="panel architecture-builder-panel"> <PanelHeading icon={<Bot size={18} />} meta={`${components.length} 个组件`} title="创建机器人" /> <label>
              <span>机器人名称</span> <input value={robotName} onChange={(event) => setRobotName(event.target.value)} /> </label>
            <div className="architecture-select-block"> <strong>组件</strong> {components.map((component) => (
                <label className="checkbox-field" key={component.id}> <input type="checkbox" checked={robotComponentIds.has(component.id)} onChange={() => setRobotComponentIds(toggleSet(robotComponentIds, component.id))} /> <span>{component.name}</span>
                </label> ))} {components.length === 0 && <div className="empty-state">先创建组件</div>}
            </div> <div className="architecture-select-block"> <strong>直属插件</strong>
              <SelectableInstanceList instances={availablePluginInstancesForComponent(pluginInstances, components, robots)} selectedIds={robotPluginIds}
                usage={usage} onToggle={(id) => setRobotPluginIds(toggleSet(robotPluginIds, id))} />
            </div> <button className="icon-button primary architecture-wide-button" disabled={robotComponentIds.size === 0 && robotPluginIds.size === 0} onClick={() => void handleCreateRobot()} type="button"> <Save size={17} />
              <span>生成机器人</span> </button> </section>
          <section className="panel architecture-library-panel"> <PanelHeading icon={<Radar size={18} />} meta={`${robots.length} 个机器人`} title="机器人运行面板" /> <EntitySelector
              empty="还没有机器人" items={robots} selectedId={selectedRobot?.id ?? ""}
              onDelete={handleDeleteRobot} onSelect={setSelectedRobotId} renderMeta={(robot) => `${robot.componentIds.length} 个组件 / ${robot.pluginInstanceIds.length} 个直属插件`}
            /> {selectedRobot ? renderPanelGrid(`robot:${selectedRobot.id}`, effectivePluginInstancesForRobot(selectedRobot, components, pluginInstances)) : <div className="empty-state">请选择机器人</div>} </section>
        </div> )} </section>
  );
}
function PanelHeading({ icon, meta, title }: { icon: ReactNode; meta: string; title: string }) {
  return ( <div className="panel-title architecture-panel-title"> <div className="panel-title-main"> {icon} <h3>{title}</h3> </div> <span className="panel-meta">{meta}</span> </div> );
}
function EntitySelector<T extends { id: string; name: string }>({
  empty, items, onDelete,
  onSelect, renderMeta, selectedId
}: { empty: string; items: T[];
  selectedId: string; onSelect: (id: string) => void; onDelete: (id: string) => void | Promise<void>;
  renderMeta: (item: T) => string; }) { if (items.length === 0) {
    return <div className="empty-state">{empty}</div>; } return ( <div className="architecture-entity-list"> {items.map((item) => ( <div className={selectedId === item.id ? "device-row selected" : "device-row"} key={item.id}> <button className="device-select" onClick={() => onSelect(item.id)} type="button"> <span className="device-info"> <span className="device-name">{item.name}</span> <span className="device-meta">{renderMeta(item)}</span> </span> </button> <button className="delete-hit" onClick={() => void onDelete(item.id)} type="button"> <Trash2 size={16} /> </button> </div> ))} </div> );
}
function SelectableInstanceList({
  instances, onToggle, selectedIds,
  usage }: { instances: PluginInstance[];
  selectedIds: Set<string>; usage: Map<string, Array<{ ownerName: string }>>; onToggle: (id: string) => void;
}) { if (instances.length === 0) { return <div className="empty-state">没有可用插件实例</div>;
  } return ( <div className="architecture-selectable-list"> {instances.map((instance) => ( <label className="checkbox-field architecture-selectable-row" key={instance.id}> <input type="checkbox" checked={selectedIds.has(instance.id)} disabled={Boolean(usage.get(instance.id)?.length)} onChange={() => onToggle(instance.id)} /> <span> <strong>{instance.name}</strong> <small>{fallbackTypeLabels[instance.type]} · {pluginInstanceDeviceId(instance)}</small> </span> </label> ))} </div> );
}
function customCatalogDraft(library: DeviceCodeLibraryItem, brand: string, model: string, template: DeviceCatalogItem | null): DeviceCatalogItem {
  const fallback = template ?? BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === library.catalogItemId) ?? BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.driverId === library.driverId) ?? BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.type === library.type) ?? BUILTIN_DEVICE_CATALOG_ITEMS[0]; return { ...fallback,
    id: `custom.${library.type}.${brand}.${model}`, type: library.type, brand: brand.trim() || library.brand || "Custom",
    model: model.trim() || "Custom Device", displayName: `${brand.trim() || library.brand || "Custom"} ${model.trim() || "Custom Device"}`, driverId: library.driverId,
    transportId: fallback.transportId || library.transportId, capabilities: fallback.capabilities.length > 0 ? fallback.capabilities : [{ id: library.type, features: [] }], tags: Array.from(new Set([...fallback.tags, library.driverId, library.sourceFile])),
    userDefined: true };
}
function driverSourceForInstance(instance: PluginInstance, drivers: DriverLibraryItem[]): string {
  return drivers.find((driver) => driver.driverId === instance.driverId)?.sourceFile ?? instance.driverId; }
function normalizeConfigDraft(schema: DeviceConfigField[], draft: DraftValues): DeviceConfig {
  const config: DeviceConfig = {};
  for (const field of schema) { const value = draft[field.id]; if (field.kind === "number") {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null; config[field.id] = Number.isFinite(number) ? number : null; } else if (field.kind === "toggle") {
      config[field.id] = value === true; } else if (field.kind === "select") { config[field.id] = field.options?.find((option) => String(option.value) === String(value))?.value ?? field.options?.[0]?.value ?? null;
    } else { config[field.id] = value === null || value === undefined ? "" : String(value);
    } } return config;
}
function nextPluginName(catalogItem: DeviceCatalogItem, instances: PluginInstance[]) {
  const base = catalogItem.type === "servo" ? `ID${catalogItem.defaultConfig.servoId ?? instances.length + 1}` : catalogItem.model; let name = String(base);
  for (let index = 2; instances.some((item) => item.name === name); index += 1) { name = `${base} ${index}`; }
  return name; }
function platformActionControls(controls: UiControlSchema[]): UiControlSchema[] {
  return controls.flatMap((control) => { const children = control.kind === "group" ? platformActionControls(control.controls ?? []) : []; return control.actionId ? [control, ...children] : children;
  });
}
function formatArmNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
function Metric({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: MetricTone }) {
  return ( <div className={`architecture-metric ${tone}`}> <span>{label}</span> <strong>{value}</strong> </div> );
}
function toggleSet(values: Set<string>, id: string): Set<string> {
  const next = new Set(values);
  if (next.has(id)) { next.delete(id);
  } else { next.add(id);
  } return next; }
