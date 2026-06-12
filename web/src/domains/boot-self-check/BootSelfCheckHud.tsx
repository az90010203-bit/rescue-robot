import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Lock, Play, RotateCcw, ShieldCheck, Unlock, Wrench, XCircle } from "lucide-react";
import type { TFunction } from "i18next";
import {
  bootSelfCheckRunTone,
  bootSelfCheckStepTone,
  type BootSelfCheckRepairAction,
  type BootSelfCheckStatus,
  type BootSelfCheckStepStatus
} from "@domains/boot-self-check/bootSelfCheck";
import type { BootSelfCheckRuntime } from "@domains/boot-self-check/useBootSelfCheckRuntime";
import { PanelTitle } from "@shared/ui/AppChrome";

interface BootSelfCheckHudProps {
  runtime: BootSelfCheckRuntime;
  t: TFunction;
}

export function BootSelfCheckHud({ runtime, t }: BootSelfCheckHudProps) {
  const [open, setOpen] = useState(false);
  const run = runtime.run;
  const gate = runtime.gate;
  const tone = bootSelfCheckRunTone(run?.status ?? "idle");
  const steps = run?.steps ?? [];
  const completedCount = steps.filter((step) => step.status !== "pending" && step.status !== "running").length;
  const repairActions = run?.repairActions ?? [];
  const running = run?.status === "running";
  const title = t("bootSelfCheck.title", { defaultValue: "开机自检" });
  const summary = run?.summary ?? t("bootSelfCheck.idle", { defaultValue: "进入主控台后自动运行一次开机自检。" });
  const status = statusLabel(run?.status ?? "idle", t);

  return (
    <aside className={`boot-self-check-dock ${tone}${open ? " open" : ""}`} aria-label={title}>
      <button
        aria-controls="boot-self-check-drawer"
        aria-expanded={open}
        className={`boot-self-check-trigger ${tone}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="boot-self-check-trigger-icon">{gate.locked ? <Lock size={17} /> : <ShieldCheck size={17} />}</span>
        <span className="boot-self-check-trigger-copy">
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <span className="boot-self-check-trigger-status">{status}</span>
        <span className="boot-self-check-trigger-count">{steps.length ? `${completedCount}/${steps.length}` : "--"}</span>
        {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {open ? (
        <section className={`boot-self-check-panel ${tone}`} id="boot-self-check-drawer" aria-labelledby="boot-self-check-title">
          <div className="boot-self-check-head">
            <PanelTitle
              icon={<ShieldCheck size={18} />}
              id="boot-self-check-title"
              meta={t("bootSelfCheck.meta", { defaultValue: "Startup check" })}
              title={title}
            />
            <div className="boot-self-check-actions">
              {running ? (
                <button className="icon-button" onClick={runtime.cancelRun} type="button">
                  <XCircle size={16} />
                  <span>{t("bootSelfCheck.actions.cancel", { defaultValue: "取消" })}</span>
                </button>
              ) : (
                <button className="icon-button primary" onClick={() => void runtime.runSelfCheck({ manual: true })} type="button">
                  {run ? <RotateCcw size={16} /> : <Play size={16} />}
                  <span>{run ? t("bootSelfCheck.actions.rerun", { defaultValue: "重新自检" }) : t("bootSelfCheck.actions.run", { defaultValue: "运行自检" })}</span>
                </button>
              )}
              {gate.locked ? (
                <button className="icon-button danger" onClick={runtime.overrideGate} type="button">
                  <Unlock size={16} />
                  <span>{t("bootSelfCheck.actions.override", { defaultValue: "临时解除" })}</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="boot-self-check-summary">
            <span className={`boot-self-check-state ${tone}`}>{gate.locked ? <Lock size={18} /> : <ShieldCheck size={18} />}</span>
            <div>
              <strong>{summary}</strong>
              <span>{gate.reason}</span>
            </div>
          </div>

          <div className="boot-self-check-metrics">
            <Metric label={t("bootSelfCheck.metrics.status", { defaultValue: "状态" })} value={status} tone={tone} />
            <Metric label={t("bootSelfCheck.metrics.steps", { defaultValue: "步骤" })} value={`${completedCount}/${steps.length || "--"}`} />
            <Metric label={t("bootSelfCheck.metrics.repairs", { defaultValue: "待确认修复" })} value={String(repairActions.length)} tone={repairActions.length > 0 ? "warning" : "neutral"} />
            <Metric label={t("bootSelfCheck.metrics.gate", { defaultValue: "门禁" })} value={gate.locked ? t("bootSelfCheck.gate.locked", { defaultValue: "锁定" }) : t("bootSelfCheck.gate.open", { defaultValue: "放行" })} tone={gate.locked ? "danger" : "online"} />
          </div>

          {steps.length > 0 ? (
            <div className="boot-self-check-timeline" aria-label={t("bootSelfCheck.timeline", { defaultValue: "自检时间线" })}>
              {steps.map((step) => (
                <div className={`boot-self-check-step ${bootSelfCheckStepTone(step.status)}`} key={step.id}>
                  <span className="boot-self-check-step-icon">{stepIcon(step.status)}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.message}</small>
                    {step.evidence.length > 0 ? (
                      <div className="boot-self-check-evidence">
                        {step.evidence.slice(0, 3).map((item, index) => (
                          <code key={`${step.id}:${index}`}>{item}</code>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {repairActions.length > 0 ? (
            <div className="boot-self-check-repairs">
              <div className="boot-self-check-section-title">
                <Wrench size={15} />
                <strong>{t("bootSelfCheck.repairs.title", { defaultValue: "确认后修复队列" })}</strong>
              </div>
              {repairActions.slice(0, 5).map((action) => (
                <RepairActionCard action={action} busy={runtime.busyRepairActionIds.includes(action.id)} key={action.id} onRun={() => void runtime.runRepairAction(action)} t={t} />
              ))}
            </div>
          ) : null}

          {run?.auditLog.length ? (
            <details className="boot-self-check-audit">
              <summary>{t("bootSelfCheck.audit", { defaultValue: "巡检日志" })}</summary>
              <div>
                {run.auditLog.slice(-8).map((item, index) => (
                  <code key={`${item}:${index}`}>{item}</code>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
}

function Metric({ label, tone = "neutral", value }: { label: string; tone?: "neutral" | "online" | "warning" | "danger"; value: string }) {
  return (
    <div className={`boot-self-check-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RepairActionCard({ action, busy, onRun, t }: { action: BootSelfCheckRepairAction; busy: boolean; onRun: () => void; t: TFunction }) {
  return (
    <div className={`boot-self-check-repair ${action.status ?? "pending"}`}>
      <div>
        <strong>{action.label}</strong>
        <span>{action.description}</span>
        {action.result ? <code>{action.result}</code> : null}
      </div>
      <button className="icon-button" disabled={busy || action.status === "running"} onClick={onRun} type="button">
        <Wrench size={15} />
        <span>{busy ? t("bootSelfCheck.repairs.running", { defaultValue: "执行中" }) : t("bootSelfCheck.repairs.confirm", { defaultValue: "确认执行" })}</span>
      </button>
    </div>
  );
}

function statusLabel(status: BootSelfCheckStatus, t: TFunction): string {
  const labels: Record<BootSelfCheckStatus, string> = {
    idle: t("bootSelfCheck.status.idle", { defaultValue: "待机" }),
    running: t("bootSelfCheck.status.running", { defaultValue: "自检中" }),
    passed: t("bootSelfCheck.status.passed", { defaultValue: "通过" }),
    warning: t("bootSelfCheck.status.warning", { defaultValue: "有建议" }),
    failed: t("bootSelfCheck.status.failed", { defaultValue: "锁定" }),
    cancelled: t("bootSelfCheck.status.cancelled", { defaultValue: "已取消" })
  };
  return labels[status];
}

function stepIcon(status: BootSelfCheckStepStatus) {
  if (status === "passed") {
    return <CheckCircle2 size={16} />;
  }
  if (status === "failed" || status === "cancelled") {
    return <XCircle size={16} />;
  }
  if (status === "warning") {
    return <AlertTriangle size={16} />;
  }
  if (status === "running") {
    return <RotateCcw size={16} />;
  }
  return <ShieldCheck size={16} />;
}
