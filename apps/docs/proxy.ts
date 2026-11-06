import { NextResponse, type NextRequest } from "next/server";
import { isMarkdownPreferred } from "fumadocs-core/negotiation";
import { docsContentRoute } from "@/lib/shared";

/**
 * Markdown for agents and curl: `/guides/databases.md`, or any page requested with
 * `Accept: text/markdown`, is served from the llms.mdx route as raw Markdown.
 */
function toMarkdownPath(pathname: string) {
  const path = pathname.replace(/\/$/, "");
  return `${docsContentRoute}${path === "" ? "/index" : path}/content.md`;
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.endsWith(".md")) {
    return NextResponse.rewrite(new URL(toMarkdownPath(pathname.slice(0, -3)), request.nextUrl));
  }

  if (isMarkdownPreferred(request)) {
    return NextResponse.rewrite(new URL(toMarkdownPath(pathname), request.nextUrl), {
      // This URL has two representations, picked by `Accept`.
      headers: { Vary: "Accept" },
    });
  }

  return NextResponse.next();
}

export const config = {
  // Pages only - not Next internals, route handlers or static files.
  matcher: ["/((?!_next/|api/|og/|llms|sitemap\\.xml|robots\\.txt|icon\\.svg).*)"],
};
