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
        <span v-if="source.total.value !== undefined">
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
        <TrackGrid
          ref="grid"
          class="library-manager__grid"
          :rows="source.rows.value"
          :loading="source.loading.value"
          :row-height="rowHeight"
          :sort-by="filter.sortBy"
          :visible-columns="visibleColumns"
          :visibility="visibility"
          @update:sort-by="toolbar.sortBy = $event"
          @update:selection="selection = $event"
          @ensure-loaded="source.ensureLoaded"
          @toggle-column="setColumnVisible"
          @focus-search="focusSearch"
        />
      </SplitterPanel>
    </SplitterGroup>
  </div>
</template>

<script setup lang="ts">
import { PanelLeft, RefreshCw, Search } from "@lucide/vue";
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from "reka-ui";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
import { MediaType } from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import {
  columnsForMediaType,
  sortByForColumns,
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
import SourceTree from "./panes/SourceTree.vue";
import TrackGrid from "./panes/TrackGrid.vue";

defineOptions({ name: "LibraryManager" });

const SORT_PREFERENCE_KEY = "libraryManager.sortBy";
const DEFAULT_SORT = "name";

const router = useRouter();
const { getPreference } = useUserPreferences();
const {
  visibility,
  visibleColumns: visibleTrackColumns,
  rowHeight,
  setColumnVisible,
} = useGridColumns();
const { storage, showTree, setShowTree } = usePaneLayout();
const { node, toolbar, filter: rawFilter, selectNode } = useLibraryFilter();
useKeymap();

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

.library-manager__grid {
  flex: 1;
  min-height: 0;
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
