<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { Palette, Trash2, Pencil } from '@lucide/vue';
import type { Note } from '@agent-builder/shared';
import Card from '../ui/Card.vue';
import Button from '../ui/Button.vue';

const props = defineProps<{
  note: Note;
  selected: boolean;
}>();

const emit = defineEmits<{
  update: [updates: Partial<Note>];
  delete: [];
}>();

const NOTE_COLORS = ['#fef3c7', '#fecaca', '#bfdbfe', '#bbf7d0', '#e9d5ff', '#fed7aa'];

const isEditing = ref(false);
const showColorPicker = ref(false);
const localContent = ref(props.note.content);
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

watch(() => props.note.content, v => { localContent.value = v; });

const currentSize = computed(() => props.note.size);

function calculateFontSize(content: string, width: number, height: number): number {
  if (!content || content.length === 0) return 32;
  const availableWidth = width - 48;
  const availableHeight = height - 48;
  let minSize = 12;
  let maxSize = 72;
  let optimalSize = minSize;
  for (let i = 0; i < 10; i++) {
    const testSize = (minSize + maxSize) / 2;
    const charWidth = testSize * 0.65;
    const lineHeight = testSize * 1.5;
    const charsPerLine = Math.floor(availableWidth / charWidth);
    const contentLines = content.split('\n');
    let totalLines = 0;
    contentLines.forEach(line => {
      const wrappedLines = Math.ceil(Math.max(1, line.length) / charsPerLine) || 1;
      totalLines += wrappedLines;
    });
    const requiredHeight = totalLines * lineHeight;
    if (requiredHeight <= availableHeight * 0.95) {
      optimalSize = testSize;
      minSize = testSize;
    } else {
      maxSize = testSize;
    }
  }
  return Math.max(12, Math.min(72, optimalSize));
}

const fontSize = computed(() =>
  calculateFontSize(
    isEditing.value ? localContent.value : props.note.content,
    currentSize.value.width,
    currentSize.value.height
  )
);

watch(isEditing, async editing => {
  if (editing) {
    await nextTick();
    textareaRef.value?.focus();
    textareaRef.value?.select();
  }
});

function handleKeyDown(e: KeyboardEvent) {
  if (props.selected && !isEditing.value && (e.key === 'Delete' || e.key === 'Backspace')) {
    e.preventDefault();
    emit('delete');
  }
}

function handleClickOutside(e: MouseEvent) {
  if (!isEditing.value) return;
  const target = e.target as HTMLElement;
  if (containerRef.value && !containerRef.value.contains(target) && !target.closest('.nodrag')) {
    isEditing.value = false;
    showColorPicker.value = false;
    if (localContent.value !== props.note.content) {
      emit('update', { content: localContent.value });
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
  document.addEventListener('mousedown', handleClickOutside, true);
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('mousedown', handleClickOutside, true);
});

function handleEditClick(e: MouseEvent) {
  e.stopPropagation();
  isEditing.value = true;
}
function handleColorChange(color: string) {
  emit('update', { color });
  showColorPicker.value = false;
}
function handleDoubleClick(e: MouseEvent) {
  e.stopPropagation();
  if (!isEditing.value) isEditing.value = true;
}
function toggleColorPicker(e: MouseEvent) {
  e.stopPropagation();
  showColorPicker.value = !showColorPicker.value;
}
function handleDelete(e: MouseEvent) {
  e.stopPropagation();
  emit('delete');
}
</script>

<template>
  <!-- Resize handles intentionally omitted — host wires @vue-flow/node-resizer in WorkflowCanvas. -->
  <div ref="containerRef" class="relative">
    <div
      v-if="!isEditing"
      class="absolute flex gap-0.5 z-10 nodrag"
      style="top: -34px; right: 0px"
    >
      <Button
        variant="ghost"
        size="sm"
        class="h-8 w-8 p-0 bg-background border border-border hover:bg-accent shadow-sm"
        @click="handleEditClick"
      >
        <Pencil class="h-4 w-4" />
      </Button>
      <div class="relative">
        <Button
          variant="ghost"
          size="sm"
          class="h-8 w-8 p-0 bg-background border border-border hover:bg-accent shadow-sm"
          @click="toggleColorPicker"
        >
          <Palette class="h-4 w-4" />
        </Button>
        <div
          v-if="showColorPicker"
          class="absolute top-8 right-0 p-2 bg-background border rounded-md shadow-lg flex gap-1 nodrag z-50"
        >
          <button
            v-for="color in NOTE_COLORS"
            :key="color"
            class="w-6 h-6 rounded border-2 border-border hover:scale-110 transition-transform"
            :style="{ backgroundColor: color }"
            @click.stop="handleColorChange(color)"
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 w-8 p-0 bg-background border border-border hover:bg-accent shadow-sm"
        @click="handleDelete"
      >
        <Trash2 class="h-4 w-4" />
      </Button>
    </div>

    <Card
      class="note-container relative shadow-lg border-2 rounded-none"
      :style="{
        backgroundColor: note.color,
        borderColor: selected ? 'hsl(var(--primary))' : 'transparent',
        width: `${currentSize.width}px`,
        height: `${currentSize.height}px`,
        overflow: 'visible',
      }"
      @dblclick="handleDoubleClick"
    >
      <div
        class="w-full h-full flex items-center justify-center p-4"
        style="overflow: hidden; position: relative"
      >
        <div v-if="isEditing" class="w-full h-full flex items-center justify-center p-4">
          <textarea
            ref="textareaRef"
            v-model="localContent"
            class="w-full h-full bg-transparent border-none outline-none resize-none text-center nodrag note-textarea scrollbar-hide"
            :style="{
              fontSize: `${fontSize}px`,
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              padding: '0',
              overflow: 'hidden',
            }"
            placeholder="Type your note..."
            @mousedown.stop
          />
        </div>
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-center"
          :style="{
            fontSize: `${fontSize}px`,
            lineHeight: '1.3',
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }"
        >
          {{ note.content || 'Click pencil to edit...' }}
        </div>
      </div>
    </Card>
  </div>
</template>
