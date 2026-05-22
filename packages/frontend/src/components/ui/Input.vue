<script setup lang="ts">
import { computed, useAttrs } from 'vue';

const props = defineProps<{
  modelValue?: string | number;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const classes = computed(() => [
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
  attrs.class,
]);
const rest = computed(() => {
  const { class: _omit, ...r } = attrs;
  return r;
});

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    :value="props.modelValue"
    :class="classes"
    v-bind="rest"
    @input="onInput"
  />
</template>
