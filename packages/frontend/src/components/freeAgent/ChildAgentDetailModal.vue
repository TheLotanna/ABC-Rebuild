<script setup lang="ts">
// Vue 3 port of src/components/freeAgent/ChildAgentDetailModal.tsx (498 lines).
// View individual child-agent execution details across 7 tabs: task, blackboard,
// tools, scratchpad, attributes, artifacts, raw.

import { ref, computed } from 'vue';
import {
  GitBranch,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  Wrench,
  MessageSquare,
  Database,
  FileOutput,
  Code,
  Copy,
  Eye,
  Image as ImageIcon,
  Volume2,
  X as XIcon,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { ChildSession, ToolResultAttribute } from '@agent-builder/shared';
import {
  isBinaryTool,
  looksLikeBinaryContent,
  detectBinaryContent,
} from '@/lib/binaryToolUtils';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';
import RawViewer from './RawViewer.vue';
import AttributeViewerModal from './AttributeViewerModal.vue';

type TabKey =
  | 'task'
  | 'blackboard'
  | 'tools'
  | 'scratchpad'
  | 'attributes'
  | 'artifacts'
  | 'raw';

const props = defineProps<{
  open: boolean;
  child: ChildSession | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const activeTab = ref<TabKey>('task');

const viewingAttribute = ref<{ name: string; attr: ToolResultAttribute } | null>(null);
const isAttributeViewerOpen = ref(false);

function openAttributeViewer(name: string, attr: ToolResultAttribute) {
  viewingAttribute.value = { name, attr };
  isAttributeViewerOpen.value = true;
}

function onAttributeViewerOpen(v: boolean) {
  isAttributeViewerOpen.value = v;
  if (!v) viewingAttribute.value = null;
}

function close() {
  emit('update:open', false);
}

function onBackdropClick(ev: MouseEvent) {
  if (ev.target === ev.currentTarget) close();
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleTimeString();
}

const statusLabel = computed(() => {
  if (!props.child) return '';
  switch (props.child.status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'error':
      return 'Error';
    case 'paused':
      return 'Paused';
    default:
      return 'Idle';
  }
});

const statusBadgeClass = computed(() => {
  if (!props.child) return '';
  switch (props.child.status) {
    case 'running':
      return 'bg-amber-500 text-white';
    case 'completed':
      return 'bg-green-500 text-white';
    case 'error':
      return 'bg-destructive text-destructive-foreground';
    case 'paused':
      return 'bg-orange-500 text-white';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
});

// Helper: image src from artifact content
function getImageSrc(content: string): string | null {
  if (content.startsWith('data:image/')) return content;
  try {
    const parsed = JSON.parse(content);
    return parsed.imageUrl || parsed.url || null;
  } catch {
    if (
      /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 100)) &&
      content.length > 100
    ) {
      return `data:image/png;base64,${content}`;
    }
    return null;
  }
}

// Helper: audio src from artifact content
function getAudioSrc(content: string): string | null {
  if (content.startsWith('data:audio/')) return content;
  try {
    const parsed = JSON.parse(content);
    const audioData = parsed.audioContent || parsed.audioData;
    if (audioData) {
      const mimeType = parsed.contentType || parsed.mimeType || 'audio/mpeg';
      if (audioData.startsWith('data:')) return audioData;
      return `data:${mimeType};base64,${audioData}`;
    }
    return null;
  } catch {
    return null;
  }
}

// Helper: format tool result for display, recognising binary content.
function formatToolResult(
  tool: string,
  result: unknown,
): { isBinary: boolean; display: string } {
  if (isBinaryTool(tool)) {
    const info = detectBinaryContent(tool, result);
    if (info.isBinary) {
      return { isBinary: true, display: info.summary };
    }
  }
  if (looksLikeBinaryContent(result)) {
    const obj = result as Record<string, unknown>;
    if (obj._binaryContent) {
      return {
        isBinary: true,
        display: (obj.summary as string) || '[Binary content]',
      };
    }
    return { isBinary: true, display: '[Binary content - data URL]' };
  }
  return {
    isBinary: false,
    display:
      typeof result === 'string' ? result : JSON.stringify(result, null, 2),
  };
}

function copySessionJson() {
  if (!props.child) return;
  const json = JSON.stringify(props.child, null, 2);
  navigator.clipboard.writeText(json);
  toast.success('Session JSON copied to clipboard');
}

const blackboardCount = computed(() => props.child?.blackboard.length ?? 0);
const toolCallsCount = computed(() => props.child?.toolCalls.length ?? 0);
const attributesCount = computed(
  () => Object.keys(props.child?.toolResultAttributes || {}).length,
);
const artifactsCount = computed(() => props.child?.artifacts?.length ?? 0);
const rawCount = computed(() => props.child?.rawData?.length ?? 0);
</script>

<template>
  <div
    v-if="open && child"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    @click="onBackdropClick"
  >
    <div
      class="w-full max-w-4xl h-[calc(100vh-100px)] bg-background border border-border rounded-lg shadow-xl flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <!-- Header -->
      <div class="px-6 pt-6 pb-4 border-b border-border">
        <div class="flex items-center gap-3 flex-wrap">
          <GitBranch class="w-5 h-5 text-amber-500" />
          <h2 class="text-lg font-semibold flex-1 min-w-0 truncate">
            {{ child.name }}
          </h2>
          <span
            :class="[
              'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
              statusBadgeClass,
            ]"
          >
            <Loader2 v-if="child.status === 'running'" class="w-3 h-3 animate-spin" />
            <CheckCircle v-else-if="child.status === 'completed'" class="w-3 h-3" />
            <XCircle v-else-if="child.status === 'error'" class="w-3 h-3" />
            {{ statusLabel }}
          </span>
          <Button variant="outline" size="sm" class="gap-1.5" @click="copySessionJson">
            <Copy class="w-4 h-4" />
            Copy Session JSON
          </Button>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
            @click="close"
          >
            <XIcon class="w-5 h-5" />
          </button>
        </div>
        <div class="flex items-center gap-4 text-sm text-muted-foreground mt-2 flex-wrap">
          <span class="flex items-center gap-1">
            <Clock class="w-4 h-4" />
            Started: {{ formatTimestamp(child.startTime) }}
          </span>
          <span v-if="child.endTime">Ended: {{ formatTimestamp(child.endTime) }}</span>
          <span>Iterations: {{ child.currentIteration }}/{{ child.maxIterations }}</span>
        </div>
      </div>

      <!-- Tab list (inline 7-button row, matches the existing modal pattern) -->
      <div class="px-6 mt-4 overflow-x-auto">
        <div class="inline-flex gap-1 min-w-max bg-muted/40 rounded-md p-1">
          <button
            v-for="tab in [
              { key: 'task', label: 'Task', icon: MessageSquare, count: null },
              { key: 'blackboard', label: 'Blackboard', icon: FileText, count: blackboardCount },
              { key: 'tools', label: 'Tool Calls', icon: Wrench, count: toolCallsCount },
              { key: 'scratchpad', label: 'Scratchpad', icon: FileText, count: null },
              { key: 'attributes', label: 'Attributes', icon: Database, count: attributesCount },
              { key: 'artifacts', label: 'Artifacts', icon: FileOutput, count: artifactsCount },
              { key: 'raw', label: 'Raw', icon: Code, count: rawCount },
            ]"
            :key="tab.key"
            type="button"
            :class="[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
              activeTab === tab.key
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            ]"
            @click="activeTab = tab.key as TabKey"
          >
            <component :is="tab.icon" class="w-4 h-4" />
            {{ tab.label }}<template v-if="tab.count !== null"> ({{ tab.count }})</template>
          </button>
        </div>
      </div>

      <!-- Tab body -->
      <div class="flex-1 overflow-hidden px-6 pb-6">
        <!-- Task -->
        <div v-show="activeTab === 'task'" class="h-full mt-4 overflow-auto">
          <div class="space-y-4">
            <div>
              <h3 class="font-semibold mb-2">Assigned Task</h3>
              <div class="p-4 bg-muted rounded-lg overflow-hidden">
                <p
                  class="whitespace-pre-wrap break-words"
                  style="overflow-wrap: anywhere"
                >{{ child.task }}</p>
              </div>
            </div>

            <div v-if="child.error">
              <h3 class="font-semibold text-destructive mb-2">Error</h3>
              <div class="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p class="text-destructive whitespace-pre-wrap">{{ child.error }}</p>
              </div>
            </div>

            <div v-if="child.promptModifications.length > 0">
              <h3 class="font-semibold mb-2">Prompt Modifications</h3>
              <div class="space-y-2">
                <div
                  v-for="(mod, idx) in child.promptModifications"
                  :key="idx"
                  class="p-3 bg-muted rounded text-sm overflow-hidden"
                >
                  <Badge variant="outline" class="mb-1">{{ mod.type }}</Badge>
                  <span v-if="mod.sectionId" class="text-muted-foreground ml-2">
                    Section: {{ mod.sectionId }}
                  </span>
                  <p
                    v-if="mod.content"
                    class="mt-2 text-muted-foreground whitespace-pre-wrap break-words"
                    style="overflow-wrap: anywhere"
                  >{{ mod.content }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Blackboard -->
        <div v-show="activeTab === 'blackboard'" class="h-full mt-4 overflow-auto">
          <div v-if="child.blackboard.length === 0" class="text-center text-muted-foreground py-8">
            No blackboard entries yet
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(entry, idx) in child.blackboard"
              :key="entry.id || idx"
              class="p-3 border border-border rounded-lg"
            >
              <div class="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="outline">{{ entry.category }}</Badge>
                <span
                  v-if="entry.tools && entry.tools.length > 0"
                  class="text-xs text-amber-500"
                >Tools: [{{ entry.tools.join(', ') }}]</span>
                <span class="text-xs text-muted-foreground">
                  Iteration {{ entry.iteration }} • {{ formatTimestamp(entry.timestamp) }}
                </span>
              </div>
              <p class="text-sm whitespace-pre-wrap">{{ entry.content }}</p>
            </div>
          </div>
        </div>

        <!-- Tool Calls -->
        <div v-show="activeTab === 'tools'" class="h-full mt-4 overflow-auto">
          <div v-if="child.toolCalls.length === 0" class="text-center text-muted-foreground py-8">
            No tool calls executed yet
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(tc, idx) in child.toolCalls"
              :key="tc.id || idx"
              class="p-3 border border-border rounded-lg"
            >
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <Wrench class="w-4 h-4 text-muted-foreground" />
                  <span class="font-medium">{{ tc.tool }}</span>
                  <Badge
                    :variant="tc.status === 'error' ? 'destructive' : 'default'"
                    :class="tc.status === 'completed' ? 'bg-green-500 text-white' : ''"
                  >
                    {{ tc.status }}
                  </Badge>
                  <Badge
                    v-if="isBinaryTool(tc.tool) || (tc.result && formatToolResult(tc.tool, tc.result).isBinary)"
                    variant="outline"
                    class="bg-purple-500/10 text-purple-500 border-purple-500/30"
                  >
                    <ImageIcon v-if="tc.tool.includes('image')" class="w-3 h-3 mr-1" />
                    <Volume2 v-else class="w-3 h-3 mr-1" />
                    BINARY
                  </Badge>
                </div>
                <span class="text-xs text-muted-foreground">Iteration {{ tc.iteration }}</span>
              </div>

              <div class="text-sm space-y-2">
                <div>
                  <span class="text-muted-foreground">Parameters:</span>
                  <pre class="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">{{ JSON.stringify(tc.params, null, 2) }}</pre>
                </div>

                <template v-if="tc.result">
                  <div>
                    <span class="text-muted-foreground">Result:</span>
                    <div
                      v-if="formatToolResult(tc.tool, tc.result).isBinary"
                      class="mt-1 p-2 bg-purple-500/10 border border-purple-500/20 rounded text-xs"
                    >
                      <span class="text-purple-400">{{ formatToolResult(tc.tool, tc.result).display }}</span>
                    </div>
                    <pre
                      v-else
                      class="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap break-words"
                      style="overflow-wrap: anywhere"
                    >{{ formatToolResult(tc.tool, tc.result).display }}</pre>
                  </div>
                </template>

                <div v-if="tc.error" class="text-destructive">
                  <span>Error:</span>
                  <p class="mt-1">{{ tc.error }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Scratchpad -->
        <div v-show="activeTab === 'scratchpad'" class="h-full mt-4 overflow-auto">
          <div v-if="!child.scratchpad" class="text-center text-muted-foreground py-8">
            No scratchpad content
          </div>
          <!-- Markdown deferred (same pattern as the other modals) — renders as plain pre-wrap. -->
          <div
            v-else
            class="text-sm whitespace-pre-wrap break-words"
            style="overflow-wrap: anywhere"
          >{{ child.scratchpad }}</div>
        </div>

        <!-- Attributes -->
        <div v-show="activeTab === 'attributes'" class="h-full mt-4 overflow-auto">
          <div
            v-if="!child.toolResultAttributes || Object.keys(child.toolResultAttributes).length === 0"
            class="text-center text-muted-foreground py-8"
          >
            No named attributes saved
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="[name, attr] in Object.entries(child.toolResultAttributes)"
              :key="attr.id"
              class="p-3 border border-border rounded-lg"
            >
              <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <Database class="w-4 h-4 text-muted-foreground" />
                  <span class="font-medium">{{ name }}</span>
                  <Badge variant="outline">{{ attr.tool }}</Badge>
                  <Badge
                    v-if="attr.isBinary || isBinaryTool(attr.tool)"
                    variant="outline"
                    class="bg-purple-500/10 text-purple-500 border-purple-500/30"
                  >
                    <ImageIcon v-if="attr.mimeType?.startsWith('image/')" class="w-3 h-3 mr-1" />
                    <Volume2 v-else class="w-3 h-3 mr-1" />
                    BINARY
                  </Badge>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-muted-foreground">
                    {{ attr.size }} {{ attr.isBinary || isBinaryTool(attr.tool) ? 'bytes' : 'chars' }} •
                    Iteration {{ attr.iteration }}
                  </span>
                  <Button
                    v-if="attr.isBinary || isBinaryTool(attr.tool)"
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2 gap-1"
                    @click="openAttributeViewer(name, attr)"
                  >
                    <Eye class="w-3 h-3" />
                    Preview
                  </Button>
                </div>
              </div>
              <div
                v-if="attr.isBinary || isBinaryTool(attr.tool)"
                class="mt-1 p-2 bg-purple-500/10 border border-purple-500/20 rounded text-xs"
              >
                <span class="text-purple-400">{{ attr.resultString }}</span>
              </div>
              <pre
                v-else
                class="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap break-words"
                style="overflow-wrap: anywhere"
              >{{ attr.resultString }}</pre>
            </div>
          </div>
        </div>

        <!-- Artifacts -->
        <div v-show="activeTab === 'artifacts'" class="h-full mt-4 overflow-auto">
          <div
            v-if="!child.artifacts || child.artifacts.length === 0"
            class="text-center text-muted-foreground py-8"
          >
            No artifacts created
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="artifact in child.artifacts"
              :key="artifact.id"
              class="p-3 border border-border rounded-lg"
            >
              <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                  <FileOutput class="w-4 h-4 text-muted-foreground" />
                  <span class="font-medium">{{ artifact.title }}</span>
                  <Badge variant="outline">{{ artifact.type }}</Badge>
                  <Badge
                    v-if="(artifact.type === 'image' && getImageSrc(artifact.content)) || (artifact.type === 'audio' && getAudioSrc(artifact.content))"
                    variant="outline"
                    class="bg-purple-500/10 text-purple-500 border-purple-500/30"
                  >
                    <ImageIcon v-if="artifact.type === 'image'" class="w-3 h-3 mr-1" />
                    <Volume2 v-else class="w-3 h-3 mr-1" />
                    BINARY
                  </Badge>
                </div>
                <span class="text-xs text-muted-foreground">
                  {{ artifact.content.length }} chars • Iteration {{ artifact.iteration }}
                </span>
              </div>
              <p v-if="artifact.description" class="text-sm text-muted-foreground mb-2">
                {{ artifact.description }}
              </p>

              <template v-if="artifact.type === 'image' && getImageSrc(artifact.content)">
                <div class="mt-2 p-2 bg-muted rounded">
                  <img
                    :src="getImageSrc(artifact.content) ?? undefined"
                    :alt="artifact.title"
                    class="max-w-full max-h-48 rounded object-contain"
                  />
                </div>
              </template>

              <template v-else-if="artifact.type === 'audio' && getAudioSrc(artifact.content)">
                <div class="mt-2 p-2 bg-muted rounded">
                  <audio controls class="w-full">
                    <source
                      :src="getAudioSrc(artifact.content) ?? undefined"
                      :type="artifact.mimeType || 'audio/mpeg'"
                    />
                    Your browser does not support audio playback.
                  </audio>
                </div>
              </template>

              <pre
                v-else
                class="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap break-words"
                style="overflow-wrap: anywhere"
              >{{
                artifact.content.length > 2000
                  ? artifact.content.slice(0, 2000) + '\n\n... [truncated]'
                  : artifact.content
              }}</pre>
            </div>
          </div>
        </div>

        <!-- Raw -->
        <div v-show="activeTab === 'raw'" class="h-full mt-4 overflow-auto">
          <RawViewer :raw-data="child.rawData || []" />
        </div>
      </div>
    </div>

    <!-- Nested attribute preview modal -->
    <AttributeViewerModal
      v-if="viewingAttribute"
      :open="isAttributeViewerOpen"
      :attribute-name="viewingAttribute.name"
      :attribute-value="typeof viewingAttribute.attr.result === 'string'
        ? viewingAttribute.attr.result
        : JSON.stringify(viewingAttribute.attr.result)"
      :attribute-tool="viewingAttribute.attr.tool"
      :is-binary="viewingAttribute.attr.isBinary"
      :mime-type="viewingAttribute.attr.mimeType"
      @update:open="onAttributeViewerOpen"
    />
  </div>
</template>
