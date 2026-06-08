import { Activity, Cpu, Radar, Send, SlidersHorizontal, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DeviceDescriptor, DeviceStateSnapshot, PlatformEvent, UiPanelSchema } from "@platform/types";
import { PlatformControlDraft } from "@platform/ui";
import { formatScalarValue } from "@shared/formatters";
import { Metric, PanelTitle } from "@shared/ui/AppChrome";

type Tone = "danger" | "neutral" | "online" | "warning";

interface PlatformPanelsProps {
  platformCapabilityCount: number;
  platformDeviceCount: number;
  platformDevices: DeviceDescriptor[];
  platformEvents: PlatformEvent[];
  platformStateCount: number;
  resolvedPlatformDeviceId: string;
  runPlatformControlAction: (actionId: string | undefined) => Promise<void>;
  selectedPlatformControlDraft: PlatformControlDraft;
  selectedPlatformDevice: DeviceDescriptor | undefined;
  selectedPlatformState: DeviceStateSnapshot | undefined;
  selectedPlatformUiPanel: UiPanelSchema | undefined;
  setSelectedPlatformDeviceId: (deviceId: string) => void;
  updatePlatformControlDraft: (deviceId: string, key: string, value: string | number | boolean) => void;
  variant: "control" | "deviceTree" | "events" | "state";
}

function platformStatusTone(status?: string): Tone {
  if (status === "online") {
    return "online";
  }
  if (status === "standby") {
    return "warning";
  }
  if (status === "error") {
    return "danger";
  }
  return "neutral";
}

export function PlatformPanels({
  platformCapabilityCount,
  platformDeviceCount,
  platformDevices,
  platformEvents,
  platformStateCount,
  resolvedPlatformDeviceId,
  runPlatformControlAction,
  selectedPlatformControlDraft,
  selectedPlatformDevice,
  selectedPlatformState,
  selectedPlatformUiPanel,
  setSelectedPlatformDeviceId,
  updatePlatformControlDraft,
  variant
}: PlatformPanelsProps) {
  const { t } = useTranslation();

  function platformTypeLabel(type: string): string {
    return t(`platform.types.${type}`, { defaultValue: type });
  }

  function platformFeatureLabel(feature: string): string {
    return t(`platform.features.${feature}`, { defaultValue: feature });
  }

  function platformPluginDisplayName(kind: "drivers" | "transports", id: string): string {
    const key = id.replace(/^(driver|transport)\./, "").replace(/-/g, "_");
    return t(`platform.${kind}.${key}`, { defaultValue: id.replace(/^(driver|transport)\./, "") });
  }

  function platformDeviceDisplayName(device: { id: string; name: string }): string {
    return t(`platform.devices.${device.id.replace(/[:.-]/g, "_")}`, { defaultValue: device.name });
  }

  function platformStateLabels(deviceType?: string): Record<string, string> {
    const common: Record<string, string> = { connected: t("platform.state.connected"), mode: t("platform.state.mode") };
    if (deviceType === "servo") {
      return {
        ...common,
        positionRaw: t("platform.state.positionRaw"),
        speedRaw: t("platform.state.speedRaw"),
        loadRaw: t("platform.state.loadRaw"),
        voltageRaw: t("platform.state.voltageRaw"),
        temperatureC: t("platform.state.temperatureC"),
        moving: t("platform.state.moving"),
        currentRaw: t("platform.state.currentRaw")
      };
    }
    if (deviceType === "motor") {
      return {
        ...common,
        channel: t("platform.state.channel"),
        commandedSpeedPercent: t("platform.state.commandedSpeedPercent"),
        dutyPercent: t("platform.state.dutyPercent"),
        direction: t("platform.state.direction"),
        stopMode: t("platform.state.stopMode"),
        speedRpm: t("platform.state.speedRpm"),
        pulseHz: t("platform.state.pulseHz"),
        encoderTicks: t("platform.state.encoderTicks")
      };
    }
    if (deviceType === "camera") {
      return {
        ...common,
        streamUrl: t("platform.state.streamUrl"),
        panServoId: t("platform.state.panServoId"),
        tiltServoId: t("platform.state.tiltServoId"),
        panAngleDeg: t("platform.state.panAngleDeg"),
        tiltAngleDeg: t("platform.state.tiltAngleDeg")
      };
    }
    if (deviceType === "robot-arm") {
      return {
        ...common,
        jointCount: t("platform.state.jointCount"),
        liveDragEnabled: t("platform.state.liveDragEnabled"),
        selectedJointId: t("platform.state.selectedJointId")
      };
    }
    return common;
  }

  function formatPlatformDisplayValue(value: string | number | boolean | null | undefined): string {
    return formatScalarValue(value, { falseLabel: t("common.no"), trueLabel: t("common.yes") });
  }

  function platformControlLabel(actionId: string | undefined, fallback: string): string {
    return actionId ? t(`platform.controls.${actionId}`, { defaultValue: fallback }) : fallback;
  }

  function renderPlatformControlPanel() {
    const device = selectedPlatformDevice;
    const panel = selectedPlatformUiPanel;

    return (
      <section className="panel platform-control-panel" aria-labelledby="platform-control-title">
        <PanelTitle
          icon={<SlidersHorizontal size={18} />}
          id="platform-control-title"
          meta={panel ? t(`platform.panelSchemas.${panel.id}`, { defaultValue: panel.title }) : t("platform.meta.schema")}
          title={t("platform.panels.control")}
        />
        {!device ? (
          <div className="empty-state">{t("platform.empty.noDeviceSelected")}</div>
        ) : !panel || (device.type !== "servo" && device.type !== "motor") ? (
          <div className="empty-state">{t("platform.empty.dedicatedPanel", { type: platformTypeLabel(device.type) })}</div>
        ) : (
          <div className="platform-control-stack">
            <div className="platform-control-summary">
              <Metric label={t("platform.labels.target")} value={platformDeviceDisplayName(device)} />
              <Metric label={t("platform.labels.capability")} value={platformTypeLabel(device.type)} />
            </div>

            {device.type === "servo" && (
              <div className="platform-control-grid">
                <label>
                  <span>{t("platform.labels.position")}</span>
                  <input type="number" min={0} max={360} step={1} value={String(selectedPlatformControlDraft.angleDeg ?? 90)} onChange={(event) => updatePlatformControlDraft(device.id, "angleDeg", event.target.value)} />
                </label>
                <label>
                  <span>{t("platform.labels.speed")}</span>
                  <input type="number" min={0} max={4095} step={1} value={String(selectedPlatformControlDraft.speedRaw ?? 800)} onChange={(event) => updatePlatformControlDraft(device.id, "speedRaw", event.target.value)} />
                </label>
                <label className="checkbox-field platform-control-toggle">
                  <input type="checkbox" checked={Boolean(selectedPlatformControlDraft.enabled ?? true)} onChange={(event) => updatePlatformControlDraft(device.id, "enabled", event.target.checked)} />
                  <span>{t("platform.labels.torqueEnabled")}</span>
                </label>
              </div>
            )}

            {device.type === "motor" && (
              <div className="platform-control-grid">
                <label>
                  <span>{t("platform.labels.speed")}</span>
                  <input type="number" min={-100} max={100} step={1} value={String(selectedPlatformControlDraft.speedPercent ?? 0)} onChange={(event) => updatePlatformControlDraft(device.id, "speedPercent", event.target.value)} />
                </label>
                <label>
                  <span>{t("platform.labels.stopMode")}</span>
                  <select value={String(selectedPlatformControlDraft.stopMode ?? "coast")} onChange={(event) => updatePlatformControlDraft(device.id, "stopMode", event.target.value)}>
                    <option value="coast">{t("stopMode.coast")}</option>
                    <option value="brake">{t("stopMode.brake")}</option>
                  </select>
                </label>
              </div>
            )}

            <div className="action-grid platform-control-actions">
              {device.type === "servo" && (
                <button className="icon-button" onClick={() => void runPlatformControlAction("scan")} type="button">
                  <Radar size={18} />
                  <span>{t("platform.controls.scan")}</span>
                </button>
              )}
              {panel.controls
                .filter((control) => control.actionId)
                .map((control) => (
                  <button className={control.actionId === "stop" ? "icon-button danger" : control.kind === "button" || control.kind === "toggle" ? "icon-button" : "icon-button primary"} key={control.id} onClick={() => void runPlatformControlAction(control.actionId)} type="button">
                    {control.actionId === "stop" ? <Square size={18} /> : control.actionId?.includes("read") ? <Activity size={18} /> : <Send size={18} />}
                    <span>{platformControlLabel(control.actionId, control.label)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
      </section>
    );
  }

  function renderPlatformDeviceTree() {
    return (
      <section className="platform-panel" aria-labelledby="platform-devices-title">
        <PanelTitle icon={<Cpu size={18} />} id="platform-devices-title" meta={t("platform.meta.capsDevices", { caps: platformCapabilityCount, devices: platformDeviceCount })} title={t("platform.panels.devices")} />
        <div className="platform-device-list">
          {platformDevices.length === 0 ? (
            <div className="empty-state">{t("platform.empty.noDevices")}</div>
          ) : (
            platformDevices.map((device) => (
              <button className={resolvedPlatformDeviceId === device.id ? "device-row platform-device-row selected" : "device-row platform-device-row"} key={device.id} onClick={() => setSelectedPlatformDeviceId(device.id)} type="button">
                <span className="platform-device-copy">
                  <span className="device-id">{platformTypeLabel(device.type)}</span>
                  <span className="device-name">{platformDeviceDisplayName(device)}</span>
                  <small>{platformPluginDisplayName("drivers", device.driverId)} / {platformPluginDisplayName("transports", device.transportId)}</small>
                  <span className="platform-chip-row">
                    {device.capabilities.flatMap((capability) => capability.features.slice(0, 3)).map((feature) => (
                      <span className="platform-chip" key={`${device.id}:${feature}`}>{platformFeatureLabel(feature)}</span>
                    ))}
                  </span>
                </span>
                <span className={`platform-status-pill ${device.status}`}>{t(`status.${device.status}`, { defaultValue: device.status })}</span>
              </button>
            ))
          )}
        </div>
      </section>
    );
  }

  function renderPlatformStatePanel() {
    const values = selectedPlatformState?.values ?? {};
    const labels = platformStateLabels(selectedPlatformDevice?.type);
    const entries = Object.entries(labels).filter(([key]) => key in values);
    const fallbackEntries = Object.entries(values).filter(([key]) => !(key in labels));
    const displayEntries = [...entries, ...fallbackEntries].slice(0, 10);

    return (
      <section className="panel platform-state-panel" aria-labelledby="platform-state-title">
        <PanelTitle icon={<Radar size={18} />} id="platform-state-title" meta={t("platform.meta.states", { count: platformStateCount })} title={t("platform.panels.state")} />
        {selectedPlatformDevice ? (
          <>
            <div className="platform-state-summary">
              <Metric label={t("platform.labels.device")} value={platformDeviceDisplayName(selectedPlatformDevice)} />
              <Metric label={t("platform.labels.type")} value={platformTypeLabel(selectedPlatformDevice.type)} />
              <Metric label={t("platform.labels.status")} value={t(`status.${selectedPlatformDevice.status}`, { defaultValue: selectedPlatformDevice.status })} tone={platformStatusTone(selectedPlatformDevice.status)} />
              <Metric label={t("platform.labels.driver")} value={platformPluginDisplayName("drivers", selectedPlatformDevice.driverId)} />
            </div>
            {displayEntries.length === 0 ? (
              <div className="empty-state">{t("platform.empty.noState")}</div>
            ) : (
              <div className="feedback-grid platform-state-grid">
                {displayEntries.map(([key, value]) => (
                  <Metric code={typeof value === "string" && value.length > 28} key={key} label={labels[key] ?? key} value={formatPlatformDisplayValue(value)} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">{t("platform.empty.noDeviceSelected")}</div>
        )}
      </section>
    );
  }

  function renderPlatformEventList() {
    return (
      <section className="panel platform-events-panel" aria-labelledby="platform-events-title">
        <PanelTitle icon={<Activity size={18} />} id="platform-events-title" meta={t("platform.meta.recent", { count: platformEvents.length })} title={t("platform.panels.events")} />
        <div className="platform-event-list">
          {platformEvents.length === 0 ? (
            <div className="empty-state">{t("platform.empty.noEvents")}</div>
          ) : (
            platformEvents.map((event) => (
              <div className={`platform-event ${event.level}`} key={event.id}>
                <span>
                  <strong>{event.type}</strong>
                  <small>{event.source} / {new Date(event.createdAt).toLocaleTimeString()}</small>
                </span>
                <code>{JSON.stringify(event.payload)}</code>
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  if (variant === "control") {
    return renderPlatformControlPanel();
  }
  if (variant === "deviceTree") {
    return renderPlatformDeviceTree();
  }
  if (variant === "events") {
    return renderPlatformEventList();
  }
  return renderPlatformStatePanel();
}
