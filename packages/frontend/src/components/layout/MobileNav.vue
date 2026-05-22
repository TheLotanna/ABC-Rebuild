<script setup lang="ts">
import { ref } from 'vue';
import {
  Library,
  Workflow,
  Settings,
  Plus,
  Play,
  Save,
  Upload,
  Trash2,
  Eraser,
  Bot,
} from '@lucide/vue';
import Button from '@/components/ui/Button.vue';

type Tab = 'library' | 'workflow' | 'properties';
type AppMode = 'workflow' | 'freeAgent';
type ViewMode = 'stacked' | 'canvas' | 'simple';

const props = withDefaults(
  defineProps<{
    activeTab: Tab;
    hasSelectedAgent: boolean;
    viewMode?: ViewMode;
    appMode?: AppMode;
  }>(),
  { appMode: 'workflow' },
);

const emit = defineEmits<{
  'tab-change': [tab: Tab];
  'add-stage': [];
  run: [];
  save: [];
  load: [file: File];
  clear: [];
  'clear-outputs': [];
  'toggle-view-mode': [];
  'set-app-mode': [mode: AppMode];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const showClearOutputsConfirm = ref(false);

function handleLoadClick() {
  fileInputRef.value?.click();
}

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    emit('load', file);
    input.value = '';
  }
}

function tabButtonClass(tab: Tab): string {
  const active = props.activeTab === tab;
  const base = 'flex-1 h-full flex flex-col items-center justify-center gap-1 transition-colors';
  const colorActive = active ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground';
  const dim = tab === 'properties' && !props.hasSelectedAgent ? 'opacity-50' : '';
  return [base, colorActive, dim].filter(Boolean).join(' ');
}

function modeButtonClass(mode: AppMode): string {
  const active = props.appMode === mode;
  return [
    'gap-1.5 rounded-md transition-colors px-2 h-8',
    active ? 'bg-background shadow-sm' : '',
  ].filter(Boolean).join(' ');
}

function confirmClearOutputs() {
  emit('clear-outputs');
  showClearOutputsConfirm.value = false;
}
</script>

<template>
  <div class="lg:hidden">
    <div class="h-14 border-b border-border bg-card flex items-center gap-2 px-4">
      <div class="flex items-center bg-muted rounded-lg p-1">
        <Button
          variant="ghost"
          size="sm"
          :class="modeButtonClass('workflow')"
          @click="emit('set-app-mode', 'workflow')"
        >
          <Workflow class="h-4 w-4" />
          <span class="text-xs">Workflow</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :class="modeButtonClass('freeAgent')"
          @click="emit('set-app-mode', 'freeAgent')"
        >
          <Bot class="h-4 w-4" />
          <span class="text-xs">Agent</span>
        </Button>
      </div>

      <template v-if="appMode === 'workflow'">
        <Button size="sm" variant="outline" class="gap-2" @click="emit('add-stage')">
          <Plus class="h-4 w-4" />
          Stage
        </Button>

        <Button size="sm" variant="outline" class="gap-2" title="Upload workflow" @click="handleLoadClick">
          <Upload class="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" class="gap-2" title="Save workflow" @click="emit('save')">
          <Save class="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" class="gap-2" title="Clear all" @click="emit('clear')">
          <Trash2 class="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          class="gap-2"
          title="Clear outputs"
          @click="showClearOutputsConfirm = true"
        >
          <Eraser class="h-4 w-4 text-orange-500" />
        </Button>

        <input
          ref="fileInputRef"
          type="file"
          accept=".json"
          class="hidden"
          @change="handleFileChange"
        />

        <Button
          size="sm"
          class="gap-2 bg-gradient-to-r from-primary to-primary/80 ml-auto"
          @click="emit('run')"
        >
          <Play class="h-4 w-4" />
          Run
        </Button>
      </template>
    </div>

    <div v-if="appMode === 'workflow'" class="h-14 border-b border-border bg-card flex items-center">
      <button :class="tabButtonClass('library')" @click="emit('tab-change', 'library')">
        <Library class="h-5 w-5" />
        <span class="text-xs font-medium">Library</span>
      </button>
      <button :class="tabButtonClass('workflow')" @click="emit('tab-change', 'workflow')">
        <Workflow class="h-5 w-5" />
        <span class="text-xs font-medium">Workflow</span>
      </button>
      <button
        :class="['relative', tabButtonClass('properties')]"
        :disabled="!hasSelectedAgent"
        @click="emit('tab-change', 'properties')"
      >
        <Settings class="h-5 w-5" />
        <span class="text-xs font-medium">Properties</span>
        <div
          v-if="hasSelectedAgent"
          class="absolute top-2 right-1/4 w-2 h-2 bg-primary rounded-full"
        />
      </button>
    </div>

    <div
      v-if="showClearOutputsConfirm"
      class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="showClearOutputsConfirm = false"
    >
      <div class="bg-card border border-border rounded-lg shadow-lg max-w-sm w-full p-6">
        <h3 class="text-lg font-semibold text-foreground mb-2">Are you sure?</h3>
        <p class="text-sm text-muted-foreground mb-6">
          This will clear all outputs and inputs from agents and functions. Your configurations
          and prompts will be preserved.
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="showClearOutputsConfirm = false">
            Cancel
          </Button>
          <Button
            size="sm"
            class="bg-orange-500 hover:bg-orange-600 text-white"
            @click="confirmClearOutputs"
          >
            Clear Outputs
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
