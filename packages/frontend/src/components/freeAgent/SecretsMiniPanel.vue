<script setup lang="ts">
import { computed } from 'vue';
import { Key, Link, Settings, AlertTriangle, Check } from '@lucide/vue';
import { useSecretsManager } from '@/composables/useSecretsManager';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';

const emit = defineEmits<{ (e: 'open-modal'): void }>();

const secretsManager = useSecretsManager();

// Access through `config` (the reactive root) so updates are picked up,
// since the store currently surfaces the top-level arrays as static
// snapshots at return time.
const secretsCount = computed(() => secretsManager.config.secrets.length);
const mappingsCount = computed(() => secretsManager.config.mappings.length);
const totalMappings = computed(
  () =>
    mappingsCount.value +
    secretsManager.config.headerMappings.reduce((acc, hm) => acc + hm.headers.length, 0),
);

const hasSecrets = computed(() => secretsCount.value > 0);
const hasMappings = computed(() => totalMappings.value > 0);
const configuredParams = computed(() => secretsManager.getConfiguredToolParams());
</script>

<template>
  <div class="space-y-4 p-2">
    <div class="flex flex-wrap gap-2">
      <Badge :variant="hasSecrets ? 'default' : 'outline'" class="gap-1">
        <Key class="w-3 h-3" />
        {{ secretsCount }} secrets
      </Badge>
      <Badge :variant="hasMappings ? 'default' : 'outline'" class="gap-1">
        <Link class="w-3 h-3" />
        {{ totalMappings }} mappings
      </Badge>
    </div>

    <div
      v-if="!hasSecrets"
      class="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-muted/50 rounded"
    >
      <AlertTriangle class="w-4 h-4 text-yellow-500" />
      No secrets configured
    </div>

    <div
      v-else-if="hasSecrets && !hasMappings"
      class="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-muted/50 rounded"
    >
      <AlertTriangle class="w-4 h-4 text-yellow-500" />
      Secrets not mapped to tools
    </div>

    <div
      v-else
      class="flex items-center gap-2 text-sm text-green-600 p-2 bg-green-500/10 rounded"
    >
      <Check class="w-4 h-4" />
      {{ totalMappings }} parameter{{ totalMappings !== 1 ? 's' : '' }} configured
    </div>

    <div v-if="configuredParams.length > 0" class="h-[120px] overflow-auto">
      <div class="space-y-1">
        <h4 class="text-xs font-medium text-muted-foreground mb-2">
          Configured Parameters
        </h4>
        <div
          v-for="(cp, idx) in configuredParams"
          :key="idx"
          class="flex items-center gap-2 text-xs bg-muted/30 rounded px-2 py-1"
        >
          <Badge variant="outline" class="text-xs py-0">{{ cp.tool }}</Badge>
          <span class="text-muted-foreground">→</span>
          <span class="font-mono">{{ cp.param }}</span>
        </div>
      </div>
    </div>

    <Button class="w-full" variant="outline" @click="emit('open-modal')">
      <Settings class="w-4 h-4 mr-2" />
      Manage Secrets
    </Button>
  </div>
</template>
