<template>
  <div
    class="browser-column"
    role="listbox"
    :aria-label="title"
    :aria-multiselectable="multiple"
  >
    <div class="browser-column__head">
      <select
        v-if="facetOptions"
        class="browser-column__facet"
        :value="facet"
        :aria-label="$t('library_manager.browser_facet')"
        @change="
          emit('update:facet', ($event.target as HTMLSelectElement).value)
        "
        @keydown.stop
      >
        <option
          v-for="option in facetOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <span v-else class="browser-column__title">{{ title }}</span>
      <Spinner v-if="loading" class="size-3" />
      <div class="browser-column__search">
        <Search :size="12" class="browser-column__search-icon" />
        <input
          v-model="searchInput"
          type="search"
          class="browser-column__search-input"
          :placeholder="$t('search')"
          :aria-label="`${$t('search')} ${title}`"
          @keydown.escape="searchInput = ''"
          @keydown.stop
        />
        <button
          v-if="searchInput"
          type="button"
          class="browser-column__search-clear"
          :aria-label="$t('clear')"
          @click="searchInput = ''"
        >
          <X :size="11" />
        </button>
      </div>
    </div>
    <div
      ref="scrollRef"
      class="browser-column__scroll"
      tabindex="0"
      @keydown="onKeydown"
    >
      <div
        class="browser-column__row browser-column__row--all"
        role="option"
        :aria-selected="selectedIds.length === 0"
        :class="{ 'browser-column__row--selected': selectedIds.length === 0 }"
        @click="emit('update:selectedIds', [])"
      >
        <span class="truncate">{{ allLabel }}</span>
      </div>
      <div class="browser-column__body" :style="{ height: `${totalSize}px` }">
        <div
          v-for="vRow in virtualRows"
          :key="vRow.key"
          class="browser-column__row"
          role="option"
          :aria-selected="vRow.selected"
          :class="{
            'browser-column__row--selected': vRow.selected,
            'browser-column__row--focused': vRow.index === focusIndex,
          }"
          :style="{ transform: `translateY(${vRow.start}px)` }"
          @click="onRowClick($event, vRow.index)"
        >
          <span v-if="vRow.item" class="truncate">{{ vRow.item.name }}</span>
          <span v-else class="browser-column__skeleton"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search, X } from "@lucide/vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { computed, ref, watch } from "vue";
import { Spinner } from "@/components/ui/spinner";
import type { GridItem } from "../columns";

const ROW_HEIGHT = 24;

const props = withDefaults(
  defineProps<{
    title: string;
    items: GridItem[];
    total?: number;
    loading: boolean;
    selectedIds: string[];
    multiple?: boolean;
    search: string;
    // what the column lists, chosen from a dropdown in its head
    facet?: string;
    facetOptions?: Array<{ value: string; label: string }>;
  }>(),
  {
    total: undefined,
    multiple: false,
    facet: undefined,
    facetOptions: undefined,
  },
);

const emit = defineEmits<{
  "update:selectedIds": [ids: string[]];
  "update:search": [search: string];
  "update:facet": [facet: string];
  ensureLoaded: [index: number];
  jumpToLetter: [letters: string];
}>();

const scrollRef = ref<HTMLElement | null>(null);
const focusIndex = ref(-1);

// the column search is applied a beat after typing stops
const searchInput = ref(props.search);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => emit("update:search", value.trim()), 250);
});
watch(
  () => props.search,
  (value) => {
    if (value !== searchInput.value.trim()) searchInput.value = value;
  },
);

const allLabel = computed(() => {
  const count = props.total ?? props.items.length;
  return `All (${count.toLocaleString()})`;
});

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.items.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    // the "All" row sits above the virtual list
    paddingStart: ROW_HEIGHT,
  })),
);

const totalSize = computed(() => virtualizer.value.getTotalSize());

const selectedSet = computed(() => new Set(props.selectedIds));

const virtualRows = computed(() =>
  virtualizer.value.getVirtualItems().map((vItem) => {
    const item = props.items[vItem.index] as GridItem | undefined;
    return {
      key: String(vItem.key),
      index: vItem.index,
      start: vItem.start - ROW_HEIGHT,
      item,
      selected: !!item && selectedSet.value.has(item.item_id),
    };
  }),
);

watch(
  () => virtualizer.value.getVirtualItems().at(-1)?.index ?? -1,
  (lastIndex) => {
    if (lastIndex < 0) return;
    emit("ensureLoaded", lastIndex);
    if (lastIndex >= props.items.length - 40) {
      emit("ensureLoaded", props.items.length);
    }
  },
  { immediate: true },
);

function select(index: number, additive: boolean) {
  const item = props.items[index];
  if (!item) return;
  focusIndex.value = index;
  if (props.multiple && additive) {
    const next = new Set(selectedSet.value);
    if (next.has(item.item_id)) next.delete(item.item_id);
    else next.add(item.item_id);
    emit("update:selectedIds", [...next]);
    return;
  }
  emit("update:selectedIds", [item.item_id]);
}

function onRowClick(event: MouseEvent, index: number) {
  scrollRef.value?.focus({ preventScroll: true });
  select(index, event.ctrlKey || event.metaKey);
}

function onKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const last = props.items.length - 1;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveFocus(Math.min(last, focusIndex.value + 1));
      return;
    case "ArrowUp":
      event.preventDefault();
      moveFocus(Math.max(0, focusIndex.value - 1));
      return;
    case "Home":
      event.preventDefault();
      moveFocus(0);
      return;
    case "End":
      event.preventDefault();
      moveFocus(last);
      return;
    case "Escape":
      emit("update:selectedIds", []);
      return;
  }
  // "?" opens the shortcut help; every other printable key jumps by letter
  if (event.key.length === 1 && event.key !== "?") {
    event.preventDefault();
    typeAhead(event.key);
  }
}

function moveFocus(index: number) {
  if (index < 0) return;
  select(index, false);
  virtualizer.value.scrollToIndex(index, { align: "auto" });
  emit("ensureLoaded", index);
}

let buffer = "";
let bufferTimer: ReturnType<typeof setTimeout> | undefined;
function typeAhead(char: string) {
  clearTimeout(bufferTimer);
  buffer += char.toLowerCase();
  bufferTimer = setTimeout(() => {
    buffer = "";
  }, 700);
  const from = focusIndex.value + (buffer.length === 1 ? 1 : 0);
  const count = props.items.length;
  for (let step = 0; step < count; step++) {
    const index = (from + step) % count;
    const item = props.items[index];
    if (item && item.name.toLowerCase().startsWith(buffer)) {
      moveFocus(index);
      return;
    }
  }
  emit("jumpToLetter", buffer);
}

defineExpose({
  scrollToIndex: (index: number) => moveFocus(index),
});
</script>

<style scoped>
.browser-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: rgb(var(--v-theme-panel));
  font-size: 12px;
  user-select: none;
}

.browser-column__head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 6px 0 10px;
  flex: none;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.62);
}

.browser-column__facet {
  max-width: 50%;
  height: 20px;
  padding: 0 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  outline: none;
}

.browser-column__facet:hover,
.browser-column__facet:focus-visible {
  background: rgba(var(--v-theme-fg), 0.08);
}

.browser-column__facet option {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  color: rgb(var(--v-theme-fg));
  background: rgb(var(--v-theme-panel));
}

.browser-column__search {
  position: relative;
  margin-left: auto;
  width: 50%;
  min-width: 90px;
}

.browser-column__search-icon {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(var(--v-theme-fg), 0.4);
  pointer-events: none;
}

.browser-column__search-input {
  width: 100%;
  height: 20px;
  padding: 0 18px 0 20px;
  border-radius: 10px;
  border: 0;
  background: rgba(var(--v-theme-fg), 0.06);
  color: rgb(var(--v-theme-fg));
  font-size: 11px;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  outline: none;
}

.browser-column__search-input:focus {
  background: rgba(var(--v-theme-fg), 0.1);
}

/* the browser's own cancel glyph gives way to the button beside it */
.browser-column__search-input::-webkit-search-cancel-button {
  display: none;
}

.browser-column__search-clear {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 7px;
  padding: 0;
  background: transparent;
  color: rgba(var(--v-theme-fg), 0.5);
  cursor: pointer;
}

.browser-column__search-clear:hover {
  color: rgb(var(--v-theme-fg));
  background: rgba(var(--v-theme-fg), 0.1);
}

.browser-column__scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  outline: none;
}

.browser-column__body {
  position: relative;
}

.browser-column__row {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  color: rgba(var(--v-theme-fg), 0.72);
  white-space: nowrap;
  cursor: default;
}

.browser-column__body .browser-column__row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.browser-column__row--all {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-panel));
  color: rgb(var(--v-theme-fg));
  font-weight: 500;
}

.browser-column__row:hover {
  background: rgba(var(--v-theme-fg), 0.06);
}

.browser-column__row--selected,
.browser-column__row--selected:hover {
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-fg));
}

.browser-column__scroll:focus-visible .browser-column__row--focused {
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.browser-column__skeleton {
  display: block;
  width: 50%;
  height: 8px;
  border-radius: 4px;
  background: rgba(var(--v-theme-fg), 0.08);
}
</style>
