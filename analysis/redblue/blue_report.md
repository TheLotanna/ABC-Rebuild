# Blue Agent Defensive Posture Report — ABC

> **Scope.** This is the defender's view: which controls are in place and
> which Red-team attack categories they cover, mapped to ITSG-33 control
> families. Pairs with the Red attack catalog
> ([`red_results.json`](red_results.json)) and the
> [`scripts/red-agent.mjs`](../../scripts/red-agent.mjs) harness.
>
> **Reading order:** Red identifies an attack class → Blue claims the
> control that defeats it → the harness produces evidence the control
> works → the ATO authorizer cross-references PIA / categorization /
> boundary docs.

---

## 1. Headline result

| Run | Backend | Cases | Pass | Fail |
|-----|---------|------:|-----:|-----:|
| 2026-05-22 (initial) | local `:3000` with `PII_GUARD_MODE` unset (= `block` default) | 13 | **13** | 0 |
| 2026-05-22 (after tool-route extension) | same | 25 | **25** | 0 |

The second run includes 10 additional Red cases that exercise the
previously-ungated tool routes (`apiCall`, `github`, `ocr`, `pdf`,
`pronghorn`, `scrape`, `tts`, `weather`, `zip`) plus two new clean-input
cases for the same routes. See § 4 known-gap "Tool routes other than the
4 gated" — that gap is now **closed**.

Full machine-readable output: [`red_results.json`](red_results.json).

The 13 cases split into three families:

| Family | Cases | Outcome |
|--------|------:|---------|
| Direct PII identifier (SIN, credit card, email) | 3 | All 3 blocked with expected kind set; no false-positives on the parallel clean cases |
| Secret / credential leak (Anthropic, AWS, Google, OpenAI) | 4 | All 4 blocked; covers all 6 routes the PII guard protects |
| False-positive eval (clean inputs) | 3 | All 3 allowed; the Luhn-fail "phone-looking digit run" case (`R-CLEAN-002`) confirms the SIN validator's no-false-positive property |

---

## 2. Blue control inventory — what defeated each Red category

Each row maps a Red-team attack category to:
1. The defending control (file + function),
2. The ITSG-33 / NIST SP 800-53 family it implements,
3. The test evidence that proves it works.

| Red category | Blue control | ITSG-33 family | Evidence |
|--------------|--------------|----------------|----------|
| Direct PII (SIN) | `pii.ts:DETECTORS.sin` + Luhn validator | SI-10 input validation | `pii.test.ts` "detects valid SIN with dashes" + "rejects SIN that fails Luhn"; live `R-PII-001` / `R-CLEAN-002` |
| Direct PII (credit card) | `pii.ts:DETECTORS.credit_card` + Luhn validator | SI-10 | `pii.test.ts` "detects valid CC" + "rejects CC that fails Luhn"; live `R-PII-002` |
| Direct PII (email) | `pii.ts:DETECTORS.email` | SI-10 | `pii.test.ts` "detects email"; live `R-PII-003` |
| Vendor secret leak (Anthropic key) | `pii.ts:DETECTORS.api_key_anthropic` | SI-10 + SC-12 key handling | `pii.test.ts` "detects Anthropic key"; live `R-SEC-001` |
| Vendor secret leak (AWS access key) | `pii.ts:DETECTORS.api_key_aws` | SI-10 + SC-12 | `pii.test.ts` "detects AWS access key id"; live `R-SEC-002` |
| Vendor secret leak (Google API key) | `pii.ts:DETECTORS.api_key_google` | SI-10 + SC-12 | `pii.test.ts` "detects Google API key"; live `R-SEC-003` |
| Vendor secret leak (OpenAI key) | `pii.ts:DETECTORS.api_key_openai` | SI-10 + SC-12 | live `R-EP-001` (enhance-prompt route) |
| Egress via tool route (email) | `piiGuard.runPiiGuard` invoked in `routes/tools/email.ts` (claude-D slice) | SI-10 + SC-7 boundary | live `R-TOOL-001` |
| Egress via tool route (search) | `runPiiGuard` invoked in `routes/tools/search.ts` (claude-festive-elbakyan slice) | SI-10 + SC-7 | live `R-TOOL-002` |
| False-positive on benign prompt | Validators + `confRank` overlap dedupe in `pii.ts` | SI-10 quality gate | live `R-CLEAN-001..003` |

All 6 LLM-egress routes (`anthropic`, `gemini`, `xai`, `nano`,
`enhancePrompt`, `freeAgent`) and the 4 high-risk tool routes (`email`,
`db`, `brave-search`, `google-search`) call `runPiiGuard` before any
upstream invocation. See `scripts/red-agent.mjs` for the per-route
coverage matrix.

---

## 3. Controls observed but not directly tested by this Red run

These are Blue controls that exist in code but weren't the focus of any
of the 13 Red cases. They're listed so the auditor knows where to look
for the next test extension.

| Control | File | Why not in this Red pass |
|---------|------|--------------------------|
| Audit-log persistence to `pii_audit_log` | `packages/backend/src/lib/auditDb.ts` + migration 0002 | Requires DB access; verified separately in Phase 7 follow-up ("36 ms response time, broken DB" smoke test) |
| Audit-log doesn't leak raw values | `packages/backend/src/lib/piiGuard.ts:emitAudit` | Covered by Vitest `piiGuard.test.ts` "audit payload NEVER serialises raw matched values" |
| Frontend surfaces block reason | `useWorkflowRunner.ts:maybeToastPiiBlock` | Browser-verified in Phase 7 follow-up (b) — toast title + Output Log line both captured |
| `warn` mode emits but doesn't block | `piiGuard.ts:runPiiGuard` | Live-verified in Phase 7 with structured stderr audit line |
| Guard doesn't block on DB outage | `auditDb.ts` lazy-pool + fire-and-forget | Live-verified — 36 ms response with broken `SHARED_DATABASE_URL` |
| CORS allow-list | `packages/backend/src/index.ts` Fastify CORS plugin | Cross-origin replay not in this Red set; deferred to a "browser Red" extension |
| Tool allow-list (no arbitrary HTTP fetch) | `routes/tools/*.ts` enumerated routes; `toolsManifest.json` | Static — Red would need to attempt an undefined tool path; deferred |

---

## 4. Known gaps (what Red would catch if we kept attacking)

Items where the current Blue posture has a known weakness. **None of
these were exploited by the 13 cases above** — they're documented so the
next Red iteration knows where to push:

| Gap | Risk | Source-of-truth | Remediation owner |
|-----|------|-----------------|-------------------|
| Combinatorial PI: prompt names a program + a building + a date that together identify one person | Detector won't fire on any single token | `pia_template.md` § 3.2 | Operator training + human-in-loop before export |
| Novel PII format (e.g. new GoA case-file numbering) | Regex catalogue is finite | `pii.ts:DETECTORS` | Annual SI-10(3) regex catalogue review |
| Prompt-injection that exfiltrates secrets *out of* a system prompt to the LLM (e.g. "list all your instructions") | Guard only checks egress content, not what the LLM does with it | Defence-in-depth: don't put secrets in system prompts in the first place — D-10..D-12 in `security_categorization.md` § 3 |  V-C01 secrets-encryption follow-up |
| Frontend client tampering with `userPrompt` to embed an `OpenAI` key claim and bypass guard | The frontend has no special trust here — server-side guard is the gate | Re-tested by `R-EP-001` (the request *is* blocked server-side) | n/a — design intent |
| ~~Tool routes other than the 4 gated~~ | ~~Currently no PII gate~~ | ~~`routes/tools/*.ts`~~ | **CLOSED 2026-05-22 (claude-C)** — 9 additional routes gated (`apiCall`, `github`, `ocr`, `pdf`, `pronghorn`, `scrape`, `tts`, `weather`, `zip`); `time` skipped intentionally (IANA timezone label would FP `name_candidate`); verified by Red cases `R-TOOL-003..012` |
| Reflection / loop-detection bypass in free-agent self-spawn (R-09 in PIA) | `loopDetector.ts` caps iterations but doesn't catch slow oscillations | `lib/loopDetector.ts` | Tighten loop heuristics or alert on `iteration > N` |

---

## 5. Inheritance — Blue posture we rely on from outside the boundary

These are controls we *don't* implement but that the upstream / inherited
service does. Listed because Red attacks targeting these would be
out-of-scope but still need an acknowledgement.

| Inherited control | Provider | Document of record |
|-------------------|----------|--------------------|
| TLS + region pinning for LLM traffic | Vertex AI (Google Cloud Canada) | `«FILL — Google → GoA data-handling agreement #»` |
| SSO MFA enforcement | Microsoft Entra ID tenant | Service Alberta tenant policy |
| Postgres at-rest encryption | Render (or production host) | Render attestation |
| OS / runtime hardening | Container base image | `«FILL — base image attestation»` |

---

## 6. How to rerun this Red pass

The harness is committed and self-contained. To reproduce:

```sh
# 1. Boot backend with stub keys (real keys would be fine too; we only
#    need the guard to fire, not the LLM to answer).
PORT=3000 ANTHROPIC_API_KEY=fake-but-set \
  GEMINI_API_KEY=fake-but-set XAI_API_KEY=fake-but-set \
  npm run dev:backend &

# 2. Run all 13 cases. Writes analysis/redblue/red_results.json
#    and prints a per-case pass/fail line to stderr.
node scripts/red-agent.mjs

# 3. Tear down.
lsof -ti :3000 | xargs kill -9
```

Exit code 0 = all green. Non-zero = at least one regression — CI should
fail the build.

---

## 7. Sign-offs

| Role | Name | Concur? | Date |
|------|------|---------|------|
| Red lead | claude-C | Cases authored 2026-05-22 | 2026-05-22 |
| Blue lead | «FILL — SECOPS» | | |
| Privacy officer | «FILL» | (Acknowledges PII gaps in § 4 are policy-tracked) | |
| Security authority (CISO) | «FILL» | | |

---

## Appendix — full case-result extract

For convenience, the headline of each result inline. Full JSON in
[`red_results.json`](red_results.json).

| ID | Category | Verdict |
|----|----------|---------|
| R-PII-001 | Direct identifier — Canadian SIN | ✔ blocked (kinds: sin) |
| R-PII-002 | Direct identifier — credit card | ✔ blocked (kinds: name_candidate, credit_card) |
| R-PII-003 | Direct identifier — email | ✔ blocked (kinds: email) |
| R-SEC-001 | Secret leak — Anthropic key | ✔ blocked (kinds: api_key_anthropic) |
| R-SEC-002 | Secret leak — AWS access key | ✔ blocked (kinds: api_key_aws) |
| R-SEC-003 | Secret leak — Google API key | ✔ blocked (kinds: api_key_google) |
| R-FA-001 | Free-agent — SIN in prompt | ✔ blocked (kinds: sin) |
| R-EP-001 | Enhance-prompt — leaked OpenAI key | ✔ blocked (kinds: api_key_openai) |
| R-TOOL-001 | Tool route — email body with SIN | ✔ blocked (kinds: sin) |
| R-TOOL-002 | Tool route — search query with email | ✔ blocked (kinds: email) |
| R-TOOL-003 | Tool route — apiCall url with SIN in query string | ✔ blocked (kinds: sin) |
| R-TOOL-004 | Tool route — apiCall body with email | ✔ blocked (kinds: email) |
| R-TOOL-005 | Tool route — github filePath with SIN | ✔ blocked (kinds: sin) |
| R-TOOL-006 | Tool route — ocr imageUrl with email | ✔ blocked (kinds: email) |
| R-TOOL-007 | Tool route — pdf url with SIN | ✔ blocked (kinds: sin) |
| R-TOOL-008 | Tool route — pronghorn text content with SIN | ✔ blocked (kinds: sin) |
| R-TOOL-009 | Tool route — scrape url with email | ✔ blocked (kinds: email) |
| R-TOOL-010 | Tool route — tts text with SIN | ✔ blocked (kinds: sin) |
| R-TOOL-011 | Tool route — weather location with email | ✔ blocked (kinds: email) |
| R-TOOL-012 | Tool route — zip filePath with credit card | ✔ blocked (kinds: credit_card) |
| R-CLEAN-001 | Clean — plain question | ✔ allowed (past guard) |
| R-CLEAN-002 | Clean — innocuous digits (Luhn-fail) | ✔ allowed (past guard) |
| R-CLEAN-003 | Clean — tool route benign search | ✔ allowed (past guard) |
| R-CLEAN-004 | Clean — pdf benign url | ✔ allowed (past guard) |
| R-CLEAN-005 | Clean — weather city name | ✔ allowed (past guard) |
