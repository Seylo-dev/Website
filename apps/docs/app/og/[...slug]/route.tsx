import { notFound } from "next/navigation";
import { generateOGImage } from "fumadocs-ui/og";
import { appName, getPageImageUrl } from "@/lib/shared";
import { source } from "@/lib/source";

export const revalidate = false;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const segments = slug.slice(0, -1);
  const page = source.getPage(segments.length === 1 && segments[0] === "index" ? [] : segments);
  if (!page) notFound();

  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: appName,
    // The brand mark (brand/mark.svg): three layers, the middle one sliding in.
    icon: (
      <svg width="64" height="64" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#2563EB" />
        <rect x="5.5" y="6.25" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
        <rect x="9" y="12" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
        <rect x="5.5" y="17.75" width="13.5" height="4" rx="1.5" fill="#FFFFFF" />
      </svg>
    ),
    primaryColor: "rgba(37, 99, 235, 0.4)",
    primaryTextColor: "rgb(107, 151, 255)",
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: getPageImageUrl(page).segments }));
}
