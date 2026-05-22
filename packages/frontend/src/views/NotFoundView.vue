<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';

const route = useRoute();
onMounted(() => {
  console.error('404 Error: User attempted to access non-existent route:', route.fullPath);
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-background">
    <div class="text-center">
      <h1 class="mb-4 text-4xl font-bold text-foreground">404</h1>
      <p class="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
      <RouterLink to="/" class="text-primary underline hover:text-primary/80">
        Return to Home
      </RouterLink>
    </div>
  </div>
</template>
