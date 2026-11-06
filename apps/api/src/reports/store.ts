import type { Database } from "bun:sqlite";
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

export function createReportStore(db: Database) {
  const insert = db.prepare(`
    INSERT INTO reports (id, delete_token_hash, body, created_at, expires_at)
    VALUES ($id, $deleteTokenHash, $body, $createdAt, $expiresAt)
  `);
  const selectLive = db.prepare<StoredReport, { id: string; now: number }>(`
    SELECT id, body, created_at AS createdAt, expires_at AS expiresAt
    FROM reports WHERE id = $id AND expires_at > $now
  `);
  const selectTokenHash = db.prepare<{ hash: string }, { id: string }>(
    "SELECT delete_token_hash AS hash FROM reports WHERE id = $id",
  );
  const remove = db.prepare("DELETE FROM reports WHERE id = $id");
  const removeExpired = db.prepare("DELETE FROM reports WHERE expires_at <= $now");

  return {
    create(body: string, now = Date.now()): CreatedReport {
      // 128 random bits: the link is the only thing protecting a report, so it must not be guessable.
      const report = { id: randomToken(16), body, createdAt: now, expiresAt: now + REPORT_TTL_MS };
      const deleteToken = randomToken(24);
      insert.run({ ...report, deleteTokenHash: sha256Hex(deleteToken) });
      return { ...report, deleteToken };
    },

    /** The report, or null when it never existed, was deleted or has expired. */
    get(id: string, now = Date.now()): StoredReport | null {
      return selectLive.get({ id, now });
    },

    /** Deletes the report when the token matches. Returns false for an unknown id or wrong token. */
    delete(id: string, deleteToken: string): boolean {
      const row = selectTokenHash.get({ id });
      if (!row || !safeEqual(row.hash, sha256Hex(deleteToken))) return false;
      remove.run({ id });
      return true;
    },

    /** Removes expired reports. Reads already hide them; this just frees the space. */
    purgeExpired(now = Date.now()): number {
      return removeExpired.run({ now }).changes;
    },
  };
}

export type ReportStore = ReturnType<typeof createReportStore>;
