<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useWorkflowStore } from '@/stores/workflowStore';
import Card from '../ui/Card.vue';
import Stage from './Stage.vue';

const props = withDefaults(
  defineProps<{
    layoutId?: string;
    customAgents?: unknown[];
  }>(),
  { layoutId: 'default', customAgents: () => [] }
);

const emit = defineEmits<{
  'run-node': [nodeId: string];
  'run-stage': [stageId: string];
  'start-connection': [nodeId: string | null, outputPort?: string];
  'complete-connection': [fromNodeId: string, toNodeId: string, fromOutputPort?: string, toInputPort?: string];
  'request-add-agent': [stageId: string];
  'request-add-function': [stageId: string];
}>();

const store = useWorkflowStore();
const {
  workflow,
  selectedNode,
  connectingFrom,
  connectingFromPort,
} = storeToRefs(store);

const svgDimensions = ref({ width: 0, height: 0 });
const selectedConnection = ref<string | null>(null);
const redrawTick = ref(0);

const scrollContainerId = computed(() => `workflow-scroll-container-${props.layoutId}`);
const canvasId = computed(() => `workflow-canvas-${props.layoutId}`);

function getScrollContainer(): HTMLElement | null {
  return document.getElementById(scrollContainerId.value);
}

function updateSvgDimensions() {
  const c = getScrollContainer();
  if (!c) return;
  svgDimensions.value = {
    width: c.clientWidth,
    height: Math.max(c.scrollHeight, c.clientHeight),
  };
}

function bumpRedraw() {
  updateSvgDimensions();
  redrawTick.value++;
}

function scheduleRedraws() {
  setTimeout(bumpRedraw, 50);
  setTimeout(bumpRedraw, 150);
  setTimeout(bumpRedraw, 300);
}

watch(
  () => [
    workflow.value.connections,
    workflow.value.stages,
    workflow.value.stages.flatMap(s => s.nodes).length,
  ],
  () => {
    nextTick(scheduleRedraws);
  },
  { deep: true }
);

watch(connectingFrom, v => {
  if (v !== null) {
    selectedConnection.value = null;
  } else {
    connectingFromPort.value = undefined;
  }
});

function handleResize() {
  bumpRedraw();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' && selectedConnection.value) {
    store.removeConnection(selectedConnection.value);
    selectedConnection.value = null;
  }
}

onMounted(() => {
  scheduleRedraws();
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleKeyDown);
});
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleKeyDown);
});

function handlePortClick(
  nodeId: string,
  isOutput: boolean,
  outputPort?: string,
  inputPort?: string
) {
  if (isOutput && !connectingFrom.value) {
    connectingFromPort.value = outputPort;
    connectingFrom.value = nodeId;
    emit('start-connection', nodeId, outputPort);
  } else if (!isOutput && connectingFrom.value && connectingFrom.value !== nodeId) {
    emit('complete-connection', connectingFrom.value, nodeId, connectingFromPort.value, inputPort);
    connectingFromPort.value = undefined;
    connectingFrom.value = null;
  } else if (connectingFrom.value) {
    connectingFromPort.value = undefined;
    connectingFrom.value = null;
    emit('start-connection', null);
  }
}

interface ConnectionPath {
  id: string;
  path: string;
  isSelected: boolean;
}

const connectionPaths = computed<ConnectionPath[]>(() => {
  // touch redrawTick so this recomputes after DOM-based scheduling
  redrawTick.value;
  const c = getScrollContainer();
  if (!c) return [];
  const containerRect = c.getBoundingClientRect();
  const scrollLeft = c.scrollLeft;
  const scrollTop = c.scrollTop;
  const layoutId = props.layoutId;

  const paths: ConnectionPath[] = [];
  for (const conn of workflow.value.connections) {
    const fromNode = workflow.value.stages.flatMap(s => s.nodes).find(n => n.id === conn.fromNodeId);
    const toNode = workflow.value.stages.flatMap(s => s.nodes).find(n => n.id === conn.toNodeId);
    if (!fromNode || !toNode) continue;

    let outputPortId = `port-output-${conn.fromNodeId}-${layoutId}`;
    if (conn.fromOutputPort) {
      outputPortId = `port-output-${conn.fromNodeId}-${conn.fromOutputPort}-${layoutId}`;
    }
    let fromEl = document.getElementById(outputPortId);
    if (!fromEl && !conn.fromOutputPort) {
      fromEl = document.getElementById(`port-output-${conn.fromNodeId}-output-${layoutId}`);
    }

    let inputPortId = `port-input-${conn.toNodeId}-${layoutId}`;
    if (conn.toInputPort) {
      inputPortId = `port-input-${conn.toNodeId}-${conn.toInputPort}-${layoutId}`;
    } else {
      const multi = document.getElementById(`port-input-${conn.toNodeId}-input_1-${layoutId}`);
      if (multi) {
        inputPortId = `port-input-${conn.toNodeId}-input_1-${layoutId}`;
      } else {
        const single = document.getElementById(`port-input-${conn.toNodeId}-input-${layoutId}`);
        if (single) inputPortId = `port-input-${conn.toNodeId}-input-${layoutId}`;
      }
    }
    const toEl = document.getElementById(inputPortId);
    if (!fromEl || !toEl) continue;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const x1 = fromRect.left + fromRect.width / 2 - containerRect.left + scrollLeft - 1;
    const y1 = fromRect.top + fromRect.height / 2 - containerRect.top + scrollTop + 5;
    const x2 = toRect.left + toRect.width / 2 - containerRect.left + scrollLeft - 1;
    const y2 = toRect.top + toRect.height / 2 - containerRect.top + scrollTop - 5;
    const cY1 = y1 + Math.abs(y2 - y1) * 0.5;
    const cY2 = y2 - Math.abs(y2 - y1) * 0.5;
    paths.push({
      id: conn.id,
      path: `M ${x1} ${y1} C ${x1} ${cY1}, ${x2} ${cY2}, ${x2} ${y2}`,
      isSelected: selectedConnection.value === conn.id,
    });
  }
  return paths;
});

const isConnectingMode = computed(() => connectingFrom.value !== null);

function onContainerClick(e: MouseEvent) {
  if (e.target === e.currentTarget) selectedConnection.value = null;
}

function onPathClick(id: string, e: MouseEvent) {
  if (isConnectingMode.value) return;
  e.stopPropagation();
  selectedConnection.value = id;
}

function deleteSelectedConnection() {
  if (!selectedConnection.value) return;
  store.removeConnection(selectedConnection.value);
  selectedConnection.value = null;
}

function selectNode(id: string | null) {
  selectedNode.value = id;
}

function onAddAgent(stageId: string, template: unknown) {
  store.addNode(stageId, template as Record<string, unknown>, 'agent');
}

function onAddNode(stageId: string, template: unknown, nodeType: 'agent' | 'function' | 'tool') {
  store.addNode(stageId, template as Record<string, unknown>, nodeType);
}

const arrowheadId = computed(() => `arrowhead-${props.layoutId}`);
const arrowheadSelectedId = computed(() => `arrowhead-selected-${props.layoutId}`);
</script>

<template>
  <div
    :id="canvasId"
    class="h-full bg-gradient-to-br from-canvas-background to-muted/20 overflow-hidden relative"
  >
    <div class="h-full p-2 lg:p-3">
      <Card
        :id="scrollContainerId"
        class="h-full bg-canvas-background/50 backdrop-blur-sm border-2 border-dashed border-border/50 rounded-xl overflow-x-hidden overflow-y-auto flex flex-col relative"
        @click="onContainerClick"
      >
        <svg
          :key="redrawTick"
          class="absolute top-0 left-0 pointer-events-none"
          :style="{
            width: `${svgDimensions.width}px`,
            height: `${svgDimensions.height}px`,
            zIndex: 15,
            minWidth: '100%',
            minHeight: '100%',
          }"
        >
          <defs>
            <marker
              :id="arrowheadId"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="hsl(var(--primary))" fill-opacity="0.3" />
            </marker>
            <marker
              :id="arrowheadSelectedId"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="hsl(var(--warning))" fill-opacity="0.6" />
            </marker>
          </defs>
          <g
            v-for="p in connectionPaths"
            :key="p.id"
            :style="{ pointerEvents: isConnectingMode ? 'none' : 'auto' }"
          >
            <path
              :d="p.path"
              stroke="transparent"
              stroke-width="20"
              fill="none"
              :style="{
                cursor: 'pointer',
                pointerEvents: isConnectingMode ? 'none' : 'stroke',
              }"
              @click="onPathClick(p.id, $event)"
            />
            <path
              :d="p.path"
              :stroke="p.isSelected ? 'hsl(var(--warning))' : 'hsl(var(--primary))'"
              stroke-width="2"
              :stroke-opacity="p.isSelected ? '0.6' : '0.3'"
              fill="none"
              :marker-end="`url(#${p.isSelected ? arrowheadSelectedId : arrowheadId})`"
              :style="{ pointerEvents: 'none' }"
            />
          </g>
        </svg>

        <div
          v-if="selectedConnection && !connectingFrom"
          class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 lg:hidden"
        >
          <Card class="p-2 bg-card shadow-lg flex items-center gap-2">
            <span class="text-xs text-muted-foreground px-2">Connection selected</span>
            <button
              class="px-3 py-1.5 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90"
              @click="deleteSelectedConnection"
            >
              Delete
            </button>
            <button
              class="px-3 py-1.5 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80"
              @click="selectedConnection = null"
            >
              Cancel
            </button>
          </Card>
        </div>

        <div
          class="p-2 lg:p-3 space-y-3 w-full max-w-full"
          style="position: relative; z-index: 5"
        >
          <div v-if="workflow.stages.length === 0" class="flex items-center justify-center h-full">
            <div class="text-center space-y-3 max-w-md">
              <div
                class="w-20 h-20 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center mx-auto"
              >
                <svg
                  class="w-10 h-10 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    :stroke-width="1.5"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 class="text-xl font-semibold text-foreground">Start Building Your Workflow</h3>
              <p class="text-sm text-muted-foreground">
                Click "Add Stage" to create your first stage, then drag agents from the sidebar to
                build your workflow.
              </p>
            </div>
          </div>
          <Stage
            v-for="(stage, index) in workflow.stages"
            v-else
            :key="stage.id"
            :stage="stage"
            :stage-number="index + 1"
            :stage-index="index"
            :selected-node="selectedNode"
            :connecting-from="connectingFrom"
            :layout-id="layoutId"
            @select-node="selectNode"
            @add-agent="onAddAgent"
            @add-node="onAddNode"
            @delete-node="store.deleteNode"
            @delete-stage="store.deleteStage"
            @rename-stage="store.renameStage"
            @reorder-stages="store.reorderStages"
            @move-node-to-stage="store.moveNodeToStage"
            @toggle-minimize="store.toggleMinimize"
            @toggle-lock="store.toggleNodeLock"
            @port-click="handlePortClick"
            @run-agent="(id: string) => emit('run-node', id)"
            @run-function="(id: string) => emit('run-node', id)"
            @clone-stage="(id: string) => emit('run-stage', id)"
            @run-stage="(id: string) => emit('run-stage', id)"
            @request-add-agent="(id: string) => emit('request-add-agent', id)"
            @request-add-function="(id: string) => emit('request-add-function', id)"
          />
        </div>
      </Card>
    </div>
  </div>
</template>
