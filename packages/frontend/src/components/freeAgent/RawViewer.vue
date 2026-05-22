<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Code,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Wrench,
  AlertCircle,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { RawIterationData } from '@agent-builder/shared';
import Card from '@/components/ui/Card.vue';
import CardContent from '@/components/ui/CardContent.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import CardTitle from '@/components/ui/CardTitle.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ rawData: RawIterationData[] }>();

const selectedIteration = ref<number>(props.rawData.length > 0 ? props.rawData.length : 1);
const activeTab = ref<'input' | 'output' | 'tools'>('input');
const copied = ref<{ input: boolean; output: boolean; tools: boolean; all: boolean }>({
  input: false,
  output: false,
  tools: false,
  all: false,
});

watch(
  () => props.rawData.length,
  (len) => {
    if (len > 0) selectedIteration.value = len;
  },
);

const currentData = computed(() => props.rawData[selectedIteration.value - 1]);

async function handleCopy(text: string, type: keyof typeof copied.value) {
  await navigator.clipboard.writeText(text);
  copied.value[type] = true;
  if (type === 'all') toast.success('Copied full iteration data');
  setTimeout(() => { copied.value[type] = false; }, 2000);
}

function copyFullIteration() {
  if (!currentData.value) return;
  const fullData = {
    iteration: selectedIteration.value,
    input: {
      model: currentData.value.input.model,
      userPrompt: currentData.value.input.userPrompt,
      systemPrompt: currentData.value.input.systemPrompt,
      scratchpadLength: currentData.value.input.scratchpadLength,
      blackboardEntries: currentData.value.input.blackboardEntries,
      previousResultsCount: currentData.value.input.previousResultsCount,
    },
    output: {
      rawResponse:
        currentData.value.output.rawLLMResponse ||
        currentData.value.output.parseError?.rawResponse,
      errorMessage: currentData.value.output.errorMessage,
    },
    toolResults: currentData.value.toolResults,
  };
  handleCopy(JSON.stringify(fullData, null, 2), 'all');
}

const responseLength = computed(() => {
  const d = currentData.value;
  if (!d) return 0;
  return d.output.parseError?.responseLength || d.output.rawLLMResponse?.length || 0;
});

function tabBtnClass(tab: 'input' | 'output' | 'tools') {
  return [
    'flex-1 text-xs px-3 py-1.5 rounded-md transition-colors',
    activeTab.value === tab
      ? 'bg-background shadow-sm text-foreground'
      : 'text-muted-foreground hover:text-foreground',
  ];
}
</script>

<template>
  <Card class="h-full flex flex-col border-0 rounded-none">
    <CardHeader class="pb-3 pt-4 px-4">
      <CardTitle class="flex items-center gap-2 text-base">
        <Code class="w-4 h-4" />
        Raw Data
        <Button
          variant="outline"
          size="sm"
          :disabled="!currentData"
          class="ml-auto h-7 px-2"
          title="Copy full iteration (input, output, tools)"
          @click="copyFullIteration"
        >
          <Check v-if="copied.all" class="w-3 h-3 text-green-500" />
          <Copy v-else class="w-3 h-3" />
        </Button>
      </CardTitle>

      <div class="flex items-center gap-2 mt-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="selectedIteration <= 1"
          @click="selectedIteration = Math.max(1, selectedIteration - 1)"
        >
          <ArrowLeft class="w-3 h-3" />
        </Button>
        <span class="text-sm min-w-[100px] text-center">
          Iteration {{ selectedIteration }} / {{ rawData.length || 0 }}
        </span>
        <Button
          variant="outline"
          size="sm"
          :disabled="selectedIteration >= rawData.length"
          @click="selectedIteration = Math.min(rawData.length, selectedIteration + 1)"
        >
          <ArrowRight class="w-3 h-3" />
        </Button>
      </div>
    </CardHeader>

    <CardContent class="flex-1 overflow-hidden p-0">
      <div
        v-if="!currentData"
        class="flex items-center justify-center h-full text-muted-foreground text-sm"
      >
        No raw data yet. Start a session to capture LLM input/output.
      </div>
      <div v-else class="h-full flex flex-col">
        <div class="mx-4 mb-2 inline-flex bg-muted rounded-lg p-1">
          <button :class="tabBtnClass('input')" @click="activeTab = 'input'">Input</button>
          <button :class="tabBtnClass('output')" @click="activeTab = 'output'">Output</button>
          <button :class="tabBtnClass('tools')" @click="activeTab = 'tools'">
            Tools ({{ currentData.toolCalls?.length || 0 }})
          </button>
        </div>

        <div v-if="activeTab === 'input'" class="flex-1 overflow-hidden m-0 px-4 pb-4">
          <div class="h-full flex flex-col bg-muted/50 rounded-md">
            <div class="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <div class="text-xs text-muted-foreground space-x-3">
                <span>Model: {{ currentData.input.model }}</span>
                <span>Scratchpad: {{ currentData.input.scratchpadLength }} chars</span>
                <span>Blackboard: {{ currentData.input.blackboardEntries }} entries</span>
                <span>Prev Results: {{ currentData.input.previousResultsCount }}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 px-2"
                @click="handleCopy(currentData.input.fullPromptSent || currentData.input.systemPrompt || '', 'input')"
              >
                <Check v-if="copied.input" class="w-3 h-3 text-green-500" />
                <Copy v-else class="w-3 h-3" />
              </Button>
            </div>
            <div class="flex-1 overflow-auto">
              <div
                v-if="currentData.input.userPrompt"
                class="mx-3 mt-3 mb-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md"
              >
                <div class="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
                  User Task:
                </div>
                <div class="text-sm font-mono">{{ currentData.input.userPrompt }}</div>
              </div>
              <pre class="text-xs p-3 whitespace-pre-wrap break-all font-mono leading-relaxed">{{ currentData.input.systemPrompt || '(not captured)' }}</pre>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'output'" class="flex-1 overflow-hidden m-0 px-4 pb-4">
          <div class="h-full flex flex-col bg-muted/50 rounded-md">
            <div class="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <div class="text-xs text-muted-foreground">
                <span>Response length: {{ responseLength }} chars</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 px-2"
                @click="handleCopy(currentData.output.rawLLMResponse || currentData.output.parseError?.rawResponse || '', 'output')"
              >
                <Check v-if="copied.output" class="w-3 h-3 text-green-500" />
                <Copy v-else class="w-3 h-3" />
              </Button>
            </div>
            <div v-if="currentData.output.parseError" class="flex-1 flex flex-col overflow-hidden">
              <div class="bg-destructive/10 border border-destructive/30 rounded-md p-3 mx-3 mt-3">
                <div class="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertCircle class="h-4 w-4" />
                  Parse Error: {{ currentData.output.errorMessage || 'Failed to parse LLM response' }}
                </div>
                <div class="text-xs text-muted-foreground mt-1">
                  Response length: {{ currentData.output.parseError.responseLength }} chars
                </div>
              </div>
              <div class="flex-1 overflow-auto">
                <pre class="text-xs p-3 whitespace-pre-wrap break-all font-mono leading-relaxed">{{ currentData.output.rawLLMResponse || currentData.output.parseError.rawResponse || '(no response captured)' }}</pre>
              </div>
            </div>
            <div v-else class="flex-1 overflow-auto">
              <pre class="text-xs p-3 whitespace-pre-wrap break-all font-mono leading-relaxed">{{ currentData.output.rawLLMResponse || '(not captured)' }}</pre>
            </div>
          </div>
        </div>

        <div v-else class="flex-1 overflow-hidden m-0 px-4 pb-4">
          <div class="h-full flex flex-col bg-muted/50 rounded-md">
            <div class="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <div class="flex items-center gap-2 text-xs text-muted-foreground">
                <Wrench class="w-3 h-3" />
                <span>{{ currentData.toolCalls?.length || 0 }} tool calls this iteration</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 px-2"
                @click="handleCopy(JSON.stringify(currentData.toolCalls, null, 2), 'tools')"
              >
                <Check v-if="copied.tools" class="w-3 h-3 text-green-500" />
                <Copy v-else class="w-3 h-3" />
              </Button>
            </div>
            <div class="flex-1 overflow-auto">
              <div
                v-if="currentData.toolCalls && currentData.toolCalls.length > 0"
                class="p-3 space-y-3"
              >
                <div
                  v-for="(tc, idx) in currentData.toolCalls"
                  :key="idx"
                  class="border border-border/50 rounded-md overflow-hidden"
                >
                  <div class="px-3 py-1.5 text-xs font-medium flex items-center justify-between bg-blue-500/10 text-blue-700 dark:text-blue-400">
                    <span class="font-mono">{{ tc.tool }}</span>
                    <Badge variant="outline" class="text-[10px] h-4">REQUESTED</Badge>
                  </div>
                  <pre class="text-xs p-3 whitespace-pre-wrap break-all font-mono leading-relaxed bg-background/50 max-h-[300px] overflow-auto">{{ JSON.stringify(tc.params, null, 2) }}</pre>
                </div>
              </div>
              <div
                v-else
                class="flex items-center justify-center h-full text-muted-foreground text-xs p-4"
              >
                No tool calls this iteration
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
