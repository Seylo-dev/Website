import { brand } from "@/lib/site";

const rows = [
  {
    name: "il-tlv-1",
    tag: "Wings detected",
    dot: "bg-wings-violet-dot",
    halo: "bg-wings-violet-halo",
    chip: "bg-wings-violet-chip text-wings-violet-fg",
  },
  {
    name: "cs2-retake-01, cs2-mm-04",
    tag: "priority",
    dot: "bg-wings-green-dot",
    halo: "bg-wings-green-halo",
    chip: "bg-wings-green-chip text-wings-green-fg",
  },
  {
    name: "api, worker, umami",
    tag: "share the rest",
    dot: "bg-wings-gray-dot",
    halo: "bg-wings-gray-halo",
    chip: "bg-wings-gray-chip text-wings-gray-fg",
  },
];

export function NextToWings() {
  return (
    <section aria-label="Next to game servers" className="mx-auto max-w-[1200px] px-6 pb-24">
      <div className="lift flex flex-wrap items-center gap-10 rounded-2xl bg-surface p-[clamp(24px,4vw,44px)]">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5">
          <span className="text-[13.5px] font-medium text-accent-bright">Already running Pterodactyl or Pelican?</span>
          <h2 className="text-[clamp(28px,3vw,36px)] leading-[1.1] font-semibold tracking-[-0.03em] text-ink">
            Runs next to your game servers. No extra VM.
          </h2>
          <p className="text-base leading-[1.6] text-ink-soft">
            {brand.name} shares the node&apos;s proxy with Wings and never touches containers it didn&apos;t create. One
            switch gives game servers first claim on the CPU, so a big build can&apos;t cause lag.
          </p>
        </div>
        <ul className="flex min-w-0 flex-[1_1_340px] flex-col gap-2 font-mono text-[13px]">
          {rows.map((row) => (
            <li
              key={row.name}
              className="hairline flex items-center gap-3 rounded-[10px] bg-surface-sunken px-3 py-2.5 text-ink-body"
            >
              <span aria-hidden className={`flex size-8 shrink-0 items-center justify-center rounded-full ${row.halo}`}>
                <span className={`size-2 rounded-full ${row.dot}`} />
              </span>
              <span className="min-w-0 truncate">{row.name}</span>
              <span
                className={`ml-auto rounded-md px-2 py-0.75 font-sans text-xs font-medium whitespace-nowrap ${row.chip}`}
              >
                {row.tag}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
