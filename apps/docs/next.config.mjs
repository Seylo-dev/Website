import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

// The repo root: one bun.lock and node_modules for every app. `output: "standalone"` writes a
// self-contained server (apps/docs/server.js) for the Dockerfile.
const root = fileURLToPath(new URL("../..", import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  turbopack: { root },
  outputFileTracingRoot: root,
  // AGENTS.md is written by hand; `next dev` should not add its own block to it.
  agentRules: false,
};

export default withMDX(config);
