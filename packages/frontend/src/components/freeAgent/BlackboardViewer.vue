<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  Eye,
  Lightbulb,
  HelpCircle,
  CheckSquare,
  ListTodo,
  Package,
  AlertTriangle,
  ClipboardList,
  Copy,
  MessageSquarePlus,
  CircleDot,
} from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import type { BlackboardEntry } from '@agent-builder/shared';
import { safeStringify } from '@/lib/safeRender';
import Card from '@/components/ui/Card.vue';
import CardContent from '@/components/ui/CardContent.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import CardTitle from '@/components/ui/CardTitle.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ entries: BlackboardEntry[] }>();

interface CategoryConfig {
  icon: Component;
  color: string;
  label: string;
}

const categoryConfig: Record<string, CategoryConfig> = {
  observation: { icon: Eye, color: 'bg-blue-500/20 text-blue-500 border-blue-500/30', label: 'Observation' },
  insight: { icon: Lightbulb, color: 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30', label: 'Insight' },
  question: { icon: HelpCircle, color: 'bg-purple-500/20 text-purple-500 border-purple-500/30', label: 'Question' },
  decision: { icon: CheckSquare, color: 'bg-green-500/20 text-green-500 border-green-500/30', label: 'Decision' },
  plan: { icon: ListTodo, color: 'bg-cyan-500/20 text-cyan-500 border-cyan-500/30', label: 'Plan' },
  artifact: { icon: Package, color: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30', label: 'Artifact' },
  error: { icon: AlertTriangle, color: 'bg-red-500/20 text-red-500 border-red-500/30', label: 'Error' },
  user_interjection: { icon: MessageSquarePlus, color: 'bg-orange-500/20 text-orange-500 border-orange-500/30', label: 'User Interjection' },
};

const defaultConfig: CategoryConfig = {
  icon: CircleDot,
  color: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
  label: 'Unknown',
};

function getCategoryConfig(category: string): CategoryConfig {
  return categoryConfig[category] || defaultConfig;
}

const entryViews = computed(() =>
  props.entries.map((entry) => ({
    entry,
    config: getCategoryConfig(entry.category),
    body: safeStringify(entry.content),
    dataJson: entry.data ? JSON.stringify(entry.data, null, 2) : null,
  })),
);

function copyAllToClipboard() {
  if (props.entries.length === 0) {
    toast.info('No entries to copy');
    return;
  }
  const text = props.entries
    .map((entry) => {
      const config = getCategoryConfig(entry.category);
      return `[${config.label} #${entry.iteration}]\n${safeStringify(entry.content)}${
        entry.data ? `\nData: ${JSON.stringify(entry.data, null, 2)}` : ''
      }`;
    })
    .join('\n\n---\n\n');
  navigator.clipboard.writeText(text);
  toast.success('Blackboard copied to clipboard');
}
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <CardTitle class="flex items-center gap-2 text-base">
        <ClipboardList class="w-4 h-4" />
        Blackboard
        <div class="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            title="Copy all entries"
            @click="copyAllToClipboard"
          >
            <Copy class="h-3 w-3" />
          </Button>
          <Badge variant="secondary">{{ entries.length }}</Badge>
        </div>
      </CardTitle>
    </CardHeader>

    <CardContent class="flex-1 overflow-hidden p-0">
      <div
        v-if="entries.length === 0"
        class="flex items-center justify-center h-full text-muted-foreground text-sm"
      >
        No blackboard entries yet
      </div>
      <div v-else class="h-full overflow-auto px-4 pb-4">
        <div class="space-y-2">
          <div
            v-for="{ entry, config, body, dataJson } in entryViews"
            :key="entry.id"
            class="p-2 rounded-md border"
            :class="config.color"
          >
            <div class="flex items-center gap-2 mb-1">
              <component :is="config.icon" class="w-3 h-3" />
              <span class="text-xs font-medium">{{ config.label }}</span>
              <span
                v-if="entry.tools && entry.tools.length > 0"
                class="text-xs text-amber-500"
              >
                [{{ entry.tools.join(', ') }}]
              </span>
              <span class="text-xs text-muted-foreground ml-auto">#{{ entry.iteration }}</span>
            </div>
            <p class="text-xs leading-relaxed">{{ body }}</p>
            <pre
              v-if="dataJson"
              class="text-[10px] mt-1 p-1 bg-background/50 rounded overflow-x-auto"
            >{{ dataJson }}</pre>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
