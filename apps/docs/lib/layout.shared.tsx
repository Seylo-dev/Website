import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { BrandLogo } from "@/components/brand-logo";
import { brand, githubUrl } from "./brand";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandLogo />,
      url: "/",
    },
    githubUrl,
    links: [
      { text: "API reference", url: "/api-reference", active: "nested-url" },
      { text: `${brand.name} home`, url: brand.urls.site, external: true },
    ],
  };
}
