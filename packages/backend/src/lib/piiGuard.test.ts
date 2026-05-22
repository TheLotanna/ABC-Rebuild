// piiGuard.test.ts — pure-function unit tests for the guard middleware.
// Run via `npm test --workspace=packages/backend` (Vitest).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanFields, getGuardMode, redactForUpstream } from './piiGuard.js';

describe('getGuardMode', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.PII_GUARD_MODE;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.PII_GUARD_MODE;
    else process.env.PII_GUARD_MODE = original;
  });

  it('defaults to block when unset', () => {
    delete process.env.PII_GUARD_MODE;
    expect(getGuardMode()).toBe('block');
  });

  it('parses warn', () => {
    process.env.PII_GUARD_MODE = 'warn';
    expect(getGuardMode()).toBe('warn');
  });

  it('parses off case-insensitively', () => {
    process.env.PII_GUARD_MODE = 'OFF';
    expect(getGuardMode()).toBe('off');
  });

  it('falls back to block on unknown values', () => {
    process.env.PII_GUARD_MODE = 'banana';
    expect(getGuardMode()).toBe('block');
  });

  it('trims surrounding whitespace', () => {
    process.env.PII_GUARD_MODE = '  block  ';
    expect(getGuardMode()).toBe('block');
  });
});

describe('scanFields', () => {
  it('yields no findings on clean input', () => {
    const findings = scanFields([
      { name: 'systemPrompt', value: 'You are a helpful assistant.' },
      { name: 'userPrompt', value: 'Summarise the attached document.' },
    ]);
    expect(findings).toHaveLength(0);
  });

  it('flags a valid SIN with high confidence (PII, not secret)', () => {
    const findings = scanFields([
      { name: 'systemPrompt', value: 'You are a helpful assistant.' },
      { name: 'userPrompt', value: 'Please look up file for 046-454-286.' },
    ]);
    const fp = findings.find((f) => f.field === 'userPrompt');
    expect(fp).toBeTruthy();
    expect(fp?.hasHighConfidence).toBe(true);
    expect(fp?.hasSecret).toBe(false);
    expect(fp?.kinds.sin ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('marks a leaked Anthropic key as secret', () => {
    const findings = scanFields([
      {
        name: 'systemPrompt',
        value: 'Use this key for upstream: sk-ant-api03-abcdefghijklmnopqrstuvwxyz12',
      },
    ]);
    expect(findings[0]?.hasSecret).toBe(true);
  });

  it('skips null/undefined/empty fields without crashing', () => {
    const findings = scanFields([
      { name: 'systemPrompt', value: null },
      { name: 'userPrompt', value: undefined },
      { name: 'scratchpad', value: '' },
    ]);
    expect(findings).toHaveLength(0);
  });

  it('audit payload NEVER serialises raw matched values', () => {
    const findings = scanFields([
      { name: 'userPrompt', value: 'email me at john.doe@example.gov.ab.ca' },
    ]);
    const serialised = JSON.stringify(findings);
    expect(serialised).not.toContain('john.doe@example.gov.ab.ca');
  });
});

describe('redactForUpstream', () => {
  it('passes clean fields through unchanged and redacts hits', () => {
    const out = redactForUpstream([
      { name: 'systemPrompt', value: 'You are a clerk.' },
      { name: 'userPrompt', value: 'Email john@example.com about SIN 046-454-286' },
    ]);
    expect(out.systemPrompt).toBe('You are a clerk.');
    expect(out.userPrompt).toContain('[EMAIL]');
    expect(out.userPrompt).toContain('[SIN]');
    expect(out.userPrompt).not.toContain('john@example.com');
  });
});
