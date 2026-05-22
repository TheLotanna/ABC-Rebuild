<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import {
  Brain,
  FileText,
  Trash2,
  Play,
  Circle,
  CheckCircle,
  XCircle,
  Loader2,
  Bot,
  Search,
  BarChart,
  FunctionSquare,
  Lock,
  LockOpen,
} from '@lucide/vue';

// `@lucide/vue` doesn't export a `LucideIcon` named type; icons are plain
// Vue components, so `Component` from Vue captures them.
type LucideIcon = Component;
import type {
  WorkflowNode,
  AgentNode as AgentNodeData,
  FunctionNode as FunctionNodeData,
} from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Button from '../ui/Button.vue';
import Badge from '../ui/Badge.vue';

const props = defineProps<{
  node: WorkflowNode;
  selected: boolean;
  isConnecting: boolean;
}>();

const emit = defineEmits<{
  select: [];
  delete: [];
  run: [];
  'port-click': [outputPort?: string];
  'toggle-lock': [];
}>();

const agentIcons: Record<string, LucideIcon> = {
  researcher: Search,
  summarizer: FileText,
  analyst: BarChart,
  custom: Brain,
};

const statusConfig = {
  idle: { icon: Circle, color: 'text-muted-foreground', bg: 'bg-background', border: 'border-border' },
  running: { icon: Loader2, color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-400' },
  complete: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-400' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100', border: 'border-red-400' },
} as const;

const status = computed(() => statusConfig[props.node.status]);
const StatusIcon = computed(() => status.value.icon);

const Icon = computed<LucideIcon>(() => {
  if (props.node.nodeType === 'agent') {
    return agentIcons[(props.node as AgentNodeData).type] || Brain;
  }
  if (props.node.nodeType === 'function') return FunctionSquare;
  return Bot;
});

const outputPorts = computed(() =>
  props.node.nodeType === 'function'
    ? (props.node as FunctionNodeData).outputPorts || ['output']
    : ['output']
);

const inputPorts = computed(() =>
  props.node.nodeType === 'function'
    ? (props.node as FunctionNodeData).inputPorts || ['input']
    : ['input']
);

const hasMultipleOutputPorts = computed(() => outputPorts.value.length > 1);
const hasMultipleInputPorts = computed(() => inputPorts.value.length > 1);

const dynamicWidth = computed(() => {
  const minWidth = 200;
  const portSpacing = 30;
  const maxPorts = Math.max(outputPorts.value.length, inputPorts.value.length);
  return maxPorts > 1 ? Math.max(minWidth, maxPorts * portSpacing) : minWidth;
});

const agentNode = computed(() =>
  props.node.nodeType === 'agent' ? (props.node as AgentNodeData) : null
);
const functionNode = computed(() =>
  props.node.nodeType === 'function' ? (props.node as FunctionNodeData) : null
);

function inputHasData(port: string): boolean {
  if (!functionNode.value) return false;
  const v = functionNode.value.inputs?.[port];
  return !!v && v.trim().length > 0;
}
function outputHasData(port: string): boolean {
  if (!functionNode.value) return false;
  const v = functionNode.value.outputs?.[port];
  return !!v && v.trim().length > 0;
}
function portLabel(port: string): string {
  return port.startsWith('output_') ? port.replace(/^output_/i, '') : port;
}
</script>

<template>
  <Card
    :class="[
      'cursor-pointer transition-all border-2',
      status.bg,
      status.border,
      selected ? 'ring-2 ring-primary shadow-lg' : 'hover:shadow-md',
      node.status === 'running' ? 'animate-pulse' : '',
    ]"
    :style="{ minWidth: `${dynamicWidth}px`, maxWidth: `${dynamicWidth}px` }"
    @click="emit('select')"
  >
    <div
      v-if="hasMultipleInputPorts"
      class="absolute top-0 left-0 right-0 flex justify-around"
      style="transform: translateY(-50%)"
    >
      <Handle
        v-for="port in inputPorts"
        :key="port"
        type="target"
        :position="Position.Top"
        :id="port"
        :class="[
          'w-3 h-3 !relative !top-0 !transform-none',
          inputHasData(port) ? '!bg-green-500 ring-2 ring-green-300' : '!bg-primary',
        ]"
        :is-connectable="true"
      />
    </div>
    <Handle
      v-else
      type="target"
      :position="Position.Top"
      :id="inputPorts[0]"
      class="w-3 h-3 !bg-primary"
      :is-connectable="true"
    />

    <div class="p-3 pb-2">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <div :class="[status.bg, 'p-1.5 rounded-md']">
            <component :is="Icon" class="h-4 w-4" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm truncate font-semibold leading-none tracking-tight">{{ node.name }}</h3>
            <div v-if="agentNode" class="flex gap-1 mt-1">
              <Badge variant="outline" class="text-xs">{{ agentNode.output?.length || 0 }} chars</Badge>
              <Badge variant="outline" class="text-xs">{{ agentNode.tools.length }} tools</Badge>
            </div>
            <div v-else-if="functionNode" class="flex gap-1 mt-1 flex-wrap">
              <Badge v-if="hasMultipleInputPorts" variant="outline" class="text-xs">
                {{ inputPorts.length }} inputs
              </Badge>
              <Badge v-if="hasMultipleOutputPorts" variant="outline" class="text-xs">
                {{ outputPorts.length }} outputs
              </Badge>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <div class="flex gap-1 items-center">
            <Button variant="ghost" size="sm" class="h-6 w-6 p-0" @click.stop="emit('toggle-lock')">
              <Lock v-if="node.locked" class="h-3 w-3 text-red-500" />
              <LockOpen v-else class="h-3 w-3 text-muted-foreground" />
            </Button>
            <component
              :is="StatusIcon"
              :class="['h-4 w-4', status.color, node.status === 'running' ? 'animate-spin' : '']"
            />
          </div>
          <Button variant="ghost" size="sm" class="h-6 w-6 p-0" @click.stop="emit('delete')">
            <Trash2 class="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>

    <div v-if="agentNode" class="p-3 pt-0">
      <Button
        size="sm"
        :variant="node.locked ? 'secondary' : 'default'"
        :disabled="node.status === 'running' || node.locked"
        class="w-full h-7 text-xs"
        @click.stop="emit('run')"
      >
        <Play class="h-3 w-3 mr-1" />
        Run
      </Button>
    </div>

    <div v-if="hasMultipleOutputPorts" class="flex justify-around pb-2">
      <div v-for="port in outputPorts" :key="port" class="flex flex-col items-center gap-1">
        <div class="relative">
          <span
            :class="[
              'text-xs',
              outputHasData(port) ? 'text-green-600 font-semibold' : 'text-muted-foreground',
            ]"
          >
            {{ portLabel(port) }}
          </span>
          <div v-if="outputHasData(port)" class="absolute -inset-1 bg-green-500/20 rounded-full -z-10" />
        </div>
        <Handle
          type="source"
          :position="Position.Bottom"
          :id="port"
          :class="[
            'w-3 h-3 relative !top-0',
            outputHasData(port) ? '!bg-green-500 ring-2 ring-green-300' : '!bg-primary',
          ]"
          :is-connectable="true"
        />
      </div>
    </div>
    <Handle
      v-else
      type="source"
      :position="Position.Bottom"
      :id="outputPorts[0]"
      class="w-3 h-3 !bg-primary"
      :is-connectable="true"
    />
  </Card>
</template>
