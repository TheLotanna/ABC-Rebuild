export interface ToolInstance {
  id: string;
  baseToolId: string;
  instanceName: string;
  fullToolId: string;
  label: string;
  description: string;
  createdAt: string;
}

export interface ToolInstanceConfig {
  version: string;
  instances: ToolInstance[];
}

export const DEFAULT_TOOL_INSTANCE_CONFIG: ToolInstanceConfig = {
  version: '1.0',
  instances: [],
};
