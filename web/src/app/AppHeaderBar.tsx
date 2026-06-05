import { Activity, Bot, Boxes, Cable, Cpu, Gauge, Languages, ListPlus, Settings, Unplug, Usb } from "lucide-react";
import type { ChangeEvent } from "react";
import type { TFunction } from "i18next";
import type { DataProject } from "../lib/dataService";
import { supportedLanguages, type SupportedLanguage } from "../i18n/languages";
import { StatusCard } from "../shared/ui/AppChrome";
import {
  databaseStatusTone,
  isServoBusModule,
  type ActiveModule,
  type AppSection,
  type DatabaseSaveStatus
} from "./appModel";

interface AppHeaderBarProps {
  activeModule: ActiveModule;
  activeModuleLabel: string;
  activeSection: AppSection;
  changeCurrentProject: (projectId: string) => Promise<void>;
  changeLanguage: (event: ChangeEvent<HTMLSelectElement>) => void | Promise<void>;
  connectSerial: () => void | Promise<void>;
  connected: boolean;
  createNewProject: () => Promise<void>;
  currentLanguage: SupportedLanguage;
  currentProject: DataProject | null;
  databaseDetailValue: string;
  databaseStatus: DatabaseSaveStatus;
  databaseStatusValue: string;
  debugEnabled: boolean;
  debugLabel: string;
  disconnectSerial: () => void | Promise<void>;
  newProjectName: string;
  projectStatusValue: string;
  projects: DataProject[];
  selectSection: (section: AppSection) => void | Promise<void>;
  setNewProjectName: (value: string) => void;
  t: TFunction;
  toggleDebugMode: () => void | Promise<void>;
  webSerialAvailable: boolean;
}

export function AppHeaderBar({
  activeModule,
  activeModuleLabel,
  activeSection,
  changeCurrentProject,
  changeLanguage,
  connectSerial,
  connected,
  createNewProject,
  currentLanguage,
  currentProject,
  databaseDetailValue,
  databaseStatus,
  databaseStatusValue,
  debugEnabled,
  debugLabel,
  disconnectSerial,
  newProjectName,
  projectStatusValue,
  projects,
  selectSection,
  setNewProjectName,
  t,
  toggleDebugMode,
  webSerialAvailable
}: AppHeaderBarProps) {
  return (
    <>
      <header className="topbar glass-surface">
        <div className="brand-block">
          <span className="brand-mark">RR</span>
          <div className="brand-copy">
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
            <p className="system-line">
              {isServoBusModule(activeModule) ? `USB Serial · 1000000 baud · ${activeModuleLabel}` : t("app.systemLine", { module: activeModuleLabel })}
            </p>
          </div>
        </div>
        <div className="system-strip" aria-label={t("aria.systemStatus")}>
          <StatusCard label={t("status.serialLink")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
          <StatusCard label={t("status.debugMode")} value={debugLabel} tone={debugEnabled ? "warning" : "neutral"} />
          <StatusCard label={t("database.label")} value={databaseStatusValue} tone={databaseStatusTone(databaseStatus)} />
          <StatusCard label={t("database.project")} value={projectStatusValue} tone={currentProject ? "online" : "warning"} />
          <StatusCard label={t("database.lastSave")} value={databaseDetailValue} tone={databaseStatusTone(databaseStatus)} />
          <StatusCard label={t("status.module")} value={sectionStatusValue(activeSection, t)} tone="neutral" />
        </div>
      </header>

      <section className="control-bar glass-surface" aria-label={t("aria.connectionControls")}>
        <div className="control-actions">
          <button className="icon-button primary" onClick={connected ? disconnectSerial : connectSerial} type="button">
            {connected ? <Unplug size={18} /> : <Usb size={18} />}
            <span>{connected ? t("actions.disconnectSerial") : t("actions.connectSerial")}</span>
          </button>
          <button
            className={debugEnabled ? "icon-button danger" : "icon-button"}
            disabled={isServoBusModule(activeModule)}
            onClick={toggleDebugMode}
            title={isServoBusModule(activeModule) ? t("arm.directBusHint") : ""}
            type="button"
          >
            <Cable size={18} />
            <span>{debugEnabled ? t("actions.exitDebug") : t("actions.enterDebug")}</span>
          </button>
        </div>

        <div className="module-switch section-switch" aria-label={t("aria.primarySection")}>
          <button className={activeSection === "console" ? "module-tab active" : "module-tab"} onClick={() => selectSection("console")} type="button">
            <Gauge size={17} />
            <span>{t("sections.console")}</span>
          </button>
          <button className={activeSection === "plugins" ? "module-tab active" : "module-tab"} onClick={() => selectSection("plugins")} type="button">
            <Cpu size={17} />
            <span>{t("sections.plugins")}</span>
          </button>
          <button className={activeSection === "components" ? "module-tab active" : "module-tab"} onClick={() => selectSection("components")} type="button">
            <Boxes size={17} />
            <span>{t("sections.components")}</span>
          </button>
          <button className={activeSection === "robots" ? "module-tab active" : "module-tab"} onClick={() => selectSection("robots")} type="button">
            <Bot size={17} />
            <span>{t("sections.robots")}</span>
          </button>
          <button className={activeSection === "tests" ? "module-tab active" : "module-tab"} onClick={() => selectSection("tests")} type="button">
            <Activity size={17} />
            <span>{t("sections.tests")}</span>
          </button>
          <button className={activeSection === "settings" ? "module-tab active" : "module-tab"} onClick={() => selectSection("settings")} type="button">
            <Settings size={17} />
            <span>{t("sections.settings")}</span>
          </button>
        </div>

        <div className="project-switch" aria-label={t("database.project")}>
          <select
            aria-label={t("database.selectProject")}
            disabled={databaseStatus === "offline" || databaseStatus === "loading" || projects.length === 0}
            value={currentProject?.id ?? ""}
            onChange={(event) => void changeCurrentProject(event.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">{t("database.noProject")}</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            )}
          </select>
          <input
            aria-label={t("database.newProject")}
            disabled={databaseStatus === "offline"}
            placeholder={t("database.newProject")}
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
          />
          <button className="icon-button" disabled={databaseStatus === "offline" || !newProjectName.trim()} onClick={() => void createNewProject()} type="button">
            <ListPlus size={18} />
            <span>{t("database.createProject")}</span>
          </button>
        </div>

        <div className={webSerialAvailable ? "serial-note" : "serial-note unavailable"}>
          {webSerialAvailable ? (isServoBusModule(activeModule) ? "Feetech Bus · 1000000 baud" : t("webSerial.ready")) : t("webSerial.unavailable")}
        </div>

        <label className="language-select">
          <span>
            <Languages size={16} />
            {t("language.label")}
          </span>
          <select aria-label={t("language.select")} value={currentLanguage} onChange={changeLanguage}>
            {supportedLanguages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
      </section>
    </>
  );
}

function sectionStatusValue(activeSection: AppSection, t: TFunction) {
  if (activeSection === "console") {
    return t("sections.consoleValue");
  }
  if (activeSection === "plugins") {
    return t("sections.pluginsValue");
  }
  if (activeSection === "components") {
    return t("sections.componentsValue");
  }
  if (activeSection === "robots") {
    return t("sections.robotsValue");
  }
  if (activeSection === "tests") {
    return t("sections.testsValue");
  }
  return t("sections.settingsValue");
}
