// piiGuard.ts — pre-flight PII / secret check for agent routes.
//
// Wraps the regex detector in `pii.ts` with a routing decision: block, warn,
// or off. Block returns an error to the caller before any LLM egress; warn
// lets the request through but emits a structured audit line. Off is for
// dev/debug only — production should always be `block`.
//
// Wire it into each agent route by calling `runPiiGuard(req, reply, fields)`
// before kicking off the upstream LLM request. The function returns `true`
// when the route should continue and `false` when it has already responded
// (either via JSON 400 or an SSE error event + reply.raw.end()).

import type { FastifyRequest, FastifyReply } from 'fastify';
import { detectPII, redact, summarize } from './pii.js';
import type { PIIKind, PIIMatch } from './pii.js';
import { sendEvent } from '../routes/agents/sseHelper.js';
import { recordAuditEvent } from './auditDb.js';

export type PiiGuardMode = 'block' | 'warn' | 'off';

export interface PiiGuardField {
  name: string;
  value: string | null | undefined;
}

export interface PiiGuardOptions {
  /**
   * If the route streams SSE, pass `true` so a block emits an `error` event
   * and ends the stream. If false (default), the route hasn't called
   * `initSse` yet, so we respond with a JSON 400.
   */
  sse?: boolean;
  /**
   * Free-form label used in audit lines so log readers can tell which
   * route fired the guard. e.g. `'POST /api/run-agent/anthropic'`.
   */
  route: string;
}

const SECRET_KINDS = new Set<PIIKind>([
  'api_key_anthropic',
  'api_key_openai',
  'api_key_google',
  'api_key_aws',
  'api_key_github_pat',
  'api_key_generic_jwt',
  'api_key_slack',
]);

export function getGuardMode(): PiiGuardMode {
  const raw = (process.env.PII_GUARD_MODE ?? 'block').toLowerCase().trim();
  if (raw === 'warn' || raw === 'off') return raw;
  return 'block';
}

export interface PiiAuditFinding {
  field: string;
  kinds: Partial<Record<PIIKind, number>>;
  hasSecret: boolean;
  hasHighConfidence: boolean;
  matches: Array<Pick<PIIMatch, 'kind' | 'confidence' | 'start' | 'end'>>;
}

/**
 * Scan a set of named fields and return per-field findings (only fields with
 * at least one match are included). The raw matched values are NEVER returned
 * — only kinds, counts, and offsets, so the audit log doesn't itself become a
 * vector for leaking the very PII it caught.
 */
export function scanFields(fields: PiiGuardField[]): PiiAuditFinding[] {
  const out: PiiAuditFinding[] = [];
  for (const f of fields) {
    if (!f.value || typeof f.value !== 'string') continue;
    const matches = detectPII(f.value);
    if (matches.length === 0) continue;
    const s = summarize(f.value);
    out.push({
      field: f.name,
      kinds: s.byKind,
      hasSecret: s.hasSecret,
      hasHighConfidence: s.hasHighConfidence,
      matches: matches.map((m) => ({
        kind: m.kind,
        confidence: m.confidence,
        start: m.start,
        end: m.end,
      })),
    });
  }
  return out;
}

function shouldBlock(findings: PiiAuditFinding[]): boolean {
  // Block whenever we have a high-confidence hit or any secret. Low-only hits
  // (name_candidate) never block — too noisy. Medium-only (phone, IPv4,
  // alberta_health) also do not block by default; the audit captures them but
  // the operator can tighten via env in a follow-up.
  for (const f of findings) {
    if (f.hasSecret || f.hasHighConfidence) return true;
  }
  return false;
}

function emitAudit(
  route: string,
  mode: PiiGuardMode,
  action: 'allow' | 'warn' | 'block',
  findings: PiiAuditFinding[],
  req: FastifyRequest,
) {
  // Structured one-line JSON; matches Fastify logger's pino-ish style.
  // Keep keys short and avoid raw values so the line is safe to ship to
  // central logging.
  const payload = {
    audit: 'pii_guard',
    route,
    mode,
    action,
    reqId: req.id,
    findings,
    ts: new Date().toISOString(),
  };
  process.stderr.write(JSON.stringify(payload) + '\n');

  // Best-effort DB persistence into `<schema>.pii_audit_log` (migration
  // 0002). Never throws, never blocks the agent request.
  recordAuditEvent({
    route,
    mode,
    action,
    reqId: typeof req.id === 'string' ? req.id : String(req.id ?? ''),
    findings,
  });
}

/**
 * Apply the configured guard mode to a set of fields. Returns `true` when
 * the caller should proceed with the LLM call; `false` when the caller has
 * already responded (block path).
 */
export async function runPiiGuard(
  req: FastifyRequest,
  reply: FastifyReply,
  fields: PiiGuardField[],
  opts: PiiGuardOptions,
): Promise<boolean> {
  const mode = getGuardMode();
  if (mode === 'off') return true;

  const findings = scanFields(fields);

  if (findings.length === 0) {
    // No matches — no audit emitted to keep noise low.
    return true;
  }

  if (mode === 'warn' || !shouldBlock(findings)) {
    emitAudit(opts.route, mode, 'warn', findings, req);
    return true;
  }

  // mode === 'block' AND we have at least one secret / high-confidence hit.
  emitAudit(opts.route, mode, 'block', findings, req);

  const userMessage =
    'Request blocked by PII guard. Potentially sensitive content was detected in your prompt; ' +
    'please remove it and try again. See server audit log for details.';

  if (opts.sse) {
    sendEvent(reply, { type: 'error', error: userMessage, piiGuard: { findings } });
    reply.raw.end();
  } else {
    await reply
      .code(400)
      .header('Content-Type', 'application/json')
      .send({ error: userMessage, piiGuard: { findings } });
  }
  return false;
}

/**
 * Convenience for routes that want to log-and-redact in `warn` mode without
 * blocking. Returns the redacted prompts that should be sent upstream.
 */
export function redactForUpstream(fields: PiiGuardField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (typeof f.value === 'string') {
      out[f.name] = redact(f.value, { excludeLow: true });
    }
  }
  return out;
}
