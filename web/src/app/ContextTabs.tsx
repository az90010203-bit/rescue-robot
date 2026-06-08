import { Box, Camera, CircuitBoard, Cpu, Keyboard, Settings, SlidersHorizontal, Terminal } from "lucide-react";
import type { TFunction } from "i18next";
import type { AppSection, TestPanel } from "@app/appModel";

interface ContextTabsProps {
  activeModuleLabel: string;
  activeSection: AppSection;
  activeSectionLabel: string;
  activeTest: TestPanel;
  selectModule: (module: "mapping") => void;
  selectTestPanel: (panel: TestPanel) => void;
  t: TFunction;
}

export function ContextTabs({
  activeModuleLabel,
  activeSection,
  activeSectionLabel,
  activeTest,
  selectModule,
  selectTestPanel,
  t
}: ContextTabsProps) {
  if (activeSection === "console") {
    return null;
  }

  return (
    <section className="panel context-tabs-panel" aria-label={t("aria.contextTabs")}>
      <div className="context-tabs-title">
        <strong>{activeSectionLabel}</strong>
        <span>{activeModuleLabel}</span>
      </div>
      {activeSection === "tests" ? (
        <div className="context-tabs" role="tablist">
          <button className={activeTest === "servo" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("servo")} type="button">
            <Settings size={17} />
            <span>{t("testTabs.servo")}</span>
          </button>
          <button className={activeTest === "motor" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("motor")} type="button">
            <Cpu size={17} />
            <span>{t("testTabs.motor")}</span>
          </button>
          <button className={activeTest === "arm" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("arm")} type="button">
            <SlidersHorizontal size={17} />
            <span>{t("testTabs.arm")}</span>
          </button>
          <button className={activeTest === "arm3d" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("arm3d")} type="button">
            <Box size={17} />
            <span>{t("testTabs.arm3d")}</span>
          </button>
          <button className={activeTest === "driveCamera" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("driveCamera")} type="button">
            <Camera size={17} />
            <span>{t("testTabs.driveCamera")}</span>
          </button>
          <button className={activeTest === "canServo" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("canServo")} type="button">
            <CircuitBoard size={17} />
            <span>{t("testTabs.canServo")}</span>
          </button>
          <button className={activeTest === "pi" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("pi")} type="button">
            <Terminal size={17} />
            <span>{t("testTabs.pi")}</span>
          </button>
        </div>
      ) : (
        <div className="context-tabs" role="tablist">
          <button className="module-tab active" onClick={() => selectModule("mapping")} type="button">
            <Keyboard size={17} />
            <span>{t("settingsTabs.input")}</span>
          </button>
        </div>
      )}
    </section>
  );
}
