# Privacy Impact Assessment — Agent Builder Console (ABC) Vue/Node.js Rebuild

> **Status:** Template draft. Sections labelled `«FILL»` need the project's
> privacy officer or ATIP analyst to confirm or replace. Sections without
> `«FILL»` are pre-filled from the system's enforced controls (see
> [`analysis/privacy_controls.md`](privacy_controls.md), the running
> `packages/backend/src/lib/piiGuard.ts`, and migrations 0001/0002).
>
> Treasury Board PIA Directive § 5 (2020) and the GoA Office of the
> Information & Privacy Commissioner Privacy Impact Assessment Tool
> (May 2023) were used as the reference structure.

---

## 1. Identification & purpose

| Field | Value |
|-------|-------|
| Initiative name | Agent Builder Console (ABC) — Vue 3 + Fastify rebuild |
| Initiative owner | «FILL — Ministry / division of record» |
| Privacy officer / ATIP | «FILL — name, branch, contact» |
| Senior accountable officer | «FILL — ADM / Director responsible» |
| Submission date | «FILL — YYYY-MM-DD» |
| PIA classification | Protected B (template body is Unclassified) |
| Related PIAs | «FILL — predecessor PIAs for AI services in the ministry» |
| Reviewer (OIPC / TBS) | «FILL — assigned analyst once submitted» |

**Purpose of this PIA.** ABC lets GoA staff compose multi-agent LLM
workflows from a visual canvas: stage → agent → tool → output. Because
prompts and tool inputs can carry personal information, the system is
in scope under FOIP s.40 / TBS Directive on Privacy Impact Assessment.
This PIA covers the rebuilt monorepo on this branch only — the source
Lovable / Supabase prototype at `agent-builder-console-main` is **out of
scope** and is being retired.

---

## 2. Description of the initiative

### 2.1 Initiative summary

ABC is a Vue 3 SPA backed by a Fastify API. Users authenticate with
Microsoft Entra ID (SSO), select a workflow template (or build their
own), provide a free-text "user input" plus optional file uploads, and
run the workflow. Each stage is one or more LLM agents and/or deterministic
"function" nodes (logic gates, regex, parsers). Agents and functions
can invoke a curated set of HTTP tools (search, scrape, GitHub fetch,
PDF/OCR/ZIP, email, weather/time, internal DB query).

LLM calls go to Vertex AI (Claude, Gemini, Grok-via-xAI) — see the model
list in `useWorkflowRunner.ts` and `Sidebar.vue`. Vertex-hosted models
mean **prompts and outputs never leave Google Cloud Canada**.

### 2.2 Scope of the assessment

| In scope | Out of scope |
|----------|--------------|
| Frontend SPA (`packages/frontend`) | Lovable prototype (retiring) |
| Backend API (`packages/backend`) | Vertex AI service itself (covered by Google's TBS-approved attestation) |
| Shared Postgres analysis schema (`lotanna_okwuchukwu`) | Future Pronghorn ingestion (separate PIA) |
| PII guard, audit log (`migrations/0002_pii_audit_log.sql`) | Ent Tools downstream APIs (each carries its own PIA) |
| Entra ID SSO group mapping | User-supplied file *content* (covered as "personal information" below, but the file storage tier itself is out of scope until persistence is added) |

### 2.3 Status

| State | Date | Note |
|-------|------|------|
| Concept | «FILL» | |
| In development | 2026-05-22 | Current state — multi-agent build-out on `claude-c/phase-4-workflow-nodes` branch |
| First user testing | «FILL» | Conditional on this PIA being signed |
| Production launch | «FILL» | |

### 2.4 Partners

- Vertex AI (Google Cloud Canada) — model inference, no training on inputs (per the standing Google → GoA / TBS data-handling agreement; cite agreement number in `«FILL»`).
- «FILL — Microsoft Entra ID tenant administrator (Service Alberta / SSO team)».
- «FILL — Postgres operator (Render at the moment; production target?)».

---

## 3. Personal information collected

### 3.1 Data element catalog

| ID | Element | Source | Identifiability | Classification | Storage |
|----|---------|--------|-----------------|----------------|---------|
| D-01 | EntraID `oid` / UPN | SSO claim at login | Direct | Protected B | Backend session memory (proposed); never in prompt body |
| D-02 | Ministry group memberships (`AIM-G-{MIN}-ALL_EMPLOYEES` / `…ALL_CONTRACTORS`) | SSO group claim | Indirect | Protected A | Backend session memory |
| D-03 | User free-text prompt | User-entered (Sidebar `User input`) | **Variable — may contain personal information** | Protected B (assumed worst-case) | Client-only (workflow state in Pinia + JSON save/load); never written to DB |
| D-04 | Agent / function configurations | User-entered (Properties panel) | Variable | Protected B | Client-only |
| D-05 | Uploaded file content (PDF, DOCX, XLSX, etc.) | User upload | **Variable** | Protected B | Client-only; passed to backend per request |
| D-06 | Tool inputs (search query, URL, email body, SQL params, etc.) | Derived from D-03/D-04 | Variable | Protected B | Client-only request body |
| D-07 | LLM outputs | Vertex AI inference | Derivable from D-03 inputs | Protected B | Returned via SSE; rendered client-side; never written to DB |
| D-08 | PII guard audit entry | Auto-generated by `piiGuard.ts` when D-03/D-04/D-06 triggers a regex | **Metadata only — kinds, confidences, offsets** | Protected B | `lotanna_okwuchukwu.pii_audit_log` (Postgres) |
| D-09 | Workflow state JSON (Save / Load) | User download | Mirrors D-03..D-07 | Protected B | Outside system once exported; chain of custody on user |

The audit-log row (D-08) **never** contains raw matched values — see
`auditDb.ts` and `piiGuard.ts`. The strongest design property of the
guard is that the audit table itself stays out of scope for Protected B
because the kind / offset metadata is insufficient to reconstruct the
matched secret.

### 3.2 Indirect identifiers risk

A user prompt can combine several non-identifying tokens (program name,
office location, file number) into something that is identifying in
aggregate. The PII guard catches direct identifiers (SIN, AHCN, email,
phone, names) but cannot detect this combinatorial risk. **Mitigation:**
Section 6.B operator training and the "human in the loop" obligation
before exporting (D-09).

---

## 4. Authority, notice, consent

| Question | Answer |
|----------|--------|
| Legal authority for collection | «FILL — FOIP s.33(c) "directly related to and necessary for an operating program"; cite the specific program authority for each ministry deploying ABC» |
| Form of notice to individuals | In-app notice on first login (`«FILL — copy text to be approved by ATIP»`); the privacy notice must reference this PIA |
| Form of consent | Implied through employment + acknowledgement of GoA Acceptable Use; explicit consent banner only required if D-03 contains third-party PI |
| Right to access (FOIP) | Standard — directed to «FILL — ATIP coordinator per ministry» |
| Right to correct | Same channel |
| Data subject rights for non-GoA persons in D-03/D-05 | Notice obligation: when a workflow contains a third party's PI, the user must have a legal basis under FOIP to process; UI surfaces a banner before run (proposed — see §7 residual) |

---

## 5. Information flow

```
   [Browser]                       [Backend (Fastify)]                    [Vertex AI]
       │                                  │                                    │
       │  ① SSO login (Entra ID)          │                                    │
       │ ───────────────────────────────► │                                    │
       │  ② D-01, D-02 returned in JWT    │                                    │
       │ ◄─────────────────────────────── │                                    │
       │                                  │                                    │
       │  ③ POST /api/run-agent           │                                    │
       │     body = D-03, D-04, D-05      │                                    │
       │ ───────────────────────────────► │                                    │
       │                                  │ ④ piiGuard.runPiiGuard()           │
       │                                  │    scans D-03/D-04/D-06            │
       │                                  │    │                               │
       │                                  │    ├─ block? → HTTP 400 + audit    │
       │                                  │    │   to D-08 (kinds only)        │
       │                                  │    │                               │
       │                                  │    └─ allow? → audit if warn-mode  │
       │                                  │                                    │
       │                                  │ ⑤ fetch Vertex AI (TLS 1.2+)       │
       │                                  │ ─────────────────────────────────► │
       │                                  │ ⑥ SSE stream (D-07)                │
       │                                  │ ◄───────────────────────────────── │
       │  ⑦ SSE delta events              │                                    │
       │ ◄─────────────────────────────── │                                    │
       │                                  │                                    │
   (D-09 export = user-initiated download of D-03..D-07 to local disk)
```

- **Network egress** from the backend: Vertex AI (Google Cloud Canada) + the configured tool endpoints. Inventory of egress destinations: `analysis/features.md` "Tool endpoints" + `.env.example`.
- **No data is written to the Postgres analysis schema except D-08**. The five analysis tables (`features`, `vulnerabilities`, `migration`, `plan`, `privacy_controls`) are exercise artefacts and contain no operational PI.

---

## 6. Risks & mitigations

Risks are scored 1–5 on Treasury Board's qualitative scale. *Residual* is
after the listed mitigation is in place.

| ID | Risk | Likelihood | Impact | Inherent | Mitigation (control) | Residual |
|----|------|-----------:|-------:|---------:|----------------------|---------:|
| R-01 | User pastes a SIN / AHCN / API key into a prompt that then leaves the perimeter | 4 | 4 | **16** | `PII_GUARD_MODE=block` (default) — regex blocks before LLM egress; finding surfaced as toast + Output Log | **4** (residual: regex misses a novel format) |
| R-02 | Leaked OS / SDK key in a system prompt re-used across users | 3 | 5 | **15** | Same guard catches `sk-ant-…`, `AIza…`, `AKIA…`, `ghp_…`, `xox[abprs]-…`, JWTs; audit row marks `hasSecret=true` | **3** (still needs key-rotation if user reports a leak) |
| R-03 | Cross-ministry data leakage via a shared free-text artefact | 3 | 4 | **12** | Per-ministry Postgres schema (mapped from Entra ID `AIM-G-{MIN}` groups, §B of `privacy_controls.md`); ABC writes only D-08 to a single user-scoped schema in the current build | **6** (full per-ministry isolation needs the production deploy described in §D.1 of `privacy_controls.md`) |
| R-04 | Audit log itself becomes a data-leak vector | 2 | 4 | **8** | `piiGuard.emitAudit` whitelists fields to `{ kind, confidence, start, end }`; raw values never serialised; covered by `piiGuard.test.ts` "raw email NOT serialised in audit finding" | **2** |
| R-05 | Vertex AI mis-routes inference to non-Canadian region | 1 | 5 | **5** | Vertex region pinned to `northamerica-northeast1` (Montreal) — `«FILL — confirm in deployment config / GCP project»` | **2** |
| R-06 | Workflow JSON exported (D-09) ends up on a personal device / cloud drive | 3 | 4 | **12** | User-acknowledgement banner before download; download filename embeds session id + timestamp for traceability; ministry MDM enforces data-handling policy on the export device | **6** (residual depends on MDM — operator concern) |
| R-07 | Stored API keys exfiltrated via XSS | 2 | 5 | **10** | Secrets are kept in backend env, never sent to frontend; the frontend `secretsStore` references secrets *by name* only — see `useSecretsManager.ts` + ADR in `analysis/vulnerabilities.md` V-C01 | **2** (V-C01 close-out depends on backend-stored encrypted secrets — in progress in claude-festive-elbakyan's slice) |
| R-08 | Third-party tool (search, web-scrape) leaks the prompt to an upstream service | 3 | 3 | **9** | Tool config in `toolsManifest.json` enumerates exactly which endpoints can be invoked; PII guard runs on every tool route per claude-D's follow-up (a); operator allow-list documented in `privacy_controls.md` § G | **3** |
| R-09 | Free-agent self-spawn loops eat budget or escalate scope | 2 | 3 | **6** | `loopDetector.ts` caps iteration count; `advancedFeatures.maxChildren` and `childMaxIterations` capped per `freeAgentStore.ts` (defaults are conservative) | **2** |
| R-10 | Inference inputs / outputs used to train Vertex models | 1 | 5 | **5** | Standing Google → GoA agreement: zero-retention, no training on inputs (`«FILL — cite agreement #»`) | **1** |
| R-11 | A user with a non-mapped Entra group lands in an undefined ministry partition | 2 | 3 | **6** | Default deny + fall-through to a "no-ministry" view that disables tool use until a privacy officer assigns the user — `«FILL — implement before launch»` | **3** |
| R-12 | Operator can't reconstruct a past block decision for audit | 3 | 2 | **6** | Migration 0002 + `auditDb.ts` persist every guard hit (route, mode, action, kinds, ts); SUMMARY column `has_secret` indexed for fast triage | **1** |

The risk register is intentionally larger than the *unique* PII risks
because ATO reviewers expect to see operational + governance risks
considered alongside the direct privacy ones (R-09, R-11, R-12 in
particular). Renumber if your ministry uses a different schema.

### 6.1 Controls inventory

Cross-reference to existing control specs:
- [`analysis/privacy_controls.md`](privacy_controls.md) §C — PII regex gate
- [`analysis/privacy_controls.md`](privacy_controls.md) §B — Entra group mapping
- [`analysis/privacy_controls.md`](privacy_controls.md) §E — audit log
- [`analysis/privacy_controls.md`](privacy_controls.md) §G — egress allow-list
- [`migrations/0002_pii_audit_log.sql`](../migrations/0002_pii_audit_log.sql) — DB persistence
- [`packages/backend/src/lib/piiGuard.ts`](../packages/backend/src/lib/piiGuard.ts) — implementation
- [`packages/backend/src/lib/auditDb.ts`](../packages/backend/src/lib/auditDb.ts) — best-effort persistence
- [`packages/backend/src/lib/piiGuard.test.ts`](../packages/backend/src/lib/piiGuard.test.ts) — 16/16 tests pass
- [`packages/backend/src/lib/pii.test.ts`](../packages/backend/src/lib/pii.test.ts) — 18/18 tests pass

---

## 7. Residual risks & approval

### 7.1 Residual risks accepted by the SRO

«FILL — list each residual ≥ "Medium" from §6 with the SRO's
acknowledgement that the residual is acceptable, the compensating
control(s), and the review date.»

### 7.2 Open issues blocking launch

- **R-03 residual** — production per-ministry schema isolation isn't yet deployed; current build writes audit rows to a single shared `lotanna_okwuchukwu` schema.
- **R-05** — Vertex region pinning needs deployment-config confirmation.
- **R-11** — default-deny for users with no `AIM-G-{MIN}-*` group must be implemented.
- **R-07 (V-C01)** — backend secret storage with encryption (pgcrypto) is open in claude-festive-elbakyan's follow-up.

### 7.3 Sign-offs

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Privacy officer / ATIP | «FILL» |  |  |
| CISO / IT security | «FILL» |  |  |
| Senior responsible owner | «FILL» |  |  |
| OIPC reviewer (for IPC-reviewed initiatives) | «FILL» |  |  |

### 7.4 Review cadence

- Re-PIA trigger: any new tool added to `toolsManifest.json` that changes egress; any new model added to `useWorkflowRunner.ts` model-routing list; any change in data-handling agreement with Vertex / Google Cloud.
- Periodic review: **annually** (per TBS PIA Directive § 7) regardless of trigger.
- Audit-log review: monthly walk-through of `lotanna_okwuchukwu.pii_audit_log` rows where `has_secret=true` or `action='block'`.

---

## Appendix A — How to re-derive each section from source

| PIA section | Source-of-truth artefact in repo |
|-------------|----------------------------------|
| §3 data catalog | grep for `req.body` in `packages/backend/src/routes/` |
| §5 information flow | `analysis/architecture.md` + the SSE schema in `agents/sseHelper.ts` |
| §6 risks | `analysis/vulnerabilities.md` (V-*) + `analysis/privacy_controls.md` (PRV-*) — IDs are 1:1 mapped to controls |
| §6.1 controls inventory | `analysis/privacy_controls.md` + the `__schema__.privacy_controls` seed in `data/seed/privacy_controls.csv` |
| §7.4 audit-log review | `SELECT * FROM lotanna_okwuchukwu.pii_audit_log WHERE has_secret OR action='block' ORDER BY ts DESC` (see migration 0002) |

---

## Appendix B — Test evidence

| Control | Evidence | Status |
|---------|----------|--------|
| PII regex catches SIN | `pii.test.ts` cases "detects valid SIN with dashes" + "rejects SIN that fails Luhn" | ✅ |
| PII regex catches LLM-vendor secrets | `pii.test.ts` cases "detects Anthropic key" / "detects Google API key" / "detects AWS access key id" | ✅ |
| Guard blocks high-confidence or secret hits | `piiGuard.test.ts` + live smoke test recorded in `REBUILD_PLAN.md` (Phase 7 entry) | ✅ |
| Guard never blocks on DB outage | Live smoke test recorded in `REBUILD_PLAN.md` ("36 ms response time, broken DB") | ✅ |
| Audit row carries no raw value | `piiGuard.test.ts` case "audit payload NEVER serialises raw matched values" | ✅ |
| Block reason surfaced to user | `useWorkflowRunner.ts` `maybeToastPiiBlock` + Output Log entry; browser-verified in `REBUILD_PLAN.md` Phase 7 follow-up (b) | ✅ |
| Audit row persisted | Migration 0002 applied + `auditDb.recordAuditEvent`; **deployment-blocked on shared-DB creds** — verification deferred | 🟡 |
