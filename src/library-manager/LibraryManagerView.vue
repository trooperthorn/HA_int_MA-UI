<template>
  <div class="library-manager">
    <div class="library-manager__toolbar">
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
          :model-value="favoritesOnly"
          @update:model-value="favoritesOnly = !!$event"
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

    <TrackGrid
      ref="grid"
      class="library-manager__grid"
      :rows="source.rows.value"
      :loading="source.loading.value"
      :row-height="rowHeight"
      :sort-by="sortBy"
      :visible-columns="visibleColumns"
      :visibility="visibility"
      @update:sort-by="sortBy = $event"
      @update:selection="selection = $event"
      @ensure-loaded="source.ensureLoaded"
      @toggle-column="setColumnVisible"
      @focus-search="focusSearch"
    />
  </div>
</template>

<script setup lang="ts">
import { RefreshCw, Search } from "@lucide/vue";
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
import { store } from "@/plugins/store";
import { useGridColumns } from "./composables/useGridColumns";
import { useKeymap } from "./composables/useKeymap";
import { useTrackSource, type TrackFilter } from "./composables/useTrackSource";
import type { LibraryTrack } from "./columns";
import TrackGrid from "./panes/TrackGrid.vue";

defineOptions({ name: "LibraryManager" });

const SORT_PREFERENCE_KEY = "libraryManager.sortBy";
const DEFAULT_SORT = "name";

const router = useRouter();
const { getPreference } = useUserPreferences();
const { visibility, visibleColumns, rowHeight, setColumnVisible } =
  useGridColumns();
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
const favoritesOnly = ref(false);
const selection = ref<LibraryTrack[]>([]);
const grid = ref<InstanceType<typeof TrackGrid> | null>(null);

const storedSort = getPreference<string>(SORT_PREFERENCE_KEY, DEFAULT_SORT);
const sortBy = computed({
  get: () => storedSort.value,
  set: (value: string) => {
    void setUserPreference(SORT_PREFERENCE_KEY, value);
  },
});

// search is applied a beat after typing stops so a fast typist does not
// issue a request per keystroke
const search = ref("");
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    search.value = value.trim();
  }, 250);
});

const filter = computed<TrackFilter>(() => ({
  search: search.value,
  sortBy: sortBy.value,
  favoritesOnly: favoritesOnly.value,
}));

const source = useTrackSource(filter);

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
  padding: 0 16px;
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

.library-manager__grid {
  flex: 1;
  min-height: 0;
}
</style>
