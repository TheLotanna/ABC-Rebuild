<script setup lang="ts">
import { computed } from 'vue';
import { Search, FileText, Bot } from '@lucide/vue';
import type { Workflow } from '@agent-builder/shared';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{
  workflow: Workflow;
  userInput: string;
  workflowName: string;
  customAgents: any[];
  selectedModel: string;
  responseLength: number;
  thinkingEnabled: boolean;
  thinkingBudget: number;
}>();

const emit = defineEmits<{
  'add-agent': [template: any];
  'add-node': [stageId: string, template: any, nodeType?: string];
  'update:userInput': [value: string];
  'update:workflowName': [value: string];
  'update:customAgents': [value: any[]];
  'update:selectedModel': [value: string];
  'update:responseLength': [value: number];
  'update:thinkingEnabled': [value: boolean];
  'update:thinkingBudget': [value: number];
}>();

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: typeof Search;
  iconName: string;
  defaultSystemPrompt: string;
  defaultUserPrompt: string;
}

const agentTemplates: AgentTemplate[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    iconName: 'Search',
    icon: Search,
    description: 'Gather and analyze information',
    defaultSystemPrompt:
      'You are a research assistant specializing in gathering and analyzing information from various sources.',
    defaultUserPrompt: 'Research the following topic and provide detailed findings: {input}',
  },
  {
    id: 'summarizer',
    name: 'Summarizer',
    iconName: 'FileText',
    icon: FileText,
    description: 'Condense long content',
    defaultSystemPrompt:
      'You are a summarization expert who creates concise, accurate summaries of long content.',
    defaultUserPrompt: 'Summarize the following content: {input}',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    iconName: 'Bot',
    icon: Bot,
    description: 'Deep data analysis',
    defaultSystemPrompt:
      'You are a data analyst who provides insightful analysis and identifies patterns in data.',
    defaultUserPrompt: 'Analyze the following data and provide insights: {input}',
  },
];

const MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
  { id: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast (reasoning)' },
  { id: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast' },
  { id: 'grok-code-fast-1', label: 'Grok Code Fast 1' },
];

function handleDragStart(e: DragEvent, template: AgentTemplate, nodeType: 'agent' | 'function') {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = 'copy';
  const serialisable = { ...template, icon: undefined };
  e.dataTransfer.setData('agentTemplate', JSON.stringify(serialisable));
  e.dataTransfer.setData('nodeType', nodeType);
}

function addAgentToFirstStage(template: AgentTemplate) {
  const firstStage = props.workflow.stages[0];
  if (firstStage) {
    emit('add-node', firstStage.id, template, 'agent');
  } else {
    emit('add-agent', template);
  }
}

const hasStages = computed(() => props.workflow.stages.length > 0);
</script>

<template>
  <aside class="h-full flex flex-col bg-card">
    <div class="p-4 border-b border-border space-y-3">
      <div>
        <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Workflow name
        </label>
        <Input
          :model-value="workflowName"
          class="mt-1"
          @update:model-value="v => emit('update:workflowName', String(v))"
        />
      </div>

      <div>
        <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          User input
        </label>
        <textarea
          :value="userInput"
          rows="4"
          placeholder="What should the workflow do?"
          class="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[80px]"
          @input="(e: Event) => emit('update:userInput', (e.target as HTMLTextAreaElement).value)"
        />
      </div>

      <div>
        <label class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Model
        </label>
        <select
          :value="selectedModel"
          class="mt-1 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          @change="(e: Event) => emit('update:selectedModel', (e.target as HTMLSelectElement).value)"
        >
          <option v-for="m in MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </div>

      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="thinkingEnabled"
          class="rounded border-input"
          @change="(e: Event) => emit('update:thinkingEnabled', (e.target as HTMLInputElement).checked)"
        />
        <span class="text-sm text-foreground">Enable thinking</span>
      </label>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Agents
      </h3>
      <p v-if="!hasStages" class="text-xs text-muted-foreground mb-3">
        Add a stage from the toolbar first, then click or drag an agent into it.
      </p>
      <div class="space-y-2">
        <Card
          v-for="t in agentTemplates"
          :key="t.id"
          class="p-3 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors"
          draggable="true"
          @click="addAgentToFirstStage(t)"
          @dragstart="(e: DragEvent) => handleDragStart(e, t, 'agent')"
        >
          <div class="flex items-start gap-2">
            <div class="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <component :is="t.icon" class="h-4 w-4 text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium text-foreground">{{ t.name }}</div>
              <div class="text-xs text-muted-foreground line-clamp-2">{{ t.description }}</div>
            </div>
          </div>
        </Card>
      </div>

      <div class="mt-6 text-xs text-muted-foreground">
        <p>
          Functions and custom agents (deferred) — drag templates here in a later port. The
          properties panel on the right edits whatever is selected.
        </p>
      </div>
    </div>

    <div class="p-4 border-t border-border">
      <Button class="w-full" disabled title="Run via the Toolbar — wired in WorkbenchView">
        Use ▶ Run Workflow in the toolbar
      </Button>
    </div>
  </aside>
</template>
