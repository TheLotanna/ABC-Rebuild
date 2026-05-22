<template>
  <RouterView />
  <Toaster rich-colors />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
import { Toaster } from 'vue-sonner';
</script>
