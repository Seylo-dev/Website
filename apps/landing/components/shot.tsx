import Image from "next/image";
import type { Capture } from "@/lib/captures";

// How much wider than the screen a `phoneCut` crop is drawn on phones.
const phoneWidths = { wide: "w-[170%]", medium: "w-[130%]" } as const;

/**
 * A capture in the page's theme: the light file in light, the dark file in dark (two images, one hidden
 * by CSS, so the right one shows before any script runs and on theme changes). Lazy by default: a hidden
 * lazy image has no box, so the browser does not fetch the theme that is not on screen.
 *
 * Served as is (`unoptimized`): the captures are small webp files already, and resizing would soften the
 * panel's small text.
 */
export function ThemeImage({
  capture,
  className = "",
  style,
  alt = capture.alt,
  eager = false,
}: {
  capture: Capture;
  className?: string;
  style?: React.CSSProperties;
  /** Defaults to the capture's alt text; "" for a decorative copy. */
  alt?: string;
  /** For first paint (the hero): both files load right away and the visible one is not held back. */
  eager?: boolean;
}) {
  const common = {
    alt,
    width: capture.width,
    height: capture.height,
    unoptimized: true,
    loading: eager ? ("eager" as const) : ("lazy" as const),
    fetchPriority: eager && alt ? ("high" as const) : undefined,
    style,
  };
  if (!capture.srcDark) return <Image {...common} src={capture.src} className={className} />;
  return (
    <>
      <Image {...common} src={capture.src} className={`dark:hidden ${className}`} />
      <Image {...common} src={capture.srcDark} className={`light:hidden ${className}`} />
    </>
  );
}

/**
 * A real panel capture on the page: rounded, no rim, a drop shadow and a faint blue glow (`.shot` in
 * globals.css). `fade` dissolves the bottom into the page for crops that run on. `phoneCut` is for wide
 * crops: on phones they are drawn larger and cut on the right (with a fade), like the hero shot, so the
 * text stays legible. `true` is `"wide"`; `"medium"` cuts less, for crops whose content runs further right.
 */
export function Shot({
  capture,
  className = "",
  fade = false,
  phoneCut = false,
}: {
  capture: Capture;
  className?: string;
  fade?: boolean;
  phoneCut?: boolean | keyof typeof phoneWidths;
}) {
  const phoneWidth = phoneCut ? phoneWidths[phoneCut === true ? "wide" : phoneCut] : "";
  return (
    <div
      className={`shot overflow-hidden rounded-xl ${fade ? "shot-fade" : ""} ${phoneCut ? "shot-phone-cut" : ""} ${className}`}
    >
      <ThemeImage
        capture={capture}
        className={`block h-auto ${phoneCut ? `${phoneWidth} max-w-none sm:w-full` : "w-full"}`}
      />
    </div>
  );
}

/**
 * A capture at the bottom of a bento cell that runs off the cell's bottom edge. On phones it fills the
 * cell's width and meets its right edge, so nothing is cut; from `sm` up `widthClass` sets a fixed
 * width per breakpoint (for example `sm:w-[520px] lg:w-[600px]`), which may run off the right edge.
 */
export function CellShot({
  capture,
  widthClass,
  className = "",
}: {
  capture: Capture;
  widthClass: string;
  className?: string;
}) {
  return (
    <div className={`mt-auto overflow-hidden pl-5 sm:pl-6 ${className}`}>
      <ThemeImage
        capture={capture}
        className={`cell-shot block h-auto w-full max-w-none rounded-tl-[10px] sm:rounded-tr-[10px] ${widthClass}`}
      />
    </div>
  );
}

/** Short facts as filled chips. */
export function Chips({ items, className = "" }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => (
        <li key={item} className="rounded-md bg-chip px-2.5 py-1 text-[13px] leading-[1.45] text-ink-soft">
          {item}
        </li>
      ))}
    </ul>
  );
}
