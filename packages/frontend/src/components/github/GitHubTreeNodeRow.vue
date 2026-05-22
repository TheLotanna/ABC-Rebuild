<script setup lang="ts">
import { computed } from 'vue';
import {
  Folder as FolderIcon,
  File as FileIcon,
  ChevronRight as ChevronRightIcon,
  ChevronDown as ChevronDownIcon,
} from 'lucide-vue-next';

export interface TreeNode {
  key: string;
  label: string;
  data: { path: string; type: 'file' | 'directory'; size?: number };
  children?: TreeNode[];
  leaf?: boolean;
}

const props = defineProps<{
  node: TreeNode;
  depth: number;
  expandedKeys: Set<string>;
  localSelected: Set<string>;
}>();

const emit = defineEmits<{
  (e: 'toggle-expanded', key: string): void;
  (e: 'toggle-selected', path: string, isDirectory: boolean, children?: TreeNode[]): void;
}>();

const isFile = computed(() => !!props.node.leaf || props.node.data.type === 'file');
const isExpanded = computed(() => props.expandedKeys.has(props.node.key));
const isSelected = computed(() =>
  isFile.value ? props.localSelected.has(props.node.data.path) : false,
);

function gatherFilePaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => {
    if (n.leaf || n.data.type === 'file') return [n.data.path];
    if (n.children) return gatherFilePaths(n.children);
    return [];
  });
}

const isFullySelected = computed(() => {
  if (isFile.value || !props.node.children) return false;
  const paths = gatherFilePaths(props.node.children);
  return paths.length > 0 && paths.every((p) => props.localSelected.has(p));
});

const isPartiallySelected = computed(() => {
  if (isFile.value || !props.node.children) return false;
  const paths = gatherFilePaths(props.node.children);
  const count = paths.filter((p) => props.localSelected.has(p)).length;
  return count > 0 && count < paths.length;
});

const formattedSize = computed(() => {
  const size = props.node.data.size;
  if (!size) return '';
  return size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
});

function onCheckboxChange() {
  emit('toggle-selected', props.node.data.path, !isFile.value, props.node.children);
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer text-sm"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
    >
      <button
        v-if="!isFile"
        class="p-0.5 hover:bg-muted rounded"
        @click="emit('toggle-expanded', node.key)"
      >
        <ChevronDownIcon v-if="isExpanded" class="h-3 w-3" />
        <ChevronRightIcon v-else class="h-3 w-3" />
      </button>

      <input
        type="checkbox"
        class="h-4 w-4 accent-primary"
        :checked="isFile ? isSelected : isFullySelected"
        :indeterminate="isPartiallySelected"
        @click.stop
        @change="onCheckboxChange"
      />

      <FileIcon v-if="isFile" class="h-4 w-4 text-muted-foreground" />
      <FolderIcon v-else class="h-4 w-4 text-yellow-500" />

      <span class="flex-1 truncate">{{ node.label }}</span>

      <span
        v-if="isFile && formattedSize"
        class="text-xs text-muted-foreground"
      >
        {{ formattedSize }}
      </span>
    </div>

    <div v-if="!isFile && isExpanded && node.children">
      <GitHubTreeNodeRow
        v-for="child in node.children"
        :key="child.key"
        :node="child"
        :depth="depth + 1"
        :expanded-keys="expandedKeys"
        :local-selected="localSelected"
        @toggle-expanded="(key) => emit('toggle-expanded', key)"
        @toggle-selected="(p, isDir, c) => emit('toggle-selected', p, isDir, c)"
      />
    </div>
  </div>
</template>
