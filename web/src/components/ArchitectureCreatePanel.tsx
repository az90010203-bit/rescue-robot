import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type ArchitectureCreateStep = {
  label: string;
  tone?: "active" | "done" | "muted";
};

interface ArchitectureCreatePanelProps {
  bodyClassName?: string;
  children: ReactNode;
  className?: string;
  icon: ReactNode;
  meta: string;
  onToggle: () => void;
  open: boolean;
  steps?: ArchitectureCreateStep[];
  summary?: ReactNode;
  title: string;
  toggleClosedLabel?: string;
  toggleOpenLabel?: string;
}

export function ArchitectureCreatePanel({
  bodyClassName = "",
  children,
  className = "",
  icon,
  meta,
  onToggle,
  open,
  steps = [],
  summary,
  title,
  toggleClosedLabel,
  toggleOpenLabel
}: ArchitectureCreatePanelProps) {
  const { t } = useTranslation();
  const panelClassName = ["panel architecture-builder-panel architecture-create-panel", open ? "expanded" : "collapsed", className].filter(Boolean).join(" ");
  const bodyClassNames = ["architecture-create-body", bodyClassName].filter(Boolean).join(" ");
  const closedLabel = toggleClosedLabel ?? t("architecture.create.expandConfig", { defaultValue: "展开配置" });
  const openLabel = toggleOpenLabel ?? t("architecture.create.collapseLeft", { defaultValue: "向左收起" });
  const toggleLabel = open ? openLabel : closedLabel;

  return (
    <section className={panelClassName}>
      <div className="architecture-create-head">
        <div className="panel-title architecture-panel-title">
          <div className="panel-title-main">
            {icon}
            <h3>{title}</h3>
          </div>
          <span className="panel-meta">{meta}</span>
        </div>
        <button className="icon-button architecture-create-toggle" aria-expanded={open} aria-label={toggleLabel} onClick={onToggle} title={toggleLabel} type="button">
          {open ? <ChevronsLeft size={16} /> : <ChevronsRight size={16} />}
          <span>{toggleLabel}</span>
        </button>
      </div>

      {open && summary ? <div className="architecture-create-summary">{summary}</div> : null}

      {open && steps.length > 0 ? (
        <div className="architecture-create-steps" aria-label={t("architecture.create.stepsAria", { title, defaultValue: `${title} steps` })}>
          {steps.map((step, index) => (
            <span className={`architecture-create-step ${step.tone ?? "muted"}`} key={`${step.label}-${index}`}>
              <span>{index + 1}</span>
              {step.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className={bodyClassNames} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
