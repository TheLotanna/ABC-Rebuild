// piiGuardClient.ts — frontend-side helper for surfacing PII-guard blocks.
//
// The backend (packages/backend/src/lib/piiGuard.ts) attaches a `piiGuard`
// payload to every error response when a request was blocked or warned
// because of detected PII/secrets:
//
//   SSE error event: { type: 'error', error, piiGuard: { findings } }
//   JSON 400 body:   { error, piiGuard: { findings } }
//
// Each finding has shape:
//   { field: string, kinds: Record<PIIKind, count>, hasSecret, hasHighConfidence, matches }
//
// The raw matched values are NEVER on the wire — only kinds and offsets.
// This file just turns that audit into a user-facing message; it doesn't
// re-detect anything itself.

export interface PiiGuardFinding {
  field: string;
  kinds: Record<string, number>;
  hasSecret?: boolean;
  hasHighConfidence?: boolean;
  matches?: Array<{ kind: string; confidence?: string; start?: number; end?: number }>;
}

export interface PiiGuardPayload {
  findings: PiiGuardFinding[];
}

/** Loose type guard — returns the payload if `value.piiGuard.findings[]` looks valid. */
export function extractPiiGuard(value: unknown): PiiGuardPayload | null {
  if (!value || typeof value !== 'object') return null;
  const pg = (value as { piiGuard?: unknown }).piiGuard;
  if (!pg || typeof pg !== 'object') return null;
  const findings = (pg as { findings?: unknown }).findings;
  if (!Array.isArray(findings)) return null;
  return { findings: findings as PiiGuardFinding[] };
}

const KIND_LABELS: Record<string, string> = {
  email: 'email address',
  phone_na: 'phone number',
  sin: 'Canadian SIN',
  ssn: 'US SSN',
  credit_card: 'credit card',
  ipv4: 'IP address',
  ipv6: 'IP address',
  postal_code_ca: 'postal code',
  zip_us: 'ZIP code',
  alberta_health: 'Alberta health card #',
  date_of_birth: 'date of birth',
  api_key_anthropic: 'Anthropic API key',
  api_key_openai: 'OpenAI API key',
  api_key_google: 'Google API key',
  api_key_aws: 'AWS access key',
  api_key_github_pat: 'GitHub PAT',
  api_key_slack: 'Slack token',
  api_key_generic_jwt: 'JWT',
  name: 'personal name',
};

function labelForKind(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

/**
 * Build a user-friendly one-line summary of the findings.
 * Example: `prompt: email address (2), Anthropic API key (1); systemPrompt: Canadian SIN (1)`
 */
export function summarizePiiFindings(findings: PiiGuardFinding[]): string {
  if (!findings || findings.length === 0) return '';
  return findings
    .map((f) => {
      const parts = Object.entries(f.kinds ?? {})
        .map(([kind, count]) => `${labelForKind(kind)}${count > 1 ? ` (${count})` : ''}`)
        .join(', ');
      return `${f.field}: ${parts}`;
    })
    .join('; ');
}

/**
 * Combine the backend error message with a findings summary when present.
 * Falls back to the bare message when no piiGuard payload is attached.
 */
export function formatPiiGuardMessage(baseError: string, payload: unknown): string {
  const pg = extractPiiGuard(payload);
  if (!pg) return baseError;
  const summary = summarizePiiFindings(pg.findings);
  if (!summary) return baseError;
  return `${baseError} — detected: ${summary}`;
}
