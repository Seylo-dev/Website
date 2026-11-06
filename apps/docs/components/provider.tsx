"use client";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";

// Fumadocs' own search dialog over /api/search (Orama). Swap in a custom dialog through
// `search.SearchDialog` if the docs ever need the panel's command palette look.
export function Provider({ children }: { children: ReactNode }) {
  return <RootProvider>{children}</RootProvider>;
}
