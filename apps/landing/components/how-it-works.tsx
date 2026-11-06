import { CopyCode } from "@/components/copy-code";
import { brand, installCommand } from "@/lib/site";

const steps = [
  {
    title: "Install the panel",
    command: installCommand,
    body: "Runs the panel as a service on this server and makes it the first node.",
  },
  {
    title: "Join more servers",
    command: `curl -fsSL https://${brand.urls.install} | sudo sh -s -- join --panel <panel> --token <token>`,
    body: "Copy the exact command from the panel's Add node card. Each node dials out to the panel: no inbound port for the agent, no VPN, instant across continents.",
  },
  {
    title: "Deploy",
    command: "git push origin main",
    body: "Built with Railpack or your Dockerfile, health checked, then switched over. The old version stays until the new one works.",
  },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      aria-label="How it works"
      className="mx-auto flex max-w-[1200px] scroll-mt-8 flex-col gap-11 px-6 pb-26"
    >
      <div className="flex flex-col gap-3.5">
        <span className="text-[13.5px] font-medium text-accent-bright">How it works</span>
        <h2 className="text-[clamp(32px,4vw,44px)] leading-[1.08] font-semibold tracking-[-0.035em] text-ink">
          Three commands from bare server to live app.
        </h2>
      </div>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-y-8">
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <li key={step.title} className="flex flex-col gap-3.5 pr-7">
              <div className="-mr-7 flex items-center">
                <span
                  className={`flex size-9.5 shrink-0 items-center justify-center rounded-lg font-mono text-[13px] font-medium ${
                    last
                      ? "bg-accent text-white"
                      : "bg-surface text-accent-icon shadow-[inset_0_0_0_1px_rgb(107_151_255/0.35)]"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden
                  className={`h-px flex-1 ${last ? "bg-gradient-to-r from-slate-400/20 to-transparent" : "bg-slate-400/20"}`}
                />
              </div>
              <h3 className="mt-1.5 text-[17px] font-semibold text-ink">{step.title}</h3>
              <CopyCode command={step.command} label={`Copy the command: ${step.title}`} />
              <p className="text-[14.5px] leading-[1.6] text-ink-card">{step.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
