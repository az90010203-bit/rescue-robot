import { Activity } from "lucide-react";
import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type Tone = "danger" | "neutral" | "online" | "warning";

export interface AppLogEntry {
  id: number;
  direction: "rx" | "tx" | "system";
  level?: "info" | "warn" | "error";
  messageKey?: string;
  text?: string;
  values?: Record<string, string | number | boolean>;
}

export function PanelTitle({ icon, id, meta, title }: { icon: ReactNode; id?: string; meta?: string; title: string }) {
  return (
    <div className="panel-title">
      <div className="panel-title-main">
        {icon}
        <h2 id={id}>{title}</h2>
      </div>
      {meta && <span className="panel-meta">{meta}</span>}
    </div>
  );
}

export function StatusCard({ label, tone = "neutral", value }: { label: string; tone?: Tone; value: string }) {
  return (
    <div className={`status-card ${tone}`}>
      <span className="status-led" />
      <span className="status-copy">
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

export function Metric({
  className,
  code = false,
  label,
  suffix = "",
  tone = "neutral",
  value
}: {
  className?: string;
  code?: boolean;
  label: string;
  suffix?: string;
  tone?: Tone;
  value: string | number | boolean | undefined | null;
}) {
  const displayValue = value === undefined || value === null ? "--" : String(value);
  return (
    <div className={`${className ? `${className} ` : ""}metric ${tone}`.trim()}>
      <span>{label}</span>
      {code ? (
        <code>
          {displayValue}
          {suffix}
        </code>
      ) : (
        <strong>
          {displayValue}
          {suffix}
        </strong>
      )}
    </div>
  );
}

export function LogPanel({ logs }: { logs: AppLogEntry[] }) {
  const { t } = useTranslation();
  return (
    <section className="panel log-panel" aria-labelledby="log-title">
      <PanelTitle icon={<Activity size={18} />} id="log-title" meta={t("meta.eventCount", { count: logs.length })} title={t("panels.eventLog")} />
      <div className="log-list">
        {logs.length === 0 ? (
          <div className="empty-state">{t("empty.noLogs")}</div>
        ) : (
          logs.map((log) => (
            <div className={`log-entry ${log.direction} ${log.level ?? "info"}`} key={log.id}>
              <span>{log.direction.toUpperCase()}</span>
              <code>{log.text ?? t(log.messageKey ?? "", log.values)}</code>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
