// piiGuardClient.test.ts — unit tests for the frontend's PII-guard surface.
//
// These exercise the pure functions in `piiGuardClient.ts` — extracting the
// `piiGuard.findings` payload from various wire shapes, summarising into a
// human label, and combining with the upstream error message.
//
// Run via `npm test --workspace=packages/frontend` (Vitest).

import { describe, expect, it } from 'vitest';
import {
  extractPiiGuard,
  summarizePiiFindings,
  formatPiiGuardMessage,
  type PiiGuardFinding,
} from './piiGuardClient';

describe('extractPiiGuard', () => {
  it('returns null for non-objects', () => {
    expect(extractPiiGuard(null)).toBeNull();
    expect(extractPiiGuard(undefined)).toBeNull();
    expect(extractPiiGuard('not an object')).toBeNull();
    expect(extractPiiGuard(42)).toBeNull();
  });

  it('returns null when piiGuard is missing', () => {
    expect(extractPiiGuard({ error: 'bare error' })).toBeNull();
  });

  it('returns null when piiGuard.findings is not an array', () => {
    expect(extractPiiGuard({ piiGuard: {} })).toBeNull();
    expect(extractPiiGuard({ piiGuard: { findings: 'oops' } })).toBeNull();
  });

  it('pulls out a well-formed payload', () => {
    const payload = {
      error: 'blocked',
      piiGuard: {
        findings: [
          {
            field: 'userPrompt',
            kinds: { sin: 1 },
            hasSecret: false,
            hasHighConfidence: true,
            matches: [{ kind: 'sin', confidence: 'high', start: 8, end: 19 }],
          },
        ],
      },
    };
    const out = extractPiiGuard(payload);
    expect(out).not.toBeNull();
    expect(out?.findings).toHaveLength(1);
    expect(out?.findings[0].field).toBe('userPrompt');
    expect(out?.findings[0].kinds.sin).toBe(1);
  });
});

describe('summarizePiiFindings', () => {
  it('returns empty string for no findings', () => {
    expect(summarizePiiFindings([])).toBe('');
    expect(summarizePiiFindings(null as unknown as PiiGuardFinding[])).toBe('');
  });

  it('renders a single field, single kind, no count for one match', () => {
    const findings: PiiGuardFinding[] = [
      { field: 'userPrompt', kinds: { sin: 1 } },
    ];
    expect(summarizePiiFindings(findings)).toBe('userPrompt: Canadian SIN');
  });

  it('renders counts in parentheses when a kind appears more than once', () => {
    const findings: PiiGuardFinding[] = [
      { field: 'userPrompt', kinds: { email: 3 } },
    ];
    expect(summarizePiiFindings(findings)).toBe('userPrompt: email address (3)');
  });

  it('joins multiple kinds per field with commas', () => {
    const findings: PiiGuardFinding[] = [
      { field: 'systemPrompt', kinds: { sin: 1, email: 2 } },
    ];
    const out = summarizePiiFindings(findings);
    expect(out).toContain('systemPrompt:');
    expect(out).toContain('Canadian SIN');
    expect(out).toContain('email address (2)');
  });

  it('joins multiple fields with semicolons', () => {
    const findings: PiiGuardFinding[] = [
      { field: 'systemPrompt', kinds: { api_key_anthropic: 1 } },
      { field: 'userPrompt', kinds: { sin: 1 } },
    ];
    const out = summarizePiiFindings(findings);
    expect(out.split('; ')).toHaveLength(2);
    expect(out).toContain('systemPrompt: Anthropic API key');
    expect(out).toContain('userPrompt: Canadian SIN');
  });

  it('falls back to the raw kind name when no friendly label exists', () => {
    const findings: PiiGuardFinding[] = [
      { field: 'userPrompt', kinds: { unknown_thing: 1 } },
    ];
    expect(summarizePiiFindings(findings)).toBe('userPrompt: unknown thing');
  });
});

describe('formatPiiGuardMessage', () => {
  const baseError = 'Request blocked by PII guard.';

  it('returns the base error unchanged when no payload', () => {
    expect(formatPiiGuardMessage(baseError, null)).toBe(baseError);
    expect(formatPiiGuardMessage(baseError, {})).toBe(baseError);
  });

  it('appends a detected-summary when findings are present', () => {
    const payload = {
      error: baseError,
      piiGuard: {
        findings: [{ field: 'userPrompt', kinds: { sin: 1 } }],
      },
    };
    expect(formatPiiGuardMessage(baseError, payload)).toBe(
      `${baseError} — detected: userPrompt: Canadian SIN`,
    );
  });

  it('returns the base error if findings is empty', () => {
    const payload = { error: baseError, piiGuard: { findings: [] } };
    expect(formatPiiGuardMessage(baseError, payload)).toBe(baseError);
  });
});
