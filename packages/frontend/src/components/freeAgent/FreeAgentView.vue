<script setup lang="ts">
import { ref, watch, onMounted, provide } from 'vue';
import { ClipboardList, Package, FileCode, FileText } from '@lucide/vue';
import { useFreeAgentStore } from '@/stores/freeAgentStore';
import { useSecretsManager } from '@/composables/useSecretsManager';
import { useToolInstances } from '@/composables/useToolInstances';
import { usePromptCustomization } from '@/composables/usePromptCustomization';
import { buildPromptData } from '@/lib/systemPromptBuilder';
import type { SessionFile, AdvancedFeatures, ChildSession, FreeAgentArtifact, ToolsManifest } from '@agent-builder/shared';
import FreeAgentCanvas from './FreeAgentCanvas.vue';
import FreeAgentPanel from './FreeAgentPanel.vue';
import BlackboardViewer from './BlackboardViewer.vue';
import ArtifactsPanel from './ArtifactsPanel.vue';
import RawViewer from './RawViewer.vue';
import AssistanceModal from './AssistanceModal.vue';
import ArtifactViewerModal from './ArtifactViewerModal.vue';
import SystemPromptViewer from './SystemPromptViewer.vue';
import FinalReportModal from './FinalReportModal.vue';
import ChildAgentDetailModal from './ChildAgentDetailModal.vue';
import AttributeViewerModal from './AttributeViewerModal.vue';
import ScratchpadViewerModal from './ScratchpadViewerModal.vue';
import {
  OpenAttributeViewerKey,
  OpenScratchpadViewerKey,
  type AttributeViewerPayload,
  type ScratchpadViewerPayload,
} from './viewerInjectionKeys';

defineProps<{
  maxIterations?: number;
}>();

const store = useFreeAgentStore();
const secretsManager = useSecretsManager();
const toolInstancesManager = useToolInstances();
const promptCustomization = usePromptCustomization();
promptCustomization.setTemplateId('default');

const toolsManifest = ref<ToolsManifest | null>(null);
const assistanceModalOpen = ref(false);
const selectedChild = ref<ChildSession | null>(null);
const childModalOpen = ref(false);
const selectedArtifact = ref<FreeAgentArtifact | null>(null);
const artifactViewerOpen = ref(false);
const finalReportOpen = ref(false);
let finalReportShownForId: string | null = null;

// Canvas-internal viewer state (AttributeNode/ScratchpadNode reach up here
// via provide/inject — vue-flow's custom-node boundary blocks normal emits).
const attributeViewerOpen = ref(false);
const attributeViewerPayload = ref<AttributeViewerPayload>({ attributeName: '', attributeValue: '' });
const scratchpadViewerOpen = ref(false);
const scratchpadViewerPayload = ref<ScratchpadViewerPayload>({ content: '', label: '' });

provide(OpenAttributeViewerKey, (payload: AttributeViewerPayload) => {
  attributeViewerPayload.value = payload;
  attributeViewerOpen.value = true;
});
provide(OpenScratchpadViewerKey, (payload: ScratchpadViewerPayload) => {
  scratchpadViewerPayload.value = payload;
  scratchpadViewerOpen.value = true;
});
const pendingFiles = ref<SessionFile[]>([]);
const mobileTab = ref<'panel' | 'canvas' | 'data'>('panel');
const dataTab = ref<'blackboard' | 'artifacts' | 'raw' | 'prompt'>('blackboard');

onMounted(() => {
  fetch('/data/toolsManifest.json').then(r => r.json()).then(d => { toolsManifest.value = d; }).catch(console.error);
});

watch(
  () => [store.session?.status, (store.session as any)?.assistanceRequest],
  ([status, req]) => {
    if (status === 'needs_assistance' && req) {
      assistanceModalOpen.value = true;
    }
  }
);

// Auto-open FinalReportModal once per completed session.
watch(
  () => store.session?.finalReport,
  (report) => {
    const sessId = store.session?.id ?? null;
    if (report && sessId && finalReportShownForId !== sessId) {
      finalReportShownForId = sessId;
      finalReportOpen.value = true;
    }
  }
);

async function handleStart(
  prompt: string,
  files: SessionFile[],
  model: string,
  maxIter: number,
  existingSession: any,
  advancedFeatures: AdvancedFeatures,
) {
  const secretOverrides = secretsManager.getSecretOverrides();
  const configuredParams = secretsManager.getConfiguredToolParams();
  const promptData = await buildPromptData(promptCustomization);
  const toolInstances = toolInstancesManager.config.instances;

  const customizationsData = promptCustomization.customizations || {
    templateId: 'default', sectionOverrides: {}, disabledSections: [],
    additionalSections: [], orderOverrides: {}, toolOverrides: {},
  };

  const handlePromptCustomizationChange = () => {
    promptCustomization.loadFromStorage();
  };

  await store.startSession(
    prompt, files, model, maxIter, existingSession,
    secretOverrides, configuredParams, promptData, advancedFeatures,
    customizationsData, handlePromptCustomizationChange, toolInstances,
  );
}

function handleAssistanceResponse(response: { response?: string; fileId?: string; selectedChoice?: string }) {
  assistanceModalOpen.value = false;
  store.respondToAssistance(response);
}

function handleNodeClick(_nodeId: string, nodeType: string, data: any) {
  if (nodeType === 'childAgent' && data.childName) {
    const child = store.session?.orchestration?.children?.find((c: ChildSession) => c.name === data.childName);
    if (child) { selectedChild.value = child; childModalOpen.value = true; }
  }
  if (nodeType === 'artifact' && data.artifactId) {
    const artifact = store.session?.artifacts?.find((a: FreeAgentArtifact) => a.id === data.artifactId);
    if (artifact) { selectedArtifact.value = artifact; artifactViewerOpen.value = true; }
  }
}

function handleResetFromFinalReport() {
  finalReportOpen.value = false;
  store.resetSession();
}
</script>

<template>
  <div class="h-full w-full bg-background">

    <!-- Mobile Layout -->
    <div class="lg:hidden h-full flex flex-col">
      <div class="border-b border-border bg-card flex-shrink-0">
        <div class="flex">
          <button
            v-for="tab in [{ id: 'panel', label: 'Control' }, { id: 'canvas', label: 'Canvas' }, { id: 'data', label: 'Data' }]"
            :key="tab.id"
            class="flex-1 py-3 text-sm font-medium transition-colors"
            :class="mobileTab === tab.id ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'"
            @click="mobileTab = tab.id as any"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-hidden">
        <div v-if="mobileTab === 'panel'" class="h-full overflow-y-auto">
          <FreeAgentPanel
            :session="store.session"
            :is-running="store.isRunning"
            :cache-size="store.getCacheSize()"
            :secrets-manager="secretsManager"
            :tools-manifest="toolsManifest"
            :tool-instances-manager="toolInstancesManager"
            :pending-files="pendingFiles"
            @start="handleStart"
            @stop="store.stopSession"
            @reset="store.resetSession"
            @continue="store.continueSession"
            @retry="store.retrySession"
            @interject="store.interjectSession"
            @pending-files-change="pendingFiles = $event"
          />
        </div>
        <div v-else-if="mobileTab === 'canvas'" class="h-full">
          <FreeAgentCanvas
            :session="store.session"
            :tools-manifest="toolsManifest"
            :active-tool-ids="store.activeToolIds"
            :tool-instances="toolInstancesManager.config.instances"
            :pending-files="pendingFiles"
            :on-scratchpad-change="store.updateScratchpad"
            :on-retry="store.retrySession"
            @node-click="handleNodeClick"
          />
        </div>
        <div v-else class="h-full flex flex-col">
          <!-- Data tab bar -->
          <div class="flex border-b border-border flex-shrink-0 px-2">
            <button
              v-for="t in [
                { id: 'blackboard', icon: ClipboardList, label: 'Blackboard' },
                { id: 'artifacts', icon: Package, label: 'Artifacts' },
                { id: 'raw', icon: FileCode, label: 'Raw' },
                { id: 'prompt', icon: FileText, label: 'Prompt' },
              ]"
              :key="t.id"
              class="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px"
              :class="dataTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'"
              @click="dataTab = t.id as any"
            >
              <component :is="t.icon" class="w-4 h-4" />
              <span class="hidden min-[400px]:inline">{{ t.label }}</span>
            </button>
          </div>
          <div class="flex-1 overflow-hidden">
            <BlackboardViewer v-if="dataTab === 'blackboard'" :entries="store.session?.blackboard || []" />
            <ArtifactsPanel
              v-else-if="dataTab === 'artifacts'"
              :artifacts="store.session?.artifacts || []"
              @artifact-click="(a: FreeAgentArtifact) => { selectedArtifact = a; artifactViewerOpen = true; }"
            />
            <RawViewer v-else-if="dataTab === 'raw'" :raw-data="store.session?.rawData || []" />
            <SystemPromptViewer v-else :configured-params="secretsManager.getConfiguredToolParams()" />
          </div>
        </div>
      </div>
    </div>

    <!-- Desktop Layout (3-pane split) -->
    <div class="hidden lg:flex h-full">
      <!-- Left: Control panel (25%) -->
      <div class="w-1/4 min-w-[240px] max-w-[360px] flex-shrink-0 border-r border-border overflow-hidden flex flex-col">
        <FreeAgentPanel
          :session="store.session"
          :is-running="store.isRunning"
          :cache-size="store.getCacheSize()"
          :secrets-manager="secretsManager"
          :tools-manifest="toolsManifest"
          :tool-instances-manager="toolInstancesManager"
          :pending-files="pendingFiles"
          @start="handleStart"
          @stop="store.stopSession"
          @reset="store.resetSession"
          @continue="store.continueSession"
          @retry="store.retrySession"
          @interject="store.interjectSession"
          @pending-files-change="pendingFiles = $event"
        />
      </div>

      <!-- Resize handle (decorative) -->
      <div class="w-1 bg-border hover:bg-primary/30 cursor-col-resize flex-shrink-0" />

      <!-- Center: Canvas (50%) -->
      <div class="flex-1 min-w-0 bg-muted/20">
        <FreeAgentCanvas
          :session="store.session"
          :tools-manifest="toolsManifest"
          :active-tool-ids="store.activeToolIds"
          :tool-instances="toolInstancesManager.config.instances"
          :pending-files="pendingFiles"
          :on-scratchpad-change="store.updateScratchpad"
          :on-retry="store.retrySession"
          @node-click="handleNodeClick"
        />
      </div>

      <!-- Resize handle (decorative) -->
      <div class="w-1 bg-border hover:bg-primary/30 cursor-col-resize flex-shrink-0" />

      <!-- Right: Data viewers (25%) -->
      <div class="w-1/4 min-w-[220px] max-w-[360px] flex-shrink-0 border-l border-border flex flex-col">
        <!-- Tab bar -->
        <div class="flex border-b border-border flex-shrink-0 px-2">
          <button
            v-for="t in [
              { id: 'blackboard', icon: ClipboardList, label: 'Blackboard' },
              { id: 'artifacts', icon: Package, label: 'Artifacts' },
              { id: 'raw', icon: FileCode, label: 'Raw' },
              { id: 'prompt', icon: FileText, label: 'Prompt' },
            ]"
            :key="t.id"
            class="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px"
            :class="dataTab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
            @click="dataTab = t.id as any"
          >
            <component :is="t.icon" class="w-4 h-4 shrink-0" />
            <span class="hidden xl:inline text-xs truncate">{{ t.label }}</span>
          </button>
        </div>

        <div class="flex-1 overflow-hidden">
          <BlackboardViewer v-if="dataTab === 'blackboard'" :entries="store.session?.blackboard || []" />
          <ArtifactsPanel
            v-else-if="dataTab === 'artifacts'"
            :artifacts="store.session?.artifacts || []"
            @artifact-click="(a: FreeAgentArtifact) => { selectedArtifact = a; artifactViewerOpen = true; }"
          />
          <RawViewer v-else-if="dataTab === 'raw'" :raw-data="store.session?.rawData || []" />
          <SystemPromptViewer v-else :configured-params="secretsManager.getConfiguredToolParams()" />
        </div>
      </div>
    </div>

    <!-- Modals -->
    <AssistanceModal
      :open="assistanceModalOpen"
      :request="store.session?.assistanceRequest ?? null"
      @update:open="assistanceModalOpen = $event"
      @respond="handleAssistanceResponse"
    />

    <ArtifactViewerModal
      :artifact="selectedArtifact"
      :open="artifactViewerOpen"
      @update:open="artifactViewerOpen = $event"
    />

    <FinalReportModal
      :open="finalReportOpen"
      :report="store.session?.finalReport ?? null"
      :session="store.session ?? null"
      @update:open="finalReportOpen = $event"
      @reset="handleResetFromFinalReport"
    />

    <ChildAgentDetailModal
      :open="childModalOpen"
      :child="selectedChild"
      @update:open="(v: boolean) => { childModalOpen = v; if (!v) selectedChild = null; }"
    />

    <AttributeViewerModal
      :open="attributeViewerOpen"
      :attribute-name="attributeViewerPayload.attributeName"
      :attribute-value="attributeViewerPayload.attributeValue"
      :attribute-tool="attributeViewerPayload.attributeTool"
      :is-binary="attributeViewerPayload.isBinary"
      :mime-type="attributeViewerPayload.mimeType"
      @update:open="attributeViewerOpen = $event"
    />

    <ScratchpadViewerModal
      :open="scratchpadViewerOpen"
      :content="scratchpadViewerPayload.content"
      :label="scratchpadViewerPayload.label"
      @update:open="scratchpadViewerOpen = $event"
    />
  </div>
</template>
