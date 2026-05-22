<script setup lang="ts">
import { computed } from 'vue';
import {
  Search,
  FileText,
  Bot,
  Play,
  CheckCircle2,
  AlertCircle,
  Circle,
  Trash2,
  Minimize2,
  Download,
  Copy,
  Lock,
  Unlock,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { AgentNode as AgentNodeData } from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Badge from '../ui/Badge.vue';
import Button from '../ui/Button.vue';

const props = withDefaults(
  defineProps<{
    agent: AgentNodeData;
    isSelected: boolean;
    isConnecting: boolean;
    agentNumber: string;
    stageIndex: number;
    layoutId?: string;
    canRun?: boolean;
  }>(),
  { layoutId: 'default', canRun: false }
);

const emit = defineEmits<{
  select: [];
  delete: [];
  'toggle-minimize': [];
  'toggle-lock': [];
  'port-click': [agentId: string, isOutput: boolean, outputPort?: string, inputPort?: string];
  run: [];
  'drag-start': [event: DragEvent, nodeId: string];
}>();

const agentIcons: Record<string, typeof Search> = {
  researcher: Search,
  summarizer: FileText,
  analyst: Bot,
};

const statusConfig = {
  idle: { icon: Circle, color: 'text-muted-foreground', bg: 'bg-muted' },
  running: { icon: Play, color: 'text-warning', bg: 'bg-warning/10' },
  complete: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  error: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
} as const;

const Icon = computed(() => agentIcons[props.agent.type] || Bot);
const statusInfo = computed(() => statusConfig[props.agent.status]);
const StatusIcon = computed(() => statusInfo.value.icon);

const statusStyles: Record<AgentNodeData['status'], string> = {
  running: 'bg-yellow-50 dark:bg-yellow-950/20',
  complete: 'ring-2 ring-green-500',
  error: 'ring-2 ring-destructive',
  idle: '',
};

const outputPorts = computed(() =>
  props.agent.beastModeOutputPorts && props.agent.beastModeOutputPorts.length > 0
    ? props.agent.beastModeOutputPorts
    : ['output']
);

function handleDelete(e: MouseEvent) {
  e.stopPropagation();
  if (confirm(`Delete agent "${props.agent.name}"?`)) emit('delete');
}

function handleToggleMinimize(e: MouseEvent) {
  e.stopPropagation();
  emit('toggle-minimize');
}

function handleToggleLock(e: MouseEvent) {
  e.stopPropagation();
  emit('toggle-lock');
}

function handleDownload(e: MouseEvent) {
  e.stopPropagation();
  if (!props.agent.output) {
    toast.error('No output', { description: "This agent hasn't generated any output yet." });
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `${props.agent.name}_stage${props.stageIndex + 1}_agent${props.agentNumber}_${timestamp}.md`;
  const blob = new Blob([props.agent.output], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success('Downloaded', { description: `Output saved as ${filename}` });
}

async function handleCopy(e: MouseEvent) {
  e.stopPropagation();
  if (!props.agent.output) {
    toast.error('No output', { description: "This agent hasn't generated any output yet." });
    return;
  }
  try {
    await navigator.clipboard.writeText(props.agent.output);
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
    e.dataTransfer.setData('existingNodeId', props.agent.id);
  }
  emit('drag-start', e, props.agent.id);
}

function portHasData(portName: string): boolean {
  if (portName === 'output') {
    return !!props.agent.output && props.agent.output.trim().length > 0;
  }
  const v = props.agent.beastModeOutputs?.[portName];
  return !!v && v.trim().length > 0;
}

function portStyle(idx: number): Record<string, string> {
  const count = outputPorts.value.length;
  return {
    left: count > 1 ? `${((idx + 1) / (count + 1)) * 100}%` : '50%',
    transform: 'translateX(-50%)',
  };
}

function portTitle(portName: string): string {
  const v = props.agent.beastModeOutputs?.[portName];
  return v && v.length > 0 ? `${portName}: ${v.substring(0, 50)}...` : `${portName}: empty`;
}
</script>

<template>
  <Card
    v-if="agent.minimized"
    :class="[
      'w-16 h-16 cursor-pointer transition-all hover:shadow-lg bg-card/50 backdrop-blur-sm flex items-center justify-center relative',
      isSelected ? 'ring-2 ring-primary shadow-lg' : '',
      statusStyles[agent.status],
    ]"
    style="position: relative; z-index: 20"
    draggable="true"
    @click="emit('toggle-minimize')"
    @dragstart="handleDragStart"
  >
    <div
      :id="`port-input-${agent.id}-${layoutId}`"
      :class="[
        'absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      @click.stop="emit('port-click', agent.id, false)"
    />
    <div
      v-for="(portName, idx) in outputPorts"
      :key="portName"
      :id="`port-output-${agent.id}-${portName}-${layoutId}`"
      :class="[
        'absolute -bottom-2 w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        portHasData(portName) ? 'bg-green-500 ring-2 ring-green-300' : 'bg-primary',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      :style="portStyle(idx)"
      :title="portName"
      @click.stop="emit('port-click', agent.id, true, portName)"
    />
    <div class="text-center">
      <div class="flex items-center justify-center gap-0.5">
        <div class="text-xs font-bold text-foreground">{{ agentNumber }}</div>
        <Lock v-if="agent.locked" class="h-2.5 w-2.5 text-muted-foreground" />
      </div>
      <component :is="StatusIcon" :class="['h-3 w-3 mx-auto mt-0.5', statusInfo.color]" />
    </div>
  </Card>

  <Card
    v-else
    :class="[
      'p-3 cursor-pointer transition-all hover:shadow-lg w-full min-w-[240px] bg-card/50 backdrop-blur-sm group',
      isSelected ? 'ring-2 ring-primary shadow-lg' : '',
      statusStyles[agent.status],
    ]"
    style="position: relative; z-index: 20"
    draggable="true"
    @click="emit('select')"
    @dragstart="handleDragStart"
  >
    <div
      :id="`port-input-${agent.id}-${layoutId}`"
      :class="[
        'absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      @click.stop="emit('port-click', agent.id, false)"
    />
    <div
      v-for="(portName, idx) in outputPorts"
      :key="portName"
      :id="`port-output-${agent.id}-${portName}-${layoutId}`"
      :class="[
        'absolute -bottom-2 w-3 h-3 rounded-full border-2 border-card cursor-pointer hover:scale-125 transition-transform z-20',
        portHasData(portName) ? 'bg-green-500 ring-2 ring-green-300' : 'bg-primary',
        isConnecting ? 'ring-2 ring-primary animate-pulse' : '',
      ]"
      :style="portStyle(idx)"
      :title="portName"
      @click.stop="emit('port-click', agent.id, true, portName)"
    />

    <div class="space-y-3">
      <div class="flex items-start gap-2">
        <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <component :is="Icon" class="h-4 w-4 text-primary" />
        </div>

        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center gap-1.5">
            <h4 class="text-sm font-semibold text-foreground truncate">{{ agent.name }}</h4>
            <Lock v-if="agent.locked" class="h-3 w-3 text-muted-foreground flex-shrink-0" />
          </div>

          <div class="flex items-center gap-0.5 flex-wrap">
            <Button
              v-if="canRun && agent.status !== 'running'"
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0"
              title="Run agent"
              @click="handleRun"
            >
              <Play class="h-3 w-3 text-primary" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0 hidden xl:flex"
              title="Download output"
              @click="handleDownload"
            >
              <Download class="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" class="h-6 w-6 p-0" title="Copy output" @click="handleCopy">
              <Copy class="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-6 w-6 p-0"
              :title="agent.locked ? 'Unlock agent' : 'Lock agent'"
              @click="handleToggleLock"
            >
              <Lock v-if="agent.locked" class="h-3 w-3" />
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
          <span class="text-xs capitalize">{{ agent.status }}</span>
        </div>
        <Badge v-if="agent.tools.length > 0" variant="outline" class="text-xs">
          {{ agent.tools.length }} tools
        </Badge>
        <Badge v-if="outputPorts.length > 1" variant="outline" class="text-xs">
          {{ outputPorts.length }} outputs
        </Badge>
      </div>

      <p class="text-xs text-muted-foreground line-clamp-2">{{ agent.systemPrompt }}</p>

      <div v-if="outputPorts.length > 1" class="flex gap-1 text-[10px] text-muted-foreground flex-wrap">
        <span>Outputs:</span>
        <Badge
          v-for="port in outputPorts"
          :key="port"
          variant="outline"
          :class="[
            'text-[9px] px-1 py-0 h-4',
            agent.beastModeOutputs?.[port] && agent.beastModeOutputs[port].length > 0
              ? 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-400'
              : 'opacity-50',
          ]"
          :title="portTitle(port)"
        >
          {{ port }}
        </Badge>
      </div>
    </div>
  </Card>
</template>
