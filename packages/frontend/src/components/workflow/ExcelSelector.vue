<script setup lang="ts">
import { ref, computed } from 'vue';
import { X, FileText, Filter } from '@lucide/vue';
import {
  type ExcelData,
  formatExcelDataForChat,
} from '@/utils/parseExcel';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';
import Input from '@/components/ui/Input.vue';

interface SelectedSheetData {
  sheetName: string;
  headers: string[];
  selectedRows: Record<string, unknown>[];
}

interface ExcelSelectionResult {
  fileName: string;
  selectedData: SelectedSheetData[];
  formattedContent: string;
  totalRows: number;
}

const props = defineProps<{ excelData: ExcelData }>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', payload: ExcelSelectionResult): void;
}>();

const activeSheetIndex = ref(0);
const selectedRows = ref<Record<number, Set<number>>>({});
const showFilters = ref(false);
const containsInput = ref('');
const doesNotContainInput = ref('');
const appliedContains = ref<string[]>([]);
const appliedDoesNotContain = ref<string[]>([]);
const headerRowIndex = ref<Record<number, number>>({});
const processedSheets = ref<ExcelData['sheets']>([...props.excelData.sheets]);

const activeSheet = computed(() => processedSheets.value[activeSheetIndex.value]);

const hasActiveFilters = computed(
  () => appliedContains.value.length > 0 || appliedDoesNotContain.value.length > 0,
);

function rowMatchesFilters(row: Record<string, unknown>): boolean {
  const rowJSON = JSON.stringify(row).toLowerCase();
  if (appliedContains.value.length > 0) {
    const match = appliedContains.value.some((v) =>
      rowJSON.includes(v.toLowerCase().trim()),
    );
    if (!match) return false;
  }
  if (appliedDoesNotContain.value.length > 0) {
    const blocked = appliedDoesNotContain.value.some((v) =>
      rowJSON.includes(v.toLowerCase().trim()),
    );
    if (blocked) return false;
  }
  return true;
}

const filteredActiveSheetData = computed(() => {
  if (!hasActiveFilters.value) return activeSheet.value.jsonData;
  return activeSheet.value.jsonData.filter(rowMatchesFilters);
});

const filteredActiveSheetIndices = computed(() => {
  if (!hasActiveFilters.value) {
    return Array.from({ length: activeSheet.value.jsonData.length }, (_, i) => i);
  }
  return activeSheet.value.jsonData
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowMatchesFilters(row))
    .map(({ index }) => index);
});

function applyFilters() {
  appliedContains.value = containsInput.value
    ? containsInput.value.split(',').map((v) => v.trim()).filter(Boolean)
    : [];
  appliedDoesNotContain.value = doesNotContainInput.value
    ? doesNotContainInput.value.split(',').map((v) => v.trim()).filter(Boolean)
    : [];
}

function clearFilters() {
  containsInput.value = '';
  doesNotContainInput.value = '';
  appliedContains.value = [];
  appliedDoesNotContain.value = [];
}

function getSheetSelectionCount(sheetIndex: number): number {
  return selectedRows.value[sheetIndex]?.size || 0;
}

function getFilteredSheetDataCount(sheetIndex: number): number {
  if (!hasActiveFilters.value) return processedSheets.value[sheetIndex].jsonData.length;
  return processedSheets.value[sheetIndex].jsonData.filter(rowMatchesFilters).length;
}

function isSheetFullySelected(sheetIndex: number): boolean {
  const filteredCount = getFilteredSheetDataCount(sheetIndex);
  const selectionCount = getSheetSelectionCount(sheetIndex);
  return selectionCount > 0 && selectionCount === filteredCount;
}

function isSheetPartiallySelected(sheetIndex: number): boolean {
  const selectionCount = getSheetSelectionCount(sheetIndex);
  return selectionCount > 0 && !isSheetFullySelected(sheetIndex);
}

function isRowSelected(sheetIndex: number, rowIndex: number): boolean {
  return selectedRows.value[sheetIndex]?.has(rowIndex) || false;
}

function toggleRowSelection(sheetIndex: number, rowIndex: number) {
  const next = { ...selectedRows.value };
  if (!next[sheetIndex]) next[sheetIndex] = new Set();
  else next[sheetIndex] = new Set(next[sheetIndex]);
  if (next[sheetIndex].has(rowIndex)) next[sheetIndex].delete(rowIndex);
  else next[sheetIndex].add(rowIndex);
  selectedRows.value = next;
}

function toggleSheetSelection(sheetIndex: number) {
  const fullySelected = isSheetFullySelected(sheetIndex);
  const next = { ...selectedRows.value };
  if (fullySelected) {
    next[sheetIndex] = new Set();
  } else if (sheetIndex === activeSheetIndex.value) {
    next[sheetIndex] = new Set(filteredActiveSheetIndices.value);
  } else {
    const sheet = processedSheets.value[sheetIndex];
    const indices = hasActiveFilters.value
      ? sheet.jsonData
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => rowMatchesFilters(row))
          .map(({ index }) => index)
      : Array.from({ length: sheet.jsonData.length }, (_, i) => i);
    next[sheetIndex] = new Set(indices);
  }
  selectedRows.value = next;
}

function selectFullWorkbook() {
  const next: Record<number, Set<number>> = {};
  processedSheets.value.forEach((sheet, sheetIndex) => {
    if (hasActiveFilters.value) {
      const indices = sheet.jsonData
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => rowMatchesFilters(row))
        .map(({ index }) => index);
      next[sheetIndex] = new Set(indices);
    } else {
      next[sheetIndex] = new Set(
        Array.from({ length: sheet.jsonData.length }, (_, i) => i),
      );
    }
  });
  selectedRows.value = next;
}

function clearAllSelections() {
  selectedRows.value = {};
}

const totalSelectionCount = computed(() =>
  Object.values(selectedRows.value).reduce((total, set) => total + set.size, 0),
);

const selectedSheetsCount = computed(
  () => Object.values(selectedRows.value).filter((set) => set.size > 0).length,
);

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function setHeaderRow() {
  const selectedRowIndices = Array.from(selectedRows.value[activeSheetIndex.value] || []);
  if (selectedRowIndices.length !== 1) return;

  const newHeaderRowIndex = selectedRowIndices[0];
  const originalSheet = props.excelData.sheets[activeSheetIndex.value];

  const newHeaderRow = originalSheet.jsonData[newHeaderRowIndex];
  const newHeaders = originalSheet.headers.map((oldHeader) => {
    const cellValue = newHeaderRow[oldHeader];
    if (cellValue === null || cellValue === undefined) return oldHeader;
    return String(cellValue);
  });

  const newJsonData = originalSheet.jsonData
    .slice(newHeaderRowIndex + 1)
    .map((oldRow) => {
      const newRow: Record<string, unknown> = {};
      originalSheet.headers.forEach((oldHeader, index) => {
        newRow[newHeaders[index]] = oldRow[oldHeader];
      });
      return newRow;
    });

  const updatedSheets = [...processedSheets.value];
  updatedSheets[activeSheetIndex.value] = {
    sheetName: originalSheet.sheetName,
    headers: newHeaders,
    jsonData: newJsonData,
  };
  processedSheets.value = updatedSheets;
  headerRowIndex.value = {
    ...headerRowIndex.value,
    [activeSheetIndex.value]: newHeaderRowIndex,
  };
  selectedRows.value = {
    ...selectedRows.value,
    [activeSheetIndex.value]: new Set(),
  };
}

function confirmSelection() {
  const selectedData: SelectedSheetData[] = [];
  let totalRows = 0;

  Object.entries(selectedRows.value).forEach(([sheetIndexStr, rowIndices]) => {
    const sheetIndex = parseInt(sheetIndexStr);
    const sheet = processedSheets.value[sheetIndex];
    if (rowIndices.size > 0) {
      const rows = Array.from(rowIndices)
        .map((rowIndex) => sheet.jsonData[rowIndex])
        .filter(Boolean) as Record<string, unknown>[];
      selectedData.push({
        sheetName: sheet.sheetName,
        headers: sheet.headers,
        selectedRows: rows,
      });
      totalRows += rows.length;
    }
  });

  const formattedContent = formatExcelDataForChat(props.excelData.fileName, selectedData);

  emit('select', {
    fileName: props.excelData.fileName,
    selectedData,
    formattedContent,
    totalRows,
  });
}

function close() {
  emit('close');
}
</script>

<template>
  <div class="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
    <div class="bg-background rounded-2xl shadow-2xl w-[90vw] h-[90vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b flex-shrink-0">
        <div>
          <h2 class="text-xl font-semibold">Select Excel Data</h2>
          <p class="text-sm text-muted-foreground mt-1">
            {{ excelData.fileName }} • {{ excelData.sheets.length }} sheet{{ excelData.sheets.length !== 1 ? 's' : '' }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <Button
            variant="ghost"
            class="text-green-600 hover:text-green-700"
            @click="selectFullWorkbook"
          >
            {{ hasActiveFilters ? 'Select Filtered Workbook' : 'Select Full Workbook' }}
          </Button>
          <Button
            variant="ghost"
            class="text-destructive hover:text-destructive"
            @click="clearAllSelections"
          >
            Clear All
          </Button>
          <Button variant="ghost" size="icon" @click="close">
            <X class="w-5 h-5" />
          </Button>
        </div>
      </div>

      <!-- Filter Section -->
      <div v-if="showFilters" class="flex-shrink-0 border-b bg-muted/30 px-6 py-4">
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="text-xs font-medium text-muted-foreground mb-2 block">
              Contains (comma separated)
            </label>
            <Input
              v-model="containsInput"
              placeholder="e.g. apple, orange"
              class="h-9"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-muted-foreground mb-2 block">
              Does Not Contain (comma separated)
            </label>
            <Input
              v-model="doesNotContainInput"
              placeholder="e.g. banana, coconut"
              class="h-9"
            />
          </div>
        </div>
        <div class="flex gap-2 items-center">
          <Button size="sm" @click="applyFilters">Apply Filter</Button>
          <Button size="sm" variant="outline" @click="clearFilters">Clear Filter</Button>
          <Badge v-if="hasActiveFilters" variant="secondary" class="text-xs ml-2">
            Filters Active
          </Badge>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Sheet Tabs -->
        <div class="flex-shrink-0 border-b overflow-x-auto">
          <div class="flex px-6">
            <button
              v-for="(sheet, index) in excelData.sheets"
              :key="sheet.sheetName"
              :class="[
                'flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeSheetIndex === index
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ]"
              @click="activeSheetIndex = index"
            >
              <span>{{ sheet.sheetName }}</span>
              <Badge
                v-if="getSheetSelectionCount(index) > 0"
                variant="secondary"
                class="ml-2 text-xs"
              >
                {{ getSheetSelectionCount(index) }}
              </Badge>
              <Badge
                v-if="headerRowIndex[index] !== undefined"
                variant="outline"
                class="ml-2 text-xs"
              >
                H:{{ headerRowIndex[index] + 1 }}
              </Badge>
            </button>
          </div>
        </div>

        <!-- Sheet Content -->
        <div v-if="activeSheet" class="flex-1 flex flex-col min-h-0">
          <!-- Sheet Header -->
          <div class="flex-shrink-0 bg-muted/50 px-6 py-4 border-b">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 class="text-lg font-medium">{{ activeSheet.sheetName }}</h3>
                <p class="text-sm text-muted-foreground">
                  {{ hasActiveFilters
                    ? `${filteredActiveSheetData.length} filtered rows`
                    : `${activeSheet.jsonData.length} rows` }}
                  • {{ activeSheet.headers.length }} columns
                </p>
              </div>
              <div class="flex items-center gap-3 flex-wrap">
                <Button
                  variant="ghost"
                  size="icon"
                  :class="showFilters ? 'bg-accent' : ''"
                  @click="showFilters = !showFilters"
                >
                  <Filter class="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  :disabled="!selectedRows[activeSheetIndex] || selectedRows[activeSheetIndex]?.size !== 1"
                  title="Select exactly one row to set as header"
                  @click="setHeaderRow"
                >
                  Set Header
                </Button>
                <Button
                  :variant="isSheetFullySelected(activeSheetIndex) ? 'default' : 'outline'"
                  @click="toggleSheetSelection(activeSheetIndex)"
                >
                  {{ isSheetFullySelected(activeSheetIndex)
                    ? 'Deselect All'
                    : hasActiveFilters ? 'Select Filtered' : 'Select All' }}
                </Button>
                <div class="text-sm text-muted-foreground">
                  {{ getSheetSelectionCount(activeSheetIndex) }} of
                  {{ hasActiveFilters ? filteredActiveSheetData.length : activeSheet.jsonData.length }} selected
                </div>
              </div>
            </div>
          </div>

          <!-- Table -->
          <div class="flex-1 min-h-0">
            <div
              v-if="filteredActiveSheetData.length === 0"
              class="flex items-center justify-center h-full"
            >
              <div class="text-center">
                <FileText class="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p class="text-muted-foreground">
                  {{ hasActiveFilters
                    ? 'No rows match the current filters'
                    : 'No data in this sheet' }}
                </p>
              </div>
            </div>
            <div v-else class="h-full w-full overflow-x-auto overflow-y-auto border border-border">
              <div class="min-w-full inline-block align-top">
                <table class="w-full border-collapse">
                  <thead class="sticky top-0 z-20 bg-muted">
                    <tr>
                      <th class="sticky left-0 z-30 w-12 px-4 py-3 bg-muted border-r">
                        <input
                          type="checkbox"
                          class="h-4 w-4 accent-primary"
                          :checked="isSheetFullySelected(activeSheetIndex)"
                          :indeterminate="isSheetPartiallySelected(activeSheetIndex)"
                          @change="toggleSheetSelection(activeSheetIndex)"
                        />
                      </th>
                      <th class="sticky left-12 z-30 w-20 px-4 py-3 bg-muted border-r text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Row
                      </th>
                      <th
                        v-for="(header, headerIndex) in activeSheet.headers"
                        :key="`header-${headerIndex}`"
                        class="min-w-[160px] px-4 py-3 bg-muted text-left text-xs font-medium text-muted-foreground uppercase tracking-wider border-r"
                      >
                        <div class="truncate" :title="header">{{ header }}</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="bg-background divide-y">
                    <template v-for="(row, rowIndex) in activeSheet.jsonData" :key="`row-${rowIndex}`">
                      <tr
                        v-if="!hasActiveFilters || filteredActiveSheetIndices.includes(rowIndex)"
                        :class="[
                          'hover:bg-muted/50 cursor-pointer transition-colors',
                          isRowSelected(activeSheetIndex, rowIndex) ? 'bg-primary/10' : '',
                        ]"
                        @click="toggleRowSelection(activeSheetIndex, rowIndex)"
                      >
                        <td
                          :class="[
                            'sticky left-0 z-10 w-12 px-4 py-3 border-r',
                            isRowSelected(activeSheetIndex, rowIndex) ? 'bg-primary/10' : 'bg-background',
                          ]"
                        >
                          <input
                            type="checkbox"
                            class="h-4 w-4 accent-primary"
                            :checked="isRowSelected(activeSheetIndex, rowIndex)"
                            @click.stop
                            @change="toggleRowSelection(activeSheetIndex, rowIndex)"
                          />
                        </td>
                        <td
                          :class="[
                            'sticky left-12 z-10 w-20 px-4 py-3 border-r text-sm text-muted-foreground font-medium',
                            isRowSelected(activeSheetIndex, rowIndex) ? 'bg-primary/10' : 'bg-background',
                          ]"
                        >
                          {{ rowIndex + 1 }}
                        </td>
                        <td
                          v-for="(header, cellIndex) in activeSheet.headers"
                          :key="`cell-${rowIndex}-${cellIndex}`"
                          class="min-w-[160px] px-4 py-3 text-sm border-r"
                        >
                          <div
                            class="truncate max-w-[140px]"
                            :title="formatCellValue(row[header])"
                          >
                            {{ formatCellValue(row[header]) }}
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between p-6 border-t flex-shrink-0">
        <div class="text-sm text-muted-foreground">
          {{ totalSelectionCount }} total rows selected across
          {{ selectedSheetsCount }} sheet{{ selectedSheetsCount !== 1 ? 's' : '' }}
        </div>
        <div class="flex gap-3">
          <Button variant="outline" @click="close">Cancel</Button>
          <Button :disabled="totalSelectionCount === 0" @click="confirmSelection">
            Add {{ totalSelectionCount }} Row{{ totalSelectionCount !== 1 ? 's' : '' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
