import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

/** Full-text search over every page, API operations included (Orama, built at startup). */
export const { GET } = createFromSource(source, { language: "english" });
