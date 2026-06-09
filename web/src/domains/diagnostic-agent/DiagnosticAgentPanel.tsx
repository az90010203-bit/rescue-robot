import { Bot, ChevronDown, ChevronUp, RotateCcw, Send, ShieldCheck, Stethoscope } from "lucide-react";
import { FormEvent, useState } from "react";
import type { TFunction } from "i18next";
import { canAutoRunDiagnosticAction, type DiagnosticAgentAction, type DiagnosticAgentIssue } from "@domains/diagnostic-agent/diagnosticAgent";
import type { DiagnosticAgentRuntime } from "@domains/diagnostic-agent/useDiagnosticAgentRuntime";
import { PanelTitle } from "@shared/ui/AppChrome";

interface DiagnosticAgentPanelProps {
  className?: string;
  runtime: DiagnosticAgentRuntime;
  t: TFunction;
}

export function DiagnosticAgentPanel({ className, runtime, t }: DiagnosticAgentPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const issueCount = runtime.latestResponse.issues.filter((issue) => issue.severity !== "info").length;
  const lowRiskCount = runtime.latestResponse.actions.filter(canAutoRunDiagnosticAction).length;
  const panelClassName = ["panel diagnostic-agent-panel", collapsed ? "collapsed" : "", className ?? ""].filter(Boolean).join(" ");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runtime.sendDraft();
  }

  return (
    <section className={panelClassName} aria-labelledby="diagnostic-agent-title">
      <div className="diagnostic-agent-head">
        <PanelTitle
          icon={<Bot size={18} />}
          id="diagnostic-agent-title"
          meta={t("diagnosticAgent.meta", { defaultValue: "Local rules" })}
          title={t("diagnosticAgent.title", { defaultValue: "Diagnostic Copilot" })}
        />
        <button
          aria-expanded={!collapsed}
          className="icon-only"
          onClick={() => setCollapsed((current) => !current)}
          title={collapsed ? t("diagnosticAgent.expand", { defaultValue: "Expand" }) : t("diagnosticAgent.collapse", { defaultValue: "Collapse" })}
          type="button"
        >
          {collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="diagnostic-agent-status">
            <span className={issueCount > 0 ? "warning" : "online"}>
              <ShieldCheck size={15} />
              {t("diagnosticAgent.status.issues", { count: issueCount, defaultValue: "{{count}} issues" })}
            </span>
            <span>
              <Stethoscope size={15} />
              {t("diagnosticAgent.status.lowRisk", { count: lowRiskCount, defaultValue: "{{count}} checks" })}
            </span>
          </div>

          <div className="diagnostic-agent-toolbar">
            <button className="icon-button primary" disabled={runtime.busy} onClick={() => void runtime.runQuickDiagnosis()} type="button">
              <Stethoscope size={16} />
              <span>{t("diagnosticAgent.actions.quickCheck", { defaultValue: "Run diagnosis" })}</span>
            </button>
            <button className="icon-button" disabled={runtime.busy} onClick={runtime.clearMessages} type="button">
              <RotateCcw size={16} />
              <span>{t("diagnosticAgent.actions.reset", { defaultValue: "Reset" })}</span>
            </button>
          </div>

          <div className="diagnostic-agent-thread">
            {runtime.messages.map((message) => (
              <article className={`diagnostic-agent-message ${message.role}`} key={message.id}>
                <p>{message.text}</p>
                {message.issues && message.issues.length > 0 ? <IssueList issues={message.issues.slice(0, 4)} /> : null}
                {message.actions && message.actions.length > 0 ? <ActionList actions={message.actions} runtime={runtime} t={t} /> : null}
              </article>
            ))}
          </div>

          <form className="diagnostic-agent-compose" onSubmit={handleSubmit}>
            <textarea
              disabled={runtime.busy}
              onChange={(event) => runtime.setDraft(event.target.value)}
              placeholder={t("diagnosticAgent.placeholder", { defaultValue: "Ask about camera, servo feedback, Pi, firmware..." })}
              rows={2}
              value={runtime.draft}
            />
            <button className="icon-only" disabled={runtime.busy || !runtime.draft.trim()} title={t("diagnosticAgent.actions.send", { defaultValue: "Send" })} type="submit">
              <Send size={17} />
            </button>
          </form>
        </>
      )}
    </section>
  );
}

function IssueList({ issues }: { issues: DiagnosticAgentIssue[] }) {
  return (
    <div className="diagnostic-agent-issues">
      {issues.map((issue) => (
        <div className={`diagnostic-agent-issue ${issue.severity}`} key={issue.id}>
          <strong>{issue.title}</strong>
          <span>{issue.message}</span>
          <div className="diagnostic-agent-evidence">
            {issue.evidence.slice(0, 3).map((item, index) => (
              <code key={`${issue.id}:${index}`}>{item}</code>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionList({ actions, runtime, t }: { actions: DiagnosticAgentAction[]; runtime: DiagnosticAgentRuntime; t: TFunction }) {
  return (
    <div className="diagnostic-agent-actions">
      {actions.map((action) => {
        const canRun = canAutoRunDiagnosticAction(action);
        const busy = runtime.busyActionIds.includes(action.id);
        return (
          <div className={`diagnostic-agent-action ${action.risk}`} key={action.id}>
            <div>
              <strong>{action.label}</strong>
              <span>{action.description}</span>
            </div>
            <button
              className={canRun ? "icon-button" : "icon-button"}
              disabled={!canRun || busy}
              onClick={() => void runtime.runAction(action)}
              type="button"
            >
              <span>
                {canRun
                  ? busy
                    ? t("diagnosticAgent.actions.running", { defaultValue: "Running" })
                    : t("diagnosticAgent.actions.run", { defaultValue: "Run" })
                  : action.risk === "confirm"
                    ? t("diagnosticAgent.risk.confirm", { defaultValue: "Confirm" })
                    : t("diagnosticAgent.risk.blocked", { defaultValue: "Manual" })}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
