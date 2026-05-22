// LucideIcon removed — use string icon names in the Vue app (lucide-vue-next dynamic rendering)

export type FunctionCategory =
  | "string"
  | "logic"
  | "conditional"
  | "memory"
  | "export"
  | "url"
  | "data";

export interface FunctionConfigSchema {
  [key: string]: {
    type: "string" | "number" | "boolean" | "json";
    label: string;
    description?: string;
    required?: boolean;
    default?: unknown;
    placeholder?: string;
  };
}

export interface FunctionDefinition {
  id: string;
  name: string;
  description: string;
  category: FunctionCategory;
  iconName: string; // lucide icon name string (e.g. "Zap") instead of React component
  color: string;
  inputs: {
    label: string;
    description: string;
  };
  outputs: string[];
  supportsMultipleOutputs?: boolean;
  supportsMultipleInputs?: boolean;
  configSchema?: FunctionConfigSchema;
}

export interface FunctionExecutionResult {
  success: boolean;
  outputs: Record<string, string>;
  error?: string;
  imageOutput?: string;
  audioOutput?: string;
}

export interface MemoryEntry {
  timestamp: number;
  input: string;
  output: string;
  runId: string;
}
