import { Activity, Check, Crosshair, Radar, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import type { ServoFeedbackMap } from "../../app/appModel";
import {
  analyzeArmTuning,
  forwardKinematics2d,
  solvePlanarIk,
  type ArmIkSolution,
  type ArmJointTuningResult
} from "../../lib/armKinematics";
import type { ArmConfig } from "../../lib/storage";
import type { ServoProfile } from "../../lib/protocol";
import { Metric } from "../../shared/ui/AppChrome";

interface ArmKinematicsPanelProps {
  armConfig: ArmConfig;
  runArmTuningProbe: () => Promise<boolean>;
  servoBusConnected: () => boolean;
  servoFeedback: ServoFeedbackMap;
  servoSafetyEnabled: boolean;
  servos: ServoProfile[];
  setArmConfig: (value: ArmConfig | ((current: ArmConfig) => ArmConfig)) => void;
  t: TFunction;
}

export function ArmKinematicsPanel({
  armConfig,
  runArmTuningProbe,
  servoBusConnected,
  servoFeedback,
  servoSafetyEnabled,
  servos,
  setArmConfig,
  t
}: ArmKinematicsPanelProps) {
  const kinematics = useMemo(() => forwardKinematics2d(armConfig, { servos }), [armConfig, servos]);
  const tuningReport = useMemo(() => analyzeArmTuning(armConfig, servoFeedback, { servos }), [armConfig, servoFeedback, servos]);
  const [targetX, setTargetX] = useState(() => formatNumber(kinematics.endEffector.x));
  const [targetY, setTargetY] = useState(() => formatNumber(kinematics.endEffector.y));
  const [ikSolution, setIkSolution] = useState<ArmIkSolution | null>(null);
  const [ikError, setIkError] = useState("");
  const [probeBusy, setProbeBusy] = useState(false);
  const [lastAction, setLastAction] = useState("");
  const canProbe = servoBusConnected() && servoSafetyEnabled && tuningReport.canProbe && !probeBusy;
  const suggestionCount = tuningReport.suggestedCount;

  function setTargetFromCurrent() {
    setTargetX(formatNumber(kinematics.endEffector.x));
    setTargetY(formatNumber(kinematics.endEffector.y));
    setIkError("");
  }

  function solveIk() {
    const x = Number(targetX);
    const y = Number(targetY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      setIkSolution(null);
      setIkError(t("arm.ikInvalidTarget"));
      return;
    }
    const solution = solvePlanarIk(armConfig, { x, y }, { servos });
    setIkSolution(solution);
    setIkError("");
  }

  function applyIkSolution() {
    if (!ikSolution) {
      return;
    }
    setArmConfig((current) => ({
      ...current,
      joints: current.joints.map((joint) => ikSolution.config.joints.find((item) => item.id === joint.id) ?? joint)
    }));
    setLastAction(t("arm.ikApplied"));
  }

  function applyTuningSuggestions() {
    if (suggestionCount === 0) {
      return;
    }
    setArmConfig((current) => ({
      ...current,
      joints: current.joints.map((joint) => {
        const result = tuningReport.joints.find((item) => item.jointId === joint.id);
        return result && hasSuggestion(result)
          ? { ...joint, speedRaw: result.suggestedSpeedRaw, acc: result.suggestedAcc }
          : joint;
      })
    }));
    setLastAction(t("arm.tuningApplied", { count: suggestionCount }));
  }

  async function handleProbe() {
    setProbeBusy(true);
    setLastAction("");
    try {
      const ok = await runArmTuningProbe();
      setLastAction(ok ? t("arm.tuningProbeComplete") : t("arm.tuningProbeFailed"));
    } finally {
      setProbeBusy(false);
    }
  }

  return (
    <section className="arm-kinematics-panel">
      <div className="panel-heading-row">
        <div>
          <p className="eyebrow">{t("arm.kinematicsEyebrow")}</p>
          <h3>{t("panels.armKinematics")}</h3>
        </div>
        <span className={`tuning-status ${tuningReport.status}`}>{t(`arm.tuningStatus.${tuningReport.status}`)}</span>
      </div>

      <div className="arm-status-strip arm-kinematics-metrics">
        <Metric label={t("metrics.endX")} value={formatNumber(kinematics.endEffector.x)} suffix=" px" />
        <Metric label={t("metrics.endY")} value={formatNumber(kinematics.endEffector.y)} suffix=" px" />
        <Metric label={t("metrics.reach")} value={formatNumber(kinematics.totalLengthPx)} suffix=" px" />
        <Metric label={t("metrics.suggestions")} value={suggestionCount} tone={suggestionCount > 0 ? "warning" : "online"} />
        <Metric label={t("metrics.safety")} value={servoSafetyEnabled ? t("status.ready") : t("status.standby")} tone={servoSafetyEnabled ? "online" : "warning"} />
      </div>

      <div className="command-grid arm-ik-grid">
        <label>
          <span>{t("fields.targetX")}</span>
          <input type="number" step={1} value={targetX} onChange={(event) => setTargetX(event.target.value)} />
        </label>
        <label>
          <span>{t("fields.targetY")}</span>
          <input type="number" step={1} value={targetY} onChange={(event) => setTargetY(event.target.value)} />
        </label>
        <button className="icon-button" onClick={setTargetFromCurrent} type="button">
          <RefreshCw size={18} />
          <span>{t("actions.useCurrentTarget")}</span>
        </button>
        <button className="icon-button primary" onClick={solveIk} type="button">
          <Crosshair size={18} />
          <span>{t("actions.solveIk")}</span>
        </button>
      </div>

      <div className="arm-status-strip arm-ik-metrics">
        <Metric label={t("metrics.ikError")} value={ikSolution ? formatNumber(ikSolution.errorPx) : "--"} suffix={ikSolution ? " px" : ""} tone={ikSolution?.converged ? "online" : ikSolution ? "warning" : "neutral"} />
        <Metric label={t("metrics.ikIterations")} value={ikSolution?.iterations ?? "--"} />
        <Metric label={t("metrics.reachable")} value={ikSolution ? t(ikSolution.reachable ? "common.yes" : "common.no") : "--"} tone={ikSolution?.reachable ? "online" : ikSolution ? "warning" : "neutral"} />
      </div>

      {ikError ? <div className="empty-state compact">{ikError}</div> : null}
      {ikSolution ? (
        <div className="arm-ik-result-list">
          {ikSolution.config.joints.map((joint) => (
            <span key={joint.id}>
              <strong>{joint.name}</strong>
              <code>{formatNumber(joint.angleDeg)} deg</code>
            </span>
          ))}
        </div>
      ) : null}

      <div className="action-grid arm-tuning-actions">
        <button className="icon-button" disabled={!ikSolution} onClick={applyIkSolution} type="button">
          <Check size={18} />
          <span>{t("actions.applyIk")}</span>
        </button>
        <button className="icon-button" onClick={() => setLastAction(t("arm.tuningAnalyzed"))} type="button">
          <Activity size={18} />
          <span>{t("actions.analyzeArm")}</span>
        </button>
        <button className="icon-button" disabled={!canProbe} onClick={() => void handleProbe()} type="button">
          <Radar size={18} />
          <span>{probeBusy ? t("status.probing") : t("actions.probeArmTuning")}</span>
        </button>
        <button className="icon-button primary" disabled={suggestionCount === 0} onClick={applyTuningSuggestions} type="button">
          <SlidersHorizontal size={18} />
          <span>{t("actions.applyTuning")}</span>
        </button>
      </div>

      <div className="arm-tuning-list">
        {tuningReport.joints.map((result) => (
          <div className={`arm-tuning-row ${result.severity}`} key={result.jointId}>
            <div className="arm-tuning-main">
              <strong>{result.name}</strong>
              <span>ID {result.servoId} / {t("metrics.error")} {result.positionErrorDeg === undefined ? "--" : formatNumber(result.positionErrorDeg)} deg</span>
            </div>
            <div className="arm-tuning-values">
              <span>
                {t("fields.speedRaw")} <code>{result.speedRaw}</code>{" -> "}<code>{result.suggestedSpeedRaw}</code>
              </span>
              <span>
                {t("fields.acceleration")} <code>{result.acc}</code>{" -> "}<code>{result.suggestedAcc}</code>
              </span>
            </div>
            <div className="arm-tuning-reasons">
              {result.reasons.map((reason) => (
                <span key={reason}>{t(`arm.tuningReasons.${reason}`)}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {lastAction ? <div className="arm-tuning-note">{lastAction}</div> : null}
    </section>
  );
}

function hasSuggestion(result: ArmJointTuningResult) {
  return result.suggestedSpeedRaw !== result.speedRaw || result.suggestedAcc !== result.acc;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
}
