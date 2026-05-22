<script setup lang="ts">
import type { Stage } from '@agent-builder/shared';
import StageNode from '../StageNode.vue';

/**
 * @vue-flow node-type adapter. @vue-flow calls custom nodes with the standard
 * NodeProps shape; this thin wrapper unpacks `data` into the props my
 * `StageNode.vue` expects and re-emits its events to the host
 * (`WorkflowCanvasMode.vue`) through a callbacks-in-data convention so the
 * canvas owner can wire them to the store.
 */
interface StageNodeData {
  stage: Stage;
  width: number;
  height: number;
  canRunStage?: boolean;
  canClone?: boolean;
  onDelete: () => void;
  onRename: (name: string) => void;
  onAddAgent: () => void;
  onAddFunction: () => void;
  onClone?: () => void;
  onRunStage?: () => void;
  onDropTemplate?: (template: unknown, nodeType: 'agent' | 'function' | 'tool') => void;
}

defineProps<{
  id: string;
  data: StageNodeData;
}>();
</script>

<template>
  <StageNode
    :stage="data.stage"
    :width="data.width"
    :height="data.height"
    :can-run-stage="data.canRunStage ?? !!data.onRunStage"
    :can-clone="data.canClone ?? !!data.onClone"
    @delete="data.onDelete"
    @rename="data.onRename"
    @add-agent="data.onAddAgent"
    @add-function="data.onAddFunction"
    @clone="data.onClone?.()"
    @run-stage="data.onRunStage?.()"
    @drop-template="(t, n) => data.onDropTemplate?.(t, n)"
  />
</template>
