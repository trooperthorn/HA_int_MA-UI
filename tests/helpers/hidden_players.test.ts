import {
  HIDDEN_PLAYERS_PREFERENCE_KEY,
  hiddenPlayerIds,
  isHiddenPlayer,
  setPlayerHidden,
} from "@/helpers/hidden_players";
import { store } from "@/plugins/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setUserPreference: vi.fn() }));

vi.mock("@/composables/userPreferences", () => ({
  setUserPreference: mocks.setUserPreference,
}));

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({
      currentUser: undefined as
        | undefined
        | { preferences: Record<string, unknown> },
    }),
  };
});

describe("hidden players", () => {
  beforeEach(() => {
    mocks.setUserPreference.mockReset();
    mocks.setUserPreference.mockResolvedValue(undefined);
    store.currentUser = { preferences: {} } as never;
  });

  it("reads only string ids from the preference", () => {
    store.currentUser!.preferences = {
      [HIDDEN_PLAYERS_PREFERENCE_KEY]: ["a", 3, "b"],
    };
    expect(hiddenPlayerIds.value).toEqual(["a", "b"]);
    expect(isHiddenPlayer("a")).toBe(true);
    expect(isHiddenPlayer("c")).toBe(false);
  });

  it("adds and removes ids without duplicates", async () => {
    store.currentUser!.preferences = {
      [HIDDEN_PLAYERS_PREFERENCE_KEY]: ["a"],
    };
    await setPlayerHidden("a", true);
    expect(mocks.setUserPreference).not.toHaveBeenCalled();
    await setPlayerHidden("b", true);
    expect(mocks.setUserPreference).toHaveBeenLastCalledWith(
      HIDDEN_PLAYERS_PREFERENCE_KEY,
      ["a", "b"],
    );
    await setPlayerHidden("a", false);
    expect(mocks.setUserPreference).toHaveBeenLastCalledWith(
      HIDDEN_PLAYERS_PREFERENCE_KEY,
      [],
    );
  });

  it("is empty without a signed-in user", () => {
    store.currentUser = undefined;
    expect(hiddenPlayerIds.value).toEqual([]);
  });
});
