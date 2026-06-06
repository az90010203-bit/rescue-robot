import { describe, expect, it, vi } from "vitest";
import type { ActiveModule, AppSection, ConnectionMode, TestPanel } from "./appModel";
import { useAppNavigation } from "./useAppNavigation";

function createNavigation(options: {
  activeModule?: ActiveModule;
  activeTest?: TestPanel;
  connected?: boolean;
  connectionMode?: ConnectionMode | null;
  debugEnabled?: boolean;
} = {}) {
  const sections: AppSection[] = [];
  const modules: ActiveModule[] = [];
  const tests: TestPanel[] = [];
  const disconnectSerial = vi.fn(async () => {});
  const sendDebugSet = vi.fn(async () => true);

  const navigation = useAppNavigation({
    activeModule: options.activeModule ?? "camera",
    activeTest: options.activeTest ?? "servo",
    addLog: vi.fn(),
    addSystemLog: vi.fn(),
    connected: options.connected ?? false,
    connectionMode: options.connectionMode ?? null,
    debugEnabled: options.debugEnabled ?? false,
    disconnectSerial,
    i18n: { changeLanguage: vi.fn(async () => {}) },
    sendDebugSet,
    serialRef: { current: null },
    setActiveModule: (module) => modules.push(module),
    setActiveSection: (section) => sections.push(section),
    setActiveTest: (panel) => tests.push(panel),
    setDebugEnabled: vi.fn()
  });

  return { disconnectSerial, modules, navigation, sections, sendDebugSet, tests };
}

describe("useAppNavigation", () => {
  it("keeps the components top-level section in the three-layer workspace", async () => {
    const { modules, navigation, sections } = createNavigation({ activeModule: "arm" });

    await navigation.selectSection("components");

    expect(sections).toEqual(["components"]);
    expect(modules).toEqual([]);
  });

  it.each([
    ["servo", "servo"],
    ["motor", "motor"],
    ["arm", "arm"],
    ["driveCamera", "camera"]
  ] as Array<[TestPanel, ActiveModule]>)("selects %s when opening the tests section", async (activeTest, expectedModule) => {
    const { modules, navigation, sections } = createNavigation({ activeTest });

    await navigation.selectSection("tests");

    expect(sections).toEqual(["tests"]);
    expect(modules).toEqual([expectedModule]);
  });

  it("does not switch hardware modules when opening tests on the Pi panel", async () => {
    const { modules, navigation, sections } = createNavigation({ activeModule: "camera", activeTest: "pi" });

    await navigation.selectSection("tests");

    expect(sections).toEqual(["tests"]);
    expect(modules).toEqual([]);
  });

  it.each([
    ["arm", "arm"],
    ["driveCamera", "camera"]
  ] as Array<[TestPanel, ActiveModule]>)("routes the %s test tab to its runtime module", async (panel, expectedModule) => {
    const { modules, navigation, sections, tests } = createNavigation();

    await navigation.selectTestPanel(panel);

    expect(sections).toEqual(["tests"]);
    expect(tests).toEqual([panel]);
    expect(modules).toEqual([expectedModule]);
  });

  it("leaves the current hardware module alone for the Pi remote tab", async () => {
    const { modules, navigation, sections, tests } = createNavigation({ activeModule: "motor" });

    await navigation.selectTestPanel("pi");

    expect(sections).toEqual(["tests"]);
    expect(tests).toEqual(["pi"]);
    expect(modules).toEqual([]);
  });
});
