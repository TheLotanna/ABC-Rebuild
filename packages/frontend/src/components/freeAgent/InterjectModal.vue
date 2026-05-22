<script setup lang="ts">
import { ref } from 'vue';
import { MessageSquarePlus, Send, X } from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';

const props = defineProps<{ open: boolean }>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'submit', message: string): void;
}>();

const message = ref('');

function close() {
  emit('update:open', false);
}

function handleSubmit() {
  const text = message.value.trim();
  if (!text) return;
  emit('submit', text);
  message.value = '';
  close();
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div class="bg-background border rounded-lg shadow-xl w-full sm:max-w-md flex flex-col">
      <div class="px-6 py-4 border-b">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <MessageSquarePlus class="w-5 h-5 text-primary" />
              Interject Information
            </h2>
            <p class="text-sm text-muted-foreground mt-1">
              Add new information or guidance for the agent. This will be added to the
              blackboard and the current iteration will be re-executed with your input.
            </p>
          </div>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 shrink-0" @click="close">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="px-6 py-4 space-y-4">
        <div class="space-y-2">
          <label for="interject-message" class="text-sm font-medium">Your Message</label>
          <textarea
            id="interject-message"
            v-model="message"
            placeholder="Enter additional information, corrections, or guidance for the agent..."
            class="w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            autofocus
          />
        </div>
        <p class="text-xs text-muted-foreground">
          The agent will pause, receive your input as a user interjection on the
          blackboard, and then resume the current iteration with this new context.
        </p>
      </div>

      <div class="px-6 py-4 border-t flex justify-end gap-2">
        <Button variant="outline" @click="close">Cancel</Button>
        <Button :disabled="!message.trim()" @click="handleSubmit">
          <Send class="w-4 h-4 mr-2" />
          Submit &amp; Resume
        </Button>
      </div>
    </div>
  </div>
</template>
