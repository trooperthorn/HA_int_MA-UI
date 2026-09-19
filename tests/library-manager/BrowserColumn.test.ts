import BrowserColumn from "@/library-manager/panes/BrowserColumn.vue";
import { browseTrackContext } from "@/library-manager/composables/useBrowseTrackOrder";
import { MediaType, QueueOption } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  playMedia: vi.fn(async () => {}),
  handlePlayBtnClick: vi.fn(async () => {}),
  forceAutoplayIfConfigured: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/plugins/api", () => {
  const api = { playMedia: mocks.playMedia };
  return { api, default: api };
});

vi.mock("@/helpers/media_item_actions", () => ({
  handlePlayBtnClick: mocks.handlePlayBtnClick,
}));

vi.mock("@/helpers/autoplay_on_bulk_play", () => ({
  forceAutoplayIfConfigured: mocks.forceAutoplayIfConfigured,
}));

vi.mock("vue-sonner", () => ({
  toast: { error: mocks.toastError, info: vi.fn(), success: vi.fn() },
}));

vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({ activePlayer: { available: true } as unknown }),
  };
});

vi.mock("@/composables/useQueuePlaybackPreferences", () => ({
  useQueuePlaybackPreferences: () => ({ flag: () => true }),
}));

// the real virtualizer measures a scroll container that has no size here
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
          measure: vi.fn(),
          measureElement: vi.fn(),
        };
      }),
  };
});

const artist = {
  item_id: "a1",
  provider: "library",
  name: "Muse",
  media_type: MediaType.ARTIST,
};
const rows = [
  { item_id: "t1", provider: "library", name: "Citizen Erased" },
  { item_id: "t2", provider: "library", name: "Bliss" },
];

const mountColumn = () =>
  mount(BrowserColumn, {
    props: {
      title: "Artists",
      items: [artist] as never,
      loading: false,
      selectedIds: [],
      search: "",
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });

const doubleClickArtist = async () => {
  const wrapper = mountColumn();
  await flushPromises();
  const row = wrapper
    .findAll(".browser-column__row")
    .find((candidate) => candidate.text() === "Muse")!;
  await row.trigger("dblclick");
  await flushPromises();
  return wrapper;
};

enableAutoUnmount(afterEach);

describe("BrowserColumn double-click playback", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    browseTrackContext.value = undefined;
    const { store } = await import("@/plugins/store");
    (store as { activePlayer?: unknown }).activePlayer = { available: true };
  });

  it("plays the table's rows for the artist the table is showing", async () => {
    browseTrackContext.value = { artist, rows: rows as never };
    await doubleClickArtist();

    expect(mocks.playMedia).toHaveBeenCalledWith(rows, QueueOption.PLAY);
    expect(mocks.forceAutoplayIfConfigured).toHaveBeenCalled();
    expect(mocks.handlePlayBtnClick).not.toHaveBeenCalled();
  });

  it("leaves the artist to the server when an album is picked beside it", async () => {
    // the table below is narrowed to that album, so its rows are not the
    // artist's listing
    browseTrackContext.value = {
      artist,
      album: { item_id: "b1", provider: "library", name: "Origin of Symmetry" },
      rows: rows as never,
    };
    await doubleClickArtist();

    expect(mocks.playMedia).not.toHaveBeenCalled();
    expect(mocks.handlePlayBtnClick).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: "a1" }),
      expect.any(Number),
      expect.any(Number),
      undefined,
      false,
    );
  });

  it("opens the player menu instead of playing nothing when no player is usable", async () => {
    const { store } = await import("@/plugins/store");
    (store as { activePlayer?: unknown }).activePlayer = undefined;
    browseTrackContext.value = { artist, rows: rows as never };
    await doubleClickArtist();

    expect(mocks.playMedia).not.toHaveBeenCalled();
    expect(mocks.handlePlayBtnClick).toHaveBeenCalled();
  });

  it("reports a failed play instead of swallowing it", async () => {
    mocks.playMedia.mockRejectedValueOnce(new Error("nope") as never);
    browseTrackContext.value = { artist, rows: rows as never };
    await doubleClickArtist();

    expect(mocks.toastError).toHaveBeenCalledWith("play_failed");
  });
});
