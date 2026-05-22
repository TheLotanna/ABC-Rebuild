<script setup lang="ts">
import { computed, ref } from 'vue';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useWorkflowRunner } from '@/composables/useWorkflowRunner';
import { toast } from 'vue-sonner';

import AppLayout from '@/components/layout/AppLayout.vue';
import Toolbar from '@/components/toolbar/Toolbar.vue';
import Sidebar from '@/components/sidebar/Sidebar.vue';
import PropertiesPanel from '@/components/properties/PropertiesPanel.vue';
import OutputLog from '@/components/output/OutputLog.vue';
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue';
import WorkflowCanvasMode from '@/components/workflow/WorkflowCanvasMode.vue';
import SimpleView from '@/components/workflow/SimpleView.vue';
import AgentSelector from '@/components/workflow/AgentSelector.vue';
import FunctionSelector from '@/components/workflow/FunctionSelector.vue';
import FreeAgentView from '@/components/freeAgent/FreeAgentView.vue';

const store = useWorkflowStore();
const runner = useWorkflowRunner();

// Mobile tab for responsive layout
const mobileTab = ref<'library' | 'workflow' | 'properties'>('workflow');

// Selector modal state — set to a stageId when the user clicks the inline
// "+ Agent" / "+ Function" buttons on a Stage. Null when modals are closed.
const agentSelectorStageId = ref<string | null>(null);
const functionSelectorStageId = ref<string | null>(null);

function openAgentSelector(stageId: string) { agentSelectorStageId.value = stageId; }
function openFunctionSelector(stageId: string) { functionSelectorStageId.value = stageId; }
function handleAgentSelected(template: any) {
  if (agentSelectorStageId.value) {
    store.addNode(agentSelectorStageId.value, template, 'agent');
  }
  agentSelectorStageId.value = null;
}
function handleFunctionSelected(def: any) {
  if (functionSelectorStageId.value) {
    store.addNode(functionSelectorStageId.value, def, 'function');
  }
  functionSelectorStageId.value = null;
}

// Derived state
const selectedNodeData = computed(() =>
  store.allNodes.find(n => n.id === store.selectedNode) ?? null,
);
const selectedAgent = computed(() =>
  selectedNodeData.value?.nodeType === 'agent'
    ? (selectedNodeData.value as any)
    : null,
);
const customAgents = ref<any[]>([]);

// ---- Workflow CRUD ----

function saveWorkflow() {
  const saveData = {
    workflow: store.workflow,
    userInput: store.userInput,
    workflowName: store.workflowName,
    customAgents: customAgents.value,
    selectedModel: store.selectedModel,
    responseLength: store.responseLength,
    thinkingEnabled: store.thinkingEnabled,
    thinkingBudget: store.thinkingBudget,
  };
  const json = JSON.stringify(saveData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = store.workflowName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download =
    store.workflowName !== 'Untitled Workflow'
      ? `${safeName}-${Date.now()}.json`
      : `workflow-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Workflow saved');
}

function loadWorkflowFromFile(file: File) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      const wf = parsed.workflow ?? parsed;
      store.loadWorkflow(wf, parsed.workflowName);

      if (parsed.userInput !== undefined) store.userInput = parsed.userInput;
      if (parsed.selectedModel) store.selectedModel = parsed.selectedModel;
      if (parsed.responseLength) store.responseLength = parsed.responseLength;
      if (parsed.thinkingEnabled !== undefined) store.thinkingEnabled = parsed.thinkingEnabled;
      if (parsed.thinkingBudget !== undefined) store.thinkingBudget = parsed.thinkingBudget;
      if (parsed.customAgents) customAgents.value = parsed.customAgents;

      toast('Workflow loaded');
    } catch {
      toast.error('Failed to load workflow: invalid JSON');
    }
  };
  reader.readAsText(file);
}

function clearWorkflow() {
  store.clearWorkflow();
  toast('Workflow cleared');
}

function clearWorkflowOutputs() {
  store.clearWorkflowOutputs();
  toast('Outputs cleared');
}

// ---- Node tool instances (delegated to store) ----

function addToolInstance(nodeId: string, toolId: string) {
  const node = store.allNodes.find(n => n.id === nodeId);
  if (!node || node.nodeType !== 'agent') return;
  const current = (node as any).tools ?? [];
  store.updateNode(nodeId, {
    tools: [...current, { id: `tool-${Date.now()}`, toolId, config: {} }],
  } as any);
}

function updateToolInstance(nodeId: string, toolInstanceId: string, config: any) {
  const node = store.allNodes.find(n => n.id === nodeId);
  if (!node || node.nodeType !== 'agent') return;
  store.updateNode(nodeId, {
    tools: (node as any).tools.map((t: any) =>
      t.id === toolInstanceId ? { ...t, config } : t,
    ),
  } as any);
}

function removeToolInstance(nodeId: string, toolInstanceId: string) {
  const node = store.allNodes.find(n => n.id === nodeId);
  if (!node || node.nodeType !== 'agent') return;
  store.updateNode(nodeId, {
    tools: (node as any).tools.filter((t: any) => t.id !== toolInstanceId),
  } as any);
}

function addAgentToLibrary(agent: any) {
  customAgents.value = [
    ...customAgents.value,
    {
      id: `custom-${Date.now()}`,
      name: agent.name,
      description: `Custom agent: ${agent.name}`,
      icon: agent.type || 'Bot',
      defaultSystemPrompt: agent.systemPrompt,
      defaultUserPrompt: agent.userPrompt,
      isCustom: true,
    },
  ];
  store.addLog('success', `Agent "${agent.name}" added to library`);
}
</script>

<template>
  <div class="flex flex-col h-screen bg-background overflow-hidden">

    <Toolbar
      :app-mode="store.appMode"
      :view-mode="store.currentViewMode"
      @add-stage="store.addStage()"
      @save="saveWorkflow"
      @load="loadWorkflowFromFile"
      @clear="clearWorkflow"
      @clear-outputs="clearWorkflowOutputs"
      @run="runner.runWorkflow()"
      @set-view-mode="store.setViewMode"
      @set-app-mode="v => (store.appMode = v)"
    />

    <!-- Free Agent mode -->
    <template v-if="store.appMode === 'freeAgent'">
      <div class="flex-1 overflow-hidden flex flex-col">
        <!-- Mobile mode switcher -->
        <div class="lg:hidden h-14 border-b border-border bg-card flex items-center gap-2 px-4">
          <div class="flex items-center bg-muted rounded-lg p-1">
            <button
              class="gap-1.5 rounded-md transition-colors px-2 h-8 text-xs flex items-center text-muted-foreground"
              @click="store.appMode = 'workflow'"
            >
              ← Workflow
            </button>
            <button class="gap-1.5 rounded-md transition-colors px-2 h-8 text-xs bg-background shadow-sm flex items-center">
              Free Agent
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-hidden">
          <FreeAgentView :max-iterations="50" />
        </div>
      </div>
    </template>

    <!-- Workflow mode -->
    <template v-else>
      <div class="flex-1 flex flex-col overflow-hidden">

        <!-- Mobile layout -->
        <div class="lg:hidden flex flex-col flex-1 overflow-hidden">
          <AppLayout
            :active-tab="mobileTab"
            :has-selected-agent="!!selectedNodeData"
            :view-mode="store.currentViewMode"
            :app-mode="store.appMode"
            @tab-change="v => (mobileTab = v)"
            @add-stage="store.addStage()"
            @save="saveWorkflow"
            @load="loadWorkflowFromFile"
            @clear="clearWorkflow"
            @clear-outputs="clearWorkflowOutputs"
            @run="runner.runWorkflow()"
            @toggle-view-mode="store.toggleViewMode()"
            @set-app-mode="v => (store.appMode = v)"
          >
            <!-- Library tab -->
            <div
              :class="['h-full overflow-y-auto', mobileTab !== 'library' && 'hidden']"
            >
              <Sidebar
                :workflow="store.workflow"
                :user-input="store.userInput"
                :workflow-name="store.workflowName"
                :custom-agents="customAgents"
                :selected-model="store.selectedModel"
                :response-length="store.responseLength"
                :thinking-enabled="store.thinkingEnabled"
                :thinking-budget="store.thinkingBudget"
                @add-agent="(t: any) => store.addNode(store.workflow.stages[0]?.id ?? '', t, 'agent')"
                @add-node="(sid: string, t: any, nt?: any) => store.addNode(sid, t, nt)"
                @update:userInput="v => (store.userInput = v)"
                @update:workflowName="v => (store.workflowName = v)"
                @update:customAgents="v => (customAgents = v)"
                @update:selectedModel="v => (store.selectedModel = v)"
                @update:responseLength="v => (store.responseLength = v)"
                @update:thinkingEnabled="store.setThinkingEnabled"
                @update:thinkingBudget="v => (store.thinkingBudget = v)"
              />
            </div>

            <!-- Workflow canvas tab -->
            <div
              :class="['h-full overflow-hidden', mobileTab !== 'workflow' && 'hidden']"
            >
              <SimpleView
                v-if="store.currentViewMode === 'simple'"
                :workflow="store.workflow"
                @run-agent="runner.runSingleAgent"
                @run-function="runner.runSingleFunction"
              />
              <WorkflowCanvasMode
                v-else-if="store.currentViewMode === 'canvas'"
                :workflow="store.workflow"
                :selected-node="selectedNodeData"
                :is-connecting="!!store.connectingFrom"
                :custom-agents="customAgents"
                @select-node="v => (store.selectedNode = v)"
                @add-stage="store.addStage()"
                @delete-stage="store.deleteStage"
                @rename-stage="store.renameStage"
                @reorder-stages="store.reorderStages"
                @add-agent="(sid: string, t: any) => store.addNode(sid, t, 'agent')"
                @add-function="(sid: string, t: any) => store.addNode(sid, t, 'function')"
                @delete-node="store.deleteNode"
                @run-agent="runner.runSingleAgent"
                @start-connection="(id: string, p?: string) => { store.connectingFrom = id; store.connectingFromPort = p; }"
                @port-click="(id: string, p: string) => { if (store.connectingFrom) { store.addConnection({ id: `conn-${Date.now()}`, fromNodeId: store.connectingFrom, toNodeId: id, fromOutputPort: store.connectingFromPort }); store.connectingFrom = null; store.connectingFromPort = undefined; } else { store.connectingFrom = id; store.connectingFromPort = p; } }"
                @complete-connection="(from: string, to: string, p?: string) => { store.addConnection({ id: `conn-${Date.now()}`, fromNodeId: from, toNodeId: to, fromOutputPort: p }); store.connectingFrom = null; store.connectingFromPort = undefined; }"
                @delete-connection="store.removeConnection"
                @update-node="(id: string, u: any) => store.updateNode(id, u)"
                @update-stage-position="store.updateStagePosition"
                @update-node-position="store.updateNodePosition"
                @move-node-to-stage="store.moveNodeToStage"
                @toggle-view-mode="store.toggleViewMode()"
                @auto-layout-vertical="() => {}"
                @auto-layout-horizontal="() => {}"
                @auto-layout-grid="() => {}"
                @add-note="store.addNote"
                @update-note="(id: string, u: any) => store.updateNote(id, u)"
                @delete-note="store.deleteNote"
                @clone-node="() => {}"
                @clone-stage="() => {}"
                @run-stage="runner.runStage"
              />
              <WorkflowCanvas
                v-else
                layout-id="mobile"
                :custom-agents="customAgents"
                @run-node="runner.runSingleAgent"
                @run-stage="runner.runStage"
                @start-connection="(id: string, p?: string) => { store.connectingFrom = id; store.connectingFromPort = p; }"
                @complete-connection="(from: string, to: string, p?: string) => { store.addConnection({ id: `conn-${Date.now()}`, fromNodeId: from, toNodeId: to, fromOutputPort: p }); store.connectingFrom = null; store.connectingFromPort = undefined; }"
                @request-add-agent="openAgentSelector"
                @request-add-function="openFunctionSelector"
              />
            </div>

            <!-- Properties tab -->
            <div
              :class="['h-full overflow-y-auto', mobileTab !== 'properties' && 'hidden']"
            >
              <PropertiesPanel
                :selected-node="selectedNodeData"
                :selected-agent="selectedAgent"
                :workflow="store.workflow"
                @update-agent="(id: string, u: any) => store.updateNode(id, u)"
                @update-node="(id: string, u: any) => store.updateNode(id, u)"
                @add-tool-instance="addToolInstance"
                @update-tool-instance="updateToolInstance"
                @remove-tool-instance="removeToolInstance"
                @deselect-agent="() => (store.selectedNode = null)"
                @run-agent="runner.runSingleAgent"
                @run-function="runner.runSingleFunction"
                @run-downstream="runner.runDownstream"
                @clone-node="() => {}"
                @add-to-library="addAgentToLibrary"
              />
            </div>
          </AppLayout>
        </div>

        <!-- Desktop layout -->
        <div class="hidden lg:flex flex-1 overflow-hidden">
          <!-- Left sidebar -->
          <div
            class="w-64 border-r border-border overflow-y-auto flex-shrink-0"
            style="min-width: 220px; max-width: 360px"
          >
            <Sidebar
              :workflow="store.workflow"
              :user-input="store.userInput"
              :workflow-name="store.workflowName"
              :custom-agents="customAgents"
              :selected-model="store.selectedModel"
              :response-length="store.responseLength"
              :thinking-enabled="store.thinkingEnabled"
              :thinking-budget="store.thinkingBudget"
              @add-agent="(t: any) => store.addNode(store.workflow.stages[0]?.id ?? '', t, 'agent')"
              @add-node="(sid: string, t: any, nt?: any) => store.addNode(sid, t, nt)"
              @update:userInput="v => (store.userInput = v)"
              @update:workflowName="v => (store.workflowName = v)"
              @update:customAgents="v => (customAgents = v)"
              @update:selectedModel="v => (store.selectedModel = v)"
              @update:responseLength="v => (store.responseLength = v)"
              @update:thinkingEnabled="store.setThinkingEnabled"
              @update:thinkingBudget="v => (store.thinkingBudget = v)"
            />
          </div>

          <!-- Canvas -->
          <div class="flex-1 flex flex-col overflow-hidden">
            <SimpleView
              v-if="store.currentViewMode === 'simple'"
              :workflow="store.workflow"
              :user-input="store.userInput"
              @update:userInput="v => (store.userInput = v)"
              @run-agent="runner.runSingleAgent"
              @run-function="runner.runSingleFunction"
            />
            <WorkflowCanvasMode
              v-else-if="store.currentViewMode === 'canvas'"
              :workflow="store.workflow"
              :selected-node="selectedNodeData"
              :is-connecting="!!store.connectingFrom"
              :custom-agents="customAgents"
              @select-node="v => (store.selectedNode = v)"
              @add-stage="store.addStage()"
              @delete-stage="store.deleteStage"
              @rename-stage="store.renameStage"
              @reorder-stages="store.reorderStages"
              @add-agent="(sid: string, t: any) => store.addNode(sid, t, 'agent')"
              @add-function="(sid: string, t: any) => store.addNode(sid, t, 'function')"
              @delete-node="store.deleteNode"
              @run-agent="runner.runSingleAgent"
              @start-connection="(id: string, p?: string) => { store.connectingFrom = id; store.connectingFromPort = p; }"
              @port-click="(id: string, p: string) => { if (store.connectingFrom) { store.addConnection({ id: `conn-${Date.now()}`, fromNodeId: store.connectingFrom, toNodeId: id, fromOutputPort: store.connectingFromPort }); store.connectingFrom = null; store.connectingFromPort = undefined; } else { store.connectingFrom = id; store.connectingFromPort = p; } }"
              @complete-connection="(from: string, to: string, p?: string) => { store.addConnection({ id: `conn-${Date.now()}`, fromNodeId: from, toNodeId: to, fromOutputPort: p }); store.connectingFrom = null; store.connectingFromPort = undefined; }"
              @delete-connection="store.removeConnection"
              @update-node="(id: string, u: any) => store.updateNode(id, u)"
              @update-stage-position="store.updateStagePosition"
              @update-node-position="store.updateNodePosition"
              @move-node-to-stage="store.moveNodeToStage"
              @toggle-view-mode="store.toggleViewMode()"
              @auto-layout-vertical="() => {}"
              @auto-layout-horizontal="() => {}"
              @auto-layout-grid="() => {}"
              @add-note="store.addNote"
              @update-note="(id: string, u: any) => store.updateNote(id, u)"
              @delete-note="store.deleteNote"
              @clone-node="() => {}"
              @clone-stage="() => {}"
              @run-stage="runner.runStage"
            />
            <WorkflowCanvas
              v-else
              layout-id="desktop"
              :custom-agents="customAgents"
              @run-node="runner.runSingleAgent"
              @run-stage="runner.runStage"
              @start-connection="(id: string, p?: string) => { store.connectingFrom = id; store.connectingFromPort = p; }"
              @complete-connection="(from: string, to: string, p?: string) => { store.addConnection({ id: `conn-${Date.now()}`, fromNodeId: from, toNodeId: to, fromOutputPort: p }); store.connectingFrom = null; store.connectingFromPort = undefined; }"
              @request-add-agent="(sid: string) => store.addNode(sid, { id: 'assistant', name: 'Agent' }, 'agent')"
              @request-add-function="(sid: string) => store.addNode(sid, { id: 'content', name: 'Content' }, 'function')"
            />

            <OutputLog :logs="store.logs" />
          </div>

          <!-- Right properties panel -->
          <div
            class="w-64 border-l border-border overflow-y-auto flex-shrink-0"
            style="min-width: 220px; max-width: 360px"
          >
            <PropertiesPanel
              :selected-node="selectedNodeData"
              :selected-agent="selectedAgent"
              :workflow="store.workflow"
              @update-agent="(id: string, u: any) => store.updateNode(id, u)"
              @update-node="(id: string, u: any) => store.updateNode(id, u)"
              @add-tool-instance="addToolInstance"
              @update-tool-instance="updateToolInstance"
              @remove-tool-instance="removeToolInstance"
              @deselect-agent="() => (store.selectedNode = null)"
              @run-agent="runner.runSingleAgent"
              @run-function="runner.runSingleFunction"
              @run-downstream="runner.runDownstream"
              @clone-node="() => {}"
              @add-to-library="addAgentToLibrary"
            />
          </div>
        </div>

      </div>
    </template>

    <!-- Workflow stage add-pickers (triggered by Stage.vue's inline mobile buttons) -->
    <AgentSelector
      :open="agentSelectorStageId !== null"
      :custom-agents="customAgents"
      @update:open="(v: boolean) => { if (!v) agentSelectorStageId = null; }"
      @select-agent="handleAgentSelected"
    />
    <FunctionSelector
      :open="functionSelectorStageId !== null"
      @update:open="(v: boolean) => { if (!v) functionSelectorStageId = null; }"
      @select-function="handleFunctionSelected"
    />

  </div>
</template>
