import { Radar, RotateCw, Square, Usb } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPluginInstance, updatePluginInstance } from "../../lib/dataService";
import type { AboardBridgeCommandResult } from "../../lib/piAboardBridge";
import type { PcCommand } from "../../lib/protocol";
import type { PluginInstance } from "../../platform/architecture";
import type { MotorFeedbackMap, ServoFeedbackMap } from "../../platform/stateStore";
import {
  autoAddDetectedPlugins,
  type DetectionRunResult,
  type GamepadDetectionSummary,
  type PiDetectionProfile
} from "./pluginAutoDetect";
import { runPluginAutoDetection, type PluginAutoDetectPhaseKey } from "./detectors";

interface PluginAutoDetectPanelProps {
  gamepads?: GamepadDetectionSummary[];
  motorFeedback?: MotorFeedbackMap;
  onFinished: () => Promise<void>;
  piProfile?: PiDetectionProfile | null;
  pluginInstances: PluginInstance[];
  projectId: string;
  sendAboardBridgeCanServoCommand?: (command: PcCommand, options?: { log?: boolean }) => Promise<AboardBridgeCommandResult | null>;
  nextCommandSeq?: () => number;
  servoFeedback?: ServoFeedbackMap;
}

export function PluginAutoDetectPanel({
  gamepads = [],
  motorFeedback = {},
  nextCommandSeq,
  onFinished,
  piProfile,
  pluginInstances,
  projectId,
  sendAboardBridgeCanServoCommand,
  servoFeedback = {}
}: PluginAutoDetectPanelProps) {
  const { t } = useTranslation();
  const [result, setResult] = useState<DetectionRunResult | null>(null);
  const [phaseKey, setPhaseKey] = useState<PluginAutoDetectPhaseKey>("ready");
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  async function runDetection() {
    if (running) {
      return;
    }
    cancelRef.current = false;
    setRunning(true);
    setPhaseKey("scanning");
    const detection = await runPluginAutoDetection({
      canceled: () => cancelRef.current,
      gamepads,
      motorFeedback,
      nextCommandSeq,
      onPhase: setPhaseKey,
      piProfile,
      sendAboardBridgeCanServoCommand,
      servoFeedback
    });
    setPhaseKey("addingPlugins");
    const nextResult = await autoAddDetectedPlugins(
      projectId,
      detection.candidates,
      pluginInstances,
      { createPluginInstance, updatePluginInstance },
      { nowMs: detection.nowMs, shouldContinue: () => !cancelRef.current }
    );
    const withLogs = { ...nextResult, logs: [...detection.logs, ...nextResult.logs] };
    setResult(withLogs);
    setPhaseKey(cancelRef.current ? "canceled" : "complete");
    setRunning(false);
    if (withLogs.created.length > 0 || withLogs.skipped.length > 0) {
      await onFinished();
    }
  }

  function cancelDetection() {
    cancelRef.current = true;
    setPhaseKey("canceling");
  }

  const summary = result
    ? t("pluginAutoDetect.summary.result", {
        created: result.created.length,
        skipped: result.skipped.length,
        failed: result.failed.length
      })
    : t("pluginAutoDetect.summary.noRun");

  return (
    <section className="plugin-auto-detect-panel" aria-label={t("pluginAutoDetect.aria")}>
      <div className="plugin-auto-detect-head">
        <div>
          <strong>{t("pluginAutoDetect.title")}</strong>
          <small>{t(`pluginAutoDetect.phase.${phaseKey}`)}</small>
        </div>
        <div className="plugin-auto-detect-actions">
          {running ? (
            <button className="icon-button danger" onClick={cancelDetection} type="button">
              <Square size={16} />
              <span>{t("pluginAutoDetect.actions.cancel")}</span>
            </button>
          ) : (
            <button className="icon-button primary" onClick={() => void runDetection()} type="button">
              <Radar size={16} />
              <span>{t("pluginAutoDetect.actions.detectDevices")}</span>
            </button>
          )}
        </div>
      </div>
      <div className="plugin-auto-detect-metrics">
        <span><small>{t("pluginAutoDetect.metrics.candidates")}</small><strong>{result?.candidates.length ?? "--"}</strong></span>
        <span><small>{t("pluginAutoDetect.metrics.created")}</small><strong>{result?.created.length ?? "--"}</strong></span>
        <span><small>{t("pluginAutoDetect.metrics.skipped")}</small><strong>{result?.skipped.length ?? "--"}</strong></span>
        <span><small>{t("pluginAutoDetect.metrics.failed")}</small><strong>{result?.failed.length ?? "--"}</strong></span>
      </div>
      <div className="plugin-auto-detect-summary">
        <Usb size={15} />
        <span>{summary}</span>
        {running && <RotateCw className="plugin-auto-detect-spin" size={15} />}
      </div>
      {result && (
        <div className="plugin-auto-detect-log">
          {result.logs.slice(-10).map((line, index) => (
            <code key={`${line}:${index}`}>{line}</code>
          ))}
        </div>
      )}
    </section>
  );
}
