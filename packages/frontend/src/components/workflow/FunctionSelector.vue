<script setup lang="ts">
import { ref, computed } from 'vue';
import { Search, X } from 'lucide-vue-next';
import { functionDefinitions } from '@/lib/functionDefinitions';
import type { FunctionDefinition } from '@agent-builder/shared';
import { iconFor } from '@/components/workflow/iconRegistry';
import Card from '@/components/ui/Card.vue';
import Input from '@/components/ui/Input.vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';

defineProps<{ open: boolean }>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'select-function', functionDef: FunctionDefinition): void;
}>();

const categories = [
  { id: 'all', name: 'All Functions' },
  { id: 'string', name: 'String' },
  { id: 'logic', name: 'Logic' },
  { id: 'conditional', name: 'Conditional' },
  { id: 'memory', name: 'Memory' },
  { id: 'export', name: 'Export' },
  { id: 'url', name: 'URL' },
  { id: 'data', name: 'Data' },
];

const selectedCategory = ref('all');
const searchQuery = ref('');

const filteredFunctions = computed<FunctionDefinition[]>(() => {
  let funcs = functionDefinitions as FunctionDefinition[];
  if (selectedCategory.value !== 'all') {
    funcs = funcs.filter((f) => f.category === selectedCategory.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase();
    funcs = funcs.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
    );
  }
  return funcs;
});

function close() {
  emit('update:open', false);
}

function selectFunction(fn: FunctionDefinition) {
  emit('select-function', fn);
  searchQuery.value = '';
  selectedCategory.value = 'all';
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div
      class="bg-background border rounded-lg shadow-xl flex flex-col"
      :style="{
        width: '90vw',
        height: '90vh',
        maxWidth: '90vw',
        maxHeight: '90vh',
      }"
    >
      <div class="px-6 pt-6 pb-4 border-b shrink-0 flex items-start justify-between gap-2">
        <div>
          <h2 class="text-lg font-semibold">Add Function</h2>
          <p class="text-sm text-muted-foreground mt-1">
            Select a function to add to this stage
          </p>
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="close">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- Mobile layout -->
      <div class="flex-1 overflow-hidden flex flex-col xl:hidden">
        <div class="px-6 py-3 border-b">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              placeholder="Search functions..."
              class="pl-9 pr-9"
            />
            <button
              v-if="searchQuery"
              class="absolute right-3 top-1/2 -translate-y-1/2"
              @click="searchQuery = ''"
            >
              <X class="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>

        <div class="px-6 py-3 border-b overflow-x-auto">
          <div class="flex gap-2">
            <Button
              v-for="category in categories"
              :key="category.id"
              :variant="selectedCategory === category.id ? 'default' : 'outline'"
              size="sm"
              class="whitespace-nowrap"
              @click="selectedCategory = category.id"
            >
              {{ category.name }}
            </Button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-6 py-4">
          <div class="grid gap-3">
            <Card
              v-for="func in filteredFunctions"
              :key="func.id"
              class="p-4 cursor-pointer hover:shadow-md transition-all hover:ring-2 hover:ring-primary/20"
              @click="selectFunction(func)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  :class="func.color"
                >
                  <component :is="iconFor(func.iconName)" class="h-6 w-6" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <h4 class="text-sm font-semibold text-foreground">{{ func.name }}</h4>
                    <Badge variant="secondary" class="text-xs capitalize shrink-0">
                      {{ func.category }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground leading-relaxed">{{ func.description }}</p>
                  <div v-if="func.outputs.length > 1" class="flex gap-1 mt-2">
                    <Badge
                      v-for="output in func.outputs"
                      :key="output"
                      variant="outline"
                      class="text-[10px] px-1.5 py-0"
                    >
                      {{ output }}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          </div>
          <div v-if="filteredFunctions.length === 0" class="text-center py-12">
            <p class="text-sm text-muted-foreground">No functions found</p>
          </div>
        </div>
      </div>

      <!-- Desktop layout -->
      <div class="flex-1 overflow-hidden hidden xl:flex">
        <div class="w-64 border-r flex flex-col">
          <div class="p-4 border-b">
            <div class="relative">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                placeholder="Search..."
                class="pl-9 pr-9"
              />
              <button
                v-if="searchQuery"
                class="absolute right-3 top-1/2 -translate-y-1/2"
                @click="searchQuery = ''"
              >
                <X class="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase mb-3">
              Categories
            </h3>
            <div class="space-y-1">
              <button
                v-for="category in categories"
                :key="category.id"
                :class="[
                  'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                  selectedCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-foreground',
                ]"
                @click="selectedCategory = category.id"
              >
                {{ category.name }}
              </button>
            </div>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          <div class="grid grid-cols-1 2xl:grid-cols-2 gap-4">
            <Card
              v-for="func in filteredFunctions"
              :key="func.id"
              class="p-4 cursor-pointer hover:shadow-lg transition-all hover:ring-2 hover:ring-primary/20"
              @click="selectFunction(func)"
            >
              <div class="flex items-start gap-3">
                <div
                  class="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                  :class="func.color"
                >
                  <component :is="iconFor(func.iconName)" class="h-6 w-6" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <h4 class="text-sm font-semibold text-foreground">{{ func.name }}</h4>
                    <Badge variant="secondary" class="text-xs capitalize shrink-0">
                      {{ func.category }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground leading-relaxed">{{ func.description }}</p>
                  <div v-if="func.outputs.length > 1" class="flex gap-1 mt-2">
                    <Badge
                      v-for="output in func.outputs"
                      :key="output"
                      variant="outline"
                      class="text-[10px] px-1.5 py-0"
                    >
                      {{ output }}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          </div>
          <div v-if="filteredFunctions.length === 0" class="text-center py-12">
            <p class="text-sm text-muted-foreground">No functions found</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
