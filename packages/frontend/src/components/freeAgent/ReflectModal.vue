<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import {
  Loader2,
  Code,
  FileText,
  RefreshCw,
  Download,
  Lightbulb,
  X,
} from 'lucide-vue-next';
import type { BlackboardEntry } from '@agent-builder/shared';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';

type Tab = 'markdown' | 'raw';

const REFLECTION_SYSTEM_PROMPT = `You are an expert AI session analyst reviewing the execution of an autonomous agent task.

Your job is to analyze the session data (blackboard entries and scratchpad) and provide actionable insights.

Answer these questions thoroughly:

## What Went Well
- Identify successful tool calls and strategies
- Highlight effective problem-solving approaches
- Note any good recovery from errors

## What Went Wrong
- Identify obvious failures or loops
- Point out inefficient tool usage
- Note any missed opportunities

## Root Cause Analysis
- What patterns led to failures?
- Were there unclear instructions?
- Did the agent misunderstand the task?

## Recommendations for Next Time
- How should the prompt be restructured?
- What tools should be prioritized or avoided?
- What guardrails would have helped?

## Rewritten Prompt
Provide a complete, improved version of the original prompt that would avoid the issues observed.

Be specific, actionable, and constructive. Focus on practical improvements.`;

const props = defineProps<{
  open: boolean;
  blackboard: BlackboardEntry[];
  scratchpad: string;
  originalPrompt: string;
  model: string;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const reflection = ref('');
const isReflecting = ref(false);
const activeTab = ref<Tab>('markdown');
let abortController: AbortController | null = null;
let hasStarted = false;

const backendBase = () => (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_BACKEND_URL || '';

function endpointFor(model: string): string {
  if (model.startsWith('claude-')) return `${backendBase()}/api/run-agent/anthropic`;
  if (model.startsWith('grok-')) return `${backendBase()}/api/run-agent/xai`;
  return `${backendBase()}/api/run-agent`;
}

function formatBlackboard(): string {
  if (props.blackboard.length === 0) return 'No blackboard entries.';
  return props.blackboard
    .map((entry, i) => `[${i + 1}] [${entry.category}] ${entry.content}`)
    .join('\n\n---\n\n');
}

async function streamReflection() {
  isReflecting.value = true;
  reflection.value = '';

  if (abortController) abortController.abort();
  abortController = new AbortController();

  try {
    const blackboardContent = formatBlackboard();
    const userPrompt = `Please analyze this agent session and provide insights.

## Original Prompt
${props.originalPrompt}

## Blackboard (Agent's Memory Log)
${blackboardContent}

## Scratchpad (Agent's Working Notes)
${props.scratchpad || 'Empty'}

---

Reviewing the blackboard and the scratchpad, what went well and where were there some obvious failings? What can you infer from this? What would you do differently next time? How would you rewrite the original prompt to avoid this issue again?`;

    const response = await fetch(endpointFor(props.model), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: REFLECTION_SYSTEM_PROMPT,
        userPrompt,
        model: props.model,
        maxOutputTokens: 8192,
        tools: [],
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Reflection failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
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
            reflection.value = accumulated;
          } else if (parsed.type === 'done') {
            break;
          } else if (parsed.type === 'error') {
            throw new Error(parsed.error);
          }
        } catch {
          // Ignore parse errors for incomplete chunks
        }
      }
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      // expected cancellation
    } else {
      console.error('Reflection error:', error);
      reflection.value = `Error: ${(error as Error).message}`;
    }
  } finally {
    isReflecting.value = false;
  }
}

watch(
  () => props.open,
  (next) => {
    if (next && !hasStarted) {
      hasStarted = true;
      reflection.value = '';
      activeTab.value = 'markdown';
      streamReflection();
    }
    if (!next) {
      hasStarted = false;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (abortController) abortController.abort();
});

function handleDownload() {
  const blob = new Blob([reflection.value], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `session-reflection-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleCancel() {
  if (abortController) abortController.abort();
  emit('update:open', false);
}

function handleRegenerate() {
  streamReflection();
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
  return map[props.model] || { label: props.model, color: 'text-muted-foreground' };
});

function tabBtnClass(tab: Tab) {
  return [
    'px-2 py-1 text-xs gap-1 rounded-md transition-colors inline-flex items-center',
    activeTab.value === tab
      ? 'bg-background shadow-sm text-foreground'
      : 'bg-muted/50 text-muted-foreground hover:text-foreground',
  ];
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="handleCancel"
  >
    <div
      class="bg-background border rounded-lg flex flex-col p-0 gap-0 shadow-xl"
      :style="{
        width: 'calc(100% - 50px)',
        height: 'calc(100% - 50px)',
        maxWidth: 'calc(100% - 50px)',
        maxHeight: 'calc(100% - 50px)',
      }"
    >
      <div class="px-3 py-2 border-b bg-muted/30 shrink-0 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <Lightbulb class="w-4 h-4 text-purple-500 shrink-0" />
          <h2 class="text-base font-semibold truncate">Reflect on Session</h2>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Badge variant="outline" :class="[modelInfo.color, 'text-xs']">
            {{ modelInfo.label }}
          </Badge>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="handleCancel">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div class="flex-1 flex flex-col min-h-0 p-3 gap-2 overflow-hidden">
          <div
            v-if="isReflecting"
            class="flex items-center gap-2 text-muted-foreground shrink-0"
          >
            <Loader2 class="w-4 h-4 animate-spin" />
            <span class="text-sm">Analyzing session...</span>
          </div>

          <div class="flex items-center justify-between shrink-0 gap-2">
            <div class="inline-flex bg-muted/50 rounded-lg p-1 gap-1">
              <button :class="tabBtnClass('markdown')" @click="activeTab = 'markdown'">
                <FileText class="w-3 h-3" />
                Preview
              </button>
              <button :class="tabBtnClass('raw')" @click="activeTab = 'raw'">
                <Code class="w-3 h-3" />
                Raw
              </button>
            </div>
            <Button
              v-if="!isReflecting"
              variant="outline"
              size="sm"
              class="gap-1 text-xs h-7 px-2"
              @click="handleRegenerate"
            >
              <RefreshCw class="w-3 h-3" />
              Regenerate
            </Button>
          </div>

          <div class="flex-1 min-h-0 mt-2 border rounded-md overflow-hidden">
            <div
              v-if="activeTab === 'markdown'"
              class="h-full overflow-auto"
            >
              <div class="p-3 max-w-none whitespace-pre-wrap break-words text-sm">
                <template v-if="reflection">{{ reflection }}</template>
                <em v-else class="text-muted-foreground">Analyzing session...</em>
              </div>
            </div>
            <textarea
              v-else
              v-model="reflection"
              class="h-full w-full border-0 rounded-none resize-none font-mono text-sm p-3 bg-background outline-none"
              placeholder="Reflection will appear here..."
            />
          </div>
        </div>
      </div>

      <div class="px-3 py-2 border-t bg-muted/30 shrink-0 flex items-center justify-end gap-2 flex-wrap">
        <Button variant="outline" size="sm" @click="handleCancel">Close</Button>
        <Button
          size="sm"
          class="gap-1"
          :disabled="!reflection || isReflecting"
          @click="handleDownload"
        >
          <Download class="w-3 h-3" />
          Download
        </Button>
      </div>
    </div>
  </div>
</template>
