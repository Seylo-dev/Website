// Real crops of the panel, taken at 2x from the panel's demo mode with demo data, once in the light half
// and once in the dark half of its default theme from the same data: see tools/hero-shot/README.md,
// "Demo mode". The hero, the theme previews and the crops whose screen changed were taken from the 0.2.13
// build (its demo data still says v0.2.12, the version it was made as); the others (domain access, crash
// policy, timed expose, replicas, logs, metrics, uptime) are from v0.1.1 and look the same in 0.2.13.
// Width and height are CSS pixels (half the file's); the light and dark files of a crop have the same size.

export interface Capture {
  /** The light theme's file. */
  src: string;
  /** The dark theme's file. */
  srcDark?: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * The hero: the whole dashboard at 2400x1500 in both themes (`sections.ts dashboard`), shown by
 * components/product-shot.tsx. `sidebarRatio` is the sidebar's share of the width, the strip set back in
 * depth. app/layout.tsx preloads the system theme's file at high priority.
 */
export const heroShot = {
  src: "/product/dashboard.webp",
  srcDark: "/product/dashboard-dark.webp",
  width: 2400,
  height: 1500,
  sidebarRatio: 0.155,
};

const capture = (name: string, px: [number, number], alt: string): Capture => ({
  src: `/product/${name}.webp`,
  srcDark: `/product/${name}-dark.webp`,
  width: px[0] / 2,
  height: px[1] / 2,
  alt,
});

export const captures = {
  templates: capture(
    "templates",
    [1784, 1086],
    "The Templates page: a search for 23 templates, Templates and Docker Hub tabs, category filters and cards for Appsmith, code-server, Directus, Excalidraw, File Browser and Ghost",
  ),
  env: capture(
    "env",
    [1288, 1308],
    "The environment editor: two lines underlined in red with one-click fixes below them such as Expose redis, and the hover on ${{api.URL}}: api's public URL becomes https://api.de1.example.com and updates if the domain changes",
  ),
  domainAccess: capture(
    "domain-access",
    [1120, 1526],
    "Access rules for one domain: basic auth users, an IP allowlist, a rate limit of 20 requests per second and a redirect",
  ),
  healthCheck: capture(
    "health-check",
    [1248, 1278],
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
    [1280, 1648],
    "A node's overview: CPU, memory, disk and network graphs, and the machine's OS, kernel, Docker and agent versions",
  ),
  replicas: capture(
    "replicas",
    [1368, 1026],
    "Replicas and nodes: two replicas on de-fsn-1 and one on us-ash-1, de-fsn-1 as the entry node, sticky sessions on",
  ),
  nodeHealth: capture(
    "node-health",
    [1280, 1648],
    "A node's health check: one warning about disk space with its fix, and passed checks for the kernel, OS, memory, inodes, service folders, Docker and cgroups",
  ),
  database: capture(
    "database",
    [2384, 1682],
    "A Postgres service: its Connection, Users and Backups tabs, the internal connection, an exposed connection that requires SSL with a Let's Encrypt certificate, pgweb and psql under Tools, and the daily backups",
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
    [1488, 870],
    "An approval waiting: an MCP client asks to delete a project, with its reason and exact input, and Deny or Approve and run",
  ),
  people: capture(
    "people",
    [1808, 796],
    "People: an owner with 2FA and two passkeys, an admin, a member with access to two projects and services, and a disabled member",
  ),
  appearance: capture(
    "appearance",
    [1916, 1898],
    "Appearance settings: ten theme presets, accent colors, branding with the panel name, logos, favicon and sign-in message, and custom CSS",
  ),
} satisfies Record<string, Capture>;

/**
 * The dashboard in each theme preset of Settings > Appearance, in the panel's order, with the panel's own
 * description of each (apps/web settingsAppearance.presets). Each has a light and a dark file, shown by
 * the page's theme like the other crops. The 720x450 files are the 1440x900 dashboard at 1x.
 */
export const themeShots = [
  {
    preset: "Default",
    note: "Airy blue-gray, soft shadows",
    capture: capture("theme-seylo", [720, 450], "The dashboard in the Default theme"),
  },
  {
    preset: "Classic",
    note: "Flat grays, hairlines, green",
    capture: capture("theme-classic", [720, 450], "The dashboard in the Classic theme"),
  },
  {
    preset: "Midnight",
    note: "Square corners, violet, dense",
    capture: capture("theme-midnight", [720, 450], "The dashboard in the Midnight theme"),
  },
  {
    preset: "Graphite",
    note: "Pure grays, ink accent, flat",
    capture: capture("theme-graphite", [720, 450], "The dashboard in the Graphite theme"),
  },
  {
    preset: "Clay",
    note: "Warm sand, terracotta, round",
    capture: capture("theme-clay", [720, 450], "The dashboard in the Clay theme"),
  },
  {
    preset: "Harbor",
    note: "Sea grays, teal, tinted sidebar",
    capture: capture("theme-harbor", [720, 450], "The dashboard in the Harbor theme"),
  },
  {
    preset: "Orchid",
    note: "Rose tints, magenta, pill chips",
    capture: capture("theme-orchid", [720, 450], "The dashboard in the Orchid theme"),
  },
  {
    preset: "Steel",
    note: "Blue-gray metal, sharp edges",
    capture: capture("theme-steel", [720, 450], "The dashboard in the Steel theme"),
  },
  {
    preset: "Marigold",
    note: "Cream paper, golden accent",
    capture: capture("theme-marigold", [720, 450], "The dashboard in the Marigold theme"),
  },
  {
    preset: "Meadow",
    note: "Sage greens, the roundest",
    capture: capture("theme-meadow", [720, 450], "The dashboard in the Meadow theme"),
  },
];
