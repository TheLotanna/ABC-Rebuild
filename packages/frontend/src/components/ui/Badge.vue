<script setup lang="ts">
import { computed, useAttrs } from 'vue';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline';

const props = withDefaults(defineProps<{ variant?: Variant }>(), {
  variant: 'default',
});

defineOptions({ inheritAttrs: false });

const variantClasses: Record<Variant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
  outline: 'text-foreground',
};

const attrs = useAttrs();
const classes = computed(() => [
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  variantClasses[props.variant],
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
