import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (className merge helper)', () => {
  it('joins multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', false, null, undefined, '', 'bar')).toBe('foo bar');
  });

  it('handles conditional object form', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('merges conflicting tailwind classes (later wins)', () => {
    // tailwind-merge dedupes utility conflicts
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('preserves non-conflicting classes', () => {
    expect(cn('px-2 py-1', 'mx-2')).toContain('px-2');
    expect(cn('px-2 py-1', 'mx-2')).toContain('py-1');
    expect(cn('px-2 py-1', 'mx-2')).toContain('mx-2');
  });

  it('handles arrays', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('returns empty string for no args', () => {
    expect(cn()).toBe('');
  });
});
