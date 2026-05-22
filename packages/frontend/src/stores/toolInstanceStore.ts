import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ToolInstance, ToolInstanceConfig } from '@agent-builder/shared';

const STORAGE_KEY = 'free_agent_tool_instances';
const CONFIG_VERSION = '1.0';

function loadFromStorage(): ToolInstanceConfig {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version === CONFIG_VERSION) return parsed;
    }
  } catch {
    // ignore
  }
  return { version: CONFIG_VERSION, instances: [] };
}

function saveToStorage(config: ToolInstanceConfig): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export const useToolInstanceStore = defineStore('toolInstances', () => {
  const config = ref<ToolInstanceConfig>(loadFromStorage());

  function saveConfig(newConfig: ToolInstanceConfig) {
    config.value = newConfig;
    saveToStorage(newConfig);
  }

  function addInstance(baseToolId: string, instanceName: string, label: string, description: string): ToolInstance | null {
    const sanitizedName = instanceName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!sanitizedName) return null;

    const fullToolId = `${baseToolId}:${sanitizedName}`;
    if (config.value.instances.some(i => i.fullToolId === fullToolId)) {
      console.error(`Instance ${fullToolId} already exists`);
      return null;
    }

    const newInstance: ToolInstance = {
      id: crypto.randomUUID(),
      baseToolId,
      instanceName: sanitizedName,
      fullToolId,
      label,
      description,
      createdAt: new Date().toISOString(),
    };
    saveConfig({ ...config.value, instances: [...config.value.instances, newInstance] });
    return newInstance;
  }

  function updateInstance(id: string, updates: Partial<Pick<ToolInstance, 'label' | 'description' | 'instanceName'>>) {
    saveConfig({
      ...config.value,
      instances: config.value.instances.map(instance => {
        if (instance.id !== id) return instance;
        const updated = { ...instance, ...updates };
        if (updates.instanceName) {
          const sanitizedName = updates.instanceName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          updated.instanceName = sanitizedName;
          updated.fullToolId = `${instance.baseToolId}:${sanitizedName}`;
        }
        return updated;
      }),
    });
  }

  function deleteInstance(id: string) {
    saveConfig({ ...config.value, instances: config.value.instances.filter(i => i.id !== id) });
  }

  function getInstancesForTool(baseToolId: string): ToolInstance[] {
    return config.value.instances.filter(i => i.baseToolId === baseToolId);
  }

  function getInstanceByFullId(fullToolId: string): ToolInstance | undefined {
    return config.value.instances.find(i => i.fullToolId === fullToolId);
  }

  function hasInstances(baseToolId: string): boolean {
    return config.value.instances.some(i => i.baseToolId === baseToolId);
  }

  function parseToolId(toolId: string): { baseToolId: string; instanceName: string | null } {
    if (toolId.includes(':')) {
      const [baseToolId, instanceName] = toolId.split(':');
      return { baseToolId, instanceName };
    }
    return { baseToolId: toolId, instanceName: null };
  }

  function exportConfig(): ToolInstanceConfig {
    return { ...config.value };
  }

  function importConfig(newConfig: ToolInstanceConfig) {
    saveConfig(newConfig);
  }

  function clearAll() {
    saveConfig({ version: CONFIG_VERSION, instances: [] });
  }

  return {
    config,
    addInstance,
    updateInstance,
    deleteInstance,
    getInstancesForTool,
    getInstanceByFullId,
    hasInstances,
    parseToolId,
    exportConfig,
    importConfig,
    clearAll,
  };
});

export type ToolInstancesManager = ReturnType<typeof useToolInstanceStore>;
