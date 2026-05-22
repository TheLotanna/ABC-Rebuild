<script setup lang="ts">
import { CheckCircle, Clock, Wrench, Package, Lightbulb, FileText, Download, X } from '@lucide/vue';
import { toast } from 'vue-sonner';
import type { FinalReport, FreeAgentSession } from '@agent-builder/shared';
import { exportSessionToZip } from '@/utils/sessionExporter';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';

const props = defineProps<{
  open: boolean;
  report: FinalReport | null;
  session: FreeAgentSession | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'reset'): void;
}>();

function close() {
  emit('update:open', false);
}

function onReset() {
  emit('reset');
}

async function handleDownload() {
  if (!props.session) return;
  try {
    const blob = await exportSessionToZip({
      session: props.session,
      promptSections: props.session.promptData?.sections,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freeagent-session-${new Date().toISOString().split('T')[0]}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Session exported successfully');
  } catch (err) {
    console.error('Failed to export session:', err);
    toast.error('Failed to export session');
  }
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
</script>

<template>
  <div
    v-if="open && report"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div class="bg-background border rounded-lg flex flex-col shadow-xl w-full sm:max-w-lg max-h-[90vh]">
      <!-- Header -->
      <div class="px-6 py-4 border-b shrink-0">
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <CheckCircle class="w-5 h-5 text-green-500" />
              Task Completed
            </h2>
            <p class="text-sm text-muted-foreground mt-1">
              Free Agent has finished executing your task.
            </p>
          </div>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="close">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- Body (scrollable) -->
      <div class="flex-1 min-h-0 overflow-auto px-6 py-4">
        <div class="space-y-4">
          <!-- Summary -->
          <div class="space-y-2">
            <h4 class="text-sm font-medium flex items-center gap-2">
              <FileText class="w-4 h-4" />
              Summary
            </h4>
            <p class="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md whitespace-pre-wrap">
              {{ report.summary }}
            </p>
          </div>

          <div class="h-px bg-border" />

          <!-- Stats -->
          <div class="grid grid-cols-2 gap-4">
            <div class="text-center p-3 bg-muted/30 rounded-md">
              <div class="text-2xl font-bold">{{ report.totalIterations }}</div>
              <div class="text-xs text-muted-foreground">Iterations</div>
            </div>
            <div class="text-center p-3 bg-muted/30 rounded-md">
              <div class="text-2xl font-bold flex items-center justify-center gap-1">
                <Clock class="w-4 h-4" />
                {{ formatDuration(report.totalTime) }}
              </div>
              <div class="text-xs text-muted-foreground">Duration</div>
            </div>
          </div>

          <div class="h-px bg-border" />

          <!-- Tools used -->
          <div class="space-y-2">
            <h4 class="text-sm font-medium flex items-center gap-2">
              <Wrench class="w-4 h-4" />
              Tools Used ({{ report.toolsUsed.length }})
            </h4>
            <div class="flex flex-wrap gap-1">
              <template v-if="report.toolsUsed.length > 0">
                <Badge v-for="(tool, i) in report.toolsUsed" :key="i" variant="secondary" class="text-xs">
                  {{ tool }}
                </Badge>
              </template>
              <span v-else class="text-sm text-muted-foreground">No tools used</span>
            </div>
          </div>

          <div class="h-px bg-border" />

          <!-- Artifacts created -->
          <div class="space-y-2">
            <h4 class="text-sm font-medium flex items-center gap-2">
              <Package class="w-4 h-4" />
              Artifacts Created ({{ report.artifactsCreated.length }})
            </h4>
            <div v-if="report.artifactsCreated.length > 0" class="space-y-1">
              <div
                v-for="(artifact, i) in report.artifactsCreated"
                :key="i"
                class="text-sm p-2 bg-green-500/10 border border-green-500/30 rounded"
              >
                <div class="font-medium">{{ artifact.title }}</div>
                <div v-if="artifact.description" class="text-xs text-muted-foreground">
                  {{ artifact.description }}
                </div>
              </div>
            </div>
            <span v-else class="text-sm text-muted-foreground">No artifacts created</span>
          </div>

          <!-- Key findings -->
          <template v-if="report.keyFindings.length > 0">
            <div class="h-px bg-border" />
            <div class="space-y-2">
              <h4 class="text-sm font-medium flex items-center gap-2">
                <Lightbulb class="w-4 h-4" />
                Key Findings
              </h4>
              <ul class="space-y-1">
                <li
                  v-for="(finding, i) in report.keyFindings"
                  :key="i"
                  class="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span class="text-primary mt-0.5">•</span>
                  <span>{{ finding }}</span>
                </li>
              </ul>
            </div>
          </template>

          <!-- Recommendations -->
          <template v-if="report.recommendations && report.recommendations.length > 0">
            <div class="h-px bg-border" />
            <div class="space-y-2">
              <h4 class="text-sm font-medium">Recommendations</h4>
              <ul class="space-y-1">
                <li
                  v-for="(rec, i) in report.recommendations"
                  :key="i"
                  class="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <span class="text-yellow-500 mt-0.5">→</span>
                  <span>{{ rec }}</span>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-2 shrink-0">
        <Button variant="outline" @click="close">Close</Button>
        <Button
          variant="outline"
          :disabled="!session"
          class="border-green-500/50 text-green-600 hover:bg-green-500/10"
          @click="handleDownload"
        >
          <Download class="w-4 h-4 mr-2" />
          Download
        </Button>
        <Button @click="onReset">Start New Task</Button>
      </div>
    </div>
  </div>
</template>
