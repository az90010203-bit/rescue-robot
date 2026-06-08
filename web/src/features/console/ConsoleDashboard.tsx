import { Bot, GripVertical, LayoutGrid, Play, Plus, Radar, RotateCcw, RotateCw, SlidersHorizontal, Square, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GridLayout, moveElement, useContainerWidth, verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout";
import type { DataProject } from "../../lib/dataService";
import { listComponents, listRobots, loadPanelLayout, savePanelLayout } from "../../lib/dataService";
import type { DriveInputState } from "../../lib/drive";
import type { ImuAttitude, ImuCalibration, ImuCalibrationStatus, ImuFeedback } from "../../lib/imuAttitude";
import {
  type ArmConfig,
  type ArmSegmentPose,
  type CameraConfig,
  type CameraVideoSource,
  calculateArmSegmentPoses,
  normalizeArmConfig
} from "../../lib/storage";
import type { LogEntry } from "../../app/appModel";
import type { PiRemoteRuntime } from "../../app/usePiRemote";
import { ArmSvgPreview } from "../arm/ArmSvgPreview";
import type { CameraSourceRuntimeStatus } from "../drive/cameraSources";
import {
  ConsoleArmPanel,
  ConsoleAttitudePanel,
  ConsoleCameraFeedPanel,
  ConsoleEventLogPanel,
  ConsoleJoystickPanel,
  ConsoleTelemetryPanel
} from "./ConsolePanelCards";
import {
  CONSOLE_DASHBOARD_PANEL_DEFINITIONS,
  CONSOLE_DASHBOARD_PANEL_IDS,
  CONSOLE_DASHBOARD_SCOPE,
  type ConsoleDashboardPanelId,
  type ConsoleDashboardTarget,
  addConsoleDashboardPanel,
  cameraSourceIdFromDashboardTarget,
  consoleDashboardScopeForRobot,
  createConsoleDashboardTargets,
  defaultConsoleDashboardLayout,
  defaultConsoleDashboardVisibleItemIds,
  consoleDashboardCardSize,
  consoleDashboardHiddenVisibleItemCount,
  consoleDashboardRenderedVisibleItemIds,
  consoleDashboardSelectedVisibleItemIds,
  consoleDashboardVisibleItemDefinitions,
  mergeConsoleDashboardLayout,
  panelLayoutToGridItem,
  removeConsoleDashboardPanel,
  targetKey,
  updateConsoleDashboardLayoutFromGrid,
  updateConsoleDashboardVisibleItems
} from "./dashboardLayout";
import type { ComponentDefinition, PanelLayoutItem, PluginInstance, RobotDefinition } from "../../platform/architecture";
import { pluginInstancesToServoProfiles } from "../../platform/architecture";

interface ConsoleDashboardProps {
  aBoardBridgeBusy: boolean;
  aBoardBridgeConnected: boolean;
  aBoardImuAttitude: ImuAttitude | null;
  aBoardImuCalibration: ImuCalibration;
  aBoardImuCalibrationStatus: ImuCalibrationStatus;
  aBoardImuError: string | null;
  aBoardImuFeedback: ImuFeedback | null;
  checkAboardSerialBridge: () => Promise<unknown>;
  activeDriveBase: "tracked" | "mecanum";
  activeGamepad: { index: number } | null;
  activeSectionLabel: string;
  architecturePluginInstances: PluginInstance[];
  armConfig: ArmConfig;
  armSegmentPoses: ArmSegmentPose[];
  cameraConfig: CameraConfig;
  cameraPreviewCommand: string;
  cameraSourceRuntimeById: Record<string, CameraSourceRuntimeStatus>;
  cameraStreamReloadToken: number;
  cameraVideoSources: CameraVideoSource[];
  completeMotorMappingCount: number;
  connected: boolean;
  currentProject: DataProject | null;
  dataServiceOnline: boolean;
  driveCanCommand: boolean;
  driveInput: DriveInputState;
  drivePreviewCommand: string;
  handleVirtualStickDown: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  handleVirtualStickMove: (event: ReactPointerEvent<HTMLDivElement>, kind: "camera" | "drive") => void;
  logs: LogEntry[];
  motorCount: number;
  piRemote: PiRemoteRuntime;
  resetVirtualStick: (kind: "camera" | "drive") => void;
  selectDriveBase: (base: "tracked" | "mecanum") => void;
  servoCount: number;
  servoFeedback: Record<string, any>;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  startAboardImuCalibration: () => void;
  stopAllMotors: () => void;
  t: TFunction;
}

type LayoutStatus = "error" | "loading" | "offline" | "saved" | "saving";
type LayoutPointerMode = "drag" | "resize";

const DASHBOARD_GRID_COLS = 12;
const DASHBOARD_GRID_ROW_HEIGHT = 82;
const DASHBOARD_GRID_MARGIN = [14, 14] as const;
const DASHBOARD_GRID_PADDING = [0, 0] as const;

export function ConsoleDashboard({
  aBoardBridgeBusy,
  aBoardBridgeConnected,
  aBoardImuAttitude,
  aBoardImuCalibration,
  aBoardImuCalibrationStatus,
  aBoardImuError,
  aBoardImuFeedback,
  checkAboardSerialBridge,
  activeDriveBase,
  activeGamepad,
  activeSectionLabel,
  architecturePluginInstances,
  armConfig,
  armSegmentPoses,
  cameraConfig,
  cameraPreviewCommand,
  cameraSourceRuntimeById,
  cameraStreamReloadToken,
  cameraVideoSources,
  completeMotorMappingCount,
  connected,
  currentProject,
  dataServiceOnline,
  driveCanCommand,
  driveInput,
  drivePreviewCommand,
  handleVirtualStickDown,
  handleVirtualStickMove,
  logs,
  motorCount,
  piRemote,
  resetVirtualStick,
  selectDriveBase,
  servoCount,
  servoFeedback,
  setCameraSourceRuntime,
  startAboardImuCalibration,
  stopAllMotors,
  t
}: ConsoleDashboardProps) {
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [robots, setRobots] = useState<RobotDefinition[]>([]);
  const [selectedConsoleRobotId, setSelectedConsoleRobotId] = useState("");
  const [layoutItems, setLayoutItems] = useState<PanelLayoutItem[]>([]);
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>(dataServiceOnline ? "loading" : "offline");
  const [editMode, setEditMode] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [draftPanelId, setDraftPanelId] = useState<ConsoleDashboardPanelId>(CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed);
  const [draftTargetId, setDraftTargetId] = useState("");
  const [metricConfigPanelId, setMetricConfigPanelId] = useState<string | null>(null);
  const { width: dashboardWidth, containerRef: dashboardContainerRef, mounted: dashboardMounted } = useContainerWidth({ initialWidth: 1200 });
  const latestGridLayoutRef = useRef<Layout>([]);
  const layoutItemsRef = useRef<PanelLayoutItem[]>([]);
  const dashboardTargetsRef = useRef<ConsoleDashboardTarget[]>([]);
  const layoutSaveRequestRef = useRef(0);
  const activePointerCleanupRef = useRef<(() => void) | null>(null);

  const selectedConsoleRobot = useMemo(
    () => robots.find((robot) => robot.id === selectedConsoleRobotId) ?? robots[0] ?? null,
    [robots, selectedConsoleRobotId]
  );
  const activeConsoleScope = selectedConsoleRobot ? consoleDashboardScopeForRobot(selectedConsoleRobot.id) : CONSOLE_DASHBOARD_SCOPE;
  const robotComponentIds = useMemo(() => new Set(selectedConsoleRobot?.componentIds ?? []), [selectedConsoleRobot?.componentIds]);
  const componentArmTargets = useMemo(
    () =>
      components
        .filter((component) => component.kind === "robot-arm" && (!selectedConsoleRobot || robotComponentIds.has(component.id)))
        .map((component) => ({
          targetId: `component:${component.id}`,
          title: component.name,
          subtitle: `${component.pluginInstanceIds.length} ${t("sections.plugins")}`
        })),
    [components, robotComponentIds, selectedConsoleRobot, t]
  );
  const dashboardTargets = useMemo(
    () => createConsoleDashboardTargets(cameraVideoSources, componentArmTargets, { includeProjectArm: !selectedConsoleRobot }),
    [cameraVideoSources, componentArmTargets, selectedConsoleRobot]
  );
  const targetByKey = useMemo(() => new Map(dashboardTargets.map((target) => [targetKey(target.panelId, target.targetId), target])), [dashboardTargets]);
  const availableTargetsForDraft = useMemo(
    () =>
      dashboardTargets.filter(
        (target) => target.panelId === draftPanelId && !layoutItems.some((item) => item.panelId === target.panelId && item.targetId === target.targetId)
      ),
    [dashboardTargets, draftPanelId, layoutItems]
  );
  const selectedDraftTarget = availableTargetsForDraft.find((target) => target.targetId === draftTargetId) ?? availableTargetsForDraft[0];
  const gridLayout = useMemo(() => layoutItems.map(panelLayoutToGridItem), [layoutItems]);
  const statusLabel = t(`dashboard.status.${layoutStatus}`);
  const consoleScopeLabel = selectedConsoleRobot?.name ?? t("dashboard.robot.projectDefault");

  useEffect(() => {
    layoutItemsRef.current = layoutItems;
    latestGridLayoutRef.current = layoutItems.map(panelLayoutToGridItem);
  }, [layoutItems]);

  useEffect(() => {
    dashboardTargetsRef.current = dashboardTargets;
  }, [dashboardTargets]);

  useEffect(() => () => activePointerCleanupRef.current?.(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardSources() {
      if (!currentProject || !dataServiceOnline) {
        setComponents([]);
        setRobots([]);
        setSelectedConsoleRobotId("");
        return;
      }

      try {
        const [componentResult, robotResult] = await Promise.all([
          listComponents(currentProject.id),
          listRobots(currentProject.id)
        ]);
        if (cancelled) {
          return;
        }
        setComponents(componentResult);
        setRobots(robotResult);
        setSelectedConsoleRobotId((current) => (robotResult.some((robot) => robot.id === current) ? current : robotResult[0]?.id ?? ""));
      } catch {
        if (!cancelled) {
          setComponents([]);
          setRobots([]);
          setSelectedConsoleRobotId("");
        }
      }
    }

    void loadDashboardSources();
    return () => {
      cancelled = true;
    };
  }, [currentProject?.id, dataServiceOnline]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardLayout() {
      if (!currentProject || !dataServiceOnline) {
        setLayoutItems(defaultConsoleDashboardLayout(dashboardTargets, activeConsoleScope));
        setLayoutStatus("offline");
        return;
      }

      setLayoutStatus("loading");
      try {
        const scopedLayoutResult = await loadPanelLayout(currentProject.id, activeConsoleScope);
        const fallbackLayoutResult =
          activeConsoleScope === CONSOLE_DASHBOARD_SCOPE || scopedLayoutResult.layout.length > 0
            ? null
            : await loadPanelLayout(currentProject.id, CONSOLE_DASHBOARD_SCOPE);
        if (cancelled) {
          return;
        }
        const sourceLayout = scopedLayoutResult.layout.length > 0 ? scopedLayoutResult.layout : adaptConsoleFallbackLayout(fallbackLayoutResult?.layout ?? [], dashboardTargets);
        setLayoutItems(mergeConsoleDashboardLayout(sourceLayout, dashboardTargets, activeConsoleScope));
        setLayoutStatus("saved");
      } catch {
        if (!cancelled) {
          setLayoutItems(defaultConsoleDashboardLayout(dashboardTargets, activeConsoleScope));
          setLayoutStatus("error");
        }
      }
    }

    void loadDashboardLayout();
    return () => {
      cancelled = true;
    };
  }, [activeConsoleScope, currentProject?.id, dashboardTargets, dataServiceOnline]);

  useEffect(() => {
    setLayoutItems((current) => mergeConsoleDashboardLayout(current, dashboardTargets, activeConsoleScope));
  }, [activeConsoleScope, dashboardTargets]);

  useEffect(() => {
    if (!availableTargetsForDraft.some((target) => target.targetId === draftTargetId)) {
      setDraftTargetId(availableTargetsForDraft[0]?.targetId ?? "");
    }
  }, [availableTargetsForDraft, draftTargetId]);

  useEffect(() => {
    if (!editMode) {
      setMetricConfigPanelId(null);
    }
  }, [editMode]);

  useEffect(() => {
    if (metricConfigPanelId && !layoutItems.some((item) => item.id === metricConfigPanelId)) {
      setMetricConfigPanelId(null);
    }
  }, [layoutItems, metricConfigPanelId]);

  async function persistLayout(nextLayout: PanelLayoutItem[]) {
    const requestId = layoutSaveRequestRef.current + 1;
    layoutSaveRequestRef.current = requestId;
    setLayoutItems(nextLayout);
    if (!currentProject || !dataServiceOnline) {
      setLayoutStatus("offline");
      return;
    }
    setLayoutStatus("saving");
    try {
      const saved = await savePanelLayout(currentProject.id, activeConsoleScope, nextLayout);
      if (requestId === layoutSaveRequestRef.current) {
        setLayoutItems(mergeConsoleDashboardLayout(saved.layout, dashboardTargetsRef.current, activeConsoleScope));
        setLayoutStatus("saved");
      }
    } catch {
      if (requestId === layoutSaveRequestRef.current) {
        setLayoutStatus("error");
      }
    }
  }

  function handleLayoutChange(nextGridLayout: Layout) {
    if (!editMode) {
      return;
    }
    latestGridLayoutRef.current = nextGridLayout;
  }

  function handleLayoutCommit(nextGridLayout: Layout) {
    if (!editMode) {
      return;
    }
    const committedGridLayout = nextGridLayout.length > 0 ? nextGridLayout : latestGridLayoutRef.current;
    latestGridLayoutRef.current = committedGridLayout;
    void persistLayout(updateConsoleDashboardLayoutFromGrid(layoutItemsRef.current, committedGridLayout));
  }

  function handleAddPanel() {
    if (!selectedDraftTarget) {
      return;
    }
    void persistLayout(addConsoleDashboardPanel(layoutItems, selectedDraftTarget, activeConsoleScope));
    setAddPanelOpen(false);
  }

  function handleResetLayout() {
    void persistLayout(defaultConsoleDashboardLayout(dashboardTargets, activeConsoleScope));
  }

  function handleVisibleItemToggle(item: PanelLayoutItem, visibleItemId: string, checked: boolean) {
    const selectedIds = consoleDashboardSelectedVisibleItemIds(item);
    const nextIds = checked ? [...selectedIds, visibleItemId] : selectedIds.filter((id) => id !== visibleItemId);
    void persistLayout(updateConsoleDashboardVisibleItems(layoutItemsRef.current, item.id, nextIds));
  }

  function handleVisibleItemsPreset(item: PanelLayoutItem, visibleItemIds: string[]) {
    void persistLayout(updateConsoleDashboardVisibleItems(layoutItemsRef.current, item.id, visibleItemIds));
  }

  function handlePanelPointerDown(event: ReactPointerEvent<HTMLElement>, item: PanelLayoutItem, mode: LayoutPointerMode) {
    if (!editMode || event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement | null)?.closest(".console-dashboard-card-action")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activePointerCleanupRef.current?.();

    const pointerTarget = event.currentTarget;
    const pointerId = event.pointerId;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startPanelLayout = layoutItemsRef.current;
    const startGridLayout = startPanelLayout.map(panelLayoutToGridItem);
    let latestPanelLayout = startPanelLayout;
    let changed = false;

    pointerTarget.setPointerCapture?.(pointerId);

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      try {
        pointerTarget.releasePointerCapture?.(pointerId);
      } catch {
        // Pointer capture can already be gone after pointerup/cancel in some browsers.
      }
      activePointerCleanupRef.current = null;
    };

    const commitLatestLayout = () => {
      cleanup();
      if (changed) {
        void persistLayout(latestPanelLayout);
      }
    };

    const restoreStartLayout = () => {
      cleanup();
      layoutItemsRef.current = startPanelLayout;
      latestGridLayoutRef.current = startGridLayout;
      setLayoutItems(startPanelLayout);
    };

    function handlePointerMove(pointerEvent: PointerEvent) {
      if (pointerEvent.pointerId !== pointerId) {
        return;
      }
      pointerEvent.preventDefault();
      const nextGridLayout = layoutForPointerDelta(
        startGridLayout,
        item.id,
        mode,
        pointerEvent.clientX - startClientX,
        pointerEvent.clientY - startClientY,
        dashboardWidth
      );
      if (layoutsEqual(nextGridLayout, latestGridLayoutRef.current)) {
        return;
      }
      latestGridLayoutRef.current = nextGridLayout;
      latestPanelLayout = updateConsoleDashboardLayoutFromGrid(startPanelLayout, nextGridLayout);
      layoutItemsRef.current = latestPanelLayout;
      changed = true;
      setLayoutItems(latestPanelLayout);
    }

    function handlePointerUp(pointerEvent: PointerEvent) {
      if (pointerEvent.pointerId === pointerId) {
        commitLatestLayout();
      }
    }

    function handlePointerCancel(pointerEvent: PointerEvent) {
      if (pointerEvent.pointerId === pointerId) {
        restoreStartLayout();
      }
    }

    activePointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function renderPanelBody(item: PanelLayoutItem) {
    const target = targetByKey.get(targetKey(item.panelId, item.targetId));
    if (!target && (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed || item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.armSvg)) {
      return <div className="empty-state">{t("dashboard.missingTarget")}</div>;
    }

    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.telemetry) {
      return (
        <ConsoleTelemetryPanel
          activeDriveBase={activeDriveBase}
          activeGamepad={activeGamepad}
          completeMotorMappingCount={completeMotorMappingCount}
          connected={connected}
          driveCanCommand={driveCanCommand}
          hiddenItemCount={consoleDashboardHiddenVisibleItemCount(item)}
          motorCount={motorCount}
          servoCount={servoCount}
          servoFeedback={servoFeedback}
          t={t}
          visibleItemIds={consoleDashboardRenderedVisibleItemIds(item)}
        />
      );
    }

    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.attitude) {
      return (
        <ConsoleAttitudePanel
          aBoardBridgeConnected={aBoardBridgeConnected}
          aBoardBridgeBusy={aBoardBridgeBusy}
          attitude={aBoardImuAttitude}
          calibration={aBoardImuCalibration}
          calibrationStatus={aBoardImuCalibrationStatus}
          error={aBoardImuError}
          feedback={aBoardImuFeedback}
          hiddenItemCount={consoleDashboardHiddenVisibleItemCount(item)}
          onCheckBridge={checkAboardSerialBridge}
          onStartCalibration={startAboardImuCalibration}
          t={t}
          visibleItemIds={consoleDashboardRenderedVisibleItemIds(item)}
        />
      );
    }

    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed) {
      const sourceId = cameraSourceIdFromDashboardTarget(item.targetId);
      const source = cameraVideoSources.find((candidate) => candidate.id === sourceId);
      return source ? (
        <>
          <ConsolePiCameraControls piRemote={piRemote} source={source} t={t} />
          <ConsoleCameraFeedPanel
            cameraConfig={cameraConfig}
            cameraStreamReloadToken={cameraStreamReloadToken}
            runtime={cameraSourceRuntimeById[source.id]}
            setCameraSourceRuntime={setCameraSourceRuntime}
            source={source}
            t={t}
            hiddenItemCount={consoleDashboardHiddenVisibleItemCount(item)}
            visibleItemIds={consoleDashboardRenderedVisibleItemIds(item)}
          />
        </>
      ) : (
        <div className="empty-state">{t("dashboard.missingTarget")}</div>
      );
    }

    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.armSvg) {
      const armPreview = armPreviewForTarget(item.targetId);
      return armPreview ? (
        <ConsoleArmPanel title={armPreview.title}>
          <ArmSvgPreview armConfig={armPreview.config} armSegmentPoses={armPreview.poses} serialOnline={connected} t={t} title={armPreview.title} />
        </ConsoleArmPanel>
      ) : (
        <div className="empty-state">{t("dashboard.missingTarget")}</div>
      );
    }

    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.joystick) {
      return (
        <ConsoleJoystickPanel
          activeDriveBase={activeDriveBase}
          cameraPreviewCommand={cameraPreviewCommand}
          driveInput={driveInput}
          drivePreviewCommand={drivePreviewCommand}
          handleVirtualStickDown={handleVirtualStickDown}
          handleVirtualStickMove={handleVirtualStickMove}
          resetVirtualStick={resetVirtualStick}
          selectDriveBase={selectDriveBase}
          stopAllMotors={stopAllMotors}
          t={t}
        />
      );
    }

    return <ConsoleEventLogPanel logs={logs} t={t} />;
  }

  function renderMetricPicker(item: PanelLayoutItem) {
    const definitions = consoleDashboardVisibleItemDefinitions(item.panelId);
    if (!editMode || metricConfigPanelId !== item.id || definitions.length === 0) {
      return null;
    }
    const selectedIds = consoleDashboardSelectedVisibleItemIds(item);
    const selected = new Set(selectedIds);
    const defaultIds = defaultConsoleDashboardVisibleItemIds(item.panelId);
    const allIds = definitions.map((definition) => definition.id);

    return (
      <div className="console-dashboard-metric-picker console-dashboard-card-action" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
        <div className="console-dashboard-metric-picker-head">
          <strong>{t("dashboard.fields.visibleMetrics")}</strong>
          <small>{t("dashboard.fields.hiddenMetrics", { count: consoleDashboardHiddenVisibleItemCount(item) })}</small>
        </div>
        <div className="console-dashboard-metric-picker-actions">
          <button className="module-tab" onClick={() => handleVisibleItemsPreset(item, defaultIds)} type="button">
            <span>{t("dashboard.actions.recommendedMetrics")}</span>
          </button>
          <button className="module-tab" onClick={() => handleVisibleItemsPreset(item, allIds)} type="button">
            <span>{t("dashboard.actions.selectAllMetrics")}</span>
          </button>
        </div>
        <div className="console-dashboard-metric-options">
          {definitions.map((definition) => {
            const checked = selected.has(definition.id);
            return (
              <label className="console-dashboard-metric-option" key={definition.id}>
                <input
                  checked={checked}
                  disabled={checked && selectedIds.length === 1}
                  onChange={(event) => handleVisibleItemToggle(item, definition.id, event.target.checked)}
                  type="checkbox"
                />
                <span>{t(definition.labelKey)}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function armPreviewForTarget(targetId: string): { config: ArmConfig; poses: ArmSegmentPose[]; title: string } | null {
    if (targetId === "robot-arm:main") {
      return { config: armConfig, poses: armSegmentPoses, title: t("dashboard.targets.mainArm") };
    }
    if (!targetId.startsWith("component:")) {
      return null;
    }
    const componentId = targetId.slice("component:".length);
    const component = components.find((item) => item.id === componentId);
    if (!component || component.kind !== "robot-arm") {
      return null;
    }
    const componentInstances = component.pluginInstanceIds
      .map((pluginId) => architecturePluginInstances.find((instance) => instance.id === pluginId))
      .filter((instance): instance is PluginInstance => Boolean(instance));
    const servos = pluginInstancesToServoProfiles(componentInstances);
    const config = normalizeArmConfig(component.config?.armConfig, servos);
    return {
      config,
      poses: calculateArmSegmentPoses(config.joints, { x: 300, y: 250 }),
      title: component.name
    };
  }

  return (
    <section className="panel console-page-panel console-dashboard-panel" aria-labelledby="main-console-title">
      <div className="console-dashboard-head">
        <span>
          <strong id="main-console-title">{t("console.main")}</strong>
          <small>{activeSectionLabel} / {consoleScopeLabel} / {statusLabel}</small>
        </span>
        <label className="console-dashboard-robot-picker">
          <span>
            <Bot size={15} aria-hidden="true" />
            {t("dashboard.fields.robotConsole")}
          </span>
          <select
            aria-label={t("dashboard.fields.robotConsole")}
            data-testid="console-dashboard-robot"
            disabled={!currentProject || !dataServiceOnline || robots.length === 0}
            value={selectedConsoleRobot?.id ?? ""}
            onChange={(event) => setSelectedConsoleRobotId(event.target.value)}
          >
            {robots.length === 0 ? (
              <option value="">{t("dashboard.robot.projectDefault")}</option>
            ) : (
              robots.map((robot) => (
                <option key={robot.id} value={robot.id}>
                  {robot.name}
                </option>
              ))
            )}
          </select>
          {robots.length === 0 && <small>{t("dashboard.robot.noRobots")}</small>}
        </label>
        <div className="console-dashboard-actions">
          <button className="icon-button" data-testid="console-dashboard-add-panel" onClick={() => setAddPanelOpen((current) => !current)} type="button">
            <Plus size={18} />
            <span>{t("dashboard.actions.addPanel")}</span>
          </button>
          <button className={editMode ? "icon-button primary" : "icon-button"} data-testid="console-dashboard-edit-layout" onClick={() => setEditMode((current) => !current)} type="button">
            <LayoutGrid size={18} />
            <span>{editMode ? t("dashboard.actions.doneEditing") : t("dashboard.actions.editLayout")}</span>
          </button>
          <button className="icon-button" data-testid="console-dashboard-reset-layout" onClick={handleResetLayout} type="button">
            <RotateCcw size={18} />
            <span>{t("dashboard.actions.resetLayout")}</span>
          </button>
        </div>
      </div>

      {addPanelOpen && (
        <div className="console-dashboard-add-panel">
          <label>
            <span>{t("dashboard.fields.panelType")}</span>
            <select data-testid="console-dashboard-panel-type" value={draftPanelId} onChange={(event) => setDraftPanelId(event.target.value as ConsoleDashboardPanelId)}>
              {Object.values(CONSOLE_DASHBOARD_PANEL_IDS).map((panelId) => (
                <option key={panelId} value={panelId}>
                  {t(`dashboard.panelTypes.${panelId}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("dashboard.fields.target")}</span>
            <select data-testid="console-dashboard-target" disabled={availableTargetsForDraft.length === 0} value={selectedDraftTarget?.targetId ?? ""} onChange={(event) => setDraftTargetId(event.target.value)}>
              {availableTargetsForDraft.map((target) => (
                <option key={target.targetId} value={target.targetId}>
                  {target.title}
                </option>
              ))}
            </select>
          </label>
          <button className="icon-button primary" data-testid="console-dashboard-add-selected" disabled={!selectedDraftTarget} onClick={handleAddPanel} type="button">
            <Plus size={18} />
            <span>{t("dashboard.actions.addSelected")}</span>
          </button>
          {availableTargetsForDraft.length === 0 && <span className="console-dashboard-empty-targets">{t("dashboard.noTargets")}</span>}
        </div>
      )}

      <div className="console-dashboard-grid-shell" ref={dashboardContainerRef as RefObject<HTMLDivElement>}>
        {dashboardMounted && (
          <GridLayout
            className={editMode ? "console-dashboard-grid editing" : "console-dashboard-grid"}
            dragConfig={{ enabled: false }}
            gridConfig={{ cols: DASHBOARD_GRID_COLS, rowHeight: DASHBOARD_GRID_ROW_HEIGHT, margin: DASHBOARD_GRID_MARGIN, containerPadding: DASHBOARD_GRID_PADDING }}
            layout={gridLayout}
            onLayoutChange={handleLayoutChange}
            resizeConfig={{ enabled: false, handles: [] }}
            width={dashboardWidth}
          >
            {layoutItems.map((item) => {
              const target = targetByKey.get(targetKey(item.panelId, item.targetId));
              const itemConfigurable = consoleDashboardVisibleItemDefinitions(item.panelId).length > 0;
              return (
                <article className="console-dashboard-card console-card" data-card-size={consoleDashboardCardSize(item)} data-panel-id={item.panelId} data-target-id={item.targetId} key={item.id}>
                  <header className="console-dashboard-card-head" onPointerDown={(event) => handlePanelPointerDown(event, item, "drag")}>
                    <span className="console-dashboard-drag-handle" title={t("dashboard.actions.movePanel")} aria-label={t("dashboard.actions.movePanel")}>
                      <GripVertical size={16} aria-hidden="true" />
                    </span>
                    <span className="console-dashboard-card-title">
                      <strong>{target?.title ?? item.title}</strong>
                      <small>{target?.subtitle ?? item.targetId}</small>
                    </span>
                    {editMode && (
                      <span className="console-dashboard-card-controls">
                        {itemConfigurable && (
                          <button
                            className={metricConfigPanelId === item.id ? "icon-only primary console-dashboard-card-action" : "icon-only console-dashboard-card-action"}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMetricConfigPanelId((current) => (current === item.id ? null : item.id));
                            }}
                            title={t("dashboard.actions.configurePanelMetrics")}
                            type="button"
                            aria-label={t("dashboard.actions.configurePanelMetrics")}
                          >
                            <SlidersHorizontal size={16} />
                          </button>
                        )}
                        <button className="icon-only danger console-dashboard-card-action" onClick={() => void persistLayout(removeConsoleDashboardPanel(layoutItems, item.id))} title={t("dashboard.actions.removePanel")} type="button" aria-label={t("dashboard.actions.removePanel")}>
                          <Trash2 size={16} />
                        </button>
                      </span>
                    )}
                  </header>
                  {renderMetricPicker(item)}
                  <div className="console-dashboard-card-body">{renderPanelBody(item)}</div>
                  {editMode && (
                    <span
                      aria-label={t("dashboard.actions.resizePanel")}
                      className="react-resizable-handle react-resizable-handle-se console-dashboard-resize-handle console-dashboard-resize-handle-se"
                      data-testid="console-dashboard-resize-se"
                      onPointerDown={(event) => handlePanelPointerDown(event, item, "resize")}
                      title={t("dashboard.actions.resizePanel")}
                    />
                  )}
                </article>
              );
            })}
          </GridLayout>
        )}
      </div>
    </section>
  );
}

function adaptConsoleFallbackLayout(layout: PanelLayoutItem[], targets: ConsoleDashboardTarget[]): PanelLayoutItem[] {
  const targetsByKey = new Map(targets.map((target) => [targetKey(target.panelId, target.targetId), target]));
  const replacementArmTarget = targets.find((target) => target.panelId === CONSOLE_DASHBOARD_PANEL_IDS.armSvg);
  return layout
    .filter((item) => item.panelId !== CONSOLE_DASHBOARD_PANEL_IDS.armSvg || targetsByKey.has(targetKey(item.panelId, item.targetId)) || replacementArmTarget)
    .map((item) => {
      if (item.panelId !== CONSOLE_DASHBOARD_PANEL_IDS.armSvg || targetsByKey.has(targetKey(item.panelId, item.targetId)) || !replacementArmTarget) {
        return item;
      }
      return {
        ...item,
        id: "",
        targetId: replacementArmTarget.targetId,
        capability: replacementArmTarget.capability,
        title: replacementArmTarget.title
      };
    });
}

function layoutForPointerDelta(startGridLayout: Layout, itemId: string, mode: LayoutPointerMode, deltaX: number, deltaY: number, containerWidth: number): Layout {
  const colWidth = Math.max(
    1,
    (containerWidth - DASHBOARD_GRID_MARGIN[0] * (DASHBOARD_GRID_COLS - 1) - DASHBOARD_GRID_PADDING[0] * 2) / DASHBOARD_GRID_COLS
  );
  const deltaGridX = Math.round(deltaX / (colWidth + DASHBOARD_GRID_MARGIN[0]));
  const deltaGridY = Math.round(deltaY / (DASHBOARD_GRID_ROW_HEIGHT + DASHBOARD_GRID_MARGIN[1]));
  const nextLayout = startGridLayout.map((gridItem) => ({ ...gridItem }));
  const target = nextLayout.find((gridItem) => gridItem.i === itemId);
  const startTarget = startGridLayout.find((gridItem) => gridItem.i === itemId);

  if (!target || !startTarget || (deltaGridX === 0 && deltaGridY === 0)) {
    return startGridLayout;
  }

  if (mode === "drag") {
    const nextX = clampGridInteger(startTarget.x + deltaGridX, 0, DASHBOARD_GRID_COLS - startTarget.w);
    const nextY = clampGridInteger(startTarget.y + deltaGridY, 0, 999);
    const movedLayout = moveElement(nextLayout, target, nextX, nextY, true, false, "vertical", DASHBOARD_GRID_COLS);
    return verticalCompactor.compact(movedLayout, DASHBOARD_GRID_COLS);
  }

  target.w = clampGridInteger(startTarget.w + deltaGridX, target.minW ?? 1, DASHBOARD_GRID_COLS - target.x);
  target.h = clampGridInteger(startTarget.h + deltaGridY, target.minH ?? 1, 12);
  return verticalCompactor.compact(nextLayout, DASHBOARD_GRID_COLS);
}

function clampGridInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function layoutsEqual(left: Layout, right: Layout): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const other = right[index];
    return Boolean(other) && item.i === other.i && item.x === other.x && item.y === other.y && item.w === other.w && item.h === other.h;
  });
}

export { CONSOLE_DASHBOARD_PANEL_DEFINITIONS };

function ConsolePiCameraControls({ piRemote, source, t }: { piRemote: PiRemoteRuntime; source: CameraVideoSource; t: TFunction }) {
  const cameraTarget = `${piRemote.piRemoteForm.username || "robot1"}@${piRemote.piRemoteForm.host || "rescue-pi.local"}`;
  const streamUrl = piRemote.piCameraCheck?.streamUrl || source.streamUrl || "--";
  const statusTone =
    piRemote.piCameraStatus === "error" ? "danger" : piRemote.piCameraStatus === "streaming" ? "online" : piRemote.piCameraBusy ? "warning" : "neutral";
  return (
    <div className="console-pi-camera-controls" data-status-tone={statusTone}>
      <div className="console-pi-camera-summary">
        <span>
          <strong>{t("piRemote.camera.title")}</strong>
          <small>{cameraTarget}</small>
        </span>
        <code>{streamUrl}</code>
      </div>
      <div className="console-pi-camera-actions">
        <button className="icon-button" disabled={!piRemote.piRemoteForm.host.trim()} onClick={() => piRemote.syncCameraConfigToPiHost()} type="button">
          <RotateCw size={18} />
          <span>{t("actions.syncPiCameraUrl")}</span>
        </button>
        <button className="icon-button" disabled={!piRemote.canUsePiCamera} onClick={() => void piRemote.checkRaspberryPiCamera(source)} type="button">
          <Radar size={18} />
          <span>{t("actions.checkPiCamera")}</span>
        </button>
        <button className="icon-button primary" disabled={!piRemote.canUsePiCamera} onClick={() => void piRemote.startRaspberryPiCameraStream(source)} type="button">
          <Play size={18} />
          <span>{t("actions.startPiCamera")}</span>
        </button>
        <button className="icon-button" disabled={!piRemote.piConnectionReady || piRemote.piCameraBusy} onClick={() => void piRemote.stopRaspberryPiCameraStream(source)} type="button">
          <Square size={18} />
          <span>{t("actions.stopPiCamera")}</span>
        </button>
      </div>
      {piRemote.piCameraError && <p className="form-error">{piRemote.piCameraError}</p>}
    </div>
  );
}
