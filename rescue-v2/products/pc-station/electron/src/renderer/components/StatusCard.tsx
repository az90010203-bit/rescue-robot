interface StatusCardProps {
  readonly label: string;
  readonly value: string;
  readonly state?: "bad" | "good" | "neutral" | "warning";
  readonly detail?: string | undefined;
}

/** Compact, consistent hardware or service state readout. */
export function StatusCard({
  label,
  value,
  state = "neutral",
  detail
}: StatusCardProps): React.JSX.Element {
  return (
    <article className={`status-card ${state}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail === undefined ? null : <small>{detail}</small>}
    </article>
  );
}
