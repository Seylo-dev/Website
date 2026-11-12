import { IconArrowRight } from "@tabler/icons-react";
import { links } from "@/lib/site";

export function GetStarted() {
  return (
    // Light has no divider line, so its wash sits behind the buttons and fades out before the footer instead of
    // ending on the section's bottom edge.
    <section
      aria-label="Get started"
      className="border-t border-line bg-[radial-gradient(720px_340px_at_50%_100%,var(--color-cta-wash),transparent_70%)] light:border-t-0 light:bg-[radial-gradient(760px_300px_at_50%_68%,var(--color-cta-wash),transparent_70%)]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4.5 px-6 py-24 text-center">
        <span className="text-[13.5px] font-medium text-accent-bright">Get started</span>
        <h2 className="text-[clamp(38px,4.5vw,56px)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink">
          Own your platform.
        </h2>
        <p className="text-[17px] text-ink-soft">Free and open source. Bring a Linux server; the installer adds Docker if it is missing.</p>
        <div className="mt-2.5 flex flex-wrap justify-center gap-3">
          <a
            href={links.install}
            className="flex h-11.5 items-center gap-2.25 rounded-lg bg-accent pr-4.5 pl-5 text-[15px] font-medium text-on-accent shadow-[var(--shadow-accent)] hover:bg-accent-hover hover:text-on-accent"
          >
            Read the install guide
            <IconArrowRight size={16} stroke={2.2} aria-hidden />
          </a>
          <a
            href={links.github}
            className="hairline-strong flex h-11.5 items-center rounded-lg bg-quiet px-5 text-[15px] font-medium text-ink"
          >
            View the source
          </a>
        </div>
      </div>
    </section>
  );
}
