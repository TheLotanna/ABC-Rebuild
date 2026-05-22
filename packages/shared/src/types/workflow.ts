// Core node types in the workflow
export type NodeType = "agent" | "function" | "tool";

export interface BaseNode {
  id: string;
  name: string;
  nodeType: NodeType;
  status: "idle" | "running" | "complete" | "error";
  output?: string;
  minimized?: boolean;
  locked?: boolean;
  executeOnNullInput?: boolean;
  position?: { x: number; y: number };
}

export interface BeastModeConfig {
  enabled: boolean;
  outputMode: "concatenate" | "split";
}

export interface AgentNode extends BaseNode {
  nodeType: "agent";
  type: string;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolInstance[];
  useSpecificModel?: boolean;
  model?: "gemini-2.5-flash" | "gemini-2.5-flash-lite" | "gemini-3-pro-preview" | "gemini-3-flash-preview" | "claude-sonnet-4-5" | "claude-haiku-4-5" | "claude-opus-4-5" | "grok-4-1-fast-reasoning" | "grok-4-1-fast-non-reasoning" | "grok-code-fast-1";
  responseLength?: number;
  thinkingEnabled?: boolean;
  thinkingBudget?: number;
  beastMode?: BeastModeConfig;
  beastModeOutputs?: Record<string, string>;
  beastModeOutputPorts?: string[];
}

export interface FunctionNode extends BaseNode {
  nodeType: "function";
  functionType: string;
  config: Record<string, unknown>;
  outputPorts: string[];
  outputCount?: number;
  outputs?: Record<string, string>;
  imageOutput?: string;
  audioOutput?: string;
  imageOutputs?: string[];
  audioOutputs?: string[];
  beastMode?: BeastModeConfig;
  inputCount?: number;
  inputPorts?: string[];
  inputs?: Record<string, string>;
}

export interface ToolNode extends BaseNode {
  nodeType: "tool";
  toolType: string;
  config: Record<string, unknown>;
}

export type WorkflowNode = AgentNode | FunctionNode | ToolNode;

export interface ToolInstance {
  id: string;
  toolId: string;
  config: unknown;
}

export interface Stage {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export interface Connection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromOutputPort?: string;
  toInputPort?: string;
}

export interface Note {
  id: string;
  content: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  color: string;
}

export interface Workflow {
  stages: Stage[];
  connections: Connection[];
  notes?: Note[];
  viewMode?: "stacked" | "canvas" | "simple";
}

export interface LogEntry {
  time: string;
  type: "info" | "warning" | "error" | "success" | "running";
  message: string;
}
