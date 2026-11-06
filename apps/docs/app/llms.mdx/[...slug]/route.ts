import { notFound } from "next/navigation";
import { getPageMarkdownUrl } from "@/lib/shared";
import { docsLlms, source } from "@/lib/source";

export const revalidate = false;

/** `/llms.mdx/guides/databases/content.md` -> the page as Markdown (`index` = the home page). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const segments = slug.slice(0, -1);
  const page = source.getPage(segments.length === 1 && segments[0] === "index" ? [] : segments);
  if (!page) notFound();

  return new Response(await docsLlms.page(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: getPageMarkdownUrl(page).segments }));
}
