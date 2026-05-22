<template>
  <RouterView />
  <Toaster rich-colors />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import { Toaster } from 'vue-sonner';
import { useColorMode } from '@vueuse/core';

// Bootstrap theme on first paint. `useColorMode` flips a `dark` class on
// `<html>` (matches Tailwind's `darkMode: 'class'` config) and persists the
// user's choice to localStorage under the default key `vueuse-color-scheme`.
// Toolbar.vue and MobileNav.vue call `useColorMode()` again to read/flip
// the same reactive store.
useColorMode({
  attribute: 'class',
  selector: 'html',
  modes: { light: '', dark: 'dark' },
});
</script>
