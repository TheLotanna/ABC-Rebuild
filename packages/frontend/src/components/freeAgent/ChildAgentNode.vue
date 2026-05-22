<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@xyflow/vue';
import { GitBranch, Loader2, CheckCircle, XCircle, Pause } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import type { FreeAgentNodeData } from '@agent-builder/shared';

const props = defineProps<{ data: FreeAgentNodeData }>();

const statusStyles = computed(() => {
  switch (props.data.status) {
    case 'thinking': return 'border-amber-500 bg-amber-500/10 shadow-amber-500/30';
    case 'success': return 'border-green-500 bg-green-500/10 shadow-green-500/30';
    case 'error': return 'border-red-500 bg-red-500/10 shadow-red-500/30';
    case 'waiting':
    case 'paused': return 'border-orange-500 bg-orange-500/10 shadow-orange-500/30';
    default: return 'border-muted-foreground/30 bg-muted/30';
  }
});

const statusIcon = computed(() => {
  switch (props.data.status) {
    case 'thinking': return { component: Loader2, class: 'w-5 h-5 text-amber-500 animate-spin' };
    case 'success': return { component: CheckCircle, class: 'w-5 h-5 text-green-500' };
    case 'error': return { component: XCircle, class: 'w-5 h-5 text-red-500' };
    case 'waiting':
    case 'paused': return { component: Pause, class: 'w-5 h-5 text-orange-500' };
    default: return { component: GitBranch, class: 'w-5 h-5 text-muted-foreground' };
  }
});

const tooltip = computed(
  () => `${props.data.childName || props.data.label}\nTask: ${props.data.task || 'N/A'}\nClick to view details`,
);
</script>

<template>
  <div
    :class="cn(
      'relative flex flex-col items-center justify-center cursor-pointer',
      'w-[90px] h-[90px] rounded-full border-2',
      'shadow-lg transition-all duration-300',
      statusStyles,
      data.status === 'thinking' && 'animate-pulse',
    )"
    :title="tooltip"
  >
    <Handle
      type="target"
      :position="Position.Top"
      class="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-background"
    />

    <div class="mb-0.5">
      <component :is="statusIcon.component" :class="statusIcon.class" />
    </div>

    <div class="text-[10px] font-semibold text-foreground text-center px-1 max-w-[80px] truncate">
      {{ data.childName || data.label }}
    </div>

    <div class="text-[9px] text-muted-foreground flex items-center gap-0.5">
      <span>{{ data.currentIteration || 0 }}/{{ data.maxIterations || 10 }}</span>
      <span v-if="data.status === 'success'" class="text-green-500">✓</span>
    </div>

    <Handle
      type="source"
      :position="Position.Bottom"
      class="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-background"
    />

    <div
      v-if="data.status === 'thinking'"
      class="absolute inset-0 rounded-full border-2 border-amber-500/50 animate-ping"
    />
  </div>
</template>
