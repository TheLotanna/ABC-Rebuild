<script setup lang="ts">
import { computed, useAttrs } from 'vue';

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() => [
  'text-2xl font-semibold leading-none tracking-tight',
  attrs.class,
]);
const rest = computed(() => {
  const { class: _omit, ...r } = attrs;
  return r;
});
</script>

<template>
  <h3 :class="classes" v-bind="rest">
    <slot />
  </h3>
</template>
