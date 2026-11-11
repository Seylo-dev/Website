/**
 * Turns the panel's openapi.json into what the API reference shows. Shared by the server
 * (lib/openapi.ts, which builds the pages and sidebar) and the browser (components/api-page.tsx,
 * which renders an operation), so both see the same document. No Node APIs here.
 *
 * - Adds a top-level `tags` list with display names: the document has none, so the sidebar
 *   groups would otherwise be titled from the raw ids ("Cli Login").
 * - Orders paths by those names: fumadocs-openapi creates the groups in path order.
 * - Appends who may call each operation to its description, from the `x-permission`, `x-mcp`
 *   and `x-op-kind` extensions the generator writes but the UI does not show.
 */

/** Sidebar names for the operation tags (the module part of an op id). Missing tags keep their id. */
const tagNames: Record<string, string> = {
  ai: "AI assistant",
  alerts: "Alerts",
  apiKeys: "API keys",
  approvals: "Approvals",
  audit: "Activity log",
  auth: "Sign-in and account",
  backups: "Backups",
  boxes: "Boxes",
  builds: "Builds",
  cleanup: "Docker cleanup",
  cliLogin: "CLI sign-in",
  compose: "Compose stacks",
  cron: "Cron jobs",
  databases: "Databases",
  deployments: "Deployments",
  dockerHub: "Docker Hub",
  domains: "Domains",
  env: "Environment",
  exposures: "Exposed ports",
  files: "Files",
  git: "Git credentials",
  github: "GitHub",
  gitProviders: "Git providers",
  grants: "Sharing",
  hostShell: "Host shell",
  invites: "Invites",
  logs: "Logs",
  maintenance: "Maintenance pages",
  mcp: "MCP",
  metrics: "Metrics",
  nodes: "Nodes",
  notifications: "Notifications",
  previews: "PR previews",
  projects: "Projects",
  registries: "Registry logins",
  services: "Services",
  serviceTransfer: "Export and import",
  settings: "Settings",
  setup: "Setup",
  system: "System",
  tailscale: "Tailscale",
  telemetry: "Telemetry",
  templates: "Templates",
  terminals: "Console and shell",
  tunnels: "Cloudflare tunnels",
  updates: "Updates",
  uptime: "Uptime checks",
  users: "People",
  webhooks: "Deploy triggers and webhooks",
};

interface Operation {
  tags?: string[];
  description?: string;
  "x-permission"?: string;
  "x-mcp"?: boolean;
  "x-op-kind"?: string;
}

interface PanelDocument {
  tags?: { name: string }[];
  paths?: Record<string, Record<string, Operation>>;
}

const displayName = (tag: string) => tagNames[tag] ?? tag;

/** What the generator appends to the x-permission of an action only owners and admins hold. */
const adminOnlySuffix = " (owners and admins)";

/** "service:services.deploy" -> a sentence about who may call the operation. */
function access(op: Operation): string {
  const permission = op["x-permission"];
  const lines: string[] = [];
  if (permission === "public") lines.push("Needs no sign-in.");
  else if (permission === "signed-in") lines.push("Any signed-in caller.");
  else if (permission === "signed-in, whole account")
    lines.push("Any signed-in caller, but not an API key or MCP token limited to some projects or actions.");
  else if (permission) {
    // "service:services.export (owners and admins)": a scoped action that grants never hand to members.
    const adminOnly = permission.endsWith(adminOnlySuffix);
    const bare = adminOnly ? permission.slice(0, -adminOnlySuffix.length) : permission;
    const [scope, action] = bare.includes(":") ? bare.split(":", 2) : ["global", bare];
    if (adminOnly && (scope === "service" || scope === "project"))
      lines.push(
        `Needs \`${action}\` on the ${scope}, which only owners and admins hold: it is never shared with members.`,
      );
    else if (scope === "service") lines.push(`Needs \`${action}\` on the service (a grant on its project covers it).`);
    else if (scope === "project") lines.push(`Needs \`${action}\` on the project.`);
    else lines.push(`Needs \`${action}\`, which owners and admins hold.`);
  }
  if (op["x-mcp"]) {
    lines.push(
      op["x-op-kind"] === "destructive"
        ? "Available to MCP clients and the assistant, after a person approves the call."
        : "Available to MCP clients and the assistant.",
    );
  } else {
    lines.push("Not available to MCP clients or the assistant.");
  }
  return lines.join(" ");
}

export function prepareDocument<T>(raw: T): T {
  const doc = raw as PanelDocument;
  const firstTag = (item: Record<string, Operation>) => Object.values(item)[0]?.tags?.[0] ?? "";
  const entries = Object.entries(doc.paths ?? {}).sort(
    ([pathA, a], [pathB, b]) =>
      displayName(firstTag(a)).localeCompare(displayName(firstTag(b))) || pathA.localeCompare(pathB),
  );
  const paths = Object.fromEntries(
    entries.map(([path, item]) => [
      path,
      Object.fromEntries(
        Object.entries(item).map(([method, op]) => [
          method,
          { ...op, description: [op.description, access(op)].filter(Boolean).join("\n\n") },
        ]),
      ),
    ]),
  );
  const tags = doc.tags?.length
    ? doc.tags
    : [...new Set(entries.flatMap(([, item]) => Object.values(item).flatMap((op) => op.tags ?? [])))].map((name) => ({
        name,
        "x-displayName": displayName(name),
      }));
  return { ...doc, tags, paths } as T;
}
