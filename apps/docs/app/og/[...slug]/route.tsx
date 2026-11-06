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
    primaryColor: "rgba(37, 99, 235, 0.4)",
    primaryTextColor: "rgb(107, 151, 255)",
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: getPageImageUrl(page).segments }));
}
