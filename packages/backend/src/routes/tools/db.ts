import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPiiGuard, type PiiGuardField } from '../../lib/piiGuard.js';

export async function externalDb(req: FastifyRequest, reply: FastifyReply) {
  const { connectionString, action = 'query', query, isWrite, params, schemas } = req.body as {
    connectionString: string;
    action?: 'query' | 'schemas';
    query?: string;
    isWrite?: boolean;
    params?: unknown[];
    schemas?: string[];
  };

  if (!connectionString) return reply.code(400).send({ error: 'connectionString is required' });
  if (action === 'query' && !query) return reply.code(400).send({ error: 'query is required for action=query' });

  // Pre-flight PII / secret scan on user-supplied SQL + string params.
  // `connectionString` is intentionally NOT scanned — DSNs are configured
  // credentials by design, not egress content, and a `?password=…` segment
  // would false-positive the secret detector on every legitimate request.
  if (action === 'query') {
    const guardFields: PiiGuardField[] = [
      { name: 'query', value: query ?? null },
    ];
    if (Array.isArray(params)) {
      params.forEach((p, i) => {
        if (typeof p === 'string') guardFields.push({ name: `params[${i}]`, value: p });
      });
    }
    const guardOk = await runPiiGuard(req, reply, guardFields, {
      sse: false,
      route: 'POST /api/tools/db',
    });
    if (!guardOk) return;
  }

  // Dynamic import to avoid loading pg if not needed
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      if (action === 'schemas') {
        const schemaFilter = schemas?.length
          ? `AND t.table_schema IN (${schemas.map((_, i) => `$${i + 1}`).join(', ')})`
          : "AND t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')";

        const result = await client.query(
          `SELECT t.table_schema, t.table_name, c.column_name, c.data_type, c.is_nullable
           FROM information_schema.tables t
           JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
           WHERE t.table_type = 'BASE TABLE' ${schemaFilter}
           ORDER BY t.table_schema, t.table_name, c.ordinal_position`,
          schemas?.length ? schemas : [],
        );
        reply.send({ success: true, schemas: result.rows });
      } else {
        const result = await client.query(query!, params ?? []);
        reply.send({ success: true, rows: result.rows, rowCount: result.rowCount, fields: result.fields?.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })) });
      }
    } finally {
      await client.end();
    }
  } catch (err) {
    reply.code(500).send({ error: err instanceof Error ? err.message : 'Database error' });
  }
}
