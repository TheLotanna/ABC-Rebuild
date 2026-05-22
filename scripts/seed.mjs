#!/usr/bin/env node
// scripts/seed.mjs
//
// Idempotent seeder for the five AI Garage analysis tables.
// Reads data/seed/<table>.csv and UPSERTs each row by the table's natural key.
// Safe to rerun — existing rows are updated, missing rows are inserted.

import { readFile } from 'node:fs/promises';
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
  console.error('ERROR: SHARED_DATABASE_URL (or DATABASE_URL) is not set in env.');
  process.exit(1);
}

if (!/^[a-z_][a-z0-9_]*$/i.test(SCHEMA_NAME)) {
  console.error(`ERROR: SCHEMA_NAME "${SCHEMA_NAME}" is not a safe identifier.`);
  process.exit(1);
}

// ── tiny CSV parser (handles quoted fields with embedded commas / quotes) ──
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  // drop trailing empty rows
  while (rows.length && rows.at(-1).every((c) => c === '')) rows.pop();
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ''])));
}

async function loadCsv(name) {
  const file = path.join(projectRoot, 'data', 'seed', `${name}.csv`);
  const text = await readFile(file, 'utf8');
  return parseCsv(text);
}

// ── per-table upsert definitions ──
const tables = {
  features: {
    columns: ['category', 'name', 'source_path', 'description', 'status', 'notes'],
    conflict: '(category, name)',
    update: ['source_path', 'description', 'status', 'notes'],
  },
  vulnerabilities: {
    columns: ['title', 'severity', 'category', 'description', 'affected_paths',
              'mitigation', 'status', 'discovered_by', 'cwe'],
    conflict: '(title)',
    update: ['severity', 'category', 'description', 'affected_paths',
             'mitigation', 'status', 'discovered_by', 'cwe'],
  },
  migration: {
    columns: ['step_no', 'area', 'from_state', 'to_state', 'rationale', 'risk', 'status'],
    conflict: '(step_no)',
    update: ['area', 'from_state', 'to_state', 'rationale', 'risk', 'status'],
    intCols: new Set(['step_no']),
  },
  plan: {
    columns: ['phase', 'task', 'owner', 'estimate_hours', 'status', 'notes'],
    conflict: '(phase, task)',
    update: ['owner', 'estimate_hours', 'status', 'notes'],
    numericCols: new Set(['estimate_hours']),
  },
  privacy_controls: {
    columns: ['control_id', 'control_family', 'title', 'description',
              'applies_to', 'implementation', 'status'],
    conflict: '(control_id)',
    update: ['control_family', 'title', 'description', 'applies_to',
             'implementation', 'status'],
  },
};

function coerce(spec, key, val) {
  if (val === '' || val === undefined) return null;
  if (spec.intCols?.has(key)) return Number.parseInt(val, 10);
  if (spec.numericCols?.has(key)) return Number.parseFloat(val);
  return val;
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});

await client.connect();
await client.query(`SET search_path TO ${SCHEMA_NAME}, public`);
console.log(`Seeding schema "${SCHEMA_NAME}".`);

try {
  for (const [table, spec] of Object.entries(tables)) {
    const rows = await loadCsv(table);
    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows (skipped)`);
      continue;
    }
    const colList = spec.columns.join(', ');
    const placeholders = spec.columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = spec.update.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    const sql = `
      INSERT INTO ${SCHEMA_NAME}.${table} (${colList})
      VALUES (${placeholders})
      ON CONFLICT ${spec.conflict} DO UPDATE SET ${updates}, updated_at = now()
    `;
    let count = 0;
    for (const row of rows) {
      const values = spec.columns.map((c) => coerce(spec, c, row[c]));
      await client.query(sql, values);
      count++;
    }
    console.log(`  ${table}: ${count} rows upserted`);
  }
  console.log('Seed complete.');
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
