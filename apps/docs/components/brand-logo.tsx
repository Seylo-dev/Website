import { brand } from "@/lib/brand";

/** The brand mark (brand/mark.svg), the name and a "Docs" chip. */
export function BrandLogo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={24} height={24} viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#2563EB" />
        <rect x="5.5" y="6.25" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
        <rect x="9" y="12" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
        <rect x="5.5" y="17.75" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
      </svg>
      <span className="text-[15px] font-semibold">{brand.name}</span>
      <span className="rounded-md bg-fd-accent px-1.75 py-0.5 text-[11.5px] font-medium text-fd-accent-foreground">
        Docs
      </span>
    </span>
  );
}
