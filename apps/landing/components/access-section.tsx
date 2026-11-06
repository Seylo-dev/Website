import {
  IconFingerprint,
  IconHistory,
  IconKey,
  IconRobot,
  IconTerminal2,
  IconUsers,
  type Icon,
} from "@tabler/icons-react";
import { captures } from "@/lib/captures";
import { CopyCode } from "./copy-code";
import { Shot } from "./shot";

interface Item {
  title: string;
  body: string;
  icon: Icon;
  command?: string;
}

const items: Item[] = [
  {
    title: "Roles and grants",
    body: "Owner, admin and member. Members reach only the projects and services you grant them, down to single actions.",
    icon: IconUsers,
  },
  {
    title: "2FA and passkeys",
    body: "Authenticator codes with recovery codes, and passkeys. New keys and sign-in changes ask you to confirm it's you.",
    icon: IconFingerprint,
  },
  {
    title: "Scoped API keys",
    body: "Limited to the actions and projects you pick, read-only if you like, with an expiry date.",
    icon: IconKey,
  },
  {
    title: "An audit log",
    body: "Every change through the panel, the API, MCP or the assistant, and every refused attempt. Filter it, export it.",
    icon: IconHistory,
  },
  {
    title: "A CLI for your laptop",
    body: "Login opens the panel in your browser: type the code your terminal shows, pick what the key may do, approve.",
    icon: IconTerminal2,
    command: "seylo login https://panel.example.com",
  },
  {
    title: "MCP with an approvals queue",
    body: "AI tools start read-only. Deletes and anything that can't be undone wait in Approvals until a person says yes; the rest runs only with the actions you gave the token.",
    icon: IconRobot,
  },
];

/** People and access: a compact list on the left, the approvals queue and the people table on the right. */
export function AccessSection() {
  return (
    <section id="access" aria-label="People and access" className="mx-auto max-w-[1200px] scroll-mt-8 px-6 pb-28">
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-9">
          <div className="rise flex flex-col gap-3.5">
            <span className="text-[13.5px] font-medium text-accent-bright">People and access</span>
            <h2 className="text-[clamp(32px,4vw,44px)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-ink">
              Let people and tools in, one scope at a time.
            </h2>
          </div>
          <ul className="flex flex-col gap-6">
            {items.map(({ title, body, icon: ItemIcon, command }) => (
              <li key={title} className="rise flex gap-4">
                <span
                  aria-hidden
                  className="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-accent/16 text-accent-icon"
                >
                  <ItemIcon size={17} stroke={1.8} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
                  <p className="text-[14.5px] leading-[1.6] text-ink-card">{body}</p>
                  {command ? (
                    <div className="mt-1.5">
                      <CopyCode command={command} label="Copy the login command" />
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:pt-28">
          <Shot capture={captures.approvals} className="rise" />
          <Shot capture={captures.people} phoneCut className="rise" />
        </div>
      </div>
    </section>
  );
}
