import { captures, themeShots } from "@/lib/captures";
import { Chips, Shot, ThemeImage } from "./shot";

const whiteLabel = [
  "Panel name",
  "Logos for light and dark",
  "Favicon",
  "Sign-in message",
  'Hide "Powered by"',
  "Accent color",
  "Custom CSS",
];

/**
 * White label: the Appearance screen, then the dashboard in each of the ten theme presets, five to a row
 * on large screens and two on smaller ones. Each preview shows the preset's light or dark half, by the
 * page's theme.
 */
export function BrandSection() {
  return (
    <section
      id="brand"
      aria-label="White label"
      className="mx-auto flex max-w-[1200px] scroll-mt-8 flex-col gap-12 px-6 pb-28"
    >
      <div className="grid items-center gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="rise flex flex-col gap-4 lg:order-2">
          <span className="text-[13.5px] font-medium text-accent-bright">White label</span>
          <h2 className="text-[clamp(32px,4vw,44px)] leading-[1.08] font-semibold tracking-[-0.035em] text-balance text-ink">
            Make it yours.
          </h2>
          <p className="text-[17px] leading-[1.55] text-ink-soft">
            Hand the panel to a team or to clients under your own name. Ten theme presets, each in light and dark:
            the panel follows the system, or you fix it to one. Then your accent color and your own CSS on top.
          </p>
          <Chips items={whiteLabel} className="mt-1" />
        </div>
        <Shot capture={captures.appearance} phoneCut className="rise lg:order-1" />
      </div>

      <ul aria-label="Theme presets" className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-5">
        {themeShots.map(({ preset, note, capture }) => (
          <li key={preset} className="rise flex min-w-0 flex-col gap-3">
            <div className="shot overflow-hidden rounded-lg">
              <ThemeImage capture={capture} className="block h-auto w-full" />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold text-ink">{preset}</span>
              <span className="text-[13.5px] text-ink-muted">{note}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
