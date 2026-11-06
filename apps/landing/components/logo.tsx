import { brand } from "@/lib/site";

/** The brand mark (brand/mark.svg) inline, so it inherits no network request and scales crisply. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#2563EB" />
      <path
        d="M18.5 9.2c-1.4-1.3-3.4-1.8-5.2-1.3-2.4.6-3.2 3.1-1.2 4.4.9.6 2.2.9 3.4 1.3 2.6.8 3 3.6.7 4.9-1.9 1.1-4.5.7-6.1-.8"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
