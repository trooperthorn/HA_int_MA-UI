import SelectedPane from "@/library-manager/panes/SelectedPane.vue";
import { MediaType, QueueOption } from "@/plugins/api/interfaces";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../fixtures/track";

const mocks = vi.hoisted(() => ({
  playMedia: vi.fn(async () => {}),
  toggleFavorite: vi.fn(),
  handlePlayBtnClick: vi.fn(async () => {}),
  handleMenuBtnClick: vi.fn(),
  removeProviderMapping: vi.fn(async () => {}),
  emit: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/plugins/api", () => {
  const api = {
    playMedia: mocks.playMedia,
    toggleFavorite: mocks.toggleFavorite,
    removeProviderMapping: mocks.removeProviderMapping,
    getProvider: (id: string) =>
      id === "filesystem_local--1" ? { name: "Filesystem" } : undefined,
  };
  return { api, default: api };
});

vi.mock("@/helpers/media_item_actions", () => ({
  handlePlayBtnClick: mocks.handlePlayBtnClick,
  handleMenuBtnClick: mocks.handleMenuBtnClick,
}));

vi.mock("@/plugins/eventbus", () => ({ eventbus: { emit: mocks.emit } }));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));

// upstream components in this tree now reach for the app-wide translator,
// which would otherwise build a real i18n instance off the mocked vue-i18n
vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

vi.mock("@/components/MediaItemThumb.vue", () => ({
  default: { name: "MediaItemThumb", props: ["item"], template: "<i />" },
}));

vi.mock("@/components/ProviderIcon.vue", () => ({
  default: { name: "ProviderIcon", props: ["domain"], template: "<i />" },
}));

vi.mock("@/library-manager/playerGate", () => ({
  ensurePlayer: async () => true,
}));

enableAutoUnmount(afterEach);

const artist = {
  item_id: "a1",
  provider: "library",
  name: "Muse",
  media_type: MediaType.ARTIST,
} as unknown as ReturnType<typeof track>["artists"][number];

const album = {
  item_id: "al1",
  provider: "library",
  name: "Drones",
  year: 2015,
  media_type: MediaType.ALBUM,
} as unknown as NonNullable<ReturnType<typeof track>["album"]>;

const song = track({
  item_id: "t1",
  name: "Psycho",
  artists: [artist],
  album,
  track_number: 2,
  favorite: false,
  provider_mappings: [
    {
      item_id: "/media/Muse/Drones/02 Psycho.flac",
      provider_domain: "filesystem_local",
      provider_instance: "filesystem_local--1",
      available: true,
      in_library: true,
      audio_format: {
        content_type: "flac",
        codec_type: "flac",
        sample_rate: 44100,
        bit_depth: 16,
        channels: 2,
        output_format_str: "flac",
        bit_rate: 900,
      },
      details: null,
      url: null,
    },
  ] as ReturnType<typeof track>["provider_mappings"],
});

function mountPane(items: ReturnType<typeof track>[]) {
  return mount(SelectedPane, {
    props: { items },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

const click = (wrapper: ReturnType<typeof mountPane>, id: string) =>
  wrapper.find(`[data-action="${id}"]`).trigger("click");

describe("SelectedPane", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for a selection when there is none", () => {
    const wrapper = mountPane([]);
    expect(wrapper.text()).toContain("library_manager.selected.empty");
    expect(wrapper.findAll("[data-action]")).toHaveLength(0);
  });

  it("describes the picked track and offers every action", async () => {
    const wrapper = mountPane([song]);
    const text = wrapper.text();
    expect(text).toContain("Psycho");
    expect(text).toContain("Muse");
    expect(text).toContain("Drones · #2 · 2015");
    expect(text).toContain("FLAC · 44.1 kHz · 16 bit · 900 kbps");
    expect(text).toContain("/media/Muse/Drones/02 Psycho.flac");

    expect(
      wrapper
        .findAll("[data-action]")
        .map((el) => el.attributes("data-action")),
    ).toEqual([
      "play",
      "play_next",
      "add_to_queue",
      "favorite",
      "add_playlist",
      "edit",
      "album",
      "artist",
      "more",
    ]);

    await click(wrapper, "play");
    expect(mocks.handlePlayBtnClick).toHaveBeenCalledWith(
      song,
      expect.any(Number),
      expect.any(Number),
      undefined,
    );
    await click(wrapper, "add_to_queue");
    expect(mocks.playMedia).toHaveBeenCalledWith([song], QueueOption.ADD);
    await click(wrapper, "favorite");
    expect(mocks.toggleFavorite).toHaveBeenCalledWith(song);
    await click(wrapper, "add_playlist");
    expect(mocks.emit).toHaveBeenCalledWith("playlistdialog", {
      items: [song],
      parentItem: undefined,
    });
    await click(wrapper, "edit");
    expect(mocks.emit).toHaveBeenCalledWith("editItemDialog", song);
    await click(wrapper, "album");
    expect(mocks.push).toHaveBeenCalledWith({
      name: "album",
      params: { itemId: "al1", provider: "library" },
    });
    await click(wrapper, "more");
    expect(mocks.handleMenuBtnClick).toHaveBeenCalled();
  });

  it("splits into a details half and an artwork half", () => {
    const item = track({
      item_id: "t1",
      name: "Uprising",
      artists: [artist],
      metadata: {
        images: [
          {
            type: "thumb",
            path: "https://example.test/uprising.jpg",
            provider: "builtin",
            remotely_accessible: true,
          },
        ],
      } as never,
    });
    const details = mount(SelectedPane, {
      props: { items: [item], variant: "details" },
      global: { mocks: { $t: (key: string) => key } },
    });
    expect(details.find(".selected-pane__name").text()).toBe("Uprising");
    expect(details.find("[data-action=play]").exists()).toBe(true);
    expect(details.findComponent({ name: "MediaItemThumb" }).exists()).toBe(
      false,
    );

    const art = mount(SelectedPane, {
      props: { items: [item], variant: "art" },
      global: { mocks: { $t: (key: string) => key } },
    });
    expect(art.findComponent({ name: "MediaItemThumb" }).exists()).toBe(true);
    expect(art.find(".selected-pane__name").exists()).toBe(false);
    expect(art.find("[data-action=play]").exists()).toBe(false);

    // no artwork, no placeholder cover: the half stays blank
    const blank = mount(SelectedPane, {
      props: {
        items: [track({ item_id: "t2", name: "Plain", artists: [artist] })],
        variant: "art",
      },
      global: { mocks: { $t: (key: string) => key } },
    });
    expect(blank.findComponent({ name: "MediaItemThumb" }).exists()).toBe(
      false,
    );
    expect(blank.find(".selected-pane__body").exists()).toBe(false);
  });

  it("opens a menu on a source icon: info, file location, remove, playlist", async () => {
    const item = track({
      item_id: "t1",
      name: "Uprising",
      artists: [artist],
      provider_mappings: [
        {
          item_id: "Muse/Resistance/03 Uprising.flac",
          provider_domain: "filesystem_local",
          provider_instance: "filesystem_local--1",
          available: true,
          in_library: true,
          audio_format: {} as never,
          details: null,
          url: null,
        },
      ],
    });
    const wrapper = mount(SelectedPane, {
      props: { items: [item], variant: "details" },
      global: { mocks: { $t: (key: string) => key } },
    });
    await wrapper
      .find('[data-source="filesystem_local--1"]')
      .trigger("contextmenu", { clientX: 3, clientY: 4 });

    const call = mocks.emit.mock.calls.find(
      (entry) => entry[0] === "contextmenu",
    )!;
    const menu = (call[1] as { items: Array<Record<string, unknown>> }).items;
    expect(menu.map((entry) => entry.label)).toEqual([
      "library_manager.selected.media_info",
      "library_manager.selected.file_location",
      "library_manager.selected.remove_source",
      "add_playlist",
    ]);

    (menu[0].action as () => void)();
    expect(mocks.push).toHaveBeenCalledWith({
      name: MediaType.TRACK,
      params: { itemId: "t1", provider: "library" },
    });

    // the folder the file lives in, browsed through the tree
    (menu[1].action as () => void)();
    expect(wrapper.emitted("openFolder")?.[0]).toEqual([
      "filesystem_local--1://Muse/Resistance",
      "filesystem_local--1",
    ]);

    // removing asks first, then drops just this mapping
    (menu[2].action as () => void)();
    const confirm = mocks.emit.mock.calls.find(
      (entry) => entry[0] === "deleteConfirmationDialog",
    )!;
    await (confirm[1] as { onConfirm: () => Promise<void> }).onConfirm();
    expect(mocks.removeProviderMapping).toHaveBeenCalledWith(
      MediaType.TRACK,
      "t1",
      item.provider_mappings[0],
    );

    (menu[3].action as () => void)();
    expect(mocks.emit).toHaveBeenCalledWith("playlistdialog", {
      items: [item],
      parentItem: undefined,
    });
  });

  it("keeps only the actions that take several items", async () => {
    const other = track({ item_id: "t2", name: "Mercy", artists: [artist] });
    const wrapper = mountPane([song, other]);
    expect(wrapper.text()).toContain("Mercy");
    expect(
      wrapper
        .findAll("[data-action]")
        .map((el) => el.attributes("data-action")),
    ).toEqual(["play", "play_next", "add_to_queue", "add_playlist", "more"]);

    await click(wrapper, "play_next");
    expect(mocks.playMedia).toHaveBeenCalledWith(
      [song, other],
      QueueOption.NEXT,
    );
  });
});
