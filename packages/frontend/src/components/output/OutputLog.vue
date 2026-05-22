<script setup lang="ts">
import { ref, computed, type Component } from 'vue';
import {
  ChevronDown,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-vue-next';
import type { LogEntry } from '@agent-builder/shared';
import { cn } from '@/lib/utils';
import Card from '@/components/ui/Card.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ logs: LogEntry[] }>();

const isExpanded = ref(false);

const iconFor: Record<LogEntry['type'], Component> = {
  info: Terminal,
  success: CheckCircle2,
  error: AlertCircle,
  running: Loader2,
  warning: AlertCircle,
};

const colorFor: Record<LogEntry['type'], string> = {
  info: 'text-foreground',
  success: 'text-green-600',
  error: 'text-destructive',
  running: 'text-yellow-600',
  warning: 'text-yellow-600',
};

const entryCountLabel = computed(
  () => `${props.logs.length} ${props.logs.length === 1 ? 'entry' : 'entries'}`,
);
</script>

<template>
  <Card
    :class="cn(
      'border-t border-border rounded-none transition-all duration-300 flex-shrink-0',
      isExpanded ? 'h-64' : 'h-12',
    )"
  >
    <div class="flex items-center justify-between p-3 border-b border-border bg-muted/30">
      <div class="flex items-center gap-2">
        <Terminal class="h-4 w-4 text-muted-foreground" />
        <h3 class="text-sm font-semibold text-foreground">Output Log</h3>
        <span
          v-if="!isExpanded && logs.length > 0"
          class="text-xs text-muted-foreground"
        >
          {{ entryCountLabel }}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-7"
        @click="isExpanded = !isExpanded"
      >
        <ChevronDown
          :class="cn(
            'h-4 w-4 transition-transform',
            !isExpanded && 'rotate-180',
          )"
        />
      </Button>
    </div>

    <div v-if="isExpanded" class="h-[calc(100%-3rem)] overflow-auto">
      <div class="p-3 space-y-2 font-mono text-xs">
        <div
          v-if="logs.length === 0"
          class="text-muted-foreground text-center py-4"
        >
          No logs yet. Run the workflow to see execution logs.
        </div>
        <div
          v-for="(log, index) in logs"
          v-else
          :key="index"
          class="flex items-start gap-3 group"
        >
          <span class="text-muted-foreground flex-shrink-0">{{ log.time }}</span>
          <component
            :is="iconFor[log.type]"
            :class="cn(
              'h-3.5 w-3.5 flex-shrink-0 mt-0.5',
              colorFor[log.type],
              log.type === 'running' && 'animate-spin',
            )"
          />
          <span class="text-foreground flex-1">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </Card>
</template>
