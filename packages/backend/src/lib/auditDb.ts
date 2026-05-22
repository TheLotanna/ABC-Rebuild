// auditDb.ts — best-effort persistence for piiGuard audit events into the
// shared Postgres `__schema__.pii_audit_log` table created by migration 0002.
//
// Design notes:
//   - Single shared pg Pool, created lazily on first write. If
//     `SHARED_DATABASE_URL` is unset (e.g. local dev without DB), every call
//     becomes a no-op — the existing stderr audit line still goes out.
//   - Inserts are fire-and-forget (`void` return + `.catch` swallow); a slow
//     or down DB must never block an agent request. Errors are logged to
//     stderr once per failure with a `audit_db_error` tag so it's
//     greppable.
//   - Schema name is taken from $SCHEMA_NAME (matches scripts/migrate.mjs).
//     Identifier is whitelisted (alphanumeric + underscore) before being
//     interpolated into the SQL string, since identifiers can't use $1 binds.

import os from 'node:os';
import type { PiiAuditFinding } from './piiGuard.js';

type PgClient = {
  query: (text: string, values: unknown[]) => Promise<unknown>;
  end: () => Promise<void>;
};

type PgModule = {
  default: { Pool: new (cfg: Record<string, unknown>) => PgClient };
};

let poolPromise: Promise<PgClient | null> | null = null;
let warned = false;

function resolveSchema(): string {
  const raw = (process.env.SCHEMA_NAME ?? 'lotanna_okwuchukwu').trim();
  // Identifier-safe whitelist; refuse anything else so we can never
  // accidentally interpolate hostile input into the SQL.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw)) {
    if (!warned) {
      process.stderr.write(
        JSON.stringify({
          audit_db_error: true,
          reason: 'invalid_schema_name',
          schema: raw,
        }) + '\n',
      );
      warned = true;
    }
    return 'lotanna_okwuchukwu';
  }
  return raw;
}

async function getPool(): Promise<PgClient | null> {
  if (!process.env.SHARED_DATABASE_URL && !process.env.DATABASE_URL) {
    return null;
  }
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    try {
      const pg = (await import('pg')) as unknown as PgModule;
      const connectionString =
        process.env.SHARED_DATABASE_URL ?? process.env.DATABASE_URL;
      const ssl =
        connectionString && connectionString.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : undefined;
      // `pg`'s default export is the CJS namespace { Client, Pool, ... }.
      const Pool = pg.default.Pool;
      return new Pool({
        connectionString,
        ssl,
        max: 4,
        idleTimeoutMillis: 10_000,
      });
    } catch (err) {
      process.stderr.write(
        JSON.stringify({
          audit_db_error: true,
          reason: 'pool_init_failed',
          message: err instanceof Error ? err.message : String(err),
        }) + '\n',
      );
      return null;
    }
  })();
  return poolPromise;
}

export interface AuditDbRecord {
  route: string;
  mode: 'block' | 'warn' | 'off';
  action: 'allow' | 'warn' | 'block';
  reqId: string | undefined;
  findings: PiiAuditFinding[];
}

/**
 * Append a single audit row to `<schema>.pii_audit_log`. Returns
 * immediately; the actual INSERT is awaited asynchronously and errors are
 * routed to stderr. Never throws.
 */
export function recordAuditEvent(rec: AuditDbRecord): void {
  void (async () => {
    const pool = await getPool();
    if (!pool) return;
    const schema = resolveSchema();
    const hasSecret = rec.findings.some((f) => f.hasSecret);
    const hasHighConf = rec.findings.some((f) => f.hasHighConfidence);
    try {
      await pool.query(
        `INSERT INTO ${schema}.pii_audit_log
           (route, mode, action, req_id, has_secret, has_high_conf, findings, server_host)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          rec.route,
          rec.mode,
          rec.action,
          rec.reqId ?? null,
          hasSecret,
          hasHighConf,
          JSON.stringify(rec.findings),
          os.hostname(),
        ],
      );
    } catch (err) {
      process.stderr.write(
        JSON.stringify({
          audit_db_error: true,
          reason: 'insert_failed',
          message: err instanceof Error ? err.message : String(err),
          schema,
        }) + '\n',
      );
    }
  })();
}
