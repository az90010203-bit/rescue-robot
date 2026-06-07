import type { ChangeEvent } from "react";
import { isSupportedLanguage, type SupportedLanguage } from "../i18n/languages";
import { isServoBusModule, type ActiveModule, type AppSection, type ArchitectureSection, type ConnectionMode, type LogEntry, type LogValues, type TestPanel } from "./appModel";

interface UseAppNavigationOptions {
  activeModule: ActiveModule;
  activeTest: TestPanel;
  addSystemLog: (messageKey: string, level?: LogEntry["level"], values?: LogValues) => void;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  debugEnabled: boolean;
  disconnectSerial: () => Promise<void>;
  i18n: { changeLanguage: (language: string) => Promise<unknown> };
  sendDebugSet: (module: ActiveModule, enabled: boolean) => Promise<boolean>;
  serialRef: { current: unknown };
  setActiveModule: (module: ActiveModule) => void;
  setActiveSection: (section: AppSection) => void;
  setActiveTest: (panel: TestPanel) => void;
  setDebugEnabled: (enabled: boolean) => void;
}

export function useAppNavigation({
  activeModule,
  activeTest,
  addSystemLog,
  connected,
  connectionMode,
  debugEnabled,
  disconnectSerial,
  i18n,
  sendDebugSet,
  serialRef,
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

  function isArchitectureSection(section: AppSection): section is ArchitectureSection {
    return section === "plugins" || section === "components" || section === "robots";
  }

  function moduleForTestPanel(panel: TestPanel): ActiveModule | null {
    if (panel === "pi" || panel === "canServo") {
      return null;
    }
    if (panel === "arm" || panel === "arm3d") {
      return "arm";
    }
    if (panel === "driveCamera") {
      return "camera";
    }
    return panel;
  }

  function moduleForSection(section: AppSection): ActiveModule | null {
    if (section === "console") {
      return "camera";
    }
    if (isArchitectureSection(section)) {
      return activeModule;
    }
    if (section === "tests") {
      return moduleForTestPanel(activeTest);
    }
    return "mapping";
  }

  async function selectSection(section: AppSection) {
    setActiveSection(section);
    if (!isArchitectureSection(section)) {
      const module = moduleForSection(section);
      if (module) {
        await selectModule(module);
      }
    }
  }

  async function selectTestPanel(panel: TestPanel) {
    setActiveSection("tests");
    setActiveTest(panel);
    const module = moduleForTestPanel(panel);
    if (module) {
      await selectModule(module);
    }
  }

  async function toggleDebugMode() {
    if (isServoBusModule(activeModule)) {
      addSystemLog("logs.directBusHint");
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
    moduleForSection,
    moduleForTestPanel,
    selectModule,
    selectSection,
    selectTestPanel,
    setDebugMode,
    toggleDebugMode
  };
}
