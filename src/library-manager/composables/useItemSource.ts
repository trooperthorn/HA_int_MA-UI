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
// page size when the whole listing is wanted at once
export const LOAD_ALL_PAGE_SIZE = 2000;

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
  const loadingAll = ref(false);
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
      !!filter.value.filesToEdit ||
      !!filter.value.artist ||
      !!filter.value.album,
  );

  // listings the server returns whole rather than paged
  function oneShotRequest(current: ItemFilter): Promise<GridItem[]> | null {
    if (current.scope === "browse") {
      // the ".." entry browses back up; the tree is the way up here
      return api
        .browse(current.browsePath, store.activePlayerId)
        .then((items) =>
          items.filter(
            (item) =>
              item.media_type !== MediaType.FOLDER || item.name !== "..",
          ),
        );
    }
    if (current.mediaType === MediaType.TRACK && current.album) {
      return api.getAlbumTracks(current.album.item_id, current.album.provider);
    }
    if (current.mediaType === MediaType.TRACK && current.artist) {
      return api.getArtistTracks(
        current.artist.item_id,
        current.artist.provider,
      );
    }
    if (current.mediaType === MediaType.ALBUM && current.artist) {
      return api.getArtistAlbums(
        current.artist.item_id,
        current.artist.provider,
      );
    }
    return null;
  }

  // one-shot lists honour the toolbar's search and favorites filter locally
  function applyLocalFilter(current: ItemFilter, items: GridItem[]) {
    const needle = current.search.trim().toLowerCase();
    return items.filter((item) => {
      if (current.favoritesOnly && "favorite" in item && !item.favorite) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        item.name,
        "artists" in item && Array.isArray(item.artists)
          ? item.artists.map((artist) => artist.name).join(" ")
          : "",
        "album" in item && item.album ? item.album.name : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

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
    if (current.scope === "browse" || current.artist || current.album) {
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

    const oneShot = oneShotRequest(current);
    let request: Promise<GridItem[]>;
    if (oneShot) {
      request = oneShot.then((items) => applyLocalFilter(current, items));
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
        if (oneShot) {
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

  // the text the server sorted a listing by, for jumping through it by letter
  function sortKeyText(item: GridItem, sortBy: string): string | undefined {
    const key = sortBy.endsWith("_desc") ? sortBy.slice(0, -5) : sortBy;
    switch (key) {
      case "name":
        return item.name;
      case "sort_name":
        return item.sort_name ?? item.name;
      case "track_artist_name":
      case "album_artist_name":
        return "artists" in item && Array.isArray(item.artists)
          ? item.artists[0]?.name
          : undefined;
      default:
        return undefined;
    }
  }

  /**
   * Index of the first row whose sort text starts with `letters`, paging in
   * whatever the search needs. Fully loaded listings are scanned; paged ones
   * are bisected by page against the server's own order (about log2(pages)
   * requests, which for twenty thousand tracks is seven). Undefined when the
   * listing is not sorted by a name, or nothing matches.
   */
  async function jumpToLetter(letters: string): Promise<number | undefined> {
    const current = filter.value;
    const needle = letters.toLowerCase();
    const textOf = (item: GridItem | undefined) =>
      item ? sortKeyText(item, current.sortBy)?.toLowerCase() : undefined;
    if (!needle || textOf(rows.value.find(Boolean)) === undefined) {
      return undefined;
    }
    const desc = current.sortBy.endsWith("_desc");
    const matches = (index: number) =>
      textOf(rows.value[index])?.startsWith(needle) ?? false;
    const before = (index: number) => {
      const text = textOf(rows.value[index]);
      if (text === undefined) return false;
      return desc ? text > needle : text < needle;
    };

    if (allLoaded.value || current.filesToEdit) {
      const index = rows.value.findIndex((_, i) => matches(i));
      return index >= 0 ? index : undefined;
    }

    if (total.value === undefined) return undefined;
    const forGeneration = generation;
    let lo = 0;
    let hi = Math.max(0, Math.ceil(total.value / TRACK_PAGE_SIZE) - 1);
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      await loadPage(mid * TRACK_PAGE_SIZE);
      if (forGeneration !== generation) return undefined;
      if (before(mid * TRACK_PAGE_SIZE)) lo = mid + 1;
      else hi = mid;
    }
    // the run of matches may begin in the page before the one we landed on
    const start = Math.max(0, lo - 1) * TRACK_PAGE_SIZE;
    await loadPage(start);
    await loadPage(lo * TRACK_PAGE_SIZE);
    if (forGeneration !== generation) return undefined;
    const end = Math.min(rows.value.length, (lo + 1) * TRACK_PAGE_SIZE);
    for (let index = start; index < end; index++) {
      if (matches(index)) return index;
    }
    return undefined;
  }

  /**
   * Page the whole listing in so it can be sorted here on any column. A
   * filter change part-way drops the result.
   */
  async function loadAll(): Promise<void> {
    if (allLoaded.value || loadingAll.value) return;
    const current = filter.value;
    if (oneShotRequest(current) || current.filesToEdit) return;
    const forGeneration = generation;
    loadingAll.value = true;
    loading.value = true;
    try {
      const all: GridItem[] = [];
      for (;;) {
        const items = await fetchLibraryPage(
          current,
          LOAD_ALL_PAGE_SIZE,
          all.length,
        );
        if (forGeneration !== generation) return;
        all.push(...items);
        rows.value = all.slice();
        if (items.length < LOAD_ALL_PAGE_SIZE) break;
      }
      for (let page = 0; page * TRACK_PAGE_SIZE < all.length; page++) {
        loadedPages.add(page);
      }
      allLoaded.value = true;
      total.value = all.length;
    } finally {
      if (forGeneration === generation) {
        loadingAll.value = false;
        loading.value = inFlight.size > 0;
      }
    }
  }

  function reload() {
    generation += 1;
    loadedPages.clear();
    inFlight.clear();
    rawOffset = 0;
    rows.value = [];
    allLoaded.value = false;
    loadingAll.value = false;
    updateAvailable.value = false;
    loading.value = false;
    void refreshTotal(generation);
    void loadPage(0);
  }

  // callers hand over a fresh object on every change; only a change in
  // content is a new listing
  watch(() => JSON.stringify(filter.value), reload, { immediate: true });

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
    jumpToLetter,
    loadAll,
    rows,
    total,
    loading,
    allLoaded,
    loadingAll,
    updateAvailable,
    ensureLoaded,
    reload,
  };
}
