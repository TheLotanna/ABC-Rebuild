# ABC — Features, Endpoints, Screens & Dependencies Inventory

> Source repo: `/Users/lotanna.okwuchukwu/Desktop/agent-builder-console-main`
> Method: directory walk + `grep` of route declarations, edge-function `serve()`
> entrypoints, `package.json`, and component subtrees. See
> `analysis/methodology.md` for the reusable recipe.
> This file is the source for the `features` table seed
> (`db/migrations/0002_seed_features.sql`).

---

## A. Screens / routes (frontend)

| ID | Route | Component | Notes |
|----|-------|-----------|-------|
| SCR-001 | `/` | `src/pages/Index.tsx` (3,191 lines) | Master workbench — hosts Workflow Mode, Free Agent Mode, sidebar, toolbar, properties, output. Carries all top-level state. |
| SCR-002 | `*` | `src/pages/NotFound.tsx` | 404 fallback. |

> **Single-page app.** All "screens" beyond `/` are internal panels driven by
> `mode` and `selectedNode` state inside `Index.tsx`. The two persistent panels
> are **Workflow Mode** (canvas with stages/agents/functions) and **Free Agent
> Mode** (blackboard + canvas). All modals are rendered conditionally inside
> `Index.tsx` based on `*ModalOpen` booleans.

## B. Backend endpoints (Supabase Edge Functions → Fastify equivalent)

Each row maps the legacy Supabase endpoint to the Fastify route already
ported to `packages/backend/src/routes/`.

### B.1 Agent / LLM endpoints

| ID | Legacy path | New Fastify route | Method | Streaming | Purpose |
|----|-------------|-------------------|--------|-----------|---------|
| EP-001 | `/functions/v1/run-agent` | `/api/run-agent` | POST | SSE | Google Gemini chat with inline tool calls |
| EP-002 | `/functions/v1/run-agent-anthropic` | `/api/run-agent/anthropic` | POST | SSE | Anthropic Claude chat |
| EP-003 | `/functions/v1/run-agent-xai` | `/api/run-agent/xai` | POST | SSE | xAI Grok chat |
| EP-004 | `/functions/v1/run-nano` | `/api/run-nano` | POST | JSON | Gemini image generation (nano-banana) |
| EP-005 | `/functions/v1/free-agent` | `/api/free-agent` | POST | JSON (per iter) | Autonomous-loop driver (system prompt build, tool dispatch, blackboard update) |
| EP-006 | `/functions/v1/enhance-prompt` | `/api/enhance-prompt` | POST | SSE | Prompt-improvement LLM (multi-provider) |

### B.2 Tool endpoints

| ID | Legacy path | New Fastify route | Purpose |
|----|-------------|-------------------|---------|
| EP-010 | `/functions/v1/brave-search` | `/api/tools/brave-search` | Brave Web Search API |
| EP-011 | `/functions/v1/google-search` | `/api/tools/google-search` | Google Programmable Search |
| EP-012 | `/functions/v1/web-scrape` | `/api/tools/web-scrape` | Arbitrary URL fetch + readability extract |
| EP-013 | `/functions/v1/api-call` | `/api/tools/api-call` | Generic HTTP request proxy |
| EP-014 | `/functions/v1/github-fetch` | `/api/tools/github` | GitHub repo tree + file content |
| EP-015 | `/functions/v1/external-db` | `/api/tools/db` | Arbitrary Postgres execution against caller-supplied connection string |
| EP-016 | `/functions/v1/send-email` | `/api/tools/email` | Resend email send |
| EP-017 | `/functions/v1/elevenlabs-tts` | `/api/tools/tts` | ElevenLabs TTS audio |
| EP-018 | `/functions/v1/get-elevenlabs-voices` | `/api/tools/tts/voices` | ElevenLabs voice list |
| EP-019 | `/functions/v1/time` | `/api/tools/time` | World-clock helper |
| EP-020 | `/functions/v1/weather` | `/api/tools/weather` | Weather lookup |
| EP-021 | `/functions/v1/tool_weather` | `/api/tools/weather` (merged) | Duplicate of EP-020 in source — merged on port |
| EP-022 | `/functions/v1/tool_pdf-handler` | `/api/tools/pdf` | PDF text extraction |
| EP-023 | `/functions/v1/tool_ocr-handler` | `/api/tools/ocr` | OCR via Gemini Vision |
| EP-024 | `/functions/v1/tool_zip-handler` | `/api/tools/zip` | ZIP archive extract / create |
| EP-025 | `/functions/v1/pronghorn-post` | _**dropped on port**_ | Legacy posting endpoint, unused. |

## C. Features (functional)

Grouped by the workflow surface they belong to. The IDs feed the
`features` seed.

### C.1 Workflow Mode

| ID | Feature | Source file |
|----|---------|-------------|
| FEAT-W01 | Multi-stage workflow canvas (stages, agents, functions, notes) | `src/components/workflow/WorkflowCanvas.tsx` + `WorkflowCanvasMode.tsx` |
| FEAT-W02 | "Simple view" stacked layout (mobile-friendly) | `src/components/workflow/SimpleView.tsx` |
| FEAT-W03 | Drag-and-drop agent / function selection | `src/components/AgentSelector.tsx`, `FunctionSelector.tsx`, `ExcelSelector.tsx` |
| FEAT-W04 | Edge connections between agents and functions | `WorkflowCanvas.tsx` (reactflow edges) |
| FEAT-W05 | Per-stage run controls (run stage / run downstream / run all) | `Stage.tsx` |
| FEAT-W06 | Per-node model selection (Gemini / Claude / Grok) | `Sidebar.tsx`, `AgentNode.tsx` |
| FEAT-W07 | Function definitions registry (50+ built-in functions) | `src/lib/functionDefinitions.ts` |
| FEAT-W08 | Function execution engine | `src/lib/functionExecutor.ts` |
| FEAT-W09 | Reference resolver (`{{nodeId.output}}` substitution) | `src/lib/referenceResolver.ts` |
| FEAT-W10 | Output log panel with streaming | `src/components/output/OutputLog.tsx` |
| FEAT-W11 | Properties panel (per-node config) | `src/components/properties/PropertiesPanel.tsx` |
| FEAT-W12 | Sidebar: workflow library, model picker, save/load | `src/components/sidebar/Sidebar.tsx` |
| FEAT-W13 | Toolbar: undo / redo / clear / export | `src/components/toolbar/Toolbar.tsx` |
| FEAT-W14 | Notes (sticky notes on canvas) | `src/components/workflow/NoteNode.tsx` |
| FEAT-W15 | Excel-driven batch input | `src/components/ExcelSelector.tsx`, `src/utils/parseExcel.ts` |

### C.2 Free Agent Mode (autonomous loop)

| ID | Feature | Source file |
|----|---------|-------------|
| FEAT-F01 | Free Agent session driver + blackboard | `src/hooks/useFreeAgentSession.ts` |
| FEAT-F02 | Canvas view with child agents, scratchpads, artifacts, files | `src/components/freeAgent/FreeAgentCanvas.tsx` |
| FEAT-F03 | Side panel: progress, controls, status | `src/components/freeAgent/FreeAgentPanel.tsx` |
| FEAT-F04 | Blackboard viewer (chronological) | `src/components/freeAgent/BlackboardViewer.tsx` |
| FEAT-F05 | Artifacts panel + viewer modal | `src/components/freeAgent/ArtifactsPanel.tsx`, `ArtifactViewerModal.tsx` |
| FEAT-F06 | System prompt viewer | `src/components/freeAgent/SystemPromptViewer.tsx` |
| FEAT-F07 | Raw response viewer (debug) | `src/components/freeAgent/RawViewer.tsx` |
| FEAT-F08 | Secrets manager (BYO API keys per tool) | `src/components/freeAgent/SecretsManagerModal.tsx`, `SecretsMiniPanel.tsx` |
| FEAT-F09 | Tool instances tab (named tool configs) | `src/components/freeAgent/ToolInstancesTab.tsx` |
| FEAT-F10 | Interject / assist / reflect / final-report modals | `InterjectModal.tsx`, `AssistanceModal.tsx`, `ReflectModal.tsx`, `FinalReportModal.tsx` |
| FEAT-F11 | Enhance prompt feature (LLM rewrites user prompt) | `EnhancePromptModal.tsx`, `EnhancePromptSettingsModal.tsx` |
| FEAT-F12 | Tool fallback / retry layer | `src/lib/toolFallbacks.ts` |
| FEAT-F13 | Loop detector (prevents tool-call cycles) | `src/lib/loopDetector.ts` |
| FEAT-F14 | Free-agent tool dispatcher | `src/lib/freeAgentToolExecutor.ts` |
| FEAT-F15 | Session export to ZIP | `src/utils/sessionExporter.ts` |
| FEAT-F16 | Markdown processor (artifact rendering) | `src/utils/markdownProcessor.ts` |
| FEAT-F17 | Binary-tool utilities (PDF/OCR/ZIP base64 handling) | `src/lib/binaryToolUtils.ts` |
| FEAT-F18 | Safe-render (XSS-safe markdown) | `src/lib/safeRender.ts` |
| FEAT-F19 | System prompt builder (templated) | `src/lib/systemPromptBuilder.ts` |
| FEAT-F20 | Child-agent spawning + detail modal | `ChildAgentNode.tsx`, `ChildAgentDetailModal.tsx` |
| FEAT-F21 | Attribute viewer (tool result inspection) | `AttributeNode.tsx`, `AttributeViewerModal.tsx` |
| FEAT-F22 | Scratchpad viewer (agent notes) | `ScratchpadNode.tsx`, `ScratchpadViewerModal.tsx` |

### C.3 Cross-cutting

| ID | Feature | Source file |
|----|---------|-------------|
| FEAT-X01 | Responsive layout (desktop + mobile) | `src/components/layout/ResponsiveLayout.tsx`, `MobileNav.tsx` |
| FEAT-X02 | Light/dark theme (next-themes) | bound in `App.tsx` |
| FEAT-X03 | Toast notifications | `src/components/ui/sonner.tsx` |
| FEAT-X04 | Help drawer | `src/components/help/` |
| FEAT-X05 | GitHub repo browser modal | `src/components/github/GitHubTreeModal.tsx` |
| FEAT-X06 | Prompt customization (per-template overrides) | `src/hooks/usePromptCustomization.ts` |
| FEAT-X07 | File text extraction (PDF/DOCX/XLSX) | `src/utils/fileTextExtraction.ts` |

## D. External dependencies

### D.1 npm production deps (source `package.json`)

| Category | Packages |
|----------|----------|
| UI primitives | `@radix-ui/react-*` (27 packages), `cmdk`, `vaul`, `input-otp` |
| Styling | `tailwindcss`, `tailwind-merge`, `class-variance-authority`, `clsx`, `tailwindcss-animate` |
| State / data | `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `zod` |
| Canvas | `reactflow` 11, `@dnd-kit/*` (3 packages) |
| Icons / charts | `lucide-react`, `recharts` |
| Markdown | `react-markdown`, `remark-gfm` |
| File / binary | `exceljs`, `jszip`, `jspdf`, `docx`, `mammoth`, `pdfjs-dist` |
| Theming / UX | `next-themes`, `sonner`, `react-day-picker`, `embla-carousel-react`, `react-resizable-panels` |
| Routing | `react-router-dom` 6 |
| Backend client | `@supabase/supabase-js` |
| Misc | `date-fns`, `dompurify` |

### D.2 External SaaS / APIs

| Provider | Used by | Key required |
|----------|---------|--------------|
| Google Gemini | `run-agent`, `run-nano`, `enhance-prompt` | `GEMINI_API_KEY` |
| Anthropic | `run-agent-anthropic`, `enhance-prompt` | `ANTHROPIC_API_KEY` |
| xAI | `run-agent-xai`, `enhance-prompt` | `XAI_API_KEY` |
| Brave Search | `brave-search` | `BRAVE_SEARCH_API_KEY` |
| Google Programmable Search | `google-search` | `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` |
| ElevenLabs | `elevenlabs-tts`, `get-elevenlabs-voices` | `ELEVENLABS_API_KEY` |
| Resend | `send-email` | `RESEND_API_KEY` |
| GitHub | `github-fetch` | `GITHUB_TOKEN` (optional — public access works without) |
| Supabase (legacy) | `@supabase/supabase-js` client, all `/functions/v1/*` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Postgres (caller-supplied) | `external-db` | per-request `connectionString` |

### D.3 Cross-component shared state surfaces

| Surface | Mechanism | Owner |
|---------|-----------|-------|
| Workflow nodes/edges | `useReducer` inside `Index.tsx` | `Index.tsx` |
| Free Agent session | `useFreeAgentSession` hook (50+ refs) | hook |
| Secrets | `localStorage` (`free_agent_secrets`) — **unencrypted, plain JSON** | `useSecretsManager` |
| Tool instances | `localStorage` (`free_agent_tool_instances`) | `useToolInstances` |
| Prompt customizations | `localStorage` (`freeagent-prompt-customizations`) | `usePromptCustomization` |
| Enhance-prompt template | `localStorage` (`freeagent-enhance-prompt-template`) | `EnhancePromptModal` |
| Theme | `next-themes` cookie | App |

## E. Headline counts (for the `features` seed)

- **Screens / routes:** 2
- **Backend endpoints:** 24 unique (after merging `weather`/`tool_weather` and dropping `pronghorn-post`) — currently mapped to 22 Fastify routes
- **Functional features (FEAT-*):** 44
- **Source `.tsx`/`.ts` files under `src/`:** ~150
- **Cross-component component dirs:** 11 (`ui`, `workflow`, `freeAgent`, `sidebar`, `toolbar`, `properties`, `output`, `layout`, `github`, `help`, top-level selectors)
- **shadcn-vue parity gap:** source uses 49 shadcn primitives; target frontend currently has 7

## F. Reusable method (for any other codebase)

1. **List route declarations** — `grep -nE '<Route|path=' src/App.tsx` (or
   equivalent for React Router / Vue Router / Next.js `app/` dirs).
2. **List backend handlers** — `for d in <fn-dir>/*; do …` grep each
   entrypoint for `serve(`/`router.`/`app.<verb>(`/`export default`.
3. **List component subtrees** — `ls src/components/*/` then `wc -l` each
   `.tsx` to spot the giant single-file blob.
4. **List hooks / stores** — `ls src/hooks` and grep `useReducer|useState\(`
   in `src/pages/*.tsx` for the de-facto state container.
5. **List externals** — `jq .dependencies package.json` + grep for
   `Deno.env.get|process.env|import.meta.env` to find every secret name.
6. **Cross-reference frontend `fetch`** against backend handler list to
   detect orphans (handlers nobody calls or call-sites with no handler).

This recipe can be packaged as a Claude **skill** —
`/inventory-codebase` — that emits a `features.md` like this one for any
repo. See `analysis/methodology.md` (TODO) for the skill spec.
