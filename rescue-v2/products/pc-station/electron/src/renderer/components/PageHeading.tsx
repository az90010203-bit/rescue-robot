interface PageHeadingProps {
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
}

/** Page-local heading that communicates control scope and safety boundary. */
export function PageHeading({
  kicker,
  title,
  description
}: PageHeadingProps): React.JSX.Element {
  return (
    <div className="page-heading">
      <span>{kicker}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
