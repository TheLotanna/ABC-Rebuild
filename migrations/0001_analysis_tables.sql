-- 0001_analysis_tables.sql
-- AI Garage / ABC Remediation Exercise — analysis tables
--
-- Variable-driven: the runner replaces the literal token __SCHEMA__ with the
-- value of SCHEMA_NAME env (default: lotanna_okwuchukwu) before executing.
-- All statements are additive and idempotent — rerunning is a no-op.

CREATE SCHEMA IF NOT EXISTS __SCHEMA__;

SET search_path TO __SCHEMA__, public;

-- ─────────────────────────────────────────────────────────────────────────
-- features  — 3.1 inventory of endpoints / screens / dependencies
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS __SCHEMA__.features (
    id              SERIAL PRIMARY KEY,
    category        TEXT NOT NULL CHECK (category IN
                      ('endpoint', 'screen', 'component', 'dependency',
                       'tool', 'agent', 'workflow', 'integration')),
    name            TEXT NOT NULL,
    source_path     TEXT,
    description     TEXT,
    status          TEXT NOT NULL DEFAULT 'discovered'
                    CHECK (status IN ('discovered','ported','dropped','blocked')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (category, name)
);

CREATE INDEX IF NOT EXISTS features_category_idx
    ON __SCHEMA__.features (category);
CREATE INDEX IF NOT EXISTS features_status_idx
    ON __SCHEMA__.features (status);

-- ─────────────────────────────────────────────────────────────────────────
-- vulnerabilities  — 3.2 security + non-functional improvement backlog
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS __SCHEMA__.vulnerabilities (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL UNIQUE,
    severity        TEXT NOT NULL CHECK (severity IN
                      ('critical','high','medium','low','informational')),
    category        TEXT NOT NULL CHECK (category IN
                      ('auth','injection','xss','secrets','dependency',
                       'observability','privacy','availability','config',
                       'crypto','accessibility','functional','other')),
    description     TEXT NOT NULL,
    affected_paths  TEXT,
    mitigation      TEXT,
    status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','mitigated','accepted','wont_fix')),
    discovered_by   TEXT,  -- 'red_agent', 'blue_agent', 'manual', 'sast', 'dast'
    cwe             TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vulnerabilities_severity_idx
    ON __SCHEMA__.vulnerabilities (severity);
CREATE INDEX IF NOT EXISTS vulnerabilities_status_idx
    ON __SCHEMA__.vulnerabilities (status);

-- ─────────────────────────────────────────────────────────────────────────
-- migration  — 3.3 from-to steps to reach target architecture
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS __SCHEMA__.migration (
    id              SERIAL PRIMARY KEY,
    step_no         INTEGER NOT NULL UNIQUE,
    area            TEXT NOT NULL CHECK (area IN
                      ('frontend','backend','database','infra','auth',
                       'observability','tooling','docs')),
    from_state      TEXT NOT NULL,
    to_state        TEXT NOT NULL,
    rationale       TEXT,
    risk            TEXT CHECK (risk IN ('low','medium','high')) DEFAULT 'medium',
    status          TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','in_progress','complete','blocked')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS migration_status_idx
    ON __SCHEMA__.migration (status);

-- ─────────────────────────────────────────────────────────────────────────
-- plan  — 3.4 granular project plan
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS __SCHEMA__.plan (
    id              SERIAL PRIMARY KEY,
    phase           TEXT NOT NULL,             -- e.g. 'P1-Scaffold'
    task            TEXT NOT NULL,
    owner           TEXT,                      -- e.g. 'claude-festive-elbakyan'
    depends_on      INTEGER REFERENCES __SCHEMA__.plan(id) ON DELETE SET NULL,
    estimate_hours  NUMERIC(6,2),
    actual_hours    NUMERIC(6,2),
    status          TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo','doing','done','blocked','dropped')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (phase, task)
);

CREATE INDEX IF NOT EXISTS plan_phase_idx ON __SCHEMA__.plan (phase);
CREATE INDEX IF NOT EXISTS plan_status_idx ON __SCHEMA__.plan (status);

-- ─────────────────────────────────────────────────────────────────────────
-- privacy_controls  — 3.5 privacy + information management plan
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS __SCHEMA__.privacy_controls (
    id              SERIAL PRIMARY KEY,
    control_id      TEXT NOT NULL UNIQUE,      -- e.g. 'PRV-001'
    control_family  TEXT NOT NULL CHECK (control_family IN
                      ('access_control','data_segmentation','audit',
                       'pii_detection','encryption','retention',
                       'consent','classification','ministry_isolation')),
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    applies_to      TEXT,                      -- e.g. 'all','protected_b','workflow_runs'
    implementation  TEXT,                      -- how this is realized in code
    status          TEXT NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','in_progress','implemented','verified')),
    evidence_ref    TEXT,                      -- link to PR / commit / doc
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS privacy_controls_family_idx
    ON __SCHEMA__.privacy_controls (control_family);

-- ─────────────────────────────────────────────────────────────────────────
-- updated_at trigger (shared across all five tables)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION __SCHEMA__.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['features','vulnerabilities','migration','plan','privacy_controls']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = format('%s_touch_updated', t)
              AND tgrelid = format('__SCHEMA__.%I', t)::regclass
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE UPDATE ON __SCHEMA__.%I
                 FOR EACH ROW EXECUTE FUNCTION __SCHEMA__.touch_updated_at()',
                t || '_touch_updated', t
            );
        END IF;
    END LOOP;
END
$$;
