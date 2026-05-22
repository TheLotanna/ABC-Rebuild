<script setup lang="ts">
import { X } from '@lucide/vue';
import Button from '@/components/ui/Button.vue';

defineProps<{ open: boolean }>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

function close() {
  emit('update:open', false);
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    @click.self="close"
  >
    <div class="bg-background border rounded-lg flex flex-col shadow-xl w-full max-w-3xl max-h-[85vh]">
      <!-- Header -->
      <div class="px-6 py-4 border-b shrink-0 flex items-start justify-between gap-2">
        <div>
          <h2 class="text-2xl font-semibold">Agent Builder Console Help</h2>
          <p class="text-sm text-muted-foreground mt-1">
            A comprehensive guide to building AI agent workflows
          </p>
        </div>
        <Button variant="ghost" size="sm" class="h-8 w-8 p-0 shrink-0" @click="close">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- Body (scrollable) -->
      <div class="flex-1 min-h-0 overflow-auto px-6 py-4 space-y-6">
        <!-- Overview -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Overview</h3>
          <p class="text-sm text-muted-foreground">
            Agent Builder Console (ABC) lets you create multi-stage AI workflows where agents and functions work together to process data, make decisions, and produce results.
          </p>
        </section>

        <div class="h-px bg-border" />

        <!-- Stages -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Stages</h3>
          <p class="text-sm text-muted-foreground mb-3">
            Your workflow is organized into <strong>Stages</strong>. Each stage can contain multiple agents and functions that run in parallel.
          </p>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li><strong>Add Stage:</strong> Click the "Add Stage" button to create a new stage in your workflow</li>
            <li><strong>Stage Order:</strong> Stages execute sequentially from top to bottom (Stage 1, then Stage 2, etc.)</li>
            <li><strong>Parallel Execution:</strong> All cards within the same stage run simultaneously</li>
          </ul>
        </section>

        <div class="h-px bg-border" />

        <!-- Agents & Functions -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Agents &amp; Functions</h3>
          <p class="text-sm text-muted-foreground mb-3">
            Drag items from the Library panel onto stages to build your workflow:
          </p>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li><strong>Agents:</strong> AI-powered components that can reason, analyze, and generate content using various models (GPT-4, Claude, Gemini, etc.)</li>
            <li><strong>Functions:</strong> Pre-built utilities like web scraping, API calls, Google search, weather data, file parsing, and more</li>
            <li><strong>Excel Input:</strong> Special input source that loads data from Excel files for batch processing</li>
          </ul>
        </section>

        <div class="h-px bg-border" />

        <!-- Placeholders -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Using Placeholders: <code>{{ '{input}' }}</code> and <code>{{ '{prompt}' }}</code></h3>
          <p class="text-sm text-muted-foreground mb-3">
            Use placeholders in your agent prompts and function parameters to reference data:
          </p>

          <div class="space-y-4">
            <div class="bg-muted p-3 rounded-md">
              <h4 class="font-semibold text-sm mb-2"><code>{{ '{input}' }}</code></h4>
              <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-2">
                <li><strong>Stage 1:</strong> Contains the original user input or trigger text</li>
                <li><strong>Later Stages:</strong> Contains the concatenated outputs from all connected cards in previous stages</li>
              </ul>
            </div>

            <div class="bg-muted p-3 rounded-md">
              <h4 class="font-semibold text-sm mb-2"><code>{{ '{prompt}' }}</code></h4>
              <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-2">
                <li><strong>All Stages:</strong> Always contains the original input from Stage 1</li>
                <li><strong>Use Case:</strong> Access the initial user input even in later stages when <code>{{ '{input}' }}</code> has been replaced with previous outputs</li>
              </ul>
            </div>

            <div class="bg-accent/50 p-3 rounded-md border border-border">
              <h4 class="font-semibold text-sm mb-2">Example:</h4>
              <p class="text-xs text-muted-foreground font-mono mb-2">Stage 1 prompt: "Summarize this: {{ '{input}' }}"</p>
              <p class="text-xs text-muted-foreground font-mono mb-2">Stage 2 prompt: "Translate to French: {{ '{input}' }}"</p>
              <p class="text-xs text-muted-foreground font-mono">Stage 3 prompt: "Compare the original ({{ '{prompt}' }}) with translation ({{ '{input}' }})"</p>
            </div>
          </div>
        </section>

        <div class="h-px bg-border" />

        <!-- Linking Cards -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Linking Cards</h3>
          <p class="text-sm text-muted-foreground mb-3">
            Connect cards between stages to pass data through your workflow:
          </p>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li><strong>Click Output:</strong> Click the circular connection point on the right edge of a source card</li>
            <li><strong>Click Input:</strong> Click the connection point on the left edge of a target card in the next stage</li>
            <li><strong>Data Flow:</strong> Connected cards pass their output as input to downstream cards</li>
            <li><strong>Multiple Connections:</strong> A card can receive input from multiple sources (outputs are concatenated)</li>
            <li><strong>Delete Links:</strong> Click on a connection line and press Delete to remove it</li>
          </ul>
        </section>

        <div class="h-px bg-border" />

        <!-- Properties Panel -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Properties Panel</h3>
          <p class="text-sm text-muted-foreground mb-3">
            Click any card to view and edit its properties:
          </p>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li><strong>Agents:</strong> Configure name, system prompt, and user prompt template</li>
            <li><strong>Functions:</strong> Set required parameters based on the function type (URLs, search text, separators, etc.)</li>
            <li><strong>Output Preview:</strong> View the execution results after running the workflow or individual agents/functions</li>
            <li><strong>Real-time Updates:</strong> Changes are saved automatically as you type</li>
          </ul>
        </section>

        <div class="h-px bg-border" />

        <!-- Toolbar Actions -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Toolbar Actions</h3>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li><strong>Add Stage:</strong> Create a new stage in your workflow</li>
            <li><strong>Load:</strong> Import a previously saved workflow from a JSON file</li>
            <li><strong>Save:</strong> Export your current workflow as a JSON file for backup or sharing</li>
            <li><strong>Clear:</strong> Remove all stages and reset the workflow to start fresh</li>
            <li><strong>Run Workflow:</strong> Execute your complete workflow from Stage 1 through to the end</li>
          </ul>
        </section>

        <div class="h-px bg-border" />

        <!-- Running Workflows -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Running Workflows</h3>
          <p class="text-sm text-muted-foreground mb-3">
            Execute your workflow to see results:
          </p>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li><strong>Provide Input:</strong> Enter your initial input text in the dialog that appears</li>
            <li><strong>Sequential Execution:</strong> Stages run one after another, waiting for all cards in a stage to complete before moving to the next</li>
            <li><strong>Output Log:</strong> View real-time execution progress and results in the output panel at the bottom</li>
            <li><strong>Card Outputs:</strong> Click any card after execution to view its specific output in the Properties panel</li>
          </ul>
        </section>

        <div class="h-px bg-border" />

        <!-- Excel Integration -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Excel &amp; File Upload</h3>
          <p class="text-sm text-muted-foreground mb-3">
            Extract text from files and add them to your input:
          </p>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li><strong>Upload Button:</strong> Click "Upload Files" in the Input/Trigger section to select files</li>
            <li><strong>Supported Formats:</strong> Supports text files, PDFs, Word docs (.docx), Excel (.xlsx, .xls), code files, and more</li>
            <li><strong>Excel Files:</strong> When uploading Excel files, a selector appears to choose specific sheets and rows</li>
            <li><strong>Text Extraction:</strong> Extracted content is automatically added to the Input/Trigger field for use with <code>{{ '{input}' }}</code> or <code>{{ '{prompt}' }}</code></li>
          </ul>
        </section>

        <div class="h-px bg-border" />

        <!-- Tips -->
        <section>
          <h3 class="text-lg font-semibold mb-2">Tips &amp; Best Practices</h3>
          <ul class="text-sm text-muted-foreground space-y-2 list-disc list-inside">
            <li>Start simple with 1-2 stages and test before adding complexity</li>
            <li>Use descriptive names for agents to track their purpose</li>
            <li>Test individual agents by clicking "Test Agent" in the properties panel</li>
            <li>Save your workflows frequently to avoid losing work</li>
            <li>Use parallel execution (multiple cards in one stage) for independent tasks</li>
            <li>Chain stages for sequential processing (summarize → analyze → report)</li>
            <li>Monitor the output log to debug issues during execution</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
