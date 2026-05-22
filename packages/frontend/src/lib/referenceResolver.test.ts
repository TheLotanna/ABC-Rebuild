import { describe, it, expect } from 'vitest';
import {
  containsReferences,
  resolveReferences,
  getResolvedReferenceSummary,
  type ResolverContext,
} from './referenceResolver';
import type { BlackboardEntry, ToolResultAttribute, FreeAgentArtifact } from '@agent-builder/shared';

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeBlackboard(): BlackboardEntry[] {
  return [
    {
      id: 'b1',
      timestamp: '2026-01-01T00:00:00Z',
      category: 'observation',
      content: 'The user wants a weather report.',
      iteration: 1,
    },
    {
      id: 'b2',
      timestamp: '2026-01-01T00:01:00Z',
      category: 'plan',
      content: 'Call weather tool then summarize.',
      iteration: 2,
    },
  ];
}

function makeAttributes(): Record<string, ToolResultAttribute> {
  return {
    weather_result: {
      id: 'a1',
      name: 'weather_result',
      tool: 'get_weather',
      params: { city: 'Edmonton' },
      result: 'Sunny, 22°C',
      resultString: 'Sunny, 22°C',
      size: 12,
      createdAt: '2026-01-01T00:00:00Z',
      iteration: 1,
    },
    json_blob: {
      id: 'a2',
      name: 'json_blob',
      tool: 'api_call',
      params: {},
      result: { ok: true, items: [1, 2, 3] },
      resultString: '{"ok":true,"items":[1,2,3]}',
      size: 25,
      createdAt: '2026-01-01T00:00:00Z',
      iteration: 1,
    },
  };
}

function makeArtifacts(): FreeAgentArtifact[] {
  return [
    {
      id: 'art-1',
      type: 'text',
      title: 'Final Report',
      content: 'Today will be sunny.',
      createdAt: '2026-01-01T00:00:00Z',
      iteration: 1,
    },
  ];
}

function makeContext(overrides: Partial<ResolverContext> = {}): ResolverContext {
  return {
    scratchpad: 'Thinking about the weather...',
    blackboard: makeBlackboard(),
    attributes: makeAttributes(),
    artifacts: makeArtifacts(),
    ...overrides,
  };
}

// ─── containsReferences ──────────────────────────────────────────────────────

describe('containsReferences', () => {
  it('returns true for scratchpad placeholder', () => {
    expect(containsReferences('Look at {{scratchpad}}')).toBe(true);
  });

  it('returns true for blackboard placeholder', () => {
    expect(containsReferences('history: {{blackboard}}')).toBe(true);
  });

  it('returns true for specific attribute', () => {
    expect(containsReferences('Use {{attribute:weather_result}} here')).toBe(true);
  });

  it('returns true for all attributes', () => {
    expect(containsReferences('{{attributes}}')).toBe(true);
  });

  it('returns true for artifact placeholders', () => {
    expect(containsReferences('See {{artifact:art-1}} ({{artifacts}})')).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(containsReferences('Just a plain message')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(containsReferences(42)).toBe(false);
    expect(containsReferences(null)).toBe(false);
    expect(containsReferences(undefined)).toBe(false);
    expect(containsReferences({ a: '{{scratchpad}}' })).toBe(false);
  });
});

// ─── resolveReferences ───────────────────────────────────────────────────────

describe('resolveReferences', () => {
  it('inlines scratchpad content', () => {
    const ctx = makeContext();
    const result = resolveReferences('Notes: {{scratchpad}}', ctx);
    expect(result).toBe('Notes: Thinking about the weather...');
  });

  it('inlines specific attribute (string result)', () => {
    const ctx = makeContext();
    const result = resolveReferences('Weather is: {{attribute:weather_result}}', ctx);
    expect(result).toBe('Weather is: Sunny, 22°C');
  });

  it('JSON-stringifies non-string attribute results', () => {
    const ctx = makeContext();
    const result = resolveReferences('{{attribute:json_blob}}', ctx) as string;
    expect(result).toContain('"ok": true');
    expect(result).toContain('"items"');
  });

  it('reports missing attribute name', () => {
    const ctx = makeContext();
    const result = resolveReferences('{{attribute:not_real}}', ctx);
    expect(result).toBe("[Attribute 'not_real' not found]");
  });

  it('inlines blackboard entries formatted with category + iteration', () => {
    const ctx = makeContext();
    const result = resolveReferences('{{blackboard}}', ctx) as string;
    expect(result).toContain('[OBSERVATION] (Iteration 1)');
    expect(result).toContain('The user wants a weather report.');
    expect(result).toContain('[PLAN] (Iteration 2)');
  });

  it('returns [No blackboard entries] for empty blackboard', () => {
    const ctx = makeContext({ blackboard: [] });
    const result = resolveReferences('{{blackboard}}', ctx);
    expect(result).toBe('[No blackboard entries]');
  });

  it('finds artifact by id or by title', () => {
    const ctx = makeContext();
    expect(resolveReferences('{{artifact:art-1}}', ctx)).toBe('Today will be sunny.');
    expect(resolveReferences('{{artifact:Final Report}}', ctx)).toBe('Today will be sunny.');
  });

  it('reports missing artifact', () => {
    const ctx = makeContext();
    expect(resolveReferences('{{artifact:nope}}', ctx)).toBe("[Artifact 'nope' not found]");
  });

  it('serializes all artifacts to JSON', () => {
    const ctx = makeContext();
    const result = resolveReferences('{{artifacts}}', ctx) as string;
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toMatchObject({ id: 'art-1', type: 'text', title: 'Final Report' });
  });

  it('returns [] for empty artifacts array', () => {
    const ctx = makeContext({ artifacts: [] });
    expect(resolveReferences('{{artifacts}}', ctx)).toBe('[]');
  });

  it('serializes all attributes with metadata', () => {
    const ctx = makeContext();
    const result = resolveReferences('{{attributes}}', ctx) as string;
    const parsed = JSON.parse(result);
    expect(parsed.weather_result).toMatchObject({
      tool: 'get_weather',
      size: 12,
      iteration: 1,
      result: 'Sunny, 22°C',
    });
  });

  it('recursively resolves into arrays', () => {
    const ctx = makeContext();
    const result = resolveReferences(['{{scratchpad}}', 'plain', '{{attribute:weather_result}}'], ctx);
    expect(result).toEqual(['Thinking about the weather...', 'plain', 'Sunny, 22°C']);
  });

  it('recursively resolves into objects', () => {
    const ctx = makeContext();
    const result = resolveReferences(
      { query: '{{attribute:weather_result}}', limit: 10 },
      ctx
    ) as Record<string, unknown>;
    expect(result.query).toBe('Sunny, 22°C');
    expect(result.limit).toBe(10);
  });

  it('passes primitives through unchanged', () => {
    const ctx = makeContext();
    expect(resolveReferences(42, ctx)).toBe(42);
    expect(resolveReferences(true, ctx)).toBe(true);
    expect(resolveReferences(null, ctx)).toBe(null);
  });

  it('handles multiple references in one string', () => {
    const ctx = makeContext();
    const result = resolveReferences(
      'note: {{scratchpad}} weather: {{attribute:weather_result}}',
      ctx
    );
    expect(result).toBe('note: Thinking about the weather... weather: Sunny, 22°C');
  });

  it('is case-insensitive on placeholder names', () => {
    const ctx = makeContext();
    expect(resolveReferences('{{SCRATCHPAD}}', ctx)).toBe('Thinking about the weather...');
  });

  it('returns empty string when scratchpad is empty', () => {
    const ctx = makeContext({ scratchpad: '' });
    expect(resolveReferences('prefix:{{scratchpad}}', ctx)).toBe('prefix:');
  });
});

// ─── getResolvedReferenceSummary ─────────────────────────────────────────────

describe('getResolvedReferenceSummary', () => {
  it('reports the references that were resolved', () => {
    const orig = { prompt: 'use {{scratchpad}} and {{attribute:x}}' };
    const resolved = { prompt: 'use foo and bar' };
    const summary = getResolvedReferenceSummary(orig, resolved);
    expect(summary.some(s => s.includes('{{scratchpad}}'))).toBe(true);
    expect(summary.some(s => s.includes('{{attribute:'))).toBe(true);
  });

  it('returns empty array when nothing changed', () => {
    const orig = { prompt: 'plain' };
    const resolved = { prompt: 'plain' };
    expect(getResolvedReferenceSummary(orig, resolved)).toEqual([]);
  });
});
