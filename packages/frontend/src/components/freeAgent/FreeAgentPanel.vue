<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  Play, Square, Upload, X, RefreshCw, Loader2, CheckCircle, AlertCircle,
  Pause, RotateCcw, MessageSquarePlus, Wand2, Settings, Lightbulb,
  Key, ClipboardList, AlertTriangle, GitBranch, Download, Package, Bot,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import { exportSessionToZip } from '@/utils/sessionExporter';
import { safeStringify } from '@/lib/safeRender';
import { extractTextFromFile } from '@/utils/fileTextExtraction';
import { parseExcelFile } from '@/utils/parseExcel';
import type { ExcelData } from '@/utils/parseExcel';
import type { FreeAgentSession, SessionFile, ToolsManifest, AdvancedFeatures } from '@agent-builder/shared';
import type { SecretsManager } from '@/stores/secretsStore';
import type { ToolInstancesManager } from '@/stores/toolInstanceStore';
import InterjectModal from './InterjectModal.vue';
import EnhancePromptSettingsModal from './EnhancePromptSettingsModal.vue';
import EnhancePromptModal from './EnhancePromptModal.vue';
import ReflectModal from './ReflectModal.vue';
import SecretsManagerModal from './SecretsManagerModal.vue';
import SecretsMiniPanel from './SecretsMiniPanel.vue';
import ToolInstancesTab from './ToolInstancesTab.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Card from '@/components/ui/Card.vue';

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'xml', 'csv', 'yaml', 'yml', 'toml',
  'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass',
  'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'sql', 'sh',
  'log', 'env', 'ini', 'conf', 'config', 'gitignore', 'dockerfile',
]);

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'claude' },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'claude' },
  { value: 'claude-opus-4-5', label: 'Claude Opus 4.5', provider: 'claude' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', provider: 'gemini' },
  { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview', provider: 'gemini' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'gemini' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'gemini' },
  { value: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast Reasoning', provider: 'grok' },
  { value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast Non-Reasoning', provider: 'grok' },
  { value: 'grok-code-fast-1', label: 'Grok Code Fast 1', provider: 'grok' },
];

const props = defineProps<{
  session: FreeAgentSession | null;
  isRunning: boolean;
  cacheSize?: number;
  secretsManager: SecretsManager;
  toolsManifest: ToolsManifest | null;
  toolInstancesManager: ToolInstancesManager;
  pendingFiles: SessionFile[];
}>();

const emit = defineEmits<{
  start: [prompt: string, files: SessionFile[], model: string, maxIterations: number, existingSession: FreeAgentSession | null, advancedFeatures: AdvancedFeatures];
  stop: [];
  reset: [];
  continue: [];
  retry: [];
  interject: [message: string];
  'pending-files-change': [files: SessionFile[]];
}>();

const prompt = ref('');
const selectedModel = ref(props.session?.model || 'claude-sonnet-4-5');
const maxIterations = ref(props.session?.maxIterations || 50);
const controlTab = ref<'task' | 'secrets' | 'instances' | 'advanced'>('task');
const fileInputRef = ref<HTMLInputElement | null>(null);
const excelData = ref<ExcelData | null>(null);
const isProcessingFiles = ref(false);
const selfAuthorEnabled = ref(false);
const spawnEnabled = ref(false);
const maxChildren = ref(5);
const childMaxIterations = ref(20);
const interjectModalOpen = ref(false);
const reflectModalOpen = ref(false);
const enhanceModalOpen = ref(false);
const enhanceSettingsModalOpen = ref(false);
const secretsModalOpen = ref(false);

watch(() => props.session?.status, (status) => {
  if (status === 'idle') {
    if (props.session?.model) selectedModel.value = props.session.model;
    if (props.session?.maxIterations) maxIterations.value = props.session.maxIterations;
  }
});

function addFiles(newFiles: SessionFile[]) {
  emit('pending-files-change', [...props.pendingFiles, ...newFiles]);
}

function removeFile(fileId: string) {
  emit('pending-files-change', props.pendingFiles.filter(f => f.id !== fileId));
}

function getFileType(filename: string): 'excel' | 'document' | 'text' | 'binary' {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'pdf' || ext === 'docx') return 'document';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'binary';
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFileUpload(e: Event) {
  const uploadedFiles = (e.target as HTMLInputElement).files;
  if (!uploadedFiles) return;
  isProcessingFiles.value = true;
  const newFiles: SessionFile[] = [];
  const excelFilesQueue: File[] = [];

  for (const file of Array.from(uploadedFiles)) {
    const fileType = getFileType(file.name);
    try {
      if (fileType === 'excel') {
        excelFilesQueue.push(file);
      } else if (fileType === 'document') {
        const extracted = await extractTextFromFile(file);
        newFiles.push({
          id: crypto.randomUUID(), filename: file.name,
          mimeType: 'text/plain', size: extracted.content.length,
          content: extracted.content, uploadedAt: new Date().toISOString(),
        });
        toast.success(`Extracted text from ${file.name}`);
      } else if (fileType === 'text') {
        const content = await readFileAsText(file);
        newFiles.push({
          id: crypto.randomUUID(), filename: file.name,
          mimeType: file.type || 'text/plain', size: file.size,
          content, uploadedAt: new Date().toISOString(),
        });
      } else {
        const content = await readFileAsBase64(file);
        newFiles.push({
          id: crypto.randomUUID(), filename: file.name,
          mimeType: file.type || 'application/octet-stream', size: file.size,
          content, uploadedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      toast.error(`Failed to process ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  addFiles(newFiles);
  isProcessingFiles.value = false;

  if (excelFilesQueue.length > 0) {
    try {
      excelData.value = await parseExcelFile(excelFilesQueue[0]);
    } catch (err) {
      toast.error(`Failed to parse ${excelFilesQueue[0].name}`);
    }
  }
  (e.target as HTMLInputElement).value = '';
}

function handleStart() {
  if (!prompt.value.trim()) return;
  const advancedFeatures: AdvancedFeatures = {
    selfAuthorEnabled: selfAuthorEnabled.value,
    spawnEnabled: spawnEnabled.value,
    maxChildren: maxChildren.value,
    childMaxIterations: childMaxIterations.value,
  };
  emit('start', prompt.value, props.pendingFiles, selectedModel.value, maxIterations.value,
    props.session?.status === 'idle' ? props.session : null, advancedFeatures);
}

function handleEnhancedPromptAccept(enhancedPrompt: string) {
  prompt.value = enhancedPrompt;
}

function handleEnhancedPromptAcceptAndStart(enhancedPrompt: string) {
  prompt.value = enhancedPrompt;
  // Defer one tick so the updated prompt is visible before emitting.
  setTimeout(handleStart, 0);
}

function handleClear() {
  prompt.value = '';
  emit('pending-files-change', []);
  emit('reset');
}

async function handleDownloadSession() {
  if (!props.session) return;
  try {
    const blob = await exportSessionToZip({ session: props.session, promptSections: props.session.promptData?.sections });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freeagent-session-${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Session exported successfully');
  } catch {
    toast.error('Failed to export session');
  }
}

function providerColor(provider: string) {
  if (provider === 'claude') return 'text-orange-500';
  if (provider === 'gemini') return 'text-blue-500';
  if (provider === 'grok') return 'text-purple-500';
  return 'text-muted-foreground';
}

function getStatusBadgeClass(): string {
  if (!props.session) return '';
  switch (props.session.status) {
    case 'running': return 'bg-yellow-500 text-white';
    case 'completed': return 'bg-green-500 text-white';
    case 'error': return 'bg-red-500 text-white';
    case 'paused': return 'bg-orange-500 text-white';
    case 'needs_assistance': return 'bg-muted text-foreground';
    default: return 'bg-muted text-foreground';
  }
}
</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden">
    <!-- Status badge -->
    <div class="px-3 pt-2 pb-1 flex-shrink-0">
      <span v-if="session" :class="['inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', getStatusBadgeClass()]">
        <Loader2 v-if="session.status === 'running'" class="w-3 h-3 animate-spin" />
        <CheckCircle v-else-if="session.status === 'completed'" class="w-3 h-3" />
        <AlertCircle v-else-if="session.status === 'error'" class="w-3 h-3" />
        <Pause v-else-if="session.status === 'paused' || session.status === 'needs_assistance'" class="w-3 h-3" />
        <Bot v-else class="w-3 h-3" />
        {{ session.status === 'running' ? 'Running' : session.status === 'completed' ? 'Completed' : session.status === 'error' ? 'Error' : session.status === 'paused' ? `Paused${session.retryCount ? ` (${session.retryCount} retries)` : ''}` : session.status === 'needs_assistance' ? 'Awaiting Input' : 'Idle' }}
      </span>
    </div>

    <!-- Tabs header -->
    <div class="flex border-b border-border flex-shrink-0 px-2">
      <button
        v-for="tab in [
          { id: 'task', icon: ClipboardList, label: 'Task' },
          { id: 'instances', icon: Package, label: 'Tools' },
          { id: 'secrets', icon: Key, label: 'Secrets' },
          { id: 'advanced', icon: AlertTriangle, label: 'Adv' },
        ]"
        :key="tab.id"
        class="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px"
        :class="controlTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="controlTab = tab.id as any"
      >
        <component :is="tab.icon" class="w-3 h-3" />
        <span class="hidden min-[380px]:inline">{{ tab.label }}</span>
        <span v-if="tab.id === 'instances' && toolInstancesManager.config.instances.length > 0" class="min-[380px]:hidden">({{ toolInstancesManager.config.instances.length }})</span>
        <span v-if="tab.id === 'secrets' && secretsManager.secrets.length > 0" class="min-[380px]:hidden">({{ secretsManager.secrets.length }})</span>
      </button>
    </div>

    <!-- Tab content -->
    <div class="flex-1 overflow-hidden">

      <!-- === TASK TAB === -->
      <div v-if="controlTab === 'task'" class="h-full overflow-y-auto px-3 py-3">
        <div class="flex flex-col gap-4">

          <!-- Idle / no session: show input form -->
          <template v-if="!session || session.status === 'idle'">
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Task Description</label>
              <textarea
                v-model="prompt"
                placeholder="Describe what you want the agent to do..."
                rows="4"
                class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium">Model</label>
              <select
                v-model="selectedModel"
                class="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option v-for="opt in MODEL_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium">Files (optional)</label>
              <Button variant="outline" size="sm" class="w-full gap-2" @click="fileInputRef?.click()">
                <Upload class="w-4 h-4" />
                Upload Files
              </Button>
              <input ref="fileInputRef" type="file" multiple accept="*/*" class="hidden" @change="handleFileUpload" />

              <div v-if="pendingFiles.length > 0" class="border rounded-md p-2 space-y-1 max-h-20 overflow-y-auto">
                <div
                  v-for="file in pendingFiles"
                  :key="file.id"
                  class="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1"
                >
                  <span class="truncate flex-1">{{ file.filename }}</span>
                  <span class="text-muted-foreground mx-2">{{ (file.size / 1024).toFixed(1) }} KB</span>
                  <button class="h-5 w-5 flex items-center justify-center hover:text-destructive" @click="removeFile(file.id)">
                    <X class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div class="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                class="flex-1 gap-2 border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                :disabled="!prompt.trim() || isRunning"
                @click="enhanceModalOpen = true"
              >
                <Wand2 class="w-4 h-4" />
                Enhance Prompt
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 px-2"
                title="Edit enhancement template"
                @click="enhanceSettingsModalOpen = true"
              >
                <Settings class="w-4 h-4" />
              </Button>
            </div>

            <Button class="w-full gap-2" :disabled="!prompt.trim() || isRunning" @click="handleStart">
              <Play class="w-4 h-4" />
              Start Agent
            </Button>

            <Button v-if="prompt.trim() || pendingFiles.length > 0" variant="outline" class="w-full gap-2" @click="handleClear">
              <X class="w-4 h-4" />
              Clear
            </Button>
          </template>

          <!-- Active session: show session info + controls -->
          <template v-else>
            <div class="space-y-2 text-sm">
              <div><span class="text-muted-foreground">Prompt: </span><span class="line-clamp-2">{{ session.prompt }}</span></div>
              <div><span class="text-muted-foreground">Model: </span><span class="font-medium">{{ session.model }}</span></div>
              <div class="flex gap-4">
                <div><span class="text-muted-foreground">Iter: </span><span>{{ session.currentIteration }} / {{ session.maxIterations }}</span></div>
                <div><span class="text-muted-foreground">Tools: </span><span>{{ session.toolCalls.length }}</span></div>
                <div><span class="text-muted-foreground">Artifacts: </span><span>{{ session.artifacts.length }}</span></div>
              </div>
            </div>

            <div class="border rounded-md p-3 space-y-2 text-sm">
              <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Memory</div>
              <div class="flex justify-between"><span class="text-muted-foreground">Blackboard entries:</span><span class="font-medium">{{ session.blackboard.length }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Scratchpad:</span><span class="font-medium">{{ session.scratchpad ? `${session.scratchpad.length} chars` : 'Empty' }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Tool cache:</span><span class="font-medium">{{ cacheSize ?? 0 }} items</span></div>
              <div v-if="session.blackboard.length > 0" class="mt-2 pt-2 border-t">
                <div class="text-xs text-muted-foreground mb-1">Latest entry:</div>
                <div class="text-xs bg-muted/50 p-2 rounded line-clamp-3">
                  [{{ session.blackboard[session.blackboard.length - 1]?.category }}] {{ safeStringify(session.blackboard[session.blackboard.length - 1]?.content) }}
                </div>
              </div>
            </div>

            <!-- Control buttons -->
            <div class="flex flex-col gap-2">
              <template v-if="isRunning">
                <div class="flex gap-2">
                  <Button variant="destructive" class="flex-1 gap-2" @click="emit('stop')">
                    <Square class="w-4 h-4" />
                    Stop
                  </Button>
                  <Button variant="outline" class="flex-1 gap-2" @click="interjectModalOpen = true">
                    <MessageSquarePlus class="w-4 h-4" />
                    Interject
                  </Button>
                </div>
              </template>
              <template v-else>
                <Button
                  variant="outline"
                  class="w-full gap-2 border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
                  :disabled="!session || (session.blackboard?.length ?? 0) === 0"
                  @click="reflectModalOpen = true"
                >
                  <Lightbulb class="w-4 h-4" />
                  Reflect on Session
                </Button>
                <Button variant="outline" class="w-full gap-2" @click="emit('reset')">
                  <RotateCcw class="w-4 h-4" />
                  Reset
                </Button>
                <Button v-if="session.status === 'paused' || session.status === 'error'" class="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white" @click="emit('retry')">
                  <RefreshCw class="w-4 h-4" />
                  Retry
                </Button>
                <Button v-if="session.status === 'completed'" class="w-full gap-2" @click="emit('continue')">
                  <Play class="w-4 h-4" />
                  Continue
                </Button>
                <Button v-if="session.status === 'completed'" variant="outline" class="w-full gap-2 border-green-500/50 text-green-600 hover:bg-green-500/10" @click="handleDownloadSession">
                  <Download class="w-4 h-4" />
                  Download Session
                </Button>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- === TOOLS TAB === -->
      <div v-else-if="controlTab === 'instances'" class="h-full overflow-hidden">
        <ToolInstancesTab :tools-manifest="toolsManifest" />
      </div>

      <!-- === SECRETS TAB === -->
      <div v-else-if="controlTab === 'secrets'" class="h-full overflow-hidden">
        <SecretsMiniPanel @open-modal="secretsModalOpen = true" />
      </div>

      <!-- === ADVANCED TAB === -->
      <div v-else-if="controlTab === 'advanced'" class="h-full overflow-y-auto px-3 py-3">
        <div class="border border-amber-500/50 rounded-lg p-3 bg-amber-500/5 space-y-4">
          <div class="flex items-center gap-2">
            <AlertTriangle class="w-4 h-4 text-amber-500" />
            <span class="text-sm font-medium text-amber-600">Advanced Features</span>
          </div>
          <p class="text-xs text-muted-foreground">These features grant the agent powerful capabilities. Use with caution.</p>

          <div class="space-y-1.5">
            <label class="text-sm font-medium">Max Iterations</label>
            <Input
              v-model="maxIterations"
              type="number"
              :min="1" :max="200"
              class="w-full"
            />
            <p class="text-xs text-muted-foreground">Maximum number of autonomous iterations (1–200)</p>
          </div>

          <!-- Self-Author -->
          <div class="flex items-start gap-3 p-3 rounded-md border border-red-500/30 bg-red-500/5">
            <button
              type="button"
              class="relative inline-flex h-5 w-9 flex-shrink-0 mt-0.5 items-center rounded-full transition-colors"
              :class="selfAuthorEnabled ? 'bg-red-500' : 'bg-input'"
              @click="selfAuthorEnabled = !selfAuthorEnabled"
            >
              <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform" :class="selfAuthorEnabled ? 'translate-x-4' : 'translate-x-1'" />
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium text-red-600 cursor-pointer" @click="selfAuthorEnabled = !selfAuthorEnabled">Self-Author</span>
                <Badge variant="outline" class="text-red-500 border-red-500/50 text-[10px]">DANGER</Badge>
              </div>
              <p class="text-xs text-muted-foreground">Agent can read and modify its own system prompt.</p>
              <p v-if="selfAuthorEnabled" class="text-xs text-red-500 mt-1">Grants: <code class="bg-muted px-1 rounded">read_self</code>, <code class="bg-muted px-1 rounded">write_self</code></p>
            </div>
          </div>

          <!-- Spawn Children -->
          <div class="flex items-start gap-3 p-3 rounded-md border border-amber-500/30 bg-amber-500/5">
            <button
              type="button"
              class="relative inline-flex h-5 w-9 flex-shrink-0 mt-0.5 items-center rounded-full transition-colors"
              :class="spawnEnabled ? 'bg-amber-500' : 'bg-input'"
              @click="spawnEnabled = !spawnEnabled"
            >
              <span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform" :class="spawnEnabled ? 'translate-x-4' : 'translate-x-1'" />
            </button>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium text-amber-600 cursor-pointer" @click="spawnEnabled = !spawnEnabled">Spawn Children</span>
                <GitBranch class="w-3 h-3 text-amber-500" />
              </div>
              <p class="text-xs text-muted-foreground mb-2">Agent can create child instances for parallel work.</p>
              <div v-if="spawnEnabled" class="grid grid-cols-2 gap-2">
                <div>
                  <label class="text-xs text-muted-foreground">Max Children</label>
                  <Input v-model="maxChildren" type="number" :min="1" :max="100" class="h-8 text-xs" />
                </div>
                <div>
                  <label class="text-xs text-muted-foreground">Child Max Iter.</label>
                  <Input v-model="childMaxIterations" type="number" :min="1" :max="200" class="h-8 text-xs" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <InterjectModal
      :open="interjectModalOpen"
      @update:open="interjectModalOpen = $event"
      @submit="(msg: string) => { emit('interject', msg); interjectModalOpen = false; }"
    />

    <EnhancePromptSettingsModal
      :open="enhanceSettingsModalOpen"
      @update:open="enhanceSettingsModalOpen = $event"
    />

    <EnhancePromptModal
      :open="enhanceModalOpen"
      :original-prompt="prompt"
      :files="pendingFiles"
      :model="selectedModel"
      @update:open="enhanceModalOpen = $event"
      @accept="handleEnhancedPromptAccept"
      @accept-and-start="handleEnhancedPromptAcceptAndStart"
    />

    <ReflectModal
      v-if="session"
      :open="reflectModalOpen"
      :blackboard="session.blackboard ?? []"
      :scratchpad="session.scratchpad ?? ''"
      :original-prompt="session.prompt ?? ''"
      :model="session.model"
      @update:open="reflectModalOpen = $event"
    />

    <SecretsManagerModal
      :open="secretsModalOpen"
      :tools-manifest="toolsManifest"
      @update:open="secretsModalOpen = $event"
    />
  </Card>
</template>
