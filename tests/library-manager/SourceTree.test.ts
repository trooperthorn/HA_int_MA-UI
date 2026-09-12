import SourceTree from "@/library-manager/panes/SourceTree.vue";
import type { MusicAssistantApi } from "@/plugins/api";
import { MediaType } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  browse: vi.fn<MusicAssistantApi["browse"]>(),
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
        instance_id: "filesystem_local--1",
        available: true,
        supported_features: ["browse"],
      },
      "radiobrowser--1": {
        type: "music",
        domain: "radiobrowser",
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

vi.mock("@/composables/userPreferences", async () => {
  const { computed } = await import("vue");
  return {
    setUserPreference: mocks.setUserPreference,
    useUserPreferences: () => ({
      getPreference: <T>(_key: string, fallback: T) => computed(() => fallback),
    }),
  };
});

vi.mock("@/composables/useLibrarySync", () => ({
  onLibrarySyncCompleted: () => () => {},
}));

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
    const libraryStart = labels.indexOf("library_manager.tree.library");
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
    await rows()
      .find(
        (row) => row.text().startsWith("genres") && row.text() === "genres",
      )!
      .trigger("click");
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
    const labels = rowLabels(wrapper);
    const start = labels.indexOf("Filesystem");
    expect(labels.slice(start + 1, start + 7)).toEqual([
      "playlists",
      "artists",
      "library_manager.tree.album_artists",
      "genres",
      "albums",
      "Music",
    ]);

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

    const rows = wrapper.findAll(".source-tree__row");
    const text = rows.map((row) => {
      const label = row.find(".source-tree__label").text();
      const count = row.find(".source-tree__count");
      return count.exists() ? `${label} ${count.text()}` : label;
    });
    expect(text).toContain("artists 30");
    expect(text).toContain("library_manager.tree.album_artists 12");
    expect(text).toContain("albums 40");
    expect(text).toContain("library_manager.tree.library 500");
    expect(text).toContain("genres 7");
    expect(text).toContain("playlists 3");
    expect(text).toContain("players 1");

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
      expect.arrayContaining(["browse:spotify--1://"]),
    );
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
