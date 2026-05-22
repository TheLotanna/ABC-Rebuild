# ABC — Vulnerabilities & Improvement Backlog

> Source repo: `/Users/lotanna.okwuchukwu/Desktop/agent-builder-console-main`
> Risk legend: **C**ritical · **H**igh · **M**edium · **L**ow · **I**nfo
> CWE references where applicable.
> This file is the seed for the `vulnerabilities` table
> (`db/migrations/0003_seed_vulnerabilities.sql`).

---

## A. Authentication & Authorization

| ID | Severity | Title | Evidence | Mitigation in new stack |
|----|---------:|-------|----------|--------------------------|
| V-A01 | **C** | No authentication anywhere | App has 1 route (`/`) — no login, no session check. All backend endpoints are open. CWE-306 (Missing Authentication for Critical Function). | Wire Microsoft Entra ID SSO at the Fastify gateway. Issue short-lived JWTs. Frontend gates `/` behind `useAuthGuard()`. |
| V-A02 | **C** | No authorization / no user identity | Every `fetch` from frontend uses the public anon key. Backend has no notion of "who". CWE-862 (Missing Authorization). | Per-request `req.user = { upn, ministry, roles }` injected from JWT. Tools, secrets, sessions all scoped to user. |
| V-A03 | **H** | No ministry/tenant isolation | All data is in one Supabase project, accessible to anyone with the anon key. CWE-639 (Authorization Bypass Through User-Controlled Key). | Postgres row-level security keyed on `ministry_code`. Map `AIM-G-{MINISTRY}-ALL_*` Entra groups → `ministry_code`. See `analysis/privacy_controls.md` §B. |
| V-A04 | **H** | Anon key is also publishable key (front-end embed) | `VITE_SUPABASE_PUBLISHABLE_KEY` is shipped to every browser. Anyone can call every edge function. | After SSO migration, frontend no longer holds shared secrets. Backend calls outbound APIs server-side only. |

## B. Input validation & injection

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-B01 | **C** | **SSRF in `web-scrape`** | `supabase/functions/web-scrape/index.ts:295` — takes `url` from request, `fetch(url)` with no host allowlist or RFC1918 block. CWE-918. | Block `localhost`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.169.254` (cloud metadata), `::1`. Use DNS resolution before fetch and re-validate. Cap response size + timeout. |
| V-B02 | **C** | **SSRF in `api-call`** | `supabase/functions/api-call/index.ts:53–70` — generic HTTP proxy with caller-supplied URL, no allowlist. Reflects `headers` from caller. CWE-918. | Same as V-B01 plus: deny `Authorization` header pass-through unless tied to a configured secret instance. Strip `Cookie`, `Set-Cookie`. |
| V-B03 | **C** | **SSRF in `github-fetch`** | While constrained to `api.github.com` paths, the function builds URLs from caller-supplied `owner/repo/path` with no normalization. CWE-918. | Whitelist host = `api.github.com` only. Reject `..` in path. URL-encode segments. |
| V-B04 | **H** | **Arbitrary SQL execution in `external-db`** | `supabase/functions/external-db/index.ts:281+` — caller-supplied `connectionString` and `query` are executed verbatim. `isWrite=true` allows DDL/DML. CWE-89 / CWE-94. | Tool runs only against caller's own configured DB instance (stored encrypted, retrieved by `connection_id`). Parameterize queries. Read-only mode by default. Statement timeout. Reject `pg_*` system schemas. Log every query to audit table. |
| V-B05 | **H** | No body-size / payload limit | None of the edge functions cap `req.json()` size. Sending megabytes of `blackboard` or `files` will OOM. CWE-770. | Fastify `bodyLimit` (e.g. 4 MB) per route. Larger payloads via signed-upload to object storage. |
| V-B06 | **M** | Missing Zod / schema validation | Endpoints destructure `await req.json()` without schema check, then forward to LLM provider — accepts anything. CWE-20. | Add Zod schema per route; reject 400 on parse failure. Already done for some new Fastify routes; complete coverage. |

## C. Secrets management

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-C01 | **C** | **User API keys stored unencrypted in `localStorage`** | `useSecretsManager.ts:15` — `STORAGE_KEY = 'free_agent_secrets'`; plain JSON. Any XSS = total credential exfiltration. CWE-312 / CWE-922. | Move secrets to backend `secrets` table, encrypted with `pgcrypto` (AES-256, key from KMS). Frontend never sees secret values, only references by name. |
| V-C02 | **H** | All BYO secrets are stored in the same localStorage blob | One XSS → all providers (OpenAI / Brave / Google / GitHub / ElevenLabs) leaked at once. CWE-200. | Per-secret server-side row, per-user scoped, audit-logged on every read. |
| V-C03 | **M** | No rotation, no expiry, no scope | Secrets live forever; no expiry, no per-tool scoping check. CWE-256. | `expires_at` column; reminder at 60 days; per-tool allowlist. |
| V-C04 | **L** | `GITHUB_TOKEN` is a single shared backend env | `github-fetch/index.ts:33` — one token, all users. Quota & blame are shared. | Either keep as a backstop or wire per-user GitHub OAuth tokens via Entra-linked GitHub App. |

## D. Network / transport / CORS

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-D01 | **H** | `Access-Control-Allow-Origin: *` on every edge function | grep across `supabase/functions/*/index.ts` shows 22 wildcards. CWE-942. | New Fastify `@fastify/cors` allowlist: `https://*.gov.ab.ca` + `http://localhost:5173`. Reject everything else. |
| V-D02 | **M** | Reflected `Access-Control-Allow-Headers` includes `authorization, apikey` | Same files. Allows credentialed cross-origin requests. | After CORS lockdown, this becomes moot — still set `Vary: Origin`. |
| V-D03 | **M** | No CSP, no HSTS, no `X-Frame-Options` on responses | None of the edge functions set security headers. | Fastify `@fastify/helmet` with a strict CSP. Production reverse proxy adds HSTS. |

## E. Rate-limiting & DoS

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-E01 | **H** | No rate limits on agent endpoints | Anyone with the anon key can spam `/functions/v1/run-agent` and burn GoA's Gemini quota. CWE-770. | `@fastify/rate-limit` per `req.user.upn`: 60 chat requests / minute. Per-ministry monthly budget guardrail. |
| V-E02 | **H** | LLM token cost is unbounded | `maxOutputTokens=32768` default in `run-agent/index.ts:14`. Free Agent loop has no max-iteration cap server-side. | Server-enforced `maxIterations` (default 25), server-enforced `maxOutputTokens` cap. Per-user monthly cost meter with hard stop. |
| V-E03 | **M** | `web-scrape` adaptive throttle is in-memory | `web-scrape/index.ts:61` — per-edge-instance, not global. | Move throttle state to Redis (or Postgres advisory locks) so it's enforced across replicas. |

## F. Data handling & privacy

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-F01 | **H** | No PII detection before LLM call | Free agent forwards arbitrary user prompt + uploaded file text to Gemini / Claude / Grok with no scan. CWE-359 / PIPEDA concern. | Regex-driven PII gate (SIN, AHC, NIN, ABC #, emails, phone, addresses) — block or redact before LLM call unless user explicitly confirms. See `analysis/privacy_controls.md` §C. |
| V-F02 | **H** | No data classification labelling | Sessions are not tagged Protected A / B / C; nothing prevents Protected B data being sent to a model whose region is unknown. | Per-session `classification` enum; per-model `allowed_classifications`; refuse at gateway if mismatch. |
| V-F03 | **M** | No audit log of LLM calls | Edge functions only `console.log` to Supabase logs; no persistent who-asked-what record. CWE-778. | `audit_log` table appended on every agent call: `(upn, ministry, model, prompt_hash, tool_calls_count, ts)`. Retention per GoA records policy. |
| V-F04 | **M** | LLM provider region not enforced | Calls go to Google / Anthropic / xAI public endpoints — data residency unknown. | Use Vertex AI (Anthropic via Vertex, Gemini via Vertex) in `northamerica-northeast1` (Montreal) for Canadian data residency. Document in §3.3 architecture. |
| V-F05 | **L** | `console.log` of prompt + response in edge functions | Prompts and responses (which may contain PII) end up in cloud logs. | Hash or redact prompts before logging; use structured logger with PII filter. |

## G. Code quality / supply chain

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-G01 | **M** | `Index.tsx` is 3,191 lines | One file owns all top-level state, all modals, all dispatch. Hard to review, untestable. | Decomposition is in progress — see `REBUILD_PLAN.md` Phase 3 (Pinia stores + composables). |
| V-G02 | **M** | `dangerouslySetInnerHTML` in `ui/chart.tsx:70` | shadcn-generated; renders CSS-vars from chart config. Low practical risk but flagged. | Vue port should render via `:style` binding instead. |
| V-G03 | **L** | Hard-coded model names everywhere | grep across `supabase/functions/*` finds 25+ string literals (`"gemini-2.5-flash"`, `"claude-sonnet-4-5"`, `"grok-4-fast-non-reasoning"`). Some already deprecated. | Centralise in `packages/shared/src/models.ts` with a versioned registry. Reject unknown models at gateway. |
| V-G04 | **L** | No lockfile committed for the Deno edge functions | Each `import` pins to `https://deno.land/std@…`. A registry compromise = arbitrary code. | Vendor critical deps; on Fastify port, use npm with `npm ci`. |
| V-G05 | **L** | `@supabase/supabase-js` will be removed | Once migrated, drop the dependency entirely; reduce attack surface. | Tracked in Phase 6 polish. |

## H. Observability & operability

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-H01 | **M** | No structured logging | Edge functions emit raw `console.log`; no request ID, no correlation ID. | Fastify `pino` with `req.id`. Forward to GoA-approved log sink. |
| V-H02 | **M** | No metrics / health-checks beyond `/health` (new only) | Source app has no `/metrics`. | Prometheus-compatible `/metrics` on backend; Vue frontend reports basic page-load timing. |
| V-H03 | **L** | No error budgeting / SLOs | n/a — pre-prod. | Document target SLOs in architecture doc once user count is known. |

## I. UX / accessibility

| ID | Severity | Title | Evidence | Mitigation |
|----|---------:|-------|----------|------------|
| V-I01 | **M** | No documented WCAG 2.1 AA pass | shadcn primitives are accessible-by-default but custom canvas, free-agent panels likely fail keyboard nav. | Run `axe-core` in CI on every page; manual keyboard sweep. |
| V-I02 | **L** | No i18n scaffold | Strings hardcoded in English. Future French requirement (Bill C-13 / Alberta gov bilingual style). | Add `vue-i18n` scaffold; mark strings; defer translation. |

---

## Headline counts (for the `vulnerabilities` seed)

| Severity | Count |
|----------|------:|
| Critical | 5 |
| High     | 9 |
| Medium   | 11 |
| Low      | 6 |
| **Total**| **31** |

## Method (reusable)

1. **CORS sweep** — `grep -rn 'Access-Control-Allow-Origin' <backend>`.
2. **Secrets sweep** — `grep -rnE 'localStorage|secrets|api[_-]?key'`.
3. **SSRF sweep** — `grep -rn 'fetch(' <handlers>` and read each one to see
   if the URL is caller-supplied; then check for IP/host filtering.
4. **SQLi sweep** — `grep -rnE 'query\(|queryArray\(|queryObject\('` on
   handlers and read for parameterization.
5. **Auth sweep** — `grep -rnE 'auth\.|session|login|jwt|user_?id'`. Empty
   result == no auth.
6. **Rate-limit sweep** — `grep -rnE 'rate.?limit|throttle|429'`.

This whole scan can also be run as a Blue-agent prompt; see
`analysis/architecture.md` §F for the wiring.
