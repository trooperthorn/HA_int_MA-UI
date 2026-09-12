import { useKeymap } from "@/library-manager/composables/useKeymap";
import {
  BROWSER_OWNED_KEYS,
  CHORD_PREFIXES,
  CHORD_TIMEOUT_MS,
  comboMatches,
  findBinding,
  findChord,
  isChord,
  KEY_BINDINGS,
} from "@/library-manager/keymap";
import { comboParts, THEN } from "@/library-manager/keymapDisplay";
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
  push: vi.fn(),
}));

vi.mock("@/plugins/api", () => ({ api: mocks, default: mocks }));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      dialogActive: false,
      showPlayersMenu: false,
      showFullscreenPlayer: false,
      activePlayer: { player_id: "p1", volume_muted: false, elapsed_time: 42 },
      activePlayerQueue: { elapsed_time: 65 },
    }),
  };
});

enableAutoUnmount(afterEach);

const actions = {
  playSelectedNext: vi.fn(),
  addSelectedToQueue: vi.fn(),
  locateNowPlaying: vi.fn(),
  toggleFavorite: vi.fn(),
  toggleSelectedPane: vi.fn(),
  addToPlaylist: vi.fn(),
  goNowPlaying: vi.fn(),
  goLibrary: vi.fn(),
  goArtists: vi.fn(),
  goAlbums: vi.fn(),
  goGenres: vi.fn(),
  goPlaylists: vi.fn(),
  sortByColumn: vi.fn(),
  refresh: vi.fn(),
  toggleStrip: vi.fn(),
  toggleQueuePane: vi.fn(),
  showHelp: vi.fn(),
};

const Host = defineComponent({
  setup() {
    useKeymap({ actions });
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

  it("has unique ids and combos, and every view handler is wired by the host", () => {
    const ids = KEY_BINDINGS.map((b) => b.id);
    const combos = KEY_BINDINGS.flatMap((b) => b.keys);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(combos).size).toBe(combos.length);
    for (const binding of KEY_BINDINGS) {
      if (binding.handler in actions) continue;
      expect([
        "playPause",
        "nextTrack",
        "previousTrack",
        "seekBack",
        "seekForward",
        "volumeUp",
        "volumeDown",
        "muteToggle",
        "playerPicker",
        "fullscreenPlayer",
        "preferences",
      ]).toContain(binding.handler);
    }
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
    // "?" is typed with Shift on most layouts
    expect(
      findBinding(new KeyboardEvent("keydown", { key: "?", shiftKey: true }))
        ?.handler,
    ).toBe("showHelp");
  });

  it("knows its chords", () => {
    expect(isChord("g a")).toBe(true);
    expect(isChord(" ")).toBe(false);
    expect(CHORD_PREFIXES).toEqual(["g", "s"]);
    expect(findChord("g", "A")?.binding.handler).toBe("goArtists");
    expect(findChord("s", "3")?.combo).toBe("s 3");
    expect(findChord("g", "z")).toBeUndefined();
    expect(comboParts("g n")).toEqual(["G", THEN, "N"]);
    expect(comboParts("ctrl+alt+ArrowUp")).toEqual(["Ctrl", "Alt", "↑"]);
    expect(comboParts(" ")).toEqual(["Space"]);
  });
});

describe("useKeymap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    store.dialogActive = false;
    store.showPlayersMenu = false;
    store.showFullscreenPlayer = false;
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

  it("hands the view its bindings and opens app surfaces", () => {
    const wrapper = mount(Host, { attachTo: document.body });
    const plain = wrapper.find("#plain").element;

    press(plain, "Enter", { ctrlKey: true, shiftKey: true });
    expect(actions.playSelectedNext).toHaveBeenCalledTimes(1);
    press(plain, "Enter", { ctrlKey: true });
    expect(actions.addSelectedToQueue).toHaveBeenCalledTimes(1);
    press(plain, "l", { ctrlKey: true });
    expect(actions.locateNowPlaying).toHaveBeenCalledTimes(1);
    press(plain, "L", { ctrlKey: true, shiftKey: true });
    expect(actions.toggleFavorite).toHaveBeenCalledTimes(1);
    press(plain, "i", { ctrlKey: true });
    expect(actions.toggleSelectedPane).toHaveBeenCalledTimes(1);
    press(plain, "P", { ctrlKey: true, shiftKey: true });
    expect(actions.addToPlaylist).toHaveBeenCalledTimes(1);
    press(plain, "r", { ctrlKey: true, altKey: true });
    expect(actions.refresh).toHaveBeenCalledTimes(1);
    press(plain, "b", { ctrlKey: true });
    expect(actions.toggleStrip).toHaveBeenCalledTimes(1);
    press(plain, "q", { ctrlKey: true, altKey: true });
    expect(actions.toggleQueuePane).toHaveBeenCalledTimes(1);
    press(plain, "?", { shiftKey: true });
    expect(actions.showHelp).toHaveBeenCalledTimes(1);

    press(plain, "p", { ctrlKey: true, altKey: true });
    expect(store.showPlayersMenu).toBe(true);
    store.showPlayersMenu = false;
    press(plain, "F", { ctrlKey: true, shiftKey: true });
    expect(store.showFullscreenPlayer).toBe(true);
    press(plain, ",", { ctrlKey: true });
    expect(mocks.push).toHaveBeenCalledWith({ name: "settings" });
  });

  it("runs two-key chords and forgets a prefix after the timeout", () => {
    vi.useFakeTimers();
    const wrapper = mount(Host, { attachTo: document.body });
    const plain = wrapper.find("#plain").element;

    const first = press(plain, "g");
    expect(first.defaultPrevented).toBe(true);
    press(plain, "a");
    expect(actions.goArtists).toHaveBeenCalledTimes(1);

    press(plain, "g");
    press(plain, "p");
    expect(actions.goPlaylists).toHaveBeenCalledTimes(1);

    press(plain, "s");
    press(plain, "3");
    expect(actions.sortByColumn).toHaveBeenCalledWith(3);

    // an unknown second key ends the chord without firing anything
    press(plain, "g");
    press(plain, "z");
    expect(actions.goLibrary).not.toHaveBeenCalled();

    press(plain, "g");
    vi.advanceTimersByTime(CHORD_TIMEOUT_MS + 10);
    press(plain, "l");
    expect(actions.goLibrary).not.toHaveBeenCalled();

    // a chord prefix never types into a field
    press(wrapper.find("#field").element, "g");
    press(wrapper.find("#field").element, "n");
    expect(actions.goNowPlaying).not.toHaveBeenCalled();
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
