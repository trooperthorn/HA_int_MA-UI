import { useKeymap } from "@/library-manager/composables/useKeymap";
import {
  BROWSER_OWNED_KEYS,
  comboMatches,
  findBinding,
  KEY_BINDINGS,
} from "@/library-manager/keymap";
import { store } from "@/plugins/store";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

const mocks = vi.hoisted(() => ({
  playerCommandPlayPause: vi.fn(),
  playerCommandNext: vi.fn(),
  playerCommandPrevious: vi.fn(),
  playerCommandSeek: vi.fn(),
  playerCommandVolumeUp: vi.fn(),
  playerCommandVolumeDown: vi.fn(),
  playerCommandVolumeMute: vi.fn(),
}));

vi.mock("@/plugins/api", () => ({ api: mocks, default: mocks }));

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      dialogActive: false,
      showPlayersMenu: false,
      activePlayer: { player_id: "p1", volume_muted: false, elapsed_time: 42 },
      activePlayerQueue: { elapsed_time: 65 },
    }),
  };
});

enableAutoUnmount(afterEach);

const Host = defineComponent({
  setup() {
    useKeymap();
    return () =>
      h("div", [
        h("input", { id: "field" }),
        h("button", { id: "btn" }, "go"),
        h("div", { id: "plain", tabindex: 0 }),
      ]);
  },
});

function press(
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("keymap table", () => {
  it("never binds a key the browser owns", () => {
    for (const binding of KEY_BINDINGS) {
      for (const combo of binding.keys) {
        expect(BROWSER_OWNED_KEYS).not.toContain(combo.toLowerCase());
      }
    }
  });

  it("has unique ids and combos", () => {
    const ids = KEY_BINDINGS.map((b) => b.id);
    const combos = KEY_BINDINGS.flatMap((b) => b.keys);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("matches modifiers exactly", () => {
    const next = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      ctrlKey: true,
      altKey: true,
    });
    expect(findBinding(next)?.handler).toBe("nextTrack");
    expect(
      comboMatches(
        "ctrl+alt+ArrowRight",
        new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true }),
      ),
    ).toBe(false);
    expect(
      comboMatches(
        "ctrl+alt+m",
        new KeyboardEvent("keydown", { key: "M", ctrlKey: true, altKey: true }),
      ),
    ).toBe(true);
    expect(
      findBinding(new KeyboardEvent("keydown", { key: " ", shiftKey: true })),
    ).toBeUndefined();
  });
});

describe("useKeymap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.dialogActive = false;
    store.showPlayersMenu = false;
  });

  it("drives the active player from the keyboard", () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const plain = wrapper.find("#plain").element;

    const space = press(plain, " ");
    expect(mocks.playerCommandPlayPause).toHaveBeenCalledWith("p1");
    expect(space.defaultPrevented).toBe(true);

    press(plain, "ArrowRight", { ctrlKey: true, altKey: true });
    press(plain, "ArrowLeft", { ctrlKey: true, altKey: true });
    expect(mocks.playerCommandNext).toHaveBeenCalledWith("p1");
    expect(mocks.playerCommandPrevious).toHaveBeenCalledWith("p1");

    press(plain, "ArrowUp", { ctrlKey: true, altKey: true });
    press(plain, "ArrowDown", { ctrlKey: true, altKey: true });
    expect(mocks.playerCommandVolumeUp).toHaveBeenCalledWith("p1");
    expect(mocks.playerCommandVolumeDown).toHaveBeenCalledWith("p1");

    press(plain, "m", { ctrlKey: true, altKey: true });
    expect(mocks.playerCommandVolumeMute).toHaveBeenCalledWith("p1", true);
  });

  it("seeks relative to the queue's elapsed time", () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const plain = wrapper.find("#plain").element;

    press(plain, "ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(mocks.playerCommandSeek).toHaveBeenLastCalledWith("p1", 75);
    press(plain, "ArrowLeft", { ctrlKey: true, shiftKey: true });
    expect(mocks.playerCommandSeek).toHaveBeenLastCalledWith("p1", 55);
  });

  it("stays out of the way while typing, in dialogs and on buttons", () => {
    const wrapper = mount(Host, { attachTo: document.body });

    press(wrapper.find("#field").element, " ");
    expect(mocks.playerCommandPlayPause).not.toHaveBeenCalled();

    const onButton = press(wrapper.find("#btn").element, " ");
    expect(mocks.playerCommandPlayPause).not.toHaveBeenCalled();
    expect(onButton.defaultPrevented).toBe(false);

    press(wrapper.find("#btn").element, "ArrowUp", {
      ctrlKey: true,
      altKey: true,
    });
    expect(mocks.playerCommandVolumeUp).toHaveBeenCalledTimes(1);

    store.dialogActive = true;
    press(wrapper.find("#plain").element, " ");
    expect(mocks.playerCommandPlayPause).not.toHaveBeenCalled();
  });

  it("leaves an event alone when something already handled it", () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const plain = wrapper.find("#plain").element;
    plain.addEventListener("keydown", (e) => e.preventDefault());
    press(plain, " ");
    expect(mocks.playerCommandPlayPause).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", () => {
    const wrapper = mount(Host, { attachTo: document.body });
    wrapper.unmount();
    press(document.body, " ");
    expect(mocks.playerCommandPlayPause).not.toHaveBeenCalled();
  });
});
