import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { api } from "@/plugins/api";
import {
  EventType,
  MediaType,
  type EventMessage,
  type Track,
} from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import { onLibrarySyncCompleted } from "@/composables/useLibrarySync";
import type { GridItem } from "../columns";
import type { LibraryFilter } from "./useLibraryFilter";

export const TRACK_PAGE_SIZE = 200;

export type ItemFilter = LibraryFilter;

// a track the library holds but whose tags are not good enough to file it
export function needsEditing(track: Track): boolean {
  const album = track.album;
  if (!album) return true;
  if (!("year" in album) || !album.year) return true;
  return !("artists" in album) || !album.artists || album.artists.length === 0;
}

const listOf = (values: string[] | undefined) =>
  values && values.length > 0 ? values : undefined;

const idsOf = (values: number[] | undefined) =>
  values && values.length > 0 ? values : undefined;

async function fetchLibraryPage(
  filter: ItemFilter,
  limit: number,
  offset: number,
): Promise<GridItem[]> {
  const favorite = filter.favoritesOnly || undefined;
  const search = filter.search || undefined;
  const provider = listOf(filter.provider);
  const genre = idsOf(filter.genreIds);
  switch (filter.mediaType) {
    case MediaType.ARTIST:
      return api.getLibraryArtists(
        favorite,
        search,
        limit,
        offset,
        filter.sortBy,
        filter.albumArtistsOnly || undefined,
        provider,
        genre,
      );
    case MediaType.ALBUM:
      return api.getLibraryAlbums(
        favorite,
        search,
        limit,
        offset,
        filter.sortBy,
        undefined,
        provider,
        genre,
      );
    case MediaType.PLAYLIST:
      return api.getLibraryPlaylists(
        favorite,
        search,
        limit,
        offset,
        filter.sortBy,
        provider,
        genre,
      );
    case MediaType.GENRE:
      return api.getLibraryGenres({
        favorite,
        search,
        limit,
        offset,
        order_by: filter.sortBy,
        provider,
      });
    default:
      return api.getLibraryTracks(
        favorite,
        search,
        limit,
        offset,
        filter.sortBy,
        provider,
        genre,
      );
  }
}

/**
 * Pages a listing behind a virtualized grid.
 *
 * Library scope keeps rows sparse by page so the grid can ask for any index;
 * browse scope loads the provider's listing in one go. A change to the
 * filter drops everything and restarts from the top, and responses from a
 * superseded filter are discarded by generation so a slow first page can
 * never overwrite a newer one. The files-to-edit view filters library pages
 * client-side, pulling extra pages until it has filled its own.
 */
export function useItemSource(filter: Ref<ItemFilter>) {
  const rows = ref<GridItem[]>([]);
  const total = ref<number | undefined>(undefined);
  const loading = ref(false);
  const allLoaded = ref(false);
  const updateAvailable = ref(false);

  let generation = 0;
  const loadedPages = new Set<number>();
  const inFlight = new Map<number, Promise<void>>();
  // files-to-edit: where the next raw library page starts
  let rawOffset = 0;

  const hasFilter = computed(
    () =>
      filter.value.favoritesOnly ||
      !!filter.value.search ||
      (filter.value.provider?.length ?? 0) > 0 ||
      (filter.value.genreIds?.length ?? 0) > 0 ||
      !!filter.value.filesToEdit,
  );

  function storeCount(mediaType: MediaType): number | undefined {
    switch (mediaType) {
      case MediaType.ARTIST:
        return store.libraryArtistsCount;
      case MediaType.ALBUM:
        return store.libraryAlbumsCount;
      case MediaType.PLAYLIST:
        return store.libraryPlaylistsCount;
      case MediaType.GENRE:
        return store.libraryGenresCount;
      default:
        return store.libraryTracksCount;
    }
  }

  async function countFor(current: ItemFilter): Promise<number> {
    const favorite = current.favoritesOnly;
    switch (current.mediaType) {
      case MediaType.ARTIST:
        return api.getLibraryArtistsCount(favorite, !!current.albumArtistsOnly);
      case MediaType.ALBUM:
        return api.getLibraryAlbumsCount(favorite);
      case MediaType.PLAYLIST:
        return api.getLibraryPlaylistsCount(favorite);
      case MediaType.GENRE:
        return api.getLibraryGenresCount(favorite);
      default:
        return api.getLibraryTracksCount(favorite);
    }
  }

  async function refreshTotal(forGeneration: number) {
    const current = filter.value;
    if (current.scope === "browse") {
      total.value = undefined;
      return;
    }
    if (!hasFilter.value && !current.albumArtistsOnly) {
      total.value = storeCount(current.mediaType);
      return;
    }
    // the count endpoints only know the favorites (and album artists) filter;
    // anything else leaves the total to whatever the pages return
    if (
      current.search ||
      current.provider?.length ||
      current.genreIds?.length ||
      current.filesToEdit
    ) {
      total.value = undefined;
      return;
    }
    const count = await countFor(current);
    if (forGeneration === generation) total.value = count;
  }

  function commitPage(page: number, items: GridItem[], forGeneration: number) {
    if (forGeneration !== generation) return;
    loadedPages.add(page);
    const start = page * TRACK_PAGE_SIZE;
    const next = rows.value.slice();
    next.length = Math.max(next.length, start + items.length);
    for (let i = 0; i < items.length; i++) next[start + i] = items[i];
    rows.value = next;
    if (items.length < TRACK_PAGE_SIZE) {
      allLoaded.value = true;
      rows.value = rows.value.slice(0, start + items.length);
      if (total.value === undefined || total.value > rows.value.length) {
        total.value = rows.value.length;
      }
    }
  }

  async function fetchFilesToEditPage(
    current: ItemFilter,
  ): Promise<GridItem[]> {
    const collected: GridItem[] = [];
    while (collected.length < TRACK_PAGE_SIZE) {
      const raw = await api.getLibraryTracks(
        current.favoritesOnly || undefined,
        current.search || undefined,
        TRACK_PAGE_SIZE,
        rawOffset,
        current.sortBy,
        listOf(current.provider),
        idsOf(current.genreIds),
      );
      rawOffset += raw.length;
      for (const track of raw) if (needsEditing(track)) collected.push(track);
      if (raw.length < TRACK_PAGE_SIZE) break;
    }
    return collected;
  }

  function loadPage(offset: number): Promise<void> {
    const page = Math.floor(offset / TRACK_PAGE_SIZE);
    if (loadedPages.has(page) || allLoaded.value) return Promise.resolve();
    const pending = inFlight.get(page);
    if (pending) return pending;

    const forGeneration = generation;
    const current = filter.value;
    loading.value = true;

    let request: Promise<GridItem[]>;
    if (current.scope === "browse") {
      // the ".." entry browses back up; the tree is the way up here
      request = api
        .browse(current.browsePath, store.activePlayerId)
        .then((items) =>
          items.filter(
            (item) =>
              item.media_type !== MediaType.FOLDER || item.name !== "..",
          ),
        );
    } else if (current.filesToEdit) {
      // pages are consumed in order; a jump ahead still has to walk the raw
      // pages between, so the sequential fetch is the only correct one
      request = fetchFilesToEditPage(current);
    } else {
      request = fetchLibraryPage(
        current,
        TRACK_PAGE_SIZE,
        page * TRACK_PAGE_SIZE,
      );
    }

    const run = request
      .then((items) => {
        if (current.scope === "browse") {
          if (forGeneration !== generation) return;
          loadedPages.add(page);
          rows.value = items;
          allLoaded.value = true;
          total.value = items.length;
          return;
        }
        commitPage(page, items, forGeneration);
      })
      .finally(() => {
        inFlight.delete(page);
        if (forGeneration === generation) loading.value = inFlight.size > 0;
      });
    inFlight.set(page, run);
    return run;
  }

  function ensureLoaded(index: number) {
    if (index < 0) return;
    if (filter.value.filesToEdit) {
      // sequential: only the next unloaded page can be requested
      const nextPage = loadedPages.size;
      if (index >= (nextPage - 1) * TRACK_PAGE_SIZE) {
        void loadPage(nextPage * TRACK_PAGE_SIZE);
      }
      return;
    }
    void loadPage(index - (index % TRACK_PAGE_SIZE));
  }

  function reload() {
    generation += 1;
    loadedPages.clear();
    inFlight.clear();
    rawOffset = 0;
    rows.value = [];
    allLoaded.value = false;
    updateAvailable.value = false;
    loading.value = false;
    void refreshTotal(generation);
    void loadPage(0);
  }

  watch(filter, reload, { deep: true, immediate: true });

  const unsubscribeAdded = api.subscribe(
    EventType.MEDIA_ITEM_ADDED,
    (evt: EventMessage) => {
      const prefix = `library://${filter.value.mediaType}`;
      if (evt.object_id?.startsWith(prefix)) updateAvailable.value = true;
    },
  );
  const unsubscribeSync = onLibrarySyncCompleted(MediaType.TRACK, () => {
    updateAvailable.value = true;
  });
  onScopeDispose(() => {
    unsubscribeAdded();
    unsubscribeSync();
  });

  return {
    rows,
    total,
    loading,
    allLoaded,
    updateAvailable,
    ensureLoaded,
    reload,
  };
}
