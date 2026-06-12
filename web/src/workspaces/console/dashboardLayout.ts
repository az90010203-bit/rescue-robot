import type { CameraVideoSource } from "@adapters/persistence/storage";
import type { PanelLayoutItem } from "@platform/architecture";

export const CONSOLE_DASHBOARD_SCOPE = "console:main";

export function consoleDashboardScopeForRobot(robotId: string): string {
  const cleanRobotId = robotId.trim();
  return cleanRobotId ? `console:robot:${cleanRobotId}` : CONSOLE_DASHBOARD_SCOPE;
}

export const CONSOLE_DASHBOARD_PANEL_IDS = {
  cameraFeed: "console.camera-feed",
  armSvg: "console.arm-svg",
  telemetry: "console.telemetry",
  attitude: "console.attitude",
  joystick: "console.joystick",
  eventLog: "console.event-log"
} as const;

export type ConsoleDashboardPanelId = (typeof CONSOLE_DASHBOARD_PANEL_IDS)[keyof typeof CONSOLE_DASHBOARD_PANEL_IDS];
export type ConsoleDashboardCapability = PanelLayoutItem["capability"];
export type ConsoleDashboardCardSize = "large" | "medium" | "small";

export interface ConsoleDashboardVisibleItemDefinition {
  id: string;
  labelKey: string;
  defaultVisible: boolean;
}

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

export const CONSOLE_DASHBOARD_VISIBLE_ITEM_DEFINITIONS: Partial<Record<ConsoleDashboardPanelId, readonly ConsoleDashboardVisibleItemDefinition[]>> = {
  [CONSOLE_DASHBOARD_PANEL_IDS.telemetry]: [
    { id: "voltage", labelKey: "metrics.voltage", defaultVisible: true },
    { id: "current", labelKey: "metrics.current", defaultVisible: true },
    { id: "temp", labelKey: "metrics.temp", defaultVisible: true },
    { id: "serial", labelKey: "metrics.serial", defaultVisible: true },
    { id: "drive", labelKey: "metrics.drive", defaultVisible: true },
    { id: "activeBase", labelKey: "metrics.activeBase", defaultVisible: true },
    { id: "servoCount", labelKey: "metrics.servoCount", defaultVisible: false },
    { id: "motorCount", labelKey: "metrics.motorCount", defaultVisible: false },
    { id: "moving", labelKey: "metrics.moving", defaultVisible: false },
    { id: "gamepad", labelKey: "metrics.gamepad", defaultVisible: false }
  ],
  [CONSOLE_DASHBOARD_PANEL_IDS.attitude]: [
    { id: "roll", labelKey: "metrics.roll", defaultVisible: true },
    { id: "pitch", labelKey: "metrics.pitch", defaultVisible: true },
    { id: "yaw", labelKey: "metrics.yaw", defaultVisible: true },
    { id: "imuStatus", labelKey: "metrics.imuStatus", defaultVisible: true },
    { id: "imuCalibration", labelKey: "metrics.imuCalibration", defaultVisible: true },
    { id: "lastFeedback", labelKey: "metrics.lastFeedback", defaultVisible: true },
    { id: "rawMag", labelKey: "metrics.rawMag", defaultVisible: false },
    { id: "gyroDps", labelKey: "metrics.gyroDps", defaultVisible: false },
    { id: "mpuWhoAmI", labelKey: "metrics.mpuWhoAmI", defaultVisible: false },
    { id: "istWhoAmI", labelKey: "metrics.istWhoAmI", defaultVisible: false }
  ],
  [CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed]: [
    { id: "videoLatency", labelKey: "metrics.videoLatency", defaultVisible: true },
    { id: "networkRtt", labelKey: "metrics.networkRtt", defaultVisible: true },
    { id: "sourceDevicePath", labelKey: "fields.sourceDevicePath", defaultVisible: false },
    { id: "sourcePort", labelKey: "fields.sourcePort", defaultVisible: false }
  ]
};

export const CONSOLE_DASHBOARD_PANEL_DEFINITIONS: Record<ConsoleDashboardPanelId, ConsolePanelDefinition> = {
  [CONSOLE_DASHBOARD_PANEL_IDS.telemetry]: {
    panelId: CONSOLE_DASHBOARD_PANEL_IDS.telemetry,
    capability: "dashboard",
    title: "Telemetry",
    w: 4,
    h: 3,
    minW: 3,
    minH: 3
  },
  [CONSOLE_DASHBOARD_PANEL_IDS.attitude]: {
    panelId: CONSOLE_DASHBOARD_PANEL_IDS.attitude,
    capability: "dashboard",
    title: "Attitude",
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

export function consoleDashboardLayoutItemId(panelId: ConsoleDashboardPanelId, targetId: string, scopeId = CONSOLE_DASHBOARD_SCOPE): string {
  return `${scopeId}:${targetId}:${panelId}`;
}

export function createConsoleDashboardTargets(
  cameraSources: CameraVideoSource[],
  armTargets: ConsoleArmTarget[] = [],
  options: { includeProjectArm?: boolean } = {}
): ConsoleDashboardTarget[] {
  const includeProjectArm = options.includeProjectArm ?? true;
  return [
    {
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.telemetry,
      targetId: "dashboard:telemetry",
      capability: "dashboard",
      title: "Robot Telemetry"
    },
    {
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.attitude,
      targetId: "dashboard:attitude",
      capability: "dashboard",
      title: "Attitude"
    },
    ...cameraSources.map((source) => ({
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed,
      targetId: cameraDashboardTargetId(source.id),
      capability: "camera" as const,
      title: source.label,
      subtitle: source.streamUrl
    })),
    ...(includeProjectArm
      ? [{
          panelId: CONSOLE_DASHBOARD_PANEL_IDS.armSvg,
          targetId: "robot-arm:main",
          capability: "robot-arm" as const,
          title: "Main Arm",
          subtitle: "Current console arm"
        }]
      : []),
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

export function defaultConsoleDashboardLayout(targets: ConsoleDashboardTarget[], scopeId = CONSOLE_DASHBOARD_SCOPE): PanelLayoutItem[] {
  const byKey = targetMap(targets);
  const armTargetId = byKey.has(targetKey(CONSOLE_DASHBOARD_PANEL_IDS.armSvg, "robot-arm:main"))
    ? "robot-arm:main"
    : targets.find((target) => target.panelId === CONSOLE_DASHBOARD_PANEL_IDS.armSvg)?.targetId ?? "";
  const specs: Array<{ panelId: ConsoleDashboardPanelId; targetId: string; x: number; y: number; w: number; h: number }> = [
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.telemetry, targetId: "dashboard:telemetry", x: 0, y: 0, w: 4, h: 3 },
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.attitude, targetId: "dashboard:attitude", x: 0, y: 3, w: 4, h: 4 },
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed, targetId: "camera:main", x: 4, y: 0, w: 8, h: 5 },
    ...(armTargetId ? [{ panelId: CONSOLE_DASHBOARD_PANEL_IDS.armSvg, targetId: armTargetId, x: 0, y: 7, w: 4, h: 5 }] : []),
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.joystick, targetId: "dashboard:joystick", x: 4, y: 5, w: 4, h: 4 },
    { panelId: CONSOLE_DASHBOARD_PANEL_IDS.eventLog, targetId: "dashboard:event-log", x: 8, y: 5, w: 4, h: 4 }
  ];

  return specs
    .map((spec, order) => {
      const target = byKey.get(targetKey(spec.panelId, spec.targetId));
      if (!target) {
        return null;
      }
      return createLayoutItem(target, { ...spec, order }, scopeId);
    })
    .filter((item): item is PanelLayoutItem => item !== null);
}

export function mergeConsoleDashboardLayout(existing: PanelLayoutItem[], targets: ConsoleDashboardTarget[], scopeId = CONSOLE_DASHBOARD_SCOPE): PanelLayoutItem[] {
  if (existing.length === 0) {
    return defaultConsoleDashboardLayout(targets, scopeId);
  }

  const targetsByKey = targetMap(targets);
  const sanitized = existing
    .filter((item) => isConsoleDashboardPanelId(item.panelId))
    .map((item, index) => sanitizeConsoleDashboardLayoutItem(item, targetsByKey.get(targetKey(item.panelId, item.targetId)), index, scopeId))
    .sort((a, b) => a.order - b.order)
    .map((item, order) => ({ ...item, order }));
  return appendRequiredConsoleDashboardPanels(compactLegacyDefaultConsoleDashboardLayout(sanitized), targets, scopeId);
}

export function addConsoleDashboardPanel(existing: PanelLayoutItem[], target: ConsoleDashboardTarget, scopeId = existing[0]?.scopeId ?? CONSOLE_DASHBOARD_SCOPE): PanelLayoutItem[] {
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
  }, scopeId);
  return [...existing, next];
}

export function removeConsoleDashboardPanel(existing: PanelLayoutItem[], itemId: string): PanelLayoutItem[] {
  return existing
    .filter((item) => item.id !== itemId)
    .sort((a, b) => a.order - b.order)
    .map((item, order) => ({ ...item, order }));
}

export function updateConsoleDashboardVisibleItems(existing: PanelLayoutItem[], itemId: string, visibleItemIds: string[]): PanelLayoutItem[] {
  return existing.map((item, index) =>
    item.id === itemId ? sanitizeConsoleDashboardLayoutItem({ ...item, visibleItemIds }, undefined, index) : item
  );
}

export function updateConsoleDashboardLayoutFromGrid(existing: PanelLayoutItem[], gridLayout: readonly ConsoleGridLayoutUpdateItem[]): PanelLayoutItem[] {
  const gridById = new Map(gridLayout.map((item) => [item.i, item]));
  return existing
    .map((item, index) => {
      const grid = gridById.get(item.id);
      const nextItem = grid ? { ...item, x: grid.x, y: grid.y, w: grid.w, h: grid.h } : item;
      return sanitizeConsoleDashboardLayoutItem(nextItem, undefined, index);
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

export function consoleDashboardVisibleItemDefinitions(panelId: string): readonly ConsoleDashboardVisibleItemDefinition[] {
  return isConsoleDashboardPanelId(panelId) ? CONSOLE_DASHBOARD_VISIBLE_ITEM_DEFINITIONS[panelId] ?? [] : [];
}

export function defaultConsoleDashboardVisibleItemIds(panelId: string): string[] {
  return consoleDashboardVisibleItemDefinitions(panelId)
    .filter((definition) => definition.defaultVisible)
    .map((definition) => definition.id);
}

export function sanitizeConsoleDashboardVisibleItemIds(panelId: string, value: unknown): string[] | undefined {
  const definitions = consoleDashboardVisibleItemDefinitions(panelId);
  if (definitions.length === 0) {
    return undefined;
  }
  const validIds = new Set(definitions.map((definition) => definition.id));
  const selectedIds = Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && validIds.has(item))))
    : [];
  const orderedIds = definitions.map((definition) => definition.id).filter((id) => selectedIds.includes(id));
  return orderedIds.length > 0 ? orderedIds : defaultConsoleDashboardVisibleItemIds(panelId);
}

export function consoleDashboardCardSize(item: Pick<PanelLayoutItem, "h" | "w">): ConsoleDashboardCardSize {
  const area = item.w * item.h;
  if (item.w <= 3 || item.h <= 3 || area <= 12) {
    return "small";
  }
  if (item.w <= 5 || item.h <= 4 || area <= 24) {
    return "medium";
  }
  return "large";
}

export function consoleDashboardVisibleItemLimit(item: Pick<PanelLayoutItem, "h" | "panelId" | "w">): number {
  const size = consoleDashboardCardSize(item);
  if (size === "small") {
    return item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed ? 2 : 4;
  }
  if (size === "medium") {
    return item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed ? 3 : 6;
  }
  return Number.MAX_SAFE_INTEGER;
}

export function consoleDashboardSelectedVisibleItemIds(item: Pick<PanelLayoutItem, "panelId" | "visibleItemIds">): string[] {
  return sanitizeConsoleDashboardVisibleItemIds(item.panelId, item.visibleItemIds) ?? [];
}

export function consoleDashboardRenderedVisibleItemIds(item: Pick<PanelLayoutItem, "h" | "panelId" | "visibleItemIds" | "w">): string[] {
  return consoleDashboardSelectedVisibleItemIds(item).slice(0, consoleDashboardVisibleItemLimit(item));
}

export function consoleDashboardHiddenVisibleItemCount(item: Pick<PanelLayoutItem, "h" | "panelId" | "visibleItemIds" | "w">): number {
  const selectedCount = consoleDashboardSelectedVisibleItemIds(item).length;
  return Math.max(0, selectedCount - consoleDashboardRenderedVisibleItemIds(item).length);
}

export function targetKey(panelId: string, targetId: string): string {
  return `${panelId}::${targetId}`;
}

function targetMap(targets: ConsoleDashboardTarget[]): Map<string, ConsoleDashboardTarget> {
  return new Map(targets.map((target) => [targetKey(target.panelId, target.targetId), target]));
}

function createLayoutItem(
  target: ConsoleDashboardTarget,
  placement: { x: number; y: number; w: number; h: number; order: number },
  scopeId = CONSOLE_DASHBOARD_SCOPE
): PanelLayoutItem {
  const visibleItemIds = defaultConsoleDashboardVisibleItemIds(target.panelId);
  return {
    id: consoleDashboardLayoutItemId(target.panelId, target.targetId, scopeId),
    scopeId,
    panelId: target.panelId,
    targetId: target.targetId,
    capability: target.capability,
    title: target.title,
    ...(visibleItemIds.length > 0 ? { visibleItemIds } : {}),
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    order: placement.order
  };
}

function appendRequiredConsoleDashboardPanels(existing: PanelLayoutItem[], targets: ConsoleDashboardTarget[], scopeId: string): PanelLayoutItem[] {
  const attitudeTarget = targets.find((target) => target.panelId === CONSOLE_DASHBOARD_PANEL_IDS.attitude && target.targetId === "dashboard:attitude");
  if (!attitudeTarget || existing.some((item) => item.panelId === attitudeTarget.panelId && item.targetId === attitudeTarget.targetId)) {
    return existing;
  }
  return addConsoleDashboardPanel(existing, attitudeTarget, scopeId);
}

function compactLegacyDefaultConsoleDashboardLayout(items: PanelLayoutItem[]): PanelLayoutItem[] {
  const telemetry = items.find((item) => item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.telemetry && item.targetId === "dashboard:telemetry");
  if (!telemetry || telemetry.x !== 0 || telemetry.y !== 0 || telemetry.w !== 4 || telemetry.h !== 4) {
    return items;
  }

  return items.map((item) => {
    if (item.id === telemetry.id) {
      return { ...item, h: 3 };
    }
    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.attitude && item.targetId === "dashboard:attitude" && item.x === 0 && item.y === 4 && item.w === 4) {
      return { ...item, y: 3 };
    }
    if (item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.armSvg && item.x === 0 && item.y === 8 && item.w === 4) {
      return { ...item, y: 7 };
    }
    return item;
  });
}

function sanitizeConsoleDashboardLayoutItem(item: PanelLayoutItem, target: ConsoleDashboardTarget | undefined, fallbackOrder: number, scopeId = item.scopeId || CONSOLE_DASHBOARD_SCOPE): PanelLayoutItem {
  const panelId = isConsoleDashboardPanelId(item.panelId) ? item.panelId : CONSOLE_DASHBOARD_PANEL_IDS.telemetry;
  const definition = CONSOLE_DASHBOARD_PANEL_DEFINITIONS[panelId];
  const w = clampInteger(item.w, definition.minW, 12, definition.w);
  const x = clampInteger(item.x, 0, 12 - w, 0);
  const visibleItemIds = sanitizeConsoleDashboardVisibleItemIds(panelId, item.visibleItemIds);
  const layoutItem = { ...item };
  delete layoutItem.visibleItemIds;
  const targetId = item.targetId || target?.targetId || "dashboard:panel";
  const shouldRewriteId = !item.id || item.scopeId !== scopeId;
  return {
    ...layoutItem,
    id: shouldRewriteId ? consoleDashboardLayoutItemId(panelId, targetId, scopeId) : item.id,
    scopeId,
    panelId,
    targetId,
    capability: target?.capability ?? item.capability ?? definition.capability,
    title: target?.title ?? (item.title || definition.title),
    ...(visibleItemIds ? { visibleItemIds } : {}),
    x,
    y: clampInteger(item.y, 0, 999, 0),
    w,
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
