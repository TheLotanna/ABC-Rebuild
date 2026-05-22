<script setup lang="ts">
import { computed } from 'vue';
import {
  Play,
  CheckCircle2,
  AlertCircle,
  Circle,
  Trash2,
  Minimize2,
  Copy,
  Lock,
  Unlock,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { FunctionNode as FunctionNodeData, FunctionDefinition } from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';
import { iconFor } from './iconRegistry';

const props = withDefaults(
  defineProps<{
    node: FunctionNodeData;
    isSelected: boolean;
    isConnecting: boolean;
    nodeNumber: string;
    stageIndex: number;
    layoutId?: string;
    canRun?: boolean;
    /** Optional pre-resolved function definition — host supplies via `getFunctionById`. */
    functionDef?: FunctionDefinition | null;
  }>(),
  { layoutId: 'default', canRun: false, functionDef: null }
);

const emit = defineEmits<{
  select: [];
  delete: [];
  'toggle-minimize': [];
  'toggle-lock': [];
  'port-click': [nodeId: string, isOutput: boolean, outputPort?: string, inputPort?: string];
  run: [];
  'drag-start': [event: DragEvent, nodeId: string];
}>();

const statusConfig = {
  idle: { icon: Circle, color: 'text-muted-foreground' },
  running: { icon: Play, color: 'text-warning' },
  complete: { icon: CheckCircle2, color: 'text-success' },
  error: { icon: AlertCircle, color: 'text-destructive' },
} as const;

const Icon = computed(() => iconFor(props.functionDef?.iconName));
const statusInfo = computed(() => statusConfig[props.node.status]);
const StatusIcon = computed(() => statusInfo.value.icon);

const statusStyles: Record<FunctionNodeData['status'], string> = {
  running: 'bg-yellow-50 dark:bg-yellow-950/20',
  complete: 'ring-2 ring-green-500',
  error: 'ring-2 ring-destructive',
  idle: '',
};

const inputPorts = computed(() => props.node.inputPorts ?? ['input']);
const hasMultipleInputs = computed(() => inputPorts.value.length > 1);

const logicGatePass = computed(() => {
  if (props.node.functionType !== 'logic_gate') return null;
  const gateType = ((props.node.config.gateType as string) || 'AND').toUpperCase();
  const nonNull = inputPorts.value.map(port => {
    const value = props.node.inputs?.[port];
    return value !== undefined && value !== null && value.trim() !== '';
  });
  const allNonNull = nonNull.every(Boolean);
  const anyNonNull = nonNull.some(Boolean);
  const allNull = nonNull.every(v => !v);
  const anyNull = nonNull.some(v => !v);
  switch (gateType) {
    case 'AND': return allNonNull;
    case 'OR': return anyNonNull;
    case 'NAND': return allNull;
    case 'NOR': return anyNull;
    default: return allNonNull;
  }
});

function inputHasData(portName: string): boolean {
  const v = props.node.inputs?.[portName];
  return !!v && v.trim().length > 0;
}
function outputHasData(portName: string): boolean {
  const v = props.node.outputs?.[portName];
  return !!v && v.trim().length > 0;
}
function inputPortStyle(idx: number): Record<string, string> {
  const count = inputPorts.value.length;
  return {
    left: count > 1 ? `${((idx + 1) / (count + 1)) * 100}%` : '50%',
    transform: 'translateX(-50%)',
  };
}
function outputPortStyle(idx: number): Record<string, string> {
  const count = props.node.outputPorts.length;
  return {
    left: count > 1 ? `${((idx + 1) / (count + 1)) * 100}%` : '50%',
    transform: 'translateX(-50%)',
  };
}

function handleDelete(e: MouseEvent) {
  e.stopPropagation();
  if (confirm(`Delete function "${props.node.name}"?`)) emit('delete');
}
function handleToggleMinimize(e: MouseEvent) {
  e.stopPropagation();
  emit('toggle-minimize');
}
function handleToggleLock(e: MouseEvent) {
  e.stopPropagation();
  emit('toggle-lock');
}
async function handleCopy(e: MouseEvent) {
  e.stopPropagation();
  if (!props.node.output) {
    toast.error('No output', { description: "This function hasn't generated any output yet." });
    return;
  }
  try {
    await navigator.clipboard.writeText(props.node.output);
    toast.success('Copied', { description: 'Output copied to clipboard' });
  } catch {
    toast.error('Failed to copy', { description: 'Could not copy to clipboard' });
  }
}
function handleRun(e: MouseEvent) {
  e.stopPropagation();
  emit('run');
}
function handleDragStart(e: DragEvent) {
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('existingNodeId', props.node.id);
  }
  emit('drag-start', e, props.node.id);
}

const connectedInputCount = computed(
  () => inputPorts.value.filter(p => props.node.inputs?.[p]?.trim()).length
);
const populatedOutputCount = computed(
  () => props.node.outputPorts.filter(p => props.node.outputs?.[p]?.trim()).length
);
</script>

<template>
  <Card
    v-if="node.minimized"
    :class="[
      'w-16 h-16 cursor-pointer transition-all hover:shadow-lg backdrop-blur-sm flex items-center justify-center relative',
      isSelected ? 'ring-2 ring-primary shadow-lg' : '',
      statusStyles[node.status],
      functionDef?.color || 'bg-card/50',
    ]"
    style="position: relative; z-index: 20"
    draggable="true"
    @click="emit('toggle-minimize')"
    @dragstart="handleDragStart"
  >
    <div
      v-for="(portName, idx) in inputPorts"
      :key="`in-${portName}`"
      :id="`port-input-${node.id}-${portName}-${layoutId}`"
      :class="[
        'absolute -top-2 w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        inputHasData(portName) ? 'bg-green-500 ring-2 ring-green-300' : 'bg-primary',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      :style="inputPortStyle(idx)"
      @click.stop="emit('port-click', node.id, false, undefined, portName)"
    />
    <div
      v-for="(portName, idx) in node.outputPorts"
      :key="`out-${portName}`"
      :id="`port-output-${node.id}-${portName}-${layoutId}`"
      :class="[
        'absolute -bottom-2 w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        outputHasData(portName) ? 'bg-green-500 ring-2 ring-green-300' : 'bg-primary',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      :style="outputPortStyle(idx)"
      @click.stop="emit('port-click', node.id, true, portName)"
    />
    <div class="text-center">
      <div class="flex items-center justify-center gap-0.5">
        <div class="text-xs font-bold text-foreground">{{ nodeNumber }}</div>
        <Lock v-if="node.locked" class="h-2.5 w-2.5 text-muted-foreground" />
      </div>
      <component :is="StatusIcon" :class="['h-3 w-3 mx-auto mt-0.5', statusInfo.color]" />
    </div>
  </Card>

  <Card
    v-else
    :class="[
      'p-3 cursor-pointer transition-all hover:shadow-lg w-full min-w-[240px] backdrop-blur-sm group',
      isSelected ? 'ring-2 ring-primary shadow-lg' : '',
      statusStyles[node.status],
      functionDef?.color || 'bg-card/50',
    ]"
    style="position: relative; z-index: 20"
    draggable="true"
    @click="emit('select')"
    @dragstart="handleDragStart"
  >
    <div
      v-for="(portName, idx) in inputPorts"
      :key="`in-${portName}`"
      :id="`port-input-${node.id}-${portName}-${layoutId}`"
      :class="[
        'absolute -top-2 w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        inputHasData(portName) ? 'bg-green-500 ring-2 ring-green-300' : 'bg-primary',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      :style="inputPortStyle(idx)"
      :title="portName"
      @click.stop="emit('port-click', node.id, false, undefined, portName)"
    />
    <div
      v-for="(portName, idx) in node.outputPorts"
      :key="`out-${portName}`"
      :id="`port-output-${node.id}-${portName}-${layoutId}`"
      :class="[
        'absolute -bottom-2 w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        outputHasData(portName) ? 'bg-green-500 ring-2 ring-green-300' : 'bg-primary',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      :style="outputPortStyle(idx)"
      :title="portName"
      @click.stop="emit('port-click', node.id, true, portName)"
    />

    <div class="space-y-3">
      <div class="flex items-start gap-2">
        <div
          :class="[
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            functionDef?.color || 'bg-primary/10',
          ]"
        >
          <component :is="Icon" class="h-4 w-4" />
        </div>

        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-1.5">
            <h4 class="text-sm font-semibold text-foreground truncate">{{ node.name }}</h4>
            <Lock v-if="node.locked" class="h-3 w-3 text-muted-foreground flex-shrink-0" />
          </div>

          <div class="flex items-center gap-0.5 flex-wrap">
            <Button
              v-if="canRun && node.status !== 'running'"
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0"
              title="Run function"
              @click="handleRun"
            >
              <Play class="h-3 w-3 text-primary" />
            </Button>
            <Button variant="ghost" size="sm" class="h-6 w-6 p-0" title="Copy output" @click="handleCopy">
              <Copy class="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0"
              :title="node.locked ? 'Unlock function' : 'Lock function'"
              @click="handleToggleLock"
            >
              <Lock v-if="node.locked" class="h-3 w-3" />
              <Unlock v-else class="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" class="h-6 w-6 p-0" @click="handleToggleMinimize">
              <Minimize2 class="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" class="h-6 w-6 p-0" @click="handleDelete">
              <Trash2 class="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <div :class="['flex items-center gap-1', statusInfo.color]">
          <component :is="StatusIcon" class="h-3 w-3" />
          <span class="text-xs capitalize">{{ node.status }}</span>
        </div>
        <Badge variant="secondary" class="text-xs">
          {{ functionDef?.category || 'function' }}
        </Badge>
        <Badge
          v-if="logicGatePass !== null"
          variant="outline"
          :class="[
            'text-xs',
            logicGatePass
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500'
              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500',
          ]"
        >
          {{ logicGatePass ? 'PASS' : 'BLOCK' }}
        </Badge>
        <Badge v-if="hasMultipleInputs" variant="outline" class="text-xs">
          {{ inputPorts.length }} inputs
        </Badge>
        <Badge v-if="node.outputPorts.length > 1" variant="outline" class="text-xs">
          {{ node.outputPorts.length }} outputs
        </Badge>
      </div>

      <p class="text-xs text-muted-foreground line-clamp-2">
        {{ functionDef?.description || 'Custom function' }}
      </p>

      <div v-if="hasMultipleInputs" class="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>Inputs: {{ inputPorts.length }}</span>
        <span class="text-muted-foreground/50">•</span>
        <span class="text-green-600 dark:text-green-400">{{ connectedInputCount }} connected</span>
      </div>

      <div v-if="node.outputPorts.length > 1" class="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>Outputs: {{ node.outputPorts.length }}</span>
        <span class="text-muted-foreground/50">•</span>
        <span class="text-green-600 dark:text-green-400">{{ populatedOutputCount }} with data</span>
      </div>
    </div>
  </Card>
</template>
