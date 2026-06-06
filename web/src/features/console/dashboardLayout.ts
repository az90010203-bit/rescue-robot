import type { CameraVideoSource } from "../../lib/storage";
import type { PanelLayoutItem } from "../../platform/architecture";

export const CONSOLE_DASHBOARD_SCOPE = "console:main";

export const CONSOLE_DASHBOARD_PANEL_IDS = {
  cameraFeed: "console.camera-feed",
  armSvg: "console.arm-svg",
  telemetry: "console.telemetry",
  joystick: "console.joystick",
  eventLog: "console.event-log"
} as const;

export type ConsoleDashboardPanelId = (typeof CONSOLE_DASHBOARD_PANEL_IDS)[keyof typeof CONSOLE_DASHBOARD_PANEL_IDS];
export type ConsoleDashboardCapability = PanelLayoutItem["capability"];

export interface ConsoleDashboardTarget {
  panelId: ConsoleDashboardPanelId;
  targetId: string;
  capability: ConsoleDashboardCapability;
  title: string;
  subtitle?: string;
}

export interface ConsoleArmTarget {
  targetId: string;
  title: string;
  subtitle?: string;
}

export interface ConsoleGridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

type ConsoleGridLayoutUpdateItem = Pick<ConsoleGridLayoutItem, "h" | "i" | "w" | "x" | "y">;

interface ConsolePanelDefinition {
  panelId: ConsoleDashboardPanelId;
  capability: ConsoleDashboardCapability;
  title: string;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export const CONSOLE_DASHBOARD_PANEL_DEFINITIONS: Record<ConsoleDashboardPanelId, ConsolePanelDefinition> = {
  [CONSOLE_DASHBOARD_PANEL_IDS.telemetry]: {
    panelId: CONSOLE_DASHBOARD_PANEL_IDS.telemetry,
    capability: "dashboard",
    title: "Telemetry",
    w: 4,
    h: 4,
    minW: 3,
    minH: 3
  },
  [CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed]: {
    panelId: CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed,
    capability: "camera",
    title: "Camera",
    w: 8,
    h: 5,
    minW: 4,
    minH: 3
  },
  [CONSOLE_DASHBOARD_PANEL_IDS.armSvg]: {
    panelId: CONSOLE_DASHBOARD_PANEL_IDS.armSvg,
    capability: "robot-arm",
    title: "Arm SVG",
    w: 4,
    h: 5,
    minW: 3,
    minH: 3
  },
  [CONSOLE_DASHBOARD_PANEL_IDS.joystick]: {
    panelId: CONSOLE_DASHBOARD_PANEL_IDS.joystick,
    capability: "dashboard",
    title: "Joystick",
    w: 4,
    h: 4,
    minW: 4,
    minH: 3
  },
  [CONSOLE_DASHBOARD_PANEL_IDS.eventLog]: {
    panelId: CONSOLE_DASHBOARD_PANEL_IDS.eventLog,
    capability: "dashboard",
    title: "Event Log",
    w: 4,
    h: 4,
    minW: 3,
    minH: 3
  }
};

export function cameraDashboardTargetId(sourceId: string): string {
  return `camera:${sourceId}`;
}

export function cameraSourceIdFromDashboardTarget(targetId: string): string {
  return targetId.startsWith("camera:") ? targetId.slice("camera:".length) : "";
}

export function consoleDashboardLayoutItemId(panelId: ConsoleDashboardPanelId, targetId: string): string {
  return `${CONSOLE_DASHBOARD_SCOPE}:${targetId}:${panelId}`;
}

export function createConsoleDashboardTargets(cameraSources: CameraVideoSource[], armTargets: ConsoleArmTarget[] = []): ConsoleDashboardTarget[] {
  return [
    {
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.telemetry,
      targetId: "dashboard:telemetry",
      capability: "dashboard",
      title: "Robot Telemetry"
    },
    ...cameraSources.map((source) => ({
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed,
      targetId: cameraDashboardTargetId(source.id),
      capability: "camera" as const,
      title: source.label,
      subtitle: source.streamUrl
    })),
    {
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.armSvg,
      targetId: "robot-arm:main",
      capability: "robot-arm",
      title: "Main Arm",
      subtitle: "Current console arm"
    },
    ...armTargets.map((target) => ({
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.armSvg,
      targetId: target.targetId,
      capability: "robot-arm" as const,
      title: target.title,
      subtitle: target.subtitle
    })),
    {
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.joystick,
      targetId: "dashboard:joystick",
      capability: "dashboard",
      title: "Joystick Control"
    },
    {
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.eventLog,
      targetId: "dashboard:event-log",
      capability: "dashboard",
      title: "Event Log"
    }
  ];
}

export function defaultConsoleDashboardLayout(targets: ConsoleDashboardTarget[]): PanelLayoutItem[] {
  const byKey = targetMap(targets);
  const specs: Array<{ panelId: ConsoleDashboardPanelId; targetId: string; x: number; y: number; w: number; h: number }> = [
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.telemetry, targetId: "dashboard:telemetry", x: 0, y: 0, w: 4, h: 4 },
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed, targetId: "camera:main", x: 4, y: 0, w: 8, h: 5 },
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.armSvg, targetId: "robot-arm:main", x: 0, y: 4, w: 4, h: 5 },
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.joystick, targetId: "dashboard:joystick", x: 4, y: 5, w: 4, h: 4 },
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.eventLog, targetId: "dashboard:event-log", x: 8, y: 5, w: 4, h: 4 }
  ];

  return specs
    .map((spec, order) => {
      const target = byKey.get(targetKey(spec.panelId, spec.targetId));
      if (!target) {
        return null;
      }
      return createLayoutItem(target, { ...spec, order });
    })
    .filter((item): item is PanelLayoutItem => item !== null);
}

export function mergeConsoleDashboardLayout(existing: PanelLayoutItem[], targets: ConsoleDashboardTarget[]): PanelLayoutItem[] {
  if (existing.length === 0) {
    return defaultConsoleDashboardLayout(targets);
  }

  const targetsByKey = targetMap(targets);
  return existing
    .filter((item) => isConsoleDashboardPanelId(item.panelId))
    .map((item, index) => sanitizeConsoleDashboardLayoutItem(item, targetsByKey.get(targetKey(item.panelId, item.targetId)), index))
    .sort((a, b) => a.order - b.order)
    .map((item, order) => ({ ...item, order }));
}

export function addConsoleDashboardPanel(existing: PanelLayoutItem[], target: ConsoleDashboardTarget): PanelLayoutItem[] {
  if (existing.some((item) => item.panelId === target.panelId && item.targetId === target.targetId)) {
    return existing;
  }
  const definition = CONSOLE_DASHBOARD_PANEL_DEFINITIONS[target.panelId];
  const y = existing.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  const next = createLayoutItem(target, {
    x: 0,
    y,
    w: definition.w,
    h: definition.h,
    order: existing.length
  });
  return [...existing, next];
}

export function removeConsoleDashboardPanel(existing: PanelLayoutItem[], itemId: string): PanelLayoutItem[] {
  return existing
    .filter((item) => item.id !== itemId)
    .sort((a, b) => a.order - b.order)
    .map((item, order) => ({ ...item, order }));
}

export function updateConsoleDashboardLayoutFromGrid(existing: PanelLayoutItem[], gridLayout: readonly ConsoleGridLayoutUpdateItem[]): PanelLayoutItem[] {
  const gridById = new Map(gridLayout.map((item) => [item.i, item]));
  return existing
    .map((item) => {
      const grid = gridById.get(item.id);
      return grid ? { ...item, x: grid.x, y: grid.y, w: grid.w, h: grid.h } : item;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x || a.order - b.order)
    .map((item, order) => ({ ...item, order }));
}

export function panelLayoutToGridItem(item: PanelLayoutItem): ConsoleGridLayoutItem {
  const definition = isConsoleDashboardPanelId(item.panelId) ? CONSOLE_DASHBOARD_PANEL_DEFINITIONS[item.panelId] : undefined;
  return {
    i: item.id,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
    ...(definition ? { minW: definition.minW, minH: definition.minH } : {})
  } as ConsoleGridLayoutItem;
}

export function isConsoleDashboardPanelId(panelId: string): panelId is ConsoleDashboardPanelId {
  return Object.values(CONSOLE_DASHBOARD_PANEL_IDS).includes(panelId as ConsoleDashboardPanelId);
}

export function targetKey(panelId: string, targetId: string): string {
  return `${panelId}::${targetId}`;
}

function targetMap(targets: ConsoleDashboardTarget[]): Map<string, ConsoleDashboardTarget> {
  return new Map(targets.map((target) => [targetKey(target.panelId, target.targetId), target]));
}

function createLayoutItem(
  target: ConsoleDashboardTarget,
  placement: { x: number; y: number; w: number; h: number; order: number }
): PanelLayoutItem {
  return {
    id: consoleDashboardLayoutItemId(target.panelId, target.targetId),
    scopeId: CONSOLE_DASHBOARD_SCOPE,
    panelId: target.panelId,
    targetId: target.targetId,
    capability: target.capability,
    title: target.title,
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    order: placement.order
  };
}

function sanitizeConsoleDashboardLayoutItem(item: PanelLayoutItem, target: ConsoleDashboardTarget | undefined, fallbackOrder: number): PanelLayoutItem {
  const panelId = isConsoleDashboardPanelId(item.panelId) ? item.panelId : CONSOLE_DASHBOARD_PANEL_IDS.telemetry;
  const definition = CONSOLE_DASHBOARD_PANEL_DEFINITIONS[panelId];
  return {
    ...item,
    id: item.id || consoleDashboardLayoutItemId(panelId, item.targetId || "dashboard:panel"),
    scopeId: CONSOLE_DASHBOARD_SCOPE,
    panelId,
    targetId: item.targetId || target?.targetId || "dashboard:panel",
    capability: target?.capability ?? item.capability ?? definition.capability,
    title: target?.title ?? (item.title || definition.title),
    x: clampInteger(item.x, 0, 11, 0),
    y: clampInteger(item.y, 0, 999, 0),
    w: clampInteger(item.w, definition.minW, 12, definition.w),
    h: clampInteger(item.h, definition.minH, 12, definition.h),
    order: clampInteger(item.order, 0, 999, fallbackOrder)
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}
