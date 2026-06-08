import type { CapabilityId } from "@platform/types";

export interface PanelLayoutItem {
  id: string;
  scopeId: string;
  panelId: string;
  targetId: string;
  capability: CapabilityId | "dashboard";
  title: string;
  visibleItemIds?: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  order: number;
}

export interface PanelLayoutTarget {
  panelId: string;
  targetId: string;
  capability: CapabilityId;
  title: string;
}

export function defaultPanelLayoutItems(scopeId: string, targets: PanelLayoutTarget[]): PanelLayoutItem[] {
  return targets.map((target, index) => {
    const wide = target.capability === "camera" || target.capability === "robot-arm";
    const w = wide ? 12 : 6;
    return {
      id: `${scopeId}:${target.targetId}:${target.panelId}`,
      scopeId,
      panelId: target.panelId,
      targetId: target.targetId,
      capability: target.capability,
      title: target.title,
      x: wide ? 0 : (index % 2) * 6,
      y: Math.floor(index / 2) * 3,
      w,
      h: wide ? 4 : 3,
      order: index
    };
  });
}

export function mergePanelLayoutItems(scopeId: string, existing: PanelLayoutItem[], targets: PanelLayoutTarget[]): PanelLayoutItem[] {
  const defaults = defaultPanelLayoutItems(scopeId, targets);
  const defaultById = new Map(defaults.map((item) => [item.id, item]));
  const merged = existing
    .filter((item) => defaultById.has(item.id))
    .map((item) => ({ ...defaultById.get(item.id)!, ...sanitizeLayoutItem(item, scopeId) }));
  const existingIds = new Set(merged.map((item) => item.id));
  for (const item of defaults) {
    if (!existingIds.has(item.id)) {
      merged.push(item);
    }
  }
  return reflowPanelLayout(merged);
}

export function reorderPanelLayoutItems(items: PanelLayoutItem[], draggedId: string, targetId: string): PanelLayoutItem[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const from = sorted.findIndex((item) => item.id === draggedId);
  const to = sorted.findIndex((item) => item.id === targetId);
  if (from === -1 || to === -1 || from === to) {
    return sorted;
  }
  const [dragged] = sorted.splice(from, 1);
  sorted.splice(to, 0, dragged);
  return reflowPanelLayout(sorted.map((item, index) => ({ ...item, order: index })));
}

export function reflowPanelLayout(items: PanelLayoutItem[]): PanelLayoutItem[] {
  let y = 0;
  let x = 0;
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => {
      const w = clampInteger(item.w, 1, 12, item.capability === "camera" || item.capability === "robot-arm" ? 12 : 6);
      if (x + w > 12) {
        x = 0;
        y += 3;
      }
      const next = {
        ...item,
        x,
        y,
        w,
        h: clampInteger(item.h, 2, 8, 3),
        order: index
      };
      x += w;
      if (x >= 12) {
        x = 0;
        y += next.h;
      }
      return next;
    });
}

function sanitizeLayoutItem(item: PanelLayoutItem, scopeId: string): PanelLayoutItem {
  return {
    ...item,
    scopeId,
    x: clampInteger(item.x, 0, 11, 0),
    y: clampInteger(item.y, 0, 999, 0),
    w: clampInteger(item.w, 1, 12, 6),
    h: clampInteger(item.h, 2, 8, 3),
    order: clampInteger(item.order, 0, 999, 0)
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}
