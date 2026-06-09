import { Dispatch, SetStateAction, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PiExecResult,
  PiCameraCheckResult,
  PiHelperHealth,
  PiReadinessResult,
  PiRunPlan,
  PiSetupProfile,
  PiUploadResult,
  checkPiCamera,
  checkPiReadiness,
  createPiRunPlan,
  execPiCommand,
  installPiCameraTools,
  isPiRemoteError,
  requestPiHelperHealth,
  runUploadedFile,
  startPiCameraStream,
  stopPiCameraStream,
  setupPiUsbGadget,
  setupPiWorkspace,
  uploadAndExecPiFile,
  uploadPiFile
} from "@adapters/pi/piRemote";
import { discoverRaspberryPi, recommendedPiDiscoveryResult, type PiDiscoveryProbeResult } from "@adapters/pi/piDiscovery";
import {
  CAMERA_LATENCY_PROFILE_SETTINGS,
  MAIN_CAMERA_SOURCE_ID,
  type CameraConfig,
  type CameraLatencyProfile,
  type CameraVideoSource
} from "@adapters/persistence/storage";
import { adaptCameraConfigToPiHost, updateCameraSource } from "@domains/camera/cameraSources";
import {
  LogEntry,
  LogValues,
  PiCameraStatus,
  PiRemoteForm,
  PiRemoteStatus,
  PI_SETUP_PROFILE_STORAGE_KEY,
  defaultPiRemoteForm
} from "@app/appModel";

interface UsePiRemoteOptions {
  addLog: (direction: LogEntry["direction"], text: string, level?: LogEntry["level"]) => void;
  addSystemLog: (messageKey: string, level?: LogEntry["level"], values?: LogValues) => void;
  activeCameraSource: CameraVideoSource;
  cameraConfig: CameraConfig;
  resetCameraSourceRuntime?: (sourceId: string) => void;
  setCameraConfig: Dispatch<SetStateAction<CameraConfig>>;
  setCameraStreamFailed: Dispatch<SetStateAction<boolean>>;
  setCameraStreamLoaded: Dispatch<SetStateAction<boolean>>;
  setCameraStreamReloadToken?: Dispatch<SetStateAction<number>>;
}

export interface PiAutoRestoreState {
  busy: boolean;
  connectionReady: boolean;
  enabled: boolean;
  attempted: boolean;
}

export function shouldAutoRestorePiConnection(state: PiAutoRestoreState): boolean {
  return state.enabled && !state.attempted && state.connectionReady && !state.busy;
}

export function usePiRemote({
  addLog,
  addSystemLog,
  activeCameraSource,
  cameraConfig,
  resetCameraSourceRuntime,
  setCameraConfig,
  setCameraStreamFailed,
  setCameraStreamLoaded,
  setCameraStreamReloadToken
}: UsePiRemoteOptions) {
  const { t } = useTranslation();
  const [piRemoteForm, setPiRemoteForm] = useState<PiRemoteForm>(() => ({ ...defaultPiRemoteForm }));
  const [piHelperHealth, setPiHelperHealth] = useState<PiHelperHealth | null>(null);
  const [piRemoteStatus, setPiRemoteStatus] = useState<PiRemoteStatus>("idle");
  const [piRemoteError, setPiRemoteError] = useState<string | null>(null);
  const [piRemoteFile, setPiRemoteFile] = useState<File | null>(null);
  const [piRemoteUploadResult, setPiRemoteUploadResult] = useState<PiUploadResult | null>(null);
  const [piRemoteExecResult, setPiRemoteExecResult] = useState<PiExecResult | null>(null);
  const [piReadiness, setPiReadiness] = useState<PiReadinessResult | null>(null);
  const [piRunPlan, setPiRunPlan] = useState<PiRunPlan | null>(null);
  const [piSetupComplete, setPiSetupComplete] = useState(false);
  const [piAdvancedOpen, setPiAdvancedOpen] = useState(false);
  const [piRemoteConfigSaved, setPiRemoteConfigSaved] = useState(false);
  const [piRemoteProfileLoaded, setPiRemoteProfileLoaded] = useState(false);
  const [piAutoRestoreEnabled, setPiAutoRestoreEnabled] = useState(false);
  const [piCameraStatus, setPiCameraStatus] = useState<PiCameraStatus>("idle");
  const [piCameraCheck, setPiCameraCheck] = useState<PiCameraCheckResult | null>(null);
  const [piCameraExecResult, setPiCameraExecResult] = useState<PiExecResult | null>(null);
  const [piCameraError, setPiCameraError] = useState<string | null>(null);
  const [piCameraAdvancedOpen, setPiCameraAdvancedOpen] = useState(false);
  const [piDiscoveryStatus, setPiDiscoveryStatus] = useState<"idle" | "scanning" | "complete" | "error">("idle");
  const [piDiscoveryResults, setPiDiscoveryResults] = useState<PiDiscoveryProbeResult[]>([]);
  const [piDiscoveryError, setPiDiscoveryError] = useState<string | null>(null);
  const piAutoRestoreAttemptedRef = useRef(false);
  const [piManagementBusy, setPiManagementBusy] = useState(false);
  const piManagementBusyRef = useRef(false);

  const piRemoteStatusBusy = piRemoteStatus === "checking" || piRemoteStatus === "settingUp" || piRemoteStatus === "uploading" || piRemoteStatus === "running";
  const piRemoteBusy = piRemoteStatusBusy || piManagementBusy;
  const piDiscoveryBusy = piDiscoveryStatus === "scanning";
  const piDiscoveryRecommended = recommendedPiDiscoveryResult(piDiscoveryResults);
  const piRemoteStatusTone: "neutral" | "online" | "warning" | "danger" =
    piRemoteStatus === "error" ? "danger" : piRemoteStatus === "ready" || piRemoteStatus === "complete" ? "online" : piRemoteBusy ? "warning" : "neutral";
  const piHelperLabel =
    piRemoteStatus === "checking" || piRemoteStatus === "settingUp"
      ? t("status.syncing")
      : piHelperHealth
        ? t("status.online")
        : t("status.unknown");
  const piAuthReady = piRemoteForm.authMode === "password" ? Boolean(piRemoteForm.password) : Boolean(piRemoteForm.privateKeyPath.trim());
  const piConnectionReady = Boolean(piRemoteForm.host.trim() && piRemoteForm.username.trim() && piAuthReady);
  const piCameraBusy = piCameraStatus === "checking" || piCameraStatus === "installing" || piCameraStatus === "starting" || piCameraStatus === "stopping";
  const piFileReady = Boolean(piRemoteFile);
  const piCommandReady = Boolean(piRemoteForm.command.trim());
  const canTestPiConnection = !piRemoteBusy && !piCameraBusy && piConnectionReady;
  const canUploadPiFile = !piRemoteBusy && !piCameraBusy && piConnectionReady && piFileReady;
  const canExecPiCommand = !piRemoteBusy && !piCameraBusy && piConnectionReady && piCommandReady;
  const canSetupPiWorkspace = !piRemoteBusy && !piCameraBusy && piConnectionReady;
  const canRunPiFile = !piRemoteBusy && !piCameraBusy && piConnectionReady && piFileReady;
  const canUploadAndExecPiFile = canUploadPiFile && piCommandReady;
  const canUsePiCamera = piConnectionReady && !piRemoteBusy && !piCameraBusy;
  const canDiscoverPi = !piRemoteBusy && !piDiscoveryBusy;
  const canSetupPiUsbGadget = !piRemoteBusy && !piCameraBusy && piConnectionReady;
  const piOutputLabel = piRemoteExecResult
    ? t("piRemote.exitCode") + " " + piRemoteExecResult.exitCode + " ? " + Math.max(1, Math.round(piRemoteExecResult.durationMs)) + " ms"
    : "--";

  function savedString(value: unknown, fallback: string): string {
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    return fallback;
  }

  function savedNonEmptyString(value: unknown, fallback: string): string {
    const next = savedString(value, fallback);
    return next.trim() ? next : fallback;
  }

  function normalizeSavedPiRemoteForm(value: unknown, current: PiRemoteForm): PiRemoteForm {
    if (!value || typeof value !== "object") {
      return current;
    }
    const profile = value as Partial<Record<keyof PiRemoteForm, unknown>>;
    return {
      ...current,
      host: savedNonEmptyString(profile.host, current.host),
      port: savedNonEmptyString(profile.port, current.port),
      username: savedNonEmptyString(profile.username, current.username),
      password: savedString(profile.password, current.password),
      authMode: profile.authMode === "privateKey" ? "privateKey" : "password",
      privateKeyPath: savedString(profile.privateKeyPath, current.privateKeyPath),
      workspaceDir: savedNonEmptyString(profile.workspaceDir, current.workspaceDir),
      remotePath: savedNonEmptyString(profile.remotePath, current.remotePath),
      command: savedString(profile.command, current.command),
      cwd: savedString(profile.cwd, current.cwd),
      timeoutSeconds: savedNonEmptyString(profile.timeoutSeconds, current.timeoutSeconds)
    };
  }

  function readSavedPiRemoteConfig(): Partial<PiRemoteForm> | null {
    try {
      const raw = window.localStorage.getItem(PI_SETUP_PROFILE_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Partial<PiRemoteForm>) : null;
    } catch {
      window.localStorage.removeItem(PI_SETUP_PROFILE_STORAGE_KEY);
      return null;
    }
  }

  function writeSavedPiRemoteConfig(config: Partial<PiRemoteForm>) {
    window.localStorage.setItem(PI_SETUP_PROFILE_STORAGE_KEY, JSON.stringify(config));
    setPiRemoteConfigSaved(true);
  }

  useEffect(() => {
    void checkPiHelper(false);
  }, []);

  useEffect(() => {
    try {
      const profile = readSavedPiRemoteConfig();
      setPiRemoteConfigSaved(Boolean(profile));
      setPiAutoRestoreEnabled(Boolean(profile));
      if (profile) {
        setPiRemoteForm((current) => normalizeSavedPiRemoteForm(profile, current));
      }
    } catch {
      window.localStorage.removeItem(PI_SETUP_PROFILE_STORAGE_KEY);
      setPiRemoteConfigSaved(false);
      setPiAutoRestoreEnabled(false);
    } finally {
      setPiRemoteProfileLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!piRemoteProfileLoaded) {
      return;
    }
    const profile: Partial<PiRemoteForm> = {
      ...(readSavedPiRemoteConfig() ?? {}),
      host: piRemoteForm.host,
      username: piRemoteForm.username,
      authMode: piRemoteForm.authMode,
      privateKeyPath: piRemoteForm.privateKeyPath,
      workspaceDir: piRemoteForm.workspaceDir
    };
    writeSavedPiRemoteConfig(profile);
  }, [piRemoteForm.authMode, piRemoteForm.host, piRemoteForm.privateKeyPath, piRemoteForm.username, piRemoteForm.workspaceDir, piRemoteProfileLoaded]);

  useEffect(() => {
    if (
      !shouldAutoRestorePiConnection({
        attempted: piAutoRestoreAttemptedRef.current,
        busy: piRemoteBusy,
        connectionReady: piConnectionReady,
        enabled: piAutoRestoreEnabled
      })
    ) {
      return;
    }
    piAutoRestoreAttemptedRef.current = true;
    void verifyRaspberryPiConnection({ log: false });
  }, [
    piAutoRestoreEnabled,
    piConnectionReady,
    piRemoteBusy,
    piRemoteForm.authMode,
    piRemoteForm.host,
    piRemoteForm.password,
    piRemoteForm.port,
    piRemoteForm.privateKeyPath,
    piRemoteForm.username,
    piRemoteForm.workspaceDir
  ]);

  useEffect(() => {
    if (!piRemoteProfileLoaded) {
      return;
    }
    const host = piRemoteForm.host.trim();
    if (!host) {
      return;
    }
    syncCameraConfigToPiHost(host);
  }, [piRemoteForm.host, piRemoteProfileLoaded, setCameraConfig]);

  function syncCameraConfigToPiHost(host = piRemoteForm.host) {
    const nextHost = host.trim();
    if (!nextHost) {
      return;
    }
    setCameraConfig((current) => adaptCameraConfigToPiHost(current, nextHost));
    resetCameraSourceRuntime?.(activeCameraSource.id);
    setCameraStreamReloadToken?.((current) => current + 1);
    setCameraStreamLoaded(false);
    setCameraStreamFailed(false);
  }

  function setPiRemoteFailure(error: unknown) {
    const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : t("piRemote.errors.requestFailed");
    setPiRemoteStatus("error");
    setPiRemoteError(message);
    addLog("system", message, "error");
  }

  function beginPiManagementAction(): boolean {
    if (piManagementBusyRef.current) {
      return false;
    }
    piManagementBusyRef.current = true;
    setPiManagementBusy(true);
    return true;
  }

  function endPiManagementAction() {
    piManagementBusyRef.current = false;
    setPiManagementBusy(false);
  }

  function piConnectionRequest() {
    return {
      host: piRemoteForm.host.trim(),
      port: Number.isFinite(Number(piRemoteForm.port)) ? Number(piRemoteForm.port) : 22,
      username: piRemoteForm.username.trim(),
      password: piRemoteForm.authMode === "password" ? piRemoteForm.password || undefined : undefined,
      privateKeyPath: piRemoteForm.authMode === "privateKey" ? piRemoteForm.privateKeyPath.trim() || undefined : undefined
    };
  }

  function piSetupProfile(): PiSetupProfile {
    return {
      host: piRemoteForm.host.trim(),
      username: piRemoteForm.username.trim(),
      authMode: piRemoteForm.authMode,
      privateKeyPath: piRemoteForm.privateKeyPath.trim(),
      workspaceDir: piRemoteForm.workspaceDir.trim() || "~/rescue-robot"
    };
  }

  function piCommandRequest() {
    const timeoutSeconds = Number(piRemoteForm.timeoutSeconds);
    return {
      ...piConnectionRequest(),
      command: piRemoteForm.command.trim(),
      cwd: piRemoteForm.cwd.trim() || undefined,
      timeoutMs: Number.isFinite(timeoutSeconds) ? Math.round(timeoutSeconds * 1000) : undefined
    };
  }

  function updatePiRemoteField(field: keyof PiRemoteForm, value: string) {
    setPiRemoteForm((current) => ({ ...current, [field]: value }));
    setPiRemoteError(null);
    if (field === "host") {
      syncCameraConfigToPiHost(value);
    }
    if ((field === "workspaceDir" || field === "username") && piRemoteFile) {
      const nextWorkspaceDir = field === "workspaceDir" ? value : piRemoteForm.workspaceDir;
      const nextUsername = field === "username" ? value : piRemoteForm.username;
      setPiRunPlan(createPiRunPlan(piRemoteFile.name, nextWorkspaceDir, nextUsername || defaultPiRemoteForm.username));
    }
  }

  function savePiRemoteConfig() {
    writeSavedPiRemoteConfig({ ...piRemoteForm });
    setPiAutoRestoreEnabled(true);
    addSystemLog("logs.piRemoteConfigSaved");
  }

  function clearPiRemoteConfig() {
    window.localStorage.removeItem(PI_SETUP_PROFILE_STORAGE_KEY);
    setPiRemoteConfigSaved(false);
    setPiAutoRestoreEnabled(false);
    piAutoRestoreAttemptedRef.current = false;
    addSystemLog("logs.piRemoteConfigCleared");
  }

  function updatePiRemoteFile(file: File | null) {
    setPiRemoteFile(file);
    setPiRemoteError(null);
    setPiRemoteUploadResult(null);
    setPiRemoteExecResult(null);
    setPiRunPlan(file ? createPiRunPlan(file.name, piRemoteForm.workspaceDir, piRemoteForm.username || defaultPiRemoteForm.username) : null);
  }

  async function checkPiHelper(log = true): Promise<PiHelperHealth | null> {
    if (log) {
      setPiRemoteStatus("checking");
    }
    setPiRemoteError(null);
    try {
      const health = await requestPiHelperHealth();
      setPiHelperHealth(health);
      if (log) {
        setPiRemoteStatus("idle");
        addSystemLog("logs.piHelperReady");
      }
      return health;
    } catch (error) {
      setPiHelperHealth(null);
      if (log) {
        setPiRemoteStatus("error");
        setPiRemoteError(t("piRemote.errors.helperUnavailable"));
        addSystemLog("logs.piHelperUnavailable", "warn");
      }
      return null;
    }
  }

  async function verifyRaspberryPiConnection({ log = true }: { log?: boolean } = {}) {
    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("checking");
    setPiRemoteError(null);
    setPiRemoteExecResult(null);
    setPiReadiness(null);
    try {
      const result = await checkPiReadiness(piConnectionRequest(), piSetupProfile());
      setPiReadiness(result);
      setPiSetupComplete(result.pythonAvailable && result.workspaceReady);
      setPiRemoteStatus(result.pythonAvailable ? "ready" : "error");
      if (log) {
        addSystemLog("logs.piConnectionReady", "info", { host: piRemoteForm.host.trim(), ms: Math.round(result.connection.durationMs) });
      }
      if (!result.pythonAvailable) {
        setPiRemoteError(t("piRemote.errors.pythonMissing"));
      } else if (!result.workspaceReady) {
        setPiRemoteError(t("piRemote.errors.workspaceMissing"));
      }
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function testRaspberryPiConnection() {
    await verifyRaspberryPiConnection();
  }

  async function discoverRaspberryPiHosts() {
    setPiDiscoveryStatus("scanning");
    setPiDiscoveryError(null);
    try {
      const port = Number(piRemoteForm.port);
      const results = await discoverRaspberryPi({
        savedHost: piRemoteForm.host,
        port: Number.isFinite(port) ? port : 22,
        username: piRemoteForm.username.trim() || defaultPiRemoteForm.username,
        password: piRemoteForm.authMode === "password" ? piRemoteForm.password || undefined : undefined,
        privateKeyPath: piRemoteForm.authMode === "privateKey" ? piRemoteForm.privateKeyPath.trim() || undefined : undefined
      });
      const recommended = recommendedPiDiscoveryResult(results);
      setPiDiscoveryResults(results);
      setPiDiscoveryStatus("complete");
      addSystemLog("logs.piDiscoveryComplete", recommended ? "info" : "warn", {
        count: results.filter((result) => result.status !== "offline").length,
        host: recommended?.candidate.host ?? "--"
      });
      if (!recommended) {
        setPiDiscoveryError(t("piRemote.discovery.errors.noHost"));
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t("piRemote.discovery.errors.scanFailed");
      setPiDiscoveryStatus("error");
      setPiDiscoveryError(message);
      addLog("system", message, "error");
    }
  }

  function applyPiDiscoveryHost(host: string) {
    const nextHost = host.trim();
    if (!nextHost) {
      return;
    }
    setPiRemoteForm((current) => ({ ...current, host: nextHost }));
    syncCameraConfigToPiHost(nextHost);
    setPiRemoteError(null);
    setPiDiscoveryError(null);
    addSystemLog("logs.piDiscoveryHostApplied", "info", { host: nextHost });
  }

  async function setupRaspberryPiUsbGadget() {
    if (!window.confirm(t("piRemote.usbRecovery.setupConfirm"))) {
      return;
    }
    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("running");
    setPiRemoteError(null);
    setPiRemoteExecResult(null);
    try {
      const result = await setupPiUsbGadget(piConnectionRequest());
      setPiRemoteExecResult(result.exec);
      setPiRemoteStatus(result.ok ? "complete" : "error");
      addSystemLog("logs.piUsbGadgetConfigured", result.ok ? "info" : "warn", { code: result.exec.exitCode });
      if (!result.ok) {
        setPiRemoteError(result.exec.stderr || result.exec.stdout || t("piRemote.usbRecovery.errors.setupFailed"));
      }
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function setupRaspberryPiWorkspace() {
    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("settingUp");
    setPiRemoteError(null);
    setPiRemoteExecResult(null);
    try {
      const result = await setupPiWorkspace(piConnectionRequest(), piSetupProfile());
      setPiRemoteExecResult(result.exec);
      setPiSetupComplete(result.ok);
      setPiRemoteStatus(result.ok ? "ready" : "error");
      addSystemLog("logs.piWorkspaceReady", result.ok ? "info" : "warn", { path: result.workspaceDir });
      if (!result.ok) {
        setPiRemoteError(result.exec.stderr || result.exec.stdout || t("piRemote.errors.setupFailed"));
      }
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function uploadRaspberryPiFile() {
    if (!piRemoteFile) {
      setPiRemoteError(t("piRemote.errors.selectFile"));
      addSystemLog("logs.piSelectFile", "warn");
      return;
    }

    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("uploading");
    setPiRemoteError(null);
    setPiRemoteUploadResult(null);
    try {
      const result = await uploadPiFile({
        ...piConnectionRequest(),
        file: piRemoteFile,
        remotePath: piRemoteForm.remotePath.trim()
      });
      setPiRemoteUploadResult(result);
      setPiRemoteStatus("complete");
      addSystemLog("logs.piFileUploaded", "info", { path: result.remotePath, size: result.sizeBytes });
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function execRaspberryPiCommand() {
    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("running");
    setPiRemoteError(null);
    setPiRemoteExecResult(null);
    try {
      const result = await execPiCommand(piCommandRequest());
      setPiRemoteExecResult(result);
      setPiRemoteStatus(result.exitCode === 0 ? "complete" : "error");
      addSystemLog("logs.piCommandComplete", result.exitCode === 0 ? "info" : "warn", { code: result.exitCode });
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function runRaspberryPiFile() {
    if (!piRemoteFile) {
      setPiRemoteError(t("piRemote.errors.selectFile"));
      addSystemLog("logs.piSelectFile", "warn");
      return;
    }

    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("running");
    setPiRemoteError(null);
    setPiRemoteUploadResult(null);
    setPiRemoteExecResult(null);
    try {
      const result = await runUploadedFile({
        ...piConnectionRequest(),
        file: piRemoteFile,
        workspaceDir: piRemoteForm.workspaceDir,
        timeoutMs: Number.isFinite(Number(piRemoteForm.timeoutSeconds)) ? Math.round(Number(piRemoteForm.timeoutSeconds) * 1000) : undefined
      });
      setPiRemoteUploadResult(result.upload);
      setPiRunPlan(result.plan);
      setPiRemoteExecResult(result.exec);
      setPiRemoteStatus(!result.exec || result.exec.exitCode === 0 ? "complete" : "error");
      addSystemLog(
        result.exec ? "logs.piUploadAndExecComplete" : "logs.piUploadOnlyComplete",
        !result.exec || result.exec.exitCode === 0 ? "info" : "warn",
        { code: result.exec?.exitCode ?? 0 }
      );
      if (!result.exec) {
        setPiRemoteError(t("piRemote.errors.uploadOnly"));
      }
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function uploadAndExecRaspberryPiFile() {
    await runRaspberryPiFile();
  }

  async function uploadRaspberryPiFileWith(file: File) {
    setPiRemoteFile(file);
    setPiRunPlan(createPiRunPlan(file.name, piRemoteForm.workspaceDir, piRemoteForm.username || defaultPiRemoteForm.username));
    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("uploading");
    setPiRemoteError(null);
    setPiRemoteUploadResult(null);
    try {
      const result = await uploadPiFile({
        ...piConnectionRequest(),
        file,
        remotePath: piRemoteForm.remotePath.trim()
      });
      setPiRemoteUploadResult(result);
      setPiRemoteStatus("complete");
      addSystemLog("logs.piFileUploaded", "info", { path: result.remotePath, size: result.sizeBytes });
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function execRaspberryPiCommandWith(command: string) {
    const timeoutSeconds = Number(piRemoteForm.timeoutSeconds);
    setPiRemoteForm((current) => ({ ...current, command }));
    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("running");
    setPiRemoteError(null);
    setPiRemoteExecResult(null);
    try {
      const result = await execPiCommand({
        ...piConnectionRequest(),
        command,
        cwd: piRemoteForm.cwd.trim() || undefined,
        timeoutMs: Number.isFinite(timeoutSeconds) ? Math.round(timeoutSeconds * 1000) : undefined
      });
      setPiRemoteExecResult(result);
      setPiRemoteStatus(result.exitCode === 0 ? "complete" : "error");
      addSystemLog("logs.piCommandComplete", result.exitCode === 0 ? "info" : "warn", { code: result.exitCode });
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function uploadAndExecRaspberryPiFileWith(file: File, command: string) {
    const timeoutSeconds = Number(piRemoteForm.timeoutSeconds);
    setPiRemoteFile(file);
    setPiRemoteForm((current) => ({ ...current, command }));
    setPiRunPlan(createPiRunPlan(file.name, piRemoteForm.workspaceDir, piRemoteForm.username || defaultPiRemoteForm.username));
    if (!beginPiManagementAction()) {
      return;
    }
    setPiRemoteStatus("running");
    setPiRemoteError(null);
    setPiRemoteUploadResult(null);
    setPiRemoteExecResult(null);
    try {
      const result = await uploadAndExecPiFile({
        ...piConnectionRequest(),
        file,
        remotePath: piRemoteForm.remotePath.trim(),
        command,
        cwd: piRemoteForm.cwd.trim() || undefined,
        timeoutMs: Number.isFinite(timeoutSeconds) ? Math.round(timeoutSeconds * 1000) : undefined
      });
      setPiRemoteUploadResult(result.upload);
      setPiRemoteExecResult(result.exec);
      setPiRemoteStatus(result.exec.exitCode === 0 ? "complete" : "error");
      addSystemLog("logs.piUploadAndExecComplete", result.exec.exitCode === 0 ? "info" : "warn", { code: result.exec.exitCode });
    } catch (error) {
      setPiRemoteFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  function clearPiOutput() {
    setPiRemoteError(null);
    setPiRemoteExecResult(null);
    setPiRemoteUploadResult(null);
    setPiRemoteStatus(piSetupComplete ? "ready" : "idle");
  }

  function setPiCameraFailure(error: unknown) {
    const message = isPiRemoteError(error) ? error.message : error instanceof Error && error.message ? error.message : t("piRemote.camera.errors.requestFailed");
    setPiCameraStatus("error");
    setPiCameraError(message);
    setPiCameraExecResult(null);
    addLog("system", message, "error");
  }

  async function checkRaspberryPiCamera(source: CameraVideoSource = activeCameraSource) {
    if (!beginPiManagementAction()) {
      return;
    }
    setPiCameraStatus("checking");
    setPiCameraError(null);
    setPiCameraExecResult(null);
    try {
      const health = await requestPiHelperHealth();
      setPiHelperHealth(health);
      const result = await checkPiCamera(piConnectionRequest(), piSetupProfile(), source);
      setPiCameraCheck(result);
      setPiCameraStatus(result.streamRunning ? "streaming" : "idle");
      addSystemLog("logs.piCameraChecked", result.cameraAvailable ? "info" : "warn", { device: result.device ?? "--" });
      if (!result.cameraAvailable) {
        setPiCameraError(t("piRemote.camera.errors.noCamera"));
      } else if (!result.ustreamerAvailable) {
        setPiCameraError(t("piRemote.camera.errors.ustreamerMissing"));
      }
    } catch (error) {
      setPiCameraFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function startRaspberryPiCameraStream(source: CameraVideoSource = activeCameraSource, profile: CameraLatencyProfile = cameraConfig.latencyProfile) {
    if (!beginPiManagementAction()) {
      return;
    }
    const profileSettings = CAMERA_LATENCY_PROFILE_SETTINGS[profile] ?? CAMERA_LATENCY_PROFILE_SETTINGS.lowLatency;
    setPiCameraStatus("starting");
    setPiCameraError(null);
    setPiCameraExecResult(null);
    resetCameraSourceRuntime?.(source.id);
    try {
      const health = await requestPiHelperHealth();
      setPiHelperHealth(health);
      const result = await startPiCameraStream(piConnectionRequest(), piSetupProfile(), source, profileSettings);
      setPiCameraExecResult(result.exec);
      setPiCameraStatus(result.ok ? "streaming" : "error");
      if (result.ok) {
        const webrtcAvailable = /webrtc:0/.test(result.exec.stdout);
        setPiCameraCheck((current) => ({
          cameraAvailable: true,
          device: result.device,
          ustreamerAvailable: true,
          webrtcAvailable,
          streamRunning: true,
          streamUrl: result.streamUrl,
          webrtcOfferUrl: result.webrtcOfferUrl,
          stdout: result.exec.stdout,
          stderr: result.exec.stderr
        }));
        setCameraConfig((current) => ({
          ...current,
          videoSources: updateCameraSource(current.videoSources, source.id, { streamUrl: result.streamUrl }),
          ...(source.id === MAIN_CAMERA_SOURCE_ID ? { streamUrl: result.streamUrl, webrtcOfferUrl: result.webrtcOfferUrl } : {})
        }));
        resetCameraSourceRuntime?.(source.id);
        setCameraStreamReloadToken?.((current) => current + 1);
        setCameraStreamLoaded(false);
        setCameraStreamFailed(false);
        addSystemLog("logs.piCameraStarted", "info", { url: result.streamUrl });
      } else {
        setPiCameraError(result.exec.stderr || result.exec.stdout || t("piRemote.camera.errors.startFailed"));
        addSystemLog("logs.piCameraStartFailed", "warn");
      }
    } catch (error) {
      setPiCameraFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function stopRaspberryPiCameraStream(source: CameraVideoSource = activeCameraSource) {
    if (!beginPiManagementAction()) {
      return;
    }
    setPiCameraStatus("stopping");
    setPiCameraError(null);
    try {
      const result = await stopPiCameraStream(piConnectionRequest(), piSetupProfile(), source);
      setPiCameraExecResult(result);
      setPiCameraStatus(result.exitCode === 0 ? "idle" : "error");
      setPiCameraCheck((current) => (current ? { ...current, streamRunning: false } : current));
      addSystemLog("logs.piCameraStopped", result.exitCode === 0 ? "info" : "warn");
      if (result.exitCode !== 0) {
        setPiCameraError(result.stderr || result.stdout || t("piRemote.camera.errors.stopFailed"));
      }
    } catch (error) {
      setPiCameraFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  async function installRaspberryPiCameraTools() {
    if (!window.confirm(t("piRemote.camera.installConfirm"))) {
      return;
    }
    if (!beginPiManagementAction()) {
      return;
    }
    setPiCameraStatus("installing");
    setPiCameraError(null);
    setPiCameraExecResult(null);
    try {
      const result = await installPiCameraTools(piConnectionRequest());
      setPiCameraExecResult(result.exec);
      setPiCameraStatus(result.ok ? "idle" : "error");
      addSystemLog("logs.piCameraToolsInstalled", result.ok ? "info" : "warn");
      if (!result.ok) {
        setPiCameraError(result.exec.stderr || result.exec.stdout || t("piRemote.camera.errors.installFailed"));
      }
    } catch (error) {
      setPiCameraFailure(error);
    } finally {
      endPiManagementAction();
    }
  }

  function clearPiCameraOutput() {
    setPiCameraError(null);
    setPiCameraExecResult(null);
    setPiCameraStatus(piCameraCheck?.streamRunning ? "streaming" : "idle");
  }
  return {
    canExecPiCommand,
    canDiscoverPi,
    canRunPiFile,
    canSetupPiWorkspace,
    canSetupPiUsbGadget,
    canTestPiConnection,
    canUploadAndExecPiFile,
    canUploadPiFile,
    canUsePiCamera,
    checkPiHelper,
    checkRaspberryPiCamera,
    clearPiCameraOutput,
    clearPiOutput,
    applyPiDiscoveryHost,
    discoverRaspberryPiHosts,
    execRaspberryPiCommand,
    execRaspberryPiCommandWith,
    installRaspberryPiCameraTools,
    piAdvancedOpen,
    piCameraAdvancedOpen,
    piCameraBusy,
    piCameraCheck,
    piCameraError,
    piCameraExecResult,
    piCameraStatus,
    piCommandReady,
    piConnectionReady,
    piDiscoveryBusy,
    piDiscoveryError,
    piDiscoveryRecommended,
    piDiscoveryResults,
    piDiscoveryStatus,
    piFileReady,
    piHelperHealth,
    piHelperLabel,
    piOutputLabel,
    piReadiness,
    piRemoteBusy,
    piRemoteError,
    piRemoteExecResult,
    piRemoteFile,
    piRemoteForm,
    piRemoteConfigSaved,
    piRemoteStatus,
    piRemoteStatusTone,
    piRemoteUploadResult,
    piRunPlan,
    piSetupComplete,
    runRaspberryPiFile,
    savePiRemoteConfig,
    setPiAdvancedOpen,
    setPiCameraAdvancedOpen,
    setupRaspberryPiUsbGadget,
    setupRaspberryPiWorkspace,
    startRaspberryPiCameraStream,
    stopRaspberryPiCameraStream,
    syncCameraConfigToPiHost,
    testRaspberryPiConnection,
    clearPiRemoteConfig,
    updatePiRemoteField,
    updatePiRemoteFile,
    uploadAndExecRaspberryPiFile,
    uploadAndExecRaspberryPiFileWith,
    uploadRaspberryPiFileWith,
    uploadRaspberryPiFile
  };
}

export type PiRemoteRuntime = ReturnType<typeof usePiRemote>;
