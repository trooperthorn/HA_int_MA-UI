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
  emit: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/plugins/api", () => {
  const api = {
    playMedia: mocks.playMedia,
    toggleFavorite: mocks.toggleFavorite,
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
  useI18n: () => ({ t: (key: string) => key }),
}));

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
