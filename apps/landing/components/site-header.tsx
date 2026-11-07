import { IconBrandGithub, IconChevronDown } from "@tabler/icons-react";
import Link from "next/link";
import { links } from "@/lib/site";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

interface MenuItem {
  label: string;
  href: string;
}

const featureMenu: MenuItem[] = [
  { label: "Zero-downtime deploys", href: `${links.docs}/features/zero-downtime-deploys` },
  { label: "Domains and HTTPS", href: `${links.docs}/guides/domains-and-https` },
  { label: "Databases", href: `${links.docs}/guides/databases` },
  { label: "Compose stacks", href: `${links.docs}/guides/compose-stacks` },
  { label: "Crash policy and alerts", href: `${links.docs}/features/crash-policy-and-alerts` },
  { label: "MCP and AI", href: `${links.docs}/features/mcp-and-ai` },
];

const docsMenu: MenuItem[] = [
  { label: "Introduction", href: links.docs },
  { label: "Installation", href: links.install },
  { label: "Your first deploy", href: `${links.docs}/first-deploy` },
  { label: "Adding nodes", href: `${links.docs}/guides/adding-nodes` },
  { label: "CLI reference", href: `${links.docs}/reference/cli` },
];

/**
 * A hover/focus dropdown. CSS only: `focus-within` keeps it open while a keyboard user tabs
 * through the items, so no client JavaScript is needed for these menus.
 */
function NavMenu({ label, items }: { label: string; items: MenuItem[] }) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        className="flex cursor-pointer items-center gap-1.5 py-1 text-ink-soft transition-colors hover:text-ink group-focus-within:text-ink"
      >
        {label}
        <IconChevronDown
          size={12}
          stroke={2.2}
          className="text-ink-muted transition-transform group-hover:rotate-180"
          aria-hidden
        />
      </button>
      <div className="invisible absolute top-full left-0 z-20 pt-3 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 sm:left-1/2 sm:-translate-x-1/2">
        <ul className="hairline-strong min-w-56 rounded-xl bg-surface/95 p-1.5 shadow-[var(--shadow-menu)] backdrop-blur-md">
          {items.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="block rounded-lg px-3 py-2 text-sm whitespace-nowrap hover:bg-hover">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SiteHeader() {
  return (
    <div className="relative z-10 px-4 pt-4 sm:px-6">
      <header className="mx-auto flex min-h-15 max-w-[1200px] flex-wrap items-center gap-x-7.5 gap-y-3 rounded-xl border border-nav-line bg-nav py-2.5 pr-3 pl-4.5 shadow-[var(--shadow-nav)] backdrop-blur-md">
        <Link href="/" aria-label="Home">
          <Logo />
        </Link>
        {/* Phones: logo, theme and GitHub on the first row, the links on a row of their own below. */}
        <nav
          aria-label="Site"
          className="order-last flex w-full flex-wrap items-center gap-x-6 gap-y-1 pb-1 text-sm sm:order-none sm:w-auto sm:pb-0"
        >
          <NavMenu label="Features" items={featureMenu} />
          <NavMenu label="Docs" items={docsMenu} />
          <a href={links.apiReference}>API</a>
          <a href={links.changelog}>Changelog</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <a
            href={links.github}
            className="hairline-strong flex h-9 items-center gap-2 rounded-lg bg-quiet px-3.5 text-sm font-medium text-ink"
          >
            <IconBrandGithub size={16} aria-hidden />
            Star on GitHub
          </a>
        </div>
      </header>
    </div>
  );
}
