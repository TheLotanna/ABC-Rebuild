<script setup lang="ts">
// Vue 3 port of src/components/freeAgent/SecretsManagerModal.tsx (821 lines).
// Three-tab UI for managing secrets, parameter / header mappings, and
// import-export.
//
// Notes for follow-up agents:
// - Reactive state is read through `secrets.config.secrets/.mappings/.headerMappings`
//   to dodge the static-snapshot issue called out in SecretsMiniPanel.
// - No shadcn-vue `Select`, `Checkbox`, `Textarea`, `Label`, `Tooltip`, or
//   `AlertDialog` primitives yet — using native `<select>` / `<input type=checkbox>`
//   / `<textarea>` / `<label>` and `title=` attribute for tooltips. Confirmation
//   dialogs are inline fixed-overlay modals using the same backdrop pattern.
// - Wire-up: SecretsMiniPanel emits `open-modal`; the host (FreeAgentView or
//   FreeAgentPanel) should mount this modal once and toggle it.

import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import {
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  FileText,
  Link as LinkIcon,
  X as XIcon,
  Settings,
  AlertTriangle,
  Check,
  Copy,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import { useSecretsStore } from '@/stores/secretsStore';
import { useToolInstanceStore } from '@/stores/toolInstanceStore';
import type {
  ToolsManifest,
  ToolDefinition,
} from '@agent-builder/shared';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Badge from '@/components/ui/Badge.vue';

const props = defineProps<{
  open: boolean;
  toolsManifest: ToolsManifest | null;
  /** Pass `false` to hide tool-instance picker even when the store has entries. */
  enableInstances?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const secrets = useSecretsStore();
const toolInstances = useToolInstanceStore();
const { config: secretsConfig } = storeToRefs(secrets);
const { config: toolInstancesConfig } = storeToRefs(toolInstances);

const activeTab = ref<'secrets' | 'mappings' | 'import'>('secrets');

// Secret form state
const newSecretName = ref('');
const newSecretKey = ref('');
const newSecretValue = ref('');
const visibleSecrets = ref<Set<string>>(new Set());
const editingSecretId = ref<string | null>(null);
const editingSecretValue = ref('');

// Mapping form state
const selectedTool = ref('');
const selectedParam = ref('');
const selectedSecretKey = ref('');
const newHeaderName = ref('');
const selectedHeaderSecretKey = ref('');
const toolTypeFilter = ref<'global' | 'instances'>('global');

// Import state
const importText = ref('');
const importType = ref<'env' | 'json'>('env');
const exportIncludeValues = ref(false);

// Confirmation dialogs
const clearConfirmOpen = ref(false);
const deleteSecretId = ref<string | null>(null);

// ─── derived ────────────────────────────────────────────────────────────────
const secretList = computed(() => secretsConfig.value.secrets);
const mappingList = computed(() => secretsConfig.value.mappings);
const headerMappingList = computed(() => secretsConfig.value.headerMappings);
const totalMappings = computed(
  () =>
    mappingList.value.length +
    headerMappingList.value.reduce((acc, hm) => acc + hm.headers.length, 0),
);

const edgeFunctionTools = computed<Array<ToolDefinition & { id: string }>>(() => {
  const tools = props.toolsManifest?.tools;
  if (!tools) return [];
  return Object.entries(tools)
    .filter(([, tool]) => tool.edge_function)
    .map(([id, tool]) => ({ id, ...tool }));
});

const allInstances = computed(() =>
  props.enableInstances === false ? [] : toolInstancesConfig.value.instances,
);

const toolsWithInstances = computed(() => {
  const set = new Set<string>();
  for (const inst of allInstances.value) set.add(inst.baseToolId);
  return set;
});

const globalOnlyTools = computed(() =>
  edgeFunctionTools.value.filter(
    (tool) => !toolsWithInstances.value.has(tool.id),
  ),
);

const selectedToolParams = computed(() => {
  if (!selectedTool.value || !props.toolsManifest?.tools) return [];
  const baseToolId = selectedTool.value.includes(':')
    ? selectedTool.value.split(':')[0]
    : selectedTool.value;
  const tool = props.toolsManifest.tools[baseToolId];
  if (!tool?.parameters) return [];
  return Object.entries(tool.parameters).map(([name, param]) => ({
    name,
    ...(param as unknown as Record<string, unknown>),
  }));
});

// ─── handlers ───────────────────────────────────────────────────────────────
function toggleSecretVisibility(id: string) {
  const next = new Set(visibleSecrets.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  visibleSecrets.value = next;
}

function handleAddSecret() {
  if (!newSecretName.value.trim() || !newSecretKey.value.trim() || !newSecretValue.value.trim()) {
    toast.error('Please fill in all fields');
    return;
  }
  if (secrets.getSecretByKey(newSecretKey.value)) {
    toast.error(`Secret with key "${newSecretKey.value}" already exists`);
    return;
  }
  secrets.addSecret(newSecretName.value, newSecretKey.value, newSecretValue.value);
  newSecretName.value = '';
  newSecretKey.value = '';
  newSecretValue.value = '';
  toast.success('Secret added');
}

function startEditSecret(id: string, value: string) {
  editingSecretId.value = id;
  editingSecretValue.value = value;
}

function handleUpdateSecretValue(id: string) {
  if (!editingSecretValue.value.trim()) {
    toast.error('Secret value cannot be empty');
    return;
  }
  secrets.updateSecret(id, { value: editingSecretValue.value });
  editingSecretId.value = null;
  editingSecretValue.value = '';
  toast.success('Secret updated');
}

function handleDeleteSecret() {
  if (deleteSecretId.value) {
    secrets.deleteSecret(deleteSecretId.value);
    deleteSecretId.value = null;
    toast.success('Secret deleted');
  }
}

function handleAddMapping() {
  if (!selectedTool.value || !selectedParam.value || !selectedSecretKey.value) {
    toast.error('Please select tool, parameter, and secret');
    return;
  }
  secrets.addMapping(selectedTool.value, selectedParam.value, selectedSecretKey.value);
  selectedParam.value = '';
  selectedSecretKey.value = '';
  toast.success('Mapping added');
}

function handleAddHeaderMapping() {
  if (!selectedTool.value || !newHeaderName.value.trim() || !selectedHeaderSecretKey.value) {
    toast.error('Please select tool, enter header name, and select secret');
    return;
  }
  secrets.addHeaderMapping(
    selectedTool.value,
    newHeaderName.value,
    selectedHeaderSecretKey.value,
  );
  newHeaderName.value = '';
  selectedHeaderSecretKey.value = '';
  toast.success('Header mapping added');
}

function handleImport() {
  if (!importText.value.trim()) {
    toast.error('Please paste content to import');
    return;
  }
  try {
    if (importType.value === 'env') {
      secrets.importFromEnv(importText.value);
      toast.success('Secrets imported from ENV');
    } else {
      const parsed = JSON.parse(importText.value);
      if (parsed.secrets && parsed.mappings) {
        const secretValues: Record<string, string> = {};
        let hasValues = false;
        parsed.secrets.forEach((s: { key: string; value?: string }) => {
          if (s.value) {
            secretValues[s.key] = s.value;
            hasValues = true;
          } else {
            secretValues[s.key] = '';
          }
        });
        secrets.importConfig(parsed, secretValues);
        if (hasValues) toast.success('Config imported with secret values');
        else toast.info('Config imported - please fill in secret values');
      } else {
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === 'string') {
            const existing = secrets.getSecretByKey(key);
            if (existing) secrets.updateSecret(existing.id, { value });
            else secrets.addSecret(key, key, value);
          }
        }
        toast.success('Secrets imported from JSON');
      }
    }
    importText.value = '';
  } catch (e) {
    toast.error('Failed to parse import content');
    console.error('Import error:', e);
  }
}

function handleExport() {
  const exported = secrets.exportConfig(exportIncludeValues.value);
  const json = JSON.stringify(exported, null, 2);
  navigator.clipboard.writeText(json);
  toast.success(
    exportIncludeValues.value
      ? 'Config copied to clipboard (WITH secret values - handle securely!)'
      : 'Config copied to clipboard (without secret values)',
  );
}

const exportPreview = computed(() =>
  JSON.stringify(secrets.exportConfig(exportIncludeValues.value), null, 2),
);

function handleClearAll() {
  secrets.clearAll();
  clearConfirmOpen.value = false;
  toast.success('All secrets cleared');
}

function close() {
  emit('update:open', false);
}

function onBackdropClick(ev: MouseEvent) {
  if (ev.target === ev.currentTarget) close();
}

function onTopLevelKeyInput(ev: Event) {
  // mirrors source's normalisation: uppercase + non [A-Z0-9_] → _
  const target = ev.target as HTMLInputElement;
  newSecretKey.value = target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    @click="onBackdropClick"
  >
    <div
      class="w-[calc(100%-50px)] h-[calc(100%-50px)] bg-background border border-border rounded-lg shadow-xl flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-6 pt-6 pb-4 border-b border-border flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          <Key class="w-5 h-5" />
          Secrets Manager
        </h2>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
          @click="close"
        >
          <XIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- Tab bar -->
      <div class="px-6 mt-4">
        <div class="grid grid-cols-3 gap-1 bg-muted/40 rounded-md p-1">
          <button
            type="button"
            :class="[
              'inline-flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm transition-colors',
              activeTab === 'secrets'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ]"
            @click="activeTab = 'secrets'"
          >
            <Key class="w-4 h-4 shrink-0" />
            <span class="hidden sm:inline">Secrets</span>
            ({{ secretList.length }})
          </button>
          <button
            type="button"
            :class="[
              'inline-flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm transition-colors',
              activeTab === 'mappings'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ]"
            @click="activeTab = 'mappings'"
          >
            <LinkIcon class="w-4 h-4 shrink-0" />
            <span class="hidden sm:inline">Mappings</span>
            ({{ totalMappings }})
          </button>
          <button
            type="button"
            :class="[
              'inline-flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm transition-colors',
              activeTab === 'import'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ]"
            @click="activeTab = 'import'"
          >
            <Upload class="w-4 h-4 shrink-0" />
            <span class="hidden sm:inline">Import/Export</span>
            <span class="sm:hidden">I/E</span>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-hidden px-6 pb-6 pt-4">
        <!-- Secrets tab -->
        <div v-show="activeTab === 'secrets'" class="h-full overflow-auto pr-2">
          <div class="flex flex-col gap-4">
            <!-- Add Secret -->
            <div class="p-3 sm:p-4 border border-border rounded-lg bg-muted/30">
              <h3 class="font-medium mb-3">Add New Secret</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div class="space-y-1">
                  <label class="text-xs">Display Name</label>
                  <Input
                    v-model="newSecretName"
                    placeholder="e.g., GitHub PAT"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-xs">Key</label>
                  <Input
                    :model-value="newSecretKey"
                    placeholder="e.g., GITHUB_TOKEN"
                    @input="onTopLevelKeyInput"
                  />
                </div>
                <div class="space-y-1 sm:col-span-2 lg:col-span-1">
                  <label class="text-xs">Value</label>
                  <div class="flex gap-2">
                    <Input
                      v-model="newSecretValue"
                      type="password"
                      placeholder="Secret value"
                      class="flex-1"
                    />
                    <Button size="icon" class="shrink-0" @click="handleAddSecret">
                      <Plus class="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Secrets List -->
            <div class="space-y-2">
              <div v-if="secretList.length === 0" class="text-center text-muted-foreground py-8">
                No secrets configured. Add secrets above to get started.
              </div>
              <div
                v-for="secret in secretList"
                v-else
                :key="secret.id"
                class="flex items-center gap-3 p-3 border border-border rounded-lg"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium">{{ secret.name }}</span>
                    <Badge variant="outline" class="text-xs">{{ secret.key }}</Badge>
                    <Badge v-if="secret.type === 'oauth'" variant="secondary" class="text-xs">
                      OAuth
                    </Badge>
                  </div>
                  <div v-if="editingSecretId === secret.id" class="flex items-center gap-2 mt-2">
                    <Input
                      v-model="editingSecretValue"
                      type="password"
                      class="flex-1"
                      autofocus
                    />
                    <Button size="sm" @click="handleUpdateSecretValue(secret.id)">
                      <Check class="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" @click="editingSecretId = null">
                      <XIcon class="w-3 h-3" />
                    </Button>
                  </div>
                  <div v-else class="text-sm text-muted-foreground font-mono mt-1">
                    {{ visibleSecrets.has(secret.id) ? secret.value : '••••••••••••' }}
                  </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    :title="visibleSecrets.has(secret.id) ? 'Hide value' : 'Show value'"
                    @click="toggleSecretVisibility(secret.id)"
                  >
                    <EyeOff v-if="visibleSecrets.has(secret.id)" class="w-4 h-4" />
                    <Eye v-else class="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit value"
                    @click="startEditSecret(secret.id, secret.value)"
                  >
                    <Settings class="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete secret"
                    class="text-destructive hover:text-destructive"
                    @click="deleteSecretId = secret.id"
                  >
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Mappings tab -->
        <div v-show="activeTab === 'mappings'" class="h-full overflow-auto pr-2">
          <div class="flex flex-col gap-4">
            <!-- Configure Tool Parameters -->
            <div class="p-3 sm:p-4 border border-border rounded-lg bg-muted/30">
              <h3 class="font-medium mb-3">Configure Tool Parameters</h3>
              <div class="space-y-3">
                <!-- Tool type filter -->
                <div v-if="allInstances.length > 0" class="flex gap-2 mb-3">
                  <Button
                    :variant="toolTypeFilter === 'global' ? 'default' : 'outline'"
                    size="sm"
                    @click="toolTypeFilter = 'global'; selectedTool = ''"
                  >
                    Global Tools ({{ globalOnlyTools.length }})
                  </Button>
                  <Button
                    :variant="toolTypeFilter === 'instances' ? 'default' : 'outline'"
                    size="sm"
                    @click="toolTypeFilter = 'instances'; selectedTool = ''"
                  >
                    Tool Instances ({{ allInstances.length }})
                  </Button>
                </div>

                <div class="space-y-1">
                  <label class="text-xs">
                    {{ toolTypeFilter === 'instances' ? 'Select Tool Instance' : 'Select Tool' }}
                  </label>
                  <select
                    v-model="selectedTool"
                    class="w-full h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">
                      {{
                        toolTypeFilter === 'instances'
                          ? 'Choose an instance...'
                          : 'Choose a tool to configure...'
                      }}
                    </option>
                    <template v-if="toolTypeFilter === 'instances'">
                      <option
                        v-for="inst in allInstances"
                        :key="inst.id"
                        :value="inst.fullToolId"
                      >
                        {{ inst.label }} ({{ inst.fullToolId }})
                      </option>
                    </template>
                    <template v-else>
                      <option
                        v-for="tool in allInstances.length > 0 ? globalOnlyTools : edgeFunctionTools"
                        :key="tool.id"
                        :value="tool.id"
                      >
                        {{ tool.name }} ({{ tool.id }})
                      </option>
                    </template>
                  </select>
                </div>

                <template v-if="selectedTool">
                  <!-- Parameter mapping row -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-border">
                    <div class="space-y-1">
                      <label class="text-xs">Parameter</label>
                      <select
                        v-model="selectedParam"
                        class="w-full h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select parameter</option>
                        <option
                          v-for="param in selectedToolParams"
                          :key="param.name"
                          :value="param.name"
                        >
                          {{ param.name }}{{ (param as any).sensitive ? ' (sensitive)' : '' }}
                        </option>
                      </select>
                    </div>
                    <div class="space-y-1">
                      <label class="text-xs">Secret</label>
                      <select
                        v-model="selectedSecretKey"
                        class="w-full h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select secret</option>
                        <option
                          v-for="secret in secretList"
                          :key="secret.key"
                          :value="secret.key"
                        >
                          {{ secret.name }} ({{ secret.key }})
                        </option>
                      </select>
                    </div>
                    <div class="flex items-end sm:col-span-2 lg:col-span-1">
                      <Button
                        class="w-full sm:w-auto gap-1"
                        :disabled="!selectedParam || !selectedSecretKey"
                        @click="handleAddMapping"
                      >
                        <Plus class="w-4 h-4" />
                        Map Parameter
                      </Button>
                    </div>
                  </div>

                  <!-- Header mapping row -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-border">
                    <div class="space-y-1">
                      <label class="text-xs">Header Name</label>
                      <Input
                        v-model="newHeaderName"
                        placeholder="e.g., Authorization"
                      />
                    </div>
                    <div class="space-y-1">
                      <label class="text-xs">Secret</label>
                      <select
                        v-model="selectedHeaderSecretKey"
                        class="w-full h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select secret</option>
                        <option
                          v-for="secret in secretList"
                          :key="secret.key"
                          :value="secret.key"
                        >
                          {{ secret.name }} ({{ secret.key }})
                        </option>
                      </select>
                    </div>
                    <div class="flex items-end sm:col-span-2 lg:col-span-1">
                      <Button
                        class="w-full sm:w-auto gap-1"
                        :disabled="!newHeaderName.trim() || !selectedHeaderSecretKey"
                        @click="handleAddHeaderMapping"
                      >
                        <Plus class="w-4 h-4" />
                        Map Header
                      </Button>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- Active mappings -->
            <div class="space-y-3">
              <h3 class="font-medium">Active Mappings</h3>

              <div v-if="mappingList.length > 0" class="space-y-2">
                <h4 class="text-sm text-muted-foreground">Parameters</h4>
                <div
                  v-for="mapping in mappingList"
                  :key="mapping.id"
                  class="flex items-center justify-between p-2 border border-border rounded bg-background gap-2"
                >
                  <div class="flex items-center gap-2 flex-wrap min-w-0">
                    <Badge variant="outline" class="shrink-0">{{ mapping.toolId }}</Badge>
                    <span class="text-muted-foreground">.</span>
                    <span class="font-mono text-sm truncate">{{ mapping.parameterPath }}</span>
                    <span class="text-muted-foreground">→</span>
                    <Badge class="shrink-0">{{ mapping.secretKey }}</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 shrink-0"
                    @click="secrets.deleteMapping(mapping.id)"
                  >
                    <XIcon class="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div v-if="headerMappingList.length > 0" class="space-y-2">
                <h4 class="text-sm text-muted-foreground">Headers</h4>
                <template v-for="hm in headerMappingList" :key="hm.toolId">
                  <div
                    v-for="header in hm.headers"
                    :key="header.id"
                    class="flex items-center justify-between p-2 border border-border rounded bg-background gap-2"
                  >
                    <div class="flex items-center gap-2 flex-wrap min-w-0">
                      <Badge variant="outline" class="shrink-0">{{ hm.toolId }}</Badge>
                      <span class="text-muted-foreground">header:</span>
                      <span class="font-mono text-sm truncate">{{ header.name }}</span>
                      <span class="text-muted-foreground">→</span>
                      <Badge class="shrink-0">{{ header.secretKey }}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 shrink-0"
                      @click="secrets.deleteHeaderMapping(hm.toolId, header.id)"
                    >
                      <XIcon class="w-3 h-3" />
                    </Button>
                  </div>
                </template>
              </div>

              <div
                v-if="mappingList.length === 0 && headerMappingList.length === 0"
                class="text-center text-muted-foreground py-8"
              >
                No mappings configured. Select a tool above to add mappings.
              </div>
            </div>
          </div>
        </div>

        <!-- Import/Export tab -->
        <div v-show="activeTab === 'import'" class="h-full overflow-auto pr-2">
          <div class="flex flex-col gap-4">
            <!-- Import -->
            <div class="flex flex-col gap-3 p-3 sm:p-4 border border-border rounded-lg">
              <h3 class="font-medium">Import Secrets</h3>
              <div class="flex flex-wrap gap-2">
                <Button
                  :variant="importType === 'env' ? 'default' : 'outline'"
                  size="sm"
                  class="flex-1 sm:flex-none gap-1"
                  @click="importType = 'env'"
                >
                  <FileText class="w-4 h-4 shrink-0" />
                  ENV
                </Button>
                <Button
                  :variant="importType === 'json' ? 'default' : 'outline'"
                  size="sm"
                  class="flex-1 sm:flex-none gap-1"
                  @click="importType = 'json'"
                >
                  <FileText class="w-4 h-4 shrink-0" />
                  JSON
                </Button>
              </div>
              <textarea
                v-model="importText"
                :placeholder="
                  importType === 'env'
                    ? 'GITHUB_TOKEN=ghp_xxxx\nAPI_KEY=sk-xxxx\n...'
                    : '{\n  &quot;GITHUB_TOKEN&quot;: &quot;ghp_xxxx&quot;,\n  &quot;API_KEY&quot;: &quot;sk-xxxx&quot;\n}'
                "
                class="min-h-[150px] font-mono text-sm w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring resize-y"
              />
              <Button class="w-full gap-2" :disabled="!importText.trim()" @click="handleImport">
                <Upload class="w-4 h-4 shrink-0" />
                Import
              </Button>
            </div>

            <!-- Export -->
            <div class="flex flex-col gap-3 p-3 sm:p-4 border border-border rounded-lg">
              <h3 class="font-medium">Export Configuration</h3>
              <p class="text-sm text-muted-foreground">
                <template v-if="exportIncludeValues">
                  <strong class="text-destructive">Warning:</strong>
                  Secret values WILL be exported. Handle the output securely!
                </template>
                <template v-else>
                  Secret values are NOT exported for security — only keys and mappings.
                </template>
              </p>
              <div class="flex items-center gap-2">
                <input
                  id="include-values"
                  v-model="exportIncludeValues"
                  type="checkbox"
                  class="h-4 w-4 rounded border-border accent-primary"
                />
                <label for="include-values" class="text-sm cursor-pointer">
                  Include secret values in export
                </label>
              </div>
              <div class="bg-muted/30 rounded p-3 overflow-auto max-h-[200px]">
                <pre class="text-xs font-mono whitespace-pre-wrap break-all">{{ exportPreview }}</pre>
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <Button class="flex-1 gap-2" @click="handleExport">
                  <Copy class="w-4 h-4 shrink-0" />
                  <span class="truncate">Copy to Clipboard</span>
                </Button>
                <Button
                  variant="destructive"
                  class="sm:flex-none gap-2"
                  :disabled="secretList.length === 0"
                  @click="clearConfirmOpen = true"
                >
                  <Trash2 class="w-4 h-4 shrink-0" />
                  <span class="hidden sm:inline">Clear All</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete-secret confirmation -->
    <div
      v-if="deleteSecretId"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      @click.self="deleteSecretId = null"
    >
      <div class="w-full max-w-md bg-background border border-border rounded-lg shadow-xl p-6">
        <h3 class="text-lg font-semibold flex items-center gap-2 mb-2">
          <AlertTriangle class="w-5 h-5 text-destructive" />
          Delete Secret
        </h3>
        <p class="text-sm text-muted-foreground mb-6">
          This will delete the secret and remove all mappings that reference it. This action
          cannot be undone.
        </p>
        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" @click="deleteSecretId = null">Cancel</Button>
          <Button
            size="sm"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDeleteSecret"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>

    <!-- Clear-all confirmation -->
    <div
      v-if="clearConfirmOpen"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      @click.self="clearConfirmOpen = false"
    >
      <div class="w-full max-w-md bg-background border border-border rounded-lg shadow-xl p-6">
        <h3 class="text-lg font-semibold flex items-center gap-2 mb-2">
          <AlertTriangle class="w-5 h-5 text-destructive" />
          Clear All Secrets
        </h3>
        <p class="text-sm text-muted-foreground mb-6">
          This will delete all secrets and mappings. This action cannot be undone.
        </p>
        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" @click="clearConfirmOpen = false">Cancel</Button>
          <Button
            size="sm"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleClearAll"
          >
            Clear All
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
