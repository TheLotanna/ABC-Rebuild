import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type {
  SystemPromptTemplate,
  PromptSection,
  PromptCustomization,
  ExportedPromptTemplate,
  ToolOverride,
} from '@agent-builder/shared';

const STORAGE_KEY = 'freeagent-prompt-customizations';

const VALID_TEMPLATE_SECTION_IDS = new Set([
  'identity', 'user_task', 'tools_list',
  'memory_system', 'workflow', 'loop_prevention',
  'tool_execution_timing', 'data_handling', 'reference_resolution', 'response_format',
  'session_files', 'configured_secrets', 'blackboard', 'scratchpad',
  'previous_results', 'artifacts_list',
  'self_author', 'spawn_capabilities',
  // Legacy IDs for backward compatibility
  'memory_architecture', 'memory_persistence', 'accessing_attributes',
  'correct_workflow', 'workflow_summary',
  'loop_problem', 'anti_loop_rules', 'loop_self_reflection',
  'blackboard_mandatory', 'iteration_info',
]);

function cleanupInvalidOverrides(customization: PromptCustomization): PromptCustomization {
  const customSectionIds = new Set(customization.additionalSections?.map(s => s.id) || []);
  const cleanedOverrides: Record<string, string> = {};
  for (const [sectionId, content] of Object.entries(customization.sectionOverrides || {})) {
    if (VALID_TEMPLATE_SECTION_IDS.has(sectionId) || customSectionIds.has(sectionId)) {
      cleanedOverrides[sectionId] = content;
    }
  }
  return { ...customization, sectionOverrides: cleanedOverrides };
}

function loadForTemplate(templateId: string): PromptCustomization | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, PromptCustomization>;
      const c = parsed[templateId];
      return c ? cleanupInvalidOverrides(c) : null;
    }
  } catch {
    // ignore
  }
  return null;
}

export const usePromptStore = defineStore('prompt', () => {
  const templateId = ref<string>('');
  const customizations = ref<PromptCustomization | null>(null);

  function setTemplateId(id: string) {
    if (id === templateId.value) return;
    templateId.value = id;
    customizations.value = loadForTemplate(id);
  }

  // Auto-save whenever customizations change
  watch(customizations, (val) => {
    if (!templateId.value) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const all = stored ? JSON.parse(stored) : {};
      const hasContent = val && (
        Object.keys(val.sectionOverrides).length > 0 ||
        val.additionalSections.length > 0 ||
        Object.keys(val.orderOverrides || {}).length > 0 ||
        Object.keys(val.toolOverrides || {}).length > 0 ||
        (val.disabledSections?.length || 0) > 0 ||
        !!val.customName
      );
      if (hasContent) {
        all[templateId.value] = val;
      } else {
        delete all[templateId.value];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      // ignore
    }
  }, { deep: true });

  function loadFromStorage() {
    customizations.value = loadForTemplate(templateId.value);
  }

  const customizedSectionIds = computed(() =>
    new Set(customizations.value ? Object.keys(customizations.value.sectionOverrides) : [])
  );

  const hasCustomizations = computed(() =>
    customizedSectionIds.value.size > 0 ||
    (customizations.value?.additionalSections?.length || 0) > 0 ||
    (customizations.value?.disabledSections?.length || 0) > 0
  );

  const hasOrderChanges = computed(() =>
    Object.keys(customizations.value?.orderOverrides || {}).length > 0
  );

  const hasToolCustomizations = computed(() =>
    Object.keys(customizations.value?.toolOverrides || {}).length > 0
  );

  function isCustomized(sectionId: string): boolean {
    return customizedSectionIds.value.has(sectionId);
  }

  function getEffectiveContent(section: PromptSection): string {
    return customizations.value?.sectionOverrides[section.id] ?? section.content;
  }

  function updateSection(sectionId: string, content: string) {
    const current = customizations.value || {
      templateId: templateId.value,
      sectionOverrides: {},
      disabledSections: [],
      additionalSections: [],
      orderOverrides: {},
    };
    customizations.value = { ...current, sectionOverrides: { ...current.sectionOverrides, [sectionId]: content } };
  }

  function resetSection(sectionId: string) {
    if (!customizations.value) return;
    const { [sectionId]: _, ...rest } = customizations.value.sectionOverrides;
    const hasContent = Object.keys(rest).length > 0 || customizations.value.additionalSections.length > 0 ||
      Object.keys(customizations.value.orderOverrides || {}).length > 0;
    customizations.value = hasContent ? { ...customizations.value, sectionOverrides: rest } : null;
  }

  function resetAll() {
    customizations.value = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const all = JSON.parse(stored);
        delete all[templateId.value];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      }
    } catch {
      // ignore
    }
  }

  // Custom sections

  function addCustomSection(section: Omit<PromptSection, 'id' | 'order'>): string {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const current = customizations.value || {
      templateId: templateId.value, sectionOverrides: {}, disabledSections: [], additionalSections: [], orderOverrides: {},
    };
    const maxOrder = current.additionalSections.reduce((max, s) => Math.max(max, s.order), 999);
    const newSection: PromptSection = { ...section, id, order: maxOrder + 1, type: 'custom', editable: 'editable' };
    customizations.value = { ...current, additionalSections: [...current.additionalSections, newSection] };
    return id;
  }

  function updateCustomSection(sectionId: string, updates: Partial<PromptSection>) {
    if (!customizations.value) return;
    customizations.value = {
      ...customizations.value,
      additionalSections: customizations.value.additionalSections.map(s => s.id === sectionId ? { ...s, ...updates } : s),
    };
  }

  function deleteCustomSection(sectionId: string) {
    if (!customizations.value) return;
    const newAdditional = customizations.value.additionalSections.filter(s => s.id !== sectionId);
    const { [sectionId]: _1, ...restOverrides } = customizations.value.sectionOverrides;
    const { [sectionId]: _2, ...restOrder } = customizations.value.orderOverrides || {};
    const hasContent = Object.keys(restOverrides).length > 0 || newAdditional.length > 0 || Object.keys(restOrder).length > 0;
    customizations.value = hasContent
      ? { ...customizations.value, additionalSections: newAdditional, sectionOverrides: restOverrides, orderOverrides: restOrder }
      : null;
  }

  function getCustomSections(): PromptSection[] {
    return customizations.value?.additionalSections || [];
  }

  // Order management

  function getOrderOverride(sectionId: string): number | undefined {
    return customizations.value?.orderOverrides?.[sectionId];
  }

  function setOrderOverride(sectionId: string, order: number) {
    const current = customizations.value || {
      templateId: templateId.value, sectionOverrides: {}, disabledSections: [], additionalSections: [], orderOverrides: {},
    };
    customizations.value = { ...current, orderOverrides: { ...(current.orderOverrides || {}), [sectionId]: order } };
  }

  function getSortedSections(templateSections: PromptSection[]): PromptSection[] {
    const allSections = [...templateSections, ...(customizations.value?.additionalSections || [])];
    return allSections
      .map(s => ({ ...s, order: customizations.value?.orderOverrides?.[s.id] ?? s.order }))
      .sort((a, b) => a.order - b.order);
  }

  function moveSection(sectionId: string, direction: 'up' | 'down', allSections: PromptSection[]) {
    const sorted = getSortedSections(allSections);
    const currentIndex = sorted.findIndex(s => s.id === sectionId);
    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === sorted.length - 1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const currentSection = sorted[currentIndex];
    const targetSection = sorted[targetIndex];

    const current = customizations.value || {
      templateId: templateId.value, sectionOverrides: {}, disabledSections: [], additionalSections: [], orderOverrides: {},
    };
    const currentOrder = current.orderOverrides?.[currentSection.id] ?? currentSection.order;
    const targetOrder = current.orderOverrides?.[targetSection.id] ?? targetSection.order;
    const newCurrentOrder = currentOrder === targetOrder
      ? (direction === 'up' ? currentOrder - 0.5 : currentOrder + 0.5)
      : targetOrder;
    const newTargetOrder = currentOrder === targetOrder ? currentOrder : currentOrder;

    customizations.value = {
      ...current,
      orderOverrides: {
        ...(current.orderOverrides || {}),
        [currentSection.id]: newCurrentOrder,
        [targetSection.id]: newTargetOrder,
      },
    };
  }

  function resetOrder() {
    if (!customizations.value) return;
    const hasContent = Object.keys(customizations.value.sectionOverrides).length > 0 ||
      customizations.value.additionalSections.length > 0 ||
      Object.keys(customizations.value.toolOverrides || {}).length > 0;
    customizations.value = hasContent ? { ...customizations.value, orderOverrides: {} } : null;
  }

  // Tool overrides

  function getEffectiveToolDescription(toolId: string, originalDescription: string): string {
    return customizations.value?.toolOverrides?.[toolId]?.description ?? originalDescription;
  }

  function isToolCustomized(toolId: string): boolean {
    return !!customizations.value?.toolOverrides?.[toolId]?.description;
  }

  function updateToolDescription(toolId: string, description: string) {
    const current = customizations.value || {
      templateId: templateId.value, sectionOverrides: {}, disabledSections: [], additionalSections: [], orderOverrides: {}, toolOverrides: {},
    };
    customizations.value = {
      ...current,
      toolOverrides: { ...(current.toolOverrides || {}), [toolId]: { description } },
    };
  }

  function resetToolDescription(toolId: string) {
    if (!customizations.value) return;
    const { [toolId]: _, ...restTools } = customizations.value.toolOverrides || {};
    const hasContent = Object.keys(customizations.value.sectionOverrides).length > 0 ||
      customizations.value.additionalSections.length > 0 ||
      Object.keys(customizations.value.orderOverrides || {}).length > 0 ||
      Object.keys(restTools).length > 0;
    customizations.value = hasContent ? { ...customizations.value, toolOverrides: restTools } : null;
  }

  function getToolOverrides(): Record<string, ToolOverride> {
    return customizations.value?.toolOverrides || {};
  }

  // Section disabling

  function isSectionDisabled(sectionId: string): boolean {
    return customizations.value?.disabledSections?.includes(sectionId) || false;
  }

  function toggleSectionDisabled(sectionId: string) {
    const current = customizations.value || {
      templateId: templateId.value, sectionOverrides: {}, disabledSections: [], additionalSections: [], orderOverrides: {}, toolOverrides: {},
    };
    const isDisabled = current.disabledSections?.includes(sectionId) || false;
    const newDisabled = isDisabled
      ? (current.disabledSections || []).filter(id => id !== sectionId)
      : [...(current.disabledSections || []), sectionId];
    customizations.value = { ...current, disabledSections: newDisabled };
  }

  function getDisabledSections(): string[] {
    return customizations.value?.disabledSections || [];
  }

  // Tool disabling

  function isToolDisabled(toolId: string): boolean {
    return customizations.value?.toolOverrides?.[toolId]?.disabled || false;
  }

  function toggleToolDisabled(toolId: string) {
    const current = customizations.value || {
      templateId: templateId.value, sectionOverrides: {}, disabledSections: [], additionalSections: [], orderOverrides: {}, toolOverrides: {},
    };
    const currentOverride = current.toolOverrides?.[toolId] || {};
    customizations.value = {
      ...current,
      toolOverrides: {
        ...(current.toolOverrides || {}),
        [toolId]: { ...currentOverride, disabled: !currentOverride.disabled },
      },
    };
  }

  function getDisabledTools(): string[] {
    if (!customizations.value?.toolOverrides) return [];
    return Object.entries(customizations.value.toolOverrides)
      .filter(([, override]) => override.disabled)
      .map(([toolId]) => toolId);
  }

  // Import/Export

  function exportCustomizations(template: SystemPromptTemplate): ExportedPromptTemplate {
    const allSections = getSortedSections(template.sections);
    const disabledTools = Object.entries(customizations.value?.toolOverrides || {})
      .filter(([, override]) => override.disabled)
      .map(([toolId]) => toolId);

    return {
      formatVersion: '1.0',
      exportedAt: new Date().toISOString(),
      template: {
        ...template,
        name: customizations.value?.customName || template.name,
        isDefault: false,
        updatedAt: new Date().toISOString(),
        sections: allSections.map(s => ({ ...s, content: getEffectiveContent(s) })),
        metadata: { ...template.metadata, notes: `Customized export from ${template.name}`, toolOverrides: customizations.value?.toolOverrides },
      },
      customizations: {
        customName: customizations.value?.customName,
        disabledSections: customizations.value?.disabledSections || [],
        disabledTools,
      },
    };
  }

  function importCustomizations(data: ExportedPromptTemplate, currentTemplate: SystemPromptTemplate): boolean {
    try {
      if (data.formatVersion !== '1.0') return false;
      const importedTemplate = data.template;
      const newOverrides: Record<string, string> = {};
      const newOrderOverrides: Record<string, number> = {};
      const newCustomSections: PromptSection[] = [];

      for (const importedSection of importedTemplate.sections) {
        const currentSection = currentTemplate.sections.find(s => s.id === importedSection.id);
        if (currentSection) {
          if (currentSection.editable === 'editable' && importedSection.content !== currentSection.content) {
            newOverrides[importedSection.id] = importedSection.content;
          }
          if (importedSection.order !== currentSection.order) {
            newOrderOverrides[importedSection.id] = importedSection.order;
          }
        } else if (importedSection.type === 'custom') {
          newCustomSections.push(importedSection);
        }
      }

      const importedToolOverrides = (importedTemplate.metadata as { toolOverrides?: Record<string, ToolOverride> })?.toolOverrides || {};
      const importedDisabledSections = data.customizations?.disabledSections || [];
      const importedDisabledTools = data.customizations?.disabledTools || [];
      const importedCustomName = data.customizations?.customName;

      const mergedToolOverrides = { ...importedToolOverrides };
      for (const toolId of importedDisabledTools) {
        mergedToolOverrides[toolId] = { ...mergedToolOverrides[toolId], disabled: true };
      }

      const hasContent = Object.keys(newOverrides).length > 0 || newCustomSections.length > 0 ||
        Object.keys(newOrderOverrides).length > 0 || Object.keys(mergedToolOverrides).length > 0 ||
        importedDisabledSections.length > 0 || !!importedCustomName;

      if (hasContent) {
        customizations.value = {
          templateId: templateId.value,
          customName: importedCustomName,
          sectionOverrides: newOverrides,
          disabledSections: importedDisabledSections,
          additionalSections: newCustomSections,
          orderOverrides: newOrderOverrides,
          toolOverrides: mergedToolOverrides,
        };
      }
      return true;
    } catch {
      return false;
    }
  }

  function getCustomName(): string | undefined {
    return customizations.value?.customName;
  }

  function setCustomName(name: string) {
    const current = customizations.value || {
      templateId: templateId.value, sectionOverrides: {}, disabledSections: [], additionalSections: [], orderOverrides: {},
    };
    customizations.value = { ...current, customName: name.trim() || undefined };
  }

  return {
    templateId,
    customizations,
    customizedSectionIds,
    hasCustomizations,
    hasOrderChanges,
    hasToolCustomizations,
    setTemplateId,
    loadFromStorage,
    getEffectiveContent,
    isCustomized,
    updateSection,
    resetSection,
    resetAll,
    addCustomSection,
    updateCustomSection,
    deleteCustomSection,
    getCustomSections,
    getOrderOverride,
    setOrderOverride,
    moveSection,
    getSortedSections,
    resetOrder,
    getEffectiveToolDescription,
    isToolCustomized,
    updateToolDescription,
    resetToolDescription,
    getToolOverrides,
    isSectionDisabled,
    toggleSectionDisabled,
    getDisabledSections,
    isToolDisabled,
    toggleToolDisabled,
    getDisabledTools,
    exportCustomizations,
    importCustomizations,
    getCustomName,
    setCustomName,
  };
});
