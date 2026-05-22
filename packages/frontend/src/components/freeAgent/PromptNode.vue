<script setup lang="ts">
import { Handle, Position, NodeResizer } from '@xyflow/vue';
import { MessageSquareText } from 'lucide-vue-next';

interface PromptNodeData {
  type: 'prompt';
  label: string;
  content: string;
  status?: 'idle' | 'active';
}

defineProps<{ data: PromptNodeData; selected?: boolean }>();
</script>

<template>
  <NodeResizer
    :min-width="200"
    :min-height="150"
    :is-visible="selected"
    line-class="border-blue-500"
    handle-class="bg-blue-500 border-2 border-background rounded"
    :handle-style="{ width: '12px', height: '12px' }"
  />

  <Handle type="source" :position="Position.Right" class="!w-3 !h-3 !bg-blue-500" />

  <div class="h-full w-full rounded-lg border-2 border-blue-300 dark:border-blue-700 bg-blue-50/90 dark:bg-blue-950/40 shadow-lg overflow-hidden flex flex-col">
    <div class="px-3 py-2 bg-blue-200/80 dark:bg-blue-900/60 border-b border-blue-300 dark:border-blue-700 flex items-center gap-2 shrink-0">
      <MessageSquareText class="w-4 h-4 text-blue-700 dark:text-blue-300" />
      <span class="font-semibold text-sm text-blue-800 dark:text-blue-200">
        {{ data.label || 'User Prompt' }}
      </span>
    </div>

    <div
      class="flex-1 overflow-auto min-h-0 nodrag"
      @pointerdown.stop
      @wheel.stop
    >
      <div class="p-3 text-xs whitespace-pre-wrap break-words text-blue-900 dark:text-blue-100">
        <template v-if="data.content">{{ data.content }}</template>
        <p v-else class="text-blue-600/60 dark:text-blue-400/60 italic">
          No prompt provided
        </p>
      </div>
    </div>
  </div>
</template>
