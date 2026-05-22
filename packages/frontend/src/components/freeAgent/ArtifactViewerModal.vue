<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  Download,
  Copy,
  FileText,
  Image,
  Volume2,
  Database,
  File,
  X,
} from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { FreeAgentArtifact } from '@agent-builder/shared';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';

const props = defineProps<{
  open: boolean;
  artifact: FreeAgentArtifact | null;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

function close() {
  emit('update:open', false);
}

const icon = computed<Component>(() => {
  switch (props.artifact?.type) {
    case 'image': return Image;
    case 'audio': return Volume2;
    case 'data': return Database;
    case 'file': return File;
    default: return FileText;
  }
});

function getImageSrc(content: string, mimeType?: string): string {
  if (content.startsWith('data:')) return content;
  try {
    const parsed = JSON.parse(content);
    if (parsed.imageUrl) return parsed.imageUrl;
    if (parsed.url) return parsed.url;
  } catch { /* not JSON */ }
  return `data:${mimeType || 'image/png'};base64,${content}`;
}

const imageSrc = computed(() =>
  props.artifact?.type === 'image'
    ? getImageSrc(props.artifact.content, props.artifact.mimeType)
    : null,
);

const audioSrc = computed(() => {
  const a = props.artifact;
  if (!a) return null;
  if (a.type !== 'audio' && !a.mimeType?.startsWith('audio/')) return null;
  return a.content.startsWith('data:')
    ? a.content
    : `data:${a.mimeType || 'audio/mpeg'};base64,${a.content}`;
});

const textContent = computed(() => {
  const a = props.artifact;
  if (!a) return null;
  if (a.type !== 'text' && a.type !== 'data') return null;
  return typeof a.content === 'string' ? a.content : JSON.stringify(a.content, null, 2);
});

function handleDownload() {
  const a = props.artifact;
  if (!a) return;
  try {
    let blob: Blob;
    let filename = a.title;

    if (a.content.startsWith('data:')) {
      const [header, base64Data] = a.content.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : a.mimeType || 'application/octet-stream';
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      if (!filename.includes('.')) {
        const ext = mimeType.split('/')[1] || 'bin';
        filename = `${filename}.${ext}`;
      }
    } else if (a.type === 'file' && a.mimeType) {
      const byteCharacters = atob(a.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: a.mimeType });
    } else {
      blob = new Blob([a.content], { type: 'text/plain' });
      if (!filename.includes('.')) filename = `${filename}.txt`;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  } catch {
    toast.error('Failed to download artifact');
  }
}

async function handleCopy() {
  const a = props.artifact;
  if (!a) return;
  try {
    if (a.type === 'text' || a.type === 'data') {
      await navigator.clipboard.writeText(a.content);
      toast.success('Copied to clipboard');
    } else {
      toast.error('Cannot copy binary content');
    }
  } catch {
    toast.error('Failed to copy');
  }
}
</script>

<template>
  <div
    v-if="open && artifact"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div
      class="bg-background border rounded-lg flex flex-col p-4 shadow-xl"
      :style="{
        width: 'calc(100vw - 32px)',
        height: 'calc(100vh - 32px)',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 32px)',
      }"
    >
      <div class="flex-shrink-0 flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex flex-wrap items-start gap-2">
            <div class="flex items-center gap-2 text-primary">
              <component :is="icon" class="w-5 h-5" />
              <h2 class="text-base sm:text-lg break-words font-semibold">
                {{ artifact.title }}
              </h2>
            </div>
            <Badge variant="secondary" class="shrink-0">{{ artifact.type }}</Badge>
          </div>
          <p v-if="artifact.description" class="text-sm text-muted-foreground mt-2">
            {{ artifact.description }}
          </p>
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <Button
              v-if="artifact.type === 'text' || artifact.type === 'data'"
              variant="outline"
              size="sm"
              @click="handleCopy"
            >
              <Copy class="w-4 h-4 mr-2" />
              Copy
            </Button>
            <Button variant="outline" size="sm" @click="handleDownload">
              <Download class="w-4 h-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0 shrink-0" @click="close">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="flex-1 overflow-hidden border rounded-lg bg-muted/20 mt-4">
        <div v-if="artifact.type === 'image' && imageSrc" class="h-full flex items-center justify-center p-4">
          <img
            :src="imageSrc"
            :alt="artifact.title"
            class="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          />
        </div>

        <div v-else-if="audioSrc" class="h-full flex flex-col items-center justify-center p-8 gap-6">
          <div class="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <Volume2 class="w-12 h-12 text-primary" />
          </div>
          <audio :src="audioSrc" controls class="w-full max-w-md" />
          <p class="text-sm text-muted-foreground">
            {{ artifact.description || 'Audio file' }}
          </p>
        </div>

        <div v-else-if="textContent !== null" class="h-full overflow-auto">
          <div class="p-4 max-w-none whitespace-pre-wrap break-words text-sm">
            {{ textContent }}
          </div>
        </div>

        <div v-else class="h-full flex flex-col items-center justify-center p-8 gap-6">
          <div class="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
            <File class="w-12 h-12 text-muted-foreground" />
          </div>
          <p class="text-lg font-medium">{{ artifact.title }}</p>
          <p class="text-sm text-muted-foreground">
            {{ artifact.description || artifact.mimeType || 'Binary file' }}
          </p>
          <p v-if="artifact.size" class="text-xs text-muted-foreground">
            Size: {{ (artifact.size / 1024).toFixed(1) }} KB
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
