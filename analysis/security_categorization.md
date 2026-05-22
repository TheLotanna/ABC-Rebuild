# Security Categorization — Agent Builder Console (ABC)

> **Purpose.** Treasury Board *Standard on Security Categorization* (2022)
> and the GoA-OCIO equivalent require every information system to be
> categorized on **Confidentiality / Integrity / Availability (CIA)** before
> Authority to Operate. This document is the categorization record for ABC.
>
> **Scope.** The Vue 3 + Fastify rebuild on the
> `claude-c/phase-4-workflow-nodes` branch — same boundary the PIA template
> uses (see [`pia_template.md`](pia_template.md) § 2.2).
>
> Anything marked `«FILL»` requires a sign-off from the assigning ministry's
> security authority — typically the CISO or a delegate.

---

## 1. Approach

| Step | Reference |
|------|-----------|
| Identify business activities | `analysis/features.md` |
| Identify information assets | `pia_template.md` § 3 (D-01..D-09 data-element catalog) |
| Score each asset on C, I, A | This document (§ 3) |
| Score business activities on I and A | This document (§ 4) |
| Take the high-water mark → system category | § 5 |
| Map category → ITSG-33 control profile | § 6 |
| Identify residual deviations and compensating controls | § 7 |

Impact levels follow the TBS five-point scale:

| Level | Label | Description (paraphrased) |
|------:|-------|---------------------------|
| 1 | Very low | Negligible harm to individuals or operations |
| 2 | Low | Limited harm, recoverable |
| 3 | Medium | Serious harm to individuals, programs, or finances |
| 4 | High | Severe / catastrophic harm — irreversible |
| 5 | Very high | Critical national-interest harm |

Confidentiality is also expressed as the GC information-classification
tier the asset would warrant: **Unclassified / Protected A / Protected B /
Protected C / Classified**.

---

## 2. Business activities in scope

| BA-ID | Activity | Description | Owner |
|-------|----------|-------------|-------|
| BA-01 | Workflow composition | A staff member designs a multi-stage LLM workflow on the canvas | Program area using ABC |
| BA-02 | Workflow execution | Stages run sequentially; agents call LLMs; tools call external APIs | Program area / system operator |
| BA-03 | Free Agent autonomous execution | A long-running agent loops over its own state with reflect / interject / final report | Same |
| BA-04 | PII guard enforcement | Pre-LLM regex gate blocks Protected-B-implicating prompts; emits audit row | Security operations (SECOPS) |
| BA-05 | Audit log review | SECOPS triages `pii_audit_log` rows where `has_secret OR action='block'` | SECOPS |
| BA-06 | Secrets management | Operators register API keys against `secretsStore` (frontend-only today; backend-encrypted in V-C01 follow-up) | Operator |
| BA-07 | Session export | A user downloads a workflow snapshot as JSON (`Save`) | User |
| BA-08 | SSO authentication | Login via Entra ID, including ministry-group claim mapping | SSO operator / Service Alberta |

---

## 3. Information assets — CIA scoring

Asset IDs are the data-element catalog from
[`pia_template.md`](pia_template.md) § 3.1.

| ID | Asset | C | C-tier | I | A | Notes |
|----|-------|--:|--------|--:|--:|-------|
| D-01 | EntraID `oid` / UPN | 3 | Protected B | 4 | 3 | Identity primary key — corrupted = wrong-user data leak (I=4) |
| D-02 | Ministry group memberships | 2 | Protected A | 4 | 3 | Drives data-partition routing; corrupted = cross-ministry leak |
| D-03 | User free-text prompt | 3 | Protected B | 2 | 1 | Highest C in the system because of arbitrary user input |
| D-04 | Agent / function configurations | 2 | Protected A | 3 | 1 | Tampered config can re-route prompts; medium-I |
| D-05 | Uploaded file content | 3 | Protected B | 1 | 1 | Worst-case PI; user-controlled |
| D-06 | Tool inputs (derived) | 3 | Protected B | 2 | 1 | Mirrors D-03 sensitivity |
| D-07 | LLM outputs | 3 | Protected B | 1 | 1 | May contain extracted PI from D-03/D-05 |
| D-08 | PII-guard audit entries | 1 | Unclassified¹ | 4 | 3 | High-I — log tampering hides incidents; A=3 because SECOPS depend on it |
| D-09 | Workflow state JSON export | 3 | Protected B | 1 | 1 | Off-system once exported; chain-of-custody on user/MDM |
| D-10 | Vertex AI API key (env-only) | 4 | Protected B+² | 5 | 4 | Compromise → unauthorised inference billing + impersonated outputs |
| D-11 | Search/email/db tool API keys | 4 | Protected B+ | 5 | 3 | Same — direct cost / impersonation impact |
| D-12 | Postgres credentials (`SHARED_DATABASE_URL`) | 4 | Protected B+ | 5 | 3 | Compromise → audit-log tampering or cross-ministry leak |

¹ The audit table holds **kinds + offsets + counts only** (`piiGuard.ts` /
`auditDb.ts` enforce the whitelist). The row metadata is insufficient to
reconstruct the matched PI, so the table itself stays Unclassified — see
PIA § 3 D-08 and `piiGuard.test.ts` "audit payload NEVER serialises raw
matched values".

² "Protected B+" is shorthand for **Protected B with elevated secret-handling
controls**: KMS-backed storage, no plaintext-on-disk, rotation policy. The
GoA classification standard doesn't have a "Protected B+" tier formally —
treat these as Protected B with the additional safeguard set from
[`privacy_controls.md`](privacy_controls.md) § F.

---

## 4. Business-activity impact (I and A only — C is the data-side concern)

For each business activity we score the harm that would arise from an
**integrity** compromise (false / altered processing) and an **availability**
outage. Confidentiality is already covered per-asset in § 3.

| BA | Description | I | A | Notes |
|----|-------------|--:|--:|-------|
| BA-01 | Workflow composition | 1 | 1 | Local UI state; no harm |
| BA-02 | Workflow execution | 3 | 2 | Wrong inference output drives wrong downstream decision |
| BA-03 | Free Agent autonomous loop | 3 | 2 | Self-modifying loop multiplies BA-02's risk |
| BA-04 | PII guard enforcement | **5** | **4** | Guard bypassed = direct Protected B exfiltration to LLM; outage = block-everything fail-safe but legitimate work halts |
| BA-05 | Audit log review | 4 | 3 | Tampered log defeats detective control; SECOPS still hold stderr backup |
| BA-06 | Secrets management | 4 | 2 | See D-10..D-12; outage = workflow stalls |
| BA-07 | Session export | 1 | 1 | Idempotent download; user has source state |
| BA-08 | SSO authentication | 4 | 4 | No SSO = no access (acceptable failure mode); fake SSO claim = impersonation |

**BA-04 dominates** — the regulatory pivot of the whole system rests on
the guard. That's where the highest test coverage and the most
defence-in-depth sit (see § 6 control baseline).

---

## 5. Overall categorization

Take the high-water mark across §§ 3-4:

| Dimension | Score | Classification |
|-----------|------:|----------------|
| Confidentiality | 4 | **Protected B** (with Protected B+ secret-handling for D-10..D-12) |
| Integrity | 5 | **High** (driven by BA-04 guard, D-08 audit, D-10 keys) |
| Availability | 4 | **Medium-High** (driven by BA-04 + BA-08) |

**System categorization: `Protected B / High / Medium-High`** —
abbreviated `PB / H / MH`.

This matches the working assumption in `privacy_controls.md` ("Target:
process and contain information classified up to **Protected B**") and
in `pia_template.md` § 1, but adds the formal I and A scores that those
documents did not yet record.

---

## 6. ITSG-33 / GoA control baseline implications

A `PB / H / MH` system in the federal context maps to the
**Protected B / Medium / Medium** ITSG-33 control profile, escalated on
the integrity axis to **High** because of the PII guard. Below: the
profile's key control families with the existing implementations from
this codebase. *Family codes follow NIST SP 800-53 / ITSG-33 Annex 3A.*

| Family | Control class | Already in code | Gap (open follow-up) |
|--------|---------------|-----------------|----------------------|
| **AC** Access control | AC-2 account mgmt | Entra ID SSO (`pia_template.md` § 3 D-01/D-02) | AC-6 least privilege — needs per-ministry schema enforcement (PIA R-03 residual) |
| | AC-3 access enforcement | EntraID group mapping → tenant schema | AC-3 default-deny when no `AIM-G-{MIN}` group (PIA R-11) |
| **AU** Audit | AU-2 events | `piiGuard.emitAudit` → stderr + `pii_audit_log` | AU-6 review — manual today; should automate alerting on `has_secret=true` |
| | AU-12 audit generation | Migration 0002 + `auditDb.ts` | AU-11 retention policy `«FILL — 7 years? Per FOIP s.35» |
| **CM** Config mgmt | CM-2 baseline config | This repo; `package.json` pinned; SBOM in `analysis/sbom/` | CM-8 inventory — SBOM done ✅ |
| **CP** Contingency planning | CP-9 backup | None yet | Backup of `lotanna_okwuchukwu.pii_audit_log` schema before prod use |
| **IA** Identification & auth | IA-2 user identification | Entra ID SSO | IA-5 authenticator mgmt — multi-factor enforced at the Entra tenant; verify before prod |
| **IR** Incident response | IR-4 handling | PII guard `action='block'` row is the incident record | IR-6 reporting — wire to SECOPS SIEM |
| **PE** Physical | — | Inherited from Vertex AI Canada DC + Render data center attestations | Document attestation chain |
| **PL** Planning | PL-2 system security plan | This document + PIA + privacy_controls | PL-8 architecture description — covered by `analysis/architecture.md`; authorization boundary diagram still ⏳ |
| **RA** Risk assessment | RA-3 risk assessment | `pia_template.md` § 6 risk register (R-01..R-12) | Periodic refresh per PIA § 7.4 cadence |
| **SC** System & comm protection | SC-7 boundary protection | CORS allowlist; egress allow-list documented in `privacy_controls.md` § G | SC-7 sub: tool-route allow-list **enforced** at config-time, not just policy |
| | SC-12/13 crypto key handling | Env-only today; encryption-at-rest planned (V-C01) | Backend secret encryption via pgcrypto (open) |
| **SI** System & info integrity | SI-4 monitoring | `audit_log` table + stderr structured logs | SI-4(2) automated tools — wire log alerting |
| | SI-10 input validation | **PII guard (regex + Luhn validation) — primary integrity control here** | SI-10(3) review regex catalogue annually for new patterns |

Cross-reference key: `PRV-*` IDs in [`privacy_controls.md`](privacy_controls.md)
§ H map to the control families above. `V-*` IDs in
[`vulnerabilities.md`](vulnerabilities.md) are the open remediation items
that close the gap column.

---

## 7. Deviations and compensating controls

These are items where the baseline calls for a control we don't yet
implement at full strength, plus the compensating control that justifies
operating in the meantime.

| Deviation | Baseline expectation | What we have now | Compensating control | Acceptable until |
|-----------|----------------------|------------------|----------------------|------------------|
| Secrets not at-rest-encrypted on backend | SC-12/SC-13 KMS-backed storage | Env-only on backend, no DB persistence yet | Frontend never sees plaintext secrets; backend env access requires deploy-time RBAC | V-C01 close-out (in progress, claude-festive-elbakyan) |
| Per-ministry schema not enforced at write time | AC-3 strict | Single shared `lotanna_okwuchukwu` schema for audit; ministry routing exists in policy not code | Audit-only data is non-PI metadata; PIA § 6 R-03 residual notes the gap | Production deploy |
| `npm audit` shows 1 critical / 2 moderate | CM-8 / SI-2 zero-criticals at ATO | jspdf LFI + PDF Injection critical; uuid + exceljs moderates | jspdf only invoked client-side from a user gesture; mitigated by browser sandbox + same-origin; triage planned per SBOM SUMMARY | Patch landing in either jspdf upstream or our pin |
| Audit log not yet replicated to SIEM | AU-6 / IR-6 | Local stderr + `pii_audit_log` table | Manual SECOPS review on schedule per PIA § 7.4 | SIEM wire-up |
| Vertex region not deployment-pinned in code | SC-7 boundary | Region asserted in `«FILL»` deploy config | Standing GoC ↔ Vertex agreement enforces Canada region (PIA R-05) | Region pin in IaC |

---

## 8. Categorization summary (the one paragraph the ATO authorizer reads)

> The Agent Builder Console is categorized **Protected B / High / Medium-High**:
> confidentiality at Protected B because user prompts and uploaded files
> may contain personal information up to that tier; integrity at High
> because the PII guard's correctness is the linchpin of egress control
> and a guard bypass yields direct Protected B exfiltration to a third-party
> LLM; availability at Medium-High because the guard fails closed and
> blocks legitimate work during an outage. The system inherits NIST
> SP 800-53 / ITSG-33 controls at the corresponding profile; deviations
> are listed in § 7 with compensating controls and remediation timelines.
> A re-categorization is triggered when (a) a new tool is added to
> `toolsManifest.json`, (b) a new model provider is added to the LLM
> routing list, or (c) the data-handling agreement with Vertex changes.

---

## 9. Sign-offs

| Role | Name | Decision | Date |
|------|------|----------|------|
| CISO / IT security | «FILL» | Concur with PB/H/MH | |
| Privacy officer / ATIP | «FILL» | Concur (consistent with PIA) | |
| Business owner / SRO | «FILL» | Accept residuals listed in § 7 | |
| Operational authority | «FILL» | Operational readiness confirmed | |

---

## Appendix A — Asset → control mapping (quick reference)

| Asset | Primary controls protecting it | Test evidence |
|-------|--------------------------------|---------------|
| D-01..D-02 (identity / group) | IA-2 (SSO), AC-3 (group → schema) | Manual SSO test before prod |
| D-03..D-07 (prompts, files, outputs, tool I/O) | SI-10 (PII guard), SC-7 (egress allow-list), SI-4 (audit) | `pii.test.ts` (18 cases) + `piiGuard.test.ts` (16 cases) — all passing |
| D-08 (audit) | AU-2/12 (logging), SI-4 (monitoring) | `piiGuard.test.ts` "audit payload NEVER serialises raw matched values" |
| D-10..D-12 (secrets) | SC-12/13 (key handling), AC-3 (env access) | Manual deploy-time RBAC check |
| D-09 (export) | User-side data handling | Out of scope post-export — MDM dependent |

---

## Appendix B — How this document gets re-derived

1. Re-read [`pia_template.md`](pia_template.md) § 3 for any new data element.
2. Re-score § 3 + § 4 only if a new asset or business activity appears.
3. Re-run `npm run sbom:generate` and confirm the `npm audit` totals haven't worsened — if a new critical lands, add a row to § 7.
4. Confirm § 5 high-water mark hasn't changed; if it has, the ATO needs re-authorization.
5. Refresh § 6 control-family rows when a code change closes a gap.
