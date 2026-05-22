<script setup lang="ts">
import { computed, type Component } from 'vue';
import {
  FileText,
  Image,
  Database,
  File,
  Download,
  Copy,
  Package,
  Volume2,
} from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import type { FreeAgentArtifact } from '@agent-builder/shared';
import Card from '@/components/ui/Card.vue';
import CardContent from '@/components/ui/CardContent.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import CardTitle from '@/components/ui/CardTitle.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ artifacts: FreeAgentArtifact[] }>();

const emit = defineEmits<{
  (e: 'artifact-click', artifact: FreeAgentArtifact): void;
}>();

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

function iconFor(type: FreeAgentArtifact['type'], mimeType?: string): Component {
  if (mimeType?.startsWith('audio/')) return Volume2;
  switch (type) {
    case 'image': return Image;
    case 'audio': return Volume2;
    case 'data': return Database;
    case 'file': return File;
    default: return FileText;
  }
}

function getImageSrc(artifact: FreeAgentArtifact): string {
  const content = artifact.content;
  if (content.startsWith('data:')) return content;
  try {
    const parsed = JSON.parse(content);
    if (parsed.imageUrl) return parsed.imageUrl;
    if (parsed.url) return parsed.url;
  } catch { /* not JSON */ }
  return `data:${artifact.mimeType || 'image/png'};base64,${content}`;
}

function isAudioContent(content: string): boolean {
  if (content.startsWith('data:audio/')) return true;
  try { return !!JSON.parse(content).audioContent; } catch { return false; }
}

function isImageContent(content: string): boolean {
  if (content.startsWith('data:image/')) return true;
  try { return !!JSON.parse(content).imageUrl; } catch { return false; }
}

function base64ToBlob(base64Data: string, mimeType: string): Blob {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

function handleDownload(artifact: FreeAgentArtifact) {
  try {
    let blob: Blob;
    let filename = artifact.title;

    const isAudio =
      artifact.type === 'audio' ||
      artifact.mimeType?.startsWith('audio/') ||
      isAudioContent(artifact.content);
    const isImage =
      artifact.type === 'image' ||
      artifact.mimeType?.startsWith('image/') ||
      isImageContent(artifact.content);

    if (isImage) {
      const src = getImageSrc(artifact);
      if (src.startsWith('data:')) {
        const [header, base64Data] = src.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : artifact.mimeType || 'image/png';
        blob = base64ToBlob(base64Data, mimeType);
        if (!filename.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
          filename += MIME_EXT[mimeType] || '.png';
        }
      } else {
        blob = new Blob([artifact.content], { type: 'text/plain' });
      }
    } else if (isAudio) {
      const mimeType = artifact.mimeType || 'audio/mpeg';
      let base64Data = artifact.content;
      if (base64Data.startsWith('data:')) base64Data = base64Data.split(',')[1];
      try {
        const parsed = JSON.parse(artifact.content);
        if (parsed.audioContent) {
          base64Data = parsed.audioContent.startsWith('data:')
            ? parsed.audioContent.split(',')[1]
            : parsed.audioContent;
        }
      } catch { /* not JSON */ }
      blob = base64ToBlob(base64Data, mimeType);
      if (!filename.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        filename += MIME_EXT[mimeType] || '.mp3';
      }
    } else if (artifact.type === 'file' && artifact.mimeType) {
      blob = base64ToBlob(artifact.content, artifact.mimeType);
      const ext = MIME_EXT[artifact.mimeType];
      if (ext && !filename.includes('.')) filename += ext;
    } else {
      blob = new Blob([artifact.content], { type: 'text/plain' });
      if (!filename.includes('.')) filename += '.txt';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Downloaded ${filename}`);
  } catch {
    toast.error('Failed to download artifact');
  }
}

async function handleCopy(artifact: FreeAgentArtifact) {
  try {
    await navigator.clipboard.writeText(artifact.content);
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Failed to copy');
  }
}

function audioSrcFor(artifact: FreeAgentArtifact): string {
  return artifact.content.startsWith('data:')
    ? artifact.content
    : `data:${artifact.mimeType || 'audio/mpeg'};base64,${artifact.content}`;
}

const artifactViews = computed(() =>
  props.artifacts.map((a) => ({
    artifact: a,
    icon: iconFor(a.type, a.mimeType),
    textPreview:
      a.type === 'text'
        ? typeof a.content === 'string' ? a.content : JSON.stringify(a.content, null, 2)
        : null,
    imageSrc: a.type === 'image' ? getImageSrc(a) : null,
    audioSrc: a.type === 'audio' || a.mimeType?.startsWith('audio/') ? audioSrcFor(a) : null,
  })),
);
</script>

<template>
  <Card class="h-full flex flex-col">
    <CardHeader class="pb-3">
      <CardTitle class="flex items-center gap-2 text-base">
        <Package class="w-4 h-4" />
        Artifacts
        <Badge variant="secondary" class="ml-auto">{{ artifacts.length }}</Badge>
      </CardTitle>
    </CardHeader>

    <CardContent class="flex-1 overflow-hidden p-0">
      <div
        v-if="artifacts.length === 0"
        class="flex items-center justify-center h-full text-muted-foreground text-sm"
      >
        No artifacts created yet
      </div>
      <div v-else class="h-full overflow-auto px-4 pb-4">
        <div class="space-y-2">
          <div
            v-for="{ artifact, icon, textPreview, imageSrc, audioSrc } in artifactViews"
            :key="artifact.id"
            class="p-3 rounded-md border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
            @click="emit('artifact-click', artifact)"
          >
            <div class="flex items-center gap-2 mb-1">
              <div class="text-primary">
                <component :is="icon" class="w-4 h-4" />
              </div>
              <span class="text-sm font-medium flex-1 truncate">{{ artifact.title }}</span>
              <Badge variant="outline" class="text-[10px]">{{ artifact.type }}</Badge>
            </div>

            <p
              v-if="artifact.description"
              class="text-xs text-muted-foreground mb-2 line-clamp-2"
            >
              {{ artifact.description }}
            </p>

            <div
              v-if="textPreview !== null"
              class="text-xs bg-muted/50 p-2 rounded overflow-y-auto max-w-none break-words whitespace-pre-wrap"
            >{{ textPreview }}</div>

            <img
              v-if="imageSrc"
              :src="imageSrc"
              :alt="artifact.title"
              class="max-h-[80px] rounded object-cover"
              @error="($event.target as HTMLElement).style.display = 'none'"
            />

            <audio
              v-if="audioSrc"
              :src="audioSrc"
              controls
              class="w-full h-8"
              @click.stop
            />

            <div class="flex gap-1 mt-2">
              <Button
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-xs"
                @click.stop="handleDownload(artifact)"
              >
                <Download class="w-3 h-3 mr-1" />
                Download
              </Button>
              <Button
                v-if="artifact.type === 'text'"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-xs"
                @click.stop="handleCopy(artifact)"
              >
                <Copy class="w-3 h-3 mr-1" />
                Copy
              </Button>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
