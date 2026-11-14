// The template catalog, from the signed catalog Seylo-dev/Templates publishes. tools/catalog/sync.ts
// writes templates.generated.json (and the logos in public/templates/) before every build and keeps the
// committed copy when it cannot get or trust a newer one. Do not edit the JSON by hand.

import generated from "./templates.generated.json";

export interface CatalogTemplate {
  slug: string;
  name: string;
  category: string;
  creates: string;
  /** The letter tile for a template without a logo: initials and a color picked from the slug. */
  monogram: string;
  color: string;
  /** The logo under public/ ("/templates/<slug>/logo.svg"), or null. */
  logo: string | null;
}

/** By name, the order the panel's Templates page lists them. */
export const catalog: CatalogTemplate[] = generated.templates;

/** The names of the templates among `slugs` that the catalog has, in that order. */
export function namesOf(slugs: readonly string[], list: readonly CatalogTemplate[] = catalog): string[] {
  return slugs.flatMap((slug) => list.find((t) => t.slug === slug)?.name ?? []);
}
