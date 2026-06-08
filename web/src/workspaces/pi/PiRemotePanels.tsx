import { ChevronDown, ChevronRight, Play, Radar, RotateCw, Save, Send, Settings, Square, Terminal, Trash2, Upload, Usb, Video } from "lucide-react";
import type { TFunction } from "i18next";
import { Metric, PanelTitle } from "@shared/ui/AppChrome";
import type { PiRemoteRuntime } from "@adapters/pi/usePiRemote";
import { buildPiCameraStreamUrl, type PiSetupProfile } from "@adapters/pi/piRemote";
import type { CameraVideoSource } from "@adapters/persistence/storage";

interface PiRemotePanelsProps {
  aBoardBridge?: PiAboardBridgeControls;
  piServoBridge?: PiServoBridgeControls;
  runtime: PiRemoteRuntime;
  t: TFunction;
}

interface PiCameraCardProps extends PiRemotePanelsProps {
  activeCameraSource: CameraVideoSource;
  cameraStreamUrl: string;
}

interface PiAboardBridgeControls {
  busy: boolean;
  connected: boolean;
  detail: string;
  error: string | null;
  label: string;
  tone: "neutral" | "online" | "warning" | "danger";
  check: () => Promise<unknown>;
  disconnect: () => void;
  start: () => Promise<unknown>;
}

interface PiServoBridgeControls {
  busy: boolean;
  connected: boolean;
  detail: string;
  error: string | null;
  label: string;
  tone: "neutral" | "online" | "warning" | "danger";
  check: () => Promise<unknown>;
  disconnect: () => void;
  start: () => Promise<unknown>;
}

function selectedFileLabel(runtime: PiRemoteRuntime, t: TFunction) {
  return runtime.piRemoteFile ? `${runtime.piRemoteFile.name} · ${Math.max(1, Math.round(runtime.piRemoteFile.size / 1024))} KB` : t("piRemote.noFile");
}

function uploadLabel(runtime: PiRemoteRuntime) {
  return runtime.piRemoteUploadResult
    ? `${runtime.piRemoteUploadResult.remotePath} · ${Math.max(1, Math.round(runtime.piRemoteUploadResult.sizeBytes / 1024))} KB`
    : "--";
}

function PiRemoteConfigActions({ runtime, t }: PiRemotePanelsProps) {
  return (
    <>
      <button className="icon-button" onClick={runtime.savePiRemoteConfig} type="button">
        <Save size={18} />
        <span>{t("actions.savePiRemoteConfig")}</span>
      </button>
      <button className="icon-button danger" disabled={!runtime.piRemoteConfigSaved} onClick={runtime.clearPiRemoteConfig} type="button">
        <Trash2 size={18} />
        <span>{t("actions.clearPiRemoteConfig")}</span>
      </button>
    </>
  );
}

function PiRemoteOutput({ runtime, t, command }: PiRemotePanelsProps & { command: string }) {
  return (
    <aside className="pi-remote-output">
      <div className="preview-grid pi-remote-status-grid">
        <Metric label={t("metrics.piHelper")} value={runtime.piHelperLabel} tone={runtime.piHelperHealth ? "online" : runtime.piRemoteStatus === "error" ? "danger" : "neutral"} />
        <Metric label={t("metrics.piRemote")} value={t(`piRemote.status.${runtime.piRemoteStatus}`)} tone={runtime.piRemoteStatusTone} />
        <Metric label={t("metrics.piTarget")} value={`${runtime.piRemoteForm.username || "robot1"}@${runtime.piRemoteForm.host || "--"}`} />
        <Metric label={t("metrics.piSelectedFile")} value={selectedFileLabel(runtime, t)} />
        <Metric className="frame-preview" code label={t("metrics.piUpload")} value={uploadLabel(runtime)} />
        <Metric label={t("metrics.piExit")} value={runtime.piOutputLabel} tone={runtime.piRemoteExecResult?.exitCode === 0 ? "online" : runtime.piRemoteExecResult ? "warning" : "neutral"} />
      </div>

      {runtime.piRemoteError && <p className="form-error">{runtime.piRemoteError}</p>}

      <div className="pi-command-preview">
        <span>{t("piRemote.commandPreview")}</span>
        <code>{`${runtime.piRemoteForm.username || "robot1"}@${runtime.piRemoteForm.host || "--"}$ ${command}`}</code>
      </div>

      <div className="pi-output-block">
        <span>STDOUT</span>
        <pre>{runtime.piRemoteExecResult?.stdout || "--"}</pre>
      </div>
      <div className="pi-output-block stderr">
        <span>STDERR</span>
        <pre>{runtime.piRemoteExecResult?.stderr || "--"}</pre>
      </div>
    </aside>
  );
}

function discoveryTone(status: string): "neutral" | "online" | "warning" | "danger" {
  if (status === "online") {
    return "online";
  }
  if (status === "partial" || status === "skipped" || status === "scanning") {
    return "warning";
  }
  if (status === "offline" || status === "error") {
    return "danger";
  }
  return "neutral";
}

function PiDiscoverySection({ runtime, t }: PiRemotePanelsProps) {
  const recommended = runtime.piDiscoveryRecommended;
  const resultCount = runtime.piDiscoveryResults.filter((result) => result.status !== "offline").length;
  return (
    <div className="pi-remote-section pi-discovery-section">
      <div className="port-config-title">
        <Radar size={17} />
        <span>{t("piRemote.discovery.title")}</span>
      </div>
      <div className="preview-grid pi-remote-status-grid">
        <Metric label={t("piRemote.discovery.statusLabel")} value={t(`piRemote.discovery.status.${runtime.piDiscoveryStatus}`)} tone={discoveryTone(runtime.piDiscoveryStatus)} />
        <Metric label={t("piRemote.discovery.recommended")} value={recommended?.candidate.host ?? "--"} tone={recommended ? discoveryTone(recommended.status) : "neutral"} />
        <Metric className="frame-preview" code label={t("piRemote.discovery.usbHosts")} value="rescue-pi.local / 10.12.194.1 / 10.43.0.1" />
        <Metric label={t("piRemote.discovery.available")} value={String(resultCount)} tone={resultCount > 0 ? "online" : runtime.piDiscoveryStatus === "complete" ? "warning" : "neutral"} />
      </div>
      <div className="action-grid port-config-actions">
        <button className="icon-button primary" disabled={!runtime.canDiscoverPi} onClick={() => void runtime.discoverRaspberryPiHosts()} type="button">
          <Radar size={18} />
          <span>{t("actions.discoverPi")}</span>
        </button>
        <button className="icon-button" disabled={!recommended} onClick={() => recommended && runtime.applyPiDiscoveryHost(recommended.candidate.host)} type="button">
          <Save size={18} />
          <span>{t("actions.applyDiscoveredPi")}</span>
        </button>
        <button className="icon-button" disabled={!runtime.canSetupPiUsbGadget} onClick={() => void runtime.setupRaspberryPiUsbGadget()} type="button">
          <Usb size={18} />
          <span>{t("actions.setupPiUsbGadget")}</span>
        </button>
      </div>
      {runtime.piDiscoveryError && <p className="form-error">{runtime.piDiscoveryError}</p>}
      <div className="pi-discovery-list">
        {runtime.piDiscoveryResults.length === 0 ? (
          <p className="pi-discovery-empty">{t("piRemote.discovery.noResults")}</p>
        ) : (
          runtime.piDiscoveryResults.map((result) => (
            <div className="pi-discovery-row" data-status={result.status} key={`${result.candidate.source}:${result.candidate.host}`}>
              <div className="pi-discovery-main">
                <strong>{result.candidate.host}</strong>
                <span>{t(`piRemote.discovery.source.${result.candidate.source}`)}</span>
              </div>
              <div className="pi-discovery-probes">
                <span data-status={result.ssh.status}>SSH {t(`piRemote.discovery.probe.${result.ssh.status}`)}</span>
                {result.services.map((service) => (
                  <span data-status={service.status} key={`${result.candidate.host}:${service.id}`}>
                    {service.port} {t(`piRemote.discovery.probe.${service.status}`)}
                  </span>
                ))}
              </div>
              <button className="icon-button" disabled={result.status === "offline"} onClick={() => runtime.applyPiDiscoveryHost(result.candidate.host)} type="button">
                <Save size={16} />
                <span>{t("actions.applyDiscoveredPi")}</span>
              </button>
            </div>
          ))
        )}
      </div>
      <p className="pi-discovery-note">{t("piRemote.usbRecovery.powerHint")}</p>
    </div>
  );
}

function PiAboardBridgeSection({ aBoardBridge, t }: Pick<PiRemotePanelsProps, "aBoardBridge" | "t">) {
  if (!aBoardBridge) {
    return null;
  }
  return (
    <div className="pi-remote-section">
      <div className="port-config-title">
        <Usb size={17} />
        <span>{t("metrics.aBoardBridge")}</span>
      </div>
      <div className="preview-grid pi-remote-status-grid">
        <Metric label={t("metrics.aBoardBridge")} value={aBoardBridge.label} tone={aBoardBridge.tone} />
        <Metric className="frame-preview" code label={t("metrics.aBoardBridgeDetail")} value={aBoardBridge.detail || "--"} />
        <Metric className="frame-preview" code label={t("metrics.aBoardPins")} value="Pi 30 GND / 32 TXD5 / 33 RXD5 / ttyAMA5 / 17353" />
      </div>
      <div className="action-grid port-config-actions">
        <button className="icon-button" disabled={aBoardBridge.busy} onClick={() => void aBoardBridge.check()} type="button">
          <RotateCw size={18} />
          <span>{t("actions.checkAboardBridge")}</span>
        </button>
        <button className="icon-button primary" disabled={aBoardBridge.busy} onClick={() => void aBoardBridge.start()} type="button">
          <Upload size={18} />
          <span>{t("actions.startAboardBridge")}</span>
        </button>
        <button className="icon-button" disabled={!aBoardBridge.connected} onClick={aBoardBridge.disconnect} type="button">
          <Square size={18} />
          <span>{t("actions.disconnectAboardBridge")}</span>
        </button>
      </div>
      {aBoardBridge.error && <p className="form-error">{aBoardBridge.error}</p>}
    </div>
  );
}

function PiServoBridgeSection({ piServoBridge, t }: Pick<PiRemotePanelsProps, "piServoBridge" | "t">) {
  if (!piServoBridge) {
    return null;
  }
  return (
    <div className="pi-remote-section">
      <div className="port-config-title">
        <Usb size={17} />
        <span>{t("metrics.piServoBridge")}</span>
      </div>
      <div className="preview-grid pi-remote-status-grid">
        <Metric label={t("metrics.piServoBridge")} value={piServoBridge.label} tone={piServoBridge.tone} />
        <Metric className="frame-preview" code label={t("metrics.piServoBridgeDetail")} value={piServoBridge.detail || "--"} />
        <Metric className="frame-preview" code label={t("metrics.piServoPins")} value="Pi 6 GND / 8 TX / 10 RX / serial0 / 115200 / 17354" />
      </div>
      <div className="action-grid port-config-actions">
        <button className="icon-button" disabled={piServoBridge.busy} onClick={() => void piServoBridge.check()} type="button">
          <RotateCw size={18} />
          <span>{t("actions.checkPiServoBridge")}</span>
        </button>
        <button className="icon-button primary" disabled={piServoBridge.busy} onClick={() => void piServoBridge.start()} type="button">
          <Upload size={18} />
          <span>{t("actions.startPiServoBridge")}</span>
        </button>
        <button className="icon-button" disabled={!piServoBridge.connected} onClick={piServoBridge.disconnect} type="button">
          <Square size={18} />
          <span>{t("actions.disconnectPiServoBridge")}</span>
        </button>
      </div>
      {piServoBridge.error && <p className="form-error">{piServoBridge.error}</p>}
    </div>
  );
}

export function SimplePiRemotePage({ aBoardBridge, piServoBridge, runtime, t }: PiRemotePanelsProps) {
  const runModeLabel = runtime.piRunPlan ? t(`piRemote.runMode.${runtime.piRunPlan.mode}`) : "--";
  const setupStatusLabel = runtime.piSetupComplete
    ? t("piRemote.setupReady")
    : runtime.piReadiness?.pythonAvailable
      ? t("piRemote.setupNeeded")
      : runtime.piReadiness
        ? t("piRemote.pythonMissing")
        : t("piRemote.notChecked");

  return (
    <section className="panel pi-remote-panel" aria-labelledby="pi-remote-title">
      <PanelTitle icon={<Terminal size={18} />} id="pi-remote-title" meta={runtime.piRemoteForm.host || "rescue-pi.local"} title={t("panels.piRemote")} />

      <div className="pi-remote-grid">
        <div className="pi-remote-stack">
          <div className="pi-remote-section pi-wizard-section">
            <div className="port-config-title">
              <Usb size={17} />
              <span>{t("piRemote.firstSetup")}</span>
            </div>
            <div className="pi-wizard-steps">
              <div className="pi-wizard-step">
                <strong>1</strong>
                <label>
                  <span>{t("fields.piHost")}</span>
                  <input value={runtime.piRemoteForm.host} onChange={(event) => runtime.updatePiRemoteField("host", event.target.value)} placeholder={t("placeholders.piHost")} />
                </label>
              </div>
              <div className="pi-wizard-step">
                <strong>2</strong>
                <div className="pi-auth-grid">
                  <label>
                    <span>{t("fields.piUsername")}</span>
                    <input value={runtime.piRemoteForm.username} onChange={(event) => runtime.updatePiRemoteField("username", event.target.value)} placeholder="robot1" />
                  </label>
                  <label>
                    <span>{t("fields.piAuthMode")}</span>
                    <select value={runtime.piRemoteForm.authMode} onChange={(event) => runtime.updatePiRemoteField("authMode", event.target.value as PiSetupProfile["authMode"])}>
                      <option value="password">{t("piRemote.auth.password")}</option>
                      <option value="privateKey">{t("piRemote.auth.privateKey")}</option>
                    </select>
                  </label>
                  {runtime.piRemoteForm.authMode === "password" ? (
                    <label className="pi-remote-wide">
                      <span>{t("fields.piPassword")}</span>
                      <input type="password" value={runtime.piRemoteForm.password} onChange={(event) => runtime.updatePiRemoteField("password", event.target.value)} autoComplete="off" />
                    </label>
                  ) : (
                    <label className="pi-remote-wide">
                      <span>{t("fields.piPrivateKeyPath")}</span>
                      <input value={runtime.piRemoteForm.privateKeyPath} onChange={(event) => runtime.updatePiRemoteField("privateKeyPath", event.target.value)} placeholder={t("placeholders.piPrivateKeyPath")} />
                    </label>
                  )}
                </div>
              </div>
              <div className="pi-wizard-step">
                <strong>3</strong>
                <div className="pi-step-action">
                  <span>{t("piRemote.checkHint")}</span>
                  <button className="icon-button primary" disabled={!runtime.canTestPiConnection} onClick={runtime.testRaspberryPiConnection} type="button">
                    <Radar size={18} />
                    <span>{t("actions.testPiConnection")}</span>
                  </button>
                </div>
              </div>
              <div className="pi-wizard-step">
                <strong>4</strong>
                <div className="pi-step-action">
                  <span>{t("piRemote.setupHint")}</span>
                  <button className="icon-button" disabled={!runtime.canSetupPiWorkspace} onClick={runtime.setupRaspberryPiWorkspace} type="button">
                    <Settings size={18} />
                    <span>{t("actions.setupPiWorkspace")}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="action-grid port-config-actions">
              <PiRemoteConfigActions runtime={runtime} t={t} />
            </div>
          </div>

          <PiDiscoverySection runtime={runtime} t={t} />
          <PiServoBridgeSection piServoBridge={piServoBridge} t={t} />
          <PiAboardBridgeSection aBoardBridge={aBoardBridge} t={t} />

          <div className="pi-remote-section">
            <div className="port-config-title">
              <Play size={17} />
              <span>{t("piRemote.oneClickRun")}</span>
            </div>
            <div className="pi-run-card">
              <label>
                <span>{t("fields.piFile")}</span>
                <input type="file" onChange={(event) => runtime.updatePiRemoteFile(event.target.files?.[0] ?? null)} />
              </label>
              <div className="pi-run-summary">
                <Metric label={t("metrics.piSelectedFile")} value={selectedFileLabel(runtime, t)} />
                <Metric label={t("metrics.piRunMode")} value={runModeLabel} tone={runtime.piRunPlan?.canExecute ? "online" : runtime.piRunPlan ? "warning" : "neutral"} />
              </div>
            </div>
            <div className="action-grid port-config-actions">
              <button className="icon-button primary" disabled={!runtime.canRunPiFile} onClick={runtime.runRaspberryPiFile} type="button">
                <Play size={18} />
                <span>{t("actions.oneClickRunPiFile")}</span>
              </button>
              <button className="icon-button" onClick={runtime.clearPiOutput} type="button">
                <RotateCw size={18} />
                <span>{t("actions.clearPiOutput")}</span>
              </button>
            </div>
          </div>

          <button className="pi-advanced-toggle" onClick={() => runtime.setPiAdvancedOpen((current) => !current)} type="button">
            {runtime.piAdvancedOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            <span>{t("piRemote.advancedSettings")}</span>
          </button>

          {runtime.piAdvancedOpen && (
            <div className="pi-remote-section">
              <div className="pi-remote-form-grid">
                <label>
                  <span>{t("fields.piPort")}</span>
                  <input type="number" min={1} max={65535} step={1} value={runtime.piRemoteForm.port} onChange={(event) => runtime.updatePiRemoteField("port", event.target.value)} />
                </label>
                <label>
                  <span>{t("fields.piTimeoutSeconds")}</span>
                  <input type="number" min={1} max={300} step={1} value={runtime.piRemoteForm.timeoutSeconds} onChange={(event) => runtime.updatePiRemoteField("timeoutSeconds", event.target.value)} />
                </label>
                <label className="pi-remote-wide">
                  <span>{t("fields.piWorkspaceDir")}</span>
                  <input value={runtime.piRemoteForm.workspaceDir} onChange={(event) => runtime.updatePiRemoteField("workspaceDir", event.target.value)} placeholder="~/rescue-robot" />
                </label>
                <label className="pi-remote-wide">
                  <span>{t("fields.piRemotePath")}</span>
                  <input value={runtime.piRemoteForm.remotePath} onChange={(event) => runtime.updatePiRemoteField("remotePath", event.target.value)} placeholder="/home/robot1/rescue/uploaded.py" />
                </label>
                <label className="pi-remote-wide">
                  <span>{t("fields.piCommand")}</span>
                  <textarea rows={3} value={runtime.piRemoteForm.command} onChange={(event) => runtime.updatePiRemoteField("command", event.target.value)} />
                </label>
              </div>
              <div className="action-grid port-config-actions">
                <button className="icon-button" disabled={runtime.piRemoteBusy} onClick={() => runtime.checkPiHelper()} type="button">
                  <RotateCw size={18} />
                  <span>{t("actions.checkPiHelper")}</span>
                </button>
                <button className="icon-button" disabled={!runtime.canUploadPiFile} onClick={runtime.uploadRaspberryPiFile} type="button">
                  <Upload size={18} />
                  <span>{t("actions.uploadPiFile")}</span>
                </button>
                <button className="icon-button" disabled={!runtime.canExecPiCommand} onClick={runtime.execRaspberryPiCommand} type="button">
                  <Send size={18} />
                  <span>{t("actions.execPiCommand")}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <PiRemoteOutput runtime={runtime} t={t} command={runtime.piRunPlan?.command ?? runtime.piRemoteForm.command ?? "--"} />
      </div>
    </section>
  );
}

export function PiRemotePage({ aBoardBridge, piServoBridge, runtime, t }: PiRemotePanelsProps) {
  return (
    <section className="panel pi-remote-panel" aria-labelledby="pi-remote-title">
      <PanelTitle icon={<Terminal size={18} />} id="pi-remote-title" meta={runtime.piRemoteForm.host || "rescue-pi.local"} title={t("panels.piRemote")} />

      <div className="pi-remote-grid">
        <div className="pi-remote-stack">
          <div className="pi-remote-section">
            <div className="port-config-title">
              <Usb size={17} />
              <span>{t("piRemote.connection")}</span>
            </div>
            <div className="pi-remote-form-grid">
              <label>
                <span>{t("fields.piHost")}</span>
                <input value={runtime.piRemoteForm.host} onChange={(event) => runtime.updatePiRemoteField("host", event.target.value)} placeholder={t("placeholders.piHost")} />
              </label>
              <label>
                <span>{t("fields.piPort")}</span>
                <input type="number" min={1} max={65535} step={1} value={runtime.piRemoteForm.port} onChange={(event) => runtime.updatePiRemoteField("port", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.piUsername")}</span>
                <input value={runtime.piRemoteForm.username} onChange={(event) => runtime.updatePiRemoteField("username", event.target.value)} placeholder="robot1" />
              </label>
              <label>
                <span>{t("fields.piPassword")}</span>
                <input type="password" value={runtime.piRemoteForm.password} onChange={(event) => runtime.updatePiRemoteField("password", event.target.value)} autoComplete="off" />
              </label>
              <label className="pi-remote-wide">
                <span>{t("fields.piPrivateKeyPath")}</span>
                <input value={runtime.piRemoteForm.privateKeyPath} onChange={(event) => runtime.updatePiRemoteField("privateKeyPath", event.target.value)} placeholder={t("placeholders.piPrivateKeyPath")} />
              </label>
            </div>
            <div className="action-grid port-config-actions">
              <PiRemoteConfigActions runtime={runtime} t={t} />
              <button className="icon-button" disabled={runtime.piRemoteBusy} onClick={() => runtime.checkPiHelper()} type="button">
                <RotateCw size={18} />
                <span>{t("actions.checkPiHelper")}</span>
              </button>
              <button className="icon-button primary" disabled={!runtime.canTestPiConnection} onClick={runtime.testRaspberryPiConnection} type="button">
                <Radar size={18} />
                <span>{t("actions.testPiConnection")}</span>
              </button>
            </div>
          </div>

          <PiDiscoverySection runtime={runtime} t={t} />
          <PiServoBridgeSection piServoBridge={piServoBridge} t={t} />
          <PiAboardBridgeSection aBoardBridge={aBoardBridge} t={t} />

          <div className="pi-remote-section">
            <div className="port-config-title">
              <Upload size={17} />
              <span>{t("piRemote.upload")}</span>
            </div>
            <div className="pi-remote-form-grid">
              <label className="pi-remote-wide">
                <span>{t("fields.piFile")}</span>
                <input type="file" onChange={(event) => runtime.updatePiRemoteFile(event.target.files?.[0] ?? null)} />
              </label>
              <label className="pi-remote-wide">
                <span>{t("fields.piRemotePath")}</span>
                <input value={runtime.piRemoteForm.remotePath} onChange={(event) => runtime.updatePiRemoteField("remotePath", event.target.value)} placeholder="/home/robot1/rescue/uploaded.py" />
              </label>
            </div>
            <div className="action-grid port-config-actions">
              <button className="icon-button" disabled={!runtime.canUploadPiFile} onClick={runtime.uploadRaspberryPiFile} type="button">
                <Upload size={18} />
                <span>{t("actions.uploadPiFile")}</span>
              </button>
              <button className="icon-button primary" disabled={!runtime.canUploadAndExecPiFile} onClick={runtime.uploadAndExecRaspberryPiFile} type="button">
                <Play size={18} />
                <span>{t("actions.uploadAndRunPiFile")}</span>
              </button>
            </div>
          </div>

          <div className="pi-remote-section">
            <div className="port-config-title">
              <Terminal size={17} />
              <span>{t("piRemote.command")}</span>
            </div>
            <div className="pi-remote-form-grid">
              <label className="pi-remote-wide">
                <span>{t("fields.piCommand")}</span>
                <textarea rows={3} value={runtime.piRemoteForm.command} onChange={(event) => runtime.updatePiRemoteField("command", event.target.value)} />
              </label>
              <label>
                <span>{t("fields.piCwd")}</span>
                <input value={runtime.piRemoteForm.cwd} onChange={(event) => runtime.updatePiRemoteField("cwd", event.target.value)} placeholder="/home/robot1" />
              </label>
              <label>
                <span>{t("fields.piTimeoutSeconds")}</span>
                <input type="number" min={1} max={300} step={1} value={runtime.piRemoteForm.timeoutSeconds} onChange={(event) => runtime.updatePiRemoteField("timeoutSeconds", event.target.value)} />
              </label>
            </div>
            <div className="action-grid port-config-actions">
              <button className="icon-button primary" disabled={!runtime.canExecPiCommand} onClick={runtime.execRaspberryPiCommand} type="button">
                <Send size={18} />
                <span>{t("actions.execPiCommand")}</span>
              </button>
            </div>
          </div>
        </div>

        <PiRemoteOutput runtime={runtime} t={t} command={runtime.piRemoteForm.command || "--"} />
      </div>
    </section>
  );
}

export function PiCameraCard({ activeCameraSource, cameraStreamUrl, runtime, t }: PiCameraCardProps) {
  const cameraTarget = `${runtime.piRemoteForm.username || "robot1"}@${runtime.piRemoteForm.host || "rescue-pi.local"}`;
  const deviceLabel = runtime.piCameraCheck?.device ?? activeCameraSource.devicePath;
  const toolLabel = runtime.piCameraCheck ? (runtime.piCameraCheck.ustreamerAvailable ? t("status.ready") : t("piRemote.camera.toolMissing")) : t("status.unknown");
  const webrtcToolLabel = runtime.piCameraCheck ? (runtime.piCameraCheck.webrtcAvailable ? t("status.ready") : t("piRemote.camera.webrtcUnavailable")) : t("status.unknown");
  const streamLabel = runtime.piCameraCheck?.streamUrl || cameraStreamUrl || "--";
  const adaptiveStreamLabel = buildPiCameraStreamUrl(runtime.piRemoteForm.host || "rescue-pi.local", activeCameraSource.port);
  const statusTone: "neutral" | "online" | "warning" | "danger" =
    runtime.piCameraStatus === "error" ? "danger" : runtime.piCameraStatus === "streaming" ? "online" : runtime.piCameraBusy ? "warning" : "neutral";

  return (
    <section className="pi-camera-card" aria-labelledby="pi-camera-title">
      <div className="drive-section-title">
        <Video size={17} />
        <h3 id="pi-camera-title">{t("piRemote.camera.title")}</h3>
      </div>
      <div className="preview-grid pi-camera-status-grid">
        <Metric label={t("metrics.piTarget")} value={cameraTarget} />
        <Metric label={t("fields.activeVideoSource")} value={activeCameraSource.label} />
        <Metric label={t("fields.sourcePort")} value={activeCameraSource.port} />
        <Metric label={t("piRemote.camera.statusLabel")} value={t(`piRemote.camera.status.${runtime.piCameraStatus}`)} tone={statusTone} />
        <Metric label={t("piRemote.camera.device")} value={deviceLabel} tone={runtime.piCameraCheck?.cameraAvailable ? "online" : runtime.piCameraCheck ? "danger" : "neutral"} />
        <Metric label={t("piRemote.camera.tool")} value={toolLabel} tone={runtime.piCameraCheck?.ustreamerAvailable ? "online" : runtime.piCameraCheck ? "warning" : "neutral"} />
        <Metric label={t("piRemote.camera.webrtc")} value={webrtcToolLabel} tone={runtime.piCameraCheck?.webrtcAvailable ? "online" : runtime.piCameraCheck ? "warning" : "neutral"} />
        <Metric className="frame-preview" code label={t("metrics.stream")} value={streamLabel} />
        <Metric className="frame-preview" code label={t("piRemote.camera.adaptiveStream")} value={adaptiveStreamLabel} />
      </div>
      <div className="action-grid pi-camera-actions">
        <button className="icon-button" disabled={!runtime.piRemoteForm.host.trim()} onClick={() => runtime.syncCameraConfigToPiHost()} type="button">
          <RotateCw size={18} />
          <span>{t("actions.syncPiCameraUrl")}</span>
        </button>
        <button className="icon-button" disabled={!runtime.canUsePiCamera} onClick={() => void runtime.checkRaspberryPiCamera(activeCameraSource)} type="button">
          <Radar size={18} />
          <span>{t("actions.checkPiCamera")}</span>
        </button>
        <button className="icon-button primary" disabled={!runtime.canUsePiCamera} onClick={() => void runtime.startRaspberryPiCameraStream(activeCameraSource)} type="button">
          <Play size={18} />
          <span>{t("actions.startPiCamera")}</span>
        </button>
        <button className="icon-button" disabled={!runtime.piConnectionReady || runtime.piCameraBusy} onClick={() => void runtime.stopRaspberryPiCameraStream(activeCameraSource)} type="button">
          <Square size={18} />
          <span>{t("actions.stopPiCamera")}</span>
        </button>
        <button className="icon-button" onClick={runtime.clearPiCameraOutput} type="button">
          <RotateCw size={18} />
          <span>{t("actions.clearPiOutput")}</span>
        </button>
      </div>
      {runtime.piCameraError && <p className="form-error">{runtime.piCameraError}</p>}
      <button className="pi-advanced-toggle pi-camera-advanced-toggle" onClick={() => runtime.setPiCameraAdvancedOpen((current) => !current)} type="button">
        {runtime.piCameraAdvancedOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
        <span>{t("piRemote.camera.advanced")}</span>
      </button>
      {runtime.piCameraAdvancedOpen && (
        <div className="pi-camera-advanced">
          <button className="icon-button" disabled={!runtime.canUsePiCamera} onClick={runtime.installRaspberryPiCameraTools} type="button">
            <Settings size={18} />
            <span>{t("actions.installPiCameraTools")}</span>
          </button>
          <div className="pi-output-block">
            <span>STDOUT</span>
            <pre>{runtime.piCameraExecResult?.stdout || runtime.piCameraCheck?.stdout || "--"}</pre>
          </div>
          <div className="pi-output-block stderr">
            <span>STDERR</span>
            <pre>{runtime.piCameraExecResult?.stderr || runtime.piCameraCheck?.stderr || "--"}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
