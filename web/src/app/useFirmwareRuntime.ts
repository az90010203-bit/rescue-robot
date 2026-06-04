import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MotorProfile } from "../lib/protocol";
import { buildTb6618MotorDebuggerIno } from "../lib/arduinoFirmware";
import {
  FirmwareBoardId,
  FirmwareCompileResult,
  FirmwareHelperHealth,
  FirmwarePort,
  compileFirmware,
  isFirmwareUploadError,
  listFirmwarePorts,
  requestFirmwareHealth,
  uploadFirmware
} from "../lib/firmwareUpload";
import { ConnectionMode, FirmwareUploadStatus, LogEntry, LogValues } from "./appModel";

interface UseFirmwareRuntimeOptions {
  addLog: (direction: LogEntry["direction"], text: string, level?: LogEntry["level"]) => void;
  addSystemLog: (messageKey: string, level?: LogEntry["level"], values?: LogValues) => void;
  completeMotorMappingCount: number;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  disconnectSerial: () => Promise<void>;
  motors: MotorProfile[];
}

export function useFirmwareRuntime({
  addLog,
  addSystemLog,
  completeMotorMappingCount,
  connected,
  connectionMode,
  disconnectSerial,
  motors
}: UseFirmwareRuntimeOptions) {
  const { t } = useTranslation();
  const [firmwareBoard, setFirmwareBoard] = useState<FirmwareBoardId>("arduino-uno");
  const [firmwareHelperHealth, setFirmwareHelperHealth] = useState<FirmwareHelperHealth | null>(null);
  const [firmwarePorts, setFirmwarePorts] = useState<FirmwarePort[]>([]);
  const [selectedFirmwarePort, setSelectedFirmwarePort] = useState("");
  const [firmwareJob, setFirmwareJob] = useState<FirmwareCompileResult | null>(null);
  const [firmwareStatus, setFirmwareStatus] = useState<FirmwareUploadStatus>("idle");
  const [firmwareError, setFirmwareError] = useState<string | null>(null);
  const [firmwareLogs, setFirmwareLogs] = useState("");

  const firmwareBusy = firmwareStatus === "checking" || firmwareStatus === "loadingPorts" || firmwareStatus === "compiling" || firmwareStatus === "uploading";
  const firmwareStatusTone: "neutral" | "online" | "warning" | "danger" =
    firmwareStatus === "error" ? "danger" : firmwareStatus === "compiled" || firmwareStatus === "uploaded" ? "online" : firmwareBusy ? "warning" : "neutral";
  const firmwareHelperTone: "neutral" | "online" | "warning" | "danger" =
    firmwareStatus === "checking" ? "warning" : firmwareHelperHealth?.pioAvailable ? "online" : firmwareHelperHealth ? "danger" : "neutral";
  const firmwareHelperLabel =
    firmwareStatus === "checking"
      ? t("status.syncing")
      : firmwareHelperHealth?.pioAvailable
        ? t("status.online")
        : firmwareHelperHealth
          ? t("status.offline")
          : t("status.unknown");
  const firmwareHexLabel = firmwareJob ? `${Math.max(1, Math.round(firmwareJob.hexSizeBytes / 1024))} KB` : "--";
  const canCompileFirmware = !firmwareBusy && firmwareHelperHealth?.pioAvailable === true;
  const canUploadFirmware = !firmwareBusy && Boolean(firmwareJob && selectedFirmwarePort && firmwareHelperHealth?.pioAvailable);

  function setFirmwareFailure(error: unknown) {
    const message = isFirmwareUploadError(error) ? error.message : error instanceof Error && error.message ? error.message : t("firmware.errors.requestFailed");
    setFirmwareError(message);
    setFirmwareLogs(isFirmwareUploadError(error) && error.logs ? error.logs : message);
    setFirmwareStatus("error");
    addLog("system", message, "error");
  }

  async function checkFirmwareHelper(log = true): Promise<FirmwareHelperHealth | null> {
    setFirmwareStatus("checking");
    setFirmwareError(null);
    try {
      const health = await requestFirmwareHealth();
      setFirmwareHelperHealth(health);
      setFirmwareStatus(health.pioAvailable ? "idle" : "error");
      setFirmwareError(health.pioAvailable ? null : t("firmware.errors.platformioMissing"));
      if (log) {
        addSystemLog(health.pioAvailable ? "logs.firmwareHelperReady" : "logs.firmwareHelperMissing", health.pioAvailable ? "info" : "warn");
      }
      return health;
    } catch (error) {
      setFirmwareHelperHealth(null);
      setFirmwareStatus("error");
      setFirmwareError(t("firmware.errors.helperUnavailable"));
      setFirmwareLogs(isFirmwareUploadError(error) && error.logs ? error.logs : "");
      if (log) {
        addSystemLog("logs.firmwareHelperUnavailable", "warn");
      }
      return null;
    }
  }

  async function ensureFirmwareHelperAvailable(): Promise<boolean> {
    if (firmwareHelperHealth?.pioAvailable) {
      return true;
    }
    const health = await checkFirmwareHelper(false);
    if (!health?.pioAvailable) {
      setFirmwareStatus("error");
      setFirmwareError(health ? t("firmware.errors.platformioMissing") : t("firmware.errors.helperUnavailable"));
      addSystemLog(health ? "logs.firmwareHelperMissing" : "logs.firmwareHelperUnavailable", "warn");
      return false;
    }
    return true;
  }

  async function refreshFirmwarePorts() {
    if (!(await ensureFirmwareHelperAvailable())) {
      return;
    }

    setFirmwareStatus("loadingPorts");
    setFirmwareError(null);
    try {
      const ports = await listFirmwarePorts();
      setFirmwarePorts(ports);
      setSelectedFirmwarePort((current) => (ports.some((port) => port.path === current) ? current : ports[0]?.path ?? ""));
      setFirmwareStatus("idle");
      addSystemLog("logs.firmwarePortsRefreshed", "info", { count: ports.length });
    } catch (error) {
      setFirmwareFailure(error);
    }
  }

  async function compileArduinoFirmware() {
    if (completeMotorMappingCount === 0) {
      setFirmwareStatus("error");
      setFirmwareError(t("firmware.errors.noCompleteMapping"));
      addSystemLog("logs.firmwareNoCompleteMapping", "warn");
      return;
    }
    if (!(await ensureFirmwareHelperAvailable())) {
      return;
    }

    setFirmwareStatus("compiling");
    setFirmwareError(null);
    setFirmwareJob(null);
    try {
      const result = await compileFirmware({
        board: firmwareBoard,
        source: buildTb6618MotorDebuggerIno(motors)
      });
      setFirmwareJob(result);
      setFirmwareLogs(result.logs);
      setFirmwareStatus("compiled");
      addSystemLog("logs.firmwareCompileComplete", "info", { size: result.hexSizeBytes });
    } catch (error) {
      setFirmwareFailure(error);
    }
  }

  async function uploadCompiledArduinoFirmware(portOverride?: string) {
    const targetPort = String(portOverride || selectedFirmwarePort).trim();
    if (!firmwareJob) {
      addSystemLog("logs.firmwareCompileFirst", "warn");
      return;
    }
    if (!targetPort) {
      addSystemLog("logs.firmwareSelectPort", "warn");
      return;
    }
    if (!(await ensureFirmwareHelperAvailable())) {
      return;
    }

    setFirmwareStatus("uploading");
    setFirmwareError(null);
    try {
      if (connected && connectionMode === "controller") {
        await disconnectSerial();
      }
      const result = await uploadFirmware({ jobId: firmwareJob.jobId, port: targetPort });
      setFirmwareJob(null);
      setFirmwareLogs(result.logs);
      setFirmwareStatus("uploaded");
      addSystemLog("logs.firmwareUploadComplete");
    } catch (error) {
      setFirmwareFailure(error);
    }
  }

  return {
    canCompileFirmware,
    canUploadFirmware,
    checkFirmwareHelper,
    compileArduinoFirmware,
    firmwareBoard,
    firmwareBusy,
    firmwareError,
    firmwareHelperHealth,
    firmwareHelperLabel,
    firmwareHelperTone,
    firmwareHexLabel,
    firmwareJob,
    firmwareLogs,
    firmwarePorts,
    firmwareStatus,
    firmwareStatusTone,
    refreshFirmwarePorts,
    selectedFirmwarePort,
    setFirmwareBoard,
    setFirmwareJob,
    setFirmwareStatus,
    setSelectedFirmwarePort,
    uploadCompiledArduinoFirmware
  };
}
