// pii.ts — regex-driven PII / secret detector
//
// Intended to run pre-flight on prompts and tool inputs before any LLM egress.
// Patterns are intentionally conservative: a hit means "human should review",
// not "this is definitely PII". Low-confidence detectors (e.g. NAME) are
// marked as such so callers can choose to block, redact, or just warn.
//
// References:
//   - SIN check-digit: Luhn over 9 digits (Canada)
//   - Alberta health card: 9-digit format; no check-digit standard public
//   - Credit card: Luhn over 12-19 digits, brand-aware prefixes
//   - Secret patterns: cribbed from public scanner allow-lists (Gitleaks)

export type PIIKind =
  | 'sin'
  | 'alberta_health'
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'ipv4'
  | 'name_candidate'
  | 'api_key_anthropic'
  | 'api_key_openai'
  | 'api_key_google'
  | 'api_key_aws'
  | 'api_key_github_pat'
  | 'api_key_generic_jwt'
  | 'api_key_slack';

export interface PIIMatch {
  kind: PIIKind;
  value: string;
  start: number;
  end: number;
  confidence: 'high' | 'medium' | 'low';
}

interface Detector {
  kind: PIIKind;
  confidence: 'high' | 'medium' | 'low';
  pattern: RegExp;
  validate?: (value: string) => boolean;
}

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const DETECTORS: Detector[] = [
  {
    kind: 'sin',
    confidence: 'high',
    pattern: /\b(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})\b/g,
    validate: (v) => luhn(v.replace(/\D/g, '')),
  },
  {
    kind: 'alberta_health',
    confidence: 'medium',
    // 9 digits, often formatted XXXXX-XXXX. Distinguished from SIN by failing
    // SIN's luhn check — the caller can dedupe by position.
    pattern: /\b\d{5}-?\d{4}\b/g,
  },
  {
    kind: 'email',
    confidence: 'high',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    kind: 'phone',
    confidence: 'medium',
    // North American: optional +1, area code, prefix, line; tolerates ()-. and space
    pattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  },
  {
    kind: 'credit_card',
    confidence: 'high',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    validate: (v) => {
      const digits = v.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits);
    },
  },
  {
    kind: 'ipv4',
    confidence: 'medium',
    pattern: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g,
  },
  {
    // capitalized bigram — extremely low confidence; intentionally informational
    kind: 'name_candidate',
    confidence: 'low',
    pattern: /\b[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,20}\b/g,
  },
  {
    kind: 'api_key_anthropic',
    confidence: 'high',
    pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: 'api_key_openai',
    confidence: 'high',
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    kind: 'api_key_google',
    confidence: 'high',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    kind: 'api_key_aws',
    confidence: 'high',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    kind: 'api_key_github_pat',
    confidence: 'high',
    pattern: /\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
  },
  {
    kind: 'api_key_generic_jwt',
    confidence: 'medium',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    kind: 'api_key_slack',
    confidence: 'high',
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  },
];

export function detectPII(input: string): PIIMatch[] {
  if (!input || typeof input !== 'string') return [];

  const matches: PIIMatch[] = [];
  for (const det of DETECTORS) {
    det.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = det.pattern.exec(input)) !== null) {
      const value = m[0];
      if (det.validate && !det.validate(value)) continue;
      matches.push({
        kind: det.kind,
        value,
        start: m.index,
        end: m.index + value.length,
        confidence: det.confidence,
      });
    }
  }

  // Dedupe overlapping matches — keep the higher-confidence one. SIN+CC+Phone
  // can all hit on the same digit run.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const confRank = { high: 3, medium: 2, low: 1 } as const;
  const kept: PIIMatch[] = [];
  for (const cur of matches) {
    const last = kept.at(-1);
    if (last && cur.start < last.end) {
      if (confRank[cur.confidence] > confRank[last.confidence]) {
        kept[kept.length - 1] = cur;
      }
      // else drop cur — lower or equal confidence overlap
    } else {
      kept.push(cur);
    }
  }
  return kept;
}

const REDACT = {
  sin: '[SIN]',
  alberta_health: '[AHCN]',
  email: '[EMAIL]',
  phone: '[PHONE]',
  credit_card: '[CC]',
  ipv4: '[IPV4]',
  name_candidate: '[NAME?]',
  api_key_anthropic: '[ANTHROPIC_KEY]',
  api_key_openai: '[OPENAI_KEY]',
  api_key_google: '[GOOGLE_KEY]',
  api_key_aws: '[AWS_KEY]',
  api_key_github_pat: '[GITHUB_PAT]',
  api_key_generic_jwt: '[JWT]',
  api_key_slack: '[SLACK_KEY]',
} satisfies Record<PIIKind, string>;

export function redact(input: string, opts: { excludeLow?: boolean } = {}): string {
  const matches = detectPII(input).filter(
    (m) => !(opts.excludeLow && m.confidence === 'low'),
  );
  if (matches.length === 0) return input;
  // matches are non-overlapping after detectPII's dedupe
  let out = '';
  let cursor = 0;
  for (const m of matches) {
    out += input.slice(cursor, m.start);
    out += REDACT[m.kind];
    cursor = m.end;
  }
  out += input.slice(cursor);
  return out;
}

export interface PIISummary {
  hasHighConfidence: boolean;
  hasSecret: boolean;
  byKind: Partial<Record<PIIKind, number>>;
  matches: PIIMatch[];
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

export function summarize(input: string): PIISummary {
  const matches = detectPII(input);
  const byKind: PIISummary['byKind'] = {};
  let hasHighConfidence = false;
  let hasSecret = false;
  for (const m of matches) {
    byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    if (m.confidence === 'high') hasHighConfidence = true;
    if (SECRET_KINDS.has(m.kind)) hasSecret = true;
  }
  return { hasHighConfidence, hasSecret, byKind, matches };
}
