<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  VueFlow,
  Panel,
  type Node,
  type Edge,
  type NodeChange,
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import FreeAgentNode from './FreeAgentNode.vue';
import ToolNode from './ToolNode.vue';
import ArtifactNode from './ArtifactNode.vue';
import FileNode from './FileNode.vue';
import ScratchpadNode from './ScratchpadNode.vue';
import PromptNode from './PromptNode.vue';
import PromptFileNode from './PromptFileNode.vue';
import AttributeNode from './AttributeNode.vue';
import ChildAgentNode from './ChildAgentNode.vue';
import CategoryLabelNode from './CategoryLabelNode.vue';
import type { FreeAgentSession, ToolsManifest, SessionFile } from '@agent-builder/shared';
import type { ToolInstance } from '@agent-builder/shared';

const props = withDefaults(
  defineProps<{
    session: FreeAgentSession | null;
    toolsManifest: ToolsManifest | null;
    activeToolIds: Set<string>;
    toolInstances?: ToolInstance[];
    pendingFiles?: SessionFile[];
    onScratchpadChange?: (content: string) => void;
    onRetry?: () => void;
    onChildClick?: (childName: string) => void;
  }>(),
  {
    toolInstances: () => [],
    pendingFiles: () => [],
  }
);

const emit = defineEmits<{
  'node-click': [nodeId: string, nodeType: string, data: any];
}>();

const nodeTypes = {
  agent: FreeAgentNode,
  tool: ToolNode,
  artifact: ArtifactNode,
  file: FileNode,
  scratchpad: ScratchpadNode,
  prompt: PromptNode,
  promptFile: PromptFileNode,
  attribute: AttributeNode,
  childAgent: ChildAgentNode,
  categoryLabel: CategoryLabelNode,
};

const CATEGORY_ORDER = [
  'utility', 'web', 'code', 'memory', 'file', 'document',
  'reasoning', 'communication', 'interaction', 'generation',
  'export', 'api', 'database', 'advanced_self_author', 'advanced_spawn',
];

const LAYOUT = {
  agentX: 700, agentY: 900,
  treeStartY: 300,
  clusterGapX: 40, clusterStartX: -350,
  toolNodeWidth: 100, toolNodeHeight: 60,
  toolGapY: 70, toolGapX: 105,
  maxToolsPerColumn: 4,
  labelOffsetY: -30,
  promptX: -100, promptY: 900, promptWidth: 260, promptHeight: 280,
  userFileGap: 70,
  scratchpadX: 1150, scratchpadY: 900, scratchpadWidth: 300, scratchpadHeight: 280,
  artifactGap: 70,
  attributeX: 1550, attributeY: 900, attributeGap: 65,
  attributeColumnGap: 220, attributesPerColumn: 10,
  childOffsetY: 200, childSpacing: 180, childRowGap: 120, childrenPerRow: 3,
};

const userPositions = ref(new Map<string, { x: number; y: number }>());
const existingNodeIds = ref(new Set<string>());

const effectiveTools = computed(() => {
  if (!props.toolsManifest) return [];
  const toolsWithInstances = new Set(props.toolInstances.map(i => i.baseToolId));
  const tools: Array<{
    id: string; baseToolId: string; isInstance: boolean;
    instanceLabel?: string; category: string; name: string; icon?: string;
  }> = [];

  Object.entries(props.toolsManifest.tools).forEach(([toolId, tool]) => {
    if (!toolsWithInstances.has(toolId)) {
      const cat = Array.isArray(tool.category) ? tool.category[0] : tool.category;
      tools.push({ id: toolId, baseToolId: toolId, isInstance: false, category: cat, name: tool.name, icon: tool.icon });
    }
  });

  props.toolInstances.forEach(instance => {
    const baseTool = props.toolsManifest!.tools[instance.baseToolId];
    if (baseTool) {
      const cat = Array.isArray(baseTool.category) ? baseTool.category[0] : baseTool.category;
      tools.push({
        id: instance.fullToolId, baseToolId: instance.baseToolId, isInstance: true,
        instanceLabel: instance.label, category: cat, name: instance.label, icon: baseTool.icon,
      });
    }
  });
  return tools;
});

const toolsByCategory = computed(() => {
  const groups: Record<string, typeof effectiveTools.value> = {};
  effectiveTools.value.forEach(tool => {
    if (!groups[tool.category]) groups[tool.category] = [];
    groups[tool.category].push(tool);
  });
  return groups;
});

function layoutToolsInClusters(byCategory: typeof toolsByCategory.value) {
  const positions: Array<{ tool: typeof effectiveTools.value[0]; x: number; y: number; clusterCenterX: number; clusterCenterY: number }> = [];
  let currentX = LAYOUT.clusterStartX;

  CATEGORY_ORDER.forEach(category => {
    const categoryTools = byCategory[category];
    if (!categoryTools?.length) return;
    const numColumns = Math.ceil(categoryTools.length / LAYOUT.maxToolsPerColumn);
    const clusterWidth = numColumns * LAYOUT.toolGapX;
    const clusterHeight = Math.min(categoryTools.length, LAYOUT.maxToolsPerColumn) * LAYOUT.toolGapY;
    const clusterCenterX = currentX + clusterWidth / 2;
    const clusterCenterY = LAYOUT.treeStartY + clusterHeight / 2;

    categoryTools.forEach((tool, index) => {
      const column = Math.floor(index / LAYOUT.maxToolsPerColumn);
      const row = index % LAYOUT.maxToolsPerColumn;
      positions.push({
        tool,
        x: currentX + column * LAYOUT.toolGapX,
        y: LAYOUT.treeStartY + row * LAYOUT.toolGapY,
        clusterCenterX,
        clusterCenterY,
      });
    });
    currentX += clusterWidth + LAYOUT.clusterGapX;
  });
  return positions;
}

function getPos(nodeId: string, defaultPos: { x: number; y: number }) {
  const userPos = userPositions.value.get(nodeId);
  if (userPos && existingNodeIds.value.has(nodeId)) return userPos;
  return defaultPos;
}

const flowNodes = computed<Node[]>(() => {
  if (!props.toolsManifest) return [];
  const newNodes: Node[] = [];
  const newNodeIds = new Set<string>();

  // === Prompt ===
  newNodeIds.add('prompt');
  newNodes.push({
    id: 'prompt', type: 'prompt',
    position: getPos('prompt', { x: LAYOUT.promptX, y: LAYOUT.promptY }),
    style: { width: LAYOUT.promptWidth, height: LAYOUT.promptHeight },
    data: { type: 'prompt', label: 'User Prompt', content: props.session?.prompt || '', status: 'idle' },
  });

  // Files
  const filesToShow = props.session?.sessionFiles?.length ? props.session.sessionFiles : props.pendingFiles;
  filesToShow.forEach((file, index) => {
    const fileId = `promptFile-${file.id}`;
    newNodeIds.add(fileId);
    newNodes.push({
      id: fileId, type: 'promptFile',
      position: getPos(fileId, { x: LAYOUT.promptX, y: LAYOUT.promptY + LAYOUT.promptHeight + 20 + index * LAYOUT.userFileGap }),
      data: {
        type: 'promptFile', label: file.filename, fileId: file.id,
        filename: file.filename, mimeType: file.mimeType, size: file.size,
        status: props.activeToolIds.has(`read_file_${file.id}`) ? 'reading' : 'idle',
      },
    });
  });

  // === Tools ===
  const toolPositions = layoutToolsInClusters(toolsByCategory.value);
  const clusterCenters: Record<string, { x: number; y: number }> = {};

  toolPositions.forEach(({ tool, x, y, clusterCenterX, clusterCenterY }) => {
    const nodeId = `tool-${tool.id}`;
    newNodeIds.add(nodeId);
    const isActive = props.activeToolIds.has(tool.id) || props.activeToolIds.has(tool.baseToolId);
    const wasUsed = props.session?.toolCalls.some(tc => (tc.tool === tool.id || tc.tool === tool.baseToolId) && tc.status === 'completed');
    const categoryData = props.toolsManifest!.categories?.[tool.category];
    const categoryColor = categoryData?.color || '#6B7280';

    newNodes.push({
      id: nodeId, type: 'tool',
      position: getPos(nodeId, { x, y }),
      data: {
        type: 'tool', label: tool.name,
        status: isActive ? 'active' : wasUsed ? 'success' : 'idle',
        icon: tool.icon, category: tool.category, categoryColor,
        toolId: tool.id, isInstance: tool.isInstance, instanceLabel: tool.instanceLabel,
      },
    });

    if (!clusterCenters[tool.category]) {
      clusterCenters[tool.category] = { x: clusterCenterX, y: clusterCenterY };
    }
  });

  // Category labels
  Object.entries(clusterCenters).forEach(([category, pos]) => {
    const labelId = `category-label-${category}`;
    newNodeIds.add(labelId);
    const categoryData = props.toolsManifest!.categories?.[category];
    newNodes.push({
      id: labelId, type: 'categoryLabel',
      position: { x: pos.x - 50, y: LAYOUT.treeStartY + LAYOUT.labelOffsetY },
      selectable: false, draggable: false,
      data: {
        type: 'categoryLabel',
        label: categoryData?.name || category.replace(/_/g, ' '),
        color: categoryData?.color || '#6B7280',
      },
    });
  });

  // === Agent ===
  const isWaitingForChildren = props.session?.status === 'waiting' ||
    (props.session?.orchestration?.role === 'orchestrator' && props.session?.orchestration?.awaitingChildren === true);

  const agentStatus = isWaitingForChildren ? 'idle'
    : props.session?.status === 'running' ? 'thinking'
    : props.session?.status === 'completed' ? 'success'
    : props.session?.status === 'error' ? 'error'
    : props.session?.status === 'paused' ? 'paused'
    : 'idle';

  newNodeIds.add('agent');
  newNodes.push({
    id: 'agent', type: 'agent',
    position: getPos('agent', { x: LAYOUT.agentX - 60, y: LAYOUT.agentY - 60 }),
    data: {
      type: 'agent', label: 'Free Agent', status: agentStatus,
      isWaiting: isWaitingForChildren,
      iteration: props.session?.currentIteration || 0,
      reasoning: props.session?.messages[props.session.messages.length - 1]?.content,
      retryCount: props.session?.retryCount,
      onRetry: (agentStatus === 'error' || agentStatus === 'paused') ? props.onRetry : undefined,
    },
  });

  // === Child agents ===
  if (props.session?.orchestration?.role === 'orchestrator' && props.session.orchestration.children) {
    const children = props.session.orchestration.children;
    children.forEach((child, index) => {
      const row = Math.floor(index / LAYOUT.childrenPerRow);
      const col = index % LAYOUT.childrenPerRow;
      const rowChildCount = Math.min(LAYOUT.childrenPerRow, children.length - row * LAYOUT.childrenPerRow);
      const rowWidth = (rowChildCount - 1) * LAYOUT.childSpacing;
      const rowStartX = LAYOUT.agentX - rowWidth / 2 - 60;
      const childNodeId = `child-${child.name}`;
      newNodeIds.add(childNodeId);
      const childStatus = child.status === 'running' ? 'thinking' : child.status === 'completed' ? 'success' : child.status === 'error' ? 'error' : 'idle';

      newNodes.push({
        id: childNodeId, type: 'childAgent',
        position: getPos(childNodeId, {
          x: rowStartX + col * LAYOUT.childSpacing,
          y: LAYOUT.agentY + LAYOUT.childOffsetY + row * LAYOUT.childRowGap,
        }),
        data: {
          type: 'childAgent', label: child.name, childName: child.name,
          status: childStatus, task: child.task,
          currentIteration: child.currentIteration,
          maxIterations: child.maxIterations,
        },
      });
    });
  }

  // === Scratchpad ===
  const isWritingToScratchpad = props.activeToolIds.has('write_scratchpad');
  newNodeIds.add('scratchpad');
  newNodes.push({
    id: 'scratchpad', type: 'scratchpad',
    position: getPos('scratchpad', { x: LAYOUT.scratchpadX, y: LAYOUT.scratchpadY }),
    style: { width: LAYOUT.scratchpadWidth, height: LAYOUT.scratchpadHeight },
    data: {
      type: 'scratchpad', label: 'Scratchpad',
      content: props.session?.scratchpad || '',
      status: isWritingToScratchpad ? 'active' : 'idle',
      isWriting: isWritingToScratchpad,
      onContentChange: props.onScratchpadChange,
    },
  });

  // === Artifacts ===
  props.session?.artifacts.forEach((artifact, index) => {
    const nodeId = `artifact-${artifact.id}`;
    newNodeIds.add(nodeId);
    newNodes.push({
      id: nodeId, type: 'artifact',
      position: getPos(nodeId, { x: LAYOUT.scratchpadX, y: LAYOUT.scratchpadY + LAYOUT.scratchpadHeight + 20 + index * LAYOUT.artifactGap }),
      data: { type: 'artifact', label: artifact.title, status: 'success', artifactId: artifact.id, artifactType: artifact.type },
    });
  });

  // === Attributes ===
  const attributeEntries = Object.entries(props.session?.toolResultAttributes || {});
  attributeEntries.forEach(([name, attribute], index) => {
    const col = Math.floor(index / LAYOUT.attributesPerColumn);
    const row = index % LAYOUT.attributesPerColumn;
    const nodeId = `attribute-${name}`;
    newNodeIds.add(nodeId);
    const attrValue = (attribute as any).isBinary ? JSON.stringify((attribute as any).result) : (attribute as any).resultString;

    newNodes.push({
      id: nodeId, type: 'attribute',
      position: getPos(nodeId, {
        x: LAYOUT.attributeX + col * LAYOUT.attributeColumnGap,
        y: LAYOUT.attributeY + row * LAYOUT.attributeGap,
      }),
      data: {
        type: 'attribute', label: name, status: 'success',
        attributeName: name, attributeTool: (attribute as any).tool,
        attributeValue: attrValue, size: (attribute as any).size,
        iteration: (attribute as any).iteration, isBinary: (attribute as any).isBinary,
        mimeType: (attribute as any).mimeType,
      },
    });
  });

  existingNodeIds.value = newNodeIds;
  return newNodes;
});

const flowEdges = computed<Edge[]>(() => {
  if (!props.toolsManifest) return [];
  const edges: Edge[] = [];

  // Prompt → agent
  edges.push({
    id: 'edge-prompt-agent', source: 'prompt', target: 'agent', targetHandle: 'left',
    style: { stroke: '#3b82f6', strokeWidth: 1.5, strokeDasharray: props.session?.prompt ? undefined : '5,5' },
  });

  // Files → agent
  const filesToShow = props.session?.sessionFiles?.length ? props.session.sessionFiles : props.pendingFiles;
  filesToShow.forEach(file => {
    edges.push({
      id: `edge-promptFile-agent-${file.id}`,
      source: `promptFile-${file.id}`, target: 'agent', targetHandle: 'left',
      style: { stroke: '#10b981', strokeWidth: 1, strokeDasharray: '3,3' },
    });
  });

  // Tools → agent (only if active or used)
  layoutToolsInClusters(toolsByCategory.value).forEach(({ tool }) => {
    const nodeId = `tool-${tool.id}`;
    const isActive = props.activeToolIds.has(tool.id) || props.activeToolIds.has(tool.baseToolId);
    const wasUsed = props.session?.toolCalls.some(tc => (tc.tool === tool.id || tc.tool === tool.baseToolId) && tc.status === 'completed');
    if (isActive || wasUsed) {
      const readCategories = ['utility', 'web', 'code', 'memory', 'file', 'document', 'api', 'database'];
      edges.push({
        id: `edge-tool-agent-${tool.id}`,
        source: nodeId, sourceHandle: 'bottom', target: 'agent', targetHandle: 'top',
        animated: isActive,
        style: { stroke: readCategories.includes(tool.category) ? '#3b82f6' : '#f59e0b', strokeWidth: isActive ? 2 : 1.5 },
      });
    }
  });

  // Agent → children
  if (props.session?.orchestration?.role === 'orchestrator' && props.session.orchestration.children) {
    props.session.orchestration.children.forEach(child => {
      edges.push({
        id: `edge-orchestrator-${child.name}`,
        source: 'agent', target: `child-${child.name}`,
        sourceHandle: 'bottom', targetHandle: 'top',
        animated: child.status === 'running',
        style: { stroke: '#f59e0b', strokeWidth: 2 },
      });
    });
  }

  // Agent → scratchpad
  const isWritingToScratchpad = props.activeToolIds.has('write_scratchpad');
  edges.push({
    id: 'edge-agent-scratchpad',
    source: 'agent', sourceHandle: 'right', target: 'scratchpad',
    animated: isWritingToScratchpad,
    style: {
      stroke: isWritingToScratchpad ? '#f59e0b' : '#f59e0b50',
      strokeWidth: isWritingToScratchpad ? 2 : 1,
      strokeDasharray: isWritingToScratchpad ? undefined : '5,5',
    },
  });

  // Agent → artifacts
  props.session?.artifacts.forEach(artifact => {
    edges.push({
      id: `edge-agent-artifact-${artifact.id}`,
      source: 'agent', sourceHandle: 'right', target: `artifact-${artifact.id}`,
      style: { stroke: '#10b981', strokeWidth: 1.5, strokeDasharray: '5,5' },
    });
  });

  // Scratchpad → attributes
  Object.keys(props.session?.toolResultAttributes || {}).forEach(name => {
    edges.push({
      id: `edge-scratchpad-attribute-${name}`,
      source: 'scratchpad', sourceHandle: 'attributes', target: `attribute-${name}`,
      style: { stroke: '#06b6d4', strokeWidth: 1.5 },
    });
  });

  return edges;
});

function onNodesChange(changes: NodeChange[]) {
  changes.forEach(change => {
    if (change.type === 'position' && change.position && change.dragging === false) {
      userPositions.value.set(change.id, change.position);
    }
  });
}

function onNodeClick(evt: { node: Node }) {
  const node = evt.node;
  emit('node-click', node.id, node.type ?? '', node.data);
  if (node.type === 'childAgent' && props.onChildClick) {
    props.onChildClick(node.data.childName);
  }
}
</script>

<template>
  <div class="w-full h-full">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      :min-zoom="0.1"
      fit-view
      :fit-view-options="{ padding: 0.2 }"
      @nodes-change="onNodesChange"
      @node-click="onNodeClick"
    >
      <Panel position="top-left" class="bg-background/80 backdrop-blur-sm p-2 rounded-lg border text-sm font-medium">
        <template v-if="session">
          Iteration {{ session.currentIteration }} / {{ session.maxIterations }}
          <span v-if="session.status === 'waiting' && session.orchestration?.children" class="ml-2 text-amber-500">
            (Waiting for {{ session.orchestration.children.filter((c: any) => c.status === 'running').length }} children)
          </span>
        </template>
        <template v-else>No active session</template>
      </Panel>
    </VueFlow>
  </div>
</template>
