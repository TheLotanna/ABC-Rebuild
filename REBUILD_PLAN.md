# Agent Builder — Vue 3 + Node.js Rebuild

This is the live coordination document for rebuilding the React/Supabase
**AI Agent Workbench** (`/Users/lotanna.okwuchukwu/Desktop/agent-builder-console-main`)
as a Vue 3 + Node.js monorepo. Multiple agents will work on this in parallel —
read this file before starting any task and update the **Status** section when
work changes hands.

---

## 1. Repos at a glance

| Path | Role |
|------|------|
| `/Users/lotanna.okwuchukwu/Desktop/agent-builder-console-main` | **SOURCE** — React 18 + Supabase Edge Functions app. Read-only reference. |
| `/Users/lotanna.okwuchukwu/Desktop/agent-builder-vue` | **TARGET** — Vue 3 + Fastify monorepo. All new work happens here. |

Source paths in this plan that start with `src/`, `supabase/`, or `public/`
refer to the SOURCE repo. Target paths are always written absolute or relative
to `agent-builder-vue/`.

---

## 2. Target architecture

```
agent-builder-vue/
├── REBUILD_PLAN.md            # this file
├── package.json               # npm workspaces root
├── .env.example
└── packages/
    ├── shared/                # @agent-builder/shared — TS types only, no React
    │   ├── src/types/
    │   │   ├── freeAgent.ts
    │   │   ├── workflow.ts
    │   │   ├── systemPrompt.ts
    │   │   ├── secrets.ts
    │   │   ├── toolInstance.ts
    │   │   └── functions.ts   # LucideIcon replaced with iconName: string
    │   └── src/index.ts       # barrel
    ├── backend/               # Fastify 5 + TypeScript
    │   ├── src/index.ts       # server bootstrap, registers /api + /api/tools
    │   └── src/routes/
    │       ├── agents/        # SSE streaming LLM routes + free-agent
    │       └── tools/         # tool routes (search/scrape/db/comms/file)
    └── frontend/              # Vue 3 + Vite SPA
        ├── index.html
        ├── vite.config.ts     # proxies /api → http://localhost:3000
        ├── tailwind.config.ts
        ├── postcss.config.js
        ├── tsconfig.json
        └── src/
            ├── main.ts        # createApp + Pinia + Router + Vue Query
            ├── App.vue        # <RouterView /> + <Toaster />
            ├── index.css      # design tokens (light + dark)
            ├── router/
            ├── stores/        # Pinia
            ├── composables/   # use* — mirror existing hooks pattern
            ├── views/         # routed pages
            ├── components/
            │   ├── workflow/
            │   ├── freeAgent/
            │   ├── sidebar/
            │   ├── properties/
            │   ├── toolbar/
            │   ├── output/
            │   ├── layout/
            │   └── ui/        # shadcn-vue primitives
            ├── lib/           # framework-agnostic — copy from source as-is
            └── utils/         # framework-agnostic — copy from source as-is
```

---

## 3. Stack mapping (React → Vue)

| React (source)                | Vue (target)                          |
|-------------------------------|---------------------------------------|
| React 18 + JSX/TSX            | Vue 3 SFCs (`.vue`) + Composition API |
| React Router v6               | Vue Router 4                          |
| `useState` / `useReducer`     | Pinia stores                          |
| Custom `use*.ts` hooks        | Composables (`use*.ts`) — same pattern|
| `@tanstack/react-query`       | `@tanstack/vue-query`                 |
| ReactFlow 11 (`reactflow`)    | `@xyflow/vue`                         |
| shadcn/ui + `@radix-ui/*`     | `shadcn-vue` + `radix-vue`            |
| `lucide-react`                | `lucide-vue-next`                     |
| `next-themes`                 | `@vueuse/core` `useColorMode`         |
| `sonner`                      | `vue-sonner`                          |
| `@dnd-kit/*`                  | `vuedraggable@next`                   |
| `react-markdown`              | `vue-markdown-render`                 |
| `recharts`                    | `vue-chartjs` or ECharts (TBD)        |

| Supabase Edge Function        | Fastify route                         |
|-------------------------------|---------------------------------------|
| `free-agent`                  | `POST /api/free-agent`                |
| `run-agent` (Gemini)          | `POST /api/run-agent`                 |
| `run-agent-anthropic`         | `POST /api/run-agent/anthropic`       |
| `run-agent-xai`               | `POST /api/run-agent/xai`             |
| `run-nano`                    | `POST /api/run-nano`                  |
| `enhance-prompt`              | `POST /api/enhance-prompt`            |
| `brave-search` / `google-search` | `POST /api/tools/brave-search`, `/google-search` |
| `web-scrape`                  | `POST /api/tools/web-scrape`          |
| `api-call`                    | `POST /api/tools/api-call`            |
| `github-fetch`                | `POST /api/tools/github`              |
| `tool_pdf-handler`            | `POST /api/tools/pdf`                 |
| `tool_ocr-handler`            | `POST /api/tools/ocr`                 |
| `tool_zip-handler`            | `POST /api/tools/zip`                 |
| `tool_weather` / `time`       | `POST /api/tools/weather`, `/time`    |
| `external-db`                 | `POST /api/tools/db`                  |
| `send-email`                  | `POST /api/tools/email`               |
| `elevenlabs-tts` / `get-elevenlabs-voices` | `POST /api/tools/tts`, `GET /api/tools/tts/voices` |

---

## 4. Status (as of last update)

> **Update this section when finishing or starting a task** so other agents
> don't duplicate work. Use a `✅` / `🟡` / `⏳` marker and your agent ID/short note.

### Phase 1 — Monorepo scaffold & shared types ✅ DONE
- Root `package.json` with npm workspaces ✅
- `.env.example` documenting all required keys ✅
- `packages/shared/` — all 6 type files migrated, `functions.ts` uses
  `iconName: string` (no `lucide-react` dep) ✅

### Phase 2 — Node.js backend ✅ DONE
All Fastify routes ported. SSE format preserved as
`{ type: 'delta' | 'done' | 'error' | 'tools' }`.
- `src/index.ts` (server bootstrap, CORS, /health) ✅
- `src/routes/agents/` — `anthropic.ts`, `gemini.ts`, `xai.ts`,
  `freeAgent.ts`, `nano.ts`, `enhancePrompt.ts`, `sseHelper.ts`,
  `index.ts` ✅
- `src/routes/tools/` — `search.ts`, `scrape.ts`, `apiCall.ts`,
  `github.ts`, `email.ts`, `time.ts`, `weather.ts`, `tts.ts`,
  `db.ts`, `pdf.ts`, `ocr.ts`, `zip.ts`, `index.ts` ✅

### Phase 3 — Vue frontend foundation 🟡 IN PROGRESS
- ✅ `package.json`, `vite.config.ts`, `tsconfig.json`,
  `tailwind.config.ts`, `postcss.config.js`, `index.html`,
  `src/index.css` (design tokens)
- ✅ `src/main.ts`, `src/App.vue`, `src/router/index.ts`
- ✅ `src/stores/workflowStore.ts`
- 🟡 IN PROGRESS — claude-B (2026-05-22): `src/stores/freeAgentStore.ts`
- 🟡 IN PROGRESS — claude-B (2026-05-22): `src/stores/secretsStore.ts`
- 🟡 IN PROGRESS — claude-B (2026-05-22): `src/stores/promptStore.ts`
- 🟡 IN PROGRESS — claude-B (2026-05-22): `src/stores/toolInstanceStore.ts`
- 🟡 IN PROGRESS — claude-B (2026-05-22): `src/composables/useFreeAgentSession.ts`
- 🟡 IN PROGRESS — claude-B (2026-05-22): `src/composables/use-mobile.ts`, `use-toast.ts`, `useSecretsManager.ts`, `usePromptCustomization.ts`, `useToolInstances.ts`
- 🟡 IN PROGRESS — claude-B (2026-05-22): Copy `public/data/` JSON assets from source
- 🟡 IN PROGRESS — claude-B (2026-05-22): Copy framework-agnostic `src/lib/*` and `src/utils/*` from source
- ⏳ `src/views/WorkbenchView.vue`, `NotFoundView.vue`
- ⏳ `src/components/layout/AppLayout.vue`, `MobileNav.vue`

### Phase 4 — Workflow mode Vue components 🟡 IN PROGRESS
Port from `src/components/workflow/` (source):
- ⏳ `WorkflowCanvas.vue` (wraps `@xyflow/vue`)
- ⏳ `WorkflowCanvasMode.vue`
- ⏳ `SimpleView.vue`
- 🟡 IN PROGRESS — claude-C (2026-05-22): `Stage.vue`, `StageNode.vue`
- 🟡 IN PROGRESS — claude-C (2026-05-22): `AgentNode.vue`, `FunctionNode.vue`, `NoteNode.vue`
- 🟡 IN PROGRESS — claude-C (2026-05-22): `WorkflowNodeComponent.vue` (shared node-content renderer)
- 🟡 IN PROGRESS — claude-C (2026-05-22): Minimal ui primitives needed by the above (`ui/Card.vue`, `ui/Badge.vue`, `ui/Button.vue`) — built on plain Tailwind, no `radix-vue` dep required for these three. **Other agents: do not re-implement these three primitives, but feel free to add more shadcn-vue primitives alongside them.**
- ⏳ `Sidebar.vue` (from `src/components/sidebar/`)
- ⏳ `Toolbar.vue` (from `src/components/toolbar/`)
- ⏳ `PropertiesPanel.vue` (from `src/components/properties/`)
- ⏳ `OutputLog.vue` (from `src/components/output/`)
- ⏳ `AgentSelector.vue`, `FunctionSelector.vue`, `ExcelSelector.vue`

**claude-C scope note (2026-05-22):** I am only touching files under
`packages/frontend/src/components/workflow/` and
`packages/frontend/src/components/ui/` (three primitives listed above). I will
**not** touch `src/views/`, `src/router/`, `src/main.ts`, `src/App.vue`,
`src/stores/`, `src/composables/`, `src/lib/`, `src/utils/`, or any
`components/freeAgent/` files. Safe for other agents to work on any of those in
parallel.

### Phase 5 — Free Agent mode Vue components 🟡 IN PROGRESS
Port all 30 files from `src/components/freeAgent/`:
- Containers: `FreeAgentView.vue`, `FreeAgentPanel.vue`, `FreeAgentCanvas.vue` ⏳
- Viewers: `BlackboardViewer.vue`, `ArtifactsPanel.vue`, `RawViewer.vue`,
  `SystemPromptViewer.vue`, `SecretsMiniPanel.vue` ⏳
- Canvas nodes (🟡 IN PROGRESS — claude-D (2026-05-22)):
  `FreeAgentNode.vue`, `ChildAgentNode.vue`, `ScratchpadNode.vue`,
  `AttributeNode.vue`, `FileNode.vue`, `PromptNode.vue`, `PromptFileNode.vue`,
  `ArtifactNode.vue`, `ToolNode.vue`, `CategoryLabelNode.vue`
- Modals: `AssistanceModal.vue`, `FinalReportModal.vue`,
  `ChildAgentDetailModal.vue`, `ArtifactViewerModal.vue`,
  `AttributeViewerModal.vue`, `ScratchpadViewerModal.vue`,
  `ReflectModal.vue`, `InterjectModal.vue`, `EnhancePromptModal.vue`,
  `EnhancePromptSettingsModal.vue`, `SecretsManagerModal.vue` ⏳
- Tabs: `ToolInstancesTab.vue` ⏳

**claude-D scope note (2026-05-22):** I am only touching the 10 canvas-node
files under `packages/frontend/src/components/freeAgent/*Node.vue`. I will
**not** touch viewer/modal/container/tab files in that directory, nor any
file outside `components/freeAgent/`. My nodes import from
`@/components/ui/{card,badge,button}` (claude-C's slice) and
`@agent-builder/shared` — same paths claude-C uses, no file overlap.
Safe to port the other freeAgent files in parallel.

### Phase 6 — Integration & polish ⏳ PENDING
- Wire composables to backend (`VITE_BACKEND_URL` → Fastify)
- Dark mode via `@vueuse/core` `useColorMode`
- Final E2E verification (see §8)
- Migrate `src/components/help/` and `src/components/github/` if used

---

## 5. Multi-agent build-out protocol

### 5.1 Claiming work

1. **Pick a task** from the Status section that is `⏳ PENDING`.
2. **Mark it `🟡 IN PROGRESS`** with your agent label, e.g.
   `🟡 IN PROGRESS — claude-A (started 2026-05-22)` before writing any code.
3. **Mark it `✅ DONE`** when finished and committed.

If you find a `🟡 IN PROGRESS` item that looks abandoned, leave it alone unless
the user tells you to take over.

### 5.2 Safe parallelism

Tasks safe to do **simultaneously** (no file overlap):

- Different Pinia stores (each store is one file).
- Different component subtrees (a `workflow/AgentNode.vue` agent will not touch
  `freeAgent/BlackboardViewer.vue`).
- Different backend tool routes (already done — no overlap).
- Copying framework-agnostic files from source (`src/lib/*`, `src/utils/*`,
  `public/data/*`) into the target frontend.

Tasks that **must be sequential** (touch shared files):

- Anything that modifies `src/main.ts`, `src/App.vue`, `src/router/index.ts`,
  `src/views/WorkbenchView.vue`, or `package.json`.
- Adding new exports to `packages/shared/src/index.ts` (rare — types are
  already migrated).
- Adding new Fastify route groups to `packages/backend/src/index.ts`
  (already wired — only touch when adding a brand-new top-level route).

### 5.3 File conventions

| Concern | Rule |
|---------|------|
| Imports | Use `@/` alias for `packages/frontend/src/*`. Use `@agent-builder/shared` for cross-package types. Never reach into another package via a relative path. |
| Type-only imports | `import type { … } from '…'` — keep type imports separate so Vite tree-shakes cleanly. |
| Component style | SFC + `<script setup lang="ts">`. Composition API only. No Options API. |
| State | Component-local UI state → `ref`. Cross-component → Pinia store. Server cache → Vue Query. |
| Side effects | Composables (`use*.ts`) own all `fetch` calls, `localStorage`, abort controllers, refs that survive remounts. |
| Naming | Component files `PascalCase.vue`. Composables `useThing.ts`. Stores `useThingStore.ts`. Stores export the function as `useThingStore`. |
| Icons | `import { Zap } from 'lucide-vue-next'`. For dynamic `iconName: string` from `FunctionDefinition`, use `<component :is="iconMap[iconName]" />` with a small icon registry. |
| Toasts | `import { toast } from 'vue-sonner'`. Same call shape as `sonner`. |
| Tailwind | Use the design tokens already wired in `tailwind.config.ts` (`bg-background`, `text-foreground`, `border-border`, etc.). Do not add raw hex colors. |
| Dark mode | `class` strategy. Toggle by adding/removing `dark` on `<html>` via `useColorMode()`. |
| Backend URL | All `fetch` calls go to `import.meta.env.VITE_BACKEND_URL` (default `''`) so Vite's dev proxy picks them up. Never hardcode a URL or `localhost:3000`. |
| Errors | Throw on backend, return `{ ok: false, error }` JSON for tool routes. Frontend composables surface errors via `toast.error()`. |

### 5.4 Source-of-truth lookups

When porting a React component, **always read the source file first**:

```
/Users/lotanna.okwuchukwu/Desktop/agent-builder-console-main/src/components/<area>/<File>.tsx
```

Hooks → composables:
```
/Users/lotanna.okwuchukwu/Desktop/agent-builder-console-main/src/hooks/use*.ts
```

The hook API surface (return shape, function names) should be **preserved**
in the composable so the consuming component port is a near-mechanical
translation.

### 5.5 Framework-agnostic files — copy, don't rewrite

These files have **no React imports** and should be copied verbatim from
source to `packages/frontend/src/`:

- `src/lib/freeAgentToolExecutor.ts`
- `src/lib/functionExecutor.ts`
- `src/lib/functionDefinitions.ts` (verify no `lucide-react` import — if found,
  replace with string `iconName`)
- `src/lib/systemPromptBuilder.ts`
- `src/lib/loopDetector.ts`
- `src/lib/referenceResolver.ts`
- `src/lib/binaryToolUtils.ts`
- `src/lib/toolFallbacks.ts`
- `src/lib/safeRender.ts`
- `src/lib/utils.ts` (shadcn `cn` helper — keep, it's framework-agnostic)
- `src/utils/markdownProcessor.ts`
- `src/utils/sessionExporter.ts`
- `src/utils/fileTextExtraction.ts`
- `src/utils/parseExcel.ts`
- `public/data/systemPromptTemplate.json`
- `public/data/toolsManifest.json`
- `public/data/freeAgentInstructions.json`

After copying, update any `@/types/*` imports to `@agent-builder/shared` and
fix any `supabase` references to use `VITE_BACKEND_URL` instead.

---

## 6. Backend ↔ frontend contract

### 6.1 SSE event schema (LLM streaming)

All `/api/run-agent*` and `/api/enhance-prompt` routes emit Server-Sent Events
with this discriminated union:

```ts
type SseEvent =
  | { type: 'delta'; text: string }
  | { type: 'tools'; tools: ToolResult[] }       // emitted once before deltas
  | { type: 'done' }
  | { type: 'error'; error: string };
```

Frontend reads with a `ReadableStream` reader, splits on `\n\n`, strips the
`data: ` prefix, JSON-parses, and dispatches on `type`. The composable
pattern lives in `useRunAgent.ts` (Phase 4 task).

### 6.2 Free Agent endpoint (JSON, not SSE)

`POST /api/free-agent` is a **single request-response** per iteration. Body:

```ts
{
  userQuery: string;
  iteration: number;
  blackboard: BlackboardEntry[];
  scratchpad: string;
  artifacts: FreeAgentArtifact[];
  toolResultAttributes: Record<string, ToolResultAttribute>;
  previousToolCalls: ToolCall[];
  promptData: PromptDataPayload;
  toolsManifest: ToolsManifest;
  files?: SessionFile[];
  secretOverrides?: SecretOverrides;
  configuredSecretParams?: Array<{ tool: string; param: string }>;
  model?: string;
}
```

Returns:

```ts
{
  success: boolean;
  iteration: number;
  response: AgentResponse;       // { thoughts, toolCalls, blackboardEntries, … }
  toolResults: ToolResult[];
  frontendHandlers: FrontendHandler[];  // canvas updates the composable applies
  status: 'continue' | 'done' | 'assistance' | 'error';
  debug: { systemPrompt: string; userPrompt: string; rawResponse: string };
}
```

The composable `useFreeAgentSession` loops over this endpoint, applying
`frontendHandlers` to local refs between iterations.

### 6.3 Tool routes

All under `/api/tools/`. Body shape is per-route; see each `packages/backend/src/routes/tools/*.ts` for the param schema. Internal tool calls from
`/api/free-agent` use the same routes via `http://localhost:${PORT}/api/tools/<name>`.

---

## 7. Local development

```sh
# from agent-builder-vue/
npm install            # installs all workspaces
npm run dev            # concurrently runs backend (3000) + frontend (5173)

# or per workspace
npm run dev:backend    # Fastify, watches with tsx
npm run dev:frontend   # Vite dev server, proxies /api → :3000
```

Environment: copy `.env.example` to `.env` at the repo root and fill in
`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, etc. Backend reads from
`process.env`; frontend reads `VITE_*` keys via `import.meta.env`.

> **Note:** If `npm` isn't on PATH in the sandbox, install via
> `nvm`/`fnm`/Homebrew first. All `package.json` files are standard npm
> workspaces and work with `npm`, `pnpm`, or `bun`.

---

## 8. Verification checklist (Phase 6 exit gate)

1. `curl -X POST http://localhost:3000/api/run-agent/anthropic -d '{…}'`
   returns an SSE stream beginning `data: {"type":"delta",…}`.
2. `npm run dev` boots both servers with no console errors.
3. Workflow Mode E2E: add Agent → connect to Function → enter input → Run →
   stream renders in OutputLog.
4. Free Agent Mode E2E: prompt → Start → iterations advance, blackboard
   updates, canvas reflects state, Stop halts cleanly.
5. Tool execution: free agent calling `brave_search` produces an attribute
   node on canvas.
6. Dark mode toggle flips the full UI.
7. `npm run build` in each workspace succeeds.

---

## 9. Known risks

- **`Index.tsx` (3,191 lines)** is the largest single porting task. Decompose
  into `WorkbenchView.vue` + the five Pinia stores. Do **not** keep it as
  one component.
- **`@xyflow/vue` vs ReactFlow 11** — APIs are very close but custom node
  registration uses a slightly different `nodeTypes` prop shape. Validate
  with a single AgentNode before porting all node types.
- **shadcn-vue coverage gap** — ~40 components vs shadcn/ui's 49. For any
  missing component, build directly on `radix-vue` primitives (same as
  shadcn does internally).
- **SSE through Vite proxy** — confirm Vite's dev proxy passes
  `text/event-stream` without buffering. If buffering occurs in dev, set
  `server.proxy['/api'].configure` to disable buffering.
- **PDF.js worker** — needs explicit `workerSrc` setup with Vite; use
  `?url` suffix import for the worker.
