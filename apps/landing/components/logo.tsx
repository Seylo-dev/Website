import { brand } from "@/lib/site";

/** The brand mark (brand/mark.svg) inline, so it inherits no network request and scales crisply. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#2563EB" />
      <rect x="5.5" y="6.25" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
      <rect x="9" y="12" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
      <rect x="5.5" y="17.75" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5 text-ink">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[-0.015em]">{brand.name}</span>
    </span>
  );
}
