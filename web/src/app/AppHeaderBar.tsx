import { Activity, Bot, Boxes, Cable, Cpu, Gauge, Languages, ListPlus, Settings, Unplug, Usb } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import type { TFunction } from "i18next";
import type { DataProject } from "@adapters/data-service/dataService";
import { supportedLanguages, type SupportedLanguage } from "../i18n/languages";
import { StatusCard } from "@shared/ui/AppChrome";
import {
  databaseStatusTone,
  isServoBusModule,
  type ActiveModule,
  type AppSection,
  type DatabaseSaveStatus,
  type PiRemoteStatus
} from "@app/appModel";

type StatusTone = "neutral" | "online" | "warning" | "danger";

interface AppHeaderBarProps {
  aBoardBridgeBusy: boolean;
  aBoardBridgeConnected: boolean;
  aBoardBridgeDetail: string;
  aBoardBridgeLabel: string;
  aBoardBridgeTone: StatusTone;
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
  disconnectAboardSerialBridge: () => void;
  newProjectName: string;
  piRemoteBusy: boolean;
  piRemoteCanConnect: boolean;
  piRemoteStatus: PiRemoteStatus;
  piRemoteStatusTone: StatusTone;
  piRemoteTarget: string;
  piServoBridgeBusy: boolean;
  piServoBridgeConnected: boolean;
  piServoBridgeDetail: string;
  piServoBridgeLabel: string;
  piServoBridgeTone: StatusTone;
  projectStatusValue: string;
  projects: DataProject[];
  selectSection: (section: AppSection) => void | Promise<void>;
  setNewProjectName: (value: string) => void;
  startAboardSerialBridge: () => Promise<unknown>;
  startPiServoSerialBridge: () => Promise<unknown>;
  t: TFunction;
  testRaspberryPiConnection: () => Promise<void>;
  toggleDebugMode: () => void | Promise<void>;
  webSerialAvailable: boolean;
  disconnectPiServoSerialBridge: () => void;
}

export function AppHeaderBar({
  aBoardBridgeBusy,
  aBoardBridgeConnected,
  aBoardBridgeDetail,
  aBoardBridgeLabel,
  aBoardBridgeTone,
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
  disconnectAboardSerialBridge,
  newProjectName,
  piRemoteBusy,
  piRemoteCanConnect,
  piRemoteStatus,
  piRemoteStatusTone,
  piRemoteTarget,
  piServoBridgeBusy,
  piServoBridgeConnected,
  piServoBridgeDetail,
  piServoBridgeLabel,
  piServoBridgeTone,
  projectStatusValue,
  projects,
  selectSection,
  setNewProjectName,
  startAboardSerialBridge,
  startPiServoSerialBridge,
  t,
  testRaspberryPiConnection,
  toggleDebugMode,
  webSerialAvailable,
  disconnectPiServoSerialBridge
}: AppHeaderBarProps) {
  const piRemoteConnected = piRemoteStatus === "ready" || piRemoteStatus === "complete";
  const servoModuleLine = piServoBridgeConnected
    ? t("app.servoBridgeSystemLine", { module: activeModuleLabel })
    : t("app.servoBusSystemLine", { module: activeModuleLabel });
  const piRemoteValue = t(`piRemote.status.${piRemoteStatus}`);
  const piRemoteButtonLabel = piRemoteBusy ? t("status.syncing") : piRemoteConnected ? t("actions.reconnectPi") : t("actions.connectPi");
  const aBoardButtonLabel = aBoardBridgeBusy
    ? t("status.syncing")
    : aBoardBridgeConnected
      ? t("actions.disconnectAboardBridge")
      : t("actions.connectAboard");
  const piServoButtonLabel = piServoBridgeBusy
    ? t("status.syncing")
    : piServoBridgeConnected
      ? t("actions.disconnectPiServoBridge")
      : t("actions.connectPiServo");

  return (
    <>
      <header className="topbar glass-surface">
        <div className="brand-block">
          <span className="brand-mark">RR</span>
          <div className="brand-copy">
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
            <p className="system-line">
              {isServoBusModule(activeModule) ? servoModuleLine : t("app.systemLine", { module: activeModuleLabel })}
            </p>
          </div>
        </div>
        <div className="topbar-status-area">
          <div className="header-connection-strip" aria-label={t("aria.connectionControls")}>
            <HeaderConnectionCard
              label={t("metrics.piRemote")}
              value={piRemoteValue}
              detail={piRemoteTarget}
              tone={piRemoteStatusTone}
              buttonLabel={piRemoteButtonLabel}
              buttonIcon={<Activity size={15} />}
              buttonPrimary={!piRemoteConnected}
              disabled={piRemoteBusy || !piRemoteCanConnect}
              onClick={() => void testRaspberryPiConnection()}
            />
            <HeaderConnectionCard
              label={t("metrics.piServoBridge")}
              value={piServoBridgeLabel}
              detail={piServoBridgeDetail || t("app.piServoDefaultDetail")}
              tone={piServoBridgeTone}
              buttonLabel={piServoButtonLabel}
              buttonIcon={piServoBridgeConnected ? <Unplug size={15} /> : <Cable size={15} />}
              buttonPrimary={!piServoBridgeConnected}
              disabled={piServoBridgeBusy}
              onClick={() => {
                if (piServoBridgeConnected) {
                  disconnectPiServoSerialBridge();
                  return;
                }
                void startPiServoSerialBridge();
              }}
            />
            <HeaderConnectionCard
              label={t("metrics.aBoardBridge")}
              value={aBoardBridgeLabel}
              detail={aBoardBridgeDetail || t("app.aBoardDefaultDetail")}
              tone={aBoardBridgeTone}
              buttonLabel={aBoardButtonLabel}
              buttonIcon={aBoardBridgeConnected ? <Unplug size={15} /> : <Cable size={15} />}
              buttonPrimary={!aBoardBridgeConnected}
              disabled={aBoardBridgeBusy}
              onClick={() => {
                if (aBoardBridgeConnected) {
                  disconnectAboardSerialBridge();
                  return;
                }
                void startAboardSerialBridge();
              }}
            />
          </div>
          <div className="system-strip" aria-label={t("aria.systemStatus")}>
            <StatusCard label={t("status.serialLink")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
            <StatusCard label={t("status.debugMode")} value={debugLabel} tone={debugEnabled ? "warning" : "neutral"} />
            <StatusCard label={t("database.label")} value={databaseStatusValue} tone={databaseStatusTone(databaseStatus)} />
            <StatusCard label={t("database.project")} value={projectStatusValue} tone={currentProject ? "online" : "warning"} />
            <StatusCard label={t("database.lastSave")} value={databaseDetailValue} tone={databaseStatusTone(databaseStatus)} />
            <StatusCard label={t("status.module")} value={sectionStatusValue(activeSection, t)} tone="neutral" />
          </div>
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
          {webSerialAvailable ? (isServoBusModule(activeModule) ? t("webSerial.feetechBusReady") : t("webSerial.ready")) : t("webSerial.unavailable")}
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

interface HeaderConnectionCardProps {
  buttonIcon: ReactNode;
  buttonLabel: string;
  buttonPrimary: boolean;
  detail: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tone: StatusTone;
  value: string;
}

function HeaderConnectionCard({
  buttonIcon,
  buttonLabel,
  buttonPrimary,
  detail,
  disabled,
  label,
  onClick,
  tone,
  value
}: HeaderConnectionCardProps) {
  return (
    <div className={`header-connection-card ${tone}`}>
      <span className="status-led" aria-hidden="true" />
      <div className="header-connection-copy">
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
      <button className={buttonPrimary ? "icon-button primary" : "icon-button"} disabled={disabled} onClick={onClick} type="button">
        {buttonIcon}
        <span>{buttonLabel}</span>
      </button>
    </div>
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
