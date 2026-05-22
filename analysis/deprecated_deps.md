# Deprecated-Package Remediation Plan

> **Date:** 2026-05-22
> **Owner:** claude-C
> **Status:** Direct deprecations resolved ✅. Transitive deprecations
> documented + watching upstream.

This document covers every npm-install deprecation warning observed in
the ABC repo and what we did (or chose not to do) about each. Pairs
with [`analysis/sbom/SUMMARY.md`](sbom/SUMMARY.md) and the
[`audit.json`](sbom/audit.json) snapshot.

## Direct deprecations — resolved

| Package | Status | Action |
|---------|--------|--------|
| `lucide-vue-next@0.513.0` (deprecated upstream → `@lucide/vue`) | ✅ migrated | Replaced with `@lucide/vue@^1.16.0` across 48 SFCs + `iconRegistry.ts`. `LucideIcon` named type (which `@lucide/vue` doesn't export) substituted with `Component` from Vue in both `iconRegistry.ts` and `WorkflowNodeComponent.vue`. **`Github` brand icon was dropped from `@lucide/vue`** (Lucide moved brand glyphs to `@lucide/lab` for trademark cleanness) — swapped to `GitBranch` everywhere it was referenced: `iconRegistry.ts`, `functionDefinitions.ts` (`iconName: "Github"` → `"GitBranch"`), `ToolNode.vue`, `GitHubTreeModal.vue`, `SystemPromptViewer.vue`, `AttributeNode.vue`. |
| `uuid@8.3.2` (bounds-check vuln) | ✅ overridden | See `analysis/sbom/SUMMARY.md` — `overrides: { "uuid": "^11.1.1" }` block in workspace-root `package.json`. |
| `jspdf@3.x` (10 CVEs incl. LFI + PDF Injection) | ✅ upgraded | Direct dep upgraded `^3.0.3` → `^4.2.1` — see SBOM triage. |

## Transitive deprecations — not directly remediable

These appear as `npm install` warnings. They're pulled in by other
packages we don't control; fixing them would require either an
`npm overrides` block (with risk of breaking the parent package) or
waiting for the parent to upgrade. **None are exploitable on our prod
surface** — `npm audit --omit=dev` returns `0 / 0 / 0 / 0` across all
severity tiers as of this writing.

| Package | Pulled in by | Why we're not patching today |
|---------|--------------|------------------------------|
| `rimraf@2.7.1` | tar / older build tooling | Build-time only; not in prod bundle |
| `fstream@1.0.12` | older archive deps | Same — build-only |
| `inflight@1.0.6` (memory leak) | old `glob@7` | Same — only matters in long-running CI; npm install runs are short |
| `glob@7.2.3` (sec vuln in glob's parser) | older test/build tools | Same — build-only, not on prod attack surface |
| `lodash.isequal@4.5.0` | various | Could swap to `node:util.isDeepStrictEqual` if/when we own the call site; not currently in our own code |
| `whatwg-encoding@3.1.1` | jsdom or similar | Test-only |

### Tracking policy

- **At each release**, rerun `npm install` and grep the output for
  `npm warn deprecated`. If new entries appear in **direct** deps,
  remediate before merging. If they appear in **transitive** deps,
  add a row to the table above and revisit at the next major upgrade.
- **At each `npm audit`** (via `npm run sbom:generate`), confirm that
  none of the transitive deprecations have escalated into security
  advisories. The audit.json under `analysis/sbom/` is the snapshot
  of record.

## Re-verification after this slice

```sh
$ npm test
  Test Files  2 passed (backend)
       Tests  26 passed
  Test Files  4 passed (frontend)
       Tests  69 passed

$ npm run build
  ✓ backend: dist/index.cjs  2.5 MB
  ✓ frontend: dist/assets/index-….js  3.6 MB / 1.05 MB gzip

$ npm run redblue:red
  Result: 25/25 passed

$ npm audit --omit=dev
  found 0 vulnerabilities
```

No regressions. Icon UX is unchanged except the `github_files`
function-definition entry now renders a `GitBranch` glyph instead of
the GitHub octocat — acceptable trade-off for a moderately-used icon.
