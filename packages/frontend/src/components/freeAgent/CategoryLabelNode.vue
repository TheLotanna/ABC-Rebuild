<script setup lang="ts">
interface CategoryLabelNodeData {
  type: 'categoryLabel';
  label: string;
  color: string;
  toolCount: number;
}

defineProps<{ data: CategoryLabelNodeData }>();
</script>

<template>
  <div class="flex flex-col items-center pointer-events-none select-none">
    <div
      class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full opacity-80"
      :style="{
        color: data.color,
        backgroundColor: `${data.color}15`,
      }"
    >
      {{ data.label }}
    </div>
  </div>
</template>
