import SourceTree from "@/library-manager/panes/SourceTree.vue";
import type { MusicAssistantApi } from "@/plugins/api";
import { MediaType } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  browse: vi.fn<MusicAssistantApi["browse"]>(),
  getLibraryTracks: vi.fn(),
  getLibraryArtists: vi.fn(),
  getLibraryAlbums: vi.fn(),
  getLibraryPlaylists: vi.fn(),
  emit: vi.fn(),
  getLibraryArtistsCount: vi.fn(),
  getLibraryAlbumsCount: vi.fn(),
  getLibraryTracksCount: vi.fn(),
  getLibraryGenresCount: vi.fn(),
  getLibraryPlaylistsCount: vi.fn(),
  setUserPreference: vi.fn(),
  togglePlayerQueue: vi.fn(),
}));

vi.mock("@/plugins/api", async () => {
  const { ref } = await import("vue");
  const api = {
    state: ref("initialized"),
    browse: mocks.browse,
    getLibraryTracks: mocks.getLibraryTracks,
    getLibraryArtists: mocks.getLibraryArtists,
    getLibraryAlbums: mocks.getLibraryAlbums,
    getLibraryPlaylists: mocks.getLibraryPlaylists,
    getLibraryArtistsCount: mocks.getLibraryArtistsCount,
    getLibraryAlbumsCount: mocks.getLibraryAlbumsCount,
    getLibraryTracksCount: mocks.getLibraryTracksCount,
    getLibraryGenresCount: mocks.getLibraryGenresCount,
    getLibraryPlaylistsCount: mocks.getLibraryPlaylistsCount,
    players: {
      p1: {
        player_id: "p1",
        enabled: true,
        available: true,
        needs_setup: false,
        type: "player",
      },
      p2: {
        enabled: false,
        available: true,
        needs_setup: false,
        type: "player",
      },
    },
    providers: {
      "spotify--1": {
        type: "music",
        domain: "spotify",
        name: "Spotify",
        instance_id: "spotify--1",
        available: true,
        supported_features: [
          "library_artists",
          "library_albums",
          "library_tracks",
          "library_playlists",
          "library_podcasts",
        ],
      },
      "filesystem_local--1": {
        type: "music",
        domain: "filesystem_local",
        name: "Filesystem",
        instance_id: "filesystem_local--1",
        available: true,
        supported_features: ["browse"],
      },
      "radiobrowser--1": {
        type: "music",
        domain: "radiobrowser",
        name: "RadioBrowser",
        instance_id: "radiobrowser--1",
        available: true,
        supported_features: ["browse", "library_radios"],
      },
    },
    getProvider(id: string) {
      return (this.providers as Record<string, unknown>)[id];
    },
  };
  return { api, default: api, ConnectionState: { INITIALIZED: "initialized" } };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      dialogActive: false,
      showPlayersMenu: false,
      activePlayerId: "p1",
      currentUser: { preferences: {} },
    }),
  };
});

const prefs = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/composables/userPreferences", async () => {
  const { computed, reactive } = await import("vue");
  const state = reactive(prefs.value);
  prefs.value = state;
  mocks.setUserPreference.mockImplementation(
    async (key: string, value: unknown) => {
      state[key] = value;
    },
  );
  return {
    setUserPreference: mocks.setUserPreference,
    useUserPreferences: () => ({
      getPreference: <T>(key: string, fallback: T) =>
        computed(() => (state[key] as T | undefined) ?? fallback),
    }),
  };
});

vi.mock("@/plugins/eventbus", () => ({ eventbus: { emit: mocks.emit } }));

vi.mock("@/composables/useLibrarySync", () => ({
  onLibrarySyncCompleted: () => () => {},
}));

const syncTasks = vi.hoisted(() => ({ tasks: [] as unknown[] }));
vi.mock("@/composables/background-tasks/useBackgroundTasks", async () => {
  const { computed } = await import("vue");
  return {
    useBackgroundTasks: () => ({
      tasks: computed(() => syncTasks.tasks),
    }),
  };
});

vi.mock("@/helpers/player_queue", () => ({
  togglePlayerQueue: mocks.togglePlayerQueue,
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

// transitive imports reach for the app-wide translator
vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

vi.mock("@/components/ProviderIcon.vue", () => ({
  default: { name: "ProviderIcon", props: ["domain"], template: "<i />" },
}));

enableAutoUnmount(afterEach);

const folder = (name: string, path: string, provider = "spotify--1") => ({
  item_id: path,
  provider,
  name,
  version: "",
  uri: path,
  external_ids: [],
  is_playable: false,
  media_type: MediaType.FOLDER as const,
  path,
  image: null,
});

const standardFolder = (itemId: string, name: string) => ({
  ...folder(name, `spotify--1://${itemId}`),
  item_id: itemId,
});

function mountTree(activeNode = "library.tracks") {
  return mount(SourceTree, {
    props: { activeNode },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

const rowLabels = (wrapper: ReturnType<typeof mountTree>) =>
  wrapper
    .findAll(".source-tree__row")
    .map((row) => row.find(".source-tree__label").text());

const rowTexts = (wrapper: ReturnType<typeof mountTree>) =>
  wrapper.findAll(".source-tree__row").map((row) => {
    const label = row.find(".source-tree__label").text();
    const count = row.find(".source-tree__count");
    return count.exists() ? `${label} ${count.text()}` : label;
  });

// the library row names its source
const LIBRARY_ALL =
  "library_manager.tree.library (library_manager.tree.source_all)";

// per-source counts are probed by asking for one item at an offset; each
// listing here has a fixed length per source
const SOURCE_SIZES: Record<string, Record<string, number>> = {
  "spotify--1": { tracks: 120, artists: 9, albums: 14, playlists: 3 },
  "filesystem_local--1": { tracks: 380, artists: 25, albums: 31, playlists: 0 },
};
const probe =
  (key: string, offsetIndex: number, providerIndex: number) =>
  async (...args: unknown[]) => {
    const offset = args[offsetIndex] as number;
    const provider = args[providerIndex] as string;
    const size = SOURCE_SIZES[provider]?.[key] ?? 0;
    if (offset >= size) return [];
    // the genre count pages the tracks in whole and reads their tags
    const limit = args[2] as number;
    if (key === "tracks" && limit > 1) {
      return [
        { item_id: "1", metadata: { genres: ["Rock", "Pop"] } },
        { item_id: "2", metadata: { genres: ["Rock"] } },
      ];
    }
    return [{ item_id: String(offset) }];
  };

describe("SourceTree", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { store } = await import("@/plugins/store");
    store.showPlayersMenu = false;
    mocks.getLibraryArtistsCount.mockImplementation(
      async (_fav?: boolean, albumArtists?: boolean) =>
        albumArtists ? 12 : 30,
    );
    mocks.getLibraryAlbumsCount.mockResolvedValue(40);
    mocks.getLibraryTracksCount.mockResolvedValue(500);
    mocks.getLibraryGenresCount.mockResolvedValue(7);
    mocks.getLibraryPlaylistsCount.mockResolvedValue(3);
    mocks.setUserPreference.mockImplementation(
      async (key: string, value: unknown) => {
        prefs.value[key] = value;
      },
    );
    delete prefs.value["libraryManager.librarySource"];
    delete prefs.value["libraryManager.tree"];
    mocks.getLibraryTracks.mockImplementation(probe("tracks", 3, 5));
    mocks.getLibraryArtists.mockImplementation(probe("artists", 3, 6));
    mocks.getLibraryAlbums.mockImplementation(probe("albums", 3, 6));
    mocks.getLibraryPlaylists.mockImplementation(probe("playlists", 3, 5));
    mocks.browse.mockImplementation(async (path?: string) => {
      if (!path) {
        return [
          folder("Spotify", "spotify--1://", "spotify"),
          folder("Filesystem", "filesystem_local--1://", "filesystem_local"),
          folder("RadioBrowser", "radiobrowser--1://", "radiobrowser"),
        ];
      }
      if (path === "spotify--1://") {
        return [
          folder("..", "root"),
          standardFolder("new-releases", "New Releases"),
          standardFolder("categories", "Genres & Moods"),
          standardFolder("artists", "Artists"),
          standardFolder("albums", "Albums"),
          standardFolder("tracks", "Tracks"),
          standardFolder("playlists", "Playlists"),
          standardFolder("podcasts", "Podcasts"),
        ];
      }
      if (path === "filesystem_local--1://") {
        return [
          folder("..", "root"),
          folder("Music", "filesystem_local--1://Music", "filesystem_local--1"),
        ];
      }
      return [folder("..", "root")];
    });
  });

  it("lists the library in source order without a tracks node", async () => {
    const wrapper = mountTree();
    await flushPromises();

    const labels = rowLabels(wrapper);
    const libraryStart = labels.indexOf(LIBRARY_ALL);
    expect(libraryStart).toBeGreaterThan(0);
    expect(labels.slice(libraryStart + 1, libraryStart + 8)).toEqual([
      "playlists",
      "artists",
      "library_manager.tree.album_artists",
      "genres",
      "albums",
      "library_manager.tree.recently_added",
      "library_manager.tree.files_to_edit",
    ]);
    expect(labels).not.toContain("tracks");
    // every source sits beside the library, not under a group
    expect(labels).not.toContain("library_manager.tree.sources");
    const spotify = wrapper
      .findAll(".source-tree__row")
      .find((row) => row.text().includes("Spotify"))!;
    expect(spotify.attributes("aria-level")).toBe("1");
  });

  it("gives a music source the library listings and drops folders with nothing behind them", async () => {
    const wrapper = mountTree();
    await flushPromises();

    const rows = () => wrapper.findAll(".source-tree__row");
    const spotify = rows().find((row) => row.text().includes("Spotify"))!;
    await spotify.find(".source-tree__chevron").trigger("click");
    await flushPromises();

    const labels = rowLabels(wrapper);
    const start = labels.indexOf("Spotify");
    expect(labels.slice(start + 1, start + 6)).toEqual([
      "playlists",
      "artists",
      "library_manager.tree.album_artists",
      "genres",
      "albums",
    ]);
    for (const dropped of [
      "New Releases",
      "Genres & Moods",
      "Tracks",
      "Podcasts",
    ]) {
      expect(labels).not.toContain(dropped);
    }

    // the source itself lists its tracks like the library does
    await spotify.trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      scope: "library",
      mediaType: MediaType.TRACK,
      provider: ["spotify--1"],
    });

    // a listing under the source carries the source
    // the source's genres node, the one after its listings, with its count
    const genres = rows().filter(
      (row) => row.find(".source-tree__label").text() === "genres",
    );
    expect(genres).toHaveLength(2);
    expect(genres[1].find(".source-tree__count").text()).toBe("2");
    await genres[1].trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      scope: "library",
      node: "source:spotify--1.genres",
      mediaType: MediaType.TRACK,
      leadFacet: "genre",
      provider: ["spotify--1"],
    });
  });

  it("keeps a folder tree for the filesystem and hides the chevron of an empty source", async () => {
    const wrapper = mountTree();
    await flushPromises();

    const rows = () => wrapper.findAll(".source-tree__row");
    const radio = rows().find((row) => row.text().includes("RadioBrowser"))!;
    expect(radio.find("button.source-tree__chevron").exists()).toBe(false);

    const filesystem = rows().find((row) => row.text().includes("Filesystem"))!;
    expect(filesystem.find("button.source-tree__chevron").exists()).toBe(true);
    await filesystem.find(".source-tree__chevron").trigger("click");
    await flushPromises();
    // no playlists on the filesystem, so no playlists node; the directories
    // are grouped under a folders node with the source's counts beside it
    const labels = rowLabels(wrapper);
    const start = labels.indexOf("Filesystem");
    expect(labels.slice(start + 1, start + 6)).toEqual([
      "artists",
      "library_manager.tree.album_artists",
      "genres",
      "albums",
      "library_manager.tree.folders",
    ]);
    expect(rowTexts(wrapper)).toContain("Filesystem 380");
    expect(rowTexts(wrapper)).toContain("artists 25");
    expect(rowTexts(wrapper)).toContain("albums 31");
    // the distinct genres tagged on the source's tracks
    expect(rowTexts(wrapper)).toContain("genres 2");

    const folders = rows().find(
      (row) => row.text() === "library_manager.tree.folders",
    )!;
    await folders.find(".source-tree__chevron").trigger("click");
    await flushPromises();
    expect(rowLabels(wrapper)).toContain("Music");

    await rows()
      .find((row) => row.text() === "Music")!
      .trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      scope: "browse",
      browsePath: "filesystem_local--1://Music",
      provider: ["filesystem_local--1"],
    });
  });

  it("shows the library nodes with every count, and one node per provider", async () => {
    const wrapper = mountTree();
    await flushPromises();

    const text = rowTexts(wrapper);
    expect(text).toContain("artists 30");
    expect(text).toContain("library_manager.tree.album_artists 12");
    expect(text).toContain("albums 40");
    expect(text).toContain(`${LIBRARY_ALL} 500`);
    expect(text).toContain("genres 7");
    expect(text).toContain("playlists 3");
    expect(text).toContain("players 1");
    // each source shows how many tracks it holds
    expect(text).toContain("Spotify 120");
    expect(text).toContain("Filesystem 380");

    expect(mocks.browse).toHaveBeenCalledWith(undefined, "p1");
    expect(rowLabels(wrapper)).toContain("Spotify");
    expect(rowLabels(wrapper)).toContain("Filesystem");
  });

  it("browses a provider once and hides its parent entry", async () => {
    const wrapper = mountTree();
    await flushPromises();

    const spotify = wrapper
      .findAll(".source-tree__row")
      .find((row) => row.text().includes("Spotify"))!;
    await spotify.find(".source-tree__chevron").trigger("click");
    await flushPromises();

    const labels = rowLabels(wrapper);
    expect(labels).not.toContain("..");
    expect(mocks.browse).toHaveBeenCalledWith("spotify--1://", "p1");

    await spotify.find(".source-tree__chevron").trigger("click");
    await spotify.find(".source-tree__chevron").trigger("click");
    await flushPromises();
    expect(
      mocks.browse.mock.calls.filter((call) => call[0] === "spotify--1://"),
    ).toHaveLength(1);
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.tree",
      expect.arrayContaining(["source:spotify--1"]),
    );
  });

  it("narrows the library to one source from its right-click menu", async () => {
    const wrapper = mountTree("library.artists");
    await flushPromises();

    const rows = () => wrapper.findAll(".source-tree__row");
    await rows()
      .find((row) => row.text().startsWith(LIBRARY_ALL))!
      .trigger("contextmenu");
    const menu = mocks.emit.mock.calls.at(-1)!;
    expect(menu[0]).toBe("contextmenu");
    const items = (menu[1] as { items: Array<Record<string, unknown>> }).items;
    expect(items.map((item) => [item.label, item.selected])).toEqual([
      ["library_manager.tree.source_all", true],
      ["Filesystem", false],
      ["RadioBrowser", false],
      ["Spotify", false],
    ]);

    (items[3].action as () => void)();
    await flushPromises();
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.librarySource",
      "spotify--1",
    );
    // the row names the source, carries its counts, and the listing the
    // grid shows follows
    const text = rowTexts(wrapper);
    expect(text).toContain("library_manager.tree.library (Spotify) 120");
    expect(text).toContain("artists 9");
    expect(text).toContain("albums 14");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      node: "library.artists",
      provider: ["spotify--1"],
    });
    const playlists = rows().find(
      (row) => row.find(".source-tree__label").text() === "playlists",
    )!;
    expect(playlists.find(".source-tree__count").text()).toBe("3");
    await playlists.trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      node: "library.playlists",
      leadFacet: "playlist",
      provider: ["spotify--1"],
    });
  });

  it("emits a library filter for a library node and a browse filter for a folder", async () => {
    const wrapper = mountTree();
    await flushPromises();

    const rows = () => wrapper.findAll(".source-tree__row");
    await rows()
      .find((row) =>
        row.text().startsWith("library_manager.tree.album_artists"),
      )!
      .trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      scope: "library",
      mediaType: MediaType.TRACK,
      leadFacet: "album_artist",
    });

    await rows()
      .find((row) =>
        row.text().startsWith("library_manager.tree.recently_added"),
      )!
      .trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      sortOverride: "timestamp_added_desc",
    });

    await rows()
      .find((row) => row.text().includes("RadioBrowser"))!
      .trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toMatchObject({
      scope: "browse",
      browsePath: "radiobrowser--1://",
      provider: ["radiobrowser--1"],
    });
  });

  it("lists the sync issues by kind of failure and hides them when there are none", async () => {
    expect(rowLabels(mountTree())).not.toContain(
      "library_manager.tree.sync_issues",
    );

    syncTasks.tasks = [
      {
        id: "music_sync_filesystem_local--1_track",
        status: "partial_success",
        metadata: {
          task_domain: "music_sync",
          provider_instance: "filesystem_local--1",
          provider_domain: "filesystem_local",
          provider_name: "Filesystem",
        },
        logs: [
          "2026-09-12 20:52:37 WARNING [music_assistant.Filesystem] Lorde/Melodrama/01 - Green Light.flac is missing ID3 tag [albumartist], using Various Artists as fallback",
          "2026-09-12 20:52:38 WARNING [music_assistant.Filesystem] Lorde/Pure Heroine/01 - Tennis Court.flac is missing ID3 tag [albumartist], using Various Artists as fallback",
        ],
        failure_messages: [
          "Failed to process Aaron Lewis/Town Line/Town Line.cue: Audio file not found for CUE sheet: Aaron Lewis/Town Line/Town Line.cue",
        ],
      },
    ];
    const wrapper = mountTree();
    await flushPromises();

    const rows = wrapper.findAll(".source-tree__row");
    const text = rows.map((row) => {
      const label = row.find(".source-tree__label").text();
      const count = row.find(".source-tree__count");
      return count.exists() ? `${label} ${count.text()}` : label;
    });
    expect(text).toContain("library_manager.tree.sync_issues 3");

    // the node opens to one folder per kind of failure
    const issuesRow = rows.find(
      (row) =>
        row.find(".source-tree__label").text() ===
        "library_manager.tree.sync_issues",
    )!;
    await issuesRow.find(".source-tree__chevron").trigger("click");
    await flushPromises();
    const labels = rowLabels(wrapper);
    expect(labels).toContain("library_manager.sync_issues.missing_tag");
    expect(labels).toContain("library_manager.sync_issues.cue_audio_missing");

    const missing = wrapper
      .findAll(".source-tree__row")
      .find(
        (row) =>
          row.find(".source-tree__label").text() ===
          "library_manager.sync_issues.missing_tag",
      )!;
    await missing.trigger("click");
    expect(wrapper.emitted("select")?.at(-1)?.[0]).toEqual({
      scope: "issues",
      node: "sync_issues.missing_tag:albumartist",
      mediaType: MediaType.TRACK,
      issueType: "missing_tag:albumartist",
    });
    syncTasks.tasks = [];
  });

  it("runs actions for now playing and players", async () => {
    const wrapper = mountTree();
    await flushPromises();
    const { store } = await import("@/plugins/store");

    const rows = () => wrapper.findAll(".source-tree__row");
    await rows()
      .find((row) => row.text().startsWith("now_playing"))!
      .trigger("click");
    expect(mocks.togglePlayerQueue).toHaveBeenCalledTimes(1);

    await rows()
      .find((row) => row.text().startsWith("players"))!
      .trigger("click");
    expect(store.showPlayersMenu).toBe(true);
    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("walks the tree from the keyboard", async () => {
    const wrapper = mountTree();
    await flushPromises();
    const tree = wrapper.find("[role=tree]");

    await tree.trigger("keydown", { key: "ArrowDown" });
    await tree.trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.find(".source-tree__row--focused").text()).toContain(
      "library_manager.tree.library",
    );

    await tree.trigger("keydown", { key: "ArrowLeft" });
    expect(rowLabels(wrapper)).not.toContain("artists");
    await tree.trigger("keydown", { key: "ArrowRight" });
    expect(rowLabels(wrapper)).toContain("artists");

    await tree.trigger("keydown", { key: "ArrowDown" });
    await tree.trigger("keydown", { key: "ArrowDown" });
    await tree.trigger("keydown", { key: "Enter" });
    const selected = wrapper.emitted("select")?.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(selected).toMatchObject({
      node: "library.artists",
      mediaType: MediaType.TRACK,
      leadFacet: "artist",
    });
    expect(selected.albumArtistsOnly).toBeUndefined();
  });
});
