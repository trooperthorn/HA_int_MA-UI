import MobileLibraryView from "@/library-manager/mobile/MobileLibraryView.vue";
import {
  handleMediaItemClick,
  handleMenuBtnClick,
} from "@/helpers/media_item_actions";
import { MediaType } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLibraryPlaylists: vi.fn(),
  getLibraryPodcasts: vi.fn(),
  getLibraryAudiobooks: vi.fn(),
  getLibraryAlbums: vi.fn(),
  getLibraryArtists: vi.fn(),
  setUserPreference: vi.fn(),
  openCommandCenter: vi.fn(),
  emit: vi.fn(),
}));

vi.mock("@/plugins/api", async () => {
  const { ref } = await import("vue");
  const api = {
    state: ref("initialized"),
    getLibraryPlaylists: mocks.getLibraryPlaylists,
    getLibraryPodcasts: mocks.getLibraryPodcasts,
    getLibraryAudiobooks: mocks.getLibraryAudiobooks,
    getLibraryAlbums: mocks.getLibraryAlbums,
    getLibraryArtists: mocks.getLibraryArtists,
    providers: {
      "spotify--1": {
        type: "music",
        domain: "spotify",
        name: "Spotify",
        instance_id: "spotify--1",
      },
      "filesystem_local--1": {
        type: "music",
        domain: "filesystem_local",
        name: "Filesystem",
        instance_id: "filesystem_local--1",
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
  return { store: reactive({ curQueueItem: undefined }) };
});

vi.mock("@/plugins/eventbus", () => ({ eventbus: { emit: mocks.emit } }));

vi.mock("@/components/ProviderIcon.vue", () => ({
  default: { name: "ProviderIcon", props: ["domain"], template: "<i />" },
}));

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

vi.mock("@/composables/useCommandCenter", () => ({
  useCommandCenter: () => ({ open: mocks.openCommandCenter }),
}));

vi.mock("@/composables/useLibrarySync", () => ({
  onLibrarySyncCompleted: () => () => {},
}));

vi.mock("@/helpers/media_item_actions", () => ({
  handleMediaItemClick: vi.fn(),
  handleMenuBtnClick: vi.fn(),
}));

vi.mock("vue-i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-i18n")>()),
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/MediaItemThumb.vue", () => ({
  default: {
    name: "MediaItemThumb",
    props: ["item", "size"],
    template: "<i />",
  },
}));

enableAutoUnmount(afterEach);

const item = (
  mediaType: MediaType,
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  item_id: id,
  provider: "library",
  name,
  media_type: mediaType,
  uri: `library://${mediaType}/${id}`,
  version: "",
  external_ids: [],
  is_playable: true,
  metadata: {},
  favorite: false,
  provider_mappings: [],
  ...extra,
});

function mountView() {
  return mount(MobileLibraryView, {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

const names = (wrapper: ReturnType<typeof mountView>) =>
  wrapper.findAll(".mobile-library__name").map((el) => el.text());

describe("MobileLibraryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete prefs.value["libraryManager.mobile"];
    mocks.getLibraryPlaylists.mockResolvedValue([
      item(MediaType.PLAYLIST, "p1", "Party Lists", {
        owner: "sean",
        last_played: 1_700_000_000,
      }),
    ]);
    mocks.getLibraryPodcasts.mockResolvedValue([]);
    mocks.getLibraryAudiobooks.mockResolvedValue([]);
    mocks.getLibraryAlbums.mockResolvedValue([
      item(MediaType.ALBUM, "a1", "Origin", {
        artists: [{ name: "Evanescence" }],
        date_added: "2026-09-12T00:00:00Z",
      }),
    ]);
    mocks.getLibraryArtists.mockResolvedValue([
      item(MediaType.ARTIST, "r1", "Muse", { last_played: 1_600_000_000 }),
    ]);
  });

  it("lists every kind by recent use with a subtitle per kind", async () => {
    const wrapper = mountView();
    await flushPromises();

    expect(mocks.getLibraryPlaylists).toHaveBeenCalledTimes(1);
    expect(mocks.getLibraryArtists).toHaveBeenCalledWith(
      undefined,
      undefined,
      100,
      0,
      "timestamp_added_desc",
      true,
      undefined,
    );
    // the album was added in 2026, the playlist played in 2023, the artist in 2020
    expect(names(wrapper)).toEqual(["Origin", "Party Lists", "Muse"]);
    const subtitles = wrapper
      .findAll(".mobile-library__subtitle")
      .map((el) => el.text());
    expect(subtitles).toEqual([
      "album • Evanescence",
      "playlist • sean",
      "artist",
    ]);
    // playlists, artists, albums, then the kinds with nothing in them gone
    expect(
      wrapper.findAll("[data-kind]").map((el) => el.attributes("data-kind")),
    ).toEqual(["playlists", "artists", "albums"]);
  });

  it("picks a source from the filter chip and lists only what it holds", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .find('[aria-label="library_manager.mobile.source"]')
      .trigger("click", { clientX: 5, clientY: 6 });
    const menu = mocks.emit.mock.calls.at(-1)!;
    expect(menu[0]).toBe("contextmenu");
    const items = (menu[1] as { items: Array<Record<string, unknown>> }).items;
    expect(items.map((item) => item.label)).toEqual([
      "library_manager.tree.source_all",
      "Filesystem",
      "Spotify",
    ]);

    mocks.getLibraryPlaylists.mockResolvedValue([]);
    (items[1].action as () => void)();
    await flushPromises();
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.mobile",
      { source: "filesystem_local--1" },
    );
    expect(mocks.getLibraryAlbums).toHaveBeenLastCalledWith(
      undefined,
      undefined,
      100,
      0,
      "timestamp_added_desc",
      undefined,
      "filesystem_local--1",
    );
    expect(
      wrapper.findAll("[data-kind]").map((el) => el.attributes("data-kind")),
    ).toEqual(["artists", "albums"]);
    expect(names(wrapper)).toEqual(["Origin", "Muse"]);
  });

  it("narrows to one kind with a chip and shows everything again on a second tap", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find('[data-kind="artists"]').trigger("click");
    await flushPromises();
    expect(names(wrapper)).toEqual(["Muse"]);
    expect(mocks.getLibraryArtists).toHaveBeenCalledTimes(2);
    expect(mocks.getLibraryPlaylists).toHaveBeenCalledTimes(1);

    await wrapper.find('[data-kind="artists"]').trigger("click");
    await flushPromises();
    expect(names(wrapper)).toEqual(["Origin", "Party Lists", "Muse"]);
  });

  it("sorts alphabetically and remembers the sort and layout", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find(".mobile-library__sort").trigger("click");
    await flushPromises();
    expect(names(wrapper)).toEqual(["Muse", "Origin", "Party Lists"]);
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.mobile",
      { sort: "alphabetical" },
    );

    await wrapper
      .find('[aria-label="library_manager.mobile.grid"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.find(".mobile-library__list--grid").exists()).toBe(true);
  });

  it("opens an item on tap and its menu on hold", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountView();
      await flushPromises();
      const row = wrapper.find('[data-uri="library://album/a1"]');

      await row.trigger("click", { clientX: 10, clientY: 20 });
      expect(handleMediaItemClick).toHaveBeenCalledWith(
        expect.objectContaining({ item_id: "a1" }),
        10,
        20,
      );

      await row.trigger("pointerdown", { clientX: 10, clientY: 20 });
      vi.advanceTimersByTime(600);
      expect(handleMenuBtnClick).toHaveBeenCalledWith(
        expect.objectContaining({ item_id: "a1" }),
        10,
        20,
        undefined,
        true,
      );
      // the click that follows a hold does nothing
      await row.trigger("pointerup");
      await row.trigger("click");
      expect(handleMediaItemClick).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
