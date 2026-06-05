import { Camera, Cpu, Gamepad2, Keyboard, Settings, SlidersHorizontal, Terminal } from "lucide-react";
import type { TFunction } from "i18next";
import type { AppSection, ComponentPanel, TestPanel } from "./appModel";

interface ContextTabsProps {
  activeComponent: ComponentPanel;
  activeModuleLabel: string;
  activeSection: AppSection;
  activeSectionLabel: string;
  activeTest: TestPanel;
  selectComponentPanel: (panel: ComponentPanel) => void;
  selectModule: (module: "mapping") => void;
  selectTestPanel: (panel: TestPanel) => void;
  t: TFunction;
}

export function ContextTabs({
  activeComponent,
  activeModuleLabel,
  activeSection,
  activeSectionLabel,
  activeTest,
  selectComponentPanel,
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
      {activeSection === "components" ? (
        <div className="context-tabs" role="tablist">
          <button className={activeComponent === "arm" ? "module-tab active" : "module-tab"} onClick={() => selectComponentPanel("arm")} type="button">
            <SlidersHorizontal size={17} />
            <span>{t("componentTabs.arm")}</span>
          </button>
          <button className={activeComponent === "drive" ? "module-tab active" : "module-tab"} onClick={() => selectComponentPanel("drive")} type="button">
            <Gamepad2 size={17} />
            <span>{t("componentTabs.drive")}</span>
          </button>
          <button className={activeComponent === "camera" ? "module-tab active" : "module-tab"} onClick={() => selectComponentPanel("camera")} type="button">
            <Camera size={17} />
            <span>{t("componentTabs.camera")}</span>
          </button>
        </div>
      ) : activeSection === "tests" ? (
        <div className="context-tabs" role="tablist">
          <button className={activeTest === "servo" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("servo")} type="button">
            <Settings size={17} />
            <span>{t("testTabs.servo")}</span>
          </button>
          <button className={activeTest === "motor" ? "module-tab active" : "module-tab"} onClick={() => selectTestPanel("motor")} type="button">
            <Cpu size={17} />
            <span>{t("testTabs.motor")}</span>
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
