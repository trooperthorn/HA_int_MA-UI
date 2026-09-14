import QueuePane from "@/library-manager/panes/QueuePane.vue";
import { QueueOption } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queueCommandPlayIndex: vi.fn(),
  queueCommandDelete: vi.fn(),
  queueCommandClear: vi.fn(),
  getPlayerQueueItems: vi.fn(async () => [{ queue_item_id: "i2" }]),
  playMedia: vi.fn(async () => {}),
  focusCurrent: vi.fn(),
  visibleSeen: [] as boolean[],
}));

vi.mock("@/plugins/api", () => {
  const api = {
    queueCommandPlayIndex: mocks.queueCommandPlayIndex,
    queueCommandDelete: mocks.queueCommandDelete,
    queueCommandClear: mocks.queueCommandClear,
    getPlayerQueueItems: mocks.getPlayerQueueItems,
    playMedia: mocks.playMedia,
  };
  return { api, default: api };
});

vi.mock("@/library-manager/playerGate", () => ({
  ensurePlayer: async () => true,
}));

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      dialogActive: false,
      showPlayersMenu: false,
      activePlayerQueue: {
        queue_id: "q1",
        items: 3,
        current_index: 1,
        ended: false,
      },
    }),
  };
});

vi.mock("@/layouts/default/PlayerOSD/useFullscreenQueue", async () => {
  const { computed, ref } = await import("vue");
  const items = [
    { queue_item_id: "i0", name: "Zero" },
    { queue_item_id: "i1", name: "One" },
    { queue_item_id: "i2", name: "Two" },
  ];
  return {
    useFullscreenQueue: (
      _lyrics: unknown,
      options: { visible: { value: boolean } },
    ) => {
      mocks.visibleSeen.push(options.visible.value);
      return {
        queueScrollRef: ref(null),
        itemAt: (index: number) => items[index],
        focusCurrent: mocks.focusCurrent,
        followCurrent: ref(true),
        virtualRows: computed(() =>
          items.map((item, index) => ({
            index,
            vItem: { start: index * 60 },
            item,
            state: index === 1 ? "playing" : index < 1 ? "played" : "upcoming",
            divider:
              index === 1 ? "now_playing" : index === 2 ? "up_next" : null,
          })),
        ),
        totalItems: computed(() => 3),
        upNextCount: computed(() => 1),
        queueEnded: computed(() => false),
        totalSize: computed(() => 180),
        measureRow: vi.fn(),
        playerActive: computed(() => true),
        hoveredMarqueeSync: undefined,
        requestBadgeColor: ref(""),
        boostBadgeColor: ref(""),
        openQueueItemMenu: vi.fn(),
        startItemDrag: vi.fn(),
        draggingIndex: ref(null),
        isDragging: ref(false),
        draggedItem: ref(null),
        ghostY: ref(0),
        rowOffset: () => 0,
      };
    },
  };
});

vi.mock("@/layouts/default/PlayerOSD/QueueListItem.vue", () => ({
  default: {
    name: "QueueListItem",
    props: ["item", "state"],
    emits: ["click", "playNow"],
    template: `<div class="qitem" :data-state="state" @click="$emit('click', $event)">{{ item.name }}<button class="qitem-play" @click.stop="$emit('playNow', $event)" /></div>`,
  },
}));

vi.mock("@/layouts/default/PlayerOSD/QueueModeBanner.vue", () => ({
  default: { name: "QueueModeBanner", template: "<i class='banner' />" },
}));

enableAutoUnmount(afterEach);

function mountPane(props: Record<string, unknown> = {}) {
  return mount(QueuePane, {
    props: { visible: true, ...props },
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

describe("QueuePane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.visibleSeen.length = 0;
  });

  it("renders the queue with its dividers and the position", () => {
    const wrapper = mountPane();
    expect(mocks.visibleSeen).toEqual([true]);
    expect(wrapper.findAll(".qitem").map((el) => el.text())).toEqual([
      "Zero",
      "One",
      "Two",
    ]);
    expect(wrapper.text()).toContain("now_playing");
    expect(wrapper.text()).toContain("up_next");
    expect(wrapper.find(".queue-pane__count").text()).toBe("2 / 3");
    expect(wrapper.find(".banner").exists()).toBe(true);
  });

  it("plays and removes rows from the keyboard, and clears the queue", async () => {
    const wrapper = mountPane();
    const scroll = wrapper.find(".queue-pane__scroll");
    await wrapper.findAll(".qitem")[2].trigger("click");
    await scroll.trigger("keydown", { key: "Enter" });
    expect(mocks.queueCommandPlayIndex).toHaveBeenCalledWith("q1", 2);

    await scroll.trigger("keydown", { key: "ArrowUp" });
    await scroll.trigger("keydown", { key: "Delete" });
    expect(mocks.queueCommandDelete).toHaveBeenCalledWith("q1", "i1");

    await wrapper
      .find("[aria-label='library_manager.queue.locate']")
      .trigger("click");
    expect(mocks.focusCurrent).toHaveBeenCalledWith("smooth");

    await wrapper
      .find("[aria-label='library_manager.queue.clear']")
      .trigger("click");
    expect(mocks.queueCommandClear).toHaveBeenCalledWith("q1");
  });

  it("plays a row from the play button over its artwork", async () => {
    const wrapper = mountPane();
    await wrapper.findAll(".qitem-play")[0].trigger("click");
    expect(mocks.queueCommandPlayIndex).toHaveBeenCalledWith("q1", 0);
  });

  it("clears up next and appends the grid's selection from the divider", async () => {
    const selection = [{ uri: "library://track/9", name: "Nine" }];
    const wrapper = mountPane({ selection });

    await wrapper
      .find("[aria-label='library_manager.queue.clear_up_next']")
      .trigger("click");
    await flushPromises();
    // everything after the current track (index 1): one item, from index 2
    expect(mocks.getPlayerQueueItems).toHaveBeenCalledWith("q1", 1, 2);
    expect(mocks.queueCommandDelete).toHaveBeenCalledWith("q1", "i2");
    expect(mocks.queueCommandClear).not.toHaveBeenCalled();

    await wrapper
      .find("[aria-label='library_manager.queue.add_selection']")
      .trigger("click");
    await flushPromises();
    expect(mocks.playMedia).toHaveBeenCalledWith(selection, QueueOption.ADD);
  });

  it("disables the add button without a selection", () => {
    const wrapper = mountPane();
    expect(
      wrapper
        .find("[aria-label='library_manager.queue.add_selection']")
        .attributes("disabled"),
    ).toBeDefined();
  });
});
