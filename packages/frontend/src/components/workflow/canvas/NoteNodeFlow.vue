<script setup lang="ts">
import type { Note } from '@agent-builder/shared';
import { NodeResizer } from '@vue-flow/node-resizer';
import '@vue-flow/node-resizer/dist/style.css';
import NoteNode from '../NoteNode.vue';

interface NoteNodeFlowData {
  note: Note;
  onUpdate: (updates: Partial<Note>) => void;
  onDelete: () => void;
}

const props = defineProps<{
  id: string;
  data: NoteNodeFlowData;
  selected: boolean;
}>();

function onResizeEnd(evt: { params: { width: number; height: number } }) {
  props.data.onUpdate({ size: { width: evt.params.width, height: evt.params.height } });
}
</script>

<template>
  <NodeResizer
    :is-visible="selected"
    :min-width="150"
    :min-height="100"
    :max-width="600"
    :max-height="600"
    :handle-style="{ width: '12px', height: '12px', borderRadius: '2px' }"
    @resize-end="onResizeEnd"
  />
  <NoteNode
    :note="data.note"
    :selected="selected"
    @update="updates => data.onUpdate(updates)"
    @delete="data.onDelete"
  />
</template>
