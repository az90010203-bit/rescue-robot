import { GripVertical, LayoutGrid, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import { GridLayout, useContainerWidth, type Layout } from "react-grid-layout";
import type { DataProject } from "../../lib/dataService";
import { listComponents, loadPanelLayout, savePanelLayout } from "../../lib/dataService";
import type { DriveInputState } from "../../lib/drive";
import {
  type ArmConfig,
  type ArmSegmentPose,
  type CameraConfig,
  type CameraVideoSource,
  calculateArmSegmentPoses,
  normalizeArmConfig
} from "../../lib/storage";
import type { LogEntry } from "../../app/appModel";
import { ArmSvgPreview } from "../arm/ArmSvgPreview";
import type { CameraSourceRuntimeStatus } from "../drive/cameraSources";
import {
  ConsoleArmPanel,
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
  createConsoleDashboardTargets,
  defaultConsoleDashboardLayout,
  mergeConsoleDashboardLayout,
  panelLayoutToGridItem,
  removeConsoleDashboardPanel,
  targetKey,
  updateConsoleDashboardLayoutFromGrid
} from "./dashboardLayout";
import type { ComponentDefinition, PanelLayoutItem, PluginInstance } from "../../platform/architecture";
import { pluginInstancesToServoProfiles } from "../../platform/architecture";

interface ConsoleDashboardProps {
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
  resetVirtualStick: (kind: "camera" | "drive") => void;
  selectDriveBase: (base: "tracked" | "mecanum") => void;
  servoCount: number;
  servoFeedback: Record<string, any>;
  setCameraSourceRuntime: (sourceId: string, patch: Partial<CameraSourceRuntimeStatus>) => void;
  stopAllMotors: () => void;
  t: TFunction;
}

type LayoutStatus = "error" | "loading" | "offline" | "saved" | "saving";

export function ConsoleDashboard({
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
  resetVirtualStick,
  selectDriveBase,
  servoCount,
  servoFeedback,
  setCameraSourceRuntime,
  stopAllMotors,
  t
}: ConsoleDashboardProps) {
  const [components, setComponents] = useState<ComponentDefinition[]>([]);
  const [layoutItems, setLayoutItems] = useState<PanelLayoutItem[]>([]);
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>(dataServiceOnline ? "loading" : "offline");
  const [editMode, setEditMode] = useState(false);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [draftPanelId, setDraftPanelId] = useState<ConsoleDashboardPanelId>(CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed);
  const [draftTargetId, setDraftTargetId] = useState("");
  const { width: dashboardWidth, containerRef: dashboardContainerRef, mounted: dashboardMounted } = useContainerWidth({ initialWidth: 1200 });

  const componentArmTargets = useMemo(
    () =>
      components
        .filter((component) => component.kind === "robot-arm")
        .map((component) => ({
          targetId: `component:${component.id}`,
          title: component.name,
          subtitle: `${component.pluginInstanceIds.length} ${t("sections.plugins")}`
        })),
    [components, t]
  );
  const dashboardTargets = useMemo(() => createConsoleDashboardTargets(cameraVideoSources, componentArmTargets), [cameraVideoSources, componentArmTargets]);
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

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardState() {
      if (!currentProject || !dataServiceOnline) {
        setComponents([]);
        setLayoutItems(defaultConsoleDashboardLayout(createConsoleDashboardTargets(cameraVideoSources)));
        setLayoutStatus("offline");
        return;
      }

      setLayoutStatus("loading");
      try {
        const [layoutResult, componentResult] = await Promise.all([
          loadPanelLayout(currentProject.id, CONSOLE_DASHBOARD_SCOPE),
          listComponents(currentProject.id)
        ]);
        if (cancelled) {
          return;
        }
        const armTargets = componentResult
          .filter((component) => component.kind === "robot-arm")
          .map((component) => ({
            targetId: `component:${component.id}`,
            title: component.name,
            subtitle: `${component.pluginInstanceIds.length} ${t("sections.plugins")}`
          }));
        setComponents(componentResult);
        setLayoutItems(mergeConsoleDashboardLayout(layoutResult.layout, createConsoleDashboardTargets(cameraVideoSources, armTargets)));
        setLayoutStatus("saved");
      } catch {
        if (!cancelled) {
          setLayoutItems(defaultConsoleDashboardLayout(createConsoleDashboardTargets(cameraVideoSources)));
          setLayoutStatus("error");
        }
      }
    }

    void loadDashboardState();
    return () => {
      cancelled = true;
    };
  }, [cameraVideoSources, currentProject?.id, dataServiceOnline, t]);

  useEffect(() => {
    setLayoutItems((current) => mergeConsoleDashboardLayout(current, dashboardTargets));
  }, [dashboardTargets]);

  useEffect(() => {
    if (!availableTargetsForDraft.some((target) => target.targetId === draftTargetId)) {
      setDraftTargetId(availableTargetsForDraft[0]?.targetId ?? "");
    }
  }, [availableTargetsForDraft, draftTargetId]);

  async function persistLayout(nextLayout: PanelLayoutItem[]) {
    setLayoutItems(nextLayout);
    if (!currentProject || !dataServiceOnline) {
      setLayoutStatus("offline");
      return;
    }
    setLayoutStatus("saving");
    try {
      const saved = await savePanelLayout(currentProject.id, CONSOLE_DASHBOARD_SCOPE, nextLayout);
      setLayoutItems(mergeConsoleDashboardLayout(saved.layout, dashboardTargets));
      setLayoutStatus("saved");
    } catch {
      setLayoutStatus("error");
    }
  }

  function handleLayoutChange(nextGridLayout: Layout) {
    if (!editMode) {
      return;
    }
    setLayoutItems((current) => updateConsoleDashboardLayoutFromGrid(current, nextGridLayout));
  }

  function handleLayoutCommit(nextGridLayout: Layout) {
    if (!editMode) {
      return;
    }
    void persistLayout(updateConsoleDashboardLayoutFromGrid(layoutItems, nextGridLayout));
  }

  function handleAddPanel() {
    if (!selectedDraftTarget) {
      return;
    }
    void persistLayout(addConsoleDashboardPanel(layoutItems, selectedDraftTarget));
    setAddPanelOpen(false);
  }

  function handleResetLayout() {
    void persistLayout(defaultConsoleDashboardLayout(dashboardTargets));
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
          motorCount={motorCount}
          servoCount={servoCount}
          servoFeedback={servoFeedback}
          t={t}
        />
      );
    }

    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed) {
      const sourceId = cameraSourceIdFromDashboardTarget(item.targetId);
      const source = cameraVideoSources.find((candidate) => candidate.id === sourceId);
      return source ? (
        <ConsoleCameraFeedPanel
          cameraConfig={cameraConfig}
          cameraStreamReloadToken={cameraStreamReloadToken}
          runtime={cameraSourceRuntimeById[source.id]}
          setCameraSourceRuntime={setCameraSourceRuntime}
          source={source}
          t={t}
        />
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
          <small>{activeSectionLabel} / {statusLabel}</small>
        </span>
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
            dragConfig={{ enabled: editMode, handle: ".console-dashboard-drag-handle" }}
            gridConfig={{ cols: 12, rowHeight: 82, margin: [14, 14], containerPadding: [0, 0] }}
            layout={gridLayout}
            onDragStop={(nextLayout) => handleLayoutCommit(nextLayout)}
            onLayoutChange={handleLayoutChange}
            onResizeStop={(nextLayout) => handleLayoutCommit(nextLayout)}
            resizeConfig={{ enabled: editMode, handles: ["se"] }}
            width={dashboardWidth}
          >
            {layoutItems.map((item) => {
              const target = targetByKey.get(targetKey(item.panelId, item.targetId));
              return (
                <article className="console-dashboard-card console-card" data-panel-id={item.panelId} data-target-id={item.targetId} key={item.id}>
                  <header className="console-dashboard-card-head">
                    <button className="icon-only console-dashboard-drag-handle" disabled={!editMode} title={t("dashboard.actions.movePanel")} type="button" aria-label={t("dashboard.actions.movePanel")}>
                      <GripVertical size={16} />
                    </button>
                    <span>
                      <strong>{target?.title ?? item.title}</strong>
                      <small>{target?.subtitle ?? item.targetId}</small>
                    </span>
                    {editMode && (
                      <button className="icon-only danger" onClick={() => void persistLayout(removeConsoleDashboardPanel(layoutItems, item.id))} title={t("dashboard.actions.removePanel")} type="button" aria-label={t("dashboard.actions.removePanel")}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </header>
                  <div className="console-dashboard-card-body">{renderPanelBody(item)}</div>
                </article>
              );
            })}
          </GridLayout>
        )}
      </div>
    </section>
  );
}

export { CONSOLE_DASHBOARD_PANEL_DEFINITIONS };
