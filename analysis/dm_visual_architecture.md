# Agent Build Console — A Briefing for the Deputy Minister

> **Audience:** A Deputy Minister with no engineering background.
> **Reading time:** 10 minutes.
> **Author:** claude-festive-elbakyan (2026-05-22)
> **Purpose:** Show, in plain language and three simple pictures, what Agent
> Build Console (ABC) does, why we are confident it is safe to handle
> Protected B information, and what would change in a Ministry employee's day
> on the day this tool turns on.

---

## 1. What this is, in one paragraph

ABC is a workbench for **building repeatable AI workflows**. Instead of every
employee writing a custom prompt to ChatGPT, an analyst can drag a few boxes
on a canvas — *"read this PDF" → "extract the table" → "summarize for
council"* — connect them, hit Run, and have the same result every time. The
workflow is **visible**, **auditable**, and **shareable**. Other employees can
reuse it without having to re-explain the task to an AI from scratch. We are
porting an open-source proof-of-concept into a GoA-grade application: same
canvas, same workflows, but now wrapped in Microsoft sign-in, ministry
boundaries, and end-to-end auditing.

---

## 2. The three pictures

### Picture 1 — What an employee sees

```
┌──────────────────────────────────────────────────────────────────┐
│ 🔐 Signed in as: Jane Doe — Ministry of Treasury Board & Finance │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐    ┌──────────┐    ┌────────────┐    ┌─────────┐   │
│   │ Read    │───▶│ Extract  │───▶│ Summarize  │───▶│ Email   │   │
│   │ PDF     │    │ tables   │    │ for Cabinet│    │ to me   │   │
│   └─────────┘    └──────────┘    └────────────┘    └─────────┘   │
│                                                                  │
│   [ Run workflow ]   [ Share with my team ]                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Each box is a step the AI takes. The arrows show what flows from one step to
the next. The employee can change steps, save the recipe, and share it with
colleagues. That recipe — not the AI's answer — is the durable asset.

### Picture 2 — What happens behind the scenes when "Run" is pressed

```
       Jane clicks Run
              │
              ▼
   ┌──────────────────────┐
   │ Microsoft sign-in    │  ← Is Jane allowed here? Which Ministry?
   │ check (EntraID)      │
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │ PII / secret scan    │  ← Does the prompt contain a SIN, an API key,
   │ (regex-driven)       │    a health card number? Block before egress.
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │ Choose a safe LLM    │  ← Protected B? Use the GoA-hosted Vertex
   │ endpoint by data     │    proxy. Unclassified? OK to use the direct
   │ classification       │    provider with a consent banner.
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────┐
   │ Run the AI, capture  │  ← Every prompt, every tool, every output is
   │ output in audit log  │    written to the audit table with Jane's ID
   └──────────┬───────────┘    and her Ministry stamp.
              │
              ▼
   Jane sees the answer
```

The shaded boxes are the **five mandatory gates** every request passes.
None of them existed in the open-source proof-of-concept. All of them are
being added by this build.

### Picture 3 — The Ministry boundary

```
                  ┌───────────────────────────────────────┐
                  │  Government of Alberta network        │
                  │                                       │
                  │   ┌─────────────────────────────┐     │
                  │   │ Ministry A workspace        │     │
                  │   │   workflows, files, history │     │
                  │   └─────────────────────────────┘     │
                  │                                       │
                  │   ┌─────────────────────────────┐     │
                  │   │ Ministry B workspace        │     │
                  │   │   workflows, files, history │     │
                  │   └─────────────────────────────┘     │
                  │                                       │
                  │   Audit log (shared, append-only)     │
                  └───────────────┬───────────────────────┘
                                  │
                          GoA Vertex AI proxy
                                  │
                  ┌───────────────▼───────────────────────┐
                  │  External AI providers                │
                  │  (Claude / Gemini / Grok / OpenAI)    │
                  │                                       │
                  │  • Protected B data NEVER goes here   │
                  │    directly. It is brokered through   │
                  │    the GoA-hosted Vertex endpoint     │
                  │    so data stays in our boundary.     │
                  └───────────────────────────────────────┘
```

Ministry A's data is invisible to Ministry B. This is **enforced in the
database** (Postgres row-level security keyed off the Microsoft sign-in
group), not just in the UI. An employee from one ministry signing in cannot
see another ministry's workflows even if they typed the URL directly.

---

## 3. The controls that make this Protected B-ready

| What could go wrong                                  | How we stop it                                                                 |
|------------------------------------------------------|--------------------------------------------------------------------------------|
| Someone sends an SIN or health card to ChatGPT       | **PII scanner** runs before every AI call; blocks on detection                 |
| An API key gets pasted into a prompt                 | **Secret detector** (Anthropic / OpenAI / AWS / GitHub patterns) blocks egress |
| One ministry sees another ministry's data            | **EntraID-derived row-level security** in Postgres                             |
| Protected B data leaves the GoA boundary             | **Vertex AI proxy** mandatory for Protected A/B classifications                |
| No record of what the AI was asked to do             | **Append-only audit log** captures every request; 7-year retention             |
| LLM cost runs away                                   | **Per-user rate limit** + hard cap on free-agent iterations                    |
| A malicious tool query reaches an internal service   | **Private-IP egress block** + per-ministry URL allowlist                       |
| User accepts AI output uncritically                  | **Consent banner** + visible classification ribbon on every workflow run       |
| Stolen session cookie / replay                       | **Idle timeout (30 min)** + absolute session cap (8 h)                         |
| The build itself is vulnerable                       | **Red & Blue agent scans** in CI, dependency SBOM, Vitest unit tests           |

Every row maps to one or more controls in
[`analysis/privacy_controls.md`](privacy_controls.md) (20 controls, IDs PRV-001
through PRV-020) — the version reviewers will see during the STRA / SOAR
process.

---

## 4. What questions a Deputy Minister might ask, with short answers

**Q. Where does the AI run? Is our data leaving the country?**
For unclassified work the AI runs on Anthropic, Google, or xAI servers
(US/EU regions) over TLS. For Protected A or B work, the request is brokered
by the **GoA-hosted Vertex AI proxy** so the data never leaves the GoA
boundary in cleartext. Classification is enforced server-side, not on the
client.

**Q. Can a contractor see employee data, or one ministry see another?**
No. Microsoft EntraID issues a signed token that tells us which Ministry the
user belongs to (`AIM-G-{MINISTRY}-ALL_EMPLOYEES` and `…-ALL_CONTRACTORS`
groups). The Postgres database refuses to return rows belonging to a
different ministry via row-level security policies that read the group
claim. A contractor's UI also has a reduced tool set — they cannot, for
example, mass-export workflow data.

**Q. If we make a mistake, how would we know?**
Every AI call writes one row to an append-only audit table — who, when,
which ministry, which classification, the SHA-256 hash of the prompt, the
list of tools the AI used, and the eventual decision (allowed, blocked,
routed-internal). The audit table is retained for 7 years per GoA
schedule. Reads of the audit table are themselves audited.

**Q. What if someone pastes a SIN into the prompt by accident?**
The PII scanner catches it before the request leaves our backend, returns a
clear error to the user ("Request blocked: a Canadian SIN was detected,
please remove and try again"), and writes an audit entry with the kind of
PII found but **not the SIN itself**. The scanner uses regex patterns with
Luhn check-digit validation for SINs and credit-card numbers, so the
false-positive rate is low.

**Q. Hardcoded AI model names will become stale. How do we keep up?**
Models are pulled from a configuration table with effective dates, not
hardcoded. When Anthropic releases Claude 5, an admin updates one row;
nothing redeploys.

**Q. What if the AI returns wrong, biased, or unsafe content?**
Three layers:
1. The user sees AI output marked clearly as AI-generated, with a
   confidence/disclaimer ribbon.
2. The output is markdown-sanitized to prevent prompt injection from being
   rendered as executable HTML.
3. Free-agent mode has a server-side iteration cap so a runaway loop cannot
   accumulate cost or output.

**Q. What does day one of rollout look like?**
A pilot with **one ministry, ~25 employees**. They sign in with the existing
Microsoft account. Their workflows are isolated from production data. We
collect two weeks of audit logs, review the red/blue agent reports, and only
then open it to a second ministry. Authority to Operate is the gate, not the
go-live date.

**Q. What happens if a vulnerability shows up after launch?**
Three-tier response: critical vulnerabilities (e.g. auth bypass) take the
service offline within 1 hour. High severity is patched in the next 48
hours. Medium and low track on the public vulnerability backlog. Every
patch goes through the same red/blue agent gate as a new feature.

---

## 5. What this replaces, what it adds

| Open-source version (`agentbuilderconsole.com`)         | GoA version (this build)                                  |
|---------------------------------------------------------|-----------------------------------------------------------|
| React + Supabase, hosted publicly on lovable.dev        | Vue 3 + Node.js + Postgres, hosted in Nexus behind SSO    |
| Anonymous use                                           | Microsoft sign-in (EntraID) mandatory                     |
| Hardcoded AI model IDs that go stale                    | Model registry with effective dates                       |
| No data classification                                  | Unclassified / Protected A / Protected B at run time      |
| No PII or secret detection                              | Regex-driven scan before every AI call                    |
| Logs to browser console only                            | Append-only audit log in Postgres, 7-year retention       |
| Workflows visible to anyone with the URL                | Per-ministry row-level security                           |
| Egress to any provider                                  | Vertex AI proxy for Protected A/B; consent banner for the rest |

The proof-of-concept's value — **transparent, repeatable AI workflows that
analysts can compose visually** — is preserved. What changes is the
guardrails around it.

---

## 6. What I would tell the DM in 60 seconds

> "We are taking an open-source AI workbench that proved the *concept* —
> drag-and-drop AI workflows that any analyst can build — and we are wrapping
> it in five gates: Microsoft sign-in, a PII scanner, a data-classification
> check, a Vertex-AI proxy for Protected B, and an audit log. The proof-of-
> concept's flexibility stays; the risks of the proof-of-concept are
> mitigated. A pilot ministry of 25 people goes live after we have an
> Authority to Operate. The result is a tool where employees can build and
> share AI workflows in minutes without any of the prompt-engineering pain,
> while we keep a complete, queryable record of every AI decision the
> Government has made through it."

---

## 7. Where to look for more

- One-page tech-stack diagram: [`analysis/architecture.md`](architecture.md)
- Full vulnerability list with mitigations: [`analysis/vulnerabilities.md`](vulnerabilities.md)
- 20-control privacy plan: [`analysis/privacy_controls.md`](privacy_controls.md)
- Granular migration steps: [`analysis/migration_plan.md`](migration_plan.md)
- Source-of-truth code: [`REBUILD_PLAN.md`](../REBUILD_PLAN.md)
