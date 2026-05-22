# ABC — Target Architecture (From → To)

> Companion to `analysis/features.md` and `analysis/vulnerabilities.md`.
> Seeds `db/migrations/0004_seed_migration.sql` (the `migration` table is
> a granular breakdown of these moves).

---

## 1. Current state (Lovable / React / Supabase)

```
                          ┌──────────────────────────────┐
                          │  Browser  (anyone on net)    │
                          │  React 18 + Vite SPA         │
                          │  localStorage = secret store │
                          └──────────────┬───────────────┘
                                         │  fetch w/ anon key (CORS *)
                                         ▼
                       ┌───────────────────────────────────┐
                       │  Supabase Edge Functions          │
                       │  22 Deno handlers, public         │
                       │  - run-agent (Gemini SSE)         │
                       │  - run-agent-anthropic (SSE)      │
                       │  - run-agent-xai     (SSE)        │
                       │  - free-agent        (JSON)       │
                       │  - enhance-prompt    (SSE)        │
                       │  - tools/* (search, scrape,       │
                       │    api-call, github, db, email,   │
                       │    tts, pdf, ocr, zip, time,      │
                       │    weather)                       │
                       └───┬─────────────────────┬─────────┘
                           │                     │
                  outbound │ public LLMs         │ outbound APIs
                           ▼                     ▼
                ┌────────────────────┐  ┌────────────────────┐
                │ Gemini  Anthropic  │  │ Brave, Google,     │
                │ xAI     (public)   │  │ ElevenLabs, Resend,│
                │                    │  │ GitHub, arbitrary  │
                └────────────────────┘  └────────────────────┘
                           │
                           ▼
                ┌────────────────────┐
                │ Supabase Postgres  │  (small footprint; not used for app state)
                │ + Storage          │
                └────────────────────┘
```

**Critical gaps:** no auth, no tenant isolation, public anon-key, secrets in
browser, SSRF in `web-scrape`/`api-call`, arbitrary SQL in `external-db`,
CORS `*`, no audit log, no PII gate, no data-residency control. See
`vulnerabilities.md`.

---

## 2. Target state (Vue 3 + Node.js, GoA-internal)

```
                           ┌──────────────────────────────┐
                           │  Browser (authenticated GoA) │
                           │  Vue 3 + Vite SPA            │
                           │  No client-side secrets      │
                           └──────────────┬───────────────┘
                                          │ HTTPS + same-origin
                                          │ Cookie (HttpOnly, SameSite=Lax)
                                          ▼
              ┌─────────────────────────────────────────────────────┐
              │  Nexus Public Edge / Load Balancer                  │
              │  - TLS termination                                  │
              │  - HSTS, helmet headers, CSP                        │
              │  - Microsoft Entra ID SSO (OIDC)                    │
              │  - JWT mint with Entra group→ministry mapping       │
              └──────────┬─────────────────────────────┬────────────┘
                         │                             │
                         ▼                             ▼
              ┌─────────────────────┐         ┌─────────────────────┐
              │ Vue frontend (Nexus │         │ Fastify API (Nexus  │
              │ static hosting)     │         │ Node.js service)    │
              │ - SSO redirect      │         │ - JWT verify        │
              │ - Pinia + composables│        │ - rate-limit/user   │
              │ - @xyflow/vue       │         │ - body limit 4 MB    │
              └─────────────────────┘         │ - pino structured   │
                                              │   logs              │
                                              │ - PII gate          │
                                              │ - audit-log writer  │
                                              └────────┬────────────┘
                                                       │
                       ┌───────────────────────────────┼───────────────────────┐
                       │                               │                       │
                       ▼                               ▼                       ▼
            ┌─────────────────────┐        ┌─────────────────────┐  ┌──────────────────┐
            │ Vertex AI (CA)      │        │ Ent-Tools / SaaS    │  │ Postgres (shared)│
            │ - Claude on Vertex  │        │ via service-account │  │ - {ministry}     │
            │ - Gemini on Vertex  │        │ - Brave, OpenAI     │  │   schemas        │
            │ northamerica-NE1    │        │   Image, ElevenLabs │  │ - RLS per UPN/   │
            │ Montreal — data     │        │                     │  │   ministry       │
            │ residency in CA     │        │                     │  │ - pgcrypto       │
            └─────────────────────┘        └─────────────────────┘  │ - audit table    │
                                                                    └──────────────────┘
```

### Component summary

| Layer | Technology | Reason |
|-------|-----------|--------|
| Identity | Microsoft Entra ID via OIDC | GoA standard; dynamic groups `AIM-G-{MINISTRY}-ALL_EMPLOYEES`/`...ALL_CONTRACTORS` give ministry attribution for free. |
| Gateway | Fastify 5 + `@fastify/helmet` + `@fastify/cors` + `@fastify/jwt` + `@fastify/rate-limit` | Single Node process, minimal moving parts. Compatible with existing `packages/backend`. |
| Frontend | Vue 3 + Vite + Pinia + Vue Router + `@xyflow/vue` + Tailwind + shadcn-vue | Per course standard. Bundle from `goa-public` template. |
| LLM | Anthropic via Vertex (Claude 4.x), Gemini via Vertex (Gemini 2.5+) | Vertex region `northamerica-northeast1` keeps requests in Canada → unblocks Protected B. |
| Image gen | OpenAI Image Gen via Ent-Tools | Already integrated; centrally licensed. |
| Search | Brave via Ent-Tools | Already integrated. |
| TTS | ElevenLabs via Ent-Tools | Already integrated. |
| Database | Render-hosted Postgres (course-shared) for the assignment; production target is GoA Postgres in Nexus | Common DB; per-ministry schema isolation; pgcrypto for secret storage. |
| Object store | TBD — Nexus blob | For large file uploads / session ZIP export. |
| Observability | `pino` JSON logs → Nexus log sink; `prom-client` `/metrics`; healthcheck `/health` | Already partially in place. |

---

## 3. Architectural decision records (ADRs)

### ADR-001 — Monorepo vs Service-Oriented split

**Decision:** **Single npm monorepo with three workspaces** (`shared`,
`backend`, `frontend`), single deployable Fastify process for the API.

**Why not microservices:**
- Team is one person + AI; coordination tax of SOA outweighs benefits.
- Tools are mostly stateless I/O — no domain boundary justifies isolation.
- A single Node process behind the load balancer scales horizontally; we
  can lift any tool route to a worker if it becomes hot.

**Why a monorepo over polyrepo:** Shared types (`packages/shared`) prevent
contract drift; one PR can move a feature end-to-end; the CI matrix is
simpler.

**Trade-off accepted:** A bug in one tool route can crash the whole process.
Mitigated by per-route try/catch and `pino` error logging; Nexus restarts
on crash.

### ADR-002 — Common database, schema-per-ministry

**Decision:** One Postgres cluster; each ministry gets a schema (`finance`,
`health`, `education`, etc.). RLS policies key on `current_setting('app.user_ministry')`
which the API sets per connection.

**Why:** Cheaper than DB-per-ministry; still gives strong isolation because
RLS denies cross-schema reads even for service-role users. Aligns with the
exercise's explicit instruction: "common database".

### ADR-003 — Vertex AI for Claude + Gemini

**Decision:** Use Vertex AI's Anthropic + Gemini endpoints in
`northamerica-northeast1` (Montreal), authenticated by GoA service account.

**Why:** Data stays in Canada → Protected B eligible. Same API surface as
direct Anthropic/Google calls; only the auth header changes. xAI/Grok is
**deferred** — no Vertex path → cannot use until data-residency story
exists.

### ADR-004 — Server-side secret store

**Decision:** Move all BYO secrets out of `localStorage` into Postgres
`secrets` table, AES-256 encrypted with `pgcrypto`. Frontend references
secrets by ID only.

**Why:** Eliminates the V-C01 critical. Aligns with PIPEDA / GoA records
classification.

### ADR-005 — Load balancer + horizontal scale

**Decision:** Behind the Nexus public edge / load balancer. Process is
stateless; scale-out by adding instances. Sticky sessions are **not**
required because SSE streams are short-lived and per-request.

### ADR-006 — SSE preserved over websockets

**Decision:** Keep Server-Sent Events for LLM streaming. Vite proxy passes
SSE in dev; behind the LB, set `proxy_buffering off` on the path.

---

## 4. Tech-stack from→to table

| Concern | From (Lovable React/Supabase) | To (Vue/Node monorepo) |
|---------|-------------------------------|------------------------|
| Frontend framework | React 18 + JSX/TSX | Vue 3 + SFC + Composition API |
| Router | React Router v6 | Vue Router 4 |
| State | `useReducer` + custom hooks | Pinia stores + composables |
| Data layer | `@tanstack/react-query` | `@tanstack/vue-query` |
| Canvas | `reactflow` 11 | `@xyflow/vue` |
| UI primitives | shadcn/ui + Radix React | shadcn-vue + radix-vue |
| Icons | `lucide-react` | `lucide-vue-next` |
| Theme | `next-themes` | `@vueuse/core useColorMode` |
| Toasts | `sonner` | `vue-sonner` |
| Drag-and-drop | `@dnd-kit/*` | `vuedraggable@next` |
| Markdown | `react-markdown` | `vue-markdown-render` |
| Backend runtime | Supabase Edge (Deno) | Fastify 5 (Node 20) |
| LLM (Claude) | direct Anthropic API | Anthropic via Vertex AI (`northamerica-northeast1`) |
| LLM (Gemini) | direct Google API | Gemini via Vertex AI (`northamerica-northeast1`) |
| LLM (Grok) | direct xAI | **Deferred** pending data-residency story |
| Image gen | direct Gemini "nano-banana" | OpenAI Image Generation via Ent-Tools |
| Web search | Brave direct | Brave via Ent-Tools API |
| TTS | ElevenLabs direct | ElevenLabs via Ent-Tools API |
| Email | Resend direct | Defer — wire to GoA-approved relay |
| Auth | None | Microsoft Entra ID OIDC; JWT with `ministry`/`role` claims |
| Secrets storage | Browser `localStorage` (plaintext) | Postgres `secrets` table, AES-256 via `pgcrypto` |
| Database | Supabase Postgres (default schema) | GoA Postgres, schema per ministry, RLS, audit table |
| Audit | `console.log` | `audit_log` table, append-only |
| Observability | None | `pino` JSON logs + `prom-client` metrics + health |
| Rate limiting | None | `@fastify/rate-limit` per-UPN + per-ministry budget |
| CORS | `*` everywhere | Allowlisted GoA hostnames + `localhost:5173` |
| PII detection | None | Regex gate at gateway + UI confirm dialog (see §C of privacy doc) |
| Hosting | Lovable / Supabase (public) | Nexus (internal, behind GoA SSO) |

---

## 5. The full data-flow for a single Free-Agent run (target state)

1. User opens `/` → Vue app loads → no token → redirect to Entra OIDC.
2. After SSO callback, gateway mints a JWT with `{ upn, ministry, roles }`,
   sets HttpOnly cookie.
3. User clicks **Start** → frontend POSTs `/api/free-agent` with the
   session payload.
4. Fastify middleware: JWT verify → rate-limit check → body-size guard →
   PII pre-scan → audit-log writer (request hash).
5. Free-agent handler builds system prompt → calls Vertex Claude/Gemini.
6. LLM response includes tool calls → handler dispatches to
   `/api/tools/*` via in-process function calls (no extra hop).
7. Tool results returned → next iteration POSTed by frontend → loop.
8. Every step appends to `audit_log` with `correlation_id = session_id`.
9. On completion, frontend can export session ZIP — server signs a
   short-lived blob URL.

---

## 6. SOAR / STRA / Authority-to-Operate evidence checklist

Mapping to the standard SoA controls. Each row points to where the
evidence lives once produced.

| Control | Status | Evidence location |
|---------|--------|--------------------|
| Access Control (AC-1 .. AC-6) | Planned | Entra ID SSO + JWT verifier in `packages/backend/src/middleware/auth.ts` |
| Audit & Accountability (AU-2, AU-3, AU-6) | Planned | `audit_log` table — see `db/migrations/0007_audit_log.sql` (TODO) |
| Configuration Management (CM-2, CM-6) | In progress | `REBUILD_PLAN.md` + this file |
| Identification & Authentication (IA-2, IA-5) | Planned | Entra ID OIDC |
| Incident Response (IR-4) | Planned | `pino` → Nexus log sink → alerting |
| System & Comms Protection (SC-7, SC-8, SC-13) | Planned | TLS at LB; helmet/CSP; pgcrypto for at-rest |
| System & Info Integrity (SI-3, SI-4, SI-10) | Planned | Input Zod schemas; PII gate; rate limit |
| Privacy (PT-2, PT-3, PT-5) | Planned | `analysis/privacy_controls.md` |
| Risk Assessment (RA-3, RA-5) | This doc + `vulnerabilities.md` | here |
| Supply Chain (SR-3) | Planned | `npm audit` in CI; lockfiles committed |

---

## 7. Evals & trust (Blue / Red agent wiring)

- **Blue agent (defensive review).** Runs from the VELOCITY-HARNESS against
  the live repo. Hands it `analysis/vulnerabilities.md` as the existing
  scan, asks for new findings, scores triage. Outputs `analysis/blue_report.md`.
- **Red agent (offensive review).** Launches local frontend (`npm run
  dev:frontend`) + backend (`npm run dev:backend`), exercises the canvas
  + free-agent endpoints, attempts SSRF/XXE/SQLi against the SSRF/SQLi
  endpoints listed in `vulnerabilities.md`, reports in
  `analysis/red_report.md`.
- **Unit/lint evals.** `npm run lint && npm run typecheck && npm test`
  across each workspace.
- **End-to-end smoke.** Playwright run: SSO → open `/` → workflow add agent
  → run → see SSE delta → free-agent start → see iteration advance.

---

## 8. Open questions (carry into client review)

1. **Per-ministry budget vs per-user budget** for LLM cost? Probably both,
   with the ministry as the hard cap.
2. **Where do session exports go?** Object storage in Nexus, or send to
   user via signed URL?
3. **Pronghorn integration** — `pronghorn-post/index.ts` exists in source
   but is unused. Confirm with client before dropping.
4. **xAI / Grok** — drop entirely, or keep with a data-classification gate
   that blocks Protected B?
5. **Email tool** — Resend isn't GoA-approved. Replace with the GoA mail
   relay or remove entirely?
