# Authorization Boundary — Agent Builder Console (ABC)

> **Purpose.** ITSG-33 PL-8 / NIST SP 800-53 PL-8 require the system owner
> to declare an explicit authorization boundary: what is being authorized,
> what supporting services are inherited (covered by their own
> authorities), and what is excluded.
>
> Pairs with [`security_categorization.md`](security_categorization.md)
> (categorization decision) and [`pia_template.md`](pia_template.md)
> (information-flow diagram in § 5).

---

## 1. Boundary at a glance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    OUTSIDE THE BOUNDARY — INHERITED                         │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  Microsoft   │  │  Vertex AI   │  │  Render.com  │  │  Ent Tools     │   │
│  │  Entra ID    │  │  (Canada     │  │  Postgres    │  │  (sandboxed    │   │
│  │  (tenant)    │  │   region)    │  │  hosting     │  │   API gateway) │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘   │
│         │                 │                 │                  │            │
│         │ SSO claims      │ TLS inference   │ TLS connection   │ TLS HTTP   │
│         │ (oid, groups)   │ stream          │ (sslmode=require)│  reqs      │
│         │                 │                 │                  │            │
│ ════════╪═════════════════╪═════════════════╪══════════════════╪═══════════ │
│         ▼                 ▲                 ▲                  ▲    Authoriz.│
│ ┌───────────────────────────────────────────────────────────────────────┐   │
│ │                  INSIDE THE BOUNDARY — AUTHORIZED                     │   │
│ │                                                                       │   │
│ │  ┌────────────────────────┐         ┌────────────────────────────┐    │   │
│ │  │  Frontend SPA          │ HTTPS   │  Fastify backend           │    │   │
│ │  │  packages/frontend     │ ────►   │  packages/backend          │    │   │
│ │  │                        │         │                            │    │   │
│ │  │  - Pinia stores        │ SSE     │  - /api/run-agent/*        │    │   │
│ │  │  - useWorkflowRunner   │ ◄────   │  - /api/free-agent         │    │   │
│ │  │  - piiGuardClient.ts   │         │  - /api/tools/*            │    │   │
│ │  │  - Vue Router          │         │  - piiGuard.ts (SI-10)     │    │   │
│ │  │                        │         │  - auditDb.ts (AU-12)      │    │   │
│ │  └────────────────────────┘         └────────────┬───────────────┘    │   │
│ │                                                  │                    │   │
│ │                                                  │ INSERT             │   │
│ │                                                  ▼                    │   │
│ │                              ┌──────────────────────────────────┐     │   │
│ │                              │  Postgres schema                 │     │   │
│ │                              │  lotanna_okwuchukwu              │     │   │
│ │                              │                                  │     │   │
│ │                              │  - pii_audit_log (D-08)          │     │   │
│ │                              │  - features                      │     │   │
│ │                              │  - vulnerabilities               │     │   │
│ │                              │  - migration                     │     │   │
│ │                              │  - plan                          │     │   │
│ │                              │  - privacy_controls              │     │   │
│ │                              └──────────────────────────────────┘     │   │
│ └───────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              EXCLUDED FROM SCOPE
   ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────────────┐
   │  User device +      │   │  Lovable / Supabase │   │  Files / data on   │
   │  browser            │   │  prototype          │   │  user's local disk │
   │  (MDM-managed)      │   │  (being retired)    │   │  after D-09 export │
   └─────────────────────┘   └─────────────────────┘   └────────────────────┘
```

---

## 2. Inside the boundary (the system being authorized)

| Component | Repo path | Owner | Classification |
|-----------|-----------|-------|----------------|
| Frontend SPA | `packages/frontend/` | Program area | Protected B (processes D-03/D-05/D-09) |
| Backend API | `packages/backend/` | Program area | Protected B (processes everything in PIA §3) |
| Shared TS types | `packages/shared/` | Program area | Unclassified (type-only) |
| Postgres schema `lotanna_okwuchukwu` | `migrations/0001..0002` | DBA + program area | Protected B (audit + analysis tables) |
| Build / deploy scripts | `scripts/`, root `package.json` | Program area | Unclassified |
| Analysis docs | `analysis/*.md` | Program area | Unclassified |

**Authorizer** for everything above: «FILL — SRO per `pia_template.md`».

### 2.1 Trust zones inside the boundary

| Zone | Members | Trust level |
|------|---------|-------------|
| Browser-side | Frontend SPA, Pinia stores, localStorage | **User-trusted only** — no secrets land here (V-C01 close-out enforces this) |
| Backend-side | Fastify app, in-memory session state | **Operator-trusted** — env-level secrets, full PII guard, full audit |
| Data-side | Postgres analysis schema | **DBA-trusted** — write access only to backend service account |

---

## 3. Inherited services (out of scope, covered by their own authorities)

These are dependencies the system depends on but does not author. Each
must have its own attestation / agreement on file.

| Service | What we use it for | Attestation needed |
|---------|--------------------|--------------------|
| **Microsoft Entra ID** | SSO + group claims for `AIM-G-{MIN}-*` mapping | TBS standing tenant agreement; specific app registration `«FILL — app-id»` |
| **Vertex AI** (Google Cloud Canada) | LLM inference (Anthropic, Gemini, Grok-via-xAI) | TBS / Google data-handling agreement `«FILL — agreement #»`, Canada-region pinning verified deploy-time |
| **Render.com Postgres** (or production target) | Hosts `lotanna_okwuchukwu` schema | Hosting attestation `«FILL»`; sslmode=require enforced in `scripts/migrate.mjs` |
| **Ent Tools API gateway** | Brave Search, Google Search, ElevenLabs TTS, OpenAI image gen, etc. (egress allow-list in `privacy_controls.md` § G) | Per-tool attestations — each tool route's upstream needs its own coverage |
| **OS / runtime: Node 20** | Backend runtime | Inherited from OS-image attestation `«FILL — base image»` |
| **TLS roots (system trust store)** | Outbound TLS verification | Inherited from OS |

---

## 4. Trust boundaries crossed

Every line that crosses **out of** the authorized zone or **between** trust
zones inside it needs a control. The table below is the canonical list —
each row maps to at least one SC-7 (boundary protection) requirement.

| # | From | To | Direction | Protocol | Control |
|---|------|-----|-----------|----------|---------|
| 1 | User browser | Entra ID tenant | egress | OIDC / HTTPS | Inherited from Entra |
| 2 | Entra ID | User browser | ingress | JWT in OIDC redirect | Inherited |
| 3 | User browser | Frontend SPA bundle | ingress | HTTPS (CDN) | TLS 1.2+; same-origin |
| 4 | User browser | Backend `/api/*` | egress | HTTPS + Vite proxy in dev | CORS allow-list (`fastify/cors` config); CSRF mitigation: bearer-token + same-site cookie planned |
| 5 | Backend | Postgres `lotanna_okwuchukwu` | egress | TLS (`sslmode=require`) | Service account; least privilege |
| 6 | Backend | Vertex AI | egress | HTTPS (region-pinned) | `«FILL — verify region pin»`; bearer = `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`XAI_API_KEY` |
| 7 | Backend | Ent Tools APIs | egress | HTTPS (per-tool endpoint) | Tool allow-list in `toolsManifest.json`; PII guard on tool routes (claude-D + claude-festive-elbakyan slices) |
| 8 | Backend | User browser (SSE) | ingress→egress | HTTPS (text/event-stream) | TLS; SSE error events carry `piiGuard.findings` audit reason (frontend surfaces via toast + Output Log) |
| 9 | User browser | User local disk | egress | DOM `download` attribute | Browser sandbox + MDM (out of scope — see § 5) |

**Critical-path control = boundary 6, 7, 8.** Boundary 6 is where the PII
guard fires (pre-flight on `runPiiGuard`). Boundary 7 is where the
extended guard runs (claude-D / claude-festive-elbakyan added the
tool-route gating). Boundary 8 is where the user learns *why* a request
was blocked.

---

## 5. Explicit exclusions

These are deliberately **not** authorized as part of this PIA / ATO.
Trying to control them would either be impossible or duplicate an
existing authority:

| Item | Why excluded | Compensating authority |
|------|--------------|------------------------|
| The user's device (laptop, phone) | Controlled by GoA MDM, not ABC | GoA endpoint-management standard |
| The browser | Vendor-controlled; we rely on its sandbox | Browser vendor's security model |
| Files **after** the user clicks Save / Download (D-09) | Off-system from that moment | GoA information-management directive + user acceptable-use agreement |
| The Lovable / Supabase prototype at `agent-builder-console-main` | Being retired; covered by its own (lapsed) authorization | Retirement plan in `analysis/migration_plan.md` |
| Vertex AI's internal infrastructure | Not ours to authorize | Standing Google Cloud Canada attestation |
| Ent Tools' upstream services (the actual Brave, Google, OpenAI, ElevenLabs APIs) | Each carries its own ATIA / DPIA | Ent Tools gateway attestation `«FILL»` |
| Microsoft Entra ID tenant beyond the app registration | Service Alberta operates the tenant | SSO/Entra tenant attestation |

---

## 6. Boundary changes that trigger re-authorization

A change in any of these requires reopening this document **and** the PIA:

- Adding a new tool to `packages/backend/src/routes/tools/` or
  `packages/frontend/public/data/toolsManifest.json` (changes boundary 7).
- Adding a new LLM provider to `useWorkflowRunner.ts` model routing
  (changes boundary 6 and the underlying Google agreement scope).
- Moving the Postgres host to a different region or provider (changes
  boundary 5, inherited service in § 3).
- Persisting D-03..D-07 anywhere (currently client-only, see PIA § 3).
- Replacing the per-user schema model with a per-ministry one
  (changes the AC-3 enforcement story in
  [`security_categorization.md`](security_categorization.md) § 6).

---

## 7. Approval

| Role | Name | Decision | Date |
|------|------|----------|------|
| System owner / SRO | «FILL» | Boundary acknowledged | |
| Security authority (CISO) | «FILL» | Concur with scope | |
| Privacy officer / ATIP | «FILL» | Concur (consistent with PIA scope) | |
| Operator / DevOps | «FILL» | Operationally feasible | |

---

## Appendix — Quick cross-reference

| Boundary number (§ 4) | PIA flow step | Categorization control (§ 6 of `security_categorization.md`) | Test evidence |
|----------------------:|---------------|--------------------------------------------------------------|---------------|
| 1, 2 | ① SSO login (`pia_template.md` § 5) | IA-2 user identification | Manual SSO test before prod |
| 4 | ③ POST /api/run-agent | SC-7 boundary; AC-3 group → schema | E2E walkthrough (Phase 6 final-verification slice) |
| 6 | ⑤ fetch Vertex AI | SI-10 PII guard (regex + Luhn) | `pii.test.ts` 18 cases + `piiGuard.test.ts` 16 cases |
| 7 | (tool call inside ⑤) | SI-10 + SC-7 tool allow-list | `routes/tools/email.ts`, `db.ts`, `search.ts` all run `runPiiGuard` |
| 8 | ⑦ SSE deltas back to browser | AU-2 audit + frontend surface | Browser smoke recorded in Phase 7 follow-up (b) |
