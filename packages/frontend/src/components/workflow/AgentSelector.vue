<script setup lang="ts">
import { ref, computed, type Component } from 'vue';
import { Search, X, FileText, Bot, Sparkles } from '@lucide/vue';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';

export interface AgentTemplate {
  id: string;
  name: string;
  icon: Component | string;
  description: string;
  category: string;
  defaultSystemPrompt: string;
  defaultUserPrompt: string;
}

const props = defineProps<{
  open: boolean;
  customAgents?: AgentTemplate[];
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'select-agent', template: AgentTemplate): void;
}>();

const iconMap: Record<string, Component> = {
  Search,
  FileText,
  Bot,
  Sparkles,
};

const agentTemplates: AgentTemplate[] = [
  { id: 'researcher', name: 'Researcher', icon: Search, category: 'research',
    description: 'Gather and analyze information from various sources',
    defaultSystemPrompt: 'You are a research assistant specializing in gathering and analyzing information from various sources.',
    defaultUserPrompt: 'Research the following topic and provide detailed findings: {input}' },
  { id: 'summarizer', name: 'Summarizer', icon: FileText, category: 'content',
    description: 'Condense long content into concise summaries',
    defaultSystemPrompt: 'You are a summarization expert who creates concise, accurate summaries of long content.',
    defaultUserPrompt: 'Summarize the following content: {input}' },
  { id: 'analyst', name: 'Analyst', icon: Bot, category: 'analysis',
    description: 'Deep data analysis and pattern identification',
    defaultSystemPrompt: 'You are a data analyst who provides insightful analysis and identifies patterns in data.',
    defaultUserPrompt: 'Analyze the following data and provide insights: {input}' },
  { id: 'writer', name: 'Writer', icon: FileText, category: 'content',
    description: 'Create engaging written content',
    defaultSystemPrompt: 'You are a professional writer who creates compelling, well-structured content.',
    defaultUserPrompt: 'Write content based on the following: {input}' },
  { id: 'editor', name: 'Editor', icon: FileText, category: 'content',
    description: 'Edit and improve written content',
    defaultSystemPrompt: 'You are an expert editor who improves clarity, grammar, and style.',
    defaultUserPrompt: 'Edit and improve the following content: {input}' },
  { id: 'fact-checker', name: 'Fact Checker', icon: Search, category: 'research',
    description: 'Verify accuracy and validate claims',
    defaultSystemPrompt: 'You are a fact-checker who validates information and identifies inaccuracies.',
    defaultUserPrompt: 'Fact-check the following content: {input}' },
  { id: 'translator', name: 'Translator', icon: Sparkles, category: 'content',
    description: 'Translate content between languages',
    defaultSystemPrompt: 'You are a professional translator who provides accurate translations while preserving meaning and tone.',
    defaultUserPrompt: 'Translate the following to [TARGET LANGUAGE]: {input}' },
  { id: 'code-reviewer', name: 'Code Reviewer', icon: Bot, category: 'analysis',
    description: 'Review and analyze code quality',
    defaultSystemPrompt: 'You are a code reviewer who identifies bugs, suggests improvements, and ensures best practices.',
    defaultUserPrompt: 'Review the following code: {input}' },
  { id: 'strategist', name: 'Strategist', icon: Bot, category: 'analysis',
    description: 'Develop strategic plans and recommendations',
    defaultSystemPrompt: 'You are a strategic advisor who develops actionable plans and recommendations.',
    defaultUserPrompt: 'Develop a strategy for: {input}' },
];

const categories = [
  { id: 'all', name: 'All Agents' },
  { id: 'library', name: 'Library' },
  { id: 'research', name: 'Research' },
  { id: 'content', name: 'Content' },
  { id: 'analysis', name: 'Analysis' },
];

const selectedCategory = ref('all');
const searchQuery = ref('');

const filteredAgents = computed(() => {
  const customWithCategory = (props.customAgents ?? []).map((a) => ({
    ...a,
    category: 'library',
  }));
  let agents: AgentTemplate[] = [...customWithCategory, ...agentTemplates];

  if (selectedCategory.value !== 'all') {
    agents = agents.filter((a) => a.category === selectedCategory.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    agents = agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    );
  }
  return agents;
});

function close() {
  emit('update:open', false);
}

function selectAgent(template: AgentTemplate) {
  emit('select-agent', template);
  searchQuery.value = '';
  selectedCategory.value = 'all';
}

function getIconComponent(icon: Component | string | undefined): Component {
  if (!icon) return Bot;
  if (typeof icon === 'string') return iconMap[icon] || Bot;
  return icon;
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div
      class="bg-background border rounded-lg shadow-xl flex flex-col"
      :style="{
        width: '90vw',
        height: '90vh',
        maxWidth: '90vw',
        maxHeight: '90vh',
      }"
    >
      <div class="px-6 pt-6 pb-4 border-b shrink-0 flex items-start justify-between gap-2">
        <div>
          <h2 class="text-lg font-semibold">Add Agent</h2>
          <p class="text-sm text-muted-foreground mt-1">
            Select an agent template to add to this stage
          </p>
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="close">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- Mobile layout -->
      <div class="flex-1 overflow-hidden flex flex-col xl:hidden">
        <div class="px-6 py-3 border-b">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              placeholder="Search agents..."
              class="pl-9 pr-9"
            />
            <button
              v-if="searchQuery"
              class="absolute right-3 top-1/2 -translate-y-1/2"
              @click="searchQuery = ''"
            >
              <X class="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>

        <div class="px-6 py-3 border-b overflow-x-auto">
          <div class="flex gap-2">
            <Button
              v-for="category in categories"
              :key="category.id"
              :variant="selectedCategory === category.id ? 'default' : 'outline'"
              size="sm"
              class="whitespace-nowrap"
              @click="selectedCategory = category.id"
            >
              {{ category.name }}
            </Button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div class="grid gap-3">
            <Card
              v-for="template in filteredAgents"
              :key="template.id"
              class="p-4 cursor-pointer hover:shadow-md transition-all hover:ring-2 hover:ring-primary/20"
              @click="selectAgent(template)"
            >
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <component :is="getIconComponent(template.icon)" class="h-6 w-6 text-primary" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <h4 class="text-sm font-semibold text-foreground">{{ template.name }}</h4>
                    <Badge variant="secondary" class="text-xs capitalize shrink-0">
                      {{ template.category }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground leading-relaxed">{{ template.description }}</p>
                </div>
              </div>
            </Card>
          </div>
          <div v-if="filteredAgents.length === 0" class="text-center py-12">
            <p class="text-sm text-muted-foreground">No agents found</p>
          </div>
        </div>
      </div>

      <!-- Desktop layout -->
      <div class="flex-1 overflow-hidden hidden xl:flex">
        <div class="w-64 border-r flex flex-col">
          <div class="p-4 border-b">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                placeholder="Search..."
                class="pl-9 pr-9"
              />
              <button
                v-if="searchQuery"
                class="absolute right-3 top-1/2 -translate-y-1/2"
                @click="searchQuery = ''"
              >
                <X class="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-3">
              Categories
            </h3>
            <div class="space-y-1">
              <button
                v-for="category in categories"
                :key="category.id"
                :class="[
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                  selectedCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground',
                ]"
                @click="selectedCategory = category.id"
              >
                {{ category.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          <div class="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <Card
              v-for="template in filteredAgents"
              :key="template.id"
              class="p-4 cursor-pointer hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/20"
              @click="selectAgent(template)"
            >
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <component :is="getIconComponent(template.icon)" class="h-6 w-6 text-primary" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <h4 class="text-sm font-semibold text-foreground">{{ template.name }}</h4>
                    <Badge variant="secondary" class="text-xs capitalize shrink-0">
                      {{ template.category }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground leading-relaxed">{{ template.description }}</p>
                </div>
              </div>
            </Card>
          </div>
          <div v-if="filteredAgents.length === 0" class="text-center py-12">
            <p class="text-sm text-muted-foreground">No agents found</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
