<script setup lang="ts">
import { ref, watch } from 'vue';
import { Trash2, FunctionSquare, Bot, Copy, Play } from '@lucide/vue';
import type { Stage } from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Button from '../ui/Button.vue';

const props = defineProps<{
  stage: Stage;
  width: number;
  height: number;
  canRunStage?: boolean;
  canClone?: boolean;
}>();

const emit = defineEmits<{
  delete: [];
  rename: [name: string];
  'add-agent': [];
  'add-function': [];
  clone: [];
  'run-stage': [];
  'drop-template': [template: unknown, nodeType: 'agent' | 'function' | 'tool'];
}>();

const isEditing = ref(false);
const stageName = ref(props.stage.name);
const isDragOver = ref(false);

watch(
  () => props.stage.name,
  v => { if (!isEditing.value) stageName.value = v; }
);

function handleRename() {
  if (stageName.value.trim()) {
    emit('rename', stageName.value);
    isEditing.value = false;
  }
}

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Enter') handleRename();
  else if (e.key === 'Escape') {
    stageName.value = props.stage.name;
    isEditing.value = false;
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer?.types.includes('agenttemplate')) {
    isDragOver.value = true;
  }
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  isDragOver.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  isDragOver.value = false;
  const templateData = e.dataTransfer?.getData('agentTemplate');
  const nodeType = (e.dataTransfer?.getData('nodeType') as 'agent' | 'function' | 'tool') || 'agent';
  if (templateData) {
    try {
      const template = JSON.parse(templateData);
      emit('drop-template', template, nodeType);
    } catch {
      // malformed payload — ignore
    }
  }
}
</script>

<template>
  <Card
    :class="[
      'border-2 bg-card/95 backdrop-blur-sm shadow-lg transition-colors',
      isDragOver ? 'border-primary bg-primary/10' : 'border-primary/20',
    ]"
    :style="{ width: `${width}px`, height: `${height}px` }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div class="p-3 pb-2 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <input
          v-if="isEditing"
          v-model="stageName"
          class="h-7 text-sm flex w-full rounded-md border border-input bg-background px-3 py-1 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          autofocus
          @blur="handleRename"
          @keydown="handleKey"
        />
        <h3
          v-else
          class="text-sm cursor-pointer hover:text-primary transition-colors font-semibold leading-none tracking-tight"
          @dblclick="isEditing = true"
        >
          {{ stage.name }}
        </h3>
        <div class="flex items-center gap-1">
          <Button
            v-if="canRunStage"
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            title="Run stage"
            @click="emit('run-stage')"
          >
            <Play class="h-3 w-3 text-primary" />
          </Button>
          <Button
            v-if="canClone"
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            title="Clone stage"
            @click="emit('clone')"
          >
            <Copy class="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 w-7 p-0"
            title="Delete stage"
            @click="emit('delete')"
          >
            <Trash2 class="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div class="flex gap-1">
        <Button variant="outline" size="sm" class="h-7 text-xs flex-1" @click="emit('add-agent')">
          <Bot class="h-3 w-3 mr-1" />
          Agent
        </Button>
        <Button variant="outline" size="sm" class="h-7 text-xs flex-1" @click="emit('add-function')">
          <FunctionSquare class="h-3 w-3 mr-1" />
          Function
        </Button>
      </div>
    </div>

    <div class="p-4 pt-0" :style="{ minHeight: `${Math.max(0, height - 100)}px` }">
      <slot />
    </div>
  </Card>
</template>
