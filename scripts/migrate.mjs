#!/usr/bin/env node
// scripts/migrate.mjs
//
// Runs every .sql file in ../migrations/ in lexical order against the shared
// Postgres. Schema name is substituted at runtime by replacing the literal
// token `__SCHEMA__` with $SCHEMA_NAME. All migrations are expected to be
// idempotent (CREATE … IF NOT EXISTS, etc.) so reruns are safe.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(projectRoot, '.env') });

const DATABASE_URL = process.env.SHARED_DATABASE_URL || process.env.DATABASE_URL;
const SCHEMA_NAME = (process.env.SCHEMA_NAME || 'lotanna_okwuchukwu').trim();

if (!DATABASE_URL) {
  console.error(
    'ERROR: SHARED_DATABASE_URL (or DATABASE_URL) is not set in env.\n' +
    'Add it to .env or export it before running `npm run db:migrate`.'
  );
  process.exit(1);
}

if (!/^[a-z_][a-z0-9_]*$/i.test(SCHEMA_NAME)) {
  console.error(`ERROR: SCHEMA_NAME "${SCHEMA_NAME}" is not a safe identifier.`);
  process.exit(1);
}

const migrationsDir = path.join(projectRoot, 'migrations');
const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('No migration files found in', migrationsDir);
  process.exit(0);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();
console.log(`Connected. Applying ${files.length} migration(s) to schema "${SCHEMA_NAME}".`);

try {
  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const raw = await readFile(fullPath, 'utf8');
    const sql = raw.replaceAll('__SCHEMA__', SCHEMA_NAME);
    console.log(`  → ${file}`);
    await client.query(sql);
  }
  console.log('All migrations applied.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
