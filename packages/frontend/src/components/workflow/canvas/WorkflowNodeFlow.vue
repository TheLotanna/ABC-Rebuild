<script setup lang="ts">
import type { WorkflowNode } from '@agent-builder/shared';
import WorkflowNodeComponent from '../WorkflowNodeComponent.vue';

interface WorkflowNodeFlowData {
  node: WorkflowNode;
  selected: boolean;
  isConnecting: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRun: () => void;
  onPortClick: (outputPort?: string) => void;
  onToggleLock: () => void;
}

defineProps<{
  id: string;
  data: WorkflowNodeFlowData;
}>();
</script>

<template>
  <WorkflowNodeComponent
    :node="data.node"
    :selected="data.selected"
    :is-connecting="data.isConnecting"
    @select="data.onSelect"
    @delete="data.onDelete"
    @run="data.onRun"
    @port-click="port => data.onPortClick(port)"
    @toggle-lock="data.onToggleLock"
  />
</template>
