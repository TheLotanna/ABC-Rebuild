<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@xyflow/vue';
import {
  Database,
  Search,
  Globe,
  Github,
  Cloud,
  CheckCircle2,
  Image,
  Volume2,
  Binary,
} from 'lucide-vue-next';
import type { FreeAgentNodeData } from '@agent-builder/shared';

const props = defineProps<{ data: FreeAgentNodeData & { isBinary?: boolean } }>();

// AttributeViewerModal lives in another slice. Surface a click event so a
// parent (FreeAgentCanvas) can open the modal — keeps this node decoupled
// from the modal component tree.
const emit = defineEmits<{
  (e: 'open-viewer', payload: {
    attributeName: string;
    attributeValue: string;
    attributeTool?: string;
    isBinary?: boolean;
    mimeType?: string;
  }): void;
}>();

const icon = computed(() => {
  if (props.data.isBinary) {
    if (props.data.mimeType?.startsWith('image/')) return Image;
    if (props.data.mimeType?.startsWith('audio/')) return Volume2;
    return Binary;
  }
  switch (props.data.attributeTool) {
    case 'brave_search':
    case 'google_search': return Search;
    case 'web_scrape': return Globe;
    case 'read_github_repo':
    case 'read_github_file': return Github;
    case 'get_call_api':
    case 'post_call_api': return Cloud;
    case 'image_generation': return Image;
    case 'elevenlabs_tts': return Volume2;
    default: return Database;
  }
});

const formattedSize = computed(() => {
  const bytes = props.data.size || 0;
  if (props.data.isBinary || bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} chars`;
});

const palette = computed(() => {
  if (props.data.isBinary) {
    return {
      border: 'border-purple-300 dark:border-purple-700 hover:border-purple-400 dark:hover:border-purple-500',
      bg: 'bg-purple-50/90 dark:bg-purple-950/40',
      headerBg: 'bg-purple-200/80 dark:bg-purple-900/60 border-purple-300 dark:border-purple-700',
      text: 'text-purple-600 dark:text-purple-400',
      label: 'text-purple-800 dark:text-purple-200',
      meta: 'text-purple-700/70 dark:text-purple-300/70',
      handle: '!bg-purple-500 !w-3 !h-3',
    };
  }
  return {
    border: 'border-cyan-300 dark:border-cyan-700 hover:border-cyan-400 dark:hover:border-cyan-500',
    bg: 'bg-cyan-50/90 dark:bg-cyan-950/40',
    headerBg: 'bg-cyan-200/80 dark:bg-cyan-900/60 border-cyan-300 dark:border-cyan-700',
    text: 'text-cyan-600 dark:text-cyan-400',
    label: 'text-cyan-800 dark:text-cyan-200',
    meta: 'text-cyan-700/70 dark:text-cyan-300/70',
    handle: '!bg-cyan-500 !w-3 !h-3',
  };
});

function handleClick() {
  emit('open-viewer', {
    attributeName: props.data.attributeName || '',
    attributeValue: props.data.attributeValue || '',
    attributeTool: props.data.attributeTool,
    isBinary: props.data.isBinary,
    mimeType: props.data.mimeType,
  });
}
</script>

<template>
  <div
    @click="handleClick"
    class="w-52 rounded-lg border-2 shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-all"
    :class="[palette.border, palette.bg]"
  >
    <Handle type="target" :position="Position.Left" :class="palette.handle" />

    <div class="px-2 py-1.5 border-b flex items-center gap-2" :class="palette.headerBg">
      <div :class="palette.text">
        <component :is="icon" class="w-4 h-4" />
      </div>
      <span class="font-mono font-medium text-xs truncate flex-1" :class="palette.label">
        {{ `{{${data.attributeName}}}` }}
      </span>
      <span
        v-if="data.isBinary"
        class="text-[9px] bg-purple-500/20 text-purple-700 dark:text-purple-300 px-1 rounded"
      >
        BINARY
      </span>
      <CheckCircle2 class="w-3.5 h-3.5" :class="palette.text" />
    </div>

    <div class="px-2 py-1.5 flex items-center justify-between text-[10px]" :class="palette.meta">
      <span class="truncate">{{ data.attributeTool }}</span>
      <span class="font-mono">{{ formattedSize }}</span>
    </div>
  </div>
</template>
