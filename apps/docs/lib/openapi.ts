import type { Document } from "fumadocs-openapi";
import { createOpenAPI } from "fumadocs-openapi/server";
import spec from "../openapi.json";
import { prepareDocument } from "./openapi-document";

// The panel's OpenAPI document. The app repo generates it from the operation registry
// (`openapi.json` at its root). A copy is committed here, so the docs build never needs the
// network; `bun run openapi:sync` refreshes it from the latest release or a local file.
// components/api-page.tsx loads the same file in the browser.

export const openapi = createOpenAPI({
  input: { panel: () => prepareDocument(spec as unknown as Document) },
  // Pages load the document themselves (components/api-page.tsx) instead of each carrying the
  // whole 2 MB document in its HTML and payload.
  includeDocument: false,
});
