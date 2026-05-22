<script setup lang="ts">
import { ref, watch, nextTick, inject } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { NodeResizer } from '@vue-flow/node-resizer';
import { ClipboardEdit, Maximize2 } from '@lucide/vue';
import { OpenScratchpadViewerKey } from './viewerInjectionKeys';

interface ScratchpadNodeData {
  type: 'scratchpad';
  label: string;
  content: string;
  isWriting?: boolean;
  onContentChange?: (content: string) => void;
}

const props = defineProps<{ data: ScratchpadNodeData; selected?: boolean }>();

// ScratchpadViewerModal lives in another slice. Primary path is the injected
// callback (provided by FreeAgentView); `emit('open-viewer')` remains as a
// fallback for when the node is rendered outside FreeAgentCanvas.
const emit = defineEmits<{
  (e: 'open-viewer', payload: { content: string; label: string }): void;
}>();

const openScratchpadViewer = inject(OpenScratchpadViewerKey, null);

const isEditing = ref(false);
const localContent = ref(props.data.content || '');
const scrollRef = ref<HTMLDivElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.data.content,
  (next) => {
    localContent.value = next || '';
    nextTick(() => {
      if (scrollRef.value) {
        scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
      }
    });
  },
);

function handleDoubleClick() {
  isEditing.value = true;
  nextTick(() => textareaRef.value?.focus());
}

function commit() {
  isEditing.value = false;
  if (props.data.onContentChange) {
    props.data.onContentChange(localContent.value);
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') commit();
}

function handleExpandClick(e: MouseEvent) {
  e.stopPropagation();
  const payload = { content: localContent.value, label: props.data.label };
  if (openScratchpadViewer) {
    openScratchpadViewer(payload);
  } else {
    emit('open-viewer', payload);
  }
}
</script>

<template>
  <NodeResizer
    :min-width="280"
    :min-height="200"
    :is-visible="selected"
    line-class="border-amber-500"
    handle-class="bg-amber-500 border-2 border-background rounded"
    :handle-style="{ width: '12px', height: '12px' }"
  />

  <Handle type="target" :position="Position.Left" class="!w-3 !h-3 !bg-amber-500" />
  <Handle type="source" :position="Position.Right" id="attributes" class="!w-3 !h-3 !bg-cyan-500" />

  <div
    class="h-full w-full rounded-lg border-2 bg-amber-50/90 dark:bg-amber-950/40 shadow-lg overflow-hidden flex flex-col transition-colors"
    :class="data.isWriting
      ? 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-400/50'
      : 'border-amber-300 dark:border-amber-700'"
    @dblclick="handleDoubleClick"
  >
    <div class="px-3 py-2 bg-amber-200/80 dark:bg-amber-900/60 border-b border-amber-300 dark:border-amber-700 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2">
        <ClipboardEdit class="w-4 h-4 text-amber-700 dark:text-amber-300" />
        <span class="font-semibold text-sm text-amber-800 dark:text-amber-200">
          {{ data.label || 'Scratchpad' }}
        </span>
        <span
          v-if="data.isWriting"
          class="px-2 py-0.5 text-[10px] bg-amber-500 text-white rounded-full animate-pulse"
        >
          Writing...
        </span>
      </div>
      <button
        type="button"
        class="h-6 w-6 inline-flex items-center justify-center rounded-md text-amber-700 dark:text-amber-300 hover:bg-amber-300/50"
        @click="handleExpandClick"
      >
        <Maximize2 class="w-3 h-3" />
      </button>
    </div>

    <div
      class="flex-1 overflow-hidden min-h-0 nodrag"
      @pointerdown.stop
      @wheel.stop
    >
      <textarea
        v-if="isEditing"
        ref="textareaRef"
        v-model="localContent"
        @blur="commit"
        @keydown="handleKeyDown"
        class="h-full w-full resize-none border-none bg-transparent outline-none text-xs font-mono p-3"
        placeholder="Agent will write results here..."
      />
      <div v-else ref="scrollRef" class="h-full overflow-auto">
        <div class="p-3 text-xs whitespace-pre-wrap break-words text-amber-900 dark:text-amber-100">
          <template v-if="localContent">{{ localContent }}</template>
          <p v-else class="text-amber-600/60 dark:text-amber-400/60 italic text-center py-8">
            Agent's working output will appear here...
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
