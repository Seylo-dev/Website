import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import { brand, installCommand, links } from "@/lib/site";
import { InstallCommand } from "./install-command";

const promises = ["Open source", brand.license, "Self-hosted"];

export function Hero() {
  return (
    <section
      aria-label="Intro"
      className="relative mx-auto flex max-w-[1200px] flex-col items-center px-6 pt-21 pb-16 text-center"
    >
      <a
        href={`${links.docs}/guides/adding-nodes`}
        className="inline-flex items-center gap-2.5 rounded-lg bg-accent/10 py-1 pr-3 pl-1 text-[13.5px] shadow-[inset_0_0_0_1px_rgb(107_151_255/0.24)]"
      >
        <span className="rounded-md bg-accent px-2 py-0.75 text-xs font-semibold text-white">New</span>
        Deploy to many nodes from one panel
        <IconArrowRight size={14} stroke={2.2} className="text-accent-bright" aria-hidden />
      </a>

      <h1 className="mt-7 max-w-[960px] text-[clamp(42px,6vw,84px)] leading-none font-semibold tracking-[-0.048em]">
        <span className="text-ink">All your servers.</span>
        <br />
        <span className="text-ink-dim">One calm panel.</span>
      </h1>
      <p className="mt-6.5 max-w-[640px] text-[19px] leading-[1.55] text-ink-soft">
        Deploy apps, databases and compose stacks to as many Linux servers as you own. Push to GitHub, {brand.name}{" "}
        builds it, checks it, and switches traffic without downtime.
      </p>

      <div className="mt-9 flex w-full justify-center">
        <InstallCommand command={installCommand} />
      </div>
      <p className="mt-3 text-[13.5px] text-ink-muted">
        Starts the panel and makes this server its first node. Add more servers from the panel.
      </p>

      <div className="mt-7.5 flex flex-wrap items-center justify-center gap-x-6.5 gap-y-3.5">
        <a
          href={links.install}
          className="flex h-11.5 items-center gap-2.25 rounded-lg bg-accent pr-4.5 pl-5 text-[15px] font-medium text-white shadow-[0_1px_2px_rgb(37_99_235/0.3),0_4px_12px_rgb(37_99_235/0.18)] hover:bg-blue-500 hover:text-white"
        >
          Get started
          <IconArrowRight size={16} stroke={2.2} aria-hidden />
        </a>
        <a href="#how" className="flex items-center gap-2 text-[15px] font-medium text-ink-body">
          See how it works
          <IconArrowRight size={16} stroke={2.2} className="text-ink-muted" aria-hidden />
        </a>
      </div>

      <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-ink-muted">
        {promises.map((promise) => (
          <li key={promise} className="flex items-center gap-1.5">
            <IconCheck size={14} stroke={2.4} className="text-accent-bright" aria-hidden />
            {promise}
          </li>
        ))}
      </ul>
    </section>
  );
}
