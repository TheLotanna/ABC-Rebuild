# ABC — Migration Plan (Granular Steps)

> Companion to `analysis/architecture.md` (the *what*) — this file is the
> *how*, broken into ordered, claimable steps.
> Seeds the `migration` and `plan` tables.
> Phase numbering matches `REBUILD_PLAN.md` so the two stay in lockstep.

Each row in the `migration`/`plan` tables corresponds to one row here.
Status values: `done`, `in_progress`, `pending`, `blocked`.

---

## Phase 0 — Exercise analysis & planning track (this slice)

| ID | Step | Output artefact | Status |
|----|------|-----------------|--------|
| M-0.1 | Inventory features/endpoints/screens/deps | `analysis/features.md` | done |
| M-0.2 | Vulnerability scan | `analysis/vulnerabilities.md` | done |
| M-0.3 | Target architecture + ADRs | `analysis/architecture.md` | done |
| M-0.4 | Granular migration plan | `analysis/migration_plan.md` (this file) | done |
| M-0.5 | Privacy & info-management plan | `analysis/privacy_controls.md` | in_progress |
| M-0.6 | Idempotent SQL migrations for 5 analysis tables | `db/migrations/000*-*.sql` | in_progress |
| M-0.7 | Migration runner script (`SCHEMA` env var driven) | `db/run-migrations.mjs` | in_progress |
| M-0.8 | Push to `GovAlta-EMU/AIDE-ABC` `lotanna_okwuchukwu` branch + PR | git | pending |

---

## Phase 1 — Monorepo scaffold

| ID | Step | Source ref | Status |
|----|------|------------|--------|
| M-1.1 | npm workspaces root | `package.json` | done |
| M-1.2 | Shared types package — 6 type files | `src/types/*.ts` → `packages/shared/src/types/` | done |
| M-1.3 | `.env.example` documenting all keys | n/a | done |

## Phase 2 — Fastify backend

| ID | Step | Source ref (Supabase fn) | Target | Status |
|----|------|--------------------------|--------|--------|
| M-2.0 | Server bootstrap + CORS + /health | n/a | `packages/backend/src/index.ts` | done |
| M-2.1 | SSE helper | (shared) | `packages/backend/src/routes/agents/sseHelper.ts` | done |
| M-2.2 | Gemini chat | `run-agent` | `routes/agents/gemini.ts` | done (needs Vertex rewire — M-7.x) |
| M-2.3 | Claude chat | `run-agent-anthropic` | `routes/agents/anthropic.ts` | done (needs Vertex rewire — M-7.x) |
| M-2.4 | Grok chat | `run-agent-xai` | `routes/agents/xai.ts` | done (data-residency open — M-7.x) |
| M-2.5 | Image gen | `run-nano` | `routes/agents/nano.ts` | done (Ent-Tools OpenAI Image rewire — M-7.x) |
| M-2.6 | Enhance prompt | `enhance-prompt` | `routes/agents/enhancePrompt.ts` | done |
| M-2.7 | Free agent | `free-agent` | `routes/agents/freeAgent.ts` | done |
| M-2.8 | Search (Brave + Google) | `brave-search`, `google-search` | `routes/tools/search.ts` | done |
| M-2.9 | Web scrape | `web-scrape` | `routes/tools/scrape.ts` | done (needs SSRF guard — M-7.x) |
| M-2.10 | API call | `api-call` | `routes/tools/apiCall.ts` | done (needs SSRF guard) |
| M-2.11 | GitHub | `github-fetch` | `routes/tools/github.ts` | done |
| M-2.12 | External DB | `external-db` | `routes/tools/db.ts` | done (needs lock-down — M-7.x) |
| M-2.13 | Email | `send-email` | `routes/tools/email.ts` | done (Resend → GoA mail relay — open) |
| M-2.14 | TTS + voices | `elevenlabs-tts`, `get-elevenlabs-voices` | `routes/tools/tts.ts` | done |
| M-2.15 | Time / weather | `time`, `weather` | `routes/tools/time.ts`, `weather.ts` | done |
| M-2.16 | PDF / OCR / ZIP | `tool_pdf-handler`, `tool_ocr-handler`, `tool_zip-handler` | `routes/tools/pdf.ts`, `ocr.ts`, `zip.ts` | done |

## Phase 3 — Vue frontend foundation

| ID | Step | Source ref | Status |
|----|------|------------|--------|
| M-3.1 | Vite + Tailwind + tsconfig + index.html + index.css | `vite.config.ts`, `tailwind.config.ts`, `index.css` | done |
| M-3.2 | `main.ts`, `App.vue`, `router/index.ts` | `src/main.tsx`, `App.tsx` | done |
| M-3.3 | Workflow Pinia store | `Index.tsx` workflow `useReducer` | done |
| M-3.4 | Free-agent Pinia store | `useFreeAgentSession.ts` | **pending in worktree** (memory says done — verify) |
| M-3.5 | Secrets / prompt / tool-instance stores | `useSecretsManager.ts`, `usePromptCustomization.ts`, `useToolInstances.ts` | done |
| M-3.6 | `use-mobile`, `use-toast` composables | hooks of same name | done |
| M-3.7 | `useSecretsManager`, `usePromptCustomization`, `useToolInstances`, `useFreeAgentSession` composables | hooks | **pending in worktree** |
| M-3.8 | `useWorkflowRunner` composable (SSE dispatch) | inline in `Index.tsx` | **pending in worktree** |
| M-3.9 | Framework-agnostic copies (`lib/*`, `utils/*`, `public/data/*`) | source `src/lib`, `src/utils`, `public/data` | **pending in worktree** |
| M-3.10 | `WorkbenchView.vue` | `pages/Index.tsx` (3,191 lines → decomposed) | **pending in worktree** |
| M-3.11 | `NotFoundView.vue` | `pages/NotFound.tsx` | **pending in worktree** |
| M-3.12 | `AppLayout.vue`, `MobileNav.vue` | `components/layout/*` | **pending in worktree** |

## Phase 4 — Workflow mode components

| ID | Step | Source ref | Status |
|----|------|------------|--------|
| M-4.1 | `AgentNode.vue`, `FunctionNode.vue`, `NoteNode.vue`, `Stage.vue`, `StageNode.vue`, `WorkflowNodeComponent.vue` | `components/workflow/*` | done |
| M-4.2 | `iconRegistry.ts` (string→Lucide component) | derived from `functionDefinitions.ts` | done |
| M-4.3 | ui primitives: Card / Badge / Button / Input / CardHeader / CardTitle / CardContent | shadcn-vue | done |
| M-4.4 | `WorkflowCanvas.vue` (xyflow/vue) | `components/workflow/WorkflowCanvas.tsx` | pending |
| M-4.5 | `WorkflowCanvasMode.vue` | `WorkflowCanvasMode.tsx` | pending |
| M-4.6 | `SimpleView.vue` | `SimpleView.tsx` | pending |
| M-4.7 | `Sidebar.vue` | `components/sidebar/Sidebar.tsx` | pending |
| M-4.8 | `Toolbar.vue` | `components/toolbar/Toolbar.tsx` | pending |
| M-4.9 | `PropertiesPanel.vue` | `components/properties/PropertiesPanel.tsx` | pending |
| M-4.10 | `OutputLog.vue` | `components/output/OutputLog.tsx` | pending |
| M-4.11 | `AgentSelector.vue`, `FunctionSelector.vue`, `ExcelSelector.vue` | top-level selectors | pending |

## Phase 5 — Free Agent mode components

| ID | Step | Status |
|----|------|--------|
| M-5.1 | Containers — `FreeAgentView.vue`, `FreeAgentPanel.vue`, `FreeAgentCanvas.vue` | pending |
| M-5.2 | Viewers — `BlackboardViewer`, `ArtifactsPanel`, `RawViewer`, `SystemPromptViewer`, `SecretsMiniPanel` | pending |
| M-5.3 | Canvas nodes — `FreeAgentNode`, `ChildAgentNode`, `ScratchpadNode`, `AttributeNode`, `FileNode`, `PromptNode`, `PromptFileNode`, `ArtifactNode`, `ToolNode`, `CategoryLabelNode` | partial (5/10 in worktree — `Artifact`, `CategoryLabel`, `File`, `PromptFile`, `Prompt`) |
| M-5.4 | Modals (11) — `Assistance`, `FinalReport`, `ChildAgentDetail`, `ArtifactViewer`, `AttributeViewer`, `ScratchpadViewer`, `Reflect`, `Interject`, `EnhancePrompt`, `EnhancePromptSettings`, `SecretsManager` | pending |
| M-5.5 | `ToolInstancesTab.vue` | pending |

## Phase 6 — Integration & polish

| ID | Step | Status |
|----|------|--------|
| M-6.1 | Wire composables to backend (`VITE_BACKEND_URL` → Fastify) | pending |
| M-6.2 | Dark-mode toggle via `useColorMode` | pending |
| M-6.3 | E2E smoke (workflow run, free-agent run, dark toggle) | pending |
| M-6.4 | Migrate `components/help/` and `components/github/` if still needed | pending |

## Phase 7 — Hardening (GoA-readiness)

| ID | Step | Status |
|----|------|--------|
| M-7.1 | Microsoft Entra ID OIDC + JWT verifier middleware | pending |
| M-7.2 | Dynamic Entra group → ministry mapping (`AIM-G-{MINISTRY}-ALL_*`) | pending |
| M-7.3 | `@fastify/cors` allowlist (replace `*`) | pending |
| M-7.4 | `@fastify/helmet` + strict CSP | pending |
| M-7.5 | `@fastify/rate-limit` per UPN | pending |
| M-7.6 | Body-size guard 4 MB | pending |
| M-7.7 | SSRF guard in `web-scrape` + `api-call` (RFC1918 block, metadata block, host allowlist on GitHub) | pending |
| M-7.8 | Lock `external-db` to per-user configured `connection_id`s | pending |
| M-7.9 | Server-side secrets table (pgcrypto-encrypted) — remove `localStorage` path | pending |
| M-7.10 | PII regex gate (pre-LLM scan + UI confirm) | pending |
| M-7.11 | `audit_log` table + writer middleware | pending |
| M-7.12 | Vertex AI rewire for Claude + Gemini | pending |
| M-7.13 | xAI/Grok decision (drop or gate to Protected A only) | pending |
| M-7.14 | Email tool: Resend → GoA-approved relay (or drop) | pending |
| M-7.15 | Per-user / per-ministry cost meter with hard stop | pending |
| M-7.16 | Centralised model registry (`packages/shared/src/models.ts`) | pending |

## Phase 8 — Evals, evidence, rollout

| ID | Step | Status |
|----|------|--------|
| M-8.1 | Lint + typecheck pass across workspaces | pending |
| M-8.2 | Unit tests for `freeAgentToolExecutor`, `referenceResolver`, `loopDetector`, PII gate | pending |
| M-8.3 | Playwright E2E smoke (SSO → workflow → free-agent) | pending |
| M-8.4 | Blue-agent run (VELOCITY-HARNESS) + report in `analysis/blue_report.md` | pending |
| M-8.5 | Red-agent run (local) + report in `analysis/red_report.md` | pending |
| M-8.6 | SOAR/STRA evidence package (cross-ref control list in `architecture.md` §6) | pending |
| M-8.7 | Deputy-Minister-friendly architecture visual (PDF, layperson) | pending |
| M-8.8 | Final retro + project plan write-up | pending |

---

## Dependency graph

- Phase 0 (this) is **fully parallel** with everything else.
- Phase 1 → Phase 2 → Phase 3 are mostly done; remaining 3.x items unblock
  Phase 4 view-wiring and Phase 5 container-wiring.
- Phase 4.4–4.10 and Phase 5.1–5.5 can run in parallel by component (one
  agent per file).
- Phase 6 needs Phase 3.x + Phase 4 + Phase 5 substantially complete.
- Phase 7 is independent of Phase 5 but blocks production.
- Phase 8 evals require Phase 6 complete (need a runnable app to red-team).
