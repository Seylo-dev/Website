import type { SQL } from "bun";
import { randomToken, safeEqual, sha256Hex } from "../crypto";

export const REPORT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface StoredReport {
  id: string;
  body: string;
  createdAt: number;
  expiresAt: number;
}

export interface CreatedReport extends StoredReport {
  /** Lets the uploader delete the report early. Only its hash is stored. */
  deleteToken: string;
}

// The timestamps are BIGINT columns, which Postgres returns as strings.
type ReportRow = { id: string; body: string; createdAt: number | string; expiresAt: number | string };

/**
 * The text as it is stored. Postgres TEXT can't hold a NUL byte (SQLSTATE 22021) and log lines with
 * binary garbage in them do carry one, so it becomes U+FFFD, the mark the page shows for it anyway.
 * Replaced, not removed, so no two pieces the secret check saw apart are joined into one. U+FFFD
 * is 3 bytes in UTF-8, so the stored body can be up to 3 times the upload.
 */
export const storedReportBody = (text: string) => text.replaceAll("\0", "\uFFFD");

export function createReportStore(sql: SQL) {
  return {
    async create(text: string, now = Date.now()): Promise<CreatedReport> {
      const body = storedReportBody(text);
      // 128 random bits: the link is the only thing protecting a report, so it must not be guessable.
      const report = { id: randomToken(16), body, createdAt: now, expiresAt: now + REPORT_TTL_MS };
      const deleteToken = randomToken(24);
      await sql`
        INSERT INTO reports (id, delete_token_hash, body, created_at, expires_at)
        VALUES (${report.id}, ${sha256Hex(deleteToken)}, ${report.body}, ${report.createdAt}, ${report.expiresAt})
      `;
      return { ...report, deleteToken };
    },

    /** The report, or null when it never existed, was deleted or has expired. */
    async get(id: string, now = Date.now()): Promise<StoredReport | null> {
      const [row] = await sql<ReportRow[]>`
        SELECT id, body, created_at AS "createdAt", expires_at AS "expiresAt"
        FROM reports WHERE id = ${id} AND expires_at > ${now}
      `;
      return row ? { ...row, createdAt: Number(row.createdAt), expiresAt: Number(row.expiresAt) } : null;
    },

    /** Deletes the report when the token matches. Returns false for an unknown id or wrong token. */
    async delete(id: string, deleteToken: string): Promise<boolean> {
      const [row] = await sql<{ hash: string }[]>`SELECT delete_token_hash AS hash FROM reports WHERE id = ${id}`;
      if (!row || !safeEqual(row.hash, sha256Hex(deleteToken))) return false;
      await sql`DELETE FROM reports WHERE id = ${id}`;
      return true;
    },

    /** Removes expired reports. Reads already hide them; this just frees the space. */
    async purgeExpired(now = Date.now()): Promise<number> {
      const result = await sql`DELETE FROM reports WHERE expires_at <= ${now}`;
      return result.count;
    },
  };
}

export type ReportStore = ReturnType<typeof createReportStore>;
