import Image from "next/image";
import { captures } from "@/lib/captures";
import { CellShot, Chips } from "./shot";
import { SectionHeading } from "./section-heading";

function CellText({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 p-5 pb-6 sm:p-6 sm:pb-6">
      <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      <p className="text-[14.5px] leading-[1.6] text-ink-card">{children}</p>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-chip px-1 py-px font-mono text-[13px] text-ink-code">{children}</code>;
}

/** The per-service settings as a bento: each cell a real crop of the screen that holds them. */
export function SettingsSection() {
  return (
    <section
      id="settings"
      aria-label="Service settings"
      className="mx-auto flex max-w-[1200px] scroll-mt-8 flex-col gap-11 px-6 pb-28"
    >
      <SectionHeading eyebrow="Per service" title="Settings you'd otherwise script.">
        What usually lives in a Traefik file, a cron job or a wiki page is a field on the service, applied by the node.
      </SectionHeading>

      <ul className="grid gap-4 lg:grid-cols-12">
        <li className="rise flex flex-col overflow-hidden rounded-2xl bg-surface lg:col-span-7">
          <CellText title="Env that knows your other services">
            <Code>{"${{redis.INTERNAL_URL}}"}</Code> resolves on every deploy. The editor underlines a reference this
            node can&apos;t reach and offers the fix. Hover one to see its value.
          </CellText>
          <div className="mt-auto overflow-hidden pl-5 sm:pl-6">
            <div className="relative w-[480px] sm:w-[600px] lg:w-[640px]">
              <Image
                src={captures.env.src}
                alt={captures.env.alt}
                width={captures.env.width}
                height={captures.env.height}
                unoptimized
                className="cell-shot block h-auto w-full rounded-t-[10px]"
              />
              {/* The editor's hover for ${{api.URL}}, a separate crop of the same screen, over the empty lines. */}
              <Image
                src={captures.envHover.src}
                alt={captures.envHover.alt}
                width={captures.envHover.width}
                height={captures.envHover.height}
                unoptimized
                className="hover-shot absolute top-[63%] left-[24%] h-auto w-[41%] rounded-md"
              />
            </div>
          </div>
        </li>

        <li className="rise flex flex-col overflow-hidden rounded-2xl bg-surface lg:col-span-5">
          <CellText title="Access rules per domain">
            Basic auth, an IP allowlist, a rate limit and regex redirects on each domain. No middleware files to edit.
          </CellText>
          <CellShot capture={captures.domainAccess} widthClass="w-[400px]" />
        </li>

        <li className="rise flex flex-col overflow-hidden rounded-2xl bg-surface lg:col-span-7 lg:row-span-2">
          <CellText title="Health checks that gate deploys">
            TCP, an HTTP request with path, host and expected status, or a command. A new version gets traffic only
            after it passes; if it never does, the old one keeps serving.
          </CellText>
          <CellShot capture={captures.healthCheck} widthClass="w-[480px] sm:w-[600px] lg:w-[640px]" />
        </li>

        <li className="rise flex flex-col overflow-hidden rounded-2xl bg-surface lg:col-span-5">
          <CellText title="A crash policy, not a restart loop">
            Restart after a fixed 5 seconds, stop after N crashes in a row, and get one alert per streak instead of one
            per crash.
          </CellText>
          <CellShot capture={captures.crashPolicy} widthClass="w-[400px]" />
        </li>

        <li className="rise flex flex-col overflow-hidden rounded-2xl bg-surface lg:col-span-5">
          <CellText title="Timed expose, locked to your IP">
            A port open for 5 minutes to 24 hours, only to the IPs you list. The node closes it on time, even with the
            panel down.
          </CellText>
          <CellShot capture={captures.timedExpose} widthClass="w-[400px]" />
        </li>

        <li className="rise flex flex-col gap-5 rounded-2xl bg-surface p-5 sm:p-6 lg:col-span-12 lg:flex-row lg:items-center lg:gap-10">
          <div className="flex flex-col gap-2 lg:max-w-[560px]">
            <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Maintenance and down pages</h3>
            <p className="text-[14.5px] leading-[1.6] text-ink-card">
              One switch puts one service, or all of them, behind a maintenance page that answers 503. A down page shows
              by itself while a service is stopped, on its first deploy or unreachable.
            </p>
          </div>
          <Chips
            items={["Built-in page with your message", "Your own HTML, scripts off", "Per service or panel-wide"]}
            className="lg:ml-auto lg:max-w-[420px] lg:justify-end"
          />
        </li>
      </ul>
    </section>
  );
}
