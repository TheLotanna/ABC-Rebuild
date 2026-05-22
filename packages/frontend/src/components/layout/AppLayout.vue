<script setup lang="ts">
import MobileNav from './MobileNav.vue';

type Tab = 'library' | 'workflow' | 'properties';
type AppMode = 'workflow' | 'freeAgent';
type ViewMode = 'stacked' | 'canvas' | 'simple';

defineProps<{
  activeTab: Tab;
  hasSelectedAgent: boolean;
  viewMode?: ViewMode;
  appMode?: AppMode;
}>();

const emit = defineEmits<{
  'tab-change': [tab: Tab];
  'add-stage': [];
  run: [];
  save: [];
  load: [file: File];
  clear: [];
  'clear-outputs': [];
  'toggle-view-mode': [];
  'set-app-mode': [mode: AppMode];
}>();
</script>

<template>
  <div class="min-h-screen bg-background text-foreground flex flex-col">
    <MobileNav
      :active-tab="activeTab"
      :has-selected-agent="hasSelectedAgent"
      :view-mode="viewMode"
      :app-mode="appMode"
      @tab-change="(t: Tab) => emit('tab-change', t)"
      @add-stage="emit('add-stage')"
      @run="emit('run')"
      @save="emit('save')"
      @load="(f: File) => emit('load', f)"
      @clear="emit('clear')"
      @clear-outputs="emit('clear-outputs')"
      @toggle-view-mode="emit('toggle-view-mode')"
      @set-app-mode="(m: AppMode) => emit('set-app-mode', m)"
    />

    <main class="flex-1 min-h-0 flex">
      <slot />
    </main>
  </div>
</template>
