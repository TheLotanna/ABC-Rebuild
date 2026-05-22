#!/usr/bin/env node
// scripts/generate-sbom.mjs
//
// Software Bill of Materials generator for the AI Garage / ABC ATO evidence
// pack. Rerunnable: invoke via `npm run sbom:generate`. No new runtime deps
// — runs `npm ls --json --all` per workspace and a small transform.
//
// Output layout (relative to repo root):
//   analysis/sbom/root.json       — workspace-root tree
//   analysis/sbom/backend.json    — packages/backend tree
//   analysis/sbom/frontend.json   — packages/frontend tree
//   analysis/sbom/SUMMARY.md      — human-readable totals, license breakdown
//
// Each JSON file is CycloneDX-lite:
//   {
//     bomFormat: "cyclonedx-lite",
//     specVersion: "0.1",
//     metadata: { timestamp, root: { name, version }, tool: "generate-sbom.mjs" },
//     components: [
//       { type, name, version, license, purl, scope, parents: [...] },
//       ...
//     ]
//   }
//
// `purl` follows the npm Package URL spec: pkg:npm/<name>@<version>
// `scope`: "required" for prod deps, "optional" for dev/optional.

import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'analysis', 'sbom');

const WORKSPACES = [
  { id: 'root', cwd: repoRoot, label: 'workspace root' },
  { id: 'backend', cwd: path.join(repoRoot, 'packages', 'backend'), label: 'packages/backend' },
  { id: 'frontend', cwd: path.join(repoRoot, 'packages', 'frontend'), label: 'packages/frontend' },
];

/**
 * Normalise npm's license field. Newer packages use SPDX strings; older
 * packages emit `{ type: "...", url: "..." }` or an array of those. We
 * collapse everything to a single string so the SUMMARY tally is sane.
 */
function normaliseLicense(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map(normaliseLicense).filter(Boolean).join(' OR ') || null;
  }
  if (typeof raw === 'object') {
    if (typeof raw.type === 'string') return raw.type;
    if (typeof raw.name === 'string') return raw.name;
  }
  return null;
}

function purl(name, version) {
  if (!name) return null;
  if (name.startsWith('@')) {
    // pkg:npm/@scope/name@version — URL-escape the leading '@' for the spec.
    return `pkg:npm/${encodeURIComponent(name)}@${version ?? '0.0.0'}`;
  }
  return `pkg:npm/${name}@${version ?? '0.0.0'}`;
}

/**
 * Walk `npm ls --json --all` output and flatten into a component list.
 * `npm ls` nests dependencies arbitrarily deep; we de-dup by purl and track
 * which parents pulled each module in.
 */
function flatten(node, parents, registry) {
  if (!node) return;
  const deps = node.dependencies ?? {};
  for (const [name, info] of Object.entries(deps)) {
    const version = info?.version ?? null;
    const id = `${name}@${version}`;
    let existing = registry.get(id);
    if (!existing) {
      existing = {
        type: 'library',
        name,
        version,
        license: normaliseLicense(info?.license),
        purl: purl(name, version),
        scope: info?.dev || info?.optional ? 'optional' : 'required',
        parents: new Set(),
      };
      registry.set(id, existing);
    }
    for (const p of parents) existing.parents.add(p);
    // Recurse — child's parents are this node + its ancestors.
    flatten(info, [...parents, name], registry);
  }
}

function runNpmLs(cwd) {
  // `--all` gives full transitive closure. `--long` adds license, homepage,
  // and description metadata. stderr captures peer-dep noise; we ignore it.
  try {
    const stdout = execSync('npm ls --json --all --long', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    // `npm ls` exits non-zero when extraneous/missing deps are found, but
    // still produces JSON on stdout. We capture both and keep going.
    const stdout = err.stdout?.toString?.() ?? '';
    if (!stdout.trim()) {
      console.error(`npm ls failed for ${cwd}:`, err.message);
      throw err;
    }
    try {
      return JSON.parse(stdout);
    } catch (parseErr) {
      console.error(`npm ls JSON unparseable for ${cwd}:`, parseErr.message);
      throw parseErr;
    }
  }
}

async function buildWorkspaceSbom(ws) {
  console.log(`  → ${ws.label}`);
  const tree = runNpmLs(ws.cwd);
  const registry = new Map();
  flatten(tree, [tree.name ?? ws.id], registry);
  const components = [...registry.values()]
    .map((c) => ({ ...c, parents: [...c.parents].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.version ?? '').localeCompare(b.version ?? ''));
  return {
    bomFormat: 'cyclonedx-lite',
    specVersion: '0.1',
    metadata: {
      timestamp: new Date().toISOString(),
      root: { name: tree.name ?? ws.id, version: tree.version ?? null },
      tool: 'scripts/generate-sbom.mjs',
      workspaceLabel: ws.label,
    },
    components,
  };
}

function summarizeLicenses(sboms) {
  const counts = new Map();
  for (const sbom of sboms) {
    for (const c of sbom.components) {
      const lic = c.license ? String(c.license) : '(unknown)';
      counts.set(lic, (counts.get(lic) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function uniqueComponents(sboms) {
  const set = new Set();
  for (const sbom of sboms) {
    for (const c of sbom.components) set.add(`${c.name}@${c.version ?? ''}`);
  }
  return set.size;
}

async function writeSummary(sboms, audit) {
  const total = uniqueComponents(sboms);
  const licenseRows = summarizeLicenses(sboms);
  const lines = [];
  lines.push('# SBOM Summary');
  lines.push('');
  lines.push(
    `Generated by \`scripts/generate-sbom.mjs\` on ${new Date().toISOString()}. ` +
      'Per-workspace CycloneDX-lite JSON sits next to this file.',
  );
  lines.push('');
  lines.push('## Workspace totals');
  lines.push('');
  lines.push('| Workspace | Component count | npm root |');
  lines.push('|-----------|----------------:|----------|');
  for (const sbom of sboms) {
    lines.push(
      `| ${sbom.metadata.workspaceLabel} | ${sbom.components.length} | ` +
        `\`${sbom.metadata.root.name ?? '(unnamed)'}@${sbom.metadata.root.version ?? '?'}\` |`,
    );
  }
  lines.push('');
  lines.push(
    `**Distinct \`name@version\` across all three workspaces: ${total}.** ` +
      'Most components are shared transitive deps (lodash, etc.) — counts in the ' +
      'per-workspace files include duplicates pulled in by different roots.',
  );
  lines.push('');
  lines.push('## License breakdown (all workspaces combined)');
  lines.push('');
  lines.push('| License | Components |');
  lines.push('|---------|-----------:|');
  for (const [lic, n] of licenseRows) {
    lines.push(`| ${lic} | ${n} |`);
  }
  lines.push('');
  lines.push('## `npm audit` (prod deps only)');
  lines.push('');
  if (audit?.metadata?.vulnerabilities) {
    const v = audit.metadata.vulnerabilities;
    lines.push('| Severity | Count |');
    lines.push('|----------|------:|');
    for (const sev of ['critical', 'high', 'moderate', 'low', 'info']) {
      lines.push(`| ${sev} | ${v[sev] ?? 0} |`);
    }
    lines.push('');
    lines.push(`Full audit JSON: [\`audit.json\`](audit.json). Total prod deps audited: ${audit.metadata.dependencies?.prod ?? '?'}.`);
  } else {
    lines.push('`npm audit` output unavailable — see `audit.json`.');
  }
  lines.push('');
  lines.push('## ATO follow-ups for whoever picks this up next');
  lines.push('');
  lines.push(
    '- Cross-reference each `(unknown)` license entry with the package\'s `LICENSE` file in `node_modules/<pkg>/`.',
  );
  lines.push(
    '- Triage every critical/high in `audit.json` — note remediation (upgrade, pin, swap) per finding.',
  );
  lines.push(
    '- Watch the install warnings on the most recent `npm install` for deprecated packages — those need a remediation plan before ATO.',
  );
  lines.push(
    '- The remaining ATO evidence items (PIA template, security categorization, authorization boundary diagram) are still ⏳ in Phase 8 of `REBUILD_PLAN.md`.',
  );
  lines.push('');
  return lines.join('\n');
}

async function ensureOutDir() {
  if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
}

function runNpmAudit(cwd) {
  // `--omit=dev` excludes test-only chains from the audit because they don't
  // ship to production; ATO focuses on the prod attack surface. `npm audit`
  // exits non-zero when vulnerabilities are present, so swallow the throw
  // and use the stdout it printed before exiting.
  try {
    const stdout = execSync('npm audit --json --omit=dev', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    const stdout = err.stdout?.toString?.() ?? '';
    if (!stdout.trim()) return { error: err.message };
    try { return JSON.parse(stdout); } catch { return { error: 'audit JSON unparseable' }; }
  }
}

async function main() {
  console.log('Generating SBOM artifacts:');
  await ensureOutDir();
  const sboms = [];
  for (const ws of WORKSPACES) {
    const sbom = await buildWorkspaceSbom(ws);
    const file = path.join(outDir, `${ws.id}.json`);
    await writeFile(file, JSON.stringify(sbom, null, 2) + '\n', 'utf8');
    sboms.push(sbom);
  }
  console.log('  → npm audit (prod deps)');
  const audit = runNpmAudit(repoRoot);
  await writeFile(path.join(outDir, 'audit.json'), JSON.stringify(audit, null, 2) + '\n', 'utf8');
  const summary = await writeSummary(sboms, audit);
  await writeFile(path.join(outDir, 'SUMMARY.md'), summary, 'utf8');
  // Sanity-print the headline totals.
  const root = sboms.find((s) => s.metadata.workspaceLabel === 'workspace root');
  const be = sboms.find((s) => s.metadata.workspaceLabel === 'packages/backend');
  const fe = sboms.find((s) => s.metadata.workspaceLabel === 'packages/frontend');
  const meta = audit?.metadata?.vulnerabilities ?? {};
  console.log(
    `Done. root=${root?.components.length} backend=${be?.components.length} frontend=${fe?.components.length}; ` +
      `audit: critical=${meta.critical ?? 0} high=${meta.high ?? 0} moderate=${meta.moderate ?? 0} low=${meta.low ?? 0}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
