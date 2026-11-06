import MarkdownIt from "markdown-it";
import brand from "../../../../brand/brand.json";

// Raw HTML stays off: a report is text anyone could have written, served from our own domain.
// markdown-it escapes it and refuses javascript: links on its own.
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });

/**
 * Locks the page down further: no scripts, no remote images (which could track readers), no
 * framing. The only thing allowed is the inline stylesheet below.
 */
export const REPORT_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const STYLES = `
  :root { color-scheme: light; --ink: #0F172A; --muted: #556072; --line: #EEF0F4; --soft: #F6F8FB; --accent: ${brand.accent}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F3F5F9; color: var(--ink); font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { max-width: 900px; margin: 0 auto; padding: 24px 20px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; color: var(--muted); font-size: 13.5px; }
  header b { color: var(--ink); font-size: 15px; }
  header .mark { width: 22px; height: 22px; border-radius: 6px; background: var(--accent); }
  header nav { margin-left: auto; display: flex; gap: 14px; }
  a { color: #1F4FD1; }
  main { max-width: 900px; margin: 16px auto 48px; padding: 28px 32px; background: #FFF; border-radius: 12px; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 4px 16px rgba(15,23,42,.05); overflow-wrap: anywhere; }
  h1, h2, h3 { letter-spacing: -0.02em; line-height: 1.25; }
  h1 { font-size: 26px; margin-top: 0; }
  h2 { font-size: 20px; margin-top: 28px; padding-top: 16px; border-top: 1px solid var(--line); }
  code, pre { font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
  :not(pre) > code { background: var(--soft); padding: 1px 5px; border-radius: 5px; }
  pre { background: #0B1020; color: #D6DCE8; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; display: block; overflow-x: auto; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  blockquote { margin: 0; padding: 4px 16px; border-left: 3px solid var(--accent); background: var(--soft); border-radius: 0 8px 8px 0; }
  .empty { text-align: center; padding: 64px 32px; }
`;

function layout(title: string, content: string, meta = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<header><span class="mark" aria-hidden="true"></span><b>${escapeHtml(brand.name)}</b><span>${meta}</span>
<nav><a href="${brand.urls.docs}/troubleshooting">Troubleshooting docs</a></nav></header>
<main>${content}</main>
</body>
</html>`;
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export function renderReportPage(report: { id: string; body: string; createdAt: number; expiresAt: number }): string {
  const meta = `Troubleshoot report · uploaded ${dateFormat.format(report.createdAt)} UTC · expires ${dateFormat.format(
    report.expiresAt,
  )} · <a href="/l/${report.id}/raw">raw</a>`;
  return layout(`Troubleshoot report ${report.id}`, markdown.render(report.body), meta);
}

export function renderMissingReportPage(): string {
  return layout(
    "Report not found",
    `<div class="empty"><h1>This report doesn't exist</h1><p>Reports are deleted 30 days after upload, or earlier by whoever uploaded them. Run <code>${brand.slug} troubleshoot</code> again for a fresh link.</p></div>`,
  );
}
