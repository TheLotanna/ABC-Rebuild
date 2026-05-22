<script setup lang="ts">
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() => [
  'p-6 pt-0',
  attrs.class,
]);
const rest = computed(() => {
  const { class: _omit, ...r } = attrs;
  return r;
});
</script>

<template>
  <div :class="classes" v-bind="rest">
    <slot />
  </div>
</template>
