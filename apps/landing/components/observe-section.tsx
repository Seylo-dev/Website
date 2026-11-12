import { type Capture, captures } from "@/lib/captures";
import { Chips, Shot } from "./shot";
import { SectionHeading } from "./section-heading";

// The notification channel kinds of Settings > Notifications (packages/ops notifications.channelKinds), then
// the installable app's push notifications (packages/ops push), which each person turns on for their devices.
const channels = ["Email", "Discord", "Slack", "Telegram", "ntfy", "Pushover", "Gotify", "Webhooks", "Push to your phone"];

function Figure({
  capture,
  title,
  children,
  className = "",
  phoneCut = false,
}: {
  capture: Capture;
  title: string;
  children: React.ReactNode;
  className?: string;
  /** Wide crops: drawn larger on phones and cut on the right (see Shot). */
  phoneCut?: React.ComponentProps<typeof Shot>["phoneCut"];
}) {
  return (
    <figure className={`rise flex min-w-0 flex-col gap-4 ${className}`}>
      <Shot capture={capture} phoneCut={phoneCut} />
      <figcaption className="flex flex-col gap-1.5">
        <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
        <span className="text-[14.5px] leading-[1.6] text-ink-card">{children}</span>
      </figcaption>
    </figure>
  );
}

/** Logs, metrics, uptime and alerts: captioned screenshots, then the channels alerts go to. */
export function ObserveSection() {
  return (
    <section
      id="observe"
      aria-label="Logs, metrics and alerts"
      className="mx-auto flex max-w-[1200px] scroll-mt-8 flex-col gap-11 px-6 pb-28"
    >
      <SectionHeading eyebrow="Logs, metrics, alerts" title="See what your apps are doing.">
        Every service gets logs, metrics, uptime checks and crash reports. No second tool to install.
      </SectionHeading>

      <div className="grid gap-x-8 gap-y-12 lg:grid-cols-12">
        <Figure capture={captures.logs} title="Logs across deploys" phoneCut className="lg:col-span-7">
          Search every deploy&apos;s logs, not just the running one, or follow them live. The console, a shell and a
          file browser for the volumes open in the browser too.
        </Figure>
        <div className="flex min-w-0 flex-col gap-12 lg:col-span-5">
          <Figure capture={captures.metrics} title="Metrics per service">
            CPU, memory and network, average and peak, from live up to 30 days.
          </Figure>
          <Figure capture={captures.uptime} title="Uptime checks and crash reports" phoneCut="medium">
            A URL checked on an interval, with its latency history. A crash alert carries the exit code and the last 100
            log lines.
          </Figure>
        </div>
      </div>

      <div className="rise lift flex flex-col gap-4 rounded-2xl bg-surface p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-10">
        <div className="flex flex-col gap-1.5 lg:max-w-[440px]">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Alerts where you already look</h3>
          <p className="text-[14.5px] leading-[1.6] text-ink-card">
            Choose which events go where: crashes, failed builds and deploys, health checks, uptime, certificates,
            backups, cron runs, disk space, offline nodes, approvals waiting. Panel-wide defaults, changeable per service.
          </p>
        </div>
        <Chips items={channels} className="lg:ml-auto lg:justify-end" />
      </div>
    </section>
  );
}
