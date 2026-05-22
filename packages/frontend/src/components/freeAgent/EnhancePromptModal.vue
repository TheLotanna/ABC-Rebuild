<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  Sparkles,
  Loader2,
  Code,
  FileText,
  RefreshCw,
  Check,
  Play,
  MessageSquare,
  Wand2,
  X,
} from '@lucide/vue';
import type { SessionFile } from '@agent-builder/shared';
import { getStoredEnhancementPrompt } from '@/lib/enhancePromptStorage';
import { formatPiiGuardMessage } from '@/lib/piiGuardClient';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';

const props = defineProps<{
  open: boolean;
  originalPrompt: string;
  files: SessionFile[];
  model: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  accept: [enhancedPrompt: string];
  'accept-and-start': [enhancedPrompt: string];
}>();

const enhancedPrompt = ref('');
const feedback = ref('');
const isEnhancing = ref(false);
const activeTab = ref<'markdown' | 'raw'>('markdown');
const hasEnhanced = ref(false);
let abortController: AbortController | null = null;
let hasStarted = false;

interface ToolInfo {
  name: string;
  description: string;
  parameters: Record<string, { description?: string }>;
}

async function loadToolsList(): Promise<ToolInfo[]> {
  try {
    const res = await fetch('/data/toolsManifest.json');
    const manifest = await res.json();
    return Object.entries(manifest.tools).map(([key, tool]: [string, any]) => ({
      name: key,
      description: tool.description,
      parameters: tool.parameters || {},
    }));
  } catch (err) {
    console.error('Failed to load tools manifest:', err);
    return [];
  }
}

function formatToolsList(tools: ToolInfo[]): string {
  return tools
    .map((t) => {
      const params = Object.entries(t.parameters)
        .map(([n, p]) => `${n}: ${p.description ?? ''}`)
        .join(', ');
      return `- ${t.name}: ${t.description}${params ? ` (params: ${params})` : ''}`;
    })
    .join('\n');
}

function formatFilesList(): string {
  if (!props.files.length) return 'No files provided.';
  return props.files
    .map((f) => `- ${f.filename} (${f.mimeType}, ${(f.size / 1024).toFixed(1)} KB)`)
    .join('\n');
}

function routeForModel(): string {
  if (props.model.startsWith('claude')) return '/api/run-agent/anthropic';
  if (props.model.startsWith('grok')) return '/api/run-agent/xai';
  return '/api/run-agent';
}

function backendBase(): string {
  return (import.meta as any).env?.VITE_BACKEND_URL ?? '';
}

function buildSystemPrompt(toolsList: string, filesList: string, previousPlan?: string, userFeedback?: string): string {
  const base = getStoredEnhancementPrompt();
  let prompt = `${base}\n\nThe agent has access to these tools:\n\n${toolsList}\n\nThe user has provided these files:\n${filesList}`;
  if (previousPlan && userFeedback) {
    prompt += `\n\n---\n\nThe user reviewed your previous plan and provided feedback. Please revise the plan accordingly.\n\nPrevious plan:\n${previousPlan}\n\nUser feedback:\n${userFeedback}\n\nPlease create an improved plan that addresses the user's feedback.`;
  }
  return prompt;
}

async function streamEnhancement(isRefinement: boolean) {
  isEnhancing.value = true;
  enhancedPrompt.value = '';
  abortController?.abort();
  abortController = new AbortController();

  try {
    const tools = await loadToolsList();
    const toolsList = formatToolsList(tools);
    const filesList = formatFilesList();
    const systemPrompt = buildSystemPrompt(
      toolsList,
      filesList,
      isRefinement ? enhancedPrompt.value : undefined,
      isRefinement ? feedback.value : undefined,
    );
    const userPrompt = isRefinement
      ? `Original request: ${props.originalPrompt}\n\nPlease revise the plan based on my feedback.`
      : props.originalPrompt;

    const res = await fetch(`${backendBase()}${routeForModel()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt,
        userPrompt,
        model: props.model,
        maxOutputTokens: 8192,
        tools: [],
      }),
      signal: abortController.signal,
    });

    if (!res.ok) throw new Error(`Enhancement failed: ${res.status}`);
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === 'delta' && parsed.text) {
            accumulated += parsed.text;
            enhancedPrompt.value = accumulated;
          } else if (parsed.type === 'done') {
            break;
          } else if (parsed.type === 'error') {
            throw new Error(formatPiiGuardMessage(parsed.error || 'Stream error', parsed));
          }
        } catch {
          // Ignore parse errors on incomplete chunks
        }
      }
    }

    hasEnhanced.value = true;
    feedback.value = '';
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.log('Enhancement cancelled');
    } else {
      console.error('Enhancement error:', err);
      enhancedPrompt.value = `Error: ${(err as Error).message}`;
    }
  } finally {
    isEnhancing.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (open && !hasStarted) {
      hasStarted = true;
      enhancedPrompt.value = '';
      feedback.value = '';
      hasEnhanced.value = false;
      activeTab.value = 'markdown';
      void streamEnhancement(false);
    }
    if (!open) {
      hasStarted = false;
      abortController?.abort();
    }
  },
);

onMounted(() => {
  if (props.open && !hasStarted) {
    hasStarted = true;
    void streamEnhancement(false);
  }
});

function handleRefine() {
  if (!feedback.value.trim()) return;
  void streamEnhancement(true);
}

function handleAccept() {
  emit('accept', enhancedPrompt.value);
  emit('update:open', false);
}

function handleAcceptAndStart() {
  emit('accept-and-start', enhancedPrompt.value);
  emit('update:open', false);
}

function handleCancel() {
  abortController?.abort();
  emit('update:open', false);
}

function handleRegenerate() {
  void streamEnhancement(false);
}

const modelInfo = computed(() => {
  const map: Record<string, { label: string; color: string }> = {
    'gemini-2.5-flash': { label: 'Gemini 2.5 Flash', color: 'text-blue-500' },
    'gemini-2.5-flash-lite': { label: 'Gemini 2.5 Flash Lite', color: 'text-blue-500' },
    'gemini-3-pro-preview': { label: 'Gemini 3 Pro', color: 'text-blue-500' },
    'gemini-3-flash-preview': { label: 'Gemini 3 Flash', color: 'text-blue-500' },
    'claude-sonnet-4-5': { label: 'Claude Sonnet 4.5', color: 'text-orange-500' },
    'claude-haiku-4-5': { label: 'Claude Haiku 4.5', color: 'text-orange-500' },
    'claude-opus-4-5': { label: 'Claude Opus 4.5', color: 'text-orange-500' },
    'grok-4-1-fast-reasoning': { label: 'Grok 4.1 Reasoning', color: 'text-purple-500' },
    'grok-4-1-fast-non-reasoning': { label: 'Grok 4.1', color: 'text-purple-500' },
    'grok-code-fast-1': { label: 'Grok Code', color: 'text-purple-500' },
  };
  return map[props.model] ?? { label: props.model, color: 'text-muted-foreground' };
});

function tabButtonClass(tab: 'markdown' | 'raw'): string {
  return activeTab.value === tab
    ? 'h-7 text-xs gap-1 px-2 flex items-center bg-background border border-border rounded-md shadow-sm'
    : 'h-7 text-xs gap-1 px-2 flex items-center text-muted-foreground hover:text-foreground rounded-md';
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
    @click.self="handleCancel"
  >
    <div
      class="bg-card border border-border rounded-lg shadow-lg flex flex-col"
      style="width: calc(100% - 50px); height: calc(100% - 50px); max-width: calc(100% - 50px); max-height: calc(100% - 50px)"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <Wand2 class="w-4 h-4 text-amber-500 shrink-0" />
            <h2 class="text-base font-semibold text-foreground truncate">
              Enhance Your Prompt
            </h2>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <Badge variant="outline" :class="['text-xs', modelInfo.color]">
              {{ modelInfo.label }}
            </Badge>
            <Button variant="ghost" size="sm" class="h-7 w-7 p-0" @click="handleCancel">
              <X class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 flex flex-col min-h-0 overflow-hidden p-3 gap-2">
        <div v-if="isEnhancing" class="flex items-center gap-2 text-muted-foreground shrink-0">
          <Loader2 class="w-4 h-4 animate-spin" />
          <span class="text-sm">
            {{ hasEnhanced ? 'Refining plan...' : 'Generating structured plan...' }}
          </span>
        </div>

        <!-- Tabs control -->
        <div class="flex items-center justify-between shrink-0 gap-2">
          <div class="flex items-center gap-1 bg-muted/40 rounded-md p-0.5">
            <button :class="tabButtonClass('markdown')" @click="activeTab = 'markdown'">
              <FileText class="w-3 h-3" />
              Preview
            </button>
            <button :class="tabButtonClass('raw')" @click="activeTab = 'raw'">
              <Code class="w-3 h-3" />
              Edit
            </button>
          </div>
          <Button
            v-if="!isEnhancing"
            variant="outline"
            size="sm"
            class="h-7 px-2 gap-1 text-xs"
            @click="handleRegenerate"
          >
            <RefreshCw class="w-3 h-3" />
            Regenerate
          </Button>
        </div>

        <!-- Panel -->
        <div class="flex-1 min-h-0 border border-border rounded-md overflow-hidden">
          <div v-if="activeTab === 'markdown'" class="h-full overflow-auto">
            <!-- Markdown rendering deferred until vue-markdown-render is wired. -->
            <pre
              class="h-full p-3 text-sm font-mono whitespace-pre-wrap text-foreground"
            >{{ enhancedPrompt || '_Generating..._' }}</pre>
          </div>
          <textarea
            v-else
            v-model="enhancedPrompt"
            class="h-full w-full border-0 rounded-none resize-none font-mono text-sm p-3 bg-transparent focus-visible:outline-none"
            placeholder="Enhanced prompt will appear here..."
          />
        </div>

        <!-- Feedback section -->
        <div
          v-if="hasEnhanced && !isEnhancing"
          class="shrink-0 space-y-1 border-t border-border pt-2"
        >
          <label class="text-xs text-muted-foreground flex items-center gap-1">
            <MessageSquare class="w-3 h-3" />
            Refine with Feedback
          </label>
          <div class="flex gap-2">
            <textarea
              v-model="feedback"
              placeholder="Provide feedback to refine the plan..."
              class="flex-1 min-h-[50px] resize-none text-sm rounded-md border border-input bg-transparent px-3 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button
              variant="secondary"
              size="sm"
              class="shrink-0 h-auto"
              :disabled="!feedback.trim()"
              @click="handleRefine"
            >
              <RefreshCw class="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-3 py-2 border-t border-border bg-muted/30 shrink-0">
        <div class="flex items-center justify-end gap-2 flex-wrap">
          <Button variant="outline" size="sm" @click="handleCancel">Cancel</Button>
          <Button
            variant="secondary"
            size="sm"
            class="gap-1"
            :disabled="!enhancedPrompt || isEnhancing"
            @click="handleAccept"
          >
            <Check class="w-3 h-3" />
            Accept
          </Button>
          <Button
            size="sm"
            class="gap-1"
            :disabled="!enhancedPrompt || isEnhancing"
            @click="handleAcceptAndStart"
          >
            <Play class="w-3 h-3" />
            Accept &amp; Start
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
