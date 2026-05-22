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
| ReactFlow 11 (`reactflow`)    | `@vue-flow/core`                         |
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

> **2026-05-22 integration audit:** Four parallel agents converged into this
> tree (`claude-c/phase-4-workflow-nodes` branch + worktrees
> `confident-fermat-bfddd6`, `festive-elbakyan-24d55b`,
> `competent-poincare-1486f3`). Unique contributions from each have been
> pulled in: `confident-fermat` → 3 new icons in `iconRegistry.ts`, `docx`
> frontend dep, `src/types/appMode.ts`; `festive-elbakyan` → `migrations/`,
> `scripts/`, `data/`, `packages/backend/src/lib/pii.{ts,test.ts}`, env +
> root + backend `package.json` deltas; `competent-poincare` → 5 markdown
> files under `analysis/`. `confident-fermat`'s overlapping `lib/`, `utils/`,
> `views/`, `layout/`, and `freeAgent/*Node.vue` ports were *superseded* by
> the more complete versions already in this tree from `claude-B`/`claude-D` —
> that worktree can be archived. Static import-graph check: all `@/*` and
> `@agent-builder/shared` imports resolve.

### Phase 0 — AI Garage exercise: analysis docs ✅ DONE — claude-E (2026-05-22)
Non-overlapping; all files live in top-level `analysis/`:
- `analysis/architecture.md` — from→to architecture, monorepo vs SOA decision
- `analysis/features.md` — endpoint/screen/feature/dependency inventory
- `analysis/vulnerabilities.md` — vulnerability + improvement scan
- `analysis/migration_plan.md` — granular ported-from-where checklist
- `analysis/privacy_controls.md` — Protected B controls, EntraID, PII regex plan

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

### Phase 3 — Vue frontend foundation ✅ DONE (all foundation files present)
- ✅ `package.json`, `vite.config.ts`, `tsconfig.json`,
  `tailwind.config.ts`, `postcss.config.js`, `index.html`,
  `src/index.css` (design tokens)
- ✅ `src/main.ts`, `src/App.vue`, `src/router/index.ts`
- ✅ `src/stores/workflowStore.ts`
- ✅ `src/stores/freeAgentStore.ts` — claude-B (2026-05-22)
- ✅ `src/stores/secretsStore.ts` — claude-B (2026-05-22)
- ✅ `src/stores/promptStore.ts` — claude-B (2026-05-22)
- ✅ `src/stores/toolInstanceStore.ts` — claude-B (2026-05-22)
- ✅ `src/composables/useFreeAgentSession.ts` — claude-B (thin wrapper over freeAgentStore)
- ✅ `src/composables/useWorkflowRunner.ts` — claude-B (2026-05-22): SSE streaming execution composable. Owns `runSingleAgent`, `runSingleFunction`, `runStage`, `runWorkflow`, `runDownstream`, `runAgentBeastMode`, `executeAgentOnce`. Model routing: `claude-*` → `/api/run-agent/anthropic`, `grok-*` → `/api/run-agent/xai`, else `/api/run-agent`.
- ✅ `src/composables/use-mobile.ts`, `use-toast.ts`, `useSecretsManager.ts`, `usePromptCustomization.ts`, `useToolInstances.ts` — claude-B
- ✅ `public/data/` JSON assets copied (systemPromptTemplate, toolsManifest, freeAgentInstructions)
- ✅ `src/lib/*` and `src/utils/*` framework-agnostic files copied & fixed (supabase→fetch, lucide-react→iconName)
- ✅ DONE — claude-B (2026-05-22): `src/views/WorkbenchView.vue` — full orchestration view. Imports all layout/canvas/panel components. Save/load/clear handlers built in. Uses `useWorkflowRunner` composable for SSE execution. Placeholder stubs for pending components (Toolbar, Sidebar, PropertiesPanel, OutputLog, FreeAgentView, WorkflowCanvasMode) — replace each stub with the real implementation as other agents complete those files.
- ✅ DONE — claude-C (2026-05-22): `src/views/NotFoundView.vue`
- ✅ DONE — claude-C (2026-05-22): `src/components/layout/AppLayout.vue`, `MobileNav.vue` (MobileNav is the lean variant — `DropdownMenu` / `AlertDialog` swapped for plain Buttons + hidden file input + an inline modal-free confirm. Swap in `shadcn-vue` `DropdownMenu` / `AlertDialog` when those primitives land.)

### Phase 4 — Workflow mode Vue components 🟡 IN PROGRESS
Port from `src/components/workflow/` (source):
- ✅ DONE — claude-C (2026-05-22): `WorkflowCanvas.vue` — **stacked-view canvas** (SVG arrows between port DOM IDs, identical to the React source's approach). Despite the file name it does **not** wrap `@vue-flow/core` — the source `WorkflowCanvas.tsx` is the stacked view, not the canvas-mode renderer. The eventual `@vue-flow/core` integration lives in `WorkflowCanvasMode.vue`. **TODO for whoever finalises this file: add `@drop` / `@dragover` handler on the canvas container to call `store.addNode(stageId, JSON.parse(e.dataTransfer.getData('agentTemplate')), e.dataTransfer.getData('nodeType'))` — Sidebar now sends this data on drag-start.**
- 🟡 IN PROGRESS — claude-C (2026-05-22): `WorkflowCanvasMode.vue` — `@vue-flow/core` canvas wiring. Adapter SFCs added under `components/workflow/canvas/` to bridge the @vue-flow `NodeProps` shape (props.data) to my existing nodes' direct-prop API.
- ✅ DONE — claude-C (2026-05-22): `SimpleView.vue` — folder/file-style flat view with per-stage / per-node downloads (JSZip). Shadcn primitives (ScrollArea, Dialog, Tabs, Accordion) and `vue-markdown-render` are **deferred** — replaced with plain `overflow-auto` divs, a fixed-overlay modal, button-tab switcher, and `<pre>` rendering. Swap in real primitives once they land in `components/ui/`.
- ✅ DONE — claude-C (2026-05-22): `Stage.vue`, `StageNode.vue`
- ✅ DONE — claude-C (2026-05-22): `AgentNode.vue`, `FunctionNode.vue`, `NoteNode.vue`
- ✅ DONE — claude-C (2026-05-22): `WorkflowNodeComponent.vue` (shared node-content renderer; uses `@vue-flow/core` `Handle`/`Position`)
- ✅ DONE — claude-C (2026-05-22): `iconRegistry.ts` (string-name → `LucideIcon` lookup used by `FunctionNode`)
- ✅ DONE — claude-C (2026-05-22): ui primitives `ui/Card.vue`, `ui/Badge.vue`, `ui/Button.vue`, `ui/Input.vue`, `ui/CardHeader.vue`, `ui/CardTitle.vue`, `ui/CardContent.vue` — plain Tailwind, no `radix-vue` dep. **Other agents: do not re-implement these primitives, but feel free to add more shadcn-vue primitives alongside them.**
- ✅ DONE — claude-B (2026-05-22): `Sidebar.vue` — full port. Workflow name, prompt textarea + file upload (extractTextFromFile/parseExcelFile), model select, response length, thinking toggle (Gemini Flash/Lite only), agent library with drag-and-drop + custom agent add/edit/delete/download/import, functions library with search + category filter. Shadcn primitives deferred — plain `<select>`, `<textarea>`, inline modals. ExcelSelector placeholder inline (real component pending). Icon rendering via `iconFor()` from `iconRegistry.ts`.
- ✅ DONE — claude-B (2026-05-22): `Toolbar.vue` — full port. Desktop-only header (`hidden lg:flex`). Logo, mode toggle (Workflow/Free Agent), workflow actions (Add Stage, view-mode dropdown, Load, Save, Clear, Help, Run Workflow, Clear Outputs). Inline dropdown for view mode. Inline confirmation modal for Clear Outputs. Compact mode at <1400px (icon-only mode toggle).
- ✅ DONE — claude-B (2026-05-22): `PropertiesPanel.vue` — full port. Name field, Lock/ExecuteOnNull toggles, running banner, computed-input preview (resolved from workflow connections), agent fields (systemPrompt, userPrompt, per-agent model override with model/responseLength/thinking, tools list, output), function fields (content upload, schema-driven config, output/outputs). Content function has file upload + view/edit modal. Schema types: boolean→checkbox, number→number input, bearerToken→password toggle, default→text.
- ✅ DONE — claude-D (2026-05-22): `OutputLog.vue` — full collapsible card with lucide icons + entry-count chip; replaced claude-B's minimal stub
- ✅ DONE — claude-D (2026-05-22): `AgentSelector.vue`, `FunctionSelector.vue`
  (placed under `components/workflow/`; both use the inline fixed-overlay
  backdrop, expose `v-model:open`, emit `@select-agent` / `@select-function`)
- ✅ DONE — claude-D (2026-05-22): `ExcelSelector.vue` (placed under `components/workflow/`; full sheet tabs, contains/does-not-contain filters, header-row picker, multi-sheet selection; emits `@close` and `@select`)

**claude-C scope note (2026-05-22, ✅ slice complete):** Workflow node slice is done.
I authored `Card.vue`, `Badge.vue`, `Button.vue`, all 6 workflow `.vue` files,
and `iconRegistry.ts`. The other `ui/*.vue` primitives in the directory
listing were added by another agent in parallel — I left them alone except
for swapping `Stage.vue`'s `<Input>` for a styled `<input>` to make the
file compile when the draft was found mid-edit.

Notes for whoever wires `WorkflowCanvas.vue` / `WorkflowCanvasMode.vue` next:

- All workflow node Vue components use a **plain-props + events** API (not the
  ReactFlow-style `data: {...}` wrapper). Pass props directly and listen on
  `@select`, `@delete`, `@toggle-minimize`, `@toggle-lock`, `@port-click`,
  `@run`, `@drag-start`.
- `FunctionNode.vue` takes an optional
  `functionDef: FunctionDefinition | null` prop — the host looks it up via
  `getFunctionById` from `@/lib/functionDefinitions` once claude-B finishes
  copying that file. `iconRegistry.ts` already maps the lucide icon names
  used by the function definitions.
- `NoteNode.vue` intentionally **omits** the `NodeResizer`. Wrap it in
  `@vue-flow/core`'s `NodeResizer` from inside `WorkflowCanvas.vue` and forward
  the resize result via the `update` event.
- `Stage.vue` emits `request-add-agent` / `request-add-function` for the
  mobile-only inline add buttons — wire those to `AgentSelector.vue` /
  `FunctionSelector.vue` modals at the host-view level.
- `WorkflowNodeComponent.vue` is the **canvas-mode** node renderer (uses
  `Handle`/`Position` from `@vue-flow/core`); `AgentNode.vue` and `FunctionNode.vue`
  are the **stacked-view** renderers (HTML-positioned port divs). Both are kept
  because the two view modes have distinct port-handling requirements (the
  README's risk note about validating one node type with `@vue-flow/core` is
  worth a quick smoke test on `WorkflowNodeComponent` when wiring the canvas).

### Phase 5 — Free Agent mode Vue components 🟡 IN PROGRESS
Port all 30 files from `src/components/freeAgent/`:
- Containers: `FreeAgentView.vue`, `FreeAgentPanel.vue`, `FreeAgentCanvas.vue` 🟡 IN PROGRESS — claude-B (2026-05-22)
- Viewers (✅ DONE — claude-D (2026-05-22)):
  `BlackboardViewer.vue`, `ArtifactsPanel.vue`, `RawViewer.vue`,
  `SecretsMiniPanel.vue`. `SystemPromptViewer.vue` (1525 lines) ⏳ still
  deferred — open for another agent.
- Canvas nodes (✅ DONE — claude-D (2026-05-22)):
  `FreeAgentNode.vue`, `ChildAgentNode.vue`, `ScratchpadNode.vue`,
  `AttributeNode.vue`, `FileNode.vue`, `PromptNode.vue`, `PromptFileNode.vue`,
  `ArtifactNode.vue`, `ToolNode.vue`, `CategoryLabelNode.vue`
- Modals:
  - ✅ DONE — claude-D (2026-05-22): `ScratchpadViewerModal.vue`,
    `InterjectModal.vue`, `AssistanceModal.vue`, `AttributeViewerModal.vue`,
    `ArtifactViewerModal.vue` (5 smaller modals; closes loop on
    `open-viewer` events from `AttributeNode` / `ScratchpadNode`)
  - ✅ DONE — claude-D (2026-05-22): `EnhancePromptSettingsModal.vue` — also extracted
    `DEFAULT_ENHANCEMENT_PROMPT` + `getStoredEnhancementPrompt()` + `setStoredEnhancementPrompt()`
    into `@/lib/enhancePromptStorage.ts` so the future `EnhancePromptModal.vue` can share them
    without a circular import.
  - ✅ DONE — claude-D (2026-05-22): `ReflectModal.vue` — SSE-streamed
    post-session analysis. Mirrors `useWorkflowRunner`'s endpoint routing
    (`claude-*` → `/api/run-agent/anthropic`, `grok-*` → `/api/run-agent/xai`,
    else `/api/run-agent`). Auto-streams on `open`, aborts on close/unmount.
    Markdown rendered as `whitespace-pre-wrap` until `vue-markdown-render`
    lands. Also fixed `AttributeViewerModal.vue:118` — Vue template parser
    was choking on `{{ \`{{${...}}}\` }}` (the `}}` inside the template
    literal closed the interpolation early); replaced with `&#123;&#123;…&#125;&#125;`,
    matching the same fix already applied to `AttributeNode.vue:107`.
  - 🟡 IN PROGRESS — claude-festive-elbakyan (2026-05-22): `ChildAgentDetailModal.vue`, `EnhancePromptModal.vue`, `SecretsManagerModal.vue` — the 3 largest remaining modals. Same `v-model:open` + fixed-overlay backdrop pattern as the existing modals.
- Tabs: ✅ DONE — claude-D (2026-05-22): `ToolInstancesTab.vue` — reads `useToolInstances()` directly, 3 inline modals (add, edit, delete-confirm), accesses through `.config.instances` to dodge the reactivity-snapshot issue [stores/toolInstanceStore.ts:112-124](packages/frontend/src/stores/toolInstanceStore.ts)

**claude-D scope note (2026-05-22, ✅ slice complete):** All 10 canvas-node
files under `packages/frontend/src/components/freeAgent/*Node.vue` have been
ported. Notes for follow-up agents:

- Modal/viewer dependencies were **not** inlined. `AttributeNode.vue` and
  `ScratchpadNode.vue` emit `open-viewer` events rather than rendering their
  modals directly — the parent (`FreeAgentCanvas.vue`) is expected to listen
  and render `AttributeViewerModal.vue` / `ScratchpadViewerModal.vue` itself.
- Markdown rendering (`PromptNode`, `ScratchpadNode`) was deferred — content
  is rendered as `whitespace-pre-wrap` plain text. Swap in `vue-markdown-render`
  once it's added to `frontend/package.json`.
- `ScrollArea` was replaced with a plain `overflow-auto` div; revisit when
  the shadcn-vue ScrollArea primitive lands in `components/ui/`.
- All nodes import `cn` from `@/lib/utils` and `FreeAgentNodeData` from
  `@agent-builder/shared` (already in shared types).
- `lucide-vue-next` icons used: see each node's `<script setup>` imports.

**claude-D viewer slice (2026-05-22, ✅ slice complete):** 4 viewer panels
ported. Notes for follow-up:

- `RawViewer.vue` inlines a minimal three-button tab control rather than
  pulling in a shadcn-vue `Tabs` primitive. Swap to a real Tabs primitive
  when one lands.
- `RawViewer.vue` also inlines the copy tooltip as a native `title=` attribute
  (no `Tooltip` primitive used).
- `SecretsMiniPanel.vue` reads its data from `useSecretsManager()` directly
  (the `secretsStore`) instead of taking `SecretsManager` as a prop. It emits
  `open-modal` for the parent to render `SecretsManagerModal.vue`. **Note:**
  it accesses `secretsManager.config.secrets/.mappings/.headerMappings`
  rather than the top-level `secrets/mappings/headerMappings` properties,
  because those are returned as static snapshots in
  `stores/secretsStore.ts:264-266`. Worth fixing in the store later — return
  computed refs so consumers can use the natural names.
- `ArtifactsPanel.vue` renders text artifacts as `whitespace-pre-wrap` plain
  text (no markdown yet — same deferral as the node slice).
- All four viewers consume only the shadcn-vue primitives that already
  exist in `components/ui/` (Card/Header/Title/Content, Button, Badge) — no
  new ui primitives required.

**claude-D modal slice (2026-05-22, ✅ slice complete):** 5 smaller modals
ported using the same fixed-overlay backdrop pattern claude-C used in
`SimpleView.vue` (no shadcn-vue `Dialog` primitive used). Notes:

- All five expose a `v-model:open` API: parent passes `:open` and listens
  on `@update:open`. Behavioural events:
  - `InterjectModal`: `@submit (message: string)`
  - `AssistanceModal`: `@respond ({ response?, fileId?, selectedChoice? })`
  - The three viewer modals are display-only (no extra events).
- `AttributeViewerModal` and `ScratchpadViewerModal` use the same inlined
  3-button tab pattern as `RawViewer.vue`. Swap to a real Tabs primitive
  when one lands.
- Markdown still deferred — text content renders as `whitespace-pre-wrap`.
- `AssistanceModal` replaces shadcn-vue `RadioGroup` with native
  `<input type="radio">` styled with `accent-primary`. Swap to a real
  RadioGroup primitive when it lands.
- Wire-up: `FreeAgentCanvas.vue` should mount the viewer modals once and
  toggle them in response to the `open-viewer` events from `AttributeNode`
  / `ScratchpadNode`. The Assistance/Interject modals are typically owned
  by `FreeAgentView.vue` (orchestration scope).

**claude-D selector slice (2026-05-22, ✅ slice complete):** Both pickers
under `components/workflow/`. Notes for follow-up:

- API: `v-model:open` + `@select-agent (template)` / `@select-function (def)`.
- `Stage.vue` already emits `request-add-agent` / `request-add-function` —
  wire those to mount these selectors at `WorkbenchView` / `WorkflowCanvas` /
  `WorkflowCanvasMode` scope and forward the selection into
  `useWorkflowStore().addNode(stageId, template, 'agent' | 'function')`.
- `AgentSelector` exports a re-usable `AgentTemplate` interface — import
  from `@/components/workflow/AgentSelector` for typing custom agents.
- `FunctionSelector` reads `functionDefinitions` from `@/lib/functionDefinitions`
  and resolves icons via `iconFor()` from `@/components/workflow/iconRegistry`.
  No `lucide-react` reference remains.
- Both use the same inline fixed-overlay backdrop pattern; swap to a real
  shadcn-vue `Dialog` primitive when one lands.

### Phase 6 — Integration & polish 🟡 IN PROGRESS
- ✅ All composables already target `VITE_BACKEND_URL` via Vite proxy
- ✅ Dark mode wired via `@vueuse/core` `useColorMode` in `AppLayout.vue`
- ✅ DONE — claude-integrator (2026-05-22): Rewrote 9 stale `${VITE_SUPABASE_URL}/functions/v1/<name>` calls in `packages/frontend/src/lib/functionExecutor.ts` to `${VITE_BACKEND_URL ?? ''}/api/<...>` per the route map. Endpoints fixed: `run-nano`, `tts` (was `elevenlabs-tts`), `google-search`, `brave-search`, `web-scrape`, `api-call`, `email` (was `send-email`), `github` (was `github-fetch`), `pronghorn` (was `pronghorn-post`). Unblocks the workflow execution path — those tools were unreachable from the Vue frontend.
- ⏳ Replace stubs: `PropertiesPanel.vue`, `WorkflowCanvasMode.vue`,
  `FreeAgentView.vue`, `FreeAgentPanel.vue`, `FreeAgentCanvas.vue`
- ✅ DONE — claude-D (2026-05-22): `OutputLog.vue` (real impl replaces claude-B's stub)
- ✅ DONE — claude-D (2026-05-22): `AgentSelector.vue`, `FunctionSelector.vue`, `ExcelSelector.vue`
- ✅ DONE — claude-D (2026-05-22): `EnhancePromptSettingsModal.vue`, `ToolInstancesTab.vue`
- ✅ DONE — claude-integrator (2026-05-22): `FinalReportModal.vue` — port of the 242-line source. Same `v-model:open` + fixed-overlay pattern as the modal slice. Emits `@reset` for the "Start New Task" button. `Download` hits `exportSessionToZip()` from `@/utils/sessionExporter`. Inline border-`div`s replace shadcn `Separator`; markdown still deferred (summary renders as `whitespace-pre-wrap`).
- ⏳ Remaining 4 modals (ChildAgentDetail, Reflect, EnhancePrompt, SecretsManager)
- ⏳ `SystemPromptViewer.vue` (~1525 lines)
- ✅ DONE — claude-D (2026-05-22): Backend `POST /api/tools/pronghorn` route (registered in `routes/tools/index.ts`, mirrors Supabase edge function: validates `projectId`/`token`/`items`, proxies to Pronghorn `ingest-artifacts`, maps per-item failures to HTTP 422)
- ⏳ Final E2E verification (see §8)
- ⏳ `npm install` + `vue-tsc --noEmit` once node is available
- ⏳ Migrate `src/components/help/` and `src/components/github/` if used

### Phase 7 — AI Garage analysis & compliance layer 🟡 IN PROGRESS — claude-festive-elbakyan (2026-05-22)

Non-component deliverables for the AI Garage exercise: analysis tables in the
shared Postgres, PII guardrails. **Independent** of Phases 3–6 — does not
touch any file under `packages/frontend/src/components/`,
`packages/frontend/src/stores/`, `packages/frontend/src/composables/`, or
`packages/backend/src/routes/`.

- ✅ `migrations/0001_analysis_tables.sql` — additive, idempotent, `__SCHEMA__`-substituted
- ✅ `scripts/migrate.mjs` — runs SQL files against shared Postgres
- ✅ `scripts/seed.mjs` — populates analysis tables from `data/seed/*.csv`
- ✅ `data/seed/` — seed CSVs
- ✅ `packages/backend/src/lib/pii.ts` + `pii.test.ts` — regex PII detector (not yet wired in)
- ✅ `.env.example` — adds `SHARED_DATABASE_URL`, `SCHEMA_NAME`
- ✅ Root `package.json` — `db:migrate`, `db:seed` scripts
- ✅ `packages/backend/package.json` — adds `pg` (fixes pre-existing dynamic import in `routes/tools/db.ts`) + `@types/pg`
- ✅ DONE — claude-C (2026-05-22): Wire `pii.ts` into agent routes as a pre-flight check before LLM egress. Adds `packages/backend/src/lib/piiGuard.ts` (`runPiiGuard`, `scanFields`, `redactForUpstream`, `getGuardMode`) + `piiGuard.test.ts` (16 cases, runs via `node --import tsx`). Integrated into all 6 agent routes (`anthropic.ts`, `gemini.ts`, `xai.ts`, `nano.ts`, `enhancePrompt.ts`, `freeAgent.ts`). Modes via `PII_GUARD_MODE` env (documented in `.env.example`): `block` (default — HTTP 400 / SSE error before egress on any secret or high-confidence hit), `warn` (audit only, still calls LLM), `off`. Live smoke-tested: clean prompts pass through; leaked Anthropic key + valid SIN both blocked with `piiGuard.findings` body; `warn` mode emits structured `{"audit":"pii_guard",...}` line to stderr without blocking. Audit lines carry kinds/confidences/offsets only — never the matched raw value. **Follow-ups left for another agent:** (a) persist audit lines to an `audit_log` table in the `lotanna_okwuchukwu` schema so they survive process restart; (b) gate tool-route inputs (e.g. `send-email`, `db`) on the same guard; (c) wire the audit line into the frontend so the user sees *why* the request was blocked (currently just shows the generic message).

Schema name is variable-driven via `SCHEMA_NAME` env (default
`lotanna_okwuchukwu`). Migrations are rerunnable (`CREATE … IF NOT EXISTS`).

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
- **`@vue-flow/core` vs ReactFlow 11** — APIs are very close but custom node
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
