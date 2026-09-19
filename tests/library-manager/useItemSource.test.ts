import {
  TRACK_PAGE_SIZE,
  filterKey,
  useItemSource,
} from "@/library-manager/composables/useItemSource";
import type { LibraryFilter } from "@/library-manager/composables/useLibraryFilter";
import {
  MediaType,
  type BackgroundTask,
  type Track,
} from "@/plugins/api/interfaces";
import type { MusicAssistantApi } from "@/plugins/api";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref, type EffectScope, type Ref } from "vue";
import { track } from "../fixtures/track";

const {
  mockGetLibraryTracks,
  mockGetLibraryTracksCount,
  mockGetLibraryArtists,
  mockGetLibraryArtistsCount,
  mockBrowse,
  mockGetPlaylistTracks,
  mockGetArtistTracks,
  mockGetArtistTopTracks,
  mockGetAlbumTracks,
  mockGetTrack,
  mockSubscribe,
  syncListeners,
} = vi.hoisted(() => ({
  mockGetPlaylistTracks: vi.fn<MusicAssistantApi["getPlaylistTracks"]>(),
  mockGetArtistTracks: vi.fn<MusicAssistantApi["getArtistTracks"]>(),
  mockGetArtistTopTracks: vi.fn<MusicAssistantApi["getArtistTopTracks"]>(),
  mockGetAlbumTracks: vi.fn<MusicAssistantApi["getAlbumTracks"]>(),
  mockGetTrack: vi.fn<MusicAssistantApi["getTrack"]>(),
  mockGetLibraryTracks: vi.fn<MusicAssistantApi["getLibraryTracks"]>(),
  mockGetLibraryTracksCount:
    vi.fn<MusicAssistantApi["getLibraryTracksCount"]>(),
  mockGetLibraryArtists: vi.fn<MusicAssistantApi["getLibraryArtists"]>(),
  mockGetLibraryArtistsCount:
    vi.fn<MusicAssistantApi["getLibraryArtistsCount"]>(),
  mockBrowse: vi.fn<MusicAssistantApi["browse"]>(),
  mockSubscribe: vi.fn(() => () => {}),
  syncListeners: [] as Array<() => void>,
}));

vi.mock("@/plugins/api", () => {
  const api = {
    getLibraryTracks: mockGetLibraryTracks,
    getLibraryTracksCount: mockGetLibraryTracksCount,
    getLibraryArtists: mockGetLibraryArtists,
    getLibraryArtistsCount: mockGetLibraryArtistsCount,
    browse: mockBrowse,
    getPlaylistTracks: mockGetPlaylistTracks,
    getArtistTracks: mockGetArtistTracks,
    getArtistTopTracks: mockGetArtistTopTracks,
    getAlbumTracks: mockGetAlbumTracks,
    getTrack: mockGetTrack,
    subscribe: mockSubscribe,
  };
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      libraryTracksCount: 12418,
      libraryArtistsCount: 1842,
      activePlayerId: "p1",
    }),
  };
});

vi.mock("@/composables/useLibrarySync", () => ({
  onLibrarySyncCompleted: (_type: unknown, callback: () => void) => {
    syncListeners.push(callback);
    return () => {
      const index = syncListeners.indexOf(callback);
      if (index !== -1) syncListeners.splice(index, 1);
    };
  },
}));

const page = (offset: number, count = TRACK_PAGE_SIZE) =>
  Array.from({ length: count }, (_, i) =>
    track({ item_id: `t${offset + i}`, name: `Track ${offset + i}` }),
  );

describe("useItemSource", () => {
  let scope: EffectScope;
  let filter: Ref<LibraryFilter>;

  beforeEach(() => {
    vi.clearAllMocks();
    syncListeners.length = 0;
    mockGetLibraryTracksCount.mockResolvedValue(7);
    filter = ref<LibraryFilter>({
      scope: "library",
      node: "library.tracks",
      mediaType: MediaType.TRACK,
      search: "",
      sortBy: "name",
      favoritesOnly: false,
    });
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
  });

  it("requests the first page with the filter's sort and the library total", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0));
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetLibraryTracks).toHaveBeenCalledWith(
      undefined,
      undefined,
      TRACK_PAGE_SIZE,
      0,
      "name",
      undefined,
      undefined,
    );
    expect(source.rows.value).toHaveLength(TRACK_PAGE_SIZE);
    expect(source.total.value).toBe(12418);
    expect(source.allLoaded.value).toBe(false);
  });

  it("loads the page an index falls in, once", async () => {
    mockGetLibraryTracks.mockImplementation(async (...args) =>
      page(args[3] ?? 0),
    );
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    source.ensureLoaded(450);
    source.ensureLoaded(451);
    await flushPromises();

    const offsets = mockGetLibraryTracks.mock.calls.map((call) => call[3]);
    expect(offsets).toEqual([0, 400]);
    expect(source.rows.value[450]?.item_id).toBe("t450");
    expect(source.rows.value[250]).toBeUndefined();
  });

  it("marks the end of the list on a short page", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0, 7));
    filter.value = { ...filter.value, favoritesOnly: true };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetLibraryTracks).toHaveBeenLastCalledWith(
      true,
      undefined,
      TRACK_PAGE_SIZE,
      0,
      "name",
      undefined,
      undefined,
    );
    expect(mockGetLibraryTracksCount).toHaveBeenCalledWith(true);
    expect(source.allLoaded.value).toBe(true);
    expect(source.rows.value).toHaveLength(7);
    expect(source.total.value).toBe(7);
  });

  it("drops a response that belongs to a superseded filter", async () => {
    let resolveSlow: (items: ReturnType<typeof page>) => void = () => {};
    mockGetLibraryTracks
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlow = resolve;
          }),
      )
      .mockResolvedValueOnce(page(0, 3));
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    filter.value = { ...filter.value, search: "horisont" };
    await flushPromises();
    expect(source.rows.value).toHaveLength(3);

    resolveSlow(page(0));
    await flushPromises();
    expect(source.rows.value).toHaveLength(3);
    expect(source.total.value).toBe(3);
  });

  it("flags new content after a library sync and reloads on demand", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0, 2));
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();
    expect(source.updateAvailable.value).toBe(false);

    syncListeners.forEach((listener) => listener());
    expect(source.updateAvailable.value).toBe(true);

    source.reload();
    await flushPromises();
    expect(source.updateAvailable.value).toBe(false);
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(2);
  });

  it("stops listening when its scope ends", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0, 1));
    scope.run(() => useItemSource(filter));
    await flushPromises();
    expect(syncListeners).toHaveLength(1);

    scope.stop();
    expect(syncListeners).toHaveLength(0);
  });

  it("jumps to a letter by bisecting the server's own order", async () => {
    // 1,000 tracks named a000..a999 then z000.. so "z" starts at index 1000
    const names = (offset: number) =>
      Array.from({ length: TRACK_PAGE_SIZE }, (_, i) => {
        const n = offset + i;
        return n < 1000
          ? `a${String(n).padStart(3, "0")}`
          : `z${String(n - 1000).padStart(3, "0")}`;
      });
    mockGetLibraryTracks.mockImplementation(async (...args) => {
      const offset = args[3] ?? 0;
      return names(offset).map((name, i) =>
        track({ item_id: `t${offset + i}`, name }),
      );
    });
    const { store } = await import("@/plugins/store");
    (store as { libraryTracksCount?: number }).libraryTracksCount = 1400;
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    const index = await source.jumpToLetter("z");
    expect(index).toBe(1000);
    expect(source.rows.value[1000]?.name).toBe("z000");
    // bisection touched a handful of pages, not all seven
    const offsets = mockGetLibraryTracks.mock.calls.map((call) => call[3]);
    expect(offsets.length).toBeLessThan(7);
    expect(await source.jumpToLetter("q")).toBeUndefined();
  });

  it("keeps paging after a short last page landed out of order", async () => {
    // page 1 is short; a jump ahead loads it before page 0
    const total = TRACK_PAGE_SIZE + 30;
    mockGetLibraryTracks.mockImplementation(async (...args) => {
      const offset = args[3] ?? 0;
      return page(
        offset,
        Math.max(0, Math.min(TRACK_PAGE_SIZE, total - offset)),
      );
    });
    mockGetLibraryTracksCount.mockResolvedValue(total);
    filter.value = { ...filter.value, favoritesOnly: true };
    const source = scope.run(() => useItemSource(filter))!;
    // let the count land but hold page 0 back by asking for page 1 first
    source.ensureLoaded(TRACK_PAGE_SIZE + 10);
    await flushPromises();

    expect(source.total.value).toBe(total);
    expect(source.rows.value).toHaveLength(total);
    expect(source.allLoaded.value).toBe(true);
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(2);
    expect(source.rows.value[5]?.name).toBe("Track 5");
  });

  it("does not let a superseded page response cancel the fresh one", async () => {
    let releaseFirst: (items: Track[]) => void = () => {};
    mockGetLibraryTracks
      .mockImplementationOnce(
        () => new Promise<Track[]>((resolve) => (releaseFirst = resolve)),
      )
      .mockResolvedValue(page(0, 3));
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();
    source.reload();
    releaseFirst(page(0, 3));
    await flushPromises();
    source.ensureLoaded(0);
    await flushPromises();
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(2);
    expect(source.rows.value).toHaveLength(3);
  });

  it("keys a filter by content, not by key order or absent fields", () => {
    const base: LibraryFilter = filter.value;
    expect(filterKey({ ...base, genreIds: undefined })).toBe(filterKey(base));
    expect(
      filterKey({
        ...base,
        artist: { item_id: "1", provider: "library", name: "A" },
      }),
    ).toBe(
      filterKey({
        ...base,
        artist: { name: "A", provider: "library", item_id: "1" },
      }),
    );
    expect(filterKey({ ...base, genreIds: [1, 2] })).not.toBe(filterKey(base));
  });

  it("ignores a filter object that only changed identity", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0, 3));
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(1);

    filter.value = { ...filter.value };
    await flushPromises();
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(1);
    expect(source.rows.value).toHaveLength(3);

    filter.value = { ...filter.value, search: "x" };
    await flushPromises();
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(2);
  });

  it("pages the whole listing in for a local sort", async () => {
    mockGetLibraryTracks.mockImplementation(async (...args) => {
      const limit = args[2] ?? 0;
      const offset = args[3] ?? 0;
      const remaining = Math.max(0, 2500 - offset);
      return page(offset, Math.min(limit, remaining));
    });
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();
    expect(source.rows.value).toHaveLength(TRACK_PAGE_SIZE);

    await source.loadAll();
    expect(source.rows.value).toHaveLength(2500);
    expect(source.allLoaded.value).toBe(true);
    expect(source.total.value).toBe(2500);
    const limits = mockGetLibraryTracks.mock.calls.map((call) => call[2]);
    expect(limits.slice(1)).toEqual([2000, 2000]);

    // a second call is a no-op and a later page request does nothing
    await source.loadAll();
    source.ensureLoaded(2400);
    await flushPromises();
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(3);
  });

  it("lists album artists through the artists endpoint with its own count", async () => {
    mockGetLibraryArtists.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) =>
        track({ item_id: `a${i}`, media_type: MediaType.ARTIST }),
      ) as never,
    );
    mockGetLibraryArtistsCount.mockResolvedValue(12);
    filter.value = {
      ...filter.value,
      node: "library.album_artists",
      mediaType: MediaType.ARTIST,
      albumArtistsOnly: true,
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetLibraryArtists).toHaveBeenCalledWith(
      undefined,
      undefined,
      TRACK_PAGE_SIZE,
      0,
      "name",
      true,
      undefined,
      undefined,
    );
    expect(mockGetLibraryArtistsCount).toHaveBeenCalledWith(false, true);
    expect(source.total.value).toBe(12);
    expect(mockGetLibraryTracks).not.toHaveBeenCalled();
  });

  it("loads a browse listing in one go", async () => {
    mockBrowse.mockResolvedValue(page(0, 5));
    filter.value = {
      ...filter.value,
      scope: "browse",
      node: "browse:spotify://tracks",
      mediaType: MediaType.FOLDER,
      browsePath: "spotify://tracks",
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockBrowse).toHaveBeenCalledWith("spotify://tracks", "p1");
    expect(source.rows.value).toHaveLength(5);
    expect(source.total.value).toBe(5);
    expect(source.allLoaded.value).toBe(true);

    source.ensureLoaded(4);
    await flushPromises();
    expect(mockBrowse).toHaveBeenCalledTimes(1);
  });

  it("lists a picked playlist's tracks, narrowed by an artist picked beside it", async () => {
    const artistOf = (name: string) =>
      ({
        item_id: name,
        provider: "library",
        name,
        media_type: MediaType.ARTIST,
      }) as unknown as ReturnType<typeof track>["artists"][number];
    mockGetPlaylistTracks.mockResolvedValue([
      track({ item_id: "t1", name: "One", artists: [artistOf("Muse")] }),
      track({
        item_id: "t2",
        name: "Two",
        artists: [artistOf("Someone Else")],
      }),
    ]);
    filter.value = {
      ...filter.value,
      playlist: { item_id: "p1", provider: "spotify--1", name: "Mix" },
      artist: { item_id: "a1", provider: "library", name: "Muse" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetPlaylistTracks).toHaveBeenCalledWith("p1", "spotify--1");
    expect(source.rows.value.map((row) => row.item_id)).toEqual(["t1"]);
    expect(source.allLoaded.value).toBe(true);
    expect(mockGetLibraryTracks).not.toHaveBeenCalled();
  });

  it("sorts an artist's browse-scope tracks locally by title when the user picked that sort", async () => {
    mockGetArtistTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Zebra", track_number: 1 }),
      track({ item_id: "t2", name: "Apple", track_number: 2 }),
      track({ item_id: "t3", name: "Mango", track_number: 3 }),
    ]);
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      sortBy: "name",
      sortExplicit: true,
      artist: { item_id: "a1", provider: "library", name: "Muse" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetArtistTracks).toHaveBeenCalledWith("a1", "library");
    expect(source.rows.value.map((row) => row.name)).toEqual([
      "Apple",
      "Mango",
      "Zebra",
    ]);
  });

  it("falls back to top tracks when an artist has no in-library tracks", async () => {
    mockGetArtistTracks.mockResolvedValue([]);
    mockGetArtistTopTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Iris" }),
    ]);
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      artist: { item_id: "a1", provider: "library", name: "Goo Goo Dolls" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetArtistTracks).toHaveBeenCalledWith("a1", "library");
    expect(mockGetArtistTopTracks).toHaveBeenCalledWith("a1", "library");
    expect(source.rows.value.map((row) => row.item_id)).toEqual(["t1"]);
  });

  it("does not call top tracks when the artist already has in-library tracks", async () => {
    mockGetArtistTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Iris" }),
    ]);
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      artist: { item_id: "a1", provider: "library", name: "Goo Goo Dolls" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetArtistTopTracks).not.toHaveBeenCalled();
    expect(source.rows.value.map((row) => row.item_id)).toEqual(["t1"]);
  });

  it("keeps an artist's browse-scope tracks in track-number order when not sorting by title", async () => {
    mockGetArtistTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Zebra", track_number: 3 }),
      track({ item_id: "t2", name: "Apple", track_number: 1 }),
      track({ item_id: "t3", name: "Mango", track_number: 2 }),
    ]);
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      sortBy: "last_played",
      sortExplicit: true,
      artist: { item_id: "a1", provider: "library", name: "Muse" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(source.rows.value.map((row) => row.name)).toEqual([
      "Zebra",
      "Apple",
      "Mango",
    ]);
  });

  it("keeps an album's tracks in the provider's order under the default sort", async () => {
    mockGetAlbumTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Zebra", track_number: 1 }),
      track({ item_id: "t2", name: "Apple", track_number: 2 }),
      track({ item_id: "t3", name: "Mango", track_number: 3 }),
    ]);
    // the untouched toolbar default: sortBy is "name" but nobody picked it
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      sortBy: "name",
      album: { item_id: "b1", provider: "library", name: "Origin of Symmetry" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(mockGetAlbumTracks).toHaveBeenCalledWith("b1", "library");
    expect(source.rows.value.map((row) => row.name)).toEqual([
      "Zebra",
      "Apple",
      "Mango",
    ]);
  });

  it("sorts an album's tracks by title once the user picks that sort", async () => {
    mockGetAlbumTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Zebra", track_number: 1 }),
      track({ item_id: "t2", name: "Apple", track_number: 2 }),
      track({ item_id: "t3", name: "Mango", track_number: 3 }),
    ]);
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      sortBy: "name",
      sortExplicit: true,
      album: { item_id: "b1", provider: "library", name: "Origin of Symmetry" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    expect(source.rows.value.map((row) => row.name)).toEqual([
      "Apple",
      "Mango",
      "Zebra",
    ]);
  });

  it("re-sorts when the same sort value becomes an explicit pick", async () => {
    mockGetAlbumTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Zebra", track_number: 1 }),
      track({ item_id: "t2", name: "Apple", track_number: 2 }),
    ]);
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      sortBy: "name",
      album: { item_id: "b1", provider: "library", name: "Origin of Symmetry" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();
    expect(source.rows.value.map((row) => row.name)).toEqual([
      "Zebra",
      "Apple",
    ]);

    filter.value = { ...filter.value, sortExplicit: true };
    await flushPromises();
    expect(source.rows.value.map((row) => row.name)).toEqual([
      "Apple",
      "Zebra",
    ]);
  });

  it("does not re-run a one-shot request when a local sort asks for everything", async () => {
    mockGetArtistTracks.mockResolvedValue([
      track({ item_id: "t1", name: "Iris" }),
    ]);
    filter.value = {
      ...filter.value,
      mediaType: MediaType.TRACK,
      artist: { item_id: "a1", provider: "library", name: "Goo Goo Dolls" },
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();
    expect(mockGetArtistTracks).toHaveBeenCalledTimes(1);

    await source.loadAll();
    await flushPromises();
    // loadAll has nothing to do for a listing that arrived whole; asking the
    // fetch function whether it is one must not fire the fetch again
    expect(mockGetArtistTracks).toHaveBeenCalledTimes(1);
    expect(mockGetLibraryTracks).not.toHaveBeenCalled();
  });

  it("lists the sync issues from the tasks and flags a changed log", async () => {
    mockGetTrack.mockResolvedValue(
      track({ item_id: "42", name: "Green Light" }),
    );
    const tasks = ref<BackgroundTask[]>([
      {
        id: "music_sync_filesystem_local--1_track",
        metadata: {
          task_domain: "music_sync",
          provider_instance: "filesystem_local--1",
          provider_domain: "filesystem_local",
          provider_name: "Filesystem",
        },
        logs: [
          "2026-09-12 20:52:37 WARNING [music_assistant.Filesystem] Lorde/Melodrama/01 - Green Light.flac is missing ID3 tag [albumartist], using Various Artists as fallback",
        ],
        failure_messages: [
          "Failed to process Aaron Lewis/Town Line/Town Line.cue: Audio file not found for CUE sheet: Aaron Lewis/Town Line/Town Line.cue",
        ],
      } as unknown as BackgroundTask,
    ]);
    filter.value = {
      ...filter.value,
      scope: "issues",
      node: "sync_issues.missing_tag:albumartist",
      issueType: "missing_tag:albumartist",
    };
    const source = scope.run(() => useItemSource(filter, { tasks }))!;
    await flushPromises();

    expect(mockGetLibraryTracks).not.toHaveBeenCalled();
    expect(source.rows.value.map((row) => row.item_id)).toEqual(["42"]);
    expect(source.rows.value[0].sync_issue?.type).toBe(
      "missing_tag:albumartist",
    );
    expect(source.total.value).toBe(1);
    expect(source.allLoaded.value).toBe(true);
    expect(source.updateAvailable.value).toBe(false);

    // the whole node lists every kind
    filter.value = {
      ...filter.value,
      node: "sync_issues",
      issueType: undefined,
    };
    await flushPromises();
    expect(source.rows.value.map((row) => row.name)).toEqual([
      "Green Light",
      "Town Line.cue",
    ]);

    // a sync that logs a new issue makes the listing stale
    tasks.value = [
      {
        ...tasks.value[0],
        logs: [
          ...tasks.value[0].logs,
          "2026-09-12 20:52:38 WARNING [music_assistant.Filesystem] Lorde/Pure Heroine/01 - Tennis Court.flac is missing ID3 tag [albumartist], using Various Artists as fallback",
        ],
      },
    ];
    await flushPromises();
    expect(source.updateAvailable.value).toBe(true);
  });

  it("keeps pulling raw pages until a files-to-edit page is full", async () => {
    // two raw pages: the first has one untagged track, the second is short
    // and ends the library
    const tagged = page(0).map((item) =>
      track({
        ...item,
        album: {
          item_id: "b",
          provider: "library",
          name: "Album",
          version: "",
          uri: "library://album/b",
          external_ids: [],
          is_playable: true,
          media_type: MediaType.ALBUM,
          available: true,
          year: 2001,
          artists: [
            {
              item_id: "ar",
              provider: "library",
              name: "Artist",
              version: "",
              uri: "library://artist/ar",
              external_ids: [],
              is_playable: false,
              media_type: MediaType.ARTIST,
              available: true,
            },
          ],
        } as never,
      }),
    );
    tagged[3] = track({ item_id: "untagged", name: "Untagged", album: null });
    mockGetLibraryTracks
      .mockResolvedValueOnce(tagged)
      .mockResolvedValueOnce(page(200, 2));
    filter.value = {
      ...filter.value,
      node: "library.files_to_edit",
      filesToEdit: true,
    };
    const source = scope.run(() => useItemSource(filter))!;
    await flushPromises();

    const offsets = mockGetLibraryTracks.mock.calls.map((call) => call[3]);
    expect(offsets).toEqual([0, 200]);
    expect(source.rows.value.map((item) => item.item_id)).toEqual([
      "untagged",
      "t200",
      "t201",
    ]);
    expect(source.allLoaded.value).toBe(true);
    expect(source.total.value).toBe(3);
  });
});
