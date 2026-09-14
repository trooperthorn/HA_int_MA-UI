<template>
  <SplitterGroup
    direction="horizontal"
    auto-save-id="library-manager-browser"
    :storage="storage"
    class="browser-strip"
  >
    <template v-for="(column, index) in columns" :key="column.panelId">
      <SplitterResizeHandle
        v-if="index > 0"
        :id="`${column.panelId}-handle`"
        class="browser-strip__handle"
      />
      <SplitterPanel :id="column.panelId" :order="index + 1" :min-size="10">
        <BrowserColumn
          :ref="(el) => setColumnRef(index, el)"
          :title="column.title"
          :facet="column.facet"
          :facet-options="facetOptions"
          :items="column.list.rows.value"
          :total="column.list.total.value"
          :loading="column.list.loading.value"
          :selected-ids="column.selectedIds"
          :search="searches[index]"
          :multiple="column.def.multiple"
          @update:facet="setFacet(index, $event)"
          @update:selected-ids="pick(index, $event)"
          @update:search="searches[index] = $event"
          @ensure-loaded="column.list.ensureLoaded"
          @jump-to-letter="jump(index, $event)"
        />
      </SplitterPanel>
    </template>
  </SplitterGroup>
</template>

<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from "reka-ui";
import { computed, ref, watch, type ComponentPublicInstance } from "vue";
import { api } from "@/plugins/api";
import { store } from "@/plugins/store";
import { useI18n } from "vue-i18n";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import {
  BROWSER_FACETS,
  browserFacetsPreferenceKey,
  facetDef,
  isBrowserFacet,
  normalizeFacets,
  type BrowserFacet,
} from "../browserFacets";
import type { GridItem } from "../columns";
import { useItemSource } from "../composables/useItemSource";
import type {
  BrowserPicks,
  GenreRef,
  ItemRef,
  LibraryFilter,
} from "../composables/useLibraryFilter";
import BrowserColumn from "./BrowserColumn.vue";

interface PaneStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
}

const props = defineProps<{
  picks: BrowserPicks;
  // narrow every column to one source's items
  provider?: string[];
  // the facet a tree listing node asks the first column to show
  leadFacet?: BrowserFacet;
  storage: PaneStorage;
}>();

const emit = defineEmits<{
  "update:picks": [picks: BrowserPicks];
}>();

const { t } = useI18n();
const { getPreference } = useUserPreferences();

// ---- facets: what each of the three columns lists ---------------------------

// the columns are remembered per source, and a source without playlists
// leads with its artists rather than an empty playlist column
const preferenceKey = computed(() =>
  browserFacetsPreferenceKey(props.provider),
);
const storedFacets = computed<unknown>(
  () => getPreference<unknown>(preferenceKey.value, []).value,
);

const hasPlaylists = ref(true);
watch(
  () => (props.provider?.length === 1 ? props.provider[0] : undefined),
  async (instanceId) => {
    if (!instanceId) {
      hasPlaylists.value = true;
      return;
    }
    try {
      const items = await api.getLibraryPlaylists(
        undefined,
        undefined,
        1,
        0,
        undefined,
        instanceId,
      );
      hasPlaylists.value = items.length > 0;
    } catch (err) {
      console.error("[BrowserStrip] playlist probe failed", err);
      hasPlaylists.value = true;
    }
  },
  { immediate: true },
);
// the whole library: the store's count says whether there are any
watch(
  () => store.libraryPlaylistsCount,
  (count) => {
    if (!props.provider?.length && count !== undefined) {
      hasPlaylists.value = count > 0;
    }
  },
  { immediate: true },
);

const facets = ref<BrowserFacet[]>(
  normalizeFacets(storedFacets.value, hasPlaylists.value),
);
watch([storedFacets, hasPlaylists], ([value, playlists]) => {
  const next = normalizeFacets(value, playlists);
  if (next.join() !== facets.value.join()) facets.value = next;
});

const facetOptions = computed(() =>
  BROWSER_FACETS.map((facet) => ({
    value: facet.id,
    label: t(facet.labelKey),
  })),
);

function setFacet(index: number, value: string) {
  if (!isBrowserFacet(value) || facets.value[index] === value) return;
  const next = facets.value.slice();
  // a facet already shown elsewhere moves there instead of appearing twice
  const other = next.indexOf(value);
  if (other >= 0) next[other] = next[index];
  next[index] = value;
  facets.value = next;
  void setUserPreference(preferenceKey.value, next);
  // whatever the column had picked no longer applies
  emit("update:picks", clearFrom(Math.min(index, other < 0 ? index : other)));
}

// a tree listing node leads with its facet and starts from a clean pick
watch(
  () => props.leadFacet,
  (facet) => {
    if (!facet) return;
    if (facets.value[0] !== facet) setFacet(0, facet);
    emit("update:picks", { genres: [] });
  },
);

// ---- lists -----------------------------------------------------------------

const searches = ref<string[]>(["", "", ""]);

const genreIds = computed(() =>
  props.picks.genres.length > 0
    ? props.picks.genres.map((genre) => genre.id)
    : undefined,
);

// every column narrows by what the others picked, as far as the server can:
// genres narrow everything, an artist narrows albums
function filterFor(index: number): LibraryFilter {
  const facet = facetDef(facets.value[index]);
  const filter: LibraryFilter = {
    scope: "library",
    node: `browser.${index}.${facet.id}`,
    mediaType: facet.mediaType,
    provider: props.provider,
    favoritesOnly: false,
    sortBy: "name",
    search: searches.value[index],
  };
  if (facet.id !== "genre") filter.genreIds = genreIds.value;
  if (facet.id === "album_artist") filter.albumArtistsOnly = true;
  if (facet.id === "album") filter.artist = props.picks.artist;
  return filter;
}

const lists = [0, 1, 2].map((index) =>
  useItemSource(computed(() => filterFor(index))),
);

// ---- picks -----------------------------------------------------------------

const toRef = (item: GridItem): ItemRef => ({
  item_id: item.item_id,
  provider: item.provider,
  name: item.name,
});

function selectedIdsFor(facet: BrowserFacet): string[] {
  switch (facet) {
    case "genre":
      return props.picks.genres.map((genre) => String(genre.id));
    case "artist":
    case "album_artist":
      return props.picks.artist ? [props.picks.artist.item_id] : [];
    case "album":
      return props.picks.album ? [props.picks.album.item_id] : [];
    case "playlist":
      return props.picks.playlist ? [props.picks.playlist.item_id] : [];
  }
}

function withPick(
  picks: BrowserPicks,
  facet: BrowserFacet,
  ids: string[],
  rows: GridItem[],
): BrowserPicks {
  const first = ids[0];
  const item = first ? rows.find((row) => row?.item_id === first) : undefined;
  const itemRef = item ? toRef(item) : undefined;
  switch (facet) {
    case "genre": {
      const genres: GenreRef[] = [];
      for (const id of ids) {
        const numeric = Number(id);
        if (Number.isNaN(numeric)) continue;
        const known =
          props.picks.genres.find((genre) => genre.id === numeric) ??
          rows.find((row) => row?.item_id === id);
        genres.push({ id: numeric, name: known?.name ?? id });
      }
      return { ...picks, genres };
    }
    case "artist":
    case "album_artist":
      return { ...picks, artist: itemRef };
    case "album":
      return { ...picks, album: itemRef };
    case "playlist":
      return { ...picks, playlist: itemRef };
  }
}

// the columns to the right of `index` lose their picks
function clearFrom(index: number): BrowserPicks {
  let next: BrowserPicks = { ...props.picks };
  for (let i = index + 1; i < facets.value.length; i++) {
    next = withPick(next, facets.value[i], [], []);
  }
  return next;
}

function pick(index: number, ids: string[]) {
  const facet = facets.value[index];
  emit(
    "update:picks",
    withPick(clearFrom(index), facet, ids, lists[index].rows.value),
  );
}

// ---- columns ---------------------------------------------------------------

const columns = computed(() =>
  facets.value.map((facet, index) => {
    const def = facetDef(facet);
    return {
      panelId: `column-${index}`,
      facet,
      def,
      title: t(def.labelKey),
      list: lists[index],
      selectedIds: selectedIdsFor(facet),
    };
  }),
);

const columnRefs = ref<Array<InstanceType<typeof BrowserColumn> | null>>([
  null,
  null,
  null,
]);

function setColumnRef(
  index: number,
  el: Element | ComponentPublicInstance | null,
) {
  columnRefs.value[index] = el as InstanceType<typeof BrowserColumn> | null;
}

async function jump(index: number, letters: string) {
  const at = await lists[index].jumpToLetter(letters);
  if (at !== undefined) columnRefs.value[index]?.scrollToIndex(at);
}
</script>

<style scoped>
.browser-strip {
  height: 100%;
  min-height: 0;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
}

.browser-strip__handle {
  width: 6px;
  flex: none;
  position: relative;
  background: rgb(var(--v-theme-panel));
  border-left: 1px solid rgba(var(--v-theme-fg), 0.08);
  border-right: 1px solid rgba(var(--v-theme-fg), 0.08);
  cursor: col-resize;
}

.browser-strip__handle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 20px;
  transform: translate(-50%, -50%);
  border-radius: 1px;
  background: rgba(var(--v-theme-fg), 0.22);
}

.browser-strip__handle:hover::after,
.browser-strip__handle[data-state="drag"]::after {
  background: rgb(var(--v-theme-primary));
}
</style>
