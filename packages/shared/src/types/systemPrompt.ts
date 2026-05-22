export type PromptSectionType =
  | 'identity'
  | 'task'
  | 'tools'
  | 'memory'
  | 'workflow'
  | 'anti_loop'
  | 'response_format'
  | 'data_handling'
  | 'execution'
  | 'dynamic'
  | 'custom';

export type EditableStatus = 'readonly' | 'editable' | 'dynamic' | 'substitutable';

export interface PromptSection {
  id: string;
  title: string;
  type: PromptSectionType;
  content: string;
  editable: EditableStatus;
  description?: string;
  order: number;
  conditions?: PromptCondition[];
  variables?: string[];
}

export interface PromptCondition {
  variable: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'exists';
  value?: string;
  thenContent?: string;
  elseContent?: string;
}

export interface ResponseSchemaField {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
  properties?: ResponseSchemaField[];
}

export interface ResponseSchema {
  provider: 'gemini' | 'claude' | 'grok';
  name: string;
  description: string;
  fields: ResponseSchemaField[];
  rawSchema: string;
}

export interface ToolDefinitionTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  params: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  edgeFunctionMapping?: string;
  frontendHandled?: boolean;
}

export interface SystemPromptTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  sections: PromptSection[];
  responseSchemas: ResponseSchema[];
  tools: ToolDefinitionTemplate[];
  metadata: {
    author?: string;
    tags?: string[];
    notes?: string;
    toolOverrides?: Record<string, { description?: string }>;
  };
}

export interface PromptVariables {
  TOOLS_LIST: string;
  BLACKBOARD_CONTENT: string;
  SCRATCHPAD_CONTENT: string;
  SESSION_FILES: string;
  PREVIOUS_RESULTS: string;
  CURRENT_ITERATION: number;
  ASSISTANCE_RESPONSE?: string;
  USER_PROMPT: string;
}

export interface ExportedPromptTemplate {
  formatVersion: '1.0';
  exportedAt: string;
  template: SystemPromptTemplate;
  customizations?: {
    customName?: string;
    disabledSections: string[];
    disabledTools: string[];
  };
}

export interface ToolOverride {
  description?: string;
  disabled?: boolean;
}

export interface PromptCustomization {
  templateId: string;
  customName?: string;
  sectionOverrides: Record<string, string>;
  disabledSections: string[];
  additionalSections: PromptSection[];
  orderOverrides?: Record<string, number>;
  toolOverrides?: Record<string, ToolOverride>;
}

export interface ToolParameter {
  type: string;
  required: boolean;
  description: string;
  default?: string | number | boolean;
  enum?: string[];
  items?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  icon: string;
  category: string | string[];
  parameters: Record<string, ToolParameter>;
  returns: {
    type: string;
    properties?: string[] | Record<string, unknown>;
    items?: Record<string, unknown>;
    description?: string;
  };
  edge_function?: string;
  frontend_handler?: boolean;
}

export interface ToolCategory {
  name: string;
  description: string;
  color: string;
}

export interface ToolsManifest {
  version: string;
  description: string;
  tools: Record<string, ToolDefinition>;
  categories: Record<string, ToolCategory>;
}
