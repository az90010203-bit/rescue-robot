import { describe, expect, it } from "vitest";
import {
  CONSOLE_DASHBOARD_PANEL_IDS,
  addConsoleDashboardPanel,
  cameraDashboardTargetId,
  consoleDashboardLayoutItemId,
  consoleDashboardScopeForRobot,
  consoleDashboardHiddenVisibleItemCount,
  consoleDashboardRenderedVisibleItemIds,
  createConsoleDashboardTargets,
  defaultConsoleDashboardLayout,
  defaultConsoleDashboardVisibleItemIds,
  mergeConsoleDashboardLayout,
  removeConsoleDashboardPanel,
  updateConsoleDashboardLayoutFromGrid,
  updateConsoleDashboardVisibleItems
} from "./dashboardLayout";
import type { PanelLayoutItem } from "../../platform/architecture";

const cameraSources = [
  { id: "main", label: "Main Camera", devicePath: "/dev/video0", port: 8080, streamUrl: "http://pi:8080/stream" },
  { id: "secondary", label: "Second Camera", devicePath: "/dev/video2", port: 8081, streamUrl: "http://pi:8081/stream" }
];

describe("console dashboard layout", () => {
  it("generates the default six-panel dashboard", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = defaultConsoleDashboardLayout(targets);

    expect(layout.map((item) => [item.panelId, item.targetId])).toEqual([
      [CONSOLE_DASHBOARD_PANEL_IDS.telemetry, "dashboard:telemetry"],
      [CONSOLE_DASHBOARD_PANEL_IDS.attitude, "dashboard:attitude"],
      [CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed, "camera:main"],
      [CONSOLE_DASHBOARD_PANEL_IDS.armSvg, "robot-arm:main"],
      [CONSOLE_DASHBOARD_PANEL_IDS.joystick, "dashboard:joystick"],
      [CONSOLE_DASHBOARD_PANEL_IDS.eventLog, "dashboard:event-log"]
    ]);
    expect(layout.every((item) => item.scopeId === "console:main")).toBe(true);
  });

  it("generates robot-scoped dashboards", () => {
    const robotScope = consoleDashboardScopeForRobot("robot 1");
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = defaultConsoleDashboardLayout(targets, robotScope);

    expect(robotScope).toBe("console:robot:robot 1");
    expect(layout.every((item) => item.scopeId === robotScope)).toBe(true);
    expect(layout[0].id).toBe(consoleDashboardLayoutItemId(CONSOLE_DASHBOARD_PANEL_IDS.telemetry, "dashboard:telemetry", robotScope));
  });

  it("rewrites legacy project dashboard items when adopted by a robot console", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const legacyLayout = defaultConsoleDashboardLayout(targets);
    const robotScope = consoleDashboardScopeForRobot("robot-a");
    const merged = mergeConsoleDashboardLayout(legacyLayout, targets, robotScope);

    expect(merged.every((item) => item.scopeId === robotScope)).toBe(true);
    expect(merged[0].id.startsWith(`${robotScope}:`)).toBe(true);
  });

  it("adds two camera panels with different targets", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const secondaryTarget = targets.find((target) => target.targetId === cameraDashboardTargetId("secondary"))!;
    const first = defaultConsoleDashboardLayout(targets);
    const next = addConsoleDashboardPanel(first, secondaryTarget);

    expect(next.filter((item) => item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed).map((item) => item.targetId)).toEqual([
      "camera:main",
      "camera:secondary"
    ]);
  });

  it("keeps resized and dragged grid coordinates", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = defaultConsoleDashboardLayout(targets);
    const updated = updateConsoleDashboardLayoutFromGrid(layout, [
      { i: layout[1].id, x: 0, y: 0, w: 6, h: 4 },
      { i: layout[0].id, x: 6, y: 0, w: 6, h: 3 },
      { i: layout[2].id, x: 0, y: 4, w: 4, h: 5 },
      { i: layout[3].id, x: 0, y: 9, w: 4, h: 5 },
      { i: layout[4].id, x: 4, y: 4, w: 4, h: 4 },
      { i: layout[5].id, x: 8, y: 4, w: 4, h: 4 }
    ]);

    expect(updated[0]).toMatchObject({ id: layout[1].id, x: 0, y: 0, w: 6, h: 4, order: 0 });
    expect(updated[1]).toMatchObject({ id: layout[0].id, x: 6, y: 0, w: 6, h: 3, order: 1 });
    expect(updated.every((item) => item.x + item.w <= 12)).toBe(true);
  });

  it("keeps selected visible parameters after dragging and resizing", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = defaultConsoleDashboardLayout(targets);
    const configured = updateConsoleDashboardVisibleItems(layout, layout[0].id, ["voltage", "gamepad", "missing"]);
    const updated = updateConsoleDashboardLayoutFromGrid(configured, [
      { i: layout[0].id, x: 5, y: 1, w: 6, h: 4 }
    ]);

    expect(configured[0].visibleItemIds).toEqual(["voltage", "gamepad"]);
    expect(updated.find((item) => item.id === layout[0].id)).toMatchObject({
      x: 5,
      y: 1,
      w: 6,
      h: 4,
      visibleItemIds: ["voltage", "gamepad"]
    });
  });

  it("keeps grid updates inside the twelve-column dashboard", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = defaultConsoleDashboardLayout(targets);
    const updated = updateConsoleDashboardLayoutFromGrid(layout, [
      { i: layout[0].id, x: 10, y: 0, w: 6, h: 1 },
      { i: layout[2].id, x: 11, y: 1, w: 20, h: 2 }
    ]);

    expect(updated.find((item) => item.id === layout[0].id)).toMatchObject({ x: 6, w: 6, h: 3 });
    expect(updated.find((item) => item.id === layout[2].id)).toMatchObject({ x: 0, w: 12, h: 3 });
    expect(updated.every((item) => item.x + item.w <= 12)).toBe(true);
  });

  it("keeps missing targets instead of removing panels", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = addConsoleDashboardPanel(defaultConsoleDashboardLayout(targets), targets.find((target) => target.targetId === "camera:secondary")!);
    const merged = mergeConsoleDashboardLayout(layout, createConsoleDashboardTargets([cameraSources[0]]));

    expect(merged.some((item) => item.targetId === "camera:secondary")).toBe(true);
    expect(merged.find((item) => item.targetId === "camera:secondary")?.title).toBe("Second Camera");
  });

  it("sanitizes saved legacy layouts that overflow the dashboard grid", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const legacyLayout = defaultConsoleDashboardLayout(targets).map((item, index) =>
      index === 0 ? { ...item, x: 11, w: 8, h: 1 } : item
    );
    const merged = mergeConsoleDashboardLayout(legacyLayout, targets);

    expect(merged.find((item) => item.id === legacyLayout[0].id)).toMatchObject({ x: 4, w: 8, h: 3 });
    expect(merged.every((item) => item.x + item.w <= 12)).toBe(true);
  });

  it("appends the attitude panel to saved legacy layouts", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const legacyLayout = defaultConsoleDashboardLayout(targets).filter((item) => item.panelId !== CONSOLE_DASHBOARD_PANEL_IDS.attitude);
    const merged = mergeConsoleDashboardLayout(legacyLayout, targets);

    expect(merged.map((item) => [item.panelId, item.targetId])).toContainEqual([
      CONSOLE_DASHBOARD_PANEL_IDS.attitude,
      "dashboard:attitude"
    ]);
    expect(merged[merged.length - 1]).toMatchObject({
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.attitude,
      targetId: "dashboard:attitude",
      y: expect.any(Number)
    });
  });

  it("adds default visible parameters to saved legacy dashboard cards", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const legacyLayout = defaultConsoleDashboardLayout(targets).map((item) => {
      const next = { ...item };
      delete next.visibleItemIds;
      return next;
    });
    const merged = mergeConsoleDashboardLayout(legacyLayout, targets);

    expect(merged.find((item) => item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.telemetry)?.visibleItemIds).toEqual(
      defaultConsoleDashboardVisibleItemIds(CONSOLE_DASHBOARD_PANEL_IDS.telemetry)
    );
    expect(merged.find((item) => item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.attitude)?.visibleItemIds).toEqual(
      defaultConsoleDashboardVisibleItemIds(CONSOLE_DASHBOARD_PANEL_IDS.attitude)
    );
    expect(merged.find((item) => item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed)?.visibleItemIds).toEqual(
      defaultConsoleDashboardVisibleItemIds(CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed)
    );
    expect(merged.find((item) => item.panelId === CONSOLE_DASHBOARD_PANEL_IDS.armSvg)?.visibleItemIds).toBeUndefined();
  });

  it("limits visible parameters by dashboard card size", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const telemetry = updateConsoleDashboardVisibleItems(defaultConsoleDashboardLayout(targets), "console:main:dashboard:telemetry:console.telemetry", [
      "voltage",
      "current",
      "temp",
      "serial",
      "drive",
      "activeBase",
      "servoCount",
      "motorCount",
      "moving",
      "gamepad"
    ])[0];

    const small = { ...telemetry, w: 3, h: 3 };
    const medium = { ...telemetry, w: 5, h: 4 };
    const large = { ...telemetry, w: 8, h: 5 };

    expect(consoleDashboardRenderedVisibleItemIds(small)).toEqual(["voltage", "current", "temp", "serial"]);
    expect(consoleDashboardHiddenVisibleItemCount(small)).toBe(6);
    expect(consoleDashboardRenderedVisibleItemIds(medium)).toEqual(["voltage", "current", "temp", "serial", "drive", "activeBase"]);
    expect(consoleDashboardHiddenVisibleItemCount(medium)).toBe(4);
    expect(consoleDashboardRenderedVisibleItemIds(large)).toHaveLength(10);
    expect(consoleDashboardHiddenVisibleItemCount(large)).toBe(0);
  });

  it("accepts dashboard capability in panel layouts", () => {
    const item: PanelLayoutItem = {
      id: "custom",
      scopeId: "console:main",
      panelId: CONSOLE_DASHBOARD_PANEL_IDS.telemetry,
      targetId: "dashboard:telemetry",
      capability: "dashboard",
      title: "Telemetry",
      x: 0,
      y: 0,
      w: 4,
      h: 3,
      order: 0
    };

    expect(removeConsoleDashboardPanel([item], "missing")).toEqual([item]);
  });
});
