<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Play,
  Trash2,
  Copy,
  BookmarkPlus,
  ChevronsRight,
  Lock,
  Unlock,
  Database,
  Bot,
  Upload,
  Eye,
  X,
  Loader2,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { Workflow, WorkflowNode, AgentNode, FunctionNode } from '@agent-builder/shared';
import { getFunctionById } from '@/lib/functionDefinitions';
import { extractTextFromFile, formatExtractedContent } from '@/utils/fileTextExtraction';
import type { ExtractedContent } from '@/utils/fileTextExtraction';
import { parseExcelFile } from '@/utils/parseExcel';
import type { ExcelData } from '@/utils/parseExcel';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{
  selectedNode?: WorkflowNode | null;
  workflow: Workflow;
}>();

const emit = defineEmits<{
  'update-agent': [nodeId: string, updates: Partial<AgentNode>];
  'update-node': [nodeId: string, updates: Partial<WorkflowNode>];
  'add-tool-instance': [nodeId: string, toolId: string];
  'remove-tool-instance': [nodeId: string, toolInstanceId: string];
  'deselect-agent': [];
  'run-agent': [nodeId: string];
  'run-function': [nodeId: string];
  'run-downstream': [nodeId: string];
  'clone-node': [nodeId: string];
  'add-to-library': [agent: AgentNode];
}>();

const contentFileInputRef = ref<HTMLInputElement | null>(null);
const isProcessingFiles = ref(false);
const excelData = ref<ExcelData | null>(null);
const isViewContentOpen = ref(false);
const editedContent = ref('');
const showBearerToken = ref(false);

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  { id: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast Reasoning' },
  { id: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast' },
  { id: 'grok-code-fast-1', label: 'Grok Code Fast 1' },
];

const RESPONSE_LENGTHS = [
  { value: 2048, label: 'Short (2,048 tokens)' },
  { value: 8192, label: 'Medium (8,192 tokens)' },
  { value: 16384, label: 'Large (16,384 tokens)' },
  { value: 32768, label: 'XL (32,768 tokens)' },
];

const node = computed(() => props.selectedNode ?? null);
const isAgent = computed(() => node.value?.nodeType === 'agent');
const isFunction = computed(() => node.value?.nodeType === 'function');
const agent = computed<AgentNode | null>(() => (isAgent.value ? (node.value as AgentNode) : null));
const fn = computed<FunctionNode | null>(() => (isFunction.value ? (node.value as FunctionNode) : null));
const functionDef = computed(() => fn.value ? getFunctionById(fn.value.functionType) : null);

const computedInput = computed<string>(() => {
  if (!node.value) return '';
  const incoming = props.workflow.connections.filter(
    (c: any) => (c.toNodeId ?? c.to) === node.value!.id
  );
  if (incoming.length === 0) return '';
  const parts: string[] = [];
  for (const conn of incoming) {
    const fromId = (conn as any).fromNodeId ?? (conn as any).from;
    let src: WorkflowNode | undefined;
    for (const stage of props.workflow.stages) {
      src = stage.nodes.find((n: WorkflowNode) => n.id === fromId);
      if (src) break;
    }
    if (!src) continue;
    if (src.nodeType === 'function') {
      const portKey = conn.fromOutputPort;
      const fnSrc = src as FunctionNode;
      const val = portKey ? (fnSrc.outputs?.[portKey] ?? '') : (Object.values(fnSrc.outputs ?? {})[0] ?? '');
      if (val) parts.push(val);
    } else {
      const out = (src as AgentNode).output ?? '';
      if (out) parts.push(out);
    }
  }
  return parts.join('\n\n---\n\n');
});

const isThinkingSupported = computed(() => {
  const m = agent.value?.model ?? '';
  return (
    m !== 'gemini-3-pro-preview' &&
    !m.startsWith('claude-') &&
    !m.startsWith('grok-')
  );
});

function updateAgent(updates: Partial<AgentNode>) {
  if (!agent.value) return;
  emit('update-agent', agent.value.id, updates);
}

function updateNode(updates: Partial<WorkflowNode>) {
  if (!node.value) return;
  emit('update-node', node.value.id, updates);
}

function updateFnConfig(config: Record<string, unknown>) {
  if (!fn.value) return;
  emit('update-node', fn.value.id, { config } as Partial<FunctionNode>);
}

function runSelected() {
  if (!node.value) return;
  if (isAgent.value) emit('run-agent', node.value.id);
  else if (isFunction.value) emit('run-function', node.value.id);
}

async function handleContentFileUpload(e: Event) {
  if (!fn.value) return;
  const files = (e.target as HTMLInputElement).files;
  if (!files?.length) return;
  isProcessingFiles.value = true;
  const extracted: ExtractedContent[] = [];
  for (const file of Array.from(files)) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'xlsx' || ext === 'xls') {
      try {
        excelData.value = await parseExcelFile(file);
      } catch {
        toast.error(`Failed to parse ${file.name}`);
      }
      continue;
    }
    try {
      const result = await extractTextFromFile(file);
      extracted.push(result);
      toast.success(`Extracted text from ${file.name}`);
    } catch (err: any) {
      toast.error(err?.message ?? `Failed to extract ${file.name}`);
    }
  }
  if (extracted.length > 0) {
    const formatted = formatExtractedContent(extracted);
    const current = (fn.value.config?.content as string) ?? '';
    updateFnConfig({ ...fn.value.config, content: current ? `${current}${formatted}` : formatted.trim() });
  }
  isProcessingFiles.value = false;
  (e.target as HTMLInputElement).value = '';
}

function handleViewContent() {
  editedContent.value = (fn.value?.config?.content as string) ?? '';
  isViewContentOpen.value = true;
}

function handleSaveContent() {
  if (!fn.value) return;
  updateFnConfig({ ...fn.value.config, content: editedContent.value });
  isViewContentOpen.value = false;
  toast.success('Content updated');
}

function handleClearContent() {
  if (!fn.value) return;
  updateFnConfig({ ...fn.value.config, content: '' });
  toast.success('Content cleared');
}

function configValue(key: string | number): unknown {
  const k = String(key);
  return (fn.value?.config as Record<string, unknown>)?.[k] ?? functionDef.value?.configSchema?.[k]?.default ?? '';
}

function setConfigValue(key: string | number, value: unknown) {
  if (!fn.value) return;
  const k = String(key);
  updateFnConfig({ ...(fn.value.config as Record<string, unknown>), [k]: value });
}

function maxResponseLength(model: string | undefined): number {
  if (model === 'claude-opus-4-5') return 32000;
  if (model?.startsWith('claude-')) return 64000;
  return 65535;
}
</script>

<template>
  <aside class="h-full flex flex-col bg-card">
    <!-- Header -->
    <div class="p-4 border-b border-border">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-foreground">
          <template v-if="isAgent">Agent Properties</template>
          <template v-else-if="isFunction">Function Properties</template>
          <template v-else>Properties</template>
        </h3>
        <Button
          v-if="node"
          variant="ghost"
          size="sm"
          class="h-7 w-7 p-0"
          title="Deselect"
          @click="emit('deselect-agent')"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div v-if="node" class="flex gap-2 mt-3">
        <Button class="flex-1 gap-2" size="sm" @click="runSelected">
          <Play class="h-3.5 w-3.5" />
          {{ isAgent ? 'Run Agent' : 'Run Function' }}
        </Button>
        <Button variant="outline" size="sm" class="h-8 w-8 p-0" title="Run downstream" @click="emit('run-downstream', node.id)">
          <ChevronsRight class="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" class="h-8 w-8 p-0" title="Clone node" @click="emit('clone-node', node.id)">
          <Copy class="h-4 w-4" />
        </Button>
        <Button
          v-if="isAgent && agent"
          variant="outline"
          size="sm"
          class="h-8 w-8 p-0"
          title="Save to library"
          @click="emit('add-to-library', agent)"
        >
          <BookmarkPlus class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <!-- Running banner -->
    <div
      v-if="node?.status === 'running'"
      class="bg-yellow-500/20 border-b border-yellow-500/40 px-4 py-2 flex items-center gap-2"
    >
      <Loader2 class="h-4 w-4 text-yellow-600 animate-spin" />
      <span class="text-xs font-medium text-yellow-700 dark:text-yellow-400">
        {{ isAgent ? 'Agent' : 'Function' }} is running…
      </span>
    </div>

    <!-- Empty state -->
    <div v-if="!node" class="flex-1 flex items-center justify-center p-6">
      <div class="text-center space-y-3">
        <div class="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
          <svg class="w-7 h-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <p class="text-sm text-muted-foreground">Select a node to edit its properties</p>
      </div>
    </div>

    <!-- Content -->
    <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">

      <!-- Name -->
      <div>
        <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</label>
        <Input
          :model-value="node.name"
          class="mt-1"
          @update:model-value="v => updateNode({ name: String(v) })"
        />
      </div>

      <!-- Status / Type -->
      <Card class="p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted-foreground">Status</span>
          <span
            class="text-xs font-medium capitalize"
            :class="{
              'text-green-600': node.status === 'complete',
              'text-yellow-600': node.status === 'running',
              'text-red-600': node.status === 'error',
            }"
          >{{ node.status }}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-muted-foreground">Type</span>
          <span class="text-xs font-medium">{{ node.nodeType }}</span>
        </div>
      </Card>

      <!-- Lock toggle -->
      <div class="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
        <div class="flex items-center gap-2">
          <component :is="node.locked ? Lock : Unlock" class="h-4 w-4 text-muted-foreground" />
          <div>
            <div class="text-xs font-medium text-foreground">Lock Node</div>
            <div class="text-xs text-muted-foreground">Prevent re-execution when running workflow</div>
          </div>
        </div>
        <button
          type="button"
          class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
          :class="node.locked ? 'bg-primary' : 'bg-input'"
          @click="isAgent ? updateAgent({ locked: !node.locked }) : updateNode({ locked: !node.locked })"
        >
          <span
            class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
            :class="node.locked ? 'translate-x-4' : 'translate-x-1'"
          />
        </button>
      </div>

      <!-- Execute on NULL input toggle -->
      <div class="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/30">
        <div class="flex items-center gap-2">
          <Database class="h-4 w-4 text-muted-foreground" />
          <div>
            <div class="text-xs font-medium text-foreground">Execute on NULL Input</div>
            <div class="text-xs text-muted-foreground">Run even when input is empty</div>
          </div>
        </div>
        <button
          type="button"
          class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
          :class="node.executeOnNullInput ? 'bg-primary' : 'bg-input'"
          @click="isAgent ? updateAgent({ executeOnNullInput: !node.executeOnNullInput }) : updateNode({ executeOnNullInput: !node.executeOnNullInput })"
        >
          <span
            class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
            :class="node.executeOnNullInput ? 'translate-x-4' : 'translate-x-1'"
          />
        </button>
      </div>

      <!-- Computed input preview -->
      <div v-if="computedInput" class="space-y-1">
        <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Computed Input
        </label>
        <pre class="bg-muted/40 rounded-md p-2 text-xs whitespace-pre-wrap max-h-24 overflow-y-auto font-mono text-muted-foreground">{{ computedInput }}</pre>
      </div>

      <!-- ====== AGENT FIELDS ====== -->
      <template v-if="isAgent && agent">

        <!-- System prompt -->
        <div>
          <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            System prompt
          </label>
          <textarea
            :value="agent.systemPrompt"
            rows="5"
            class="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[100px] font-mono"
            @input="(e: Event) => updateAgent({ systemPrompt: (e.target as HTMLTextAreaElement).value })"
          />
        </div>

        <!-- User prompt -->
        <div>
          <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            User prompt
          </label>
          <textarea
            :value="agent.userPrompt"
            rows="4"
            placeholder="Use {input} or {Stage 1.1: NodeName} for references"
            class="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[80px] font-mono"
            @input="(e: Event) => updateAgent({ userPrompt: (e.target as HTMLTextAreaElement).value })"
          />
        </div>

        <!-- Per-agent model override -->
        <div class="p-3 border border-border rounded-lg bg-muted/30 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Bot class="h-4 w-4 text-muted-foreground" />
              <div>
                <div class="text-xs font-medium text-foreground">Use a Specific Model</div>
                <div class="text-xs text-muted-foreground">Override global workflow model</div>
              </div>
            </div>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
              :class="agent.useSpecificModel ? 'bg-primary' : 'bg-input'"
              @click="updateAgent({
                useSpecificModel: !agent.useSpecificModel,
                ...(!agent.useSpecificModel && !agent.model ? { model: 'gemini-2.5-flash', responseLength: 16384, thinkingEnabled: false, thinkingBudget: 0 } : {})
              })"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                :class="agent.useSpecificModel ? 'translate-x-4' : 'translate-x-1'"
              />
            </button>
          </div>

          <template v-if="agent.useSpecificModel">
            <div class="space-y-3 pt-3 border-t border-border">
              <!-- Model select -->
              <div>
                <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model</label>
                <select
                  :value="agent.model ?? 'gemini-2.5-flash'"
                  class="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  @change="(e: Event) => updateAgent({ model: (e.target as HTMLSelectElement).value as AgentNode['model'] })"
                >
                  <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
                </select>
              </div>

              <!-- Response length -->
              <div>
                <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Response length</label>
                <select
                  :value="(agent.responseLength ?? 16384).toString()"
                  class="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  @change="(e: Event) => updateAgent({ responseLength: Number((e.target as HTMLSelectElement).value) })"
                >
                  <option v-for="rl in RESPONSE_LENGTHS" :key="rl.value" :value="rl.value.toString()">{{ rl.label }}</option>
                  <option :value="maxResponseLength(agent.model).toString()">2XL ({{ maxResponseLength(agent.model).toLocaleString() }} tokens)</option>
                </select>
              </div>

              <!-- Thinking -->
              <template v-if="isThinkingSupported">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    :checked="agent.thinkingEnabled ?? false"
                    class="rounded border-input"
                    @change="(e: Event) => updateAgent({ thinkingEnabled: (e.target as HTMLInputElement).checked, thinkingBudget: (e.target as HTMLInputElement).checked ? -1 : 0 })"
                  />
                  <span class="text-xs text-foreground">Enable thinking</span>
                </label>
              </template>
            </div>
          </template>
        </div>

        <!-- Tools -->
        <Card v-if="agent.tools.length > 0" class="p-3 space-y-2">
          <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Tools ({{ agent.tools.length }})
          </div>
          <ul class="space-y-1 text-xs">
            <li
              v-for="t in agent.tools"
              :key="t.id"
              class="flex items-center justify-between gap-2"
            >
              <span class="truncate">{{ t.toolId }}</span>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 w-6 p-0"
                title="Remove tool"
                @click="emit('remove-tool-instance', agent.id, t.id)"
              >
                <Trash2 class="h-3 w-3" />
              </Button>
            </li>
          </ul>
        </Card>

        <!-- Agent output -->
        <div v-if="agent.output" class="space-y-1">
          <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output</label>
          <pre class="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">{{ agent.output }}</pre>
        </div>
      </template>

      <!-- ====== FUNCTION FIELDS ====== -->
      <template v-else-if="isFunction && fn">

        <!-- Function type (read-only label) -->
        <Card class="p-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Function type</span>
            <span class="text-xs font-mono font-medium">{{ fn.functionType }}</span>
          </div>
          <div v-if="functionDef" class="text-xs text-muted-foreground mt-1">{{ functionDef.description }}</div>
        </Card>

        <!-- Content function: special upload UI -->
        <template v-if="fn.functionType === 'content'">
          <div class="space-y-3">
            <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Content</label>
            <Card class="p-3 space-y-3">
              <textarea
                :value="(fn.config?.content as string) ?? ''"
                placeholder="Enter content or upload files…"
                rows="5"
                class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[80px]"
                @input="(e: Event) => updateFnConfig({ ...fn!.config, content: (e.target as HTMLTextAreaElement).value })"
              />
              <div class="flex gap-2">
                <input
                  ref="contentFileInputRef"
                  type="file"
                  accept=".txt,.md,.json,.xml,.csv,.yaml,.yml,.js,.ts,.vue,.html,.css,.py,.pdf,.docx,.xlsx,.xls"
                  multiple
                  class="hidden"
                  @change="handleContentFileUpload"
                />
                <Button
                  variant="outline"
                  size="sm"
                  class="flex-1 gap-2"
                  :disabled="isProcessingFiles"
                  @click="contentFileInputRef?.click()"
                >
                  <Upload class="h-3.5 w-3.5" />
                  {{ isProcessingFiles ? 'Processing…' : 'Upload Files' }}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-8 w-8 p-0"
                  title="View / Edit"
                  :disabled="!fn.config?.content"
                  @click="handleViewContent"
                >
                  <Eye class="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="h-8 w-8 p-0"
                  title="Clear"
                  :disabled="!fn.config?.content"
                  @click="handleClearContent"
                >
                  <X class="h-3.5 w-3.5" />
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">Upload text files, PDFs, DOCX, or Excel files.</p>
            </Card>
          </div>
        </template>

        <!-- Generic config schema rendering -->
        <template v-else-if="functionDef?.configSchema">
          <div class="space-y-3">
            <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Configuration</label>
            <Card class="p-3 space-y-3">
              <div
                v-for="(schema, key) in functionDef.configSchema"
                :key="key"
                class="space-y-1"
              >
                <label class="text-xs text-foreground font-medium">
                  {{ schema.label }}
                  <span v-if="schema.required" class="text-destructive ml-0.5">*</span>
                </label>

                <!-- boolean → toggle -->
                <template v-if="schema.type === 'boolean'">
                  <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      :checked="Boolean(configValue(key))"
                      class="rounded border-input"
                      @change="(e: Event) => setConfigValue(key, (e.target as HTMLInputElement).checked)"
                    />
                    <span v-if="schema.description" class="text-xs text-muted-foreground">{{ schema.description }}</span>
                  </label>
                </template>

                <!-- number -->
                <template v-else-if="schema.type === 'number'">
                  <Input
                    type="number"
                    :model-value="String(configValue(key))"
                    :placeholder="schema.placeholder"
                    class="h-8 text-xs"
                    @update:model-value="v => setConfigValue(key, Number(v) || 0)"
                  />
                  <p v-if="schema.description" class="text-xs text-muted-foreground">{{ schema.description }}</p>
                </template>

                <!-- bearerToken → password field with toggle -->
                <template v-else-if="key === 'bearerToken'">
                  <div class="relative">
                    <Input
                      :type="showBearerToken ? 'text' : 'password'"
                      :model-value="String(configValue(key))"
                      :placeholder="schema.placeholder"
                      class="h-8 text-xs pr-8"
                      @update:model-value="v => setConfigValue(key, v)"
                    />
                    <button
                      type="button"
                      class="absolute right-0 top-0 h-8 w-8 flex items-center justify-center hover:bg-transparent"
                      @click="showBearerToken = !showBearerToken"
                    >
                      <Eye v-if="!showBearerToken" class="h-3.5 w-3.5 text-muted-foreground" />
                      <Eye v-else class="h-3.5 w-3.5 text-muted-foreground line-through" />
                    </button>
                  </div>
                </template>

                <!-- default → text input -->
                <template v-else>
                  <Input
                    :model-value="String(configValue(key))"
                    :placeholder="schema.placeholder"
                    class="h-8 text-xs"
                    @update:model-value="v => setConfigValue(key, v)"
                  />
                  <p v-if="schema.description" class="text-xs text-muted-foreground">{{ schema.description }}</p>
                </template>
              </div>
            </Card>
          </div>
        </template>

        <!-- Fallback: raw config key-value pairs (for functions without a schema) -->
        <template v-else>
          <Card class="p-3 space-y-2">
            <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Config</div>
            <div
              v-for="[key, value] in Object.entries((fn.config ?? {}) as Record<string, unknown>)"
              :key="key"
              class="space-y-1"
            >
              <label class="text-[10px] uppercase tracking-wider text-muted-foreground">{{ key }}</label>
              <Input
                :model-value="typeof value === 'string' ? value : JSON.stringify(value)"
                class="text-xs font-mono"
                @update:model-value="v => setConfigValue(key, v)"
              />
            </div>
          </Card>
        </template>

        <!-- Function output -->
        <div v-if="fn.output" class="space-y-1">
          <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output</label>
          <pre class="bg-muted/50 rounded-md p-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">{{ fn.output }}</pre>
        </div>
        <!-- Multi-port outputs -->
        <template v-else-if="fn.outputs && Object.keys(fn.outputs).length > 0">
          <div class="space-y-2">
            <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outputs</label>
            <div v-for="[port, val] in Object.entries(fn.outputs)" :key="port" class="space-y-1">
              <div class="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{{ port }}</div>
              <pre v-if="val" class="bg-muted/50 rounded-md p-2 text-xs whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">{{ val }}</pre>
            </div>
          </div>
        </template>
      </template>

    </div>

    <!-- View/Edit Content modal -->
    <div
      v-if="isViewContentOpen"
      class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="isViewContentOpen = false"
    >
      <div class="bg-card border border-border rounded-lg shadow-lg w-[90vw] max-w-3xl flex flex-col max-h-[90vh]">
        <div class="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 class="text-base font-semibold">View / Edit Content</h3>
          <Button variant="ghost" size="sm" class="h-7 w-7 p-0" @click="isViewContentOpen = false">
            <X class="h-4 w-4" />
          </Button>
        </div>
        <div class="flex-1 min-h-0 p-4">
          <textarea
            v-model="editedContent"
            class="w-full h-full min-h-[50vh] rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="No content…"
          />
        </div>
        <div class="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="isViewContentOpen = false">Cancel</Button>
          <Button size="sm" @click="handleSaveContent">Save Changes</Button>
        </div>
      </div>
    </div>

  </aside>
</template>
