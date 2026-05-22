<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Settings, RotateCcw, Save, X } from '@lucide/vue';
import { toast } from 'vue-sonner';
import {
  DEFAULT_ENHANCEMENT_PROMPT,
  getStoredEnhancementPrompt,
  setStoredEnhancementPrompt,
} from '@/lib/enhancePromptStorage';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const promptTemplate = ref('');
const hasChanges = ref(false);

watch(
  () => props.open,
  (next) => {
    if (next) {
      promptTemplate.value = getStoredEnhancementPrompt();
      hasChanges.value = false;
    }
  },
  { immediate: true },
);

function onTemplateChange(value: string) {
  promptTemplate.value = value;
  hasChanges.value = value !== getStoredEnhancementPrompt();
}

function handleSave() {
  setStoredEnhancementPrompt(promptTemplate.value);
  hasChanges.value = false;
  toast.success('Enhancement prompt template saved');
}

function handleReset() {
  promptTemplate.value = DEFAULT_ENHANCEMENT_PROMPT;
  hasChanges.value = DEFAULT_ENHANCEMENT_PROMPT !== getStoredEnhancementPrompt();
}

function close() {
  emit('update:open', false);
}

const isModified = computed(() => promptTemplate.value !== DEFAULT_ENHANCEMENT_PROMPT);
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div
      class="bg-background border rounded-lg shadow-xl flex flex-col p-0"
      :style="{
        width: 'calc(100% - 50px)',
        height: 'calc(100% - 50px)',
        maxWidth: 'calc(100% - 50px)',
        maxHeight: 'calc(100% - 50px)',
      }"
    >
      <div class="px-3 py-2 border-b bg-muted/30 shrink-0 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <Settings class="w-4 h-4 text-amber-500 shrink-0" />
          <h2 class="text-base font-semibold truncate">Enhancement Prompt Settings</h2>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span v-if="isModified" class="text-xs text-amber-500">Modified</span>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="close">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="flex-1 flex flex-col min-h-0 overflow-hidden p-3 gap-3">
        <div class="shrink-0">
          <label class="text-sm text-muted-foreground">
            Customize the system prompt used when enhancing your task descriptions.
            The tools list and files will be appended automatically.
          </label>
        </div>

        <div class="flex-1 min-h-0 border rounded-md overflow-hidden">
          <textarea
            :value="promptTemplate"
            @input="onTemplateChange(($event.target as HTMLTextAreaElement).value)"
            class="h-full w-full border-0 rounded-none resize-none font-mono text-sm p-3 bg-background outline-none focus-visible:ring-0"
            placeholder="Enter your custom enhancement prompt template..."
          />
        </div>
      </div>

      <div class="px-3 py-2 border-t bg-muted/30 shrink-0">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="outline" size="sm" class="gap-1" @click="handleReset">
            <RotateCcw class="w-3 h-3" />
            Reset to Default
          </Button>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="close">Cancel</Button>
            <Button size="sm" class="gap-1" :disabled="!hasChanges" @click="handleSave">
              <Save class="w-3 h-3" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
