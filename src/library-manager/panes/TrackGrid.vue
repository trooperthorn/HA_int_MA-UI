<template>
  <div
    ref="gridRef"
    class="track-grid"
    role="grid"
    tabindex="0"
    :aria-rowcount="rows.length"
    :style="{ '--row-height': `${rowHeight}px` }"
    @keydown="onKeydown"
  >
    <div ref="scrollRef" class="track-grid__scroll">
      <div class="track-grid__header" :style="gridTemplate" role="row">
        <div
          v-for="column in visibleColumns"
          :key="column.id"
          role="columnheader"
          class="track-grid__cell track-grid__cell--header"
          :class="[
            `track-grid__cell--${column.align}`,
            { 'track-grid__cell--sortable': canSort(column) },
          ]"
          :aria-sort="ariaSort(column.id)"
          @click="toggleSort(column.id)"
        >
          <!-- drag the right edge to resize; double-click puts the default back -->
          <span
            v-if="column.id !== 'menu'"
            class="track-grid__resizer"
            :data-resize="column.id"
            @pointerdown.stop.prevent="startResize($event, column)"
            @click.stop
            @dblclick.stop="emit('resizeColumn', column.id, undefined)"
          ></span>
          <template v-if="column.id === 'favorite'">
            <Heart :size="14" />
          </template>
          <template v-else-if="column.id === 'menu'">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="track-grid__icon-button"
                  :aria-label="$t('data_table.toggle_columns')"
                  @click.stop
                >
                  <Settings2 :size="14" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-[200px]">
                <DropdownMenuLabel>
                  {{ $t("data_table.toggle_columns") }}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  v-for="option in toggleableColumns"
                  :key="option.id"
                  :model-value="visibility[option.id]"
                  @update:model-value="
                    (value) => emit('toggleColumn', option.id, !!value)
                  "
                >
                  {{ $t(option.labelKey) }}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @select="emit('resetColumnWidths')">
                  {{ $t("library_manager.reset_column_widths") }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>
          <template v-else>
            <span class="truncate">{{ $t(column.labelKey) }}</span>
            <ArrowUp
              v-if="sort?.columnId === column.id && !sort.desc"
              :size="12"
              class="shrink-0"
            />
            <ArrowDown
              v-else-if="sort?.columnId === column.id && sort.desc"
              :size="12"
              class="shrink-0"
            />
          </template>
        </div>
      </div>

      <div class="track-grid__body" :style="{ height: `${totalSize}px` }">
        <div
          v-for="vRow in virtualRows"
          :key="vRow.key"
          class="track-grid__row"
          role="row"
          :aria-rowindex="vRow.index + 1"
          :aria-selected="vRow.selected"
          :class="{
            'track-grid__row--selected': vRow.selected,
            'track-grid__row--focused': vRow.index === focusIndex,
            'track-grid__row--playing': vRow.playing,
            'track-grid__row--odd': vRow.index % 2 === 1,
          }"
          :style="[gridTemplate, { transform: `translateY(${vRow.start}px)` }]"
          @click="onRowClick($event, vRow.index)"
          @dblclick="onRowDoubleClick($event, vRow.index)"
          @contextmenu.prevent="onRowMenu($event, vRow.index)"
        >
          <template v-if="vRow.track">
            <div
              v-for="column in visibleColumns"
              :key="column.id"
              role="gridcell"
              class="track-grid__cell"
              :class="`track-grid__cell--${column.align}`"
            >
              <template v-if="column.id === 'track_number'">
                <Play
                  v-if="vRow.playing"
                  :size="12"
                  fill="currentColor"
                  class="text-primary"
                />
                <span v-else class="tabular-nums">{{
                  column.text?.(vRow.track)
                }}</span>
              </template>
              <template v-else-if="column.id === 'favorite'">
                <button
                  v-if="vRow.favorite !== undefined"
                  type="button"
                  class="track-grid__icon-button"
                  :class="{ 'text-primary': vRow.favorite }"
                  :aria-label="
                    vRow.favorite ? $t('favorites_remove') : $t('favorites_add')
                  "
                  :aria-pressed="vRow.favorite"
                  @click.stop="toggleFavorite(vRow.track as MediaItem)"
                  @dblclick.stop
                >
                  <Heart
                    :size="14"
                    :fill="vRow.favorite ? 'currentColor' : 'none'"
                  />
                </button>
              </template>
              <template v-else-if="column.id === 'source'">
                <ProviderIcon
                  :domain="getListItemProviderIconDomain(vRow.track)"
                  :size="18"
                />
              </template>
              <template v-else-if="column.id === 'menu'">
                <button
                  type="button"
                  class="track-grid__icon-button track-grid__menu"
                  :aria-label="$t('actions')"
                  @click.stop="onMenuButton($event, vRow.index)"
                  @dblclick.stop
                >
                  <EllipsisVertical :size="14" />
                </button>
              </template>
              <span
                v-else
                class="truncate"
                :class="{
                  tabular: column.align === 'right',
                  'font-medium': column.id === 'title',
                }"
                >{{ column.text?.(vRow.track) }}</span
              >
            </div>
          </template>
          <div v-else class="track-grid__cell track-grid__cell--loading">
            <span class="track-grid__skeleton"></span>
          </div>
        </div>
      </div>

      <div
        v-if="!loading && rows.length === 0"
        class="track-grid__empty text-muted-foreground"
      >
        {{ $t("no_content") }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  EllipsisVertical,
  Heart,
  Play,
  Settings2,
} from "@lucide/vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { computed, ref, shallowRef, watch } from "vue";
import ProviderIcon from "@/components/ProviderIcon.vue";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContextMenuItem } from "@/helpers/context_menu_item";
import {
  handleMediaItemClick,
  handleMenuBtnClick,
  handlePlayBtnClick,
} from "@/helpers/media_item_actions";
import { ensurePlayer } from "../playerGate";
import { api } from "@/plugins/api";
import { getListItemProviderIconDomain } from "@/plugins/api/helpers";
import {
  MediaType,
  PlaybackState,
  type BrowseFolder,
  type MediaItem,
  type MediaItemType,
  type Track,
} from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import {
  gridSortToLocalSort,
  gridSortToSortBy,
  sortByToGridSort,
  TRACK_COLUMNS,
  type GridSort,
  type GridItem,
  type GridColumn,
  type TrackColumnId,
} from "../columns";

const props = withDefaults(
  defineProps<{
    rows: GridItem[];
    loading: boolean;
    rowHeight: number;
    sortBy: string;
    visibleColumns: GridColumn[];
    visibility: Partial<Record<string, boolean>>;
    parentItem?: MediaItemType;
    // how many rows before the end of the loaded list triggers the next page
    loadAhead?: number;
    // columns without a server sort key sort in the browser (the owner
    // pages the whole listing in first)
    localSortable?: boolean;
    // entries the owner adds at the top of a row's menu
    menuItems?: (targets: GridItem[]) => ContextMenuItem[];
  }>(),
  {
    loadAhead: 50,
    parentItem: undefined,
    localSortable: false,
    menuItems: undefined,
  },
);

const emit = defineEmits<{
  "update:sortBy": [sortBy: string];
  "update:selection": [tracks: GridItem[]];
  ensureLoaded: [index: number];
  toggleColumn: [id: string, visible: boolean];
  focusSearch: [];
  jumpToLetter: [letters: string];
  openFolder: [folder: BrowseFolder];
  // a dragged header edge; undefined puts the default width back
  resizeColumn: [id: string, width: number | undefined];
  resetColumnWidths: [];
}>();

const gridRef = ref<HTMLElement | null>(null);
const scrollRef = ref<HTMLElement | null>(null);

// ---- columns and sort ------------------------------------------------------

const toggleableColumns = computed(() =>
  TRACK_COLUMNS.filter((column) => !column.fixed),
);

// widths while a header edge is being dragged; the owner's columns carry
// the width once the drag is committed
const dragWidths = shallowRef<Record<string, number>>({});
const MIN_COLUMN_WIDTH = 40;

const widthOf = (column: GridColumn) =>
  dragWidths.value[column.id] ?? column.width;

const gridTemplate = computed(() => ({
  gridTemplateColumns: props.visibleColumns
    .map((column) =>
      column.grow
        ? `minmax(${widthOf(column)}px, 1fr)`
        : `${widthOf(column)}px`,
    )
    .join(" "),
  minWidth: `${props.visibleColumns.reduce((sum, column) => sum + widthOf(column), 0)}px`,
}));

function startResize(event: PointerEvent, column: GridColumn) {
  const handle = event.currentTarget as HTMLElement | null;
  if (!handle) return;
  const startX = event.clientX;
  const startWidth = widthOf(column);
  handle.setPointerCapture?.(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    const width = Math.max(
      MIN_COLUMN_WIDTH,
      Math.round(startWidth + moveEvent.clientX - startX),
    );
    dragWidths.value = { ...dragWidths.value, [column.id]: width };
  };
  const up = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
    const width = dragWidths.value[column.id];
    const { [column.id]: _dropped, ...rest } = dragWidths.value;
    dragWidths.value = rest;
    if (width !== undefined && width !== column.width) {
      emit("resizeColumn", column.id, width);
    }
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
}

// what the owner wants ahead of the standard entries
const menuOptions = (targets: GridItem[]) => {
  const extraItems = props.menuItems?.(targets) ?? [];
  return extraItems.length > 0 ? { extraItems } : undefined;
};

const sort = computed<GridSort | undefined>(() =>
  sortByToGridSort(props.sortBy, props.visibleColumns),
);

function ariaSort(columnId: string) {
  if (sort.value?.columnId !== columnId) return undefined;
  return sort.value.desc ? "descending" : "ascending";
}

function canSort(column: GridColumn): boolean {
  if (column.sortKey) return true;
  return props.localSortable && !!(column.sortText ?? column.text);
}

function toggleSort(columnId: string) {
  const column = props.visibleColumns.find((c) => c.id === columnId);
  if (!column || !canSort(column)) return;
  const desc = sort.value?.columnId === columnId ? !sort.value.desc : false;
  const next = column.sortKey
    ? gridSortToSortBy({ columnId, desc }, props.visibleColumns)
    : gridSortToLocalSort({ columnId, desc });
  if (next) emit("update:sortBy", next);
}

// ---- virtualization --------------------------------------------------------

const virtualizer = useVirtualizer(
  computed(() => ({
    count: props.rows.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => props.rowHeight,
    overscan: 10,
  })),
);

const totalSize = computed(() => virtualizer.value.getTotalSize());

const playingId = computed(() => {
  if (store.activePlayer?.playback_state !== PlaybackState.PLAYING) return "";
  const current = store.curQueueItem?.media_item as Track | undefined;
  return current?.item_id ?? "";
});

const virtualRows = computed(() =>
  virtualizer.value.getVirtualItems().map((vItem) => {
    const track = props.rows[vItem.index] as GridItem | undefined;
    return {
      key: String(vItem.key),
      index: vItem.index,
      start: vItem.start,
      track,
      favorite:
        track && "favorite" in track
          ? (favoriteOverrides.value.get(track.uri) ??
            (track.favorite as boolean))
          : undefined,
      selected: !!track && selectedUris.value.has(track.uri),
      playing: !!track && track.item_id === playingId.value,
    };
  }),
);

watch(
  () => virtualizer.value.getVirtualItems().at(-1)?.index ?? -1,
  (lastIndex) => {
    if (lastIndex < 0) return;
    if (lastIndex >= props.rows.length - props.loadAhead) {
      emit("ensureLoaded", props.rows.length);
    }
    // sparse pages: make sure what is on screen is requested too
    emit("ensureLoaded", lastIndex);
  },
  { immediate: true },
);

watch(
  () => props.rowHeight,
  () => virtualizer.value.measure(),
);

// ---- selection and focus ---------------------------------------------------

// keyed by uri; holds the items so a selection never rescans the rows
const selectedUris = shallowRef(new Map<string, GridItem>());
const anchorIndex = ref(-1);
const focusIndex = ref(-1);

watch(
  () => props.rows,
  (rows) => {
    // a new listing (filter change) drops the selection; a page append keeps it
    if (rows.length === 0) {
      favoriteOverrides.value = new Map();
      selectedUris.value = new Map();
      anchorIndex.value = -1;
      focusIndex.value = -1;
      emit("update:selection", []);
    }
  },
);

const selectedTracks = computed(() => [...selectedUris.value.values()]);

// the rows are plain objects behind a shallow ref, so a flipped favorite
// would only show once the row happened to re-render; the heart keeps its
// own answer per uri until the listing is replaced
const favoriteOverrides = shallowRef(new Map<string, boolean>());

function toggleFavorite(item: MediaItem) {
  const next = !(favoriteOverrides.value.get(item.uri) ?? item.favorite);
  if (next) void api.addItemToFavorites(item);
  else void api.removeItemFromFavorites(item.media_type, item.item_id);
  item.favorite = next;
  favoriteOverrides.value = new Map(favoriteOverrides.value).set(
    item.uri,
    next,
  );
}

function commitSelection(next: Map<string, GridItem>) {
  selectedUris.value = next;
  emit("update:selection", selectedTracks.value);
}

function selectRange(from: number, to: number, additive: boolean) {
  const [start, end] = from < to ? [from, to] : [to, from];
  const next = additive
    ? new Map(selectedUris.value)
    : new Map<string, GridItem>();
  for (let i = start; i <= end; i++) {
    const track = props.rows[i];
    if (track) next.set(track.uri, track);
  }
  commitSelection(next);
}

function selectOnly(index: number) {
  const track = props.rows[index];
  commitSelection(track ? new Map([[track.uri, track]]) : new Map());
  anchorIndex.value = index;
  focusIndex.value = index;
}

function selectAll() {
  const next = new Map<string, GridItem>();
  for (const track of props.rows) if (track) next.set(track.uri, track);
  commitSelection(next);
}

function clearSelection() {
  commitSelection(new Map());
}

function moveFocus(index: number, extend: boolean) {
  if (props.rows.length === 0) return;
  const clamped = Math.max(0, Math.min(props.rows.length - 1, index));
  focusIndex.value = clamped;
  if (extend) {
    if (anchorIndex.value < 0) anchorIndex.value = clamped;
    selectRange(anchorIndex.value, clamped, false);
  } else {
    selectOnly(clamped);
  }
  virtualizer.value.scrollToIndex(clamped, { align: "auto" });
  emit("ensureLoaded", clamped);
}

function visibleRowCount() {
  const height = scrollRef.value?.clientHeight ?? 0;
  return Math.max(1, Math.floor(height / props.rowHeight) - 1);
}

function onRowClick(event: MouseEvent, index: number) {
  gridRef.value?.focus({ preventScroll: true });
  if (event.shiftKey && anchorIndex.value >= 0) {
    focusIndex.value = index;
    selectRange(anchorIndex.value, index, event.ctrlKey || event.metaKey);
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    const track = props.rows[index];
    if (!track) return;
    const next = new Map(selectedUris.value);
    if (next.has(track.uri)) next.delete(track.uri);
    else next.set(track.uri, track);
    commitSelection(next);
    anchorIndex.value = index;
    focusIndex.value = index;
    return;
  }
  selectOnly(index);
}

function onRowDoubleClick(event: MouseEvent, index: number) {
  const item = props.rows[index];
  if (!item) return;
  // a folder opens; anything playable plays, as a library manager expects
  if (item.media_type === MediaType.FOLDER) {
    emit("openFolder", item as BrowseFolder);
    return;
  }
  if (!item.is_playable) {
    handleMediaItemClick(item, event.clientX, event.clientY, props.parentItem);
    return;
  }
  const { clientX, clientY } = event;
  void ensurePlayer().then((ready) => {
    if (!ready) return;
    void handlePlayBtnClick(
      item,
      clientX,
      clientY,
      props.parentItem,
      false,
      props.sortBy,
    );
  });
}

function menuTargets(index: number): GridItem[] {
  const track = props.rows[index];
  if (!track) return [];
  return selectedUris.value.has(track.uri) && selectedTracks.value.length > 1
    ? selectedTracks.value
    : [track];
}

function onRowMenu(event: MouseEvent, index: number) {
  const track = props.rows[index];
  if (!track) return;
  if (!selectedUris.value.has(track.uri)) selectOnly(index);
  const targets = menuTargets(index);
  handleMenuBtnClick(
    targets,
    event.clientX,
    event.clientY,
    props.parentItem,
    true,
    props.sortBy,
    menuOptions(targets),
  );
}

function onMenuButton(event: MouseEvent, index: number) {
  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  const track = props.rows[index];
  if (!track) return;
  if (!selectedUris.value.has(track.uri)) selectOnly(index);
  const targets = menuTargets(index);
  handleMenuBtnClick(
    targets,
    rect ? rect.left : event.clientX,
    rect ? rect.bottom : event.clientY,
    props.parentItem,
    true,
    props.sortBy,
    menuOptions(targets),
  );
}

// ---- keyboard --------------------------------------------------------------

let typeAhead = "";
let typeAheadTimer: ReturnType<typeof setTimeout> | undefined;
let jumpTimer: ReturnType<typeof setTimeout> | undefined;

function typeAheadJump(char: string) {
  clearTimeout(typeAheadTimer);
  typeAhead += char.toLowerCase();
  typeAheadTimer = setTimeout(() => {
    typeAhead = "";
  }, 700);
  const column =
    props.visibleColumns.find(
      (candidate) => candidate.id === sort.value?.columnId,
    ) ?? props.visibleColumns.find((candidate) => candidate.id === "title");
  if (!column?.text) return;
  const count = props.rows.length;
  const from = Math.max(0, focusIndex.value + (typeAhead.length === 1 ? 1 : 0));
  // walk from the focus row round to it again without building index lists
  for (let step = 0; step < count; step++) {
    const index = (from + step) % count;
    const track = props.rows[index];
    if (!track) continue;
    if (column.text(track).toLowerCase().startsWith(typeAhead)) {
      moveFocus(index, false);
      return;
    }
  }
  // nothing paged in starts with it; the source can look further, once the
  // letters have settled
  clearTimeout(jumpTimer);
  jumpTimer = setTimeout(() => emit("jumpToLetter", typeAhead), 150);
}

function onKeydown(event: KeyboardEvent) {
  if (store.dialogActive || store.showPlayersMenu) return;
  const ctrl = event.ctrlKey || event.metaKey;
  const focused = focusIndex.value;
  // ctrl/alt arrow chords belong to the playback keymap, not the grid
  if ((ctrl || event.altKey) && event.key.startsWith("Arrow")) return;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      moveFocus(focused < 0 ? 0 : focused + 1, event.shiftKey);
      return;
    case "ArrowUp":
      event.preventDefault();
      moveFocus(focused < 0 ? 0 : focused - 1, event.shiftKey);
      return;
    case "Home":
      event.preventDefault();
      moveFocus(0, event.shiftKey);
      return;
    case "End":
      event.preventDefault();
      moveFocus(props.rows.length - 1, event.shiftKey);
      return;
    case "PageDown":
      event.preventDefault();
      moveFocus(Math.max(0, focused) + visibleRowCount(), event.shiftKey);
      return;
    case "PageUp":
      event.preventDefault();
      moveFocus(Math.max(0, focused) - visibleRowCount(), event.shiftKey);
      return;
    case "Enter": {
      const track = props.rows[focused];
      if (!track) return;
      // ctrl variants belong to the keymap (play next, add to queue)
      if (ctrl) return;
      event.preventDefault();
      if (event.shiftKey) {
        // properties: the row menu carries edit, info and the rest for
        // whatever this item's provider supports
        const rowEl = gridRef.value?.querySelector<HTMLElement>(
          `[aria-rowindex="${focused + 1}"]`,
        );
        const rect = rowEl?.getBoundingClientRect();
        const targets = menuTargets(focused);
        handleMenuBtnClick(
          targets,
          rect ? rect.left + 48 : 0,
          rect ? rect.bottom : 0,
          props.parentItem,
          true,
          props.sortBy,
          menuOptions(targets),
        );
        return;
      }
      {
        const rect = gridRef.value?.getBoundingClientRect();
        void ensurePlayer().then((ready) => {
          if (!ready) return;
          void handlePlayBtnClick(
            track,
            rect?.left ?? 0,
            rect?.top ?? 0,
            props.parentItem,
            false,
            props.sortBy,
          );
        });
      }
      return;
    }
    case "a":
    case "A":
      if (!ctrl) break;
      event.preventDefault();
      if (event.shiftKey) clearSelection();
      else selectAll();
      return;
    case "/":
      event.preventDefault();
      emit("focusSearch");
      return;
    case "Escape":
      clearSelection();
      return;
  }
  // "?" opens the shortcut help; every other printable key jumps by letter
  if (
    event.key.length === 1 &&
    event.key !== " " &&
    event.key !== "?" &&
    !ctrl &&
    !event.altKey
  ) {
    event.preventDefault();
    typeAheadJump(event.key);
  }
}

// sort by the nth (1-based) sortable column, as the "s" chord asks
function sortByIndex(position: number) {
  const sortable = props.visibleColumns.filter(canSort);
  const column = sortable[position - 1];
  if (column) toggleSort(column.id);
}

// ---- public -----------------------------------------------------------------

function scrollToTrack(itemId: string) {
  const index = props.rows.findIndex((track) => track?.item_id === itemId);
  if (index >= 0) moveFocus(index, false);
}

function scrollToIndex(index: number) {
  if (index >= 0 && index < props.rows.length) moveFocus(index, false);
}

defineExpose({
  focus: () => gridRef.value?.focus(),
  scrollToTrack,
  scrollToIndex,
  scrollTop: () => scrollRef.value?.scrollTop ?? 0,
  scrollTo: (top: number) => scrollRef.value?.scrollTo({ top }),
  selectAll,
  clearSelection,
  sortByIndex,
});
</script>

<style scoped>
.track-grid {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  outline: none;
  font-size: 13px;
  user-select: none;
}

.track-grid:focus-visible .track-grid__row--focused {
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.track-grid__scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.track-grid__header,
.track-grid__row {
  display: grid;
  width: 100%;
  align-items: center;
}

.track-grid__header {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 30px;
  background: rgb(var(--v-theme-panel));
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.62);
}

.track-grid__body {
  position: relative;
  width: 100%;
}

.track-grid__row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--row-height);
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.03);
  cursor: default;
}

.track-grid__row--odd {
  background: rgba(var(--v-theme-fg), 0.025);
}

.track-grid__row:hover {
  background: rgba(var(--v-theme-fg), 0.06);
}

.track-grid__row--selected,
.track-grid__row--selected:hover {
  background: rgba(var(--v-theme-primary), 0.18);
}

.track-grid__row--playing .track-grid__cell {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.track-grid__cell {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 100%;
  padding: 0 8px;
  white-space: nowrap;
}

.track-grid__cell--right {
  justify-content: flex-end;
}

.track-grid__cell--center {
  justify-content: center;
}

.track-grid__cell--sortable {
  cursor: pointer;
}

.track-grid__cell--header {
  position: relative;
}

.track-grid__resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 7px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
  z-index: 1;
}

.track-grid__resizer:hover,
.track-grid__resizer:active {
  background: linear-gradient(
    to right,
    transparent 2px,
    rgba(var(--v-theme-primary), 0.7) 2px,
    rgba(var(--v-theme-primary), 0.7) 5px,
    transparent 5px
  );
}

.track-grid__cell--sortable:hover {
  color: rgb(var(--v-theme-fg));
}

.track-grid__cell--loading {
  grid-column: 1 / -1;
}

.track-grid__skeleton {
  display: block;
  width: 40%;
  height: 10px;
  border-radius: 5px;
  background: rgba(var(--v-theme-fg), 0.08);
}

.track-grid__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: rgba(var(--v-theme-fg), 0.55);
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.track-grid__icon-button:hover {
  color: rgb(var(--v-theme-fg));
  background: rgba(var(--v-theme-fg), 0.08);
}

.track-grid__row:not(:hover):not(.track-grid__row--selected) .track-grid__menu {
  opacity: 0;
}

.track-grid__empty {
  position: sticky;
  left: 0;
  padding: 48px 16px;
  text-align: center;
}

.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
