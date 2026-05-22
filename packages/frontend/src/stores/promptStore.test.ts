import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePromptStore } from './promptStore';
import type { PromptSection, SystemPromptTemplate } from '@agent-builder/shared';

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeSection(overrides: Partial<PromptSection> = {}): PromptSection {
  return {
    id: 'identity',
    title: 'Identity',
    type: 'identity',
    content: 'You are a helpful agent.',
    editable: 'editable',
    order: 1,
    ...overrides,
  };
}

function makeTemplate(): SystemPromptTemplate {
  return {
    id: 'default',
    name: 'Default Template',
    version: '1.0.0',
    description: 'Default agent prompt',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isDefault: true,
    sections: [
      makeSection({ id: 'identity', title: 'Identity', order: 1 }),
      makeSection({ id: 'tools_list', title: 'Tools', order: 2, type: 'tools' }),
      makeSection({ id: 'memory_system', title: 'Memory', order: 3, type: 'memory' }),
    ],
    responseSchemas: [],
    tools: [],
    metadata: {},
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

// ─── Template ID & customization init ────────────────────────────────────────

describe('promptStore — template id lifecycle', () => {
  it('starts empty with no template id set', () => {
    const store = usePromptStore();
    expect(store.templateId).toBe('');
    expect(store.customizations).toBeNull();
    expect(store.hasCustomizations).toBe(false);
  });

  it('setTemplateId loads stored customizations for that id', () => {
    // pre-seed localStorage with customizations for 'default'
    localStorage.setItem('freeagent-prompt-customizations', JSON.stringify({
      default: {
        templateId: 'default',
        sectionOverrides: { identity: 'You are a custom agent.' },
        disabledSections: [],
        additionalSections: [],
        orderOverrides: {},
      },
    }));

    const store = usePromptStore();
    store.setTemplateId('default');
    expect(store.templateId).toBe('default');
    expect(store.isCustomized('identity')).toBe(true);
    expect(store.hasCustomizations).toBe(true);
  });

  it('setTemplateId is idempotent for the same id', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const before = store.customizations;
    store.setTemplateId('default');
    expect(store.customizations).toBe(before);
  });
});

// ─── Section overrides ───────────────────────────────────────────────────────

describe('promptStore — section overrides', () => {
  it('updateSection stores an override', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    store.updateSection('identity', 'Custom identity.');
    expect(store.isCustomized('identity')).toBe(true);
    expect(store.getEffectiveContent(makeSection({ id: 'identity' }))).toBe('Custom identity.');
  });

  it('getEffectiveContent falls back to default content for non-overridden sections', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const section = makeSection({ id: 'tools_list', content: 'default tools text' });
    expect(store.getEffectiveContent(section)).toBe('default tools text');
  });

  it('resetSection removes a single override', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    store.updateSection('identity', 'custom');
    store.updateSection('tools_list', 'custom tools');
    expect(store.isCustomized('identity')).toBe(true);

    store.resetSection('identity');
    expect(store.isCustomized('identity')).toBe(false);
    expect(store.isCustomized('tools_list')).toBe(true);
  });

  it('resetAll clears every override and persisted entry', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    store.updateSection('identity', 'custom');
    expect(store.hasCustomizations).toBe(true);

    store.resetAll();
    expect(store.hasCustomizations).toBe(false);
    expect(store.customizations).toBeNull();
  });
});

// ─── Custom sections ─────────────────────────────────────────────────────────

describe('promptStore — custom sections', () => {
  it('addCustomSection returns an id and appends a section', () => {
    const store = usePromptStore();
    store.setTemplateId('default');

    const id = store.addCustomSection({
      title: 'My Notes',
      content: 'Some extra instructions.',
      type: 'custom',
      editable: 'editable',
    });

    expect(id).toMatch(/^custom_/);
    expect(store.getCustomSections()).toHaveLength(1);
    expect(store.getCustomSections()[0].title).toBe('My Notes');
  });

  it('updateCustomSection mutates fields by id', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const id = store.addCustomSection({
      title: 'Original', content: 'x', type: 'custom', editable: 'editable',
    });
    store.updateCustomSection(id, { title: 'Updated' });
    expect(store.getCustomSections()[0].title).toBe('Updated');
  });

  it('deleteCustomSection removes the section', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const id = store.addCustomSection({
      title: 'tmp', content: 'x', type: 'custom', editable: 'editable',
    });
    expect(store.getCustomSections()).toHaveLength(1);
    store.deleteCustomSection(id);
    expect(store.getCustomSections()).toHaveLength(0);
  });
});

// ─── Section ordering ────────────────────────────────────────────────────────

describe('promptStore — section ordering', () => {
  it('getSortedSections returns template sections in order with no overrides', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const template = makeTemplate();
    const sorted = store.getSortedSections(template.sections);
    expect(sorted.map((s) => s.id)).toEqual(['identity', 'tools_list', 'memory_system']);
  });

  it('moveSection up swaps with previous', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const template = makeTemplate();

    store.moveSection('memory_system', 'up', template.sections);
    const sorted = store.getSortedSections(template.sections);
    expect(sorted.map((s) => s.id)).toEqual(['identity', 'memory_system', 'tools_list']);
    expect(store.hasOrderChanges).toBe(true);
  });

  it('moveSection down swaps with next', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const template = makeTemplate();

    store.moveSection('identity', 'down', template.sections);
    const sorted = store.getSortedSections(template.sections);
    expect(sorted.map((s) => s.id)).toEqual(['tools_list', 'identity', 'memory_system']);
  });

  it('moveSection at the boundary is a no-op', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const template = makeTemplate();

    store.moveSection('identity', 'up', template.sections);
    expect(store.hasOrderChanges).toBe(false);

    store.moveSection('memory_system', 'down', template.sections);
    expect(store.hasOrderChanges).toBe(false);
  });

  it('resetOrder clears ordering overrides', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    const template = makeTemplate();
    store.moveSection('identity', 'down', template.sections);
    expect(store.hasOrderChanges).toBe(true);
    store.resetOrder();
    expect(store.hasOrderChanges).toBe(false);
  });
});

// ─── Disabling ───────────────────────────────────────────────────────────────

describe('promptStore — section + tool disabling', () => {
  it('toggleSectionDisabled flips state', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    expect(store.isSectionDisabled('identity')).toBe(false);
    store.toggleSectionDisabled('identity');
    expect(store.isSectionDisabled('identity')).toBe(true);
    store.toggleSectionDisabled('identity');
    expect(store.isSectionDisabled('identity')).toBe(false);
  });

  it('toggleToolDisabled flips state', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    expect(store.isToolDisabled('brave_search')).toBe(false);
    store.toggleToolDisabled('brave_search');
    expect(store.isToolDisabled('brave_search')).toBe(true);
  });
});

// ─── Tool description overrides ──────────────────────────────────────────────

describe('promptStore — tool description overrides', () => {
  it('updateToolDescription stores override', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    store.updateToolDescription('brave_search', 'Search the web (customized).');
    expect(store.isToolCustomized('brave_search')).toBe(true);
    expect(store.getEffectiveToolDescription('brave_search', 'default')).toBe('Search the web (customized).');
  });

  it('getEffectiveToolDescription falls back when no override', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    expect(store.getEffectiveToolDescription('brave_search', 'default desc')).toBe('default desc');
  });

  it('resetToolDescription removes override', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    store.updateToolDescription('brave_search', 'custom');
    store.resetToolDescription('brave_search');
    expect(store.isToolCustomized('brave_search')).toBe(false);
  });
});

// ─── Custom name ─────────────────────────────────────────────────────────────

describe('promptStore — custom template name', () => {
  it('getCustomName returns undefined when unset', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    expect(store.getCustomName()).toBeUndefined();
  });

  it('setCustomName persists the trimmed name', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    store.setCustomName('  My Template  ');
    expect(store.getCustomName()).toBe('My Template');
  });

  it('setCustomName with empty string clears the name', () => {
    const store = usePromptStore();
    store.setTemplateId('default');
    store.setCustomName('Real Name');
    expect(store.getCustomName()).toBe('Real Name');
    store.setCustomName('');
    expect(store.getCustomName()).toBeUndefined();
  });
});
