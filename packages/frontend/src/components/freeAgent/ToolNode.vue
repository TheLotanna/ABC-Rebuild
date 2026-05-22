<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Handle, Position } from '@xyflow/vue';
import {
  Clock,
  Search,
  Globe,
  Github,
  FileCode,
  ClipboardList,
  Edit3,
  FileText,
  Archive,
  FileArchive,
  FolderOutput,
  FileImage,
  ScanText,
  Mail,
  HelpCircle,
  Image,
  Download,
  Upload,
  Database,
  Table,
} from 'lucide-vue-next';
import { cn } from '@/lib/utils';

interface ToolNodeData {
  type: 'tool';
  label: string;
  status: 'idle' | 'thinking' | 'active' | 'success' | 'error';
  icon?: string;
  category?: string;
  categoryColor?: string;
  toolId?: string;
  isInstance?: boolean;
  instanceLabel?: string;
}

const props = defineProps<{ data: ToolNodeData }>();

const iconMap: Record<string, Component> = {
  Clock,
  Search,
  Globe,
  Github,
  FileCode,
  ClipboardList,
  Edit3,
  FileText,
  Archive,
  FileArchive,
  FolderOutput,
  FileImage,
  ScanText,
  Mail,
  HelpCircle,
  Image,
  Download,
  Upload,
  Database,
  Table,
};

const categoryColor = computed(() => props.data.categoryColor || '#6B7280');

const statusStyles = computed(() => {
  switch (props.data.status) {
    case 'active': return 'border-2 border-yellow-500 bg-yellow-500/20 shadow-lg shadow-yellow-500/40';
    case 'success': return 'border-2 border-green-500 bg-green-500/10';
    case 'error': return 'border-2 border-red-500 bg-red-500/10';
    default: return 'border bg-card hover:bg-muted/50';
  }
});

const iconComponent = computed<Component>(() => {
  if (props.data.icon && iconMap[props.data.icon]) return iconMap[props.data.icon];
  return FileText;
});

const iconColorClass = computed(() => {
  switch (props.data.status) {
    case 'active': return 'text-yellow-500';
    case 'success': return 'text-green-500';
    case 'error': return 'text-red-500';
    case 'idle': return 'text-muted-foreground';
    default: return '';
  }
});
</script>

<template>
  <div
    :class="cn(
      'relative flex flex-col items-center justify-center',
      'w-[100px] h-[60px] rounded-lg',
      'shadow-sm transition-all duration-200 cursor-pointer',
      statusStyles,
      data.status === 'active' && 'animate-pulse',
      data.isInstance && 'border-dashed',
    )"
    :style="{ borderColor: data.status === 'idle' ? categoryColor : undefined }"
  >
    <Handle type="target" :position="Position.Top" id="top" class="!bg-muted-foreground !w-2 !h-2" />
    <Handle type="source" :position="Position.Bottom" id="bottom" class="!bg-muted-foreground !w-2 !h-2" />

    <div
      :class="cn(
        'absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full border-2 border-background shadow-sm',
        data.isInstance && 'ring-2 ring-offset-1 ring-offset-background ring-current',
      )"
      :style="{
        backgroundColor: categoryColor,
        color: data.isInstance ? categoryColor : undefined,
      }"
    />

    <div
      v-if="data.isInstance"
      class="absolute -top-1.5 -right-1.5 px-1 text-[7px] font-bold rounded bg-background border shadow-sm"
      :style="{ borderColor: categoryColor, color: categoryColor }"
    >
      INST
    </div>

    <div
      class="mb-1 transition-colors"
      :class="iconColorClass"
      :style="{ color: data.status === 'idle' ? categoryColor : undefined }"
    >
      <component :is="iconComponent" class="w-4 h-4" />
    </div>

    <div class="text-[10px] font-medium text-foreground text-center px-1 truncate w-full">
      {{ data.label }}
    </div>

    <div
      v-if="data.status === 'active'"
      class="absolute inset-0 rounded-lg border-2 border-yellow-500/50 animate-ping"
    />
  </div>
</template>
