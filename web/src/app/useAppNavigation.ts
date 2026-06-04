import type { ChangeEvent } from "react";
import { isSupportedLanguage, type SupportedLanguage } from "../i18n/languages";
import { isServoBusModule, type ActiveModule, type AppSection, type ArchitectureSection, type ComponentPanel, type ConnectionMode, type TestPanel } from "./appModel";

interface UseAppNavigationOptions {
  activeComponent: ComponentPanel;
  activeModule: ActiveModule;
  activeTest: TestPanel;
  addLog: (direction: "rx" | "tx" | "system", text: string, level?: any, values?: any) => void;
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  debugEnabled: boolean;
  disconnectSerial: () => Promise<void>;
  i18n: { changeLanguage: (language: string) => Promise<unknown> };
  sendDebugSet: (module: ActiveModule, enabled: boolean) => Promise<boolean>;
  serialRef: { current: unknown };
  setActiveComponent: (panel: ComponentPanel) => void;
  setActiveModule: (module: ActiveModule) => void;
  setActiveSection: (section: AppSection) => void;
  setActiveTest: (panel: TestPanel) => void;
  setDebugEnabled: (enabled: boolean) => void;
}

export function useAppNavigation({
  activeComponent,
  activeModule,
  activeTest,
  addLog,
  addSystemLog,
  connected,
  connectionMode,
  debugEnabled,
  disconnectSerial,
  i18n,
  sendDebugSet,
  serialRef,
  setActiveComponent,
  setActiveModule,
  setActiveSection,
  setActiveTest,
  setDebugEnabled
}: UseAppNavigationOptions) {
  async function selectModule(module: ActiveModule) {
    const nextMode: ConnectionMode = isServoBusModule(module) ? "servo-bus" : "controller";
    if (connected && connectionMode && connectionMode !== nextMode) {
      await disconnectSerial();
    }
    setActiveModule(module);
    if (debugEnabled && module !== "mapping" && !isServoBusModule(module)) {
      await sendDebugSet(module, true);
    }
  }

  function moduleForComponentPanel(panel: ComponentPanel): ActiveModule {
    return panel === "arm" ? "arm" : "camera";
  }

  function isArchitectureSection(section: AppSection): section is ArchitectureSection {
    return section === "plugins" || section === "robots";
  }

  function moduleForSection(section: AppSection): ActiveModule {
    if (section === "console") {
      return "camera";
    }
    if (section === "components") {
      return moduleForComponentPanel(activeComponent);
    }
    if (isArchitectureSection(section)) {
      return activeModule;
    }
    if (section === "tests") {
      return "motor";
    }
    return "mapping";
  }

  async function selectSection(section: AppSection) {
    setActiveSection(section);
    if (!isArchitectureSection(section)) {
      await selectModule(moduleForSection(section));
    }
  }

  async function selectComponentPanel(panel: ComponentPanel) {
    setActiveSection("components");
    setActiveComponent(panel);
    await selectModule(moduleForComponentPanel(panel));
  }

  async function selectTestPanel(panel: TestPanel) {
    setActiveSection("tests");
    setActiveTest(panel);
    if (panel !== "pi") {
      await selectModule(panel);
    }
  }

  async function toggleDebugMode() {
    if (isServoBusModule(activeModule)) {
      addLog("system", "鑸垫満妯″潡宸叉敼涓?PC 鐩磋繛椋炵壒鎬荤嚎锛屼笉闇€瑕佽皟璇曟ā寮忓紑鍏?");
      return;
    }
    await setDebugMode(!debugEnabled, activeModule);
  }

  async function setDebugMode(enabled: boolean, module: ActiveModule) {
    if (isServoBusModule(module)) {
      return true;
    }
    if (enabled && (!serialRef.current || !connected)) {
      addSystemLog("logs.serialDisconnected", "warn");
      return false;
    }

    setDebugEnabled(enabled);
    const sent = await sendDebugSet(module, enabled);
    if (!sent && enabled) {
      setDebugEnabled(false);
    }
    return sent;
  }

  async function ensureDebugMode(module: ActiveModule) {
    if (debugEnabled) {
      return true;
    }
    return setDebugMode(true, module);
  }

  async function changeLanguage(event: ChangeEvent<HTMLSelectElement>) {
    const language = event.target.value as SupportedLanguage;
    if (!isSupportedLanguage(language)) {
      return;
    }
    await i18n.changeLanguage(language);
  }

  return {
    changeLanguage,
    ensureDebugMode,
    isArchitectureSection,
    moduleForComponentPanel,
    moduleForSection,
    selectComponentPanel,
    selectModule,
    selectSection,
    selectTestPanel,
    setDebugMode,
    toggleDebugMode
  };
}
