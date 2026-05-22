-- 0002_pii_audit_log.sql
-- AI Garage / ABC — PII guard audit log.
--
-- Adds an append-only table that captures every detection event raised by
-- packages/backend/src/lib/piiGuard.ts. Idempotent + additive: rerunning is a
-- no-op. The runner substitutes __SCHEMA__ with $SCHEMA_NAME at apply time.
--
-- Records carry KINDS and OFFSETS only — never the matched raw value. This
-- keeps the table itself out of scope for Protected B data: even an attacker
-- with read access learns "an Anthropic key was present in the system prompt
-- at offsets 12-53" but never recovers the key itself.

CREATE SCHEMA IF NOT EXISTS __SCHEMA__;

SET search_path TO __SCHEMA__, public;

CREATE TABLE IF NOT EXISTS __SCHEMA__.pii_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
    route           TEXT NOT NULL,
    mode            TEXT NOT NULL CHECK (mode IN ('block', 'warn', 'off')),
    action          TEXT NOT NULL CHECK (action IN ('allow', 'warn', 'block')),
    req_id          TEXT,
    has_secret      BOOLEAN NOT NULL DEFAULT false,
    has_high_conf   BOOLEAN NOT NULL DEFAULT false,
    -- findings: JSONB array of { field, kinds, hasSecret, hasHighConfidence, matches:[{kind,confidence,start,end}] }
    -- We store the structured findings as JSONB so the operator can query by
    -- kind / field without an exploded child table; the row count is
    -- expected to stay small relative to the request volume because only
    -- requests with at least one match are logged.
    findings        JSONB NOT NULL,
    server_host     TEXT
);

CREATE INDEX IF NOT EXISTS pii_audit_log_ts_idx
    ON __SCHEMA__.pii_audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS pii_audit_log_route_idx
    ON __SCHEMA__.pii_audit_log (route);
CREATE INDEX IF NOT EXISTS pii_audit_log_action_idx
    ON __SCHEMA__.pii_audit_log (action);
CREATE INDEX IF NOT EXISTS pii_audit_log_has_secret_idx
    ON __SCHEMA__.pii_audit_log (has_secret) WHERE has_secret;

-- Quick sanity comment readable from psql.
COMMENT ON TABLE __SCHEMA__.pii_audit_log IS
    'Append-only audit of PII guard hits. Never stores matched raw values — only kinds, confidences, and offsets.';
