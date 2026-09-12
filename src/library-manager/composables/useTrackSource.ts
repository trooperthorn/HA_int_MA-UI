import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { api } from "@/plugins/api";
import {
  EventType,
  MediaType,
  type EventMessage,
} from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import { onLibrarySyncCompleted } from "@/composables/useLibrarySync";
import type { LibraryTrack } from "../columns";

export const TRACK_PAGE_SIZE = 200;

export interface TrackFilter {
  search: string;
  sortBy: string;
  favoritesOnly: boolean;
  provider?: string[];
  genreIds?: number[];
}

/**
 * Pages the library track list behind a virtualized grid.
 *
 * Rows are kept sparse by page so the grid can ask for any index; a change
 * to the filter drops every page and restarts from the top. Responses from a
 * superseded filter are discarded by generation, so a slow first page can
 * never overwrite a newer one.
 */
export function useTrackSource(filter: Ref<TrackFilter>) {
  const rows = ref<LibraryTrack[]>([]);
  const total = ref<number | undefined>(undefined);
  const loading = ref(false);
  const allLoaded = ref(false);
  const updateAvailable = ref(false);

  let generation = 0;
  const loadedPages = new Set<number>();
  const inFlight = new Map<number, Promise<void>>();

  const hasFilter = computed(
    () =>
      filter.value.favoritesOnly ||
      !!filter.value.search ||
      (filter.value.provider?.length ?? 0) > 0 ||
      (filter.value.genreIds?.length ?? 0) > 0,
  );

  async function refreshTotal(forGeneration: number) {
    const current = filter.value;
    if (!hasFilter.value) {
      total.value = store.libraryTracksCount;
      return;
    }
    // the count endpoint only knows about the favorites filter; any other
    // filter leaves the total to whatever the pages return
    if (
      current.search ||
      current.provider?.length ||
      current.genreIds?.length
    ) {
      total.value = undefined;
      return;
    }
    const count = await api.getLibraryTracksCount(current.favoritesOnly);
    if (forGeneration === generation) total.value = count;
  }

  function loadPage(offset: number): Promise<void> {
    const page = Math.floor(offset / TRACK_PAGE_SIZE);
    if (loadedPages.has(page) || allLoaded.value) return Promise.resolve();
    const pending = inFlight.get(page);
    if (pending) return pending;

    const forGeneration = generation;
    const current = filter.value;
    loading.value = true;
    const request = api
      .getLibraryTracks(
        current.favoritesOnly || undefined,
        current.search || undefined,
        TRACK_PAGE_SIZE,
        page * TRACK_PAGE_SIZE,
        current.sortBy,
        current.provider && current.provider.length > 0
          ? current.provider
          : undefined,
        current.genreIds && current.genreIds.length > 0
          ? current.genreIds
          : undefined,
      )
      .then((items) => {
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
      })
      .finally(() => {
        inFlight.delete(page);
        if (forGeneration === generation) loading.value = inFlight.size > 0;
      });
    inFlight.set(page, request);
    return request;
  }

  function ensureLoaded(index: number) {
    if (index < 0) return;
    void loadPage(index - (index % TRACK_PAGE_SIZE));
  }

  function reload() {
    generation += 1;
    loadedPages.clear();
    inFlight.clear();
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
      if (evt.object_id?.startsWith("library://track")) {
        updateAvailable.value = true;
      }
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
