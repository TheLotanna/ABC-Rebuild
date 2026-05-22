<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
  Play,
  Plus,
  Save,
  Upload,
  Trash2,
  HelpCircle,
  LayoutGrid,
  LayoutList,
  Eye,
  Eraser,
  Bot,
  Workflow,
  Sun,
  Moon,
} from '@lucide/vue';
import { useColorMode } from '@vueuse/core';
import Button from '@/components/ui/Button.vue';
import HelpModal from '@/components/help/HelpModal.vue';

// Reuses the same reactive store bootstrapped in App.vue; just reading +
// flipping. `useColorMode` is idempotent across instances.
const colorMode = useColorMode({
  attribute: 'class',
  selector: 'html',
  modes: { light: '', dark: 'dark' },
});
const isDark = computed(() => colorMode.value === 'dark');
function toggleTheme() {
  colorMode.value = isDark.value ? 'light' : 'dark';
}

type AppMode = 'workflow' | 'freeAgent';
type ViewMode = 'stacked' | 'canvas' | 'simple';

const props = withDefaults(
  defineProps<{
    appMode?: AppMode;
    viewMode: ViewMode;
  }>(),
  { appMode: 'workflow' },
);

const emit = defineEmits<{
  'add-stage': [];
  save: [];
  load: [file: File];
  clear: [];
  'clear-outputs': [];
  run: [];
  'set-view-mode': [mode: ViewMode];
  'set-app-mode': [mode: AppMode];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isCompact = ref(false);
const viewMenuOpen = ref(false);
const clearOutputsConfirm = ref(false);
const helpOpen = ref(false);

function checkWidth() {
  isCompact.value = window.innerWidth < 1400;
}

onMounted(() => {
  checkWidth();
  window.addEventListener('resize', checkWidth);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkWidth);
});

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

function pickView(v: ViewMode) {
  emit('set-view-mode', v);
  viewMenuOpen.value = false;
}

function modeButtonClass(mode: AppMode): string {
  return [
    'gap-2 rounded-md transition-colors',
    props.appMode === mode ? 'bg-background shadow-sm' : '',
  ].filter(Boolean).join(' ');
}

function confirmClearOutputs() {
  emit('clear-outputs');
  clearOutputsConfirm.value = false;
}
</script>

<template>
  <header
    class="h-16 border-b border-border bg-card items-center justify-between px-6 shadow-sm hidden lg:flex"
  >
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center"
        >
          <span class="font-bold text-primary-foreground text-lg">ABC</span>
        </div>
      </div>

      <div class="flex items-center bg-muted rounded-lg p-1 ml-2">
        <Button
          variant="ghost"
          size="sm"
          :class="modeButtonClass('workflow')"
          :title="isCompact ? 'Workflow' : undefined"
          @click="emit('set-app-mode', 'workflow')"
        >
          <Workflow class="h-4 w-4" />
          <span v-if="!isCompact">Workflow</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          :class="modeButtonClass('freeAgent')"
          :title="isCompact ? 'Free Agent' : undefined"
          @click="emit('set-app-mode', 'freeAgent')"
        >
          <Bot class="h-4 w-4" />
          <span v-if="!isCompact">Free Agent</span>
        </Button>
      </div>
    </div>

    <div v-if="appMode === 'workflow'" class="flex items-center gap-2">
      <Button variant="ghost" size="sm" class="gap-2" @click="emit('add-stage')">
        <Plus class="h-4 w-4" />
        Add Stage
      </Button>

      <div class="relative">
        <Button variant="outline" size="sm" class="gap-2" @click="viewMenuOpen = !viewMenuOpen">
          <template v-if="viewMode === 'canvas'">
            <LayoutGrid class="h-4 w-4" />
            Canvas
          </template>
          <template v-else-if="viewMode === 'simple'">
            <Eye class="h-4 w-4" />
            Simple
          </template>
          <template v-else>
            <LayoutList class="h-4 w-4" />
            Stacked
          </template>
        </Button>
        <div
          v-if="viewMenuOpen"
          class="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-md shadow-lg z-50"
          @click.stop
        >
          <button
            class="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
            @click="pickView('stacked')"
          >
            <LayoutList class="h-4 w-4" />
            Stacked
          </button>
          <button
            class="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
            @click="pickView('canvas')"
          >
            <LayoutGrid class="h-4 w-4" />
            Canvas
          </button>
          <button
            class="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
            @click="pickView('simple')"
          >
            <Eye class="h-4 w-4" />
            Simple
          </button>
        </div>
      </div>

      <div class="w-px h-6 bg-border mx-2" />

      <Button
        variant="outline"
        size="sm"
        class="gap-2"
        :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
        @click="toggleTheme"
      >
        <Sun v-if="isDark" class="h-4 w-4" />
        <Moon v-else class="h-4 w-4" />
      </Button>

      <Button variant="outline" size="sm" class="gap-2" @click="handleLoadClick">
        <Upload class="h-4 w-4" />
        Load
      </Button>
      <input ref="fileInputRef" type="file" accept=".json" class="hidden" @change="handleFileChange" />
      <Button variant="outline" size="sm" class="gap-2" @click="emit('save')">
        <Save class="h-4 w-4" />
        Save
      </Button>
      <Button variant="outline" size="sm" class="gap-2" @click="emit('clear')">
        <Trash2 class="h-4 w-4" />
        Clear
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="gap-2"
        @click="helpOpen = true"
      >
        <HelpCircle class="h-4 w-4" />
        Help
      </Button>

      <HelpModal :open="helpOpen" @update:open="helpOpen = $event" />

      <div class="w-px h-6 bg-border mx-2" />

      <Button
        size="sm"
        class="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:opacity-90"
        @click="emit('run')"
      >
        <Play class="h-4 w-4" />
        Run Workflow
      </Button>
      <Button
        size="sm"
        class="gap-2 bg-orange-500 text-white hover:bg-orange-600"
        @click="clearOutputsConfirm = true"
      >
        <Eraser class="h-4 w-4" />
        Clear Outputs
      </Button>
    </div>

    <div
      v-if="clearOutputsConfirm"
      class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="clearOutputsConfirm = false"
    >
      <div class="bg-card border border-border rounded-lg shadow-lg max-w-sm w-full p-6">
        <h3 class="text-lg font-semibold text-foreground mb-2">Are you sure?</h3>
        <p class="text-sm text-muted-foreground mb-6">
          This will clear all outputs and inputs from agents and functions. Your configurations and
          prompts will be preserved.
        </p>
        <div class="flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="clearOutputsConfirm = false">Cancel</Button>
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
  </header>
</template>
