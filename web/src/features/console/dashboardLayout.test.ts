import { describe, expect, it } from "vitest";
import {
  CONSOLE_DASHBOARD_PANEL_IDS,
  addConsoleDashboardPanel,
  cameraDashboardTargetId,
  createConsoleDashboardTargets,
  defaultConsoleDashboardLayout,
  mergeConsoleDashboardLayout,
  removeConsoleDashboardPanel,
  updateConsoleDashboardLayoutFromGrid
} from "./dashboardLayout";
import type { PanelLayoutItem } from "../../platform/architecture";

const cameraSources = [
  { id: "main", label: "Main Camera", devicePath: "/dev/video0", port: 8080, streamUrl: "http://pi:8080/stream" },
  { id: "secondary", label: "Second Camera", devicePath: "/dev/video2", port: 8081, streamUrl: "http://pi:8081/stream" }
];

describe("console dashboard layout", () => {
  it("generates the default five-panel dashboard", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = defaultConsoleDashboardLayout(targets);

    expect(layout.map((item) => [item.panelId, item.targetId])).toEqual([
      [CONSOLE_DASHBOARD_PANEL_IDS.telemetry, "dashboard:telemetry"],
      [CONSOLE_DASHBOARD_PANEL_IDS.cameraFeed, "camera:main"],
      [CONSOLE_DASHBOARD_PANEL_IDS.armSvg, "robot-arm:main"],
      [CONSOLE_DASHBOARD_PANEL_IDS.joystick, "dashboard:joystick"],
      [CONSOLE_DASHBOARD_PANEL_IDS.eventLog, "dashboard:event-log"]
    ]);
    expect(layout.every((item) => item.scopeId === "console:main")).toBe(true);
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
      { i: layout[3].id, x: 4, y: 4, w: 4, h: 4 },
      { i: layout[4].id, x: 8, y: 4, w: 4, h: 4 }
    ]);

    expect(updated[0]).toMatchObject({ id: layout[1].id, x: 0, y: 0, w: 6, h: 4, order: 0 });
    expect(updated[1]).toMatchObject({ id: layout[0].id, x: 6, y: 0, w: 6, h: 3, order: 1 });
  });

  it("keeps missing targets instead of removing panels", () => {
    const targets = createConsoleDashboardTargets(cameraSources);
    const layout = addConsoleDashboardPanel(defaultConsoleDashboardLayout(targets), targets.find((target) => target.targetId === "camera:secondary")!);
    const merged = mergeConsoleDashboardLayout(layout, createConsoleDashboardTargets([cameraSources[0]]));

    expect(merged.some((item) => item.targetId === "camera:secondary")).toBe(true);
    expect(merged.find((item) => item.targetId === "camera:secondary")?.title).toBe("Second Camera");
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
