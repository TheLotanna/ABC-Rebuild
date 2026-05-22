<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Loader2, GitBranch, X } from '@lucide/vue';
import { toast } from 'vue-sonner';
import Button from '@/components/ui/Button.vue';
import GitHubTreeNodeRow, { type TreeNode } from './GitHubTreeNodeRow.vue';

interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
}

const props = defineProps<{
  open: boolean;
  repoUrl: string;
  branch?: string;
  selectedPaths: string[];
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'select-paths', paths: string[], contents?: Record<string, string>): void;
}>();

const backendBase = () =>
  (import.meta as unknown as { env: Record<string, string | undefined> }).env
    .VITE_BACKEND_URL || '';

const loading = ref(false);
const saving = ref(false);
const treeData = ref<TreeNode[]>([]);
const expandedKeys = ref<Set<string>>(new Set());
const localSelected = ref<Set<string>>(new Set(props.selectedPaths));
const repoInfo = ref<RepoInfo | null>(null);
const error = ref<string | null>(null);

watch(
  () => props.selectedPaths,
  (next) => {
    localSelected.value = new Set(next);
  },
);

watch(
  [() => props.open, () => props.repoUrl, () => props.branch],
  ([isOpen, url]) => {
    if (isOpen && url) {
      fetchTree();
    }
  },
);

async function fetchTree() {
  if (!props.repoUrl) {
    error.value = 'Repository URL is required';
    return;
  }
  loading.value = true;
  error.value = null;

  try {
    const response = await fetch(`${backendBase()}/api/tools/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoUrl: props.repoUrl, branch: props.branch }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to fetch repository: ${response.statusText}`,
      );
    }
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch repository');

    treeData.value = data.treeData || [];
    repoInfo.value = data.repository ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch repository';
    error.value = message;
    toast.error('Error fetching repository', { description: message });
  } finally {
    loading.value = false;
  }
}

function toggleExpanded(key: string) {
  const next = new Set(expandedKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedKeys.value = next;
}

function getAllFilePaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) => {
    if (node.leaf || node.data.type === 'file') return [node.data.path];
    if (node.children) return getAllFilePaths(node.children);
    return [];
  });
}

function toggleSelected(path: string, isDirectory: boolean, children?: TreeNode[]) {
  const next = new Set(localSelected.value);
  if (isDirectory && children) {
    const filePaths = getAllFilePaths(children);
    const allSelected = filePaths.every((p) => next.has(p));
    if (allSelected) {
      filePaths.forEach((p) => next.delete(p));
    } else {
      filePaths.forEach((p) => next.add(p));
    }
  } else {
    if (next.has(path)) next.delete(path);
    else next.add(path);
  }
  localSelected.value = next;
}

const selectedCount = computed(() => localSelected.value.size);

function clearAll() {
  localSelected.value = new Set();
}

function close() {
  emit('update:open', false);
}

async function handleSave() {
  const paths = Array.from(localSelected.value);

  if (paths.length === 0) {
    emit('select-paths', paths, {});
    close();
    return;
  }

  saving.value = true;
  try {
    const response = await fetch(`${backendBase()}/api/tools/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: props.repoUrl,
        branch: props.branch,
        selectedPaths: paths,
        outputMode: 'separate',
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to fetch files: ${response.statusText}`,
      );
    }
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Failed to fetch file contents');

    emit('select-paths', paths, data.outputs || {});
    close();
    toast.success(`Successfully loaded ${paths.length} file(s)`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to fetch file contents';
    toast.error('Error loading files', { description: message });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div
      class="bg-background border rounded-lg shadow-xl flex flex-col w-full max-w-2xl"
      style="max-height: 80vh;"
    >
      <div class="px-6 py-4 border-b flex items-start justify-between gap-2 shrink-0">
        <div>
          <h2 class="flex items-center gap-2 text-lg font-semibold">
            <GitBranch class="h-5 w-5" />
            Select Files from Repository
          </h2>
          <p class="text-sm text-muted-foreground mt-1">
            <template v-if="repoInfo">
              {{ repoInfo.owner }}/{{ repoInfo.repo }} ({{ repoInfo.branch }})
            </template>
            <template v-else>Loading repository...</template>
          </p>
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0 shrink-0" @click="close">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="flex-1 min-h-0 flex flex-col gap-4 px-6 py-4">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <div
          v-else-if="error"
          class="flex flex-col items-center justify-center py-12 gap-4"
        >
          <p class="text-sm text-destructive">{{ error }}</p>
          <Button variant="outline" size="sm" @click="fetchTree">Retry</Button>
        </div>

        <template v-else>
          <div class="flex items-center justify-between text-sm text-muted-foreground">
            <span>{{ selectedCount }} file(s) selected</span>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" @click="clearAll">Clear All</Button>
            </div>
          </div>

          <div class="flex-1 border rounded-md overflow-auto">
            <div class="p-2">
              <GitHubTreeNodeRow
                v-for="node in treeData"
                :key="node.key"
                :node="node"
                :depth="0"
                :expanded-keys="expandedKeys"
                :local-selected="localSelected"
                @toggle-expanded="toggleExpanded"
                @toggle-selected="toggleSelected"
              />
            </div>
          </div>
        </template>
      </div>

      <div class="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
        <Button variant="outline" :disabled="saving" @click="close">Cancel</Button>
        <Button :disabled="loading || saving || !!error" @click="handleSave">
          <template v-if="saving">
            <Loader2 class="h-4 w-4 mr-2 animate-spin" />
            Loading Files...
          </template>
          <template v-else>
            Load {{ selectedCount }} File(s)
          </template>
        </Button>
      </div>
    </div>
  </div>
</template>
