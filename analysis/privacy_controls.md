# ABC — Privacy & Information-Management Controls

> Target: process and contain information classified up to **Protected B**.
> Companion to `analysis/architecture.md` §3.3 and `vulnerabilities.md` §F.
> This file seeds the `privacy_controls` table
> (`db/migrations/0006_seed_privacy_controls.sql`).

---

## A. Information classification model

| Class | Meaning | Where allowed |
|-------|---------|---------------|
| **Unclassified** | Public / non-sensitive | Any model, any tool |
| **Protected A** | Limited harm if compromised | Vertex-hosted models only; no `external-db` to non-GoA hosts; no `web-scrape` of non-GoA URLs |
| **Protected B** | Serious harm if compromised | Vertex-hosted models only; tools allowlisted; PII gate **must** pass or be user-confirmed; full audit |
| **Protected C** | _Out of scope_ for v1 | Blocked at gateway |

Every session carries a `classification` enum. Default = Protected A
(safer default than Unclassified). User must explicitly upgrade to
Protected B in the session dialog. Downgrade is disallowed once data has
flowed.

Implementation:

```sql
ALTER TABLE sessions
  ADD COLUMN classification text NOT NULL
    CHECK (classification IN ('unclassified','protectedA','protectedB'));
```

Gateway middleware refuses to call a model whose
`models.allowed_classifications` array does not contain the session
classification.

---

## B. Identity & ministry attribution

Microsoft Entra ID OIDC. Tokens carry the `groups` claim populated by
**dynamic groups**:

```
AIM-G-{MINISTRY}-ALL_EMPLOYEES
AIM-G-{MINISTRY}-ALL_CONTRACTORS
```

Mapping at JWT-mint time:

```ts
function ministryFromGroups(groups: string[]): string | null {
  const re = /^AIM-G-([A-Z]+)-ALL_(EMPLOYEES|CONTRACTORS)$/;
  const matches = groups.map(g => g.match(re)).filter(Boolean);
  if (matches.length === 0) return null;        // refuse access
  if (new Set(matches.map(m => m![1])).size > 1) {
    // user is in multiple ministries — pick the requested one via UI
    return null; // require explicit selection
  }
  return matches[0]![1].toLowerCase();
}
```

The JWT carries `{ upn, ministry, role }` where `role` is
`employee | contractor`. Every Postgres connection sets:

```sql
SET LOCAL app.user_upn = '<upn>';
SET LOCAL app.user_ministry = '<ministry>';
SET LOCAL app.user_role = '<role>';
```

Tables under per-ministry schemas have RLS policies keyed on these
session variables.

---

## C. PII detection (regex pre-LLM gate)

Run **before** any LLM call. If a pattern matches, the gateway returns a
`requires_confirmation` payload; the UI surfaces a Protected-B-style
confirmation dialog listing the matches and the user must explicitly
proceed (or redact). All confirmations are audited.

Patterns (anchored to GoA / Alberta context):

| Class | Pattern | Notes |
|-------|---------|-------|
| Email | `/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g` | |
| Phone (CA) | `/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g` | |
| SIN | `/\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b/g` | False-positive prone; cross-check Luhn |
| Alberta Health Card | `/\b\d{5}[-\s]?\d{4}\b/g` | 9-digit personal health number |
| Driver's licence (AB) | `/\b[0-9]{6}[-\s]?[0-9]{3}\b/g` | 9-digit numeric |
| Postal code | `/[A-Z]\d[A-Z][ -]?\d[A-Z]\d/g` | |
| Credit card | Luhn-checked 13–19 digit | Use proper Luhn validator, not just regex |
| IP address | `/\b(?:\d{1,3}\.){3}\d{1,3}\b/g` | Block egress to RFC1918 separately |
| Generic IDs (prefix-driven) | `/\bABC[-_]?[A-Z0-9]{6,}\b/g`, `/\bAHS[-_]?[A-Z0-9]{6,}\b/g` | Configurable per-ministry |
| API keys / secrets | `/sk-[A-Za-z0-9]{32,}/`, `/AIza[0-9A-Za-z_-]{35}/`, `/ghp_[A-Za-z0-9]{36}/`, `/xai-[A-Za-z0-9]{32,}/`, `/AKIA[0-9A-Z]{16}/` | OpenAI, Google, GitHub PAT, xAI, AWS access key |
| Private key blocks | `/-----BEGIN [A-Z ]*PRIVATE KEY-----/` | Refuse outright — no override |
| Common name patterns | optional, off by default | Names alone aren't sensitive; high false-positive |

Implementation lives in `packages/backend/src/middleware/piiGate.ts`. Unit
tests must exercise each pattern. Output: an array of
`{ class, match, offset }` for the UI to render.

**Hard refusals** (cannot be overridden by user): private-key blocks,
known-prefix API keys. These cause a 400 with `code=pii_hard_refusal`.

---

## D. Data segmentation & sharing

### D.1 Per-ministry schemas

Each ministry gets a schema in the shared Postgres:

```sql
CREATE SCHEMA IF NOT EXISTS health  AUTHORIZATION app_health;
CREATE SCHEMA IF NOT EXISTS finance AUTHORIZATION app_finance;
-- etc.
```

The Node service connects as `app_gateway`, then per request runs
`SET ROLE app_<ministry>; SET LOCAL app.user_upn = ...`. RLS policies
inside each schema gate by `upn`/`ministry`.

### D.2 Sharing across ministries

A `share` is a first-class, audited row:

```sql
CREATE TABLE shared.shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL,  -- 'workflow' | 'session' | 'tool_instance'
  resource_id uuid NOT NULL,
  source_ministry text NOT NULL,
  target_ministry text NOT NULL,
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
```

Granting requires a ministry-admin role on the source side. Access is
read-only by default; write-back is opt-in per share.

### D.3 Session data lifetime

- Default retention: **90 days** for Protected B sessions, **365 days**
  for Protected A, **730 days** for Unclassified.
- Auto-purge job runs nightly: `DELETE FROM sessions WHERE created_at <
  now() - interval … AND revoked_at IS NULL`.
- User can request earlier purge via UI; recorded in `audit_log`.

---

## E. Audit log

Append-only, schema `shared.audit_log`:

```sql
CREATE TABLE IF NOT EXISTS shared.audit_log (
  id              bigserial PRIMARY KEY,
  ts              timestamptz NOT NULL DEFAULT now(),
  correlation_id  uuid NOT NULL,
  upn             text NOT NULL,
  ministry        text NOT NULL,
  action          text NOT NULL,            -- 'agent.call', 'tool.scrape', 'pii.confirmed', 'share.grant', ...
  resource_type   text,
  resource_id     uuid,
  model           text,
  classification  text,
  pii_findings    jsonb,                    -- redacted classes only, no values
  http_status     int,
  duration_ms     int,
  request_hash    text,                     -- sha256 of prompt; do not store raw prompt
  metadata        jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_upn_ts_idx ON shared.audit_log (upn, ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_ministry_ts_idx ON shared.audit_log (ministry, ts DESC);
```

Writes happen at gateway exit, never inside business logic. `pino` mirror
to log sink for streaming SIEM.

---

## F. Secrets handling

- `secrets` table per-user, AES-256 encrypted by `pgcrypto`:
  ```sql
  CREATE TABLE IF NOT EXISTS shared.secrets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    upn text NOT NULL,
    name text NOT NULL,         -- 'OPENAI_API_KEY', 'CUSTOM_PG', ...
    value_encrypted bytea NOT NULL,
    classification text NOT NULL DEFAULT 'protectedB',
    expires_at timestamptz,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (upn, name)
  );
  ```
- Encryption key in KMS; injected at startup via env. Rotation: re-encrypt
  in-place under new key, mark old key revoked.
- Reads always go through `pgp_sym_decrypt(value_encrypted, …)` inside a
  read-only transaction; the decrypted value never leaves the process.

---

## G. Egress controls

- SSRF guard: deny RFC1918, link-local, `169.254.169.254`, multicast,
  loopback. (`vulnerabilities.md` V-B01/02/03.)
- `web-scrape` host allowlist defaultable to "anywhere except RFC1918 +
  metadata"; ministry can configure stricter list.
- `api-call` strips `Authorization`/`Cookie` from caller-supplied headers
  unless tied to a configured secret instance.
- `external-db` is restricted to user-configured `connection_id`s; raw
  connection strings are never passed through the wire.

---

## H. Headline controls (for the `privacy_controls` seed)

| ID | Control | Class | Status |
|----|---------|-------|--------|
| PC-001 | Microsoft Entra ID OIDC SSO | Access | planned |
| PC-002 | Dynamic group → ministry mapping (`AIM-G-{MIN}-ALL_*`) | Access | planned |
| PC-003 | Per-ministry Postgres schema with RLS | Segmentation | planned |
| PC-004 | Session classification (Unclass / Prot A / Prot B) | Classification | planned |
| PC-005 | Model registry with `allowed_classifications` | Classification | planned |
| PC-006 | Pre-LLM regex PII gate with UI confirm | Privacy | planned |
| PC-007 | Hard-refuse private-key / API-key prefixes | Privacy | planned |
| PC-008 | Server-side encrypted secrets store (pgcrypto) | Confidentiality | planned |
| PC-009 | SSRF guard (`web-scrape`, `api-call`, `github`) | Confidentiality | planned |
| PC-010 | Append-only audit log | Accountability | planned |
| PC-011 | Per-user / per-ministry rate limit + cost meter | Availability | planned |
| PC-012 | Retention policy + nightly purge | Privacy | planned |
| PC-013 | Vertex AI for Claude + Gemini (CA region) | Residency | planned |
| PC-014 | TLS + HSTS at LB; helmet headers; strict CSP | Transport | planned |
| PC-015 | Cross-ministry sharing as first-class audited record | Governance | planned |

## I. Mapping to SOAR / STRA / ATO

- **Access Control (AC):** PC-001, PC-002, PC-003 — Entra ID + RLS.
- **Audit (AU):** PC-010 — append-only `audit_log`, retention per policy.
- **Identification (IA):** PC-001 — OIDC; UPN carried end-to-end.
- **System & Comms Protection (SC):** PC-014 — TLS, CSP; PC-009 — SSRF.
- **System & Info Integrity (SI):** PC-006, PC-007 — PII gate; PC-008 —
  secrets at rest; PC-011 — rate/cost limits.
- **Privacy (PT):** PC-004, PC-005, PC-006, PC-012 — classification &
  retention.
- **Risk Assessment (RA):** `analysis/vulnerabilities.md`.
- **Supply Chain (SR):** locked npm deps; `npm audit` in CI.

## J. Method (reusable)

1. Pull all `Deno.env.get`/`process.env.*` keys → secrets candidates.
2. Pull all `localStorage.setItem` keys → migration targets.
3. Grep `fetch(` in tools → SSRF candidates.
4. Grep `query(`/`queryArray(` → SQLi candidates.
5. Walk routes, decide model-region per route → classification eligibility.
6. Convert each finding to a `privacy_controls` row before writing
   middleware.
