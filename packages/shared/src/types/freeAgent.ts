// Free Agent Types - Autonomous agent execution types

export type BlackboardCategory =
  | 'observation'
  | 'insight'
  | 'question'
  | 'decision'
  | 'plan'
  | 'artifact'
  | 'error'
  | 'user_interjection';

export type FreeAgentStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'waiting'
  | 'needs_assistance'
  | 'completed'
  | 'error';

export type ToolStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'error';

export type ArtifactType =
  | 'text'
  | 'file'
  | 'image'
  | 'data'
  | 'audio';

export interface ToolResultAttribute {
  id: string;
  name: string;
  tool: string;
  params: Record<string, unknown>;
  result: unknown;
  resultString: string;
  size: number;
  createdAt: string;
  iteration: number;
  isBinary?: boolean;
  mimeType?: string;
}

export type AssistanceInputType =
  | 'text'
  | 'file'
  | 'choice';

export interface BlackboardEntry {
  id: string;
  timestamp: string;
  category: BlackboardCategory;
  content: string;
  data?: Record<string, unknown>;
  iteration: number;
  tools?: string[];
}

export interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  status: ToolStatus;
  result?: unknown;
  error?: string;
  startTime: string;
  endTime?: string;
  iteration: number;
}

export interface FreeAgentArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  description?: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
  iteration: number;
}

export interface SessionFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content?: string;
  uploadedAt: string;
}

export interface AssistanceRequest {
  id: string;
  question: string;
  context?: string;
  inputType: AssistanceInputType;
  choices?: string[];
  response?: string;
  fileId?: string;
  selectedChoice?: string;
  requestedAt: string;
  respondedAt?: string;
}

export interface FreeAgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  artifacts?: FreeAgentArtifact[];
  iteration?: number;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface RawIterationData {
  iteration: number;
  timestamp: string;
  input: {
    systemPrompt: string;
    userPrompt?: string;
    fullPromptSent?: string;
    model: string;
    scratchpadLength: number;
    blackboardEntries: number;
    previousResultsCount: number;
  };
  output: {
    rawLLMResponse: string;
    parsedResponse: unknown;
    parseError?: {
      rawResponse: string;
      responseLength: number;
      preview: string;
      ending: string;
    } | null;
    errorMessage?: string;
  };
  toolResults: ToolResult[];
  toolCalls?: Array<{
    tool: string;
    params: Record<string, unknown>;
  }>;
}

export interface FinalReport {
  summary: string;
  toolsUsed: string[];
  artifactsCreated: Array<{
    title: string;
    description: string;
    artifactId: string;
  }>;
  keyFindings: string[];
  recommendations?: string[];
  totalIterations: number;
  totalTime: number;
}

export interface AdvancedFeatures {
  selfAuthorEnabled: boolean;
  spawnEnabled: boolean;
  maxChildren: number;
  childMaxIterations: number;
}

export interface PromptModification {
  type: "override_section" | "disable_section" | "enable_section" | "add_attribute" | "set_task";
  sectionId?: string;
  content?: string;
  attributeName?: string;
  attributeValue?: unknown;
}

export interface ChildSpec {
  name: string;
  task: string;
  maxIterations?: number;
  sectionOverrides?: Record<string, string>;
  attributes?: Record<string, unknown>;
}

export interface ChildSession {
  id: string;
  name: string;
  task: string;
  status: FreeAgentStatus;
  promptModifications: PromptModification[];
  maxIterations: number;
  currentIteration: number;
  startTime: string;
  endTime?: string;
  blackboard: BlackboardEntry[];
  scratchpad: string;
  toolCalls: ToolCall[];
  artifacts: FreeAgentArtifact[];
  toolResultAttributes: Record<string, ToolResultAttribute>;
  error?: string;
  rawData?: RawIterationData[];
}

export interface OrchestrationState {
  role: "orchestrator" | "child";
  parentId?: string;
  childName?: string;
  children?: ChildSession[];
  awaitingChildren?: boolean;
  completionThreshold?: number;
}

export interface FreeAgentSession {
  id: string;
  status: FreeAgentStatus;
  prompt: string;
  model: string;
  maxIterations: number;
  currentIteration: number;
  blackboard: BlackboardEntry[];
  scratchpad: string;
  toolCalls: ToolCall[];
  artifacts: FreeAgentArtifact[];
  messages: FreeAgentMessage[];
  toolResultAttributes: Record<string, ToolResultAttribute>;
  sessionFiles: SessionFile[];
  assistanceRequest?: AssistanceRequest;
  finalReport?: FinalReport;
  startTime: string;
  endTime?: string;
  lastActivityTime: string;
  error?: string;
  retryCount?: number;
  lastErrorIteration?: number;
  rawData: RawIterationData[];
  secretOverrides?: Record<string, { params?: Record<string, unknown>; headers?: Record<string, string> }>;
  configuredParams?: Array<{ tool: string; param: string }>;
  promptData?: {
    sections: Array<{
      id: string;
      type: string;
      title: string;
      content: string;
      order: number;
      editable: string;
      variables?: string[];
    }>;
    toolOverrides: Record<string, { description?: string }>;
    disabledTools: string[];
    toolDefinitions?: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      parameters: Record<string, { type: string; required?: boolean; description?: string }>;
    }>;
  };
  toolInstances?: Array<{
    id: string;
    baseToolId: string;
    instanceName: string;
    fullToolId: string;
    label: string;
    description: string;
  }>;
  advancedFeatures?: AdvancedFeatures;
  orchestration?: OrchestrationState;
}

export interface ToolDefinition {
  name: string;
  description: string;
  edge_function?: string;
  frontend_handler?: boolean;
  icon: string;
  category: string;
  parameters: Record<string, ToolParameter>;
  returns: {
    type: string;
    properties?: string[] | Record<string, unknown>;
    items?: Record<string, unknown>;
  };
}

export interface ToolParameter {
  type: string;
  required?: boolean;
  default?: unknown;
  description: string;
  enum?: string[];
  items?: string | Record<string, unknown>;
  sensitive?: boolean;
}

export interface ToolsManifest {
  version: string;
  description: string;
  tools: Record<string, ToolDefinition>;
  categories: Record<string, {
    name: string;
    description: string;
    color: string;
  }>;
}

export interface AgentResponse {
  reasoning: string;
  tool_calls: Array<{
    tool: string;
    params: Record<string, unknown>;
  }>;
  blackboard_entry: {
    category: BlackboardCategory;
    content: string;
    data?: Record<string, unknown>;
  };
  status: 'in_progress' | 'completed' | 'needs_assistance' | 'error';
  message_to_user?: string;
  artifacts?: Array<{
    type: ArtifactType;
    title: string;
    content: string;
    description?: string;
  }>;
  final_report?: {
    summary: string;
    tools_used: string[];
    artifacts_created: Array<{
      title: string;
      description: string;
    }>;
    key_findings: string[];
    recommendations?: string[];
  };
}

export interface FreeAgentNodeData {
  type: 'agent' | 'tool' | 'artifact' | 'file' | 'scratchpad' | 'prompt' | 'promptFile' | 'attribute' | 'childAgent' | 'categoryLabel';
  label: string;
  status?: 'idle' | 'thinking' | 'active' | 'success' | 'error' | 'reading' | 'paused' | 'waiting';
  icon?: string;
  category?: string;
  categoryColor?: string;
  toolId?: string;
  color?: string;
  toolCount?: number;
  artifactId?: string;
  fileId?: string;
  iteration?: number;
  reasoning?: string;
  artifactType?: ArtifactType;
  mimeType?: string;
  content?: string;
  filename?: string;
  size?: number;
  isWriting?: boolean;
  isWaiting?: boolean;
  onContentChange?: (content: string) => void;
  attributeName?: string;
  attributeTool?: string;
  attributeValue?: string;
  isBinary?: boolean;
  retryCount?: number;
  onRetry?: () => void;
  childName?: string;
  task?: string;
  maxIterations?: number;
  currentIteration?: number;
  isInstance?: boolean;
  instanceLabel?: string;
}

export interface FreeAgentEdgeData {
  animated: boolean;
  sourceStatus: string;
  targetStatus: string;
}
