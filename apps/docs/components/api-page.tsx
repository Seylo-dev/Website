"use client";
import type { Document } from "fumadocs-openapi";
import { createOpenAPIPage } from "fumadocs-openapi/ui";
import { prepareDocument } from "@/lib/openapi-document";

/**
 * Renders one generated API reference page (an operation from openapi.json). The playground is
 * off: there is no shared API to call, and a browser request to someone's own panel would be
 * blocked by CORS anyway. The cURL/TypeScript/Go samples cover trying it.
 *
 * The document is not in the page props (`includeDocument: false` in lib/openapi.ts): with it,
 * every one of the ~300 pages carried the whole 2 MB document in its HTML and payload. It is
 * loaded here instead, from its own chunk, once per browser session.
 */
export const OpenAPIPage = createOpenAPIPage({
  playground: { enabled: false },
  loadDocument: async () => prepareDocument((await import("@/openapi.json")).default as unknown as Document),
});
