<script setup lang="ts">
import { ref } from 'vue';
import { Copy, Check, X } from '@lucide/vue';
import { toast } from 'vue-sonner';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{
  open: boolean;
  content: string;
  label?: string;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const copied = ref(false);
const activeTab = ref<'markdown' | 'raw'>('markdown');

async function handleCopy() {
  await navigator.clipboard.writeText(props.content);
  copied.value = true;
  toast.success('Copied to clipboard');
  setTimeout(() => { copied.value = false; }, 2000);
}

function close() {
  emit('update:open', false);
}

function tabBtnClass(tab: 'markdown' | 'raw') {
  return [
    'px-3 py-1.5 text-sm rounded-md transition-colors',
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
    @click.self="close"
  >
    <div
      class="bg-background border rounded-lg flex flex-col shadow-xl"
      :style="{
        width: 'calc(100vw - 100px)',
        height: 'calc(100vh - 100px)',
        maxWidth: 'calc(100vw - 100px)',
        maxHeight: 'calc(100vh - 100px)',
      }"
    >
      <div class="px-4 py-3 border-b flex items-center justify-between shrink-0">
        <h2 class="text-lg font-semibold text-amber-700 dark:text-amber-300">
          {{ label || 'Scratchpad' }}
        </h2>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" class="h-8 px-2" @click="handleCopy">
            <Check v-if="copied" class="h-4 w-4 text-green-500" />
            <Copy v-else class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="close">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="flex-1 flex flex-col min-h-0">
        <div class="mx-4 mt-2 inline-flex bg-muted/50 rounded-lg p-1 w-fit shrink-0">
          <button :class="tabBtnClass('markdown')" @click="activeTab = 'markdown'">Markdown</button>
          <button :class="tabBtnClass('raw')" @click="activeTab = 'raw'">Raw</button>
        </div>

        <div v-if="activeTab === 'markdown'" class="flex-1 min-h-0 overflow-auto">
          <div class="p-4 max-w-none">
            <div v-if="content" class="whitespace-pre-wrap break-words text-sm">{{ content }}</div>
            <p v-else class="text-muted-foreground italic">No content</p>
          </div>
        </div>

        <div v-else class="flex-1 min-h-0 overflow-auto">
          <pre class="p-4 text-xs font-mono whitespace-pre-wrap break-words">{{ content || 'No content' }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
