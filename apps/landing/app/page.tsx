import { AccessSection } from "@/components/access-section";
import { BrandSection } from "@/components/brand-section";
import { DatabasesSection } from "@/components/databases-section";
import { Features } from "@/components/features";
import { GetStarted } from "@/components/get-started";
import { Hero } from "@/components/hero";
import { NextToWings } from "@/components/next-to-wings";
import { NodesSection } from "@/components/nodes-section";
import { ObserveSection } from "@/components/observe-section";
import { ProductShot } from "@/components/product-shot";
import { SettingsSection } from "@/components/settings-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Starfield } from "@/components/starfield";
import { TemplatesSection } from "@/components/templates-section";

// The panel dashboard from the panel's demo mode, in its light and dark theme, captured with
// tools/hero-shot (sections.ts, see its README).
const heroShot = {
  src: "/product/dashboard.webp",
  srcDark: "/product/dashboard-dark.webp",
  width: 2400,
  height: 1500,
  sidebarRatio: 0.155,
};

export default function HomePage() {
  return (
    <div className="relative overflow-x-clip bg-[radial-gradient(800px_400px_at_50%_0%,var(--color-hero-wash),transparent_70%)]">
      <Starfield />
      <SiteHeader />
      <main>
        <Hero />
        {/* The shot's negative top margin pulls this section up over the hero's buttons. It only holds
            a picture, so it lets clicks and hovers through to them. */}
        <section aria-label="Product preview" className="pointer-events-none relative px-4 pb-2 sm:px-6 sm:pb-8">
          <ProductShot
            {...heroShot}
            alt="The panel's dashboard: node load graphs for three servers and the projects running on them"
          />
        </section>
        <Features />
        {/* What the panel does, screen by screen: real crops of the panel (lib/captures.ts). */}
        <TemplatesSection />
        <SettingsSection />
        <NodesSection />
        <DatabasesSection />
        <ObserveSection />
        <AccessSection />
        <BrandSection />
        <NextToWings />
        <GetStarted />
      </main>
      <SiteFooter />
    </div>
  );
}
