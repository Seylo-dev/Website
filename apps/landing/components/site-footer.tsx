import { brand, links } from "@/lib/site";
import { LogoMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-400/10">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-5.5 gap-y-3 px-6 py-7 text-[13.5px] text-ink-muted">
        <span className="flex items-center gap-2 text-ink-soft">
          <LogoMark size={18} />
          {brand.name} · {brand.license}
        </span>
        <a href={links.docs} className="text-ink-muted">
          Docs
        </a>
        <a href={links.apiReference} className="text-ink-muted">
          API
        </a>
        <a href={links.github} className="text-ink-muted">
          GitHub
        </a>
        <a href={links.changelog} className="text-ink-muted">
          Changelog
        </a>
        <span className="ml-auto">Telemetry is anonymous and can be turned off in Settings.</span>
      </div>
    </footer>
  );
}
