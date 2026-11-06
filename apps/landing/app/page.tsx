import { Features } from "@/components/features";
import { GetStarted } from "@/components/get-started";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { NextToWings } from "@/components/next-to-wings";
import { ProductShot } from "@/components/product-shot";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Starfield } from "@/components/starfield";

// The panel dashboard captured from a running panel with tools/hero-shot (see README).
const heroShot = { src: "/product/dashboard.webp", width: 2400, height: 1500, sidebarRatio: 0.155 };

export default function HomePage() {
  return (
    <div className="relative overflow-x-clip bg-[radial-gradient(800px_400px_at_50%_0%,rgb(37_99_235/0.22),rgb(37_99_235/0)_70%)]">
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
        <HowItWorks />
        <NextToWings />
        <GetStarted />
      </main>
      <SiteFooter />
    </div>
  );
}
