import { type Capture, captures } from "@/lib/captures";
import { Chips, Shot } from "./shot";
import { SectionHeading } from "./section-heading";

interface Row {
  title: string;
  body: React.ReactNode;
  chips: string[];
  capture: Capture;
  /** Tall crops are cut at a fixed height and fade into the page. */
  tall?: boolean;
}

const rows: Row[] = [
  {
    title: "Live graphs for every node",
    body: "CPU, memory, disk and network, live or over 30 days, next to the machine's facts and the services it runs. Nodes dial out to the panel, so they need no open port for it.",
    chips: ["Live to 30 days", "Machine facts", "Agent logs", "Reboot"],
    capture: captures.nodeGraphs,
    tall: true,
  },
  {
    title: "Replicas across nodes, or a clean move",
    body: (
      <>
        Run copies on several nodes. Every node&apos;s edge spreads requests over all replicas, and the entry node takes
        the public traffic. Moving a service deploys it on the new node, copies its volumes, switches traffic and only
        then removes the old copy. If anything fails, it stays where it was.
      </>
    ),
    chips: ["Load balanced", "Entry node", "Sticky sessions", "Volumes move with it"],
    capture: captures.replicas,
  },
  {
    title: "A health check with the fix",
    body: (
      <>
        16 checks per node: kernel, disk, Docker, cgroups, ports, proxy, DNS, firewall, clock, the panel connection and
        more. Each problem comes with the step that fixes it. Updates roll the panel first, then one node at a time, and
        a node that fails to start the new version rolls back by itself.
      </>
    ),
    chips: ["16 checks", "Auto-update", "Panel first, then node by node", "Rollback"],
    capture: captures.nodeHealth,
    tall: true,
  },
];

/** Nodes, in alternating text and screenshot rows. */
export function NodesSection() {
  return (
    <section
      id="nodes"
      aria-label="Nodes"
      className="mx-auto flex max-w-[1200px] scroll-mt-8 flex-col gap-14 px-6 pb-28"
    >
      <SectionHeading eyebrow="Nodes" title="Many servers, one panel.">
        Add a server with one command from the panel. Each node keeps its services running, restarting and routing on
        its own, even while the panel is down.
      </SectionHeading>
      <div className="flex flex-col gap-16 lg:gap-20">
        {rows.map((row, index) => (
          <div
            key={row.title}
            className={`grid items-center gap-x-14 gap-y-8 ${
              index % 2 === 0
                ? "lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]"
                : "lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
            }`}
          >
            <div className={`rise flex min-w-0 flex-col gap-3.5 ${index % 2 === 0 ? "lg:order-2" : ""}`}>
              <h3 className="text-[clamp(22px,2.4vw,28px)] leading-[1.15] font-semibold tracking-[-0.025em] text-ink">
                {row.title}
              </h3>
              <p className="text-[16px] leading-[1.6] text-ink-soft">{row.body}</p>
              <Chips items={row.chips} className="mt-1.5" />
            </div>
            <div className={`rise min-w-0 ${index % 2 === 0 ? "lg:order-1" : ""}`}>
              <Shot
                capture={row.capture}
                fade={row.tall}
                className={`mx-auto max-w-[560px] ${row.tall ? "max-h-[min(560px,110vw)]" : ""}`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
