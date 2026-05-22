<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { FileText, Image, Database, File, CheckCircle2, Volume2 } from '@lucide/vue';

interface ArtifactNodeData {
  type: 'artifact';
  label: string;
  status: 'idle' | 'success';
  artifactId?: string;
  artifactType?: 'text' | 'file' | 'image' | 'data' | 'audio';
}

const props = defineProps<{ data: ArtifactNodeData }>();

const icon = computed(() => {
  switch (props.data.artifactType) {
    case 'image': return Image;
    case 'audio': return Volume2;
    case 'data': return Database;
    case 'file': return File;
    default: return FileText;
  }
});

const typeLabel = computed(() => {
  switch (props.data.artifactType) {
    case 'image': return 'Generated Image';
    case 'audio': return 'Generated Audio';
    case 'data': return 'Data Output';
    case 'file': return 'Generated File';
    default: return 'Text Content';
  }
});
</script>

<template>
  <div class="w-48 rounded-lg border-2 border-green-300 dark:border-green-700 bg-green-50/90 dark:bg-green-950/40 shadow-md overflow-hidden">
    <Handle
      type="target"
      :position="Position.Left"
      class="!bg-green-500 !w-3 !h-3"
    />

    <div class="px-2 py-1.5 bg-green-200/80 dark:bg-green-900/60 border-b border-green-300 dark:border-green-700 flex items-center gap-2">
      <div class="text-green-600 dark:text-green-400">
        <component :is="icon" class="w-4 h-4" />
      </div>
      <span class="font-medium text-xs text-green-800 dark:text-green-200 truncate flex-1">
        {{ data.label }}
      </span>
      <CheckCircle2 class="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
    </div>

    <div class="px-2 py-1.5 flex items-center justify-between text-[10px] text-green-700/70 dark:text-green-300/70">
      <span>{{ typeLabel }}</span>
    </div>
  </div>
</template>
