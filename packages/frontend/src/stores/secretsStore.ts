import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type {
  Secret,
  ToolParameterMapping,
  ToolHeaderMapping,
  CustomHeader,
  SecretsConfig,
  SecretsConfigExport,
  SecretOverrides,
} from '@agent-builder/shared';

const STORAGE_KEY = 'free_agent_secrets';

function loadFromStorage(): SecretsConfig {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return { version: '1.0', secrets: [], mappings: [], headerMappings: [] };
}

function saveToStorage(config: SecretsConfig): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

export const useSecretsStore = defineStore('secrets', () => {
  const config = ref<SecretsConfig>(loadFromStorage());

  watch(config, (val) => saveToStorage(val), { deep: true });

  // === Secret CRUD ===

  function addSecret(name: string, key: string, value: string, type: 'static' | 'oauth' = 'static'): Secret {
    const newSecret: Secret = {
      id: crypto.randomUUID(),
      name,
      key,
      value,
      type,
      createdAt: new Date().toISOString(),
    };
    config.value = { ...config.value, secrets: [...config.value.secrets, newSecret] };
    return newSecret;
  }

  function updateSecret(id: string, updates: Partial<Omit<Secret, 'id' | 'createdAt'>>) {
    config.value = {
      ...config.value,
      secrets: config.value.secrets.map(s => s.id === id ? { ...s, ...updates } : s),
    };
  }

  function deleteSecret(id: string) {
    const secret = config.value.secrets.find(s => s.id === id);
    if (!secret) return;
    config.value = {
      ...config.value,
      secrets: config.value.secrets.filter(s => s.id !== id),
      mappings: config.value.mappings.filter(m => m.secretKey !== secret.key),
      headerMappings: config.value.headerMappings
        .map(hm => ({ ...hm, headers: hm.headers.filter(h => h.secretKey !== secret.key) }))
        .filter(hm => hm.headers.length > 0),
    };
  }

  function getSecretByKey(key: string): Secret | undefined {
    return config.value.secrets.find(s => s.key === key);
  }

  function getSecretValue(key: string): string | undefined {
    return config.value.secrets.find(s => s.key === key)?.value;
  }

  // === Parameter Mapping CRUD ===

  function addMapping(toolId: string, parameterPath: string, secretKey: string, mergeMode: 'replace' | 'merge' = 'replace'): ToolParameterMapping {
    const existing = config.value.mappings.find(m => m.toolId === toolId && m.parameterPath === parameterPath);
    if (existing) {
      config.value = {
        ...config.value,
        mappings: config.value.mappings.map(m => m.id === existing.id ? { ...m, secretKey, mergeMode } : m),
      };
      return { ...existing, secretKey, mergeMode };
    }
    const newMapping: ToolParameterMapping = {
      id: crypto.randomUUID(),
      toolId,
      parameterPath,
      secretKey,
      mergeMode,
    };
    config.value = { ...config.value, mappings: [...config.value.mappings, newMapping] };
    return newMapping;
  }

  function deleteMapping(id: string) {
    config.value = { ...config.value, mappings: config.value.mappings.filter(m => m.id !== id) };
  }

  function getMappingsForTool(toolId: string): ToolParameterMapping[] {
    return config.value.mappings.filter(m => m.toolId === toolId);
  }

  // === Header Mapping CRUD ===

  function addHeaderMapping(toolId: string, headerName: string, secretKey: string) {
    const newHeader: CustomHeader = { id: crypto.randomUUID(), name: headerName, secretKey };
    const existing = config.value.headerMappings.find(hm => hm.toolId === toolId);

    if (existing) {
      const headerExists = existing.headers.some(h => h.name === headerName);
      config.value = {
        ...config.value,
        headerMappings: config.value.headerMappings.map(hm => {
          if (hm.toolId !== toolId) return hm;
          return {
            ...hm,
            headers: headerExists
              ? hm.headers.map(h => h.name === headerName ? { ...h, secretKey } : h)
              : [...hm.headers, newHeader],
          };
        }),
      };
    } else {
      const newToolMapping: ToolHeaderMapping = { id: crypto.randomUUID(), toolId, headers: [newHeader] };
      config.value = { ...config.value, headerMappings: [...config.value.headerMappings, newToolMapping] };
    }
  }

  function deleteHeaderMapping(toolId: string, headerId: string) {
    config.value = {
      ...config.value,
      headerMappings: config.value.headerMappings
        .map(hm => hm.toolId === toolId ? { ...hm, headers: hm.headers.filter(h => h.id !== headerId) } : hm)
        .filter(hm => hm.headers.length > 0),
    };
  }

  function getHeadersForTool(toolId: string): CustomHeader[] {
    return config.value.headerMappings.find(hm => hm.toolId === toolId)?.headers || [];
  }

  // === Computed Overrides ===

  function getSecretOverrides(): SecretOverrides {
    const overrides: SecretOverrides = {};

    for (const mapping of config.value.mappings) {
      const secretValue = getSecretValue(mapping.secretKey);
      if (!secretValue) continue;
      if (!overrides[mapping.toolId]) overrides[mapping.toolId] = { params: {}, headers: {} };

      const pathParts = mapping.parameterPath.split('.');
      if (pathParts.length === 1) {
        overrides[mapping.toolId].params![pathParts[0]] = secretValue;
      } else {
        let current: Record<string, unknown> = overrides[mapping.toolId].params!;
        for (let i = 0; i < pathParts.length - 1; i++) {
          if (!current[pathParts[i]]) current[pathParts[i]] = {};
          current = current[pathParts[i]] as Record<string, unknown>;
        }
        current[pathParts[pathParts.length - 1]] = secretValue;
      }
    }

    for (const headerMapping of config.value.headerMappings) {
      if (!overrides[headerMapping.toolId]) overrides[headerMapping.toolId] = { params: {}, headers: {} };
      for (const header of headerMapping.headers) {
        const secretValue = getSecretValue(header.secretKey);
        if (secretValue) overrides[headerMapping.toolId].headers![header.name] = secretValue;
      }
    }

    return overrides;
  }

  function getConfiguredToolParams(): Array<{ tool: string; param: string }> {
    const result: Array<{ tool: string; param: string }> = [];
    for (const mapping of config.value.mappings) {
      result.push({ tool: mapping.toolId, param: mapping.parameterPath });
    }
    for (const hm of config.value.headerMappings) {
      for (const header of hm.headers) {
        result.push({ tool: hm.toolId, param: `headers.${header.name}` });
      }
    }
    return result;
  }

  // === Import/Export ===

  function exportConfig(includeValues = false): SecretsConfigExport {
    return {
      version: config.value.version,
      exportedAt: new Date().toISOString(),
      secrets: config.value.secrets.map(s => ({
        key: s.key,
        name: s.name,
        type: s.type,
        ...(includeValues ? { value: s.value } : {}),
      })),
      mappings: config.value.mappings,
      headerMappings: config.value.headerMappings,
    };
  }

  function importConfig(exported: SecretsConfigExport, secretValues: Record<string, string>) {
    const newSecrets: Secret[] = exported.secrets.map(s => ({
      id: crypto.randomUUID(),
      name: s.name,
      key: s.key,
      value: secretValues[s.key] || '',
      type: s.type,
      createdAt: new Date().toISOString(),
    }));
    config.value = {
      version: exported.version,
      secrets: newSecrets,
      mappings: exported.mappings.map(m => ({ ...m, id: crypto.randomUUID() })),
      headerMappings: exported.headerMappings.map(hm => ({
        ...hm,
        id: crypto.randomUUID(),
        headers: hm.headers.map(h => ({ ...h, id: crypto.randomUUID() })),
      })),
    };
  }

  function parseEnvFile(envContent: string): Array<{ key: string; value: string }> {
    return envContent.split('\n').reduce<Array<{ key: string; value: string }>>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return acc;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) return acc;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) acc.push({ key, value });
      return acc;
    }, []);
  }

  function importFromEnv(envContent: string) {
    for (const { key, value } of parseEnvFile(envContent)) {
      const existing = config.value.secrets.find(s => s.key === key);
      if (existing) updateSecret(existing.id, { value });
      else addSecret(key, key, value);
    }
  }

  function clearAll() {
    config.value = { version: '1.0', secrets: [], mappings: [], headerMappings: [] };
  }

  return {
    secrets: config.value.secrets,
    mappings: config.value.mappings,
    headerMappings: config.value.headerMappings,
    config,
    addSecret,
    updateSecret,
    deleteSecret,
    getSecretByKey,
    getSecretValue,
    addMapping,
    deleteMapping,
    getMappingsForTool,
    addHeaderMapping,
    deleteHeaderMapping,
    getHeadersForTool,
    getSecretOverrides,
    getConfiguredToolParams,
    exportConfig,
    importConfig,
    parseEnvFile,
    importFromEnv,
    clearAll,
  };
});

export type SecretsManager = ReturnType<typeof useSecretsStore>;
