<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { Bot, Brain, CheckCircle, AlertCircle, Loader2, Play, Pause } from '@lucide/vue';
import { cn } from '@/lib/utils';

interface FreeAgentNodeData {
  type: 'agent';
  label: string;
  isWaiting?: boolean;
  status: 'idle' | 'thinking' | 'active' | 'success' | 'error' | 'paused';
  iteration?: number;
  reasoning?: string;
  retryCount?: number;
  onRetry?: () => void;
}

const props = defineProps<{ data: FreeAgentNodeData }>();

const statusStyles = computed(() => {
  if (props.data.isWaiting) return 'border-amber-500 bg-amber-500/10 shadow-amber-500/30';
  switch (props.data.status) {
    case 'thinking': return 'border-yellow-500 bg-yellow-500/10 shadow-yellow-500/30';
    case 'active': return 'border-blue-500 bg-blue-500/10 shadow-blue-500/30';
    case 'success': return 'border-green-500 bg-green-500/10 shadow-green-500/30';
    case 'error': return 'border-red-500 bg-red-500/10 shadow-red-500/30';
    case 'paused': return 'border-orange-500 bg-orange-500/10 shadow-orange-500/30';
    default: return 'border-muted-foreground/30 bg-muted/30';
  }
});

const statusIcon = computed(() => {
  if (props.data.isWaiting) return { component: Pause, class: 'w-6 h-6 text-amber-500' };
  switch (props.data.status) {
    case 'thinking': return { component: Loader2, class: 'w-6 h-6 text-yellow-500 animate-spin' };
    case 'active': return { component: Brain, class: 'w-6 h-6 text-blue-500 animate-pulse' };
    case 'success': return { component: CheckCircle, class: 'w-6 h-6 text-green-500' };
    case 'error': return { component: AlertCircle, class: 'w-6 h-6 text-red-500' };
    case 'paused': return { component: Pause, class: 'w-6 h-6 text-orange-500' };
    default: return { component: Bot, class: 'w-6 h-6 text-muted-foreground' };
  }
});

const canRetry = computed(
  () => (props.data.status === 'error' || props.data.status === 'paused') && !!props.data.onRetry,
);

function handleRetryClick(e: MouseEvent) {
  e.stopPropagation();
  props.data.onRetry?.();
}
</script>

<template>
  <div
    :class="cn(
      'relative flex flex-col items-center justify-center',
      'w-[120px] h-[120px] rounded-full border-2',
      'shadow-lg transition-all duration-300',
      statusStyles,
      data.status === 'thinking' && 'animate-pulse',
    )"
  >
    <Handle type="target" :position="Position.Left" id="left" class="!bg-blue-500 !w-3 !h-3 !border-2 !border-background" />
    <Handle type="source" :position="Position.Right" id="right" class="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />
    <Handle type="target" :position="Position.Top" id="top" class="!bg-blue-500 !w-3 !h-3 !border-2 !border-background" />
    <Handle type="source" :position="Position.Bottom" id="bottom" class="!bg-amber-500 !w-3 !h-3 !border-2 !border-background" />

    <div class="mb-1">
      <button
        v-if="canRetry"
        type="button"
        @click="handleRetryClick"
        class="w-10 h-10 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center transition-colors cursor-pointer shadow-md"
        title="Click to retry"
      >
        <Play class="w-5 h-5 text-white ml-0.5" />
      </button>
      <component v-else :is="statusIcon.component" :class="statusIcon.class" />
    </div>

    <div class="text-xs font-semibold text-foreground text-center px-2">
      {{ canRetry ? 'Click to Retry' : data.isWaiting ? 'Waiting...' : data.label }}
    </div>

    <div
      v-if="data.iteration !== undefined"
      class="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
    >
      {{ data.iteration }}
    </div>

    <div
      v-if="data.retryCount !== undefined && data.retryCount > 0"
      class="absolute -bottom-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center"
    >
      {{ data.retryCount }}
    </div>

    <div
      v-if="data.status === 'thinking'"
      class="absolute inset-0 rounded-full border-2 border-yellow-500/50 animate-ping"
    />
  </div>
</template>
