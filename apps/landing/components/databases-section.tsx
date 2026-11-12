import { IconCloudUpload, IconLock, IconTerminal2, IconUsers, type Icon } from "@tabler/icons-react";
import { captures } from "@/lib/captures";
import { Shot } from "./shot";

// The engines New database offers and their badges as the panel shows them (apps/web service kind
// badges). KeyDB, Dragonfly and ClickHouse still run, from templates and the API, but the form does not
// offer them for now.
const engines = [
  { name: "PostgreSQL", badge: "PG", tone: "bg-tone-sky text-tone-sky-fg" },
  { name: "MySQL", badge: "MY", tone: "bg-tone-sky text-tone-sky-fg" },
  { name: "MariaDB", badge: "MDB", tone: "bg-tone-sky text-tone-sky-fg" },
  { name: "MongoDB", badge: "MGO", tone: "bg-tone-green text-tone-green-fg" },
  { name: "Redis", badge: "RDS", tone: "bg-tone-red text-tone-red-fg" },
  { name: "Valkey", badge: "VK", tone: "bg-tone-red text-tone-red-fg" },
];

const facts: { title: string; body: string; icon: Icon }[] = [
  {
    title: "Exposed over TLS only",
    body: "Exposing one opens a port that only takes TLS, for anyone or the IPs you list. Clients sign in with the database's own user; the internal URL stays the same.",
    icon: IconLock,
  },
  {
    title: "A web UI and a shell, signed in",
    body: "pgweb, phpMyAdmin, mongo-express or Redis Commander, started on click and stopped when idle, and psql, mysql, mongosh or redis-cli in the browser. No password to look up.",
    icon: IconTerminal2,
  },
  {
    title: "Users with access levels",
    body: "The Users tab lists who can sign in and makes more: read only, read and write, or admin, on Postgres, MySQL, MariaDB and MongoDB. Passwords, renames and deletes too.",
    icon: IconUsers,
  },
  {
    title: "Backups to S3 or R2",
    body: "Dumps on a schedule with keep-last retention, to S3, R2 or MinIO. Restore any kept run.",
    icon: IconCloudUpload,
  },
];

/** Databases: the engine row, one wide capture, then four short facts. */
export function DatabasesSection() {
  return (
    <section
      id="databases"
      aria-label="Databases"
      className="mx-auto flex max-w-[1200px] scroll-mt-8 flex-col gap-11 px-6 pb-28"
    >
      <div className="rise mx-auto flex max-w-[760px] flex-col items-center gap-4 text-center">
        <span className="text-[13.5px] font-medium text-accent-bright">Databases</span>
        <h2 className="text-[clamp(32px,4vw,44px)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-ink">
          Six engines, private by default.
        </h2>
        <p className="text-[17px] leading-[1.55] text-ink-soft">
          Each project has its own network. Services on the same node reach a database by name; nothing else can until
          you expose it.
        </p>
        <ul aria-label="Engines" className="mt-2 flex flex-wrap justify-center gap-2">
          {engines.map((engine) => (
            <li key={engine.name} className="lift flex items-center gap-2 rounded-lg bg-surface py-1.5 pr-3 pl-1.5">
              <span
                aria-hidden
                className={`flex h-6 min-w-9 items-center justify-center rounded-md px-1 font-mono text-[11px] font-semibold ${engine.tone}`}
              >
                {engine.badge}
              </span>
              <span className="text-[14px] text-ink-body">{engine.name}</span>
            </li>
          ))}
        </ul>
      </div>

      <Shot capture={captures.database} phoneCut className="rise" />

      <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(({ title, body, icon: FactIcon }) => (
          <li key={title} className="rise flex flex-col gap-2.5">
            <span
              aria-hidden
              className="flex size-8.5 items-center justify-center rounded-lg bg-accent/16 text-accent-icon"
            >
              <FactIcon size={17} stroke={1.8} />
            </span>
            <h3 className="mt-1 text-[16px] font-semibold text-ink">{title}</h3>
            <p className="text-[14.5px] leading-[1.6] text-ink-card">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
