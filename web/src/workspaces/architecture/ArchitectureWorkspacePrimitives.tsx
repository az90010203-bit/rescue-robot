import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { pluginInstanceDeviceId, type PluginInstance } from "@platform/architecture";
import type { CapabilityId } from "@platform/types";
import type { ArchitectureMetricTone } from "@workspaces/architecture/architectureWorkspaceUtils";

export function ArchitecturePanelHeading({ icon, meta, title }: { icon: ReactNode; meta: string; title: string }) {
  return (
    <div className="panel-title architecture-panel-title">
      <div className="panel-title-main">
        {icon}
        <h3>{title}</h3>
      </div>
      <span className="panel-meta">{meta}</span>
    </div>
  );
}

export function EntitySelector<T extends { id: string; name: string }>({
  empty,
  items,
  onDelete,
  onSelect,
  renderMeta,
  selectedId
}: {
  empty: string;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  renderMeta: (item: T) => string;
}) {
  if (items.length === 0) {
    return <div className="empty-state">{empty}</div>;
  }
  return (
    <div className="architecture-entity-list">
      {items.map((item) => (
        <div className={selectedId === item.id ? "device-row selected" : "device-row"} key={item.id}>
          <button className="device-select" onClick={() => onSelect(item.id)} type="button">
            <span className="device-info">
              <span className="device-name">{item.name}</span>
              <span className="device-meta">{renderMeta(item)}</span>
            </span>
          </button>
          <button className="delete-hit" onClick={() => void onDelete(item.id)} type="button">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SelectableInstanceList({
  emptyLabel,
  instances,
  onToggle,
  selectedIds,
  typeLabel,
  usage
}: {
  emptyLabel: string;
  instances: PluginInstance[];
  selectedIds: Set<string>;
  typeLabel: (type: CapabilityId) => string;
  usage: Map<string, Array<{ ownerName: string }>>;
  onToggle: (id: string) => void;
}) {
  if (instances.length === 0) {
    return <div className="empty-state">{emptyLabel}</div>;
  }
  return (
    <div className="architecture-selectable-list">
      {instances.map((instance) => (
        <label className="checkbox-field architecture-selectable-row" key={instance.id}>
          <input type="checkbox" checked={selectedIds.has(instance.id)} disabled={Boolean(usage.get(instance.id)?.length)} onChange={() => onToggle(instance.id)} />
          <span>
            <strong>{instance.name}</strong>
            <small>{typeLabel(instance.type)} 路 {pluginInstanceDeviceId(instance)}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

export function ArchitectureMetric({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: ArchitectureMetricTone }) {
  return (
    <div className={`architecture-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
