<template>
  <div class="library-manager">
    <div class="library-manager__toolbar">
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="$t('library_manager.toggle_tree')"
        @click="setShowTree(!showTree)"
      >
        <PanelLeft :size="16" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="$t('library_manager.toggle_strip')"
        :disabled="node.scope !== 'library'"
        @click="setShowStrip(!showStrip)"
      >
        <PanelTop :size="16" />
      </Button>
      <h1 class="library-manager__title">{{ $t("library_manager.title") }}</h1>
      <div class="library-manager__search">
        <Search :size="16" class="library-manager__search-icon" />
        <Input
          ref="searchRef"
          v-model="searchInput"
          type="search"
          :placeholder="$t('library_manager.search_placeholder')"
          class="pl-9 h-8"
          @keydown.escape="clearSearch"
          @keydown.enter="grid?.focus()"
        />
      </div>
      <label class="library-manager__toggle">
        <Switch
          :model-value="toolbar.favoritesOnly"
          @update:model-value="toolbar.favoritesOnly = !!$event"
        />
        <span>{{ $t("library_manager.favorites_only") }}</span>
      </label>
      <Button
        v-if="source.updateAvailable.value"
        variant="outline"
        size="sm"
        class="h-8"
        @click="source.reload()"
      >
        <RefreshCw :size="14" class="mr-2" />
        {{ $t("tooltip.refresh_new_content") }}
      </Button>
      <div class="library-manager__status">
        <span v-if="selection.length > 0">
          {{ $t("items_selected", [selection.length]) }} ·
        </span>
        <span v-if="source.loadingAll.value">
          {{
            $t("library_manager.loading_all", [
              source.rows.value.length.toLocaleString(),
              (source.total.value ?? source.rows.value.length).toLocaleString(),
            ])
          }}
        </span>
        <span v-else-if="source.total.value !== undefined">
          {{ $t("items_total", [source.total.value.toLocaleString()]) }}
        </span>
        <span v-else>
          {{ $t("items_total", [source.rows.value.length.toLocaleString()]) }}
        </span>
        <Spinner v-if="source.loading.value" class="size-3.5 ml-2" />
      </div>
    </div>

    <SplitterGroup
      direction="horizontal"
      auto-save-id="library-manager-main"
      :storage="storage"
      class="library-manager__panes"
    >
      <SplitterPanel
        v-if="showTree"
        id="tree"
        :order="1"
        :default-size="PANE_DEFAULTS.treeSize"
        :min-size="PANE_DEFAULTS.treeMinSize"
        :max-size="40"
        class="library-manager__tree"
      >
        <SourceTree ref="tree" :active-node="node.node" @select="selectNode" />
      </SplitterPanel>
      <SplitterResizeHandle
        v-if="showTree"
        id="tree-handle"
        class="library-manager__handle"
      />
      <SplitterPanel id="main" :order="2" class="library-manager__main">
        <SplitterGroup
          direction="vertical"
          auto-save-id="library-manager-strip"
          :storage="storage"
          class="library-manager__main-group"
        >
          <SplitterPanel
            v-if="stripVisible"
            id="strip"
            :order="1"
            :default-size="PANE_DEFAULTS.stripSize"
            :min-size="PANE_DEFAULTS.stripMinSize"
            :max-size="60"
            class="library-manager__strip"
          >
            <BrowserStrip
              :storage="storage"
              :picks="browser"
              :provider="node.provider"
              @update:picks="setPicks"
            />
          </SplitterPanel>
          <SplitterResizeHandle
            v-if="stripVisible"
            id="strip-handle"
            class="library-manager__handle library-manager__handle--row"
          />
          <SplitterPanel
            id="grid"
            :order="2"
            class="library-manager__grid-panel"
          >
            <div v-if="chips.length > 0" class="library-manager__chips">
              <button
                v-for="chip in chips"
                :key="chip.key"
                type="button"
                class="library-manager__chip"
                :title="$t('clear')"
                @click="chip.clear()"
              >
                <span class="library-manager__chip-kind">{{ chip.kind }}</span>
                <span class="truncate">{{ chip.label }}</span>
                <X :size="12" />
              </button>
              <button
                type="button"
                class="library-manager__chip library-manager__chip--clear"
                @click="clearBrowser()"
              >
                {{ $t("library_manager.clear_filters") }}
              </button>
            </div>
            <TrackGrid
              ref="grid"
              class="library-manager__grid"
              :rows="displayRows"
              :loading="source.loading.value"
              :row-height="rowHeight"
              :sort-by="gridSortBy"
              :visible-columns="visibleColumns"
              :visibility="visibility"
              :local-sortable="localSortable"
              @update:sort-by="toolbar.sortBy = $event"
              @update:selection="selection = $event"
              @ensure-loaded="source.ensureLoaded"
              @toggle-column="setColumnVisible"
              @focus-search="focusSearch"
              @jump-to-letter="jumpToLetter"
              @open-folder="openFolder"
            />
          </SplitterPanel>
        </SplitterGroup>
      </SplitterPanel>
    </SplitterGroup>
  </div>
</template>

<script setup lang="ts">
import { PanelLeft, PanelTop, RefreshCw, Search, X } from "@lucide/vue";
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from "reka-ui";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import { MediaType, type BrowseFolder } from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import {
  columnsForMediaType,
  localSortToGridSort,
  sortByForColumns,
  sortItemsLocally,
  type GridColumn,
  type GridItem,
} from "./columns";
import { useGridColumns } from "./composables/useGridColumns";
import { useItemSource } from "./composables/useItemSource";
import { useKeymap } from "./composables/useKeymap";
import {
  useLibraryFilter,
  type LibraryFilter,
} from "./composables/useLibraryFilter";
import { PANE_DEFAULTS, usePaneLayout } from "./composables/usePaneLayout";
import BrowserStrip from "./panes/BrowserStrip.vue";
import SourceTree from "./panes/SourceTree.vue";
import TrackGrid from "./panes/TrackGrid.vue";

defineOptions({ name: "LibraryManager" });

const SORT_PREFERENCE_KEY = "libraryManager.sortBy";
const DEFAULT_SORT = "name";

const router = useRouter();
const { t } = useI18n();
const { getPreference } = useUserPreferences();
const {
  visibility,
  visibleColumns: visibleTrackColumns,
  rowHeight,
  setColumnVisible,
} = useGridColumns();
const { storage, showTree, showStrip, setShowTree, setShowStrip } =
  usePaneLayout();
const {
  node,
  toolbar,
  browser,
  filter: rawFilter,
  selectNode,
  setGenres,
  setArtist,
  setAlbum,
  setPlaylist,
  setPicks,
  clearBrowser,
} = useLibraryFilter();
useKeymap();

// the browser narrows library listings, whole or per source; browsed folders
// have nothing to narrow
const stripVisible = computed(
  () => showStrip.value && node.scope === "library",
);

interface FilterChip {
  key: string;
  kind: string;
  label: string;
  clear: () => void;
}

const chips = computed<FilterChip[]>(() => {
  const active = rawFilter.value;
  const list: FilterChip[] = [];
  for (const genre of browser.genres) {
    if (!active.genreIds) break;
    list.push({
      key: `genre:${genre.id}`,
      kind: t("genre"),
      label: genre.name,
      clear: () =>
        setGenres(browser.genres.filter((other) => other.id !== genre.id)),
    });
  }
  if (active.artist) {
    list.push({
      key: "artist",
      kind: t("artist"),
      label: active.artist.name,
      clear: () => setArtist(undefined),
    });
  }
  if (active.album) {
    list.push({
      key: "album",
      kind: t("album"),
      label: active.album.name,
      clear: () => setAlbum(undefined),
    });
  }
  if (active.playlist) {
    list.push({
      key: "playlist",
      kind: t("playlist"),
      label: active.playlist.name,
      clear: () => setPlaylist(undefined),
    });
  }
  return list;
});

// the manager is a desktop workflow; phones get the existing track list
watch(
  () => store.mobileLayout,
  (mobile) => {
    if (mobile) router.replace({ name: "tracks" });
  },
  { immediate: true },
);

// the source tree takes the sidebar's place while the manager is open
const sidebar = useSidebar();
let sidebarWasOpen = true;
onMounted(() => {
  sidebarWasOpen = sidebar.open.value;
  if (!sidebar.isMobile.value) sidebar.setOpen(false);
});
onBeforeUnmount(() => {
  if (!sidebar.isMobile.value) sidebar.setOpen(sidebarWasOpen);
});

const searchInput = ref("");
const searchRef = ref<{ $el?: HTMLElement } | null>(null);
const selection = ref<GridItem[]>([]);
const grid = ref<InstanceType<typeof TrackGrid> | null>(null);
const tree = ref<InstanceType<typeof SourceTree> | null>(null);

// the grid's sort is remembered per user; the toolbar object is what the
// filter reads, so the preference feeds it and the grid writes it back
const storedSort = getPreference<string>(SORT_PREFERENCE_KEY, DEFAULT_SORT);
watch(
  storedSort,
  (value) => {
    toolbar.sortBy = value;
  },
  { immediate: true },
);
watch(
  () => toolbar.sortBy,
  (value) => {
    if (value !== storedSort.value)
      void setUserPreference(SORT_PREFERENCE_KEY, value);
  },
);

// search is applied a beat after typing stops so a fast typist does not
// issue a request per keystroke
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    toolbar.search = value.trim();
  }, 250);
});

const columns = computed<readonly GridColumn[]>(() =>
  columnsForMediaType(node.mediaType, node.scope),
);

const visibleColumns = computed<GridColumn[]>(() =>
  node.scope === "library" && node.mediaType === MediaType.TRACK
    ? visibleTrackColumns.value
    : columns.value.filter((column) => column.fixed || column.defaultVisible),
);

// a listing only accepts the sort keys its columns carry
const filter = computed<LibraryFilter>(() => ({
  ...rawFilter.value,
  sortBy:
    sortByForColumns(rawFilter.value.sortBy, columns.value) ??
    rawFilter.value.sortBy,
}));

const source = useItemSource(filter);

// the grid shows the sort the user picked, local or server-side; the request
// carries only the server-side one
const gridSortBy = computed(() =>
  localSortToGridSort(toolbar.sortBy) ? toolbar.sortBy : filter.value.sortBy,
);

// browse folders and narrowed lists arrive whole; the library pages itself
// in on demand, so every listing can be sorted here except the sequential
// files-to-edit walk
const localSortable = computed(() => !node.filesToEdit);

// a local sort needs every row present
watch(
  [() => toolbar.sortBy, () => source.allLoaded.value],
  ([sortBy, allLoaded]) => {
    if (localSortToGridSort(sortBy) && !allLoaded) void source.loadAll();
  },
  { immediate: true },
);

// a fully loaded listing can be sorted here on any column
const displayRows = computed<GridItem[]>(() => {
  const local = localSortToGridSort(toolbar.sortBy);
  if (!local || !source.allLoaded.value) return source.rows.value;
  return sortItemsLocally(source.rows.value, local, columns.value);
});

async function jumpToLetter(letters: string) {
  const index = await source.jumpToLetter(letters);
  if (index !== undefined) grid.value?.scrollToIndex(index);
}

function openFolder(folder: BrowseFolder) {
  selectNode({
    scope: "browse",
    node: `browse:${folder.path}`,
    mediaType: MediaType.FOLDER,
    browsePath: folder.path,
    provider: [folder.provider],
  });
}

function focusSearch() {
  const el = searchRef.value?.$el;
  const input =
    el instanceof HTMLInputElement ? el : el?.querySelector?.("input");
  input?.focus();
  input?.select();
}

function clearSearch() {
  searchInput.value = "";
  grid.value?.focus();
}
</script>

<style scoped>
.library-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.library-manager__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 12px 0 8px;
  flex: none;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
}

.library-manager__title {
  font-size: 15px;
  font-weight: 500;
  line-height: 1;
  margin: 0;
}

.library-manager__search {
  position: relative;
  width: 360px;
}

.library-manager__search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: rgba(var(--v-theme-fg), 0.5);
  pointer-events: none;
}

.library-manager__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
}

.library-manager__status {
  display: flex;
  align-items: center;
  margin-left: auto;
  font-size: 12px;
  color: rgba(var(--v-theme-fg), 0.55);
  white-space: nowrap;
}

.library-manager__panes {
  flex: 1;
  min-height: 0;
}

.library-manager__tree {
  background: rgb(var(--v-theme-panel));
  min-height: 0;
}

.library-manager__main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.library-manager__main-group {
  flex: 1;
  min-height: 0;
}

.library-manager__strip {
  min-height: 0;
}

.library-manager__grid-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.library-manager__grid {
  flex: 1;
  min-height: 0;
}

.library-manager__chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 12px;
  flex: none;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
}

.library-manager__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-fg));
  font-size: 12px;
  cursor: pointer;
}

.library-manager__chip:hover {
  background: rgba(var(--v-theme-primary), 0.28);
}

.library-manager__chip-kind {
  color: rgba(var(--v-theme-fg), 0.55);
}

.library-manager__chip--clear {
  background: transparent;
  color: rgba(var(--v-theme-fg), 0.6);
}

.library-manager__chip--clear:hover {
  background: rgba(var(--v-theme-fg), 0.08);
}

.library-manager__handle.library-manager__handle--row {
  width: 100%;
  height: 8px;
  border: 0;
  border-top: 1px solid rgba(var(--v-theme-fg), 0.08);
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
  cursor: row-resize;
}

.library-manager__handle.library-manager__handle--row::after {
  width: 48px;
  height: 3px;
}

.library-manager__handle {
  width: 6px;
  flex: none;
  background: rgb(var(--v-theme-panel));
  border-left: 1px solid rgba(var(--v-theme-fg), 0.08);
  border-right: 1px solid rgba(var(--v-theme-fg), 0.08);
  cursor: col-resize;
  position: relative;
}

.library-manager__handle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 28px;
  transform: translate(-50%, -50%);
  border-radius: 1px;
  background: rgba(var(--v-theme-fg), 0.22);
}

.library-manager__handle:hover::after,
.library-manager__handle[data-state="drag"]::after {
  background: rgb(var(--v-theme-primary));
}
</style>
