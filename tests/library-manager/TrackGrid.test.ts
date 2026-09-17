import {
  DEFAULT_COLUMN_VISIBILITY,
  TRACK_COLUMNS,
  type LibraryTrack,
} from "@/library-manager/columns";
import TrackGrid from "@/library-manager/panes/TrackGrid.vue";
import {
  handleMediaItemClick,
  handleMenuBtnClick,
  handlePlayBtnClick,
} from "@/helpers/media_item_actions";
import {
  enableAutoUnmount,
  flushPromises,
  mount,
  type VueWrapper,
} from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaType } from "@/plugins/api/interfaces";
import { track } from "../fixtures/track";

const mockAddFavorite = vi.hoisted(() => vi.fn());
const mockRemoveFavorite = vi.hoisted(() => vi.fn());

vi.mock("@/plugins/api", () => {
  const api = {
    providers: {},
    providerManifests: {},
    addItemToFavorites: mockAddFavorite,
    removeItemFromFavorites: mockRemoveFavorite,
  };
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      dialogActive: false,
      showPlayersMenu: false,
      activePlayer: undefined,
      curQueueItem: undefined,
    }),
  };
});

vi.mock("@/helpers/media_item_actions", () => ({
  handleMediaItemClick: vi.fn(),
  handleMenuBtnClick: vi.fn(),
  handlePlayBtnClick: vi.fn(),
}));

vi.mock("@/plugins/api/helpers", () => ({
  getListItemProviderIconDomain: () => "library",
}));

const stubComponent = vi.hoisted(() => (name: string) => ({
  default: { name, template: "<div><slot /></div>" },
}));

vi.mock("@/components/ProviderIcon.vue", () => stubComponent("ProviderIcon"));
vi.mock("@/components/ui/dropdown-menu", () => {
  const stub = (name: string) => ({ name, template: "<div><slot /></div>" });
  return {
    DropdownMenu: stub("DropdownMenu"),
    DropdownMenuCheckboxItem: stub("DropdownMenuCheckboxItem"),
    DropdownMenuContent: stub("DropdownMenuContent"),
    DropdownMenuItem: stub("DropdownMenuItem"),
    DropdownMenuLabel: stub("DropdownMenuLabel"),
    DropdownMenuSeparator: stub("DropdownMenuSeparator"),
    DropdownMenuTrigger: stub("DropdownMenuTrigger"),
  };
});

// happy-dom has no layout, so the virtualizer is replaced with one that
// lays every row out at the estimated height
const mockScrollToIndex = vi.hoisted(() => vi.fn());
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
          scrollToIndex: mockScrollToIndex,
          measure: vi.fn(),
          measureElement: vi.fn(),
        };
      }),
  };
});

vi.mock("@/library-manager/playerGate", () => ({
  ensurePlayer: async () => true,
}));

enableAutoUnmount(afterEach);

const rows: LibraryTrack[] = Array.from({ length: 5 }, (_, i) =>
  track({ item_id: `t${i}`, name: `Track ${i}`, track_number: i + 1 }),
);

const visibleColumns = TRACK_COLUMNS.filter(
  (column) => column.fixed || DEFAULT_COLUMN_VISIBILITY[column.id],
);

function mountGrid(overrides: Record<string, unknown> = {}) {
  return mount(TrackGrid, {
    props: {
      rows,
      loading: false,
      rowHeight: 28,
      sortBy: "name",
      visibleColumns,
      visibility: { ...DEFAULT_COLUMN_VISIBILITY },
      ...overrides,
    },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

const rowAt = (wrapper: VueWrapper, index: number) =>
  wrapper.findAll(".track-grid__row")[index];

const emittedSelection = (wrapper: VueWrapper) =>
  (wrapper.emitted("update:selection") ?? []).at(-1)?.[0] as
    | LibraryTrack[]
    | undefined;

describe("TrackGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a row per track with the visible columns", () => {
    const wrapper = mountGrid();
    expect(wrapper.findAll(".track-grid__row")).toHaveLength(5);
    expect(rowAt(wrapper, 2).text()).toContain("Track 2");
    expect(rowAt(wrapper, 2).findAll("[role=gridcell]")).toHaveLength(
      visibleColumns.length,
    );
  });

  it("asks for the pages that are on screen and ahead of it", () => {
    const wrapper = mountGrid();
    const asked = (wrapper.emitted("ensureLoaded") ?? []).map((e) => e[0]);
    expect(asked).toContain(rows.length);
    expect(asked).toContain(rows.length - 1);
  });

  it("sorts by a sortable column and flips direction on the second click", async () => {
    const wrapper = mountGrid();
    const headers = wrapper.findAll("[role=columnheader]");
    const title = headers.find((h) => h.text().includes("columns.title"))!;
    const album = headers.find((h) => h.text().includes("columns.album"))!;

    await title.trigger("click");
    expect(wrapper.emitted("update:sortBy")?.at(-1)).toEqual(["name_desc"]);

    await wrapper.setProps({ sortBy: "name_desc" });
    await title.trigger("click");
    expect(wrapper.emitted("update:sortBy")?.at(-1)).toEqual(["name"]);

    await album.trigger("click");
    expect(wrapper.emitted("update:sortBy")).toHaveLength(2);
  });

  it("selects with click, shift-click and ctrl-click", async () => {
    const wrapper = mountGrid();
    await rowAt(wrapper, 1).trigger("click");
    expect(emittedSelection(wrapper)?.map((t) => t.item_id)).toEqual(["t1"]);

    await rowAt(wrapper, 3).trigger("click", { shiftKey: true });
    expect(emittedSelection(wrapper)?.map((t) => t.item_id)).toEqual([
      "t1",
      "t2",
      "t3",
    ]);

    await rowAt(wrapper, 2).trigger("click", { ctrlKey: true });
    expect(emittedSelection(wrapper)?.map((t) => t.item_id)).toEqual([
      "t1",
      "t3",
    ]);
  });

  it("moves with the arrow keys, extends with shift and selects all with ctrl+a", async () => {
    const wrapper = mountGrid();
    const grid = wrapper.find("[role=grid]");
    await grid.trigger("keydown", { key: "ArrowDown" });
    expect(emittedSelection(wrapper)?.map((t) => t.item_id)).toEqual(["t0"]);

    await grid.trigger("keydown", { key: "ArrowDown" });
    await grid.trigger("keydown", { key: "ArrowDown", shiftKey: true });
    expect(emittedSelection(wrapper)?.map((t) => t.item_id)).toEqual([
      "t1",
      "t2",
    ]);
    expect(mockScrollToIndex).toHaveBeenLastCalledWith(2, { align: "auto" });

    await grid.trigger("keydown", { key: "End" });
    expect(emittedSelection(wrapper)?.map((t) => t.item_id)).toEqual(["t4"]);

    const chord = await (async () => {
      const count = (wrapper.emitted("update:selection") ?? []).length;
      await grid.trigger("keydown", {
        key: "ArrowUp",
        ctrlKey: true,
        altKey: true,
      });
      return (wrapper.emitted("update:selection") ?? []).length - count;
    })();
    expect(chord).toBe(0);

    await grid.trigger("keydown", { key: "a", ctrlKey: true });
    expect(emittedSelection(wrapper)).toHaveLength(5);

    await grid.trigger("keydown", { key: "A", ctrlKey: true, shiftKey: true });
    expect(emittedSelection(wrapper)).toHaveLength(0);
  });

  it("plays on enter, opens the row menu on shift+enter and hands / to the search box", async () => {
    const wrapper = mountGrid();
    const grid = wrapper.find("[role=grid]");
    await rowAt(wrapper, 2).trigger("click");

    await grid.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(handlePlayBtnClick).toHaveBeenCalledTimes(1);
    expect(vi.mocked(handlePlayBtnClick).mock.calls[0][0]).toMatchObject({
      item_id: "t2",
    });

    await grid.trigger("keydown", { key: "Enter", shiftKey: true });
    expect(handleMenuBtnClick).toHaveBeenCalledTimes(1);
    expect(vi.mocked(handleMenuBtnClick).mock.calls[0][0]).toMatchObject([
      { item_id: "t2" },
    ]);

    await grid.trigger("keydown", { key: "/" });
    expect(wrapper.emitted("focusSearch")).toHaveLength(1);
  });

  it("jumps to the first row whose title starts with the typed letters", async () => {
    const wrapper = mountGrid({
      rows: [
        track({ item_id: "a", name: "Alpha" }),
        track({ item_id: "b", name: "Bravo" }),
        track({ item_id: "c", name: "Charlie" }),
      ],
    });
    const grid = wrapper.find("[role=grid]");
    await grid.trigger("keydown", { key: "c" });
    expect(emittedSelection(wrapper)?.map((t) => t.item_id)).toEqual(["c"]);
  });

  it("plays the item on double click and opens the menu on right click and the button", async () => {
    const wrapper = mountGrid();
    await rowAt(wrapper, 0).trigger("dblclick");
    await flushPromises();
    expect(handlePlayBtnClick).toHaveBeenCalledTimes(1);
    expect(handleMediaItemClick).not.toHaveBeenCalled();

    await rowAt(wrapper, 1).trigger("contextmenu");
    expect(handleMenuBtnClick).toHaveBeenCalledTimes(1);
    expect(vi.mocked(handleMenuBtnClick).mock.calls[0][0]).toHaveLength(1);

    await rowAt(wrapper, 4).find(".track-grid__menu").trigger("click");
    expect(handleMenuBtnClick).toHaveBeenCalledTimes(2);
    // sorted by Title (not Track #), and albumOrderOverridesSort defaults to
    // on, so no explicit sort is forwarded - playback falls back to album
    // order rather than the display sort order
    expect(vi.mocked(handleMenuBtnClick).mock.calls[1][5]).toBeUndefined();
  });

  it("forwards the display sort to playback only when sorted by Track #", async () => {
    const wrapper = mountGrid({ sortBy: "local:track_number" });
    await rowAt(wrapper, 0).trigger("dblclick");
    await flushPromises();
    expect(vi.mocked(handlePlayBtnClick).mock.calls[0][5]).toBe(
      "local:track_number",
    );
  });

  it("hands the owner's menu entries along with the row menu", async () => {
    const menuItems = vi.fn(() => [
      { label: "library_manager.filter_by_artist" },
    ]);
    const wrapper = mountGrid({ menuItems });
    await rowAt(wrapper, 1).trigger("contextmenu");
    expect(menuItems).toHaveBeenCalledWith([
      expect.objectContaining({ item_id: "t1" }),
    ]);
    expect(vi.mocked(handleMenuBtnClick).mock.calls[0][6]).toEqual({
      extraItems: [{ label: "library_manager.filter_by_artist" }],
    });
  });

  it("resizes a column by dragging its header edge and resets it on double click", async () => {
    const wrapper = mountGrid();
    const handle = wrapper.find('[data-resize="artist"]');
    await handle.trigger("pointerdown", { clientX: 100, pointerId: 1 });
    await handle.trigger("pointermove", { clientX: 160 });
    // the drag shows live, before the owner has been told
    const header = wrapper.find(".track-grid__header");
    expect(header.attributes("style")).toContain("240px");
    expect(wrapper.emitted("resizeColumn")).toBeUndefined();

    await handle.trigger("pointerup", { clientX: 160 });
    expect(wrapper.emitted("resizeColumn")).toEqual([["artist", 240]]);
    // no sort was toggled by the drag
    expect(wrapper.emitted("update:sortBy")).toBeUndefined();

    await handle.trigger("dblclick");
    expect(wrapper.emitted("resizeColumn")?.at(-1)).toEqual([
      "artist",
      undefined,
    ]);
  });

  it("uses the whole selection for the menu when the row is part of it", async () => {
    const wrapper = mountGrid();
    await rowAt(wrapper, 0).trigger("click");
    await rowAt(wrapper, 2).trigger("click", { shiftKey: true });
    await rowAt(wrapper, 1).trigger("contextmenu");
    expect(vi.mocked(handleMenuBtnClick).mock.calls[0][0]).toHaveLength(3);
  });

  it("toggles the favorite from the heart without selecting the row", async () => {
    const wrapper = mountGrid();
    await rowAt(wrapper, 3).find("[aria-label=favorites_add]").trigger("click");
    expect(mockAddFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: "t3" }),
    );
    expect(wrapper.emitted("update:selection")).toBeUndefined();

    // the heart answers before the server does, and flips back the same way
    const heart = rowAt(wrapper, 3).find("[aria-label=favorites_remove]");
    expect(heart.exists()).toBe(true);
    expect(heart.attributes("aria-pressed")).toBe("true");
    await heart.trigger("click");
    expect(mockRemoveFavorite).toHaveBeenCalledWith(MediaType.TRACK, "t3");
    expect(rowAt(wrapper, 3).find("[aria-label=favorites_add]").exists()).toBe(
      true,
    );
  });

  it("opens a folder on double click instead of playing it", async () => {
    const folder = {
      item_id: "f",
      provider: "spotify",
      name: "Albums",
      version: "",
      uri: "spotify://folder/f",
      external_ids: [],
      is_playable: false,
      media_type: MediaType.FOLDER,
      path: "spotify://albums",
      image: null,
    };
    const wrapper = mountGrid({ rows: [folder] });
    await rowAt(wrapper, 0).trigger("dblclick");
    expect(wrapper.emitted("openFolder")?.[0]?.[0]).toMatchObject({
      path: "spotify://albums",
    });
    expect(handlePlayBtnClick).not.toHaveBeenCalled();
  });

  it("asks the source to jump when no loaded row starts with the letters", async () => {
    vi.useFakeTimers();
    const wrapper = mountGrid();
    const grid = wrapper.find("[role=grid]");
    await grid.trigger("keydown", { key: "z" });
    // the source is asked once the letters settle
    expect(wrapper.emitted("jumpToLetter")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    vi.useRealTimers();
    expect(wrapper.emitted("jumpToLetter")?.[0]).toEqual(["z"]);
    expect(wrapper.emitted("update:selection")).toBeUndefined();
  });

  it("sorts any column locally when the owner allows it", async () => {
    const wrapper = mountGrid({ localSortable: true });
    const album = wrapper
      .findAll("[role=columnheader]")
      .find((h) => h.text().includes("columns.album"))!;
    await album.trigger("click");
    expect(wrapper.emitted("update:sortBy")?.at(-1)).toEqual(["local:album"]);
    await wrapper.setProps({ sortBy: "local:album" });
    await album.trigger("click");
    expect(wrapper.emitted("update:sortBy")?.at(-1)).toEqual([
      "local:album_desc",
    ]);
  });

  it("clears the selection when the listing is replaced", async () => {
    const wrapper = mountGrid();
    await rowAt(wrapper, 0).trigger("click");
    await wrapper.setProps({ rows: [] });
    expect(emittedSelection(wrapper)).toEqual([]);
  });
});
