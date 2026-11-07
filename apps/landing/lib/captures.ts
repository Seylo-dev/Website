// Real crops of the panel (v0.1.1), taken at 2x from the panel's demo mode with demo data, once in its
// light theme and once in its default dark theme (seylo-night) from the same data: see
// tools/hero-shot/README.md, "Section captures". Width and height are CSS pixels (half the file's); the
// light and dark files of a crop have the same size.

export interface Capture {
  /** The light theme's file. */
  src: string;
  /** The dark theme's file, when the crop has one (the theme preset previews do not). */
  srcDark?: string;
  width: number;
  height: number;
  alt: string;
}

const capture = (name: string, px: [number, number], alt: string): Capture => ({
  src: `/product/${name}.webp`,
  srcDark: `/product/${name}-dark.webp`,
  width: px[0] / 2,
  height: px[1] / 2,
  alt,
});

/** A crop with one theme of its own: the theme preset previews show each preset as it is. */
const single = (name: string, px: [number, number], alt: string): Capture => ({
  src: `/product/${name}.webp`,
  width: px[0] / 2,
  height: px[1] / 2,
  alt,
});

export const captures = {
  templates: capture(
    "templates",
    [1784, 1046],
    "The Templates page: a search for 23 templates, category filters and cards for Appsmith, code-server, Directus, Excalidraw, File Browser and Ghost",
  ),
  env: capture(
    "env",
    [1288, 1286],
    "The environment editor: two lines underlined in red with one-click fixes below them such as Expose redis, and the hover on ${{api.URL}}: api's public URL becomes https://api.de1.example.com and updates if the domain changes",
  ),
  domainAccess: capture(
    "domain-access",
    [1120, 1526],
    "Access rules for one domain: basic auth users, an IP allowlist, a rate limit of 20 requests per second and a redirect",
  ),
  healthCheck: capture(
    "health-check",
    [1248, 1260],
    "Health check settings: an HTTP request to /health on port 3000, interval, timeout, grace period and the zero-downtime deploy strategy",
  ),
  crashPolicy: capture(
    "crash-policy",
    [1168, 766],
    "Crash policy: restart after a crash is on, stop after 5 crashes in a row",
  ),
  timedExpose: capture(
    "timed-expose",
    [1126, 386],
    "An open timed expose: a node port to web:3000, only from one IP, closing in 1 hour 41 minutes",
  ),
  nodeGraphs: capture(
    "node-graphs",
    [1280, 1660],
    "A node's overview: CPU, memory, disk and network graphs, and the machine's OS, kernel, Docker and agent versions",
  ),
  replicas: capture(
    "replicas",
    [1368, 1026],
    "Replicas and nodes: two replicas on de-fsn-1 and one on us-ash-1, de-fsn-1 as the entry node, sticky sessions on",
  ),
  nodeHealth: capture(
    "node-health",
    [1280, 1502],
    "A node's health check: one warning about disk space with its fix, and passed checks for the kernel, OS, memory, inodes, Docker and cgroups",
  ),
  database: capture(
    "database",
    [2384, 1522],
    "A Postgres service: the internal connection, an exposed connection that requires SSL, pgweb and psql under Tools, and the daily backups",
  ),
  logs: capture(
    "logs",
    [1704, 1720],
    "A service's logs: a search across every deploy's logs above the live log, following new lines",
  ),
  metrics: capture("metrics", [1368, 686], "A service's CPU over the last hour, average and peak"),
  uptime: capture(
    "uptime",
    [1368, 1088],
    "An uptime check that is up, 99.93% in 24 hours, with its latency chart, and recent alerts such as worker crashed: exit 137, out of memory",
  ),
  approvals: capture(
    "approvals",
    [1488, 850],
    "An approval waiting: an MCP client asks to delete a project, with its reason and exact input, and Deny or Approve and run",
  ),
  people: capture(
    "people",
    [1808, 796],
    "People: an owner with 2FA and two passkeys, an admin, a member with access to two projects and services, and a disabled member",
  ),
  appearance: capture(
    "appearance",
    [1916, 1502],
    "Appearance settings: four theme presets, accent colors, branding with the panel name, logos, favicon and sign-in message, and custom CSS",
  ),
} satisfies Record<string, Capture>;

export const themeShots = [
  {
    preset: "Default",
    note: "Light and dark",
    capture: single("theme-seylo", [720, 450], "The dashboard in the Default theme"),
  },
  {
    preset: "Night",
    note: "Dark with ink blues",
    capture: single("theme-seylo-night", [720, 450], "The dashboard in the Night theme"),
  },
  {
    preset: "Classic",
    note: "Soft gray cards, green accent",
    capture: single("theme-classic", [720, 450], "The dashboard in the Classic theme"),
  },
  {
    preset: "Midnight",
    note: "Dense, purple accent",
    capture: single("theme-midnight", [720, 450], "The dashboard in the Midnight theme"),
  },
];
