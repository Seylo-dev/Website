export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex max-w-[700px] flex-col gap-3.5">
      <span className="text-[13.5px] font-medium text-accent-bright">{eyebrow}</span>
      <h2 className="text-[clamp(32px,4vw,44px)] leading-[1.08] font-semibold tracking-[-0.035em] text-ink">{title}</h2>
      {children ? <p className="text-[17px] leading-[1.55] text-ink-soft">{children}</p> : null}
    </div>
  );
}
