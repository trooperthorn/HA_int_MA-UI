import {
  ensurePlayer,
  PLAYER_PICK_TIMEOUT_MS,
} from "@/library-manager/playerGate";
import { store } from "@/plugins/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  players: {} as Record<string, unknown>,
  webPlayerId: null as string | null,
  toastInfo: vi.fn(),
}));

vi.mock("@/plugins/api", () => {
  const api = { players: mocks.players };
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive, computed } = await import("vue");
  interface TestStore {
    activePlayerId: string | undefined;
    showPlayersMenu: boolean;
    activePlayer: unknown;
  }
  const state = reactive({
    activePlayerId: undefined as string | undefined,
    showPlayersMenu: false,
  });
  const store: TestStore = reactive({
    ...state,
    activePlayer: computed(() =>
      state.activePlayerId ? mocks.players[state.activePlayerId] : undefined,
    ),
  }) as TestStore;
  // keep the computed reading the same reactive fields the tests set
  Object.defineProperty(store, "activePlayerId", {
    get: () => state.activePlayerId,
    set: (value: string | undefined) => {
      state.activePlayerId = value;
    },
  });
  return { store };
});

vi.mock("@/plugins/web_player", () => ({
  webPlayer: {
    get player_id() {
      return mocks.webPlayerId;
    },
  },
}));

vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));
vi.mock("vue-sonner", () => ({ toast: { info: mocks.toastInfo } }));

const player = (id: string) => ({
  player_id: id,
  enabled: true,
  available: true,
  needs_setup: false,
  type: "player",
});

describe("ensurePlayer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.players)) delete mocks.players[key];
    mocks.webPlayerId = null;
    store.activePlayerId = undefined;
    store.showPlayersMenu = false;
  });
  afterEach(() => vi.useRealTimers());

  it("passes straight through when a player is selected", async () => {
    mocks.players.p1 = player("p1");
    store.activePlayerId = "p1";
    await expect(ensurePlayer()).resolves.toBe(true);
    expect(store.showPlayersMenu).toBe(false);
  });

  it("opens the picker and continues once the user picks", async () => {
    mocks.players.p1 = player("p1");
    const pending = ensurePlayer();
    expect(store.showPlayersMenu).toBe(true);
    store.activePlayerId = "p1";
    await expect(pending).resolves.toBe(true);
    expect(store.showPlayersMenu).toBe(false);
  });

  it("falls back to this browser's player after the timeout", async () => {
    mocks.players.web = player("web");
    mocks.webPlayerId = "web";
    const pending = ensurePlayer();
    await vi.advanceTimersByTimeAsync(PLAYER_PICK_TIMEOUT_MS + 5);
    await expect(pending).resolves.toBe(true);
    expect(store.activePlayerId).toBe("web");
    expect(store.showPlayersMenu).toBe(false);
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "library_manager.playing_here",
    );
  });

  it("gives up when the picker is dismissed or nothing can play here", async () => {
    const dismissed = ensurePlayer();
    store.showPlayersMenu = false;
    await expect(dismissed).resolves.toBe(false);

    const timedOut = ensurePlayer();
    await vi.advanceTimersByTimeAsync(PLAYER_PICK_TIMEOUT_MS + 5);
    await expect(timedOut).resolves.toBe(false);
  });
});
