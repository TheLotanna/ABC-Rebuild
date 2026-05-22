<script setup lang="ts">
import { ref, computed } from 'vue';
import { Plus, Trash2, Edit, Copy, Package, X } from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useToolInstances } from '@/composables/useToolInstances';
import type { ToolsManifest, ToolInstance } from '@agent-builder/shared';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{ toolsManifest: ToolsManifest | null }>();

const toolInstancesManager = useToolInstances();

const isAddModalOpen = ref(false);
const isEditModalOpen = ref(false);
const deleteConfirmId = ref<string | null>(null);

const selectedBaseTool = ref('');
const instanceName = ref('');
const instanceLabel = ref('');
const instanceDescription = ref('');
const editingInstanceId = ref<string | null>(null);

// The store currently returns top-level snapshots that don't track later
// mutations (same caveat as secretsStore). Read through `config` to stay
// reactive — see REBUILD_PLAN.md note on SecretsMiniPanel for context.
const instances = computed<ToolInstance[]>(() => toolInstancesManager.config.instances);

const availableTools = computed(() => {
  const tools = props.toolsManifest?.tools;
  if (!tools) return [];
  return Object.entries(tools)
    .filter(([, tool]) => tool.edge_function)
    .map(([id, tool]) => ({ id, name: tool.name, description: tool.description }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

const instancesByTool = computed(() => {
  const groups: Record<string, ToolInstance[]> = {};
  for (const instance of instances.value) {
    if (!groups[instance.baseToolId]) groups[instance.baseToolId] = [];
    groups[instance.baseToolId].push(instance);
  }
  return groups;
});

const previewFullId = computed(() => {
  if (!selectedBaseTool.value || !instanceName.value.trim()) return '';
  const sanitized = instanceName.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `${selectedBaseTool.value}:${sanitized}`;
});

function sanitizeInstanceName(value: string) {
  instanceName.value = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function resetForm() {
  selectedBaseTool.value = '';
  instanceName.value = '';
  instanceLabel.value = '';
  instanceDescription.value = '';
  editingInstanceId.value = null;
}

function handleAddInstance() {
  if (!selectedBaseTool.value || !instanceName.value.trim() || !instanceLabel.value.trim()) {
    toast.error('Please fill in all required fields');
    return;
  }
  const result = toolInstancesManager.addInstance(
    selectedBaseTool.value,
    instanceName.value,
    instanceLabel.value,
    instanceDescription.value,
  );
  if (result) {
    toast.success(`Created instance: ${result.fullToolId}`);
    isAddModalOpen.value = false;
    resetForm();
  } else {
    toast.error('Failed to create instance - it may already exist');
  }
}

function handleEditInstance() {
  if (!editingInstanceId.value || !instanceLabel.value.trim()) {
    toast.error('Please fill in required fields');
    return;
  }
  toolInstancesManager.updateInstance(editingInstanceId.value, {
    instanceName: instanceName.value,
    label: instanceLabel.value,
    description: instanceDescription.value,
  });
  toast.success('Instance updated');
  isEditModalOpen.value = false;
  resetForm();
}

function handleDeleteInstance() {
  if (deleteConfirmId.value) {
    toolInstancesManager.deleteInstance(deleteConfirmId.value);
    toast.success('Instance deleted');
    deleteConfirmId.value = null;
  }
}

function openEditModal(instance: ToolInstance) {
  editingInstanceId.value = instance.id;
  selectedBaseTool.value = instance.baseToolId;
  instanceName.value = instance.instanceName;
  instanceLabel.value = instance.label;
  instanceDescription.value = instance.description;
  isEditModalOpen.value = true;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
}

function closeAdd() {
  isAddModalOpen.value = false;
  resetForm();
}

function closeEdit() {
  isEditModalOpen.value = false;
  resetForm();
}
</script>

<template>
  <div class="flex flex-col gap-4 h-full">
    <!-- Header with Add button -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Package class="w-4 h-4" />
        <span class="font-medium">Tool Instances</span>
        <Badge variant="secondary">{{ instances.length }}</Badge>
      </div>
      <Button size="sm" @click="isAddModalOpen = true">
        <Plus class="w-4 h-4 mr-1" />
        Add
      </Button>
    </div>

    <!-- Instances list -->
    <div class="flex-1 overflow-auto">
      <div
        v-if="instances.length === 0"
        class="text-center text-muted-foreground py-8"
      >
        <Package class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No tool instances configured.</p>
        <p class="text-xs mt-1">
          Create instances to use multiple configurations of the same tool.
        </p>
      </div>
      <div v-else class="space-y-3 pr-2">
        <div
          v-for="(group, baseToolId) in instancesByTool"
          :key="baseToolId"
          class="border rounded-lg p-3"
        >
          <div class="text-sm font-medium mb-2 flex items-center gap-2">
            <span>{{ toolsManifest?.tools?.[baseToolId]?.name || baseToolId }}</span>
            <Badge variant="outline" class="text-xs">{{ group.length }}</Badge>
          </div>
          <div class="space-y-2">
            <div
              v-for="instance in group"
              :key="instance.id"
              class="flex items-start gap-2 p-2 bg-muted/50 rounded-md"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium text-sm">{{ instance.label }}</span>
                  <button
                    class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    @click="copyToClipboard(instance.fullToolId)"
                  >
                    <code class="bg-muted px-1 rounded">{{ instance.fullToolId }}</code>
                    <Copy class="w-3 h-3" />
                  </button>
                </div>
                <p
                  v-if="instance.description"
                  class="text-xs text-muted-foreground mt-1 line-clamp-2"
                >
                  {{ instance.description }}
                </p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7"
                  @click="openEditModal(instance)"
                >
                  <Edit class="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-destructive hover:text-destructive"
                  @click="deleteConfirmId = instance.id"
                >
                  <Trash2 class="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Instance Modal -->
    <div
      v-if="isAddModalOpen"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="closeAdd"
    >
      <div class="bg-background border rounded-lg shadow-xl w-full sm:max-w-md flex flex-col">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h2 class="text-lg font-semibold">Create Tool Instance</h2>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="closeAdd">
            <X class="h-4 w-4" />
          </Button>
        </div>

        <div class="px-6 py-4 space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Base Tool *</label>
            <select
              v-model="selectedBaseTool"
              class="w-full h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="" disabled>Select a tool...</option>
              <option v-for="tool in availableTools" :key="tool.id" :value="tool.id">
                {{ tool.name }} ({{ tool.id }})
              </option>
            </select>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Instance Name *</label>
            <Input
              placeholder="e.g., policies_database"
              :model-value="instanceName"
              @update:model-value="sanitizeInstanceName(String($event))"
            />
            <p class="text-xs text-muted-foreground">
              Alphanumeric and underscores only. Used in tool ID.
            </p>
          </div>

          <div v-if="previewFullId" class="p-2 bg-muted rounded-md">
            <label class="text-xs">Full Tool ID</label>
            <code class="block text-sm font-mono">{{ previewFullId }}</code>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Display Label *</label>
            <Input v-model="instanceLabel" placeholder="e.g., Policy Database" />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Description</label>
            <textarea
              v-model="instanceDescription"
              placeholder="Describe what this instance is for..."
              class="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>

        <div class="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" @click="closeAdd">Cancel</Button>
          <Button @click="handleAddInstance">Create Instance</Button>
        </div>
      </div>
    </div>

    <!-- Edit Instance Modal -->
    <div
      v-if="isEditModalOpen"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="closeEdit"
    >
      <div class="bg-background border rounded-lg shadow-xl w-full sm:max-w-md flex flex-col">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h2 class="text-lg font-semibold">Edit Tool Instance</h2>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="closeEdit">
            <X class="h-4 w-4" />
          </Button>
        </div>

        <div class="px-6 py-4 space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Base Tool</label>
            <Input :model-value="selectedBaseTool" disabled />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Instance Name</label>
            <Input
              :model-value="instanceName"
              @update:model-value="sanitizeInstanceName(String($event))"
            />
          </div>

          <div v-if="previewFullId" class="p-2 bg-muted rounded-md">
            <label class="text-xs">Full Tool ID</label>
            <code class="block text-sm font-mono">{{ previewFullId }}</code>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Display Label *</label>
            <Input v-model="instanceLabel" />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium">Description</label>
            <textarea
              v-model="instanceDescription"
              class="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>

        <div class="px-6 py-4 border-t flex justify-end gap-2">
          <Button variant="outline" @click="closeEdit">Cancel</Button>
          <Button @click="handleEditInstance">Save Changes</Button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <div
      v-if="deleteConfirmId"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="deleteConfirmId = null"
    >
      <div class="bg-background border rounded-lg shadow-xl w-full sm:max-w-sm flex flex-col">
        <div class="px-6 py-4 border-b">
          <h2 class="text-lg font-semibold">Delete Instance?</h2>
          <p class="text-sm text-muted-foreground mt-1">
            This will remove the tool instance. Any secret mappings for this
            instance will also need to be updated.
          </p>
        </div>
        <div class="px-6 py-4 flex justify-end gap-2">
          <Button variant="outline" @click="deleteConfirmId = null">Cancel</Button>
          <Button
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDeleteInstance"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
