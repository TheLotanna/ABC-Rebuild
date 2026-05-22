<script setup lang="ts">
import { ref, computed } from 'vue';
import { HelpCircle, Send, X } from 'lucide-vue-next';
import type { AssistanceRequest } from '@agent-builder/shared';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';

const props = defineProps<{
  open: boolean;
  request: AssistanceRequest | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'respond', payload: { response?: string; fileId?: string; selectedChoice?: string }): void;
}>();

const textResponse = ref('');
const selectedChoice = ref('');
const file = ref<File | null>(null);

const inputType = computed(() => props.request?.inputType);
const showTextInput = computed(
  () =>
    inputType.value === 'text' ||
    !inputType.value ||
    (inputType.value !== 'choice' && inputType.value !== 'file'),
);

const submitDisabled = computed(() => {
  if (inputType.value === 'text') return !textResponse.value.trim();
  if (inputType.value === 'choice') return !selectedChoice.value;
  if (inputType.value === 'file') return !file.value;
  return false;
});

function close() {
  emit('update:open', false);
}

function reset() {
  textResponse.value = '';
  selectedChoice.value = '';
  file.value = null;
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  file.value = input.files?.[0] || null;
}

function handleSubmit() {
  const req = props.request;
  if (!req) return;

  if (req.inputType === 'text') {
    emit('respond', { response: textResponse.value });
  } else if (req.inputType === 'choice') {
    emit('respond', { selectedChoice: selectedChoice.value });
  } else if (req.inputType === 'file' && file.value) {
    const reader = new FileReader();
    const f = file.value;
    reader.onload = () => {
      const fileId = crypto.randomUUID();
      emit('respond', { fileId, response: f.name });
    };
    reader.readAsDataURL(f);
  }
  reset();
  close();
}
</script>

<template>
  <div
    v-if="open && request"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div class="bg-background border rounded-lg shadow-xl w-full sm:max-w-md flex flex-col">
      <div class="px-6 py-4 border-b">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="flex items-center gap-2 text-lg font-semibold">
              <HelpCircle class="w-5 h-5 text-primary" />
              Agent Needs Your Input
            </h2>
            <p class="text-sm text-muted-foreground mt-1">{{ request.question }}</p>
          </div>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0 shrink-0" @click="close">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div class="px-6 py-4 space-y-4">
        <div
          v-if="request.context"
          class="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md"
        >
          {{ request.context }}
        </div>

        <div v-if="showTextInput" class="space-y-2">
          <label for="response" class="text-sm font-medium">Your Response</label>
          <textarea
            id="response"
            v-model="textResponse"
            placeholder="Type your response..."
            class="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>

        <div v-if="request.inputType === 'choice' && request.choices" class="space-y-2">
          <span class="text-sm font-medium">Select an option</span>
          <div class="space-y-2">
            <label
              v-for="(choice, idx) in request.choices"
              :key="idx"
              class="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="radio"
                :value="choice"
                v-model="selectedChoice"
                class="h-4 w-4 accent-primary"
              />
              <span class="font-normal">{{ choice }}</span>
            </label>
          </div>
        </div>

        <div v-if="request.inputType === 'file'" class="space-y-2">
          <label for="file-upload" class="text-sm font-medium">Upload a File</label>
          <div class="flex gap-2 items-center">
            <Input id="file-upload" type="file" class="flex-1" @change="onFileChange" />
            <Button
              v-if="file"
              variant="ghost"
              size="sm"
              class="h-9 w-9 p-0"
              @click="file = null"
            >
              ×
            </Button>
          </div>
          <p v-if="file" class="text-sm text-muted-foreground">
            Selected: {{ file.name }} ({{ (file.size / 1024).toFixed(1) }} KB)
          </p>
        </div>
      </div>

      <div class="px-6 py-4 border-t flex justify-end gap-2">
        <Button variant="outline" @click="close">Cancel</Button>
        <Button :disabled="submitDisabled" @click="handleSubmit">
          <Send class="w-4 h-4 mr-2" />
          Send Response
        </Button>
      </div>
    </div>
  </div>
</template>
