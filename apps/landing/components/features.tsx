import {
  IconBell,
  IconDatabase,
  IconGitBranch,
  IconPalette,
  IconServer2,
  IconSparkles,
  IconStack2,
  IconTerminal2,
  IconWorld,
  type Icon,
} from "@tabler/icons-react";
import { SectionHeading } from "./section-heading";

interface Feature {
  key: string;
  title: string;
  body: string;
  icon: Icon;
}

const features: Feature[] = [
  {
    key: "deploy",
    title: "Push to deploy, zero downtime",
    body: "GitHub, any Git host, Docker images or a Dockerfile. A failed health check keeps the old version live.",
    icon: IconGitBranch,
  },
  {
    key: "nodes",
    title: "Many servers, one panel",
    body: "Germany, the US, your closet. Each node keeps running its apps even when the panel is down.",
    icon: IconServer2,
  },
  {
    key: "data",
    title: "Databases that stay private",
    body: "Postgres, MySQL, Mongo and Redis on a private network, reachable by name. Expose one with SSL when you need to.",
    icon: IconDatabase,
  },
  {
    key: "compose",
    title: "Compose stacks and templates",
    body: "Paste a compose file or install from the catalog. Every container gets logs, domains and restarts.",
    icon: IconStack2,
  },
  {
    key: "domains",
    title: "Domains on autopilot",
    body: "A wildcard per node gives every service a domain. Custom domains get HTTPS on their own.",
    icon: IconWorld,
  },
  {
    key: "alerts",
    title: "Crash reports that say why",
    body: "Restarts on crash, the last log lines in your inbox, Discord or any webhook.",
    icon: IconBell,
  },
  {
    key: "console",
    title: "Console, shell and files",
    body: "Type into the running app, open a shell, browse volumes, all from the browser.",
    icon: IconTerminal2,
  },
  {
    key: "mcp",
    title: "Built for AI assistants",
    body: "An MCP server lets Claude deploy, read logs, change env and open a dev tunnel. Read-only by default; deletes wait for your approval.",
    icon: IconSparkles,
  },
  {
    key: "brand",
    title: "Yours to brand",
    body: "White label, theme presets, custom CSS and your own maintenance pages.",
    icon: IconPalette,
  },
];

export function Features() {
  return (
    <section aria-label="Features" className="relative mx-auto flex max-w-[1200px] flex-col gap-11 px-6 pt-2 pb-26">
      <SectionHeading eyebrow="Features" title="Everything a small platform team would build. Already built.">
        One panel, any number of nodes, and the boring parts handled: certificates, restarts, cleanup, updates.
      </SectionHeading>
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
        {features.map(({ key, title, body, icon: FeatureIcon }) => (
          <li key={key} className="hairline flex flex-col gap-3 rounded-xl bg-surface p-6">
            <div className="mb-1 flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-8.5 items-center justify-center rounded-lg bg-accent/16 text-accent-icon"
              >
                <FeatureIcon size={17} stroke={1.8} />
              </span>
              <span className="ml-auto font-mono text-xs text-ink-muted">{key}</span>
            </div>
            <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
            <p className="text-[14.5px] leading-[1.6] text-ink-card">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
