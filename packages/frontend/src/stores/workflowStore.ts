import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Workflow,
  WorkflowNode,
  AgentNode,
  FunctionNode,
  ToolNode,
  Stage,
  Connection,
  Note,
  LogEntry,
} from '@agent-builder/shared';

export type AppMode = 'workflow' | 'freeAgent';

export const useWorkflowStore = defineStore('workflow', () => {
  // App-level state
  const appMode = ref<AppMode>('workflow');
  const selectedNode = ref<string | null>(null);
  const connectingFrom = ref<string | null>(null);
  const connectingFromPort = ref<string | undefined>(undefined);
  const userInput = ref<string>('');
  const workflowName = ref<string>('Untitled Workflow');
  const logs = ref<LogEntry[]>([]);

  // Model settings
  const selectedModel = ref<string>('gemini-2.5-flash');
  const responseLength = ref<number>(16384);
  const thinkingEnabled = ref<boolean>(false);
  const thinkingBudget = ref<number>(0);

  // Workflow state
  const workflow = ref<Workflow>({
    stages: [],
    connections: [],
    notes: [],
    viewMode: 'stacked',
  });

  // Execution state
  const isRunning = ref<boolean>(false);

  // Computed
  const allNodes = computed(() => workflow.value.stages.flatMap(s => s.nodes));
  const currentViewMode = computed(() => workflow.value.viewMode || 'stacked');

  // Log management
  function addLog(type: LogEntry['type'], message: string) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    logs.value.push({ time, type, message });
  }

  function clearLogs() {
    logs.value = [];
  }

  // Thinking budget
  function setThinkingEnabled(enabled: boolean) {
    thinkingEnabled.value = enabled;
    if (enabled && thinkingBudget.value === 0) {
      thinkingBudget.value = -1;
    } else if (!enabled) {
      thinkingBudget.value = 0;
    }
  }

  // View mode
  function toggleViewMode() {
    const current = workflow.value.viewMode || 'stacked';
    const next =
      current === 'stacked' ? 'canvas' : current === 'canvas' ? 'simple' : 'stacked';
    workflow.value = { ...workflow.value, viewMode: next };
  }

  function setViewMode(mode: 'stacked' | 'canvas' | 'simple') {
    workflow.value = { ...workflow.value, viewMode: mode };
  }

  // Stage management
  function addStage() {
    let newStageY = 100;
    const startX = 100;
    const stageGap = 50;
    const nodeHeight = 150;
    const stagePaddingTop = 100;
    const stagePaddingBottom = 24;

    workflow.value.stages.forEach((stage) => {
      if (stage.nodes.length === 0) {
        newStageY += 300 + stageGap;
      } else {
        let minY = Infinity, maxY = -Infinity;
        stage.nodes.forEach((_, idx) => {
          const nodeY = (stage.nodes[idx].position?.y ?? Math.floor(idx / 2) * 180);
          minY = Math.min(minY, nodeY);
          maxY = Math.max(maxY, nodeY + nodeHeight);
        });
        const stageHeight = (maxY - minY) + stagePaddingTop + stagePaddingBottom;
        newStageY += stageHeight + stageGap;
      }
    });

    const newStage: Stage = {
      id: `stage-${Date.now()}`,
      name: `Stage ${workflow.value.stages.length + 1}`,
      nodes: [],
      position: { x: startX, y: newStageY },
    };
    workflow.value = {
      ...workflow.value,
      stages: [...workflow.value.stages, newStage],
    };
  }

  function renameStage(stageId: string, name: string) {
    workflow.value = {
      ...workflow.value,
      stages: workflow.value.stages.map(s => s.id === stageId ? { ...s, name } : s),
    };
  }

  function deleteStage(stageId: string) {
    const stage = workflow.value.stages.find(s => s.id === stageId);
    if (!stage) return;
    const nodeIds = new Set(stage.nodes.map(n => n.id));
    workflow.value = {
      ...workflow.value,
      stages: workflow.value.stages.filter(s => s.id !== stageId),
      connections: workflow.value.connections.filter(
        c => !nodeIds.has(c.fromNodeId) && !nodeIds.has(c.toNodeId)
      ),
    };
  }

  function reorderStages(fromIndex: number, toIndex: number) {
    const newStages = [...workflow.value.stages];
    const [moved] = newStages.splice(fromIndex, 1);
    newStages.splice(toIndex, 0, moved);

    const getStageIndex = (nodeId: string): number => {
      for (let i = 0; i < newStages.length; i++) {
        if (newStages[i].nodes.some(n => n.id === nodeId)) return i;
      }
      return -1;
    };

    const validConnections = workflow.value.connections.filter(c => {
      const fi = getStageIndex(c.fromNodeId);
      const ti = getStageIndex(c.toNodeId);
      return fi !== -1 && ti !== -1 && fi < ti;
    });

    const removedCount = workflow.value.connections.length - validConnections.length;
    if (removedCount > 0) {
      addLog('warning', `Removed ${removedCount} invalid connection(s) after stage reordering`);
    }

    workflow.value = { ...workflow.value, stages: newStages, connections: validConnections };
  }

  function updateStagePosition(stageId: string, position: { x: number; y: number }) {
    workflow.value = {
      ...workflow.value,
      stages: workflow.value.stages.map(s => s.id === stageId ? { ...s, position } : s),
    };
  }

  // Node management
  function addNode(
    stageId: string,
    template: Record<string, unknown>,
    nodeType: 'agent' | 'function' | 'tool' = 'agent'
  ) {
    let newNode: WorkflowNode;

    if (nodeType === 'agent') {
      newNode = {
        id: `agent-${Date.now()}`,
        nodeType: 'agent',
        name: template.name as string,
        type: template.id as string,
        systemPrompt: (template.defaultSystemPrompt as string) || `You are a ${template.name} agent.`,
        userPrompt: (template.defaultUserPrompt as string) || 'Process the following input: {input}',
        tools: [],
        status: 'idle',
      } as AgentNode;
    } else if (nodeType === 'function') {
      const isLogicGate = template.id === 'logic_gate';
      const isPronghorn = template.id === 'pronghorn';
      const supportsMultiInput = isLogicGate || isPronghorn;
      const defaultInputCount = isLogicGate ? 2 : isPronghorn ? 1 : undefined;
      const defaultInputPorts = supportsMultiInput
        ? Array.from({ length: defaultInputCount || 1 }, (_, i) => `input_${i + 1}`)
        : undefined;

      newNode = {
        id: `function-${Date.now()}`,
        nodeType: 'function',
        name: template.name as string,
        functionType: template.id as string,
        config: isLogicGate ? { gateType: 'AND', outputMode: 'single', separator: '\n' } : {},
        outputPorts: (template.supportsMultipleOutputs
          ? ['output_1']
          : ((template.outputs as string[]) || ['output'])),
        outputCount: (template.supportsMultipleOutputs as boolean) ? 1 : undefined,
        outputs: {},
        status: 'idle',
        inputCount: defaultInputCount,
        inputPorts: defaultInputPorts,
        inputs: supportsMultiInput ? {} : undefined,
      } as FunctionNode;
    } else {
      newNode = {
        id: `tool-${Date.now()}`,
        nodeType: 'tool',
        name: template.name as string,
        toolType: template.id as string,
        config: {},
        status: 'idle',
      } as ToolNode;
    }

    workflow.value = {
      ...workflow.value,
      stages: workflow.value.stages.map(stage => {
        if (stage.id !== stageId) return stage;
        const nodeHeight = 150;
        const nodeSpacing = 30;

        if (stage.nodes.length === 0) {
          newNode.position = stage.position
            ? { x: stage.position.x + 40, y: stage.position.y + 100 }
            : { x: 0, y: 0 };
        } else {
          let minX = Infinity, maxY = -Infinity;
          stage.nodes.forEach(n => {
            minX = Math.min(minX, n.position?.x ?? 0);
            maxY = Math.max(maxY, n.position?.y ?? 0);
          });
          newNode.position = { x: minX, y: maxY + nodeHeight + nodeSpacing };
        }
        return { ...stage, nodes: [...stage.nodes, newNode] };
      }),
    };
  }

  function updateNode(nodeId: string, updates: Partial<WorkflowNode>) {
    workflow.value = {
      ...workflow.value,
      stages: workflow.value.stages.map(stage => ({
        ...stage,
        nodes: stage.nodes.map(node => {
          if (node.id !== nodeId) return node;
          const updated = { ...node, ...updates } as WorkflowNode;
          if (updated.nodeType === 'function' && 'outputCount' in updates) {
            const fn = updated as FunctionNode;
            fn.outputPorts = Array.from({ length: fn.outputCount || 1 }, (_, i) => `output_${i + 1}`);
          }
          if (updated.nodeType === 'function' && 'inputCount' in updates) {
            const fn = updated as FunctionNode;
            const supportsMultiInput = fn.functionType === 'logic_gate' || fn.functionType === 'pronghorn';
            if (supportsMultiInput) {
              const defCount = fn.functionType === 'logic_gate' ? 2 : 1;
              const count = fn.inputCount || defCount;
              fn.inputPorts = Array.from({ length: count }, (_, i) => `input_${i + 1}`);
              if (fn.functionType === 'logic_gate' && fn.config.outputMode === 'matching') {
                fn.outputCount = count;
                fn.outputPorts = Array.from({ length: count }, (_, i) => `output_${i + 1}`);
              }
            }
          }
          return updated;
        }),
      })),
    };
  }

  function deleteNode(nodeId: string) {
    workflow.value = {
      ...workflow.value,
      stages: workflow.value.stages.map(stage => ({
        ...stage,
        nodes: stage.nodes.filter(n => n.id !== nodeId),
      })),
      connections: workflow.value.connections.filter(
        c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId
      ),
    };
  }

  function updateNodePosition(nodeId: string, position: { x: number; y: number }) {
    updateNode(nodeId, { position });
  }

  function toggleMinimize(nodeId: string) {
    const node = allNodes.value.find(n => n.id === nodeId);
    if (node) updateNode(nodeId, { minimized: !node.minimized });
  }

  function toggleNodeLock(nodeId: string) {
    const node = allNodes.value.find(n => n.id === nodeId);
    if (node) updateNode(nodeId, { locked: !node.locked });
  }

  function moveNodeToStage(
    nodeId: string,
    targetStageId: string,
    newPosition?: { x: number; y: number }
  ) {
    let sourceStageIndex = -1;
    let nodeToMove: WorkflowNode | null = null;
    for (let i = 0; i < workflow.value.stages.length; i++) {
      const found = workflow.value.stages[i].nodes.find(n => n.id === nodeId);
      if (found) { sourceStageIndex = i; nodeToMove = found; break; }
    }
    if (!nodeToMove || sourceStageIndex === -1) return;
    const targetStageIndex = workflow.value.stages.findIndex(s => s.id === targetStageId);
    if (targetStageIndex === -1) return;
    if (workflow.value.stages[sourceStageIndex].id === targetStageId) return;

    const updatedNode = newPosition ? { ...nodeToMove, position: newPosition } : nodeToMove;
    const newStages = workflow.value.stages.map((stage, idx) => {
      if (idx === sourceStageIndex) return { ...stage, nodes: stage.nodes.filter(n => n.id !== nodeId) };
      if (stage.id === targetStageId) return { ...stage, nodes: [...stage.nodes, updatedNode] };
      return stage;
    });

    const getStageIndex = (nId: string) => {
      for (let i = 0; i < newStages.length; i++) {
        if (newStages[i].nodes.some(n => n.id === nId)) return i;
      }
      return -1;
    };
    const validConnections = workflow.value.connections.filter(c => {
      const fi = getStageIndex(c.fromNodeId);
      const ti = getStageIndex(c.toNodeId);
      return fi !== -1 && ti !== -1 && fi < ti;
    });

    addLog('info', `Moved "${nodeToMove.name}" to ${newStages[targetStageIndex].name}`);
    workflow.value = { ...workflow.value, stages: newStages, connections: validConnections };
  }

  // Connections
  function addConnection(connection: Connection) {
    if (
      workflow.value.connections.some(
        c => c.fromNodeId === connection.fromNodeId &&
          c.toNodeId === connection.toNodeId &&
          c.fromOutputPort === connection.fromOutputPort &&
          c.toInputPort === connection.toInputPort
      )
    ) return;
    workflow.value = {
      ...workflow.value,
      connections: [...workflow.value.connections, connection],
    };
  }

  function removeConnection(connectionId: string) {
    workflow.value = {
      ...workflow.value,
      connections: workflow.value.connections.filter(c => c.id !== connectionId),
    };
  }

  // Notes
  function addNote(position: { x: number; y: number }) {
    const note: Note = {
      id: `note-${Date.now()}`,
      content: '',
      position,
      width: 200,
      height: 100,
    };
    workflow.value = { ...workflow.value, notes: [...(workflow.value.notes || []), note] };
  }

  function updateNote(noteId: string, updates: Partial<Note>) {
    workflow.value = {
      ...workflow.value,
      notes: (workflow.value.notes || []).map(n => n.id === noteId ? { ...n, ...updates } : n),
    };
  }

  function deleteNote(noteId: string) {
    workflow.value = {
      ...workflow.value,
      notes: (workflow.value.notes || []).filter(n => n.id !== noteId),
    };
  }

  // Load/Save
  function loadWorkflow(data: Workflow, name?: string) {
    workflow.value = data;
    if (name) workflowName.value = name;
    logs.value = [];
    selectedNode.value = null;
  }

  function clearWorkflow() {
    workflow.value = { stages: [], connections: [], notes: [], viewMode: 'stacked' };
    workflowName.value = 'Untitled Workflow';
    logs.value = [];
    selectedNode.value = null;
  }

  return {
    // State
    appMode,
    selectedNode,
    connectingFrom,
    connectingFromPort,
    userInput,
    workflowName,
    logs,
    selectedModel,
    responseLength,
    thinkingEnabled,
    thinkingBudget,
    workflow,
    isRunning,
    // Computed
    allNodes,
    currentViewMode,
    // Actions
    addLog,
    clearLogs,
    setThinkingEnabled,
    toggleViewMode,
    setViewMode,
    addStage,
    renameStage,
    deleteStage,
    reorderStages,
    updateStagePosition,
    addNode,
    updateNode,
    deleteNode,
    updateNodePosition,
    toggleMinimize,
    toggleNodeLock,
    moveNodeToStage,
    addConnection,
    removeConnection,
    addNote,
    updateNote,
    deleteNote,
    loadWorkflow,
    clearWorkflow,
  };
});
