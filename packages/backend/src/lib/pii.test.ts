// pii.test.ts — regression cases for the PII / secret detector.
//
// Run via `npm test --workspace=packages/backend` (Vitest).

import { describe, it, expect } from 'vitest';
import { detectPII, redact, summarize } from './pii.js';

describe('detectPII', () => {
  it('detects valid SIN with dashes (passes Luhn)', () => {
    const hits = detectPII('My SIN is 046-454-286.');
    expect(hits.some((m) => m.kind === 'sin')).toBe(true);
  });

  it('rejects SIN that fails Luhn', () => {
    const hits = detectPII('Phone-looking 123-456-789.');
    expect(hits.some((m) => m.kind === 'sin')).toBe(false);
  });

  it('detects email', () => {
    const hits = detectPII('contact me at first.last@example.gov.ab.ca please');
    expect(hits.some((m) => m.kind === 'email')).toBe(true);
  });

  it('detects North American phone', () => {
    const hits = detectPII('Call me: (780) 555-0123');
    expect(hits.some((m) => m.kind === 'phone')).toBe(true);
  });

  it('detects valid credit card (Luhn passes)', () => {
    const hits = detectPII('Card 4242 4242 4242 4242 expires soon');
    expect(hits.some((m) => m.kind === 'credit_card')).toBe(true);
  });

  it('rejects credit card that fails Luhn', () => {
    const hits = detectPII('Not a card 4242 4242 4242 4241');
    expect(hits.some((m) => m.kind === 'credit_card')).toBe(false);
  });

  it('detects Anthropic API key', () => {
    const hits = detectPII('key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz12');
    expect(hits.some((m) => m.kind === 'api_key_anthropic')).toBe(true);
  });

  it('detects AWS access key id', () => {
    const hits = detectPII('cred AKIAIOSFODNN7EXAMPLE here');
    expect(hits.some((m) => m.kind === 'api_key_aws')).toBe(true);
  });

  it('detects Google API key (39 chars total)', () => {
    const hits = detectPII('gkey=AIzaSyA-1234567890abcdefghijklmnopqrstu');
    expect(hits.some((m) => m.kind === 'api_key_google')).toBe(true);
  });

  it('detects IPv4', () => {
    const hits = detectPII('connect to 10.0.0.1 internally');
    expect(hits.some((m) => m.kind === 'ipv4')).toBe(true);
  });

  it('flags name candidate (low confidence)', () => {
    const hits = detectPII('Jane Smith requested access');
    expect(hits.some((m) => m.kind === 'name_candidate')).toBe(true);
  });

  it('yields no hits on empty input', () => {
    expect(detectPII('').length).toBe(0);
  });

  it('keeps SIN over phone on overlap (higher confidence wins)', () => {
    // 046-454-286 is a valid SIN. Phone regex matches the digits too;
    // dedupe should keep SIN (high) and drop phone (medium).
    const hits = detectPII('046-454-286');
    expect(hits.find((m) => m.kind === 'sin')).toBeTruthy();
    expect(hits.find((m) => m.kind === 'phone')).toBeFalsy();
  });
});

describe('redact', () => {
  it('replaces email + SIN with bracket tags', () => {
    const out = redact('Email john@example.com about SIN 046-454-286');
    expect(out).toContain('[EMAIL]');
    expect(out).toContain('[SIN]');
    expect(out).not.toContain('john@example.com');
  });
});

describe('summarize', () => {
  it('flags secrets and high-confidence hits + counts by kind', () => {
    const s = summarize('key sk-ant-api03-abcdefghijklmnopqrstuvwxyz12 and IP 10.0.0.1');
    expect(s.hasSecret).toBe(true);
    expect(s.hasHighConfidence).toBe(true);
    expect(s.byKind.api_key_anthropic ?? 0).toBeGreaterThanOrEqual(1);
  });
});
