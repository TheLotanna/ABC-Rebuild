export type SecretType = 'static' | 'oauth';

export interface Secret {
  id: string;
  name: string;
  key: string;
  value: string;
  type: SecretType;
  createdAt: string;
  expiresAt?: string;
}

export interface ToolParameterMapping {
  id: string;
  toolId: string;
  parameterPath: string;
  secretKey: string;
  mergeMode: 'replace' | 'merge';
}

export interface CustomHeader {
  id: string;
  name: string;
  secretKey: string;
}

export interface ToolHeaderMapping {
  id: string;
  toolId: string;
  headers: CustomHeader[];
}

export interface SecretsConfig {
  version: string;
  secrets: Secret[];
  mappings: ToolParameterMapping[];
  headerMappings: ToolHeaderMapping[];
}

export interface SecretsConfigExport {
  version: string;
  exportedAt: string;
  secrets: Array<{
    key: string;
    name: string;
    type: SecretType;
  }>;
  mappings: ToolParameterMapping[];
  headerMappings: ToolHeaderMapping[];
}

export interface SecretOverrides {
  [toolId: string]: {
    params?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
}
