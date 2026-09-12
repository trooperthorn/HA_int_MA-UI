<template>
  <SplitterGroup
    direction="horizontal"
    auto-save-id="library-manager-browser"
    :storage="storage"
    class="browser-strip"
  >
    <SplitterPanel id="genres" :order="1" :min-size="10">
      <BrowserColumn
        ref="genreColumn"
        :title="$t('genre')"
        :items="genreList.rows.value"
        :total="genreList.total.value"
        :loading="genreList.loading.value"
        :selected-ids="genreIds"
        :search="genreSearch"
        multiple
        @update:selected-ids="pickGenres"
        @update:search="genreSearch = $event"
        @ensure-loaded="genreList.ensureLoaded"
        @jump-to-letter="jump(genreList, genreColumn, $event)"
      />
    </SplitterPanel>
    <SplitterResizeHandle id="genres-handle" class="browser-strip__handle" />
    <SplitterPanel id="artists" :order="2" :min-size="10">
      <BrowserColumn
        ref="artistColumn"
        :title="$t('artist')"
        :items="artistList.rows.value"
        :total="artistList.total.value"
        :loading="artistList.loading.value"
        :selected-ids="artistIds"
        :search="artistSearch"
        @update:selected-ids="pickArtist"
        @update:search="artistSearch = $event"
        @ensure-loaded="artistList.ensureLoaded"
        @jump-to-letter="jump(artistList, artistColumn, $event)"
      />
    </SplitterPanel>
    <SplitterResizeHandle id="artists-handle" class="browser-strip__handle" />
    <SplitterPanel id="albums" :order="3" :min-size="10">
      <BrowserColumn
        ref="albumColumn"
        :title="$t('album')"
        :items="albumList.rows.value"
        :total="albumList.total.value"
        :loading="albumList.loading.value"
        :selected-ids="albumIds"
        :search="albumSearch"
        @update:selected-ids="pickAlbum"
        @update:search="albumSearch = $event"
        @ensure-loaded="albumList.ensureLoaded"
        @jump-to-letter="jump(albumList, albumColumn, $event)"
      />
    </SplitterPanel>
  </SplitterGroup>
</template>

<script setup lang="ts">
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from "reka-ui";
import { computed, ref } from "vue";
import { MediaType } from "@/plugins/api/interfaces";
import { useItemSource } from "../composables/useItemSource";
import type {
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
  genres: GenreRef[];
  artist?: ItemRef;
  album?: ItemRef;
  albumArtistsOnly?: boolean;
  storage: PaneStorage;
}>();

const emit = defineEmits<{
  "update:genres": [genres: GenreRef[]];
  "update:artist": [artist: ItemRef | undefined];
  "update:album": [album: ItemRef | undefined];
}>();

const genreSearch = ref("");
const artistSearch = ref("");
const albumSearch = ref("");

const genreIds = computed(() => props.genres.map((genre) => String(genre.id)));
const artistIds = computed(() => (props.artist ? [props.artist.item_id] : []));
const albumIds = computed(() => (props.album ? [props.album.item_id] : []));
const selectedGenreIds = computed(() => props.genres.map((genre) => genre.id));

const base = {
  scope: "library" as const,
  favoritesOnly: false,
  sortBy: "name",
};

const genreList = useItemSource(
  computed<LibraryFilter>(() => ({
    ...base,
    node: "browser.genres",
    mediaType: MediaType.GENRE,
    search: genreSearch.value,
  })),
);

const artistList = useItemSource(
  computed<LibraryFilter>(() => ({
    ...base,
    node: "browser.artists",
    mediaType: MediaType.ARTIST,
    search: artistSearch.value,
    albumArtistsOnly: props.albumArtistsOnly,
    genreIds:
      selectedGenreIds.value.length > 0 ? selectedGenreIds.value : undefined,
  })),
);

const albumList = useItemSource(
  computed<LibraryFilter>(() => ({
    ...base,
    node: "browser.albums",
    mediaType: MediaType.ALBUM,
    search: albumSearch.value,
    genreIds:
      selectedGenreIds.value.length > 0 ? selectedGenreIds.value : undefined,
    artist: props.artist,
  })),
);

const genreColumn = ref<InstanceType<typeof BrowserColumn> | null>(null);
const artistColumn = ref<InstanceType<typeof BrowserColumn> | null>(null);
const albumColumn = ref<InstanceType<typeof BrowserColumn> | null>(null);

async function jump(
  list: ReturnType<typeof useItemSource>,
  column: InstanceType<typeof BrowserColumn> | null,
  letters: string,
) {
  const index = await list.jumpToLetter(letters);
  if (index !== undefined) column?.scrollToIndex(index);
}

function pickGenres(ids: string[]) {
  const picked: GenreRef[] = [];
  for (const id of ids) {
    const numeric = Number(id);
    if (Number.isNaN(numeric)) continue;
    const known =
      props.genres.find((genre) => genre.id === numeric) ??
      genreList.rows.value.find((item) => item?.item_id === id);
    picked.push({ id: numeric, name: known?.name ?? id });
  }
  emit("update:genres", picked);
}

function pickArtist(ids: string[]) {
  const id = ids[0];
  const item = id
    ? artistList.rows.value.find((row) => row?.item_id === id)
    : undefined;
  emit(
    "update:artist",
    item
      ? { item_id: item.item_id, provider: item.provider, name: item.name }
      : undefined,
  );
}

function pickAlbum(ids: string[]) {
  const id = ids[0];
  const item = id
    ? albumList.rows.value.find((row) => row?.item_id === id)
    : undefined;
  emit(
    "update:album",
    item
      ? { item_id: item.item_id, provider: item.provider, name: item.name }
      : undefined,
  );
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
