<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { FileText, FileImage, FileArchive, FileAudio, File } from '@lucide/vue';
import { cn } from '@/lib/utils';

interface FileNodeData {
  type: 'file';
  label: string;
  status: 'idle' | 'active';
  fileId?: string;
  mimeType?: string;
}

const props = defineProps<{ data: FileNodeData }>();

const icon = computed(() => {
  const mimeType = props.data.mimeType || '';
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.includes('zip') || mimeType.includes('archive')) return FileArchive;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType.includes('text') || mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
  return File;
});
</script>

<template>
  <div
    :class="cn(
      'flex flex-col items-center justify-center',
      'w-[70px] h-[40px] rounded-md border',
      'bg-blue-500/10 border-blue-500/30',
      'shadow-sm cursor-pointer hover:shadow-md hover:border-blue-500/50 transition-all',
      data.status === 'active' && 'border-blue-500 bg-blue-500/20',
    )"
  >
    <Handle
      type="source"
      :position="Position.Bottom"
      class="!bg-blue-500 !w-2 !h-2"
    />
    <div class="text-blue-500 mb-0.5">
      <component :is="icon" class="w-4 h-4" />
    </div>
    <div class="text-[8px] font-medium text-foreground text-center px-1 truncate w-full">
      {{ data.label }}
    </div>
  </div>
</template>
