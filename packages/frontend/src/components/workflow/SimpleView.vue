<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import {
  Download,
  Eye,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  Pause,
  Folder,
  File,
  Play,
  X,
  ChevronDown,
  ChevronRight,
} from '@lucide/vue';
// jszip is only used when the user clicks Download Stage / Download All;
// load it lazily so it stays out of the initial bundle.
import type JSZipType from 'jszip';
async function getJSZip() {
  const { default: JSZip } = await import('jszip');
  return JSZip;
}
import type { Workflow, WorkflowNode, Stage } from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Button from '../ui/Button.vue';

const props = defineProps<{
  workflow: Workflow;
}>();

const emit = defineEmits<{
  'run-agent': [agentId: string];
  'run-function': [functionId: string];
}>();

const isMobile = useMediaQuery('(max-width: 767px)');

interface ViewingOutput {
  nodeName: string;
  output: string;
}
const viewingOutput = ref<ViewingOutput | null>(null);
const outputTab = ref<'view' | 'raw'>('view');

const expandedNodes = ref<Set<string>>(new Set());
const scrollRefs = ref<Record<string, HTMLDivElement | null>>({});

function initDefaultExpanded() {
  const stageOne = props.workflow.stages.find(s => s.id === '1');
  if (stageOne && stageOne.nodes.length > 0) {
    const firstNodeWithOutput = stageOne.nodes.find(node => node.output);
    if (firstNodeWithOutput) expandedNodes.value.add(firstNodeWithOutput.id);
  }
}
initDefaultExpanded();

function toggleExpanded(nodeId: string) {
  if (expandedNodes.value.has(nodeId)) expandedNodes.value.delete(nodeId);
  else expandedNodes.value.add(nodeId);
}

watch(
  () => props.workflow,
  () => {
    nextTick(() => {
      props.workflow.stages.forEach(stage => {
        stage.nodes.forEach(node => {
          if (node.status === 'running' && expandedNodes.value.has(node.id)) {
            const el = scrollRefs.value[node.id];
            if (el) el.scrollTop = el.scrollHeight;
          }
        });
      });
    });
  },
  { deep: true }
);

function setScrollRef(nodeId: string, el: unknown) {
  scrollRefs.value[nodeId] = (el as HTMLDivElement) ?? null;
}

const nodesWithOutputs = computed(() => {
  const result: Array<{ stage: string; node: WorkflowNode }> = [];
  for (const stage of props.workflow.stages) {
    for (const node of stage.nodes) {
      if (node.output) result.push({ stage: stage.name, node });
    }
  }
  return result;
});
const hasOutputs = computed(() => nodesWithOutputs.value.length > 0);

function formatOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  return JSON.stringify(output, null, 2);
}
function getCharCount(output: string): number {
  return typeof output === 'string' ? output.length : JSON.stringify(output, null, 2).length;
}

function safeFileName(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '_');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadArtifact(nodeName: string, output: unknown) {
  const blob = new Blob([formatOutput(output)], { type: 'text/plain' });
  triggerDownload(blob, `${safeFileName(nodeName)}_${Date.now()}.txt`);
}

async function downloadStage(stageName: string) {
  const stage = props.workflow.stages.find(s => s.name === stageName);
  if (!stage) return;
  const JSZip = await getJSZip();
  const zip: JSZipType = new JSZip();
  const stageFolder = zip.folder(safeFileName(stageName));
  if (!stageFolder) return;
  let concatenated = '';
  for (const node of stage.nodes) {
    if (!node.output) continue;
    const content = formatOutput(node.output);
    stageFolder.file(`${safeFileName(node.name)}.txt`, content);
    concatenated += `\n\n=== ${node.name} ===\n\n${content}`;
  }
  if (concatenated) zip.file(`${safeFileName(stageName)}_all.txt`, concatenated.trim());
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${safeFileName(stageName)}_${Date.now()}.zip`);
}

async function downloadAll() {
  const JSZip = await getJSZip();
  const zip: JSZipType = new JSZip();
  let allOutputs = '';
  for (const stage of props.workflow.stages) {
    const stageFolder = zip.folder(safeFileName(stage.name));
    if (!stageFolder) continue;
    let stageConcatenated = '';
    for (const node of stage.nodes) {
      if (!node.output) continue;
      const content = formatOutput(node.output);
      stageFolder.file(`${safeFileName(node.name)}.txt`, content);
      stageConcatenated += `\n\n=== ${node.name} ===\n\n${content}`;
      allOutputs += `\n\n=== ${stage.name} > ${node.name} ===\n\n${content}`;
    }
    if (stageConcatenated) {
      stageFolder.file(`${safeFileName(stage.name)}_all.txt`, stageConcatenated.trim());
    }
  }
  if (allOutputs) zip.file(`all_outputs_${Date.now()}.txt`, allOutputs.trim());
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `workflow_outputs_${Date.now()}.zip`);
}

function getStageStatus(stage: Stage): 'idle' | 'running' | 'complete' | 'error' {
  if (stage.nodes.length === 0) return 'idle';
  if (stage.nodes.some(n => n.status === 'error')) return 'error';
  if (stage.nodes.some(n => n.status === 'running')) return 'running';
  const hasAnyComplete = stage.nodes.some(n => n.status === 'complete');
  const allCompleted = stage.nodes.every(n => n.status === 'complete' || n.status === 'idle');
  return hasAnyComplete && allCompleted ? 'complete' : 'idle';
}

const statusColors: Record<string, string> = {
  running: '!border-l-warning bg-warning/5',
  complete: '!border-l-success bg-success/5',
  error: '!border-l-destructive bg-destructive/5',
  paused: '!border-l-muted-foreground bg-muted/30',
  idle: '!border-l-border bg-muted/10',
};

function runNode(node: WorkflowNode) {
  if (node.nodeType === 'agent') emit('run-agent', node.id);
  else if (node.nodeType === 'function') emit('run-function', node.id);
}

function runStage(stage: Stage) {
  for (const node of stage.nodes) runNode(node);
}

function nodesWithOutputsForStage(stage: Stage) {
  return stage.nodes.filter(n => n.output);
}

function openOutput(node: WorkflowNode) {
  viewingOutput.value = { nodeName: node.name, output: formatOutput(node.output) };
  outputTab.value = 'view';
}

function closeOutput() {
  viewingOutput.value = null;
}
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Outputs list (plain overflow-auto stands in for shadcn ScrollArea) -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-4 space-y-4 max-w-5xl mx-auto">
        <div v-if="!hasOutputs && workflow.stages.length === 0" class="p-4 text-center">
          <p class="text-sm text-muted-foreground">Run your workflow to see outputs here</p>
        </div>

        <Card
          v-for="stage in workflow.stages"
          :key="stage.id"
          :class="['border-l-4 transition-all duration-300', statusColors[getStageStatus(stage)]]"
        >
          <div class="flex items-center justify-between p-3 sm:p-4 border-b border-border bg-muted/20">
            <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <Folder class="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-foreground text-sm sm:text-base truncate">
                  {{ stage.name }}
                </h3>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ stage.nodes.length }} node{{ stage.nodes.length === 1 ? '' : 's' }}
                  <template v-if="nodesWithOutputsForStage(stage).length > 0">
                    • {{ nodesWithOutputsForStage(stage).length }} output{{
                      nodesWithOutputsForStage(stage).length === 1 ? '' : 's'
                    }}
                  </template>
                </p>
              </div>
            </div>
            <div class="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Loader2
                v-if="getStageStatus(stage) === 'running'"
                class="h-4 w-4 animate-spin text-warning"
              />
              <CheckCircle2
                v-else-if="getStageStatus(stage) === 'complete'"
                class="h-4 w-4 text-success"
              />
              <FileText
                v-else-if="getStageStatus(stage) === 'error'"
                class="h-4 w-4 text-destructive"
              />
              <Clock v-else class="h-4 w-4 text-muted-foreground" />

              <Button
                v-if="nodesWithOutputsForStage(stage).length > 0"
                variant="ghost"
                size="sm"
                :class="[isMobile ? 'px-2' : '']"
                @click="downloadStage(stage.name)"
              >
                <Download class="h-4 w-4" />
                <span v-if="!isMobile" class="ml-2">Download</span>
              </Button>
              <Button
                v-if="stage.nodes.length > 0"
                variant="default"
                size="sm"
                :class="[isMobile ? 'px-2' : '']"
                :disabled="getStageStatus(stage) === 'running'"
                @click="runStage(stage)"
              >
                <Play class="h-4 w-4" />
                <span v-if="!isMobile" class="ml-2">Run Stage</span>
              </Button>
            </div>
          </div>

          <div v-if="nodesWithOutputsForStage(stage).length > 0" class="p-2">
            <!-- Accordion replacement: simple v-show toggle -->
            <div
              v-for="node in nodesWithOutputsForStage(stage)"
              :key="node.id"
              class="border-none"
            >
              <button
                class="rounded-md hover:bg-muted/50 transition-colors p-3 hover:no-underline group w-full"
                @click="toggleExpanded(node.id)"
              >
                <div class="flex items-center justify-between w-full pr-2">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    <File class="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div class="flex-1 min-w-0 text-left">
                      <p class="font-medium text-sm text-foreground truncate">{{ node.name }}</p>
                      <p class="text-xs text-muted-foreground">
                        {{ getCharCount(node.output!).toLocaleString() }} characters
                        <span v-if="node.status === 'running'" class="ml-2 text-warning animate-pulse">
                          • Streaming...
                        </span>
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      :disabled="node.status === 'running'"
                      @click.stop="runNode(node)"
                    >
                      <Play class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      @click.stop="openOutput(node)"
                    >
                      <Eye class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      @click.stop="downloadArtifact(node.name, node.output)"
                    >
                      <Download class="h-4 w-4" />
                    </Button>
                    <ChevronDown
                      v-if="expandedNodes.has(node.id)"
                      class="h-4 w-4 text-muted-foreground ml-2"
                    />
                    <ChevronRight v-else class="h-4 w-4 text-muted-foreground ml-2" />
                  </div>
                </div>
              </button>
              <div v-show="expandedNodes.has(node.id)" class="px-3 pb-3 pt-0">
                <div class="p-3 bg-muted/30 rounded-md border border-border">
                  <div
                    :ref="el => setScrollRef(node.id, el)"
                    class="overflow-y-auto max-h-[400px] pr-2"
                  >
                    <pre class="text-xs text-foreground whitespace-pre-wrap font-mono">{{ formatOutput(node.output) }}</pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="nodesWithOutputsForStage(stage).length === 0 && stage.nodes.length > 0"
            class="p-4 text-center"
          >
            <p class="text-sm text-muted-foreground">
              {{ getStageStatus(stage) === 'running' ? 'Processing...' : 'Waiting for outputs...' }}
            </p>
          </div>
        </Card>

        <div v-if="hasOutputs" class="flex justify-center pt-4">
          <Button size="lg" class="gap-2" @click="downloadAll">
            <Download class="h-4 w-4" />
            Download All Outputs
          </Button>
        </div>
      </div>
    </div>

    <!-- View output modal (plain fixed overlay — swap in shadcn Dialog when available) -->
    <div
      v-if="viewingOutput"
      class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      @click.self="closeOutput"
    >
      <div class="bg-background border rounded-lg w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] flex flex-col p-6 shadow-xl">
        <div class="pb-4 flex items-start justify-between">
          <div>
            <h2 class="text-lg font-semibold">{{ viewingOutput.nodeName }}</h2>
            <p class="text-sm text-muted-foreground">View the output content</p>
          </div>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="closeOutput">
            <X class="h-4 w-4" />
          </Button>
        </div>
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Tabs replacement: simple button switcher -->
          <div class="flex gap-2 mb-4">
            <button
              :class="[
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                outputTab === 'view'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/80',
              ]"
              @click="outputTab = 'view'"
            >
              View
            </button>
            <button
              :class="[
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                outputTab === 'raw'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/80',
              ]"
              @click="outputTab = 'raw'"
            >
              Raw
            </button>
          </div>
          <div v-if="outputTab === 'view'" class="flex-1 overflow-auto">
            <!-- Markdown rendering deferred — swap in vue-markdown-render once it's a dep -->
            <div class="prose prose-sm dark:prose-invert max-w-none p-4">
              <pre class="whitespace-pre-wrap font-mono text-sm">{{ viewingOutput.output }}</pre>
            </div>
          </div>
          <div v-else class="flex-1 overflow-auto">
            <pre class="text-xs text-foreground whitespace-pre-wrap font-mono p-4 bg-muted/30 rounded-lg">{{ viewingOutput.output }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
