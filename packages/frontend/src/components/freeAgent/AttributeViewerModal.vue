<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Database,
  Code,
  FileText,
  Image,
  Volume2,
  Download,
  X,
} from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';

type Tab = 'raw' | 'markdown' | 'preview';

const props = defineProps<{
  open: boolean;
  attributeName: string;
  attributeValue: string;
  attributeTool?: string;
  isBinary?: boolean;
  mimeType?: string;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const activeTab = ref<Tab>(props.isBinary ? 'preview' : 'raw');

watch(
  () => props.isBinary,
  (v) => {
    activeTab.value = v ? 'preview' : 'raw';
  },
);

const isImage = computed(() => props.mimeType?.startsWith('image/'));
const isAudio = computed(() => props.mimeType?.startsWith('audio/'));

const binaryDataUrl = computed<string | null>(() => {
  if (!props.isBinary || !props.attributeValue) return null;
  if (props.attributeValue.startsWith('data:')) return props.attributeValue;
  try {
    const parsed = JSON.parse(props.attributeValue);
    if (parsed.imageUrl) return parsed.imageUrl;
    if (parsed.audioContent) {
      return parsed.audioContent.startsWith('data:')
        ? parsed.audioContent
        : `data:${props.mimeType || 'audio/mpeg'};base64,${parsed.audioContent}`;
    }
  } catch {
    if (props.mimeType) {
      return `data:${props.mimeType};base64,${props.attributeValue}`;
    }
  }
  return null;
});

const rawContent = computed(() => {
  if (props.isBinary) {
    return `[Binary content - ${props.mimeType || 'unknown'} - ${Math.round(props.attributeValue.length / 1024)}KB]`;
  }
  try {
    return JSON.stringify(JSON.parse(props.attributeValue), null, 2);
  } catch {
    return props.attributeValue;
  }
});

function close() {
  emit('update:open', false);
}

function handleDownload() {
  const dataUrl = binaryDataUrl.value;
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  const ext = props.mimeType?.split('/')[1] || 'bin';
  link.download = `${props.attributeName}.${ext}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function tabBtnClass(tab: Tab) {
  return [
    'px-3 py-1.5 text-xs gap-1.5 rounded-md transition-colors inline-flex items-center',
    activeTab.value === tab
      ? 'bg-background shadow-sm text-foreground'
      : 'bg-muted/50 text-muted-foreground hover:text-foreground',
  ];
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div
      class="bg-background border rounded-lg flex flex-col shadow-xl"
      :style="{
        width: 'calc(100vw - 32px)',
        height: 'calc(100vh - 32px)',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 32px)',
      }"
    >
      <div class="px-4 py-3 border-b bg-muted/30 shrink-0 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <Image v-if="isBinary && isImage" class="w-5 h-5 text-purple-500 shrink-0" />
            <Volume2 v-else-if="isBinary && isAudio" class="w-5 h-5 text-purple-500 shrink-0" />
            <Database v-else-if="isBinary" class="w-5 h-5 text-purple-500 shrink-0" />
            <Database v-else class="w-5 h-5 text-cyan-500 shrink-0" />
            <h2 class="font-mono text-base sm:text-lg break-all">
              {{ `{{${attributeName}}}` }}
            </h2>
          </div>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span
              v-if="attributeTool"
              class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded"
            >
              from {{ attributeTool }}
            </span>
            <span
              v-if="isBinary"
              class="text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded"
            >
              BINARY
            </span>
            <Button
              v-if="isBinary && binaryDataUrl"
              variant="outline"
              size="sm"
              class="gap-1.5"
              @click="handleDownload"
            >
              <Download class="w-4 h-4" />
              Download
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0 shrink-0" @click="close">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="flex-1 flex flex-col min-h-0">
        <div class="px-6 py-2 border-b bg-background shrink-0">
          <div class="inline-flex bg-muted/50 rounded-lg p-1 gap-1">
            <button v-if="isBinary" :class="tabBtnClass('preview')" @click="activeTab = 'preview'">
              <Image v-if="isImage" class="w-3.5 h-3.5" />
              <Volume2 v-else class="w-3.5 h-3.5" />
              Preview
            </button>
            <button :class="tabBtnClass('raw')" @click="activeTab = 'raw'">
              <Code class="w-3.5 h-3.5" />
              Raw
            </button>
            <button v-if="!isBinary" :class="tabBtnClass('markdown')" @click="activeTab = 'markdown'">
              <FileText class="w-3.5 h-3.5" />
              Markdown
            </button>
          </div>
        </div>

        <div class="flex-1 min-h-0">
          <div v-if="isBinary && activeTab === 'preview'" class="h-full">
            <div class="h-full flex items-center justify-center p-6 bg-muted/20">
              <img
                v-if="isImage && binaryDataUrl"
                :src="binaryDataUrl"
                :alt="attributeName"
                class="max-w-full max-h-full object-contain rounded-lg shadow-lg"
              />
              <div v-else-if="isAudio && binaryDataUrl" class="flex flex-col items-center gap-4">
                <Volume2 class="w-16 h-16 text-purple-500" />
                <audio :src="binaryDataUrl" controls class="w-full max-w-96" />
              </div>
              <div v-else-if="!isImage && !isAudio" class="text-muted-foreground text-center">
                <p>Binary content ({{ mimeType || 'unknown type' }})</p>
                <p class="text-sm">Use the Download button to save this file</p>
              </div>
            </div>
          </div>

          <div v-else-if="activeTab === 'raw'" class="h-full overflow-auto">
            <pre class="p-6 text-sm font-mono whitespace-pre-wrap break-words text-foreground/90">{{ rawContent }}</pre>
          </div>

          <div v-else-if="!isBinary && activeTab === 'markdown'" class="h-full overflow-auto">
            <div class="p-6 max-w-none whitespace-pre-wrap break-words text-sm">
              {{ attributeValue }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
