<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  GripVertical,
  Plus,
  Trash2,
  Copy,
  Play,
  Minimize2,
  Maximize2,
} from 'lucide-vue-next';
import type { Stage as StageType, WorkflowNode } from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Button from '../ui/Button.vue';
import AgentNode from './AgentNode.vue';
import FunctionNode from './FunctionNode.vue';

const props = withDefaults(
  defineProps<{
    stage: StageType;
    stageNumber: number;
    stageIndex: number;
    selectedNode: string | null;
    connectingFrom: string | null;
    layoutId?: string;
  }>(),
  { layoutId: 'default' },
);

const emit = defineEmits<{
  'select-node': [id: string | null];
  'add-agent': [stageId: string, agentTemplate: unknown];
  'add-node': [stageId: string, template: unknown, nodeType: 'agent' | 'function' | 'tool'];
  'delete-node': [nodeId: string];
  'delete-stage': [stageId: string];
  'rename-stage': [stageId: string, name: string];
  'reorder-stages': [fromIndex: number, toIndex: number];
  'move-node-to-stage': [nodeId: string, targetStageId: string];
  'toggle-minimize': [nodeId: string];
  'toggle-lock': [nodeId: string];
  'port-click': [nodeId: string, isOutput: boolean, outputPort?: string, inputPort?: string];
  'run-agent': [agentId: string];
  'run-function': [functionId: string];
  'clone-stage': [stageId: string];
  'run-stage': [stageId: string];
  'request-add-agent': [stageId: string];
  'request-add-function': [stageId: string];
}>();

const isEditingName = ref(false);
const displayName = computed(() => props.stage.name || `Stage ${props.stageNumber}`);
const editedName = ref(displayName.value);
const stageMinimized = ref(false);

const completedNodes = computed(
  () => props.stage.nodes.filter((n) => n.status === 'complete').length,
);
const progress = computed(() =>
  props.stage.nodes.length > 0
    ? (completedNodes.value / props.stage.nodes.length) * 100
    : 0,
);

function handleToggleAllMinimize() {
  const targetMinimized = !stageMinimized.value;
  props.stage.nodes.forEach((node) => {
    if (node.minimized !== targetMinimized) {
      emit('toggle-minimize', node.id);
    }
  });
  stageMinimized.value = targetMinimized;
}

function handleDragStart(e: DragEvent) {
  if (!e.dataTransfer) return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('stageIndex', props.stageIndex.toString());
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  const templateData = e.dataTransfer?.types.includes('agenttemplate');
  const stageData = e.dataTransfer?.types.includes('text/plain');
  const nodeData = e.dataTransfer?.types.includes('existingnodeid');

  if (templateData || nodeData) {
    (e.currentTarget as HTMLElement).classList.add('border-primary');
  } else if (stageData && e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
}

function handleDragLeave(e: DragEvent) {
  (e.currentTarget as HTMLElement).classList.remove('border-primary');
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  (e.currentTarget as HTMLElement).classList.remove('border-primary');

  const templateData = e.dataTransfer?.getData('agentTemplate');
  const nodeType = e.dataTransfer?.getData('nodeType') as 'agent' | 'function' | 'tool' | '';
  const draggedStageIndex = e.dataTransfer?.getData('stageIndex');
  const draggedNodeId = e.dataTransfer?.getData('existingNodeId');

  if (draggedNodeId) {
    emit('move-node-to-stage', draggedNodeId, props.stage.id);
    return;
  }

  if (templateData) {
    const template = JSON.parse(templateData);
    if (nodeType && nodeType !== 'agent') {
      emit('add-node', props.stage.id, template, nodeType);
    } else {
      emit('add-agent', props.stage.id, template);
    }
  } else if (draggedStageIndex) {
    const fromIndex = parseInt(draggedStageIndex, 10);
    if (fromIndex !== props.stageIndex) {
      emit('reorder-stages', fromIndex, props.stageIndex);
    }
  }
}

function handleNameBlur() {
  if (editedName.value.trim() && editedName.value !== displayName.value) {
    emit('rename-stage', props.stage.id, editedName.value.trim());
  } else {
    editedName.value = displayName.value;
  }
  isEditingName.value = false;
}

function handleNameKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleNameBlur();
  else if (e.key === 'Escape') {
    editedName.value = displayName.value;
    isEditingName.value = false;
  }
}

function nodeWrapperClass(node: WorkflowNode): string {
  return node.minimized
    ? 'w-16 flex-shrink-0'
    : 'w-full md:w-[calc(50%-0.375rem)] flex-shrink-0';
}
</script>

<template>
  <Card
    class="p-3 bg-card/80 backdrop-blur border-border/60 shadow-md transition-colors w-full max-w-full"
    draggable="true"
    style="position: relative; z-index: 1"
    @dragstart="handleDragStart"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="flex items-center gap-3 mb-4 pb-3 border-b border-border/60">
      <GripVertical class="h-5 w-5 text-muted-foreground cursor-move hidden lg:block" />
      <div class="flex-1">
        <input
          v-if="isEditingName"
          v-model="editedName"
          class="h-7 text-sm font-semibold flex w-full rounded-md border border-input bg-background px-3 py-1 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          autofocus
          @blur="handleNameBlur"
          @keydown="handleNameKeyDown"
        />
        <h3
          v-else
          class="text-sm font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
          @click="isEditingName = true"
        >
          {{ displayName }}
        </h3>
        <p class="text-xs text-muted-foreground hidden lg:block">
          Drag agents here to add them
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        class="lg:hidden gap-2"
        @click="emit('request-add-agent', stage.id)"
      >
        <Plus class="h-4 w-4" />
        Add Agent
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="lg:hidden gap-2"
        @click="emit('request-add-function', stage.id)"
      >
        <Plus class="h-4 w-4" />
        Add Function
      </Button>

      <Button
        variant="ghost"
        size="sm"
        title="Run Stage"
        @click="emit('run-stage', stage.id)"
      >
        <Play class="h-4 w-4 text-primary" />
      </Button>

      <Button
        v-if="stage.nodes.length > 0"
        variant="ghost"
        size="sm"
        :title="stageMinimized ? 'Expand All' : 'Collapse All'"
        @click="handleToggleAllMinimize"
      >
        <Maximize2 v-if="stageMinimized" class="h-4 w-4" />
        <Minimize2 v-else class="h-4 w-4" />
      </Button>

      <Button variant="ghost" size="sm" title="Clone Stage" @click="emit('clone-stage', stage.id)">
        <Copy class="h-4 w-4" />
      </Button>

      <Button variant="ghost" size="sm" @click="emit('delete-stage', stage.id)">
        <Trash2 class="h-4 w-4 text-destructive" />
      </Button>
    </div>

    <div class="min-h-[100px]">
      <div
        v-if="stage.nodes.length === 0"
        class="flex items-center justify-center h-24 border-2 border-dashed border-border/50 rounded-lg"
      >
        <p class="text-sm text-muted-foreground hidden lg:block">
          Drop an agent or function here
        </p>
        <p class="text-sm text-muted-foreground lg:hidden">No nodes yet</p>
      </div>
      <div v-else class="flex flex-wrap gap-3 items-start">
        <div
          v-for="(node, index) in stage.nodes"
          :key="node.id"
          :id="`agent-${node.id}`"
          :class="nodeWrapperClass(node)"
        >
          <AgentNode
            v-if="node.nodeType === 'agent'"
            :agent="node"
            :is-selected="selectedNode === node.id"
            :is-connecting="connectingFrom !== null"
            :agent-number="`${stageNumber}.${index + 1}`"
            :stage-index="stageNumber - 1"
            :layout-id="layoutId"
            :can-run="true"
            @select="emit('select-node', node.id)"
            @delete="emit('delete-node', node.id)"
            @toggle-minimize="emit('toggle-minimize', node.id)"
            @toggle-lock="emit('toggle-lock', node.id)"
            @port-click="
              (nodeId: string, isOutput: boolean, outputPort?: string, inputPort?: string) =>
                emit('port-click', nodeId, isOutput, outputPort, inputPort)
            "
            @run="emit('run-agent', node.id)"
          />
          <FunctionNode
            v-else-if="node.nodeType === 'function'"
            :node="node"
            :is-selected="selectedNode === node.id"
            :is-connecting="connectingFrom !== null"
            :node-number="`${stageNumber}.${index + 1}`"
            :stage-index="stageNumber - 1"
            :layout-id="layoutId"
            :can-run="true"
            @select="emit('select-node', node.id)"
            @delete="emit('delete-node', node.id)"
            @toggle-minimize="emit('toggle-minimize', node.id)"
            @toggle-lock="emit('toggle-lock', node.id)"
            @port-click="
              (nodeId: string, isOutput: boolean, outputPort?: string, inputPort?: string) =>
                emit('port-click', nodeId, isOutput, outputPort, inputPort)
            "
            @run="emit('run-function', node.id)"
          />
          <div v-else class="text-xs text-muted-foreground p-2">
            Tool nodes coming soon
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 pt-3 border-t border-border/60">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-muted-foreground">Progress</span>
        <span class="text-xs font-medium text-foreground">{{ Math.round(progress) }}%</span>
      </div>
      <div class="h-2 bg-muted rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300"
          :style="{ width: `${progress}%` }"
        />
      </div>
    </div>
  </Card>
</template>
