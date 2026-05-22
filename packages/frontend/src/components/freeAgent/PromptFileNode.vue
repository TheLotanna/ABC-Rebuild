<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { FileText, FileImage, FileCode, FileArchive, File } from '@lucide/vue';

interface PromptFileNodeData {
  type: 'promptFile';
  label: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  status?: 'idle' | 'reading';
}

const props = defineProps<{ data: PromptFileNodeData }>();

const icon = computed(() => {
  const m = props.data.mimeType;
  if (m.startsWith('image/')) return FileImage;
  if (m.includes('pdf')) return FileText;
  if (m.includes('zip') || m.includes('archive')) return FileArchive;
  if (m.includes('javascript') || m.includes('typescript') || m.includes('json') || m.includes('text/')) return FileCode;
  return File;
});

const formattedSize = computed(() => {
  const bytes = props.data.size;
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
});

const mimeShort = computed(() => props.data.mimeType.split('/')[1] || props.data.mimeType);
</script>

<template>
  <Handle
    type="source"
    :position="Position.Right"
    class="!w-2 !h-2 !bg-emerald-500"
  />
  <div
    class="w-48 rounded-lg border-2 bg-emerald-50/90 dark:bg-emerald-950/40 shadow-md overflow-hidden transition-colors"
    :class="data.status === 'reading'
      ? 'border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-400/50'
      : 'border-emerald-300 dark:border-emerald-700'"
  >
    <div class="px-2 py-1.5 bg-emerald-200/80 dark:bg-emerald-900/60 border-b border-emerald-300 dark:border-emerald-700 flex items-center gap-2">
      <component :is="icon" class="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" />
      <span class="font-medium text-xs text-emerald-800 dark:text-emerald-200 truncate">
        {{ data.filename }}
      </span>
    </div>

    <div class="px-2 py-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
      <span class="truncate">{{ mimeShort }}</span>
      <span>{{ formattedSize }}</span>
    </div>

    <div v-if="data.status === 'reading'" class="px-2 pb-1.5">
      <span class="px-2 py-0.5 text-[10px] bg-emerald-500 text-white rounded-full animate-pulse">
        Reading...
      </span>
    </div>
  </div>
</template>
