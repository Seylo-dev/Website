import { brand } from "@/lib/brand";

/** The brand mark (brand/mark.svg), the name and a "Docs" chip. */
export function BrandLogo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={24} height={24} viewBox="0 0 28 28" aria-hidden="true">
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
      <span className="text-[15px] font-semibold">{brand.name}</span>
      <span className="rounded-md bg-fd-accent px-1.75 py-0.5 text-[11.5px] font-medium text-fd-accent-foreground">
        Docs
      </span>
    </span>
  );
}
