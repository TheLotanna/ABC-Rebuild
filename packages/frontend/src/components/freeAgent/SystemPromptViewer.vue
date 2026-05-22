<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePromptCustomization } from '@/composables/usePromptCustomization';
import { toast } from 'vue-sonner';
import {
  ChevronDown, ChevronRight, Lock, Pencil, RefreshCw, Download, Upload,
  Eye, Code, FileJson, Cpu, Brain, Shield, Workflow, AlertTriangle,
  Database, Settings, RotateCcw, Save, X, Check, Undo2, Plus,
  ChevronUp, Trash2, GripVertical, Search, Globe, Clock, Cloud,
  FileText, GitBranch, ClipboardList, Mail, HelpCircle, Image, Volume2,
  BarChart2, Archive, ScanText, FolderOutput, FileCode, ClipboardCopy,
  ClipboardEdit, MessageSquare, Files, FileSearch, FileArchive, Edit3,
} from '@lucide/vue';
import type {
  SystemPromptTemplate, PromptSection, ResponseSchema,
  ExportedPromptTemplate, ToolsManifest, ToolDefinition,
} from '@agent-builder/shared';

const props = defineProps<{
  configuredParams?: Array<{ tool: string; param: string }>;
}>();

const promptStore = usePromptCustomization();

// --- Data ---
const template = ref<SystemPromptTemplate | null>(null);
const toolsManifest = ref<ToolsManifest | null>(null);
const loading = ref(true);

// --- UI state ---
const expandedSections = ref<Set<string>>(new Set());
const expandedCategories = ref<Set<string>>(new Set());
const activeTab = ref<'sections' | 'schemas' | 'tools'>('sections');
const resetDialogOpen = ref(false);
const addSectionDialogOpen = ref(false);
const newSectionTitle = ref('');
const newSectionContent = ref('');
const newSectionDescription = ref('');
const deleteConfirmId = ref<string | null>(null);
const toolSearchQuery = ref('');
const isEditingName = ref(false);
const editName = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

// Per-section editing state
const sectionEditing = ref<Record<string, boolean>>({});
const sectionEditContent = ref<Record<string, string>>({});
const sectionEditingTitle = ref<Record<string, boolean>>({});
const sectionEditTitleContent = ref<Record<string, string>>({});

// Per-tool state
const toolExpanded = ref<Record<string, boolean>>({});
const toolEditing = ref<Record<string, boolean>>({});
const toolEditContent = ref<Record<string, string>>({});

// Per-schema raw toggle
const schemaShowRaw = ref<Record<number, boolean>>({});

onMounted(async () => {
  try {
    const [tpl, mfst] = await Promise.all([
      fetch('/data/systemPromptTemplate.json').then(r => r.json()),
      fetch('/data/toolsManifest.json').then(r => r.json()),
    ]);
    template.value = tpl as SystemPromptTemplate;
    toolsManifest.value = mfst as ToolsManifest;
  } catch (err) {
    console.error('Failed to load system prompt data:', err);
  } finally {
    loading.value = false;
  }
});

// --- Computed ---

const sortedSections = computed<PromptSection[]>(() => {
  if (!template.value) return [];
  return promptStore.getSortedSections(template.value.sections);
});

const customSections = computed<PromptSection[]>(() => promptStore.getCustomSections());
const customSectionIds = computed(() => new Set(customSections.value.map((s: PromptSection) => s.id)));

const toolsByCategory = computed(() => {
  if (!toolsManifest.value) return {} as Record<string, Array<{ id: string; tool: ToolDefinition }>>;
  const groups: Record<string, Array<{ id: string; tool: ToolDefinition }>> = {};
  for (const [id, tool] of Object.entries(toolsManifest.value.tools)) {
    const cats = Array.isArray(tool.category) ? tool.category : [tool.category];
    for (const cat of cats) {
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ id, tool });
    }
  }
  return groups;
});

const filteredToolsByCategory = computed(() => {
  if (!toolSearchQuery.value.trim()) return toolsByCategory.value;
  const query = toolSearchQuery.value.toLowerCase();
  const filtered: Record<string, Array<{ id: string; tool: ToolDefinition }>> = {};
  for (const [cat, tools] of Object.entries(toolsByCategory.value)) {
    const matching = tools.filter(({ id, tool }) =>
      id.toLowerCase().includes(query) ||
      tool.name.toLowerCase().includes(query) ||
      tool.description.toLowerCase().includes(query)
    );
    if (matching.length > 0) filtered[cat] = matching;
  }
  return filtered;
});

const editableCounts = computed(() => {
  if (!template.value) return { editable: 0, readonly: 0, dynamic: 0, customized: 0, custom: 0 };
  const visibleCustomized = Array.from(promptStore.customizedSectionIds as Set<string>).filter(
    (id: string) => !promptStore.isSectionDisabled(id) && !customSectionIds.value.has(id)
  ).length;
  return {
    editable: template.value.sections.filter(s => s.editable === 'editable' || s.editable === 'substitutable').length,
    readonly: template.value.sections.filter(s => s.editable === 'readonly').length,
    dynamic: template.value.sections.filter(s => s.editable === 'dynamic').length,
    customized: visibleCustomized,
    custom: customSections.value.length,
  };
});

const hasAnyCustomization = computed(() =>
  promptStore.hasCustomizations || promptStore.hasOrderChanges || promptStore.hasToolCustomizations ||
  editableCounts.value.custom > 0
);

// --- Icon maps ---
const sectionIconMap: Record<string, unknown> = {
  identity: Cpu, tools: Settings, memory: Brain, workflow: Workflow,
  anti_loop: Shield, response_format: FileJson, data_handling: Database,
  execution: AlertTriangle, dynamic: RefreshCw, custom: Pencil,
};

const toolIconMap: Record<string, unknown> = {
  Clock, Cloud, Search, Globe, GitBranch, FileCode, ClipboardList, Edit3,
  FileText, Database, ClipboardCopy, ClipboardEdit, MessageSquare,
  Files, Archive, FileArchive, FolderOutput, FileSearch, ScanText,
  Brain, BarChart2, Mail, HelpCircle, Image, Volume2, Download, Upload,
};

const editableColors: Record<string, string> = {
  readonly: 'bg-muted text-muted-foreground',
  editable: 'bg-primary/10 text-primary border-primary/30',
  substitutable: 'bg-primary/10 text-primary border-primary/30',
  dynamic: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
};

const editableLabels: Record<string, string> = {
  readonly: 'System', editable: 'Customizable', substitutable: 'Customizable', dynamic: 'Runtime',
};

const providerColors: Record<string, string> = {
  gemini: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  claude: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  grok: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

// --- Content helpers ---
function getDisplayContent(section: PromptSection): string {
  let content = promptStore.getEffectiveContent(section);
  if (content.includes('{{CONFIGURED_PARAMS}}')) {
    const cp = props.configuredParams || [];
    if (cp.length === 0) {
      content = content.replace('{{CONFIGURED_PARAMS}}',
        '*No tool parameters currently configured. Add secrets and mappings in the Secrets tab.*');
    } else {
      const byTool: Record<string, string[]> = {};
      for (const item of cp) {
        if (!byTool[item.tool]) byTool[item.tool] = [];
        byTool[item.tool].push(item.param);
      }
      const list = Object.entries(byTool).map(([t, ps]) => `- **${t}**: ${ps.join(', ')}`).join('\n');
      content = content.replace('{{CONFIGURED_PARAMS}}',
        `## 🔐 PRE-CONFIGURED TOOL PARAMETERS\n\n${list}\n\n*These values are injected automatically at execution time.*`);
    }
  }
  return content;
}

// --- Section actions ---
function toggleSection(id: string) {
  const s = new Set(expandedSections.value);
  s.has(id) ? s.delete(id) : s.add(id);
  expandedSections.value = s;
}

function expandAll() {
  if (!template.value) return;
  expandedSections.value = new Set(sortedSections.value.map((s: PromptSection) => s.id));
}

function collapseAll() {
  expandedSections.value = new Set();
}

function startEditSection(section: PromptSection) {
  sectionEditContent.value[section.id] = getDisplayContent(section);
  sectionEditing.value[section.id] = true;
}

function saveSection(section: PromptSection) {
  const content = sectionEditContent.value[section.id] ?? '';
  if (customSectionIds.value.has(section.id)) {
    promptStore.updateCustomSection(section.id, { content });
  } else {
    promptStore.updateSection(section.id, content);
  }
  sectionEditing.value[section.id] = false;
  toast.success(`Saved changes to "${section.title}"`);
}

function cancelEditSection(sectionId: string) {
  sectionEditing.value[sectionId] = false;
}

function resetSectionToDefault(section: PromptSection) {
  promptStore.resetSection(section.id);
  sectionEditContent.value[section.id] = section.content;
  sectionEditing.value[section.id] = false;
  toast.success(`Reset "${section.title}" to default`);
}

function startEditSectionTitle(section: PromptSection) {
  sectionEditTitleContent.value[section.id] = section.title;
  sectionEditingTitle.value[section.id] = true;
}

function saveSectionTitle(section: PromptSection) {
  const title = (sectionEditTitleContent.value[section.id] || '').trim();
  if (!title) return;
  promptStore.updateCustomSection(section.id, { title });
  sectionEditingTitle.value[section.id] = false;
  toast.success('Section title updated');
}

// --- Tool actions ---
function startEditTool(toolId: string, desc: string) {
  toolEditContent.value[toolId] = desc;
  toolEditing.value[toolId] = true;
}

function saveTool(toolId: string, toolName: string) {
  promptStore.updateToolDescription(toolId, toolEditContent.value[toolId] ?? '');
  toolEditing.value[toolId] = false;
  toast.success(`Updated description for "${toolName}"`);
}

function cancelEditTool(toolId: string) {
  toolEditing.value[toolId] = false;
}

function resetTool(toolId: string, toolName: string) {
  promptStore.resetToolDescription(toolId);
  toolEditing.value[toolId] = false;
  toast.success(`Reset "${toolName}" to default description`);
}

// --- Export / Import ---
function handleExport() {
  if (!template.value) return;
  const data = promptStore.exportCustomizations(template.value);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const customName = promptStore.getCustomName();
  const safeName = (customName || template.value.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.download = `${safeName}-v${template.value.version}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Template exported successfully');
}

function handleImportClick() {
  fileInputRef.value?.click();
}

function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !template.value) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target?.result as string) as ExportedPromptTemplate;
      if (promptStore.importCustomizations(data, template.value!)) {
        toast.success(`Imported customizations from "${data.template.name}"`);
      } else {
        toast.error('Failed to import template');
      }
    } catch {
      toast.error('Invalid template file');
    }
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = '';
}

function handleResetAll() {
  promptStore.resetAll();
  resetDialogOpen.value = false;
  toast.success('All customizations have been reset to defaults');
}

function handleAddSection() {
  const title = newSectionTitle.value.trim();
  if (!title) {
    toast.error('Section title is required');
    return;
  }
  const id = promptStore.addCustomSection({
    title,
    content: newSectionContent.value || 'Enter your custom instructions here...',
    type: 'custom',
    editable: 'editable',
    description: newSectionDescription.value.trim() || undefined,
  });
  addSectionDialogOpen.value = false;
  newSectionTitle.value = '';
  newSectionContent.value = '';
  newSectionDescription.value = '';
  const s = new Set(expandedSections.value);
  s.add(id);
  expandedSections.value = s;
  toast.success(`Added custom section "${title}"`);
}

function handleDeleteSection(sectionId: string) {
  promptStore.deleteCustomSection(sectionId);
  deleteConfirmId.value = null;
  toast.success('Custom section deleted');
}
</script>

<template>
  <div class="h-full flex flex-col bg-background overflow-hidden">
    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json"
      class="hidden"
      @change="handleImportFile"
    />

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <RefreshCw class="h-6 w-6 animate-spin text-muted-foreground" />
    </div>

    <!-- Error state -->
    <div v-else-if="!template" class="flex items-center justify-center h-full text-muted-foreground text-sm">
      Failed to load system prompt template
    </div>

    <!-- Main content -->
    <template v-else>
      <!-- Header -->
      <div class="border-b border-border px-4 py-3 flex-shrink-0">
        <!-- Name row -->
        <div class="flex items-center gap-2 mb-1">
          <div v-if="isEditingName" class="flex items-center gap-2 flex-1">
            <input
              v-model="editName"
              class="h-8 text-lg font-semibold border border-border rounded px-2 bg-background text-foreground max-w-xs w-full"
              placeholder="Template name..."
              autofocus
              @keydown.enter="() => { promptStore.setCustomName(editName); isEditingName = false; toast.success('Template name updated'); }"
              @keydown.escape="isEditingName = false"
            />
            <button
              class="h-8 w-8 flex items-center justify-center rounded hover:bg-muted"
              @click="() => { promptStore.setCustomName(editName); isEditingName = false; toast.success('Template name updated'); }"
            >
              <Check class="h-4 w-4" />
            </button>
            <button class="h-8 w-8 flex items-center justify-center rounded hover:bg-muted" @click="isEditingName = false">
              <X class="h-4 w-4" />
            </button>
          </div>
          <template v-else>
            <h2 class="text-lg font-semibold">{{ promptStore.getCustomName() || template.name }}</h2>
            <button
              class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Edit name"
              @click="() => { editName = promptStore.getCustomName() || template.name; isEditingName = true; }"
            >
              <Edit3 class="h-3 w-3" />
            </button>
          </template>
        </div>

        <!-- Meta info -->
        <p class="text-xs text-muted-foreground mb-2">
          v{{ template.version }} &bull; {{ sortedSections.length }} sections
          <span v-if="toolsManifest"> &bull; {{ Object.keys(toolsManifest.tools).length }} tools</span>
          <span v-if="editableCounts.custom > 0" class="text-purple-600 dark:text-purple-400 ml-2">
            &bull; {{ editableCounts.custom }} custom
          </span>
          <span v-if="promptStore.hasCustomizations || promptStore.hasToolCustomizations" class="text-green-600 dark:text-green-400 ml-2">
            &bull; modified
          </span>
          <span v-if="promptStore.hasOrderChanges" class="text-amber-600 dark:text-amber-400 ml-2">
            &bull; reordered
          </span>
        </p>

        <!-- Action buttons -->
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <button
            class="h-8 px-3 flex items-center gap-1 text-xs border border-border rounded hover:bg-muted transition-colors"
            title="Export customizations"
            @click="handleExport"
          >
            <Download class="h-3 w-3" />
            <span class="hidden xl:inline">Export</span>
          </button>
          <button
            class="h-8 px-3 flex items-center gap-1 text-xs border border-border rounded hover:bg-muted transition-colors"
            title="Import customizations"
            @click="handleImportClick"
          >
            <Upload class="h-3 w-3" />
            <span class="hidden xl:inline">Import</span>
          </button>
          <button
            v-if="hasAnyCustomization"
            class="h-8 px-3 flex items-center gap-1 text-xs border border-border rounded text-destructive hover:bg-destructive/10 transition-colors"
            title="Reset all customizations"
            @click="resetDialogOpen = true"
          >
            <RotateCcw class="h-3 w-3" />
            <span class="hidden xl:inline">Reset All</span>
          </button>
        </div>

        <!-- Legend badges -->
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span :class="`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${editableColors.editable}`">
            <Pencil class="h-3 w-3" />Customizable ({{ editableCounts.editable }})
          </span>
          <span :class="`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${editableColors.readonly}`">
            <Lock class="h-3 w-3" />System ({{ editableCounts.readonly }})
          </span>
          <span :class="`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${editableColors.dynamic}`">
            <RefreshCw class="h-3 w-3" />Runtime ({{ editableCounts.dynamic }})
          </span>
          <span v-if="editableCounts.custom > 0" class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
            <Plus class="h-3 w-3" />Custom ({{ editableCounts.custom }})
          </span>
          <span v-if="promptStore.hasCustomizations" class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
            <Check class="h-3 w-3" />Modified ({{ editableCounts.customized }})
          </span>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="flex border-b border-border flex-shrink-0 px-4">
        <button
          v-for="tab in [
            { id: 'sections', icon: FileJson, label: 'Sections' },
            { id: 'schemas', icon: Code, label: 'Response Schema' },
            { id: 'tools', icon: Settings, label: 'Tools' },
          ]"
          :key="tab.id"
          class="flex items-center justify-center gap-1 py-2 px-2 text-xs font-medium transition-colors border-b-2 -mb-px flex-1"
          :class="activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          :title="tab.label"
          @click="activeTab = tab.id as any"
        >
          <component :is="tab.icon" class="h-3 w-3 shrink-0" />
          <span class="hidden xl:inline truncate text-xs">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab: Sections -->
      <div v-if="activeTab === 'sections'" class="flex-1 flex flex-col overflow-hidden">
        <!-- Toolbar -->
        <div class="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap flex-shrink-0">
          <button
            class="h-7 px-2 flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            @click="addSectionDialogOpen = true"
          >
            <Plus class="h-3 w-3" />Add Section
          </button>
          <div class="flex-1" />
          <button class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted" @click="expandAll">Expand All</button>
          <button class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted" @click="collapseAll">Collapse All</button>
          <button
            v-if="promptStore.hasOrderChanges"
            class="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted"
            @click="promptStore.resetOrder()"
          >
            <Undo2 class="h-3 w-3" />Reset Order
          </button>
        </div>

        <!-- Sections list -->
        <div class="flex-1 overflow-y-auto p-4">
          <div
            v-for="(section, index) in sortedSections"
            :key="section.id"
            class="border rounded-lg mb-2 overflow-hidden transition-colors"
            :class="[
              promptStore.isSectionDisabled(section.id)
                ? 'opacity-50 border-muted bg-muted/30'
                : customSectionIds.has(section.id)
                  ? 'border-purple-500/50 bg-purple-500/5'
                  : promptStore.isCustomized(section.id)
                    ? 'border-green-500/50 bg-green-500/5'
                    : section.editable === 'editable'
                      ? 'border-primary/30 bg-primary/5'
                      : section.editable === 'dynamic'
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-border bg-card'
            ]"
          >
            <!-- Section header row -->
            <div class="flex items-center">
              <!-- Enable/Disable toggle -->
              <div class="flex items-center px-2 border-r border-border/50" @click.stop>
                <button
                  :title="promptStore.isSectionDisabled(section.id) ? 'Enable section' : 'Disable section'"
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
                  :class="promptStore.isSectionDisabled(section.id) ? 'bg-muted' : 'bg-primary'"
                  @click="promptStore.toggleSectionDisabled(section.id)"
                >
                  <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                    :class="promptStore.isSectionDisabled(section.id) ? 'translate-x-0.5' : 'translate-x-4.5'"
                  />
                </button>
              </div>

              <!-- Reorder buttons -->
              <div class="flex flex-col px-1 py-2 border-r border-border/50">
                <button
                  class="h-5 w-5 flex items-center justify-center hover:bg-muted rounded disabled:opacity-30"
                  :disabled="index === 0"
                  @click.stop="promptStore.moveSection(section.id, 'up', template!.sections)"
                >
                  <ChevronUp class="h-3 w-3" />
                </button>
                <GripVertical class="h-3 w-3 mx-auto text-muted-foreground/50" />
                <button
                  class="h-5 w-5 flex items-center justify-center hover:bg-muted rounded disabled:opacity-30"
                  :disabled="index === sortedSections.length - 1"
                  @click.stop="promptStore.moveSection(section.id, 'down', template!.sections)"
                >
                  <ChevronDown class="h-3 w-3" />
                </button>
              </div>

              <!-- Expand trigger -->
              <button
                class="flex-1 px-3 py-3 flex flex-wrap items-center gap-2 hover:bg-muted/50 transition-colors text-left min-w-0 overflow-hidden"
                @click="toggleSection(section.id)"
              >
                <component
                  :is="expandedSections.has(section.id) ? ChevronDown : ChevronRight"
                  class="h-4 w-4 text-muted-foreground shrink-0"
                />
                <component
                  :is="sectionIconMap[section.type] || FileJson"
                  class="h-4 w-4 text-muted-foreground shrink-0"
                />
                <span
                  class="font-medium text-sm truncate min-w-0 flex-1"
                  :class="promptStore.isSectionDisabled(section.id) ? 'line-through text-muted-foreground' : ''"
                >
                  {{ section.title }}
                </span>
                <div class="flex flex-wrap gap-1 shrink-0">
                  <span v-if="promptStore.isSectionDisabled(section.id)" class="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] bg-muted text-muted-foreground border-muted-foreground/30">
                    Disabled
                  </span>
                  <span v-else-if="customSectionIds.has(section.id)" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                    <Plus class="h-2.5 w-2.5" />Custom
                  </span>
                  <span v-else-if="promptStore.isCustomized(section.id)" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                    <Check class="h-2.5 w-2.5" />Modified
                  </span>
                  <span
                    v-if="!promptStore.isSectionDisabled(section.id)"
                    :class="`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${editableColors[section.editable] || ''}`"
                  >
                    <Lock v-if="section.editable === 'readonly'" class="h-2.5 w-2.5" />
                    <Pencil v-else-if="section.editable === 'editable'" class="h-2.5 w-2.5" />
                    <RefreshCw v-else-if="section.editable === 'dynamic'" class="h-2.5 w-2.5" />
                    {{ editableLabels[section.editable] }}
                  </span>
                </div>
              </button>

              <!-- Delete (custom sections only) -->
              <button
                v-if="customSectionIds.has(section.id)"
                class="h-8 w-8 flex items-center justify-center mr-2 text-destructive hover:bg-destructive/10 rounded"
                title="Delete section"
                @click.stop="deleteConfirmId = section.id"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>

            <!-- Section content (expanded) -->
            <div v-if="expandedSections.has(section.id)" class="px-4 pb-4 border-t border-border/50">
              <!-- Edit title (custom sections) -->
              <div v-if="customSectionIds.has(section.id)" class="mt-3 mb-2">
                <div v-if="sectionEditingTitle[section.id]" class="flex items-center gap-2">
                  <input
                    v-model="sectionEditTitleContent[section.id]"
                    class="h-7 text-sm border border-border rounded px-2 bg-background text-foreground flex-1"
                    placeholder="Section title..."
                  />
                  <button class="h-7 px-2 flex items-center bg-primary text-primary-foreground rounded text-xs" @click="saveSectionTitle(section)">
                    <Save class="h-3 w-3" />
                  </button>
                  <button class="h-7 px-2 flex items-center hover:bg-muted rounded text-xs" @click="sectionEditingTitle[section.id] = false">
                    <X class="h-3 w-3" />
                  </button>
                </div>
                <button v-else class="h-6 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted" @click="startEditSectionTitle(section)">
                  <Pencil class="h-3 w-3" />Edit Title
                </button>
              </div>

              <p v-if="section.description" class="text-xs text-muted-foreground mt-3 mb-2 italic">
                {{ section.description }}
              </p>

              <div v-if="section.variables && section.variables.length > 0" class="flex flex-wrap gap-1 mb-2 mt-2">
                <code
                  v-for="v in section.variables"
                  :key="v"
                  class="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded text-xs font-mono"
                >{{ v }}</code>
              </div>

              <!-- Edit controls for editable sections -->
              <div v-if="section.editable === 'editable' && !sectionEditing[section.id]" class="flex items-center gap-2 mt-3 mb-2">
                <button class="h-7 px-2 flex items-center gap-1 text-xs border border-border rounded hover:bg-muted" @click="startEditSection(section)">
                  <Pencil class="h-3 w-3" />Edit
                </button>
                <button
                  v-if="promptStore.isCustomized(section.id) && !customSectionIds.has(section.id)"
                  class="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                  @click="resetSectionToDefault(section)"
                >
                  <Undo2 class="h-3 w-3" />Reset to Default
                </button>
              </div>

              <!-- Editing mode -->
              <div v-if="sectionEditing[section.id]" class="mt-2 space-y-2">
                <textarea
                  v-model="sectionEditContent[section.id]"
                  class="min-h-[200px] w-full max-w-full font-mono text-sm border border-border rounded p-2 bg-background text-foreground resize-y"
                  placeholder="Enter section content..."
                />
                <div class="flex items-center gap-2">
                  <button class="h-7 px-2 flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90" @click="saveSection(section)">
                    <Save class="h-3 w-3" />Save
                  </button>
                  <button class="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted" @click="cancelEditSection(section.id)">
                    <X class="h-3 w-3" />Cancel
                  </button>
                  <button
                    v-if="promptStore.isCustomized(section.id) && !customSectionIds.has(section.id)"
                    class="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                    @click="resetSectionToDefault(section)"
                  >
                    <Undo2 class="h-3 w-3" />Reset
                  </button>
                </div>
              </div>

              <!-- Display mode -->
              <div v-else class="mt-2 text-sm bg-muted/30 rounded-md p-3 overflow-hidden max-w-full">
                <pre class="text-xs whitespace-pre-wrap break-words font-sans">{{ getDisplayContent(section) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: Response Schemas -->
      <div v-else-if="activeTab === 'schemas'" class="flex-1 overflow-y-auto">
        <div class="p-4">
          <p class="text-sm text-muted-foreground mb-4">
            Response schemas define how the LLM must structure its responses. Each provider uses a different mechanism to enforce JSON structure.
          </p>
          <div
            v-for="(schema, i) in template.responseSchemas"
            :key="i"
            class="border border-border rounded-lg mb-3 overflow-hidden bg-card"
          >
            <div class="px-4 py-3 flex items-center justify-between border-b border-border/50">
              <div class="flex items-center gap-3">
                <span :class="`px-2 py-0.5 rounded text-xs font-medium ${providerColors[schema.provider] || ''}`">
                  {{ schema.provider.charAt(0).toUpperCase() + schema.provider.slice(1) }}
                </span>
                <span class="font-medium text-sm">{{ schema.name }}</span>
              </div>
              <button
                class="h-7 px-2 flex items-center gap-1 text-xs hover:bg-muted rounded border border-border"
                @click="schemaShowRaw[i] = !schemaShowRaw[i]"
              >
                <Eye v-if="schemaShowRaw[i]" class="h-3 w-3" />
                <Code v-else class="h-3 w-3" />
                {{ schemaShowRaw[i] ? 'Preview' : 'Raw JSON' }}
              </button>
            </div>
            <div class="p-4">
              <p class="text-xs text-muted-foreground mb-3">{{ schema.description }}</p>
              <pre
                class="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap break-words"
                :class="schemaShowRaw[i] ? 'max-h-80' : ''"
              >{{ schema.rawSchema }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: Tools -->
      <div v-else-if="activeTab === 'tools'" class="flex-1 flex flex-col overflow-hidden">
        <!-- Search bar -->
        <div class="px-4 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
          <div class="relative flex-1">
            <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              v-model="toolSearchQuery"
              placeholder="Search tools..."
              class="pl-8 h-8 w-full border border-border rounded text-sm bg-background text-foreground pr-2"
            />
          </div>
          <span class="px-2 py-0.5 rounded border border-border text-xs text-muted-foreground">
            {{ toolsManifest ? Object.keys(toolsManifest.tools).length : 0 }} tools
          </span>
          <span v-if="promptStore.hasToolCustomizations" class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
            <Check class="h-3 w-3" />Customized
          </span>
        </div>

        <!-- Tools list by category -->
        <div class="flex-1 overflow-y-auto p-4">
          <!-- No manifest -->
          <div v-if="!toolsManifest" class="text-center py-8 text-muted-foreground">
            <RefreshCw class="h-6 w-6 animate-spin mx-auto mb-2" />
            <p class="text-sm">Loading tools...</p>
          </div>

          <!-- No results -->
          <div v-else-if="Object.entries(filteredToolsByCategory).length === 0" class="text-center py-8 text-muted-foreground">
            <Search class="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p class="text-sm">No tools match "{{ toolSearchQuery }}"</p>
          </div>

          <!-- Category groups -->
          <template v-else>
            <div
              v-for="[categoryId, tools] in Object.entries(filteredToolsByCategory).sort(([a], [b]) => a.localeCompare(b))"
              :key="categoryId"
              class="mb-3"
            >
              <template v-if="toolsManifest.categories[categoryId]">
                <!-- Category header -->
                <button
                  class="w-full flex flex-wrap items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  @click="() => { const s = new Set(expandedCategories); s.has(categoryId) ? s.delete(categoryId) : s.add(categoryId); expandedCategories = s; }"
                >
                  <component :is="expandedCategories.has(categoryId) ? ChevronDown : ChevronRight" class="h-4 w-4 shrink-0" />
                  <span
                    class="w-3 h-3 rounded-full shrink-0"
                    :style="{ backgroundColor: toolsManifest.categories[categoryId].color }"
                  />
                  <span class="font-medium text-sm shrink-0">{{ toolsManifest.categories[categoryId].name }}</span>
                  <span class="text-xs text-muted-foreground shrink-0">({{ tools.length }})</span>
                  <span class="hidden sm:block flex-1" />
                  <span class="text-xs text-muted-foreground break-words w-full sm:w-auto">{{ toolsManifest.categories[categoryId].description }}</span>
                </button>

                <!-- Tools in category -->
                <div v-if="expandedCategories.has(categoryId)" class="ml-4 mt-2">
                  <div
                    v-for="{ id: toolId, tool } in tools"
                    :key="toolId"
                    class="border rounded-lg mb-2 overflow-hidden transition-colors"
                    :class="promptStore.isToolDisabled(toolId)
                      ? 'opacity-50 border-muted bg-muted/30'
                      : promptStore.isToolCustomized(toolId)
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-border bg-card'"
                  >
                    <!-- Tool header row -->
                    <div class="flex items-center">
                      <!-- Enable/Disable toggle -->
                      <div class="flex items-center px-2 border-r border-border/50" @click.stop>
                        <button
                          :title="promptStore.isToolDisabled(toolId) ? 'Enable tool' : 'Disable tool'"
                          class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
                          :class="promptStore.isToolDisabled(toolId) ? 'bg-muted' : 'bg-primary'"
                          @click="promptStore.toggleToolDisabled(toolId)"
                        >
                          <span
                            class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
                            :class="promptStore.isToolDisabled(toolId) ? 'translate-x-0.5' : 'translate-x-4.5'"
                          />
                        </button>
                      </div>

                      <!-- Expand button -->
                      <button
                        class="flex-1 px-3 py-3 flex flex-wrap items-center gap-2 hover:bg-muted/50 transition-colors text-left min-w-0 overflow-hidden"
                        @click="toolExpanded[toolId] = !toolExpanded[toolId]"
                      >
                        <component :is="toolExpanded[toolId] ? ChevronDown : ChevronRight" class="h-4 w-4 text-muted-foreground shrink-0" />
                        <component
                          :is="toolIconMap[tool.icon] || Settings"
                          class="h-4 w-4 text-muted-foreground shrink-0"
                        />
                        <span
                          class="font-medium text-sm truncate min-w-0 flex-1"
                          :class="promptStore.isToolDisabled(toolId) ? 'line-through text-muted-foreground' : ''"
                        >
                          {{ tool.name }}
                        </span>
                        <div class="flex flex-wrap gap-1 shrink-0">
                          <span v-if="promptStore.isToolDisabled(toolId)" class="px-1.5 py-0.5 rounded border text-[10px] bg-muted text-muted-foreground border-muted-foreground/30">
                            Disabled
                          </span>
                          <template v-else>
                            <span
                              v-for="cat in (Array.isArray(tool.category) ? tool.category : [tool.category])"
                              :key="cat"
                              class="px-1.5 py-0.5 rounded border text-[10px]"
                              :style="toolsManifest.categories[cat] ? {
                                backgroundColor: `${toolsManifest.categories[cat].color}20`,
                                borderColor: `${toolsManifest.categories[cat].color}50`,
                                color: toolsManifest.categories[cat].color,
                              } : {}"
                            >
                              {{ toolsManifest.categories[cat]?.name || cat }}
                            </span>
                            <span v-if="promptStore.isToolCustomized(toolId)" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                              <Check class="h-2.5 w-2.5" />Modified
                            </span>
                            <span v-if="tool.frontend_handler" class="px-1.5 py-0.5 rounded border text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                              Frontend
                            </span>
                          </template>
                        </div>
                      </button>
                    </div>

                    <!-- Tool details (expanded) -->
                    <div v-if="toolExpanded[toolId]" class="px-4 pb-4 border-t border-border/50">
                      <div class="mt-3 space-y-3">
                        <!-- Description -->
                        <div>
                          <div class="flex items-center justify-between mb-1">
                            <span class="text-xs font-medium text-muted-foreground">Description</span>
                            <div v-if="!toolEditing[toolId]" class="flex items-center gap-1">
                              <button
                                class="h-6 px-2 flex items-center gap-1 text-xs hover:bg-muted rounded"
                                @click="startEditTool(toolId, promptStore.getEffectiveToolDescription(toolId, tool.description))"
                              >
                                <Pencil class="h-3 w-3" />Edit
                              </button>
                              <button
                                v-if="promptStore.isToolCustomized(toolId)"
                                class="h-6 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                                @click="resetTool(toolId, tool.name)"
                              >
                                <Undo2 class="h-3 w-3" />Reset
                              </button>
                            </div>
                          </div>

                          <div v-if="toolEditing[toolId]" class="space-y-2">
                            <textarea
                              v-model="toolEditContent[toolId]"
                              class="min-h-[80px] w-full font-mono text-sm border border-border rounded p-2 bg-background text-foreground resize-y"
                            />
                            <div class="flex items-center gap-2">
                              <button class="h-7 px-2 flex items-center gap-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90" @click="saveTool(toolId, tool.name)">
                                <Save class="h-3 w-3" />Save
                              </button>
                              <button class="h-7 px-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted" @click="cancelEditTool(toolId)">
                                <X class="h-3 w-3" />Cancel
                              </button>
                            </div>
                          </div>
                          <p v-else class="text-sm text-foreground/80 break-words" style="overflow-wrap: anywhere">
                            {{ promptStore.getEffectiveToolDescription(toolId, tool.description) }}
                          </p>
                        </div>

                        <!-- Parameters -->
                        <div v-if="Object.keys(tool.parameters || {}).length > 0">
                          <span class="text-xs font-medium text-muted-foreground">Parameters</span>
                          <div class="mt-1 space-y-2">
                            <div
                              v-for="[paramName, param] in Object.entries(tool.parameters || {})"
                              :key="paramName"
                              class="flex flex-wrap items-start gap-1.5 text-xs"
                            >
                              <code
                                :class="param.required ? 'px-1.5 py-0.5 bg-primary/10 text-primary rounded font-mono shrink-0' : 'px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono shrink-0'"
                              >{{ paramName }}</code>
                              <span class="text-muted-foreground shrink-0">({{ param.type }})</span>
                              <span v-if="param.required" class="px-1.5 py-0.5 rounded border text-[10px] bg-red-500/10 text-red-600 border-red-500/30 shrink-0">required</span>
                              <span class="text-muted-foreground break-words w-full sm:w-auto sm:flex-1">{{ param.description }}</span>
                            </div>
                          </div>
                        </div>

                        <!-- Edge function / handler -->
                        <div class="flex items-center gap-4 text-xs text-muted-foreground">
                          <span v-if="tool.edge_function">
                            Edge Function: <code class="px-1 py-0.5 bg-muted rounded">{{ tool.edge_function }}</code>
                          </span>
                          <span v-if="tool.frontend_handler">
                            Handler: <code class="px-1 py-0.5 bg-muted rounded">frontend</code>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- Reset All Confirmation Dialog -->
    <div v-if="resetDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="resetDialogOpen = false" />
      <div class="relative bg-card border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-2">Reset All Customizations?</h3>
        <p class="text-sm text-muted-foreground mb-6">
          This will reset all customizations, custom sections, and order changes back to defaults.
          This action cannot be undone.
        </p>
        <div class="flex justify-end gap-3">
          <button class="px-4 py-2 text-sm border border-border rounded hover:bg-muted" @click="resetDialogOpen = false">Cancel</button>
          <button class="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded hover:bg-destructive/90" @click="handleResetAll">Reset All</button>
        </div>
      </div>
    </div>

    <!-- Add Section Dialog -->
    <div v-if="addSectionDialogOpen" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="addSectionDialogOpen = false" />
      <div class="relative bg-card border border-border rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
        <h3 class="text-lg font-semibold mb-1">Add Custom Section</h3>
        <p class="text-sm text-muted-foreground mb-4">
          Create a new custom instruction section. Custom sections are fully editable and can be reordered.
        </p>
        <div class="space-y-4">
          <div class="space-y-1">
            <label class="text-sm font-medium">Title *</label>
            <input
              v-model="newSectionTitle"
              class="h-9 w-full border border-border rounded px-3 text-sm bg-background text-foreground"
              placeholder="e.g., Custom Guidelines"
            />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium">Description (optional)</label>
            <input
              v-model="newSectionDescription"
              class="h-9 w-full border border-border rounded px-3 text-sm bg-background text-foreground"
              placeholder="Brief description of this section's purpose"
            />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium">Content</label>
            <textarea
              v-model="newSectionContent"
              class="min-h-[120px] w-full border border-border rounded p-2 text-sm font-mono bg-background text-foreground resize-y"
              placeholder="Enter your custom instructions here..."
            />
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="px-4 py-2 text-sm border border-border rounded hover:bg-muted" @click="addSectionDialogOpen = false">Cancel</button>
          <button
            class="px-4 py-2 flex items-center gap-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            :disabled="!newSectionTitle.trim()"
            @click="handleAddSection"
          >
            <Plus class="h-4 w-4" />Add Section
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Section Confirmation Dialog -->
    <div v-if="deleteConfirmId" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50" @click="deleteConfirmId = null" />
      <div class="relative bg-card border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-2">Delete Custom Section?</h3>
        <p class="text-sm text-muted-foreground mb-6">
          This will permanently delete this custom section. This action cannot be undone.
        </p>
        <div class="flex justify-end gap-3">
          <button class="px-4 py-2 text-sm border border-border rounded hover:bg-muted" @click="deleteConfirmId = null">Cancel</button>
          <button class="px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded hover:bg-destructive/90" @click="handleDeleteSection(deleteConfirmId!)">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>
