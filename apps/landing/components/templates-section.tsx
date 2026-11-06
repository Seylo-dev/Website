import { IconArrowRight, IconCode } from "@tabler/icons-react";
import { captures } from "@/lib/captures";
import { links } from "@/lib/site";
import { catalog } from "@/lib/templates";
import { Chips, Shot } from "./shot";

const facts = [
  "See the services before anything is created",
  "Passwords generated for you",
  "Template code runs sandboxed",
];

export function TemplatesSection() {
  return (
    <section
      id="templates"
      aria-label="Templates"
      className="mx-auto flex max-w-[1200px] scroll-mt-8 flex-col gap-12 px-6 pb-28"
    >
      <div className="grid items-center gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="rise flex flex-col gap-4">
          <span className="text-[13.5px] font-medium text-accent-bright">Templates</span>
          <h2 className="text-[clamp(32px,4vw,44px)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-ink">
            {catalog.length} apps, one click each.
          </h2>
          <p className="text-[17px] leading-[1.55] text-ink-soft">
            n8n, Plausible, Grafana, Vaultwarden and the rest install as normal services: a pinned image, a database
            when it needs one, a domain and its own passwords. Change anything afterwards.
          </p>
          <Chips items={facts} className="mt-1" />
          <a
            href={`${links.docs}/guides/templates`}
            className="mt-2 flex w-fit items-center gap-2 text-[15px] font-medium text-ink-body"
          >
            How templates work
            <IconArrowRight size={16} stroke={2.2} className="text-ink-muted" aria-hidden />
          </a>
        </div>
        <Shot capture={captures.templates} phoneCut className="rise" />
      </div>

      <ul
        aria-label="The template catalog"
        className="rise grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
      >
        {catalog.map((template) => (
          <li
            key={template.slug}
            className="flex min-w-0 items-center gap-2.5 rounded-xl bg-surface p-2.5 sm:gap-3 sm:p-3"
          >
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[12px] font-semibold text-white sm:size-9 sm:rounded-[9px] sm:text-[12.5px]"
              style={{ backgroundColor: template.color }}
            >
              {template.monogram}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[14px] leading-[1.3] font-medium text-ink">{template.name}</span>
              <span className="hidden text-[12.5px] leading-[1.35] text-ink-muted sm:block">{template.category}</span>
            </span>
          </li>
        ))}
        <li className="flex min-w-0 items-center gap-2.5 rounded-xl bg-accent/12 p-2.5 sm:gap-3 sm:p-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-accent/25 text-accent-icon sm:size-9 sm:rounded-[9px]"
          >
            <IconCode size={17} stroke={2} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] leading-[1.3] font-medium text-ink">Your own</span>
            <span className="hidden text-[12.5px] leading-[1.35] text-ink-muted sm:block">Added through the API</span>
          </span>
        </li>
      </ul>
    </section>
  );
}
