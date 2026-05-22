<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  VueFlow,
  Panel,
  MarkerType,
  ConnectionLineType,
  useVueFlow,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type Connection,
  type NodeDragEvent,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';
import {
  AlignVerticalJustifyCenter,
  AlignHorizontalJustifyCenter,
  Grid3x3,
  Map,
  StickyNote,
} from '@lucide/vue';
import type {
  Workflow,
  WorkflowNode,
  Note as WorkflowNote,
  FunctionNode as FunctionNodeData,
} from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Button from '../ui/Button.vue';
import StageNodeFlow from './canvas/StageNodeFlow.vue';
import WorkflowNodeFlow from './canvas/WorkflowNodeFlow.vue';
import NoteNodeFlow from './canvas/NoteNodeFlow.vue';

const props = withDefaults(
  defineProps<{
    workflow: Workflow;
    selectedNode?: WorkflowNode | null;
    isConnecting?: boolean;
    customAgents?: unknown[];
  }>(),
  { selectedNode: null, isConnecting: false, customAgents: () => [] }
);

const emit = defineEmits<{
  'select-node': [nodeId: string | null];
  'add-stage': [];
  'delete-stage': [stageId: string];
  'rename-stage': [stageId: string, name: string];
  'reorder-stages': [fromIndex: number, toIndex: number];
  'add-agent': [stageId: string, template: unknown];
  'add-function': [stageId: string, template: unknown];
  'delete-node': [nodeId: string];
  'run-agent': [nodeId: string];
  'start-connection': [nodeId: string, port?: string];
  'port-click': [nodeId: string, port?: string];
  'complete-connection': [fromId: string, toId: string, fromOutputPort?: string, toInputPort?: string];
  'delete-connection': [connectionId: string];
  'update-node': [nodeId: string, updates: Partial<WorkflowNode>];
  'update-stage-position': [stageId: string, position: { x: number; y: number }];
  'update-node-position': [nodeId: string, position: { x: number; y: number }];
  'move-node-to-stage': [nodeId: string, stageId: string, newPosition?: { x: number; y: number }];
  'toggle-view-mode': [];
  'auto-layout-vertical': [];
  'auto-layout-horizontal': [];
  'auto-layout-grid': [];
  'add-note': [position: { x: number; y: number }];
  'update-note': [noteId: string, updates: Partial<WorkflowNote>];
  'delete-note': [noteId: string];
  'clone-node': [nodeId: string];
  'clone-stage': [stageId: string];
  'run-stage': [stageId: string];
  'open-add-agent': [stageId: string];
  'open-add-function': [stageId: string];
}>();

const nodes = ref<FlowNode[]>([]);
const edges = ref<FlowEdge[]>([]);
const showMiniMap = ref(true);
const copiedNodeId = ref<string | null>(null);

const nodeTypes = {
  stage: StageNodeFlow,
  workflowNode: WorkflowNodeFlow,
  note: NoteNodeFlow,
};

interface StageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
}

const stagePaddingLeft = 40;
const stagePaddingRight = 24;
const stagePaddingTop = 100;
const stagePaddingBottom = 24;
const defaultNodeHeight = 150;

function getNodeWidth(node: WorkflowNode): number {
  if (node.nodeType === 'function') {
    const fn = node as FunctionNodeData;
    const ports = fn.outputPorts || ['output'];
    if (ports.length > 1) {
      const minWidth = 200;
      const portSpacing = 30;
      return Math.max(minWidth, ports.length * portSpacing);
    }
  }
  return 250;
}

const stageBounds = computed<Record<string, StageBounds>>(() => {
  const bounds: Record<string, StageBounds> = {};
  for (const stage of props.workflow.stages) {
    if (stage.nodes.length === 0) {
      const stageX = stage.position?.x ?? 0;
      const stageY = stage.position?.y ?? 0;
      bounds[stage.id] = {
        x: stageX,
        y: stageY,
        width: 400,
        height: 300,
        minX: stageX + stagePaddingLeft,
        minY: stageY + stagePaddingTop,
      };
      continue;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    stage.nodes.forEach((node, nodeIndex) => {
      const nodeX = node.position?.x ?? (nodeIndex % 2) * 280;
      const nodeY = node.position?.y ?? Math.floor(nodeIndex / 2) * 180;
      const nodeWidth = getNodeWidth(node);
      minX = Math.min(minX, nodeX);
      minY = Math.min(minY, nodeY);
      maxX = Math.max(maxX, nodeX + nodeWidth);
      maxY = Math.max(maxY, nodeY + defaultNodeHeight);
    });

    let stageX: number, stageY: number;
    if (stage.position !== undefined) {
      stageX = stage.position.x;
      stageY = stage.position.y;
    } else {
      stageX = minX - stagePaddingLeft;
      stageY = minY - stagePaddingTop;
    }

    bounds[stage.id] = {
      x: stageX,
      y: stageY,
      width: maxX - minX + stagePaddingLeft + stagePaddingRight,
      height: maxY - minY + stagePaddingTop + stagePaddingBottom,
      minX,
      minY,
    };
  }
  return bounds;
});

function rebuildFlow() {
  const flowNodes: FlowNode[] = [];
  const bounds = stageBounds.value;

  props.workflow.stages.forEach((stage, stageIndex) => {
    const b = bounds[stage.id] || {
      x: 100,
      y: stageIndex * 400,
      width: 400,
      height: 300,
      minX: 140,
      minY: 100 + stagePaddingTop,
    };

    flowNodes.push({
      id: `stage-${stage.id}`,
      type: 'stage',
      position: { x: b.x, y: b.y },
      data: {
        stage,
        width: b.width,
        height: b.height,
        canRunStage: true,
        canClone: true,
        onDelete: () => emit('delete-stage', stage.id),
        onRename: (name: string) => emit('rename-stage', stage.id, name),
        onAddAgent: () => emit('open-add-agent', stage.id),
        onAddFunction: () => emit('open-add-function', stage.id),
        onClone: () => emit('clone-stage', stage.id),
        onRunStage: () => emit('run-stage', stage.id),
        onDropTemplate: (template: unknown, nodeType: 'agent' | 'function' | 'tool') => {
          if (nodeType === 'function') emit('add-function', stage.id, template);
          else emit('add-agent', stage.id, template);
        },
      },
      style: {
        width: `${b.width}px`,
        height: `${b.height}px`,
        zIndex: 1,
      },
      draggable: true,
    });

    stage.nodes.forEach((node, nodeIndex) => {
      const nodeX = node.position?.x ?? (nodeIndex % 2) * 280;
      const nodeY = node.position?.y ?? Math.floor(nodeIndex / 2) * 180;
      const relativeX = nodeX - b.minX + stagePaddingLeft;
      const relativeY = nodeY - b.minY + stagePaddingTop;

      flowNodes.push({
        id: node.id,
        type: 'workflowNode',
        position: { x: relativeX, y: relativeY },
        data: {
          node,
          selected: props.selectedNode?.id === node.id,
          isConnecting: !!props.isConnecting,
          onSelect: () => emit('select-node', node.id),
          onDelete: () => emit('delete-node', node.id),
          onRun: () => emit('run-agent', node.id),
          onPortClick: (outputPort?: string) => emit('port-click', node.id, outputPort),
          onToggleLock: () => emit('update-node', node.id, { locked: !node.locked }),
        },
        parentNode: `stage-${stage.id}`,
        draggable: true,
        style: { zIndex: 10 },
      });
    });
  });

  props.workflow.notes?.forEach(note => {
    flowNodes.push({
      id: note.id,
      type: 'note',
      position: note.position,
      data: {
        note,
        onUpdate: (updates: Partial<WorkflowNote>) => emit('update-note', note.id, updates),
        onDelete: () => emit('delete-note', note.id),
      },
      draggable: true,
      style: { zIndex: 5 },
    });
  });

  nodes.value = flowNodes;

  const builtEdges: any[] = props.workflow.connections.map(conn => ({
    id: conn.id,
    source: conn.fromNodeId,
    target: conn.toNodeId,
    sourceHandle: conn.fromOutputPort,
    targetHandle: conn.toInputPort,
    type: 'default',
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
      color: 'hsl(var(--primary))',
    },
    style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
    class: 'workflow-edge',
    zIndex: 100,
  }));
  edges.value = builtEdges as FlowEdge[];
}

watch(
  () => [
    props.workflow,
    props.selectedNode?.id,
    props.isConnecting,
    stageBounds.value,
  ],
  rebuildFlow,
  { deep: true, immediate: true }
);

function onConnect(connection: Connection) {
  if (connection.source && connection.target) {
    emit(
      'complete-connection',
      connection.source,
      connection.target,
      connection.sourceHandle || undefined,
      connection.targetHandle || undefined
    );
  }
}

function onEdgesChange(changes: Array<{ type: string; id?: string }>) {
  for (const change of changes) {
    if (change.type === 'remove' && change.id) {
      emit('delete-connection', change.id);
    }
  }
}

function onNodeDragStop(event: NodeDragEvent) {
  const node = event.node;
  if (!node) return;
  const id = node.id;
  const position = node.position;

  if (id.startsWith('note-')) {
    emit('update-note', id, { position });
    return;
  }

  if (id.startsWith('stage-')) {
    const stageId = id.replace('stage-', '');
    const stage = props.workflow.stages.find(s => s.id === stageId);
    if (!stage) return;
    const oldBounds = stageBounds.value[stageId];
    const deltaX = position.x - oldBounds.x;
    const deltaY = position.y - oldBounds.y;

    emit('update-stage-position', stageId, { x: position.x, y: position.y });

    if (stage.nodes.length > 0) {
      for (const wf of stage.nodes) {
        const cx = wf.position?.x ?? 0;
        const cy = wf.position?.y ?? 0;
        emit('update-node-position', wf.id, { x: cx + deltaX, y: cy + deltaY });
      }
    }
    return;
  }

  if (node.parentNode) {
    const stage = props.workflow.stages.find(s => `stage-${s.id}` === node.parentNode);
    if (!stage) return;
    const altKey = (event.event as MouseEvent | undefined)?.altKey;
    const bounds = stageBounds.value[stage.id];

    if (altKey) {
      const absoluteX = bounds.x + position.x;
      const absoluteY = bounds.y + position.y;
      for (const target of props.workflow.stages) {
        if (target.id === stage.id) continue;
        const tb = stageBounds.value[target.id];
        if (!tb) continue;
        if (
          absoluteX >= tb.x &&
          absoluteX <= tb.x + tb.width &&
          absoluteY >= tb.y &&
          absoluteY <= tb.y + tb.height
        ) {
          emit('move-node-to-stage', node.id, target.id, {
            x: absoluteX - tb.x,
            y: absoluteY - tb.y,
          });
          return;
        }
      }
    }

    const absoluteX = bounds.minX + (position.x - stagePaddingLeft);
    const absoluteY = bounds.minY + (position.y - stagePaddingTop);
    emit('update-node-position', node.id, { x: absoluteX, y: absoluteY });
  }
}

function onKeyDown(e: KeyboardEvent) {
  const isMod = e.ctrlKey || e.metaKey;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  if (isMod && e.key.toLowerCase() === 'c' && props.selectedNode) {
    e.preventDefault();
    copiedNodeId.value = props.selectedNode.id;
  } else if (isMod && e.key.toLowerCase() === 'v' && copiedNodeId.value) {
    e.preventDefault();
    emit('clone-node', copiedNodeId.value);
  }
}

onMounted(() => document.addEventListener('keydown', onKeyDown));
onUnmounted(() => document.removeEventListener('keydown', onKeyDown));

const vueFlow = useVueFlow();

function handleAddNote() {
  const viewport = vueFlow.getViewport();
  const noteWidth = 200;
  const noteHeight = 200;
  const visualCenterX = window.innerWidth / 2;
  const visualCenterY = window.innerHeight / 2;
  const centerFlowX = visualCenterX / viewport.zoom - viewport.x / viewport.zoom;
  const centerFlowY = visualCenterY / viewport.zoom - viewport.y / viewport.zoom;
  emit('add-note', {
    x: centerFlowX - noteWidth / 2,
    y: centerFlowY - noteHeight / 2,
  });
}
</script>

<template>
  <div class="h-full w-full relative">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      :node-types="nodeTypes"
      :connection-line-type="ConnectionLineType.Bezier"
      :min-zoom="0.2"
      :max-zoom="2"
      :default-viewport="{ x: 0, y: 0, zoom: 0.8 }"
      :default-edge-options="{ type: 'default', animated: true }"
      :delete-key-code="['Delete']"
      :edges-updatable="false"
      :edges-focusable="true"
      fit-view-on-init
      @connect="onConnect"
      @edges-change="onEdgesChange"
      @node-drag-stop="onNodeDragStop"
    >
      <!--
        @vue-flow plugins (installed 2026-05-22 by claude-C):
        - Background: dotted grid that scales with viewport zoom (replaces
          the static CSS radial-gradient that didn't move with pan/zoom).
        - Controls: built-in zoom in/out + fit-view + interactive-toggle.
        - MiniMap: conditional render, toggled by `showMiniMap`.
      -->
      <Background variant="dots" :gap="16" :size="1" pattern-color="hsl(var(--canvas-grid))" />
      <Controls />
      <MiniMap
        v-if="showMiniMap"
        position="bottom-right"
        pannable
        zoomable
        :mask-color="'hsl(var(--background) / 0.6)'"
      />

      <Panel position="top-left">
        <Card class="p-2">
          <div class="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              class="bg-[#fef3c7] hover:bg-[#fde68a] border-[#fde047]"
              title="Add note"
              @click="handleAddNote"
            >
              <StickyNote class="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="Arrange vertically"
              @click="emit('auto-layout-vertical')"
            >
              <AlignVerticalJustifyCenter class="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="Arrange horizontally"
              @click="emit('auto-layout-horizontal')"
            >
              <AlignHorizontalJustifyCenter class="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="Arrange in grid"
              @click="emit('auto-layout-grid')"
            >
              <Grid3x3 class="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              :variant="showMiniMap ? 'default' : 'outline'"
              :title="showMiniMap ? 'Hide mini map' : 'Show mini map'"
              @click="showMiniMap = !showMiniMap"
            >
              <Map class="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </Panel>
    </VueFlow>
  </div>
</template>
