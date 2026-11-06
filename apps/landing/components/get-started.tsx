import { IconArrowRight } from "@tabler/icons-react";
import { links } from "@/lib/site";

export function GetStarted() {
  return (
    <section
      aria-label="Get started"
      className="border-t border-slate-400/10 bg-[radial-gradient(720px_340px_at_50%_100%,rgb(37_99_235/0.18),rgb(37_99_235/0)_70%)]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4.5 px-6 py-24 text-center">
        <span className="text-[13.5px] font-medium text-accent-bright">Get started</span>
        <h2 className="text-[clamp(38px,4.5vw,56px)] leading-[1.04] font-semibold tracking-[-0.045em] text-ink">
          Own your platform.
        </h2>
        <p className="text-[17px] text-ink-soft">Free and open source. Bring a server with Docker.</p>
        <div className="mt-2.5 flex flex-wrap justify-center gap-3">
          <a
            href={links.install}
            className="flex h-11.5 items-center gap-2.25 rounded-lg bg-accent pr-4.5 pl-5 text-[15px] font-medium text-white shadow-[0_1px_2px_rgb(37_99_235/0.3),0_4px_12px_rgb(37_99_235/0.18)] hover:bg-blue-500 hover:text-white"
          >
            Read the install guide
            <IconArrowRight size={16} stroke={2.2} aria-hidden />
          </a>
          <a
            href={links.github}
            className="hairline-strong flex h-11.5 items-center rounded-lg bg-slate-400/10 px-5 text-[15px] font-medium text-ink"
          >
            View the source
          </a>
        </div>
      </div>
    </section>
  );
}
