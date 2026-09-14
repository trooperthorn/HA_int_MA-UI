import BrowserStrip from "@/library-manager/panes/BrowserStrip.vue";
import { MediaType } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, type Ref } from "vue";

const mocks = vi.hoisted(() => ({
  filters: [] as Array<Ref<Record<string, unknown>>>,
  setUserPreference: vi.fn(),
  storedFacets: null as unknown,
  // the sources with at least one playlist
  playlistSources: ["spotify--1"] as string[],
  getLibraryPlaylists: vi.fn(),
  libraryPlaylistsCount: 3 as number | undefined,
}));

vi.mock("@/plugins/api", () => {
  const api = { getLibraryPlaylists: mocks.getLibraryPlaylists };
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      get libraryPlaylistsCount() {
        return mocks.libraryPlaylistsCount;
      },
    }),
  };
});

vi.mock("@/library-manager/composables/useItemSource", () => ({
  useItemSource: (filter: Ref<Record<string, unknown>>) => {
    mocks.filters.push(filter);
    const rows = computed(() => {
      switch (filter.value.mediaType) {
        case MediaType.GENRE:
          return [{ item_id: "7", provider: "library", name: "Rock" }];
        case MediaType.PLAYLIST:
          return [{ item_id: "p1", provider: "spotify--1", name: "Mix" }];
        case MediaType.ARTIST:
          return [{ item_id: "a1", provider: "library", name: "Muse" }];
        default:
          return [{ item_id: "al1", provider: "library", name: "Drones" }];
      }
    });
    return {
      rows,
      total: ref(undefined),
      loading: ref(false),
      ensureLoaded: vi.fn(),
      jumpToLetter: vi.fn(async () => undefined),
    };
  },
}));

vi.mock("@/composables/userPreferences", async () => {
  const { computed } = await import("vue");
  return {
    setUserPreference: mocks.setUserPreference,
    useUserPreferences: () => ({
      getPreference: <T>(_key: string, fallback: T) =>
        computed(() => (mocks.storedFacets as T) ?? fallback),
    }),
  };
});

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

// the virtualizer needs a laid-out scroll element; render every row instead
vi.mock("@tanstack/vue-virtual", async () => {
  const { computed } = await import("vue");
  return {
    useVirtualizer: (options: {
      value: { count: number; estimateSize: () => number };
    }) =>
      computed(() => {
        const { count, estimateSize } = options.value;
        const size = estimateSize();
        return {
          getVirtualItems: () =>
            Array.from({ length: count }, (_, index) => ({
              index,
              key: index,
              start: index * size,
              size,
            })),
          getTotalSize: () => count * size,
          scrollToIndex: vi.fn(),
        };
      }),
  };
});

// transitive imports reach for the app-wide translator
vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

vi.mock("reka-ui", () => ({
  SplitterGroup: { template: "<div><slot /></div>" },
  SplitterPanel: { template: "<div><slot /></div>" },
  SplitterResizeHandle: { template: "<i />" },
}));

enableAutoUnmount(afterEach);

const storage = { getItem: () => null, setItem: () => {} };

function mountStrip(picks = { genres: [] }, provider = ["spotify--1"]) {
  return mount(BrowserStrip, {
    props: { picks, storage, provider },
    global: { mocks: { $t: (key: string) => key } },
  });
}

describe("BrowserStrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
    mocks.storedFacets = null;
    mocks.getLibraryPlaylists.mockImplementation(async (...args: unknown[]) =>
      mocks.playlistSources.includes(args[5] as string)
        ? [{ item_id: "p1", provider: "spotify--1", name: "Mix" }]
        : [],
    );
  });

  it("leads with artists for a source that has no playlists", async () => {
    const wrapper = mountStrip({ genres: [] }, ["filesystem_local--1"]);
    await flushPromises();

    const selects = wrapper.findAll("select.browser-column__facet");
    expect(
      selects.map((select) => (select.element as HTMLSelectElement).value),
    ).toEqual(["artist", "album", "album_artist"]);

    // the choice is kept per source
    await selects[0].setValue("genre");
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.browserFacets.filesystem_local--1",
      ["genre", "album", "album_artist"],
    );
  });

  it("lists genre, artist and album by default, each narrowed to the source", async () => {
    const wrapper = mountStrip();
    await flushPromises();

    const selects = wrapper.findAll("select.browser-column__facet");
    expect(
      selects.map((select) => (select.element as HTMLSelectElement).value),
    ).toEqual(["genre", "artist", "album"]);
    expect(selects[0].findAll("option").map((option) => option.text())).toEqual(
      [
        "genre",
        "artist",
        "library_manager.tree.album_artist",
        "album",
        "playlist",
      ],
    );
    expect(mocks.filters.map((filter) => filter.value.mediaType)).toEqual([
      MediaType.GENRE,
      MediaType.ARTIST,
      MediaType.ALBUM,
    ]);
    expect(mocks.filters[1].value.provider).toEqual(["spotify--1"]);
  });

  it("swaps a column to playlists, remembers it and clears the picks to its right", async () => {
    const wrapper = mountStrip({
      genres: [{ id: 7, name: "Rock" }],
      artist: { item_id: "a1", provider: "library", name: "Muse" },
      album: { item_id: "al1", provider: "library", name: "Drones" },
    } as never);
    await flushPromises();

    const first = wrapper.findAll("select.browser-column__facet")[0];
    await first.setValue("playlist");

    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.browserFacets.spotify--1",
      ["playlist", "artist", "album"],
    );
    expect(mocks.filters[0].value.mediaType).toBe(MediaType.PLAYLIST);
    expect(wrapper.emitted("update:picks")?.at(-1)?.[0]).toEqual({
      genres: [{ id: 7, name: "Rock" }],
      artist: undefined,
      album: undefined,
    });
  });

  it("picks a playlist and narrows the other columns by the genres picked", async () => {
    mocks.storedFacets = ["genre", "playlist", "album_artist"];
    const wrapper = mountStrip({ genres: [{ id: 7, name: "Rock" }] } as never);
    await flushPromises();

    expect(mocks.filters[1].value).toMatchObject({
      mediaType: MediaType.PLAYLIST,
      genreIds: [7],
    });
    expect(mocks.filters[2].value).toMatchObject({
      mediaType: MediaType.ARTIST,
      albumArtistsOnly: true,
      genreIds: [7],
    });

    const playlistRow = wrapper
      .findAll(".browser-column")[1]
      .findAll(".browser-column__row")
      .find((row) => row.text() === "Mix")!;
    await playlistRow.trigger("click");
    expect(wrapper.emitted("update:picks")?.at(-1)?.[0]).toMatchObject({
      genres: [{ id: 7, name: "Rock" }],
      playlist: { item_id: "p1", provider: "spotify--1", name: "Mix" },
    });
  });
});
