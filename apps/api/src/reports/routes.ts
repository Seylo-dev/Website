import type { Server } from "bun";
import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { clientKey } from "../client-ip";
import { findUnredactedSecrets } from "./redaction";
import { REPORT_PAGE_CSP, renderMissingReportPage, renderReportPage } from "./page";
import type { ReportStore } from "./store";

/** A report is Markdown text: system facts, recent log lines, config with secrets removed. */
export const MAX_REPORT_BYTES = 512 * 1024;

// Someone debugging runs `troubleshoot` a few times in a row; nobody needs more than this.
const UPLOADS_PER_HOUR_PER_IP = 20;

interface ReportRoutesOptions {
  store: ReportStore;
  trustProxy: boolean;
  /** Public base the returned link is built on: `https://seylo.dev/l`. */
  reportBaseUrl: string;
  /** The listening server (null under `app.handle()`): the address of a connection comes from it. */
  getServer: () => Server<unknown> | null;
}

const pageHeaders = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": REPORT_PAGE_CSP,
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cache-control": "private, max-age=60",
};

const idParams = t.Object({ id: t.String({ pattern: "^[A-Za-z0-9_-]{22}$" }) });

export function reportRoutes({ store, trustProxy, reportBaseUrl, getServer }: ReportRoutesOptions) {
  return new Elysia({ name: "reports" })
    .use(
      rateLimit({
        scoping: "scoped",
        duration: 60 * 60 * 1000,
        max: UPLOADS_PER_HOUR_PER_IP,
        // Without it the limiter asks this plugin's own instance, which never has a server.
        injectServer: getServer,
        generator: (request, server) => clientKey(request, server, trustProxy),
        // Only uploads are limited; reading a report you were sent should never fail.
        skip: (request) => request.method !== "POST",
      }),
    )
    .post(
      "/l",
      async ({ body, set }) => {
        if (Buffer.byteLength(body) > MAX_REPORT_BYTES) {
          set.status = 413;
          return { error: "too_large", maxBytes: MAX_REPORT_BYTES };
        }
        if (body.trim() === "") {
          set.status = 400;
          return { error: "empty" };
        }

        const findings = findUnredactedSecrets(body);
        if (findings.length > 0) {
          set.status = 422;
          return {
            error: "unredacted_secrets",
            message: "The report still contains what looks like a secret. Remove it and upload again.",
            findings,
          };
        }

        const report = await store.create(body);
        set.status = 201;
        return {
          id: report.id,
          url: `${reportBaseUrl}/${report.id}`,
          expiresAt: new Date(report.expiresAt).toISOString(),
          deleteToken: report.deleteToken,
        };
      },
      {
        parse: "text",
        body: t.String(),
        // Rejects an oversized upload from its header before the body is read.
        beforeHandle({ request, set }) {
          const length = Number(request.headers.get("content-length") ?? 0);
          if (length > MAX_REPORT_BYTES) {
            set.status = 413;
            return { error: "too_large", maxBytes: MAX_REPORT_BYTES };
          }
        },
      },
    )
    .get(
      "/l/:id",
      async ({ params }) => {
        const report = await store.get(params.id);
        return report
          ? new Response(renderReportPage(report), { headers: pageHeaders })
          : new Response(renderMissingReportPage(), { status: 404, headers: pageHeaders });
      },
      { params: idParams },
    )
    .get(
      "/l/:id/raw",
      async ({ params }) => {
        const report = await store.get(params.id);
        if (!report) return new Response("Not found\n", { status: 404 });
        return new Response(report.body, {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "x-robots-tag": "noindex, nofollow",
            "x-content-type-options": "nosniff",
          },
        });
      },
      { params: idParams },
    )
    .delete(
      "/l/:id",
      async ({ params, headers, set }) => {
        const token = headers.authorization?.replace(/^Bearer /, "") ?? "";
        if (!(await store.delete(params.id, token))) {
          set.status = 404;
          return { error: "not_found" };
        }
        set.status = 204;
      },
      { params: idParams },
    );
}
