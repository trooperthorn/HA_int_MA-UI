import LibraryManagerView from "@/library-manager/LibraryManagerView.vue";
import { QueueOption } from "@/plugins/api/interfaces";
import {
  enableAutoUnmount,
  flushPromises,
  mount,
  type VueWrapper,
} from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef, type Ref } from "vue";

const mocks = vi.hoisted(() => ({
  playMedia: vi.fn(async (_items: unknown[], _option?: unknown) => {}),
  clearUpNext: vi.fn(async () => {}),
  ensurePlayer: vi.fn(async () => true),
  loadAll: vi.fn(async () => {}),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
  filters: [] as Array<Ref<Record<string, unknown>>>,
}));

// the source is driven from the test: rows stay sparse the way a paged
// library listing is while it is being scrolled
const source = vi.hoisted(() => ({
  rows: undefined as unknown,
  allLoaded: undefined as unknown,
}));

vi.mock("@/plugins/api", () => {
  const api = {
    playMedia: mocks.playMedia,
    toggleFavorite: vi.fn(),
    getLibraryGenres: vi.fn(async () => []),
    subscribe: vi.fn(() => () => {}),
  };
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return { store: reactive({ curQueueItem: undefined }) };
});

vi.mock("@/helpers/player_queue", () => ({
  clearUpNext: mocks.clearUpNext,
  togglePlayerQueue: vi.fn(),
}));

vi.mock("@/library-manager/playerGate", () => ({
  ensurePlayer: mocks.ensurePlayer,
}));

vi.mock("vue-sonner", () => ({
  toast: { info: mocks.toastInfo, error: mocks.toastError, success: vi.fn() },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

vi.mock("@/library-manager/composables/useItemSource", async () => {
  const { ref: vueRef, shallowRef: vueShallowRef } = await import("vue");
  return {
    useItemSource: (filter: Ref<Record<string, unknown>>) => {
      mocks.filters.push(filter);
      return {
        rows: source.rows ?? vueShallowRef([]),
        total: vueRef(undefined),
        loading: vueRef(false),
        allLoaded: source.allLoaded ?? vueRef(true),
        loadingAll: vueRef(false),
        updateAvailable: vueRef(false),
        jumpToLetter: vi.fn(async () => undefined),
        loadAll: mocks.loadAll,
        ensureLoaded: vi.fn(),
        reload: vi.fn(),
      };
    },
  };
});

vi.mock("@/composables/background-tasks/useBackgroundTasks", async () => {
  const { ref: vueRef } = await import("vue");
  return { useBackgroundTasks: () => ({ tasks: vueRef([]) }) };
});

vi.mock("@/composables/userPreferences", async () => {
  const { computed } = await import("vue");
  return {
    setUserPreference: vi.fn(async () => {}),
    useUserPreferences: () => ({
      getPreference: <T>(_key: string, fallback?: T) =>
        computed(() => fallback),
      setPreference: vi.fn(async () => {}),
    }),
  };
});

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({
    open: { value: true },
    isMobile: { value: false },
    setOpen: vi.fn(),
  }),
}));

vi.mock("@/library-manager/composables/useKeymap", () => ({
  useKeymap: vi.fn(),
}));

vi.mock("@/plugins/eventbus", () => ({ eventbus: { emit: vi.fn() } }));

vi.mock("reka-ui", () => ({
  SplitterGroup: { template: "<div><slot /></div>" },
  SplitterPanel: { template: "<div><slot /></div>" },
  SplitterResizeHandle: { template: "<i />" },
}));

vi.mock("@/components/ui/button", () => ({
  Button: {
    name: "Button",
    props: ["variant", "size", "disabled", "tooltip", "loading"],
    template: '<button :disabled="disabled || undefined"><slot /></button>',
  },
}));

vi.mock("@/components/ui/input", () => ({
  Input: { name: "Input", template: "<input />" },
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: { name: "Switch", template: "<i />" },
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: { name: "Spinner", template: "<i />" },
}));

vi.mock("@/library-manager/panes/BrowserStrip.vue", () => ({
  default: {
    name: "BrowserStrip",
    props: ["picks", "provider", "leadFacet", "storage"],
    emits: ["update:picks"],
    template: "<div />",
  },
}));

vi.mock("@/library-manager/panes/SourceTree.vue", () => ({
  default: { name: "SourceTree", template: "<div />" },
}));

vi.mock("@/library-manager/panes/QueuePane.vue", () => ({
  default: { name: "QueuePane", template: "<div />" },
}));

vi.mock("@/library-manager/panes/SelectedPane.vue", () => ({
  default: { name: "SelectedPane", template: "<div />" },
}));

vi.mock("@/library-manager/panes/ShortcutHelp.vue", () => ({
  default: { name: "ShortcutHelp", template: "<div />" },
}));

vi.mock("@/library-manager/panes/TrackGrid.vue", () => ({
  default: { name: "TrackGrid", template: "<div />" },
}));

enableAutoUnmount(afterEach);

function mountView() {
  return mount(LibraryManagerView, {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

const replaceUpNextButton = (wrapper: VueWrapper) =>
  wrapper
    .findAll("button")
    .find((button) =>
      button.text().includes("library_manager.replace_up_next"),
    )!;

const sparseRows = (total: number, loaded: number) => {
  const rows: unknown[] = [];
  rows.length = total;
  for (let i = 0; i < loaded; i++) rows[i] = { item_id: `t${i}` };
  return rows;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters.length = 0;
  source.rows = undefined;
  source.allLoaded = undefined;
});

describe("LibraryManagerView replace up next", () => {
  it("queues every row and never a hole from a part-loaded listing", async () => {
    // page 0 in, page 1 not: exactly what commitPage leaves behind
    const rows = shallowRef(sparseRows(400, 200));
    const allLoaded = ref(false);
    source.rows = rows;
    source.allLoaded = allLoaded;
    mocks.loadAll.mockImplementation(async () => {
      rows.value = Array.from({ length: 400 }, (_, i) => ({
        item_id: `t${i}`,
      }));
      allLoaded.value = true;
    });

    const wrapper = mountView();
    await flushPromises();
    await replaceUpNextButton(wrapper).trigger("click");
    await flushPromises();

    expect(mocks.loadAll).toHaveBeenCalled();
    expect(mocks.clearUpNext).toHaveBeenCalled();
    const queued = mocks.playMedia.mock.calls[0][0];
    expect(queued).toHaveLength(400);
    expect(queued.every((item) => !!item)).toBe(true);
    expect(mocks.playMedia.mock.calls[0][1]).toBe(QueueOption.ADD);
    expect(mocks.toastInfo).not.toHaveBeenCalled();
  });

  it("drops the holes and says so when the listing cannot be completed", async () => {
    source.rows = shallowRef(sparseRows(400, 200));
    source.allLoaded = ref(false);
    // the sequential files-to-edit walk: loadAll cannot complete it
    mocks.loadAll.mockImplementation(async () => {});

    const wrapper = mountView();
    await flushPromises();
    await replaceUpNextButton(wrapper).trigger("click");
    await flushPromises();

    const queued = mocks.playMedia.mock.calls[0][0];
    expect(queued).toHaveLength(200);
    expect(queued.every((item) => !!item)).toBe(true);
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "library_manager.replace_up_next_partial",
    );
  });

  it("is disabled while a sparse listing has no row loaded yet", async () => {
    // length is the listing's total, not what is loaded
    source.rows = shallowRef(sparseRows(10000, 0));
    source.allLoaded = ref(false);

    const wrapper = mountView();
    await flushPromises();
    expect(replaceUpNextButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("is enabled once a page is in", async () => {
    source.rows = shallowRef(sparseRows(10000, 1));
    source.allLoaded = ref(false);

    const wrapper = mountView();
    await flushPromises();
    expect(replaceUpNextButton(wrapper).attributes("disabled")).toBeUndefined();
  });
});

describe("LibraryManagerView browser picks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the search when the strip's own click changes the picks", async () => {
    const wrapper = mountView();
    const filter = mocks.filters[0];
    const searchBox = wrapper.find(".library-manager__grid-search-input");

    await searchBox.setValue("horisont");
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(filter.value.search).toBe("horisont");

    // still typing: a debounce is pending when the pick lands
    await searchBox.setValue("horisont ii");

    wrapper.findComponent({ name: "BrowserStrip" }).vm.$emit("update:picks", {
      genres: [],
      artist: { item_id: "a1", provider: "library", name: "Muse" },
    });
    await flushPromises();

    expect(filter.value.search).toBe("");
    expect((searchBox.element as HTMLInputElement).value).toBe("");
    expect(filter.value.artist).toMatchObject({ item_id: "a1" });

    // the debounce that was pending for the old text must not write it back
    vi.advanceTimersByTime(500);
    await flushPromises();
    expect(filter.value.search).toBe("");
  });
});
