import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicAssistantApi } from "@/plugins/api";
import type { ProviderConfig } from "@/plugins/api/interfaces";
import { user } from "../fixtures/user";

const { mockUpdateUser, mockGetProviderConfigs, storeMock } = vi.hoisted(() => {
  return {
    mockUpdateUser: vi.fn<MusicAssistantApi["updateUser"]>(),
    mockGetProviderConfigs: vi.fn<MusicAssistantApi["getProviderConfigs"]>(),
    storeMock: {
      currentUser: null as {
        user_id: string;
        preferences?: Record<string, unknown>;
      } | null,
    },
  };
});

vi.mock("@/plugins/api", () => ({
  api: {
    updateUser: mockUpdateUser,
    getProviderConfigs: mockGetProviderConfigs,
  },
}));

vi.mock("@/plugins/store", () => ({
  store: storeMock,
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("vue-sonner", () => ({ toast: { error: toastError } }));
vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

import {
  pruneStaleProviderFilters,
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";

// `getItemsListingPreferences` returns a computed, so we read it through a fresh
// call after each write to avoid relying on computed caching against the plain
// (non-reactive) store mock.
function readPrefs(path: string, itemtype: string) {
  return useUserPreferences().getItemsListingPreferences(path, itemtype).value;
}

describe("userPreferences - itemsListing", () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue(user());
    storeMock.currentUser = { user_id: "u1", preferences: {} };
  });

  it("persists a filter under the namespaced key", async () => {
    const { setItemsListingPreference } = useUserPreferences();

    await setItemsListingPreference(
      "librarygenres",
      "genres",
      "hideEmptyFilter",
      true,
    );

    expect(readPrefs("librarygenres", "genres").hideEmptyFilter).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith("u1", {
      preferences: {
        "itemsListing.librarygenres.genres": {
          hideEmptyFilter: true,
        },
      },
    });
  });

  it("merges with sibling filter keys without clobbering them", async () => {
    const { setItemsListingPreference } = useUserPreferences();

    await setItemsListingPreference(
      "librarygenres",
      "genres",
      "hideEmptyFilter",
      true,
    );
    await setItemsListingPreference(
      "librarygenres",
      "genres",
      "favoriteFilter",
      true,
    );

    const prefs = readPrefs("librarygenres", "genres");
    expect(prefs.hideEmptyFilter).toBe(true);
    expect(prefs.favoriteFilter).toBe(true);
  });

  it("keeps the filter isolated per path/itemtype", async () => {
    const { setItemsListingPreference } = useUserPreferences();

    await setItemsListingPreference(
      "librarygenres",
      "genres",
      "favoriteFilter",
      true,
    );

    expect(readPrefs("libraryalbums", "albums").favoriteFilter).toBeUndefined();
  });

  it("clears the filter when set back to undefined (toggle-off)", async () => {
    const { setItemsListingPreference } = useUserPreferences();

    await setItemsListingPreference(
      "librarygenres",
      "genres",
      "favoriteFilter",
      true,
    );
    await setItemsListingPreference(
      "librarygenres",
      "genres",
      "favoriteFilter",
      undefined,
    );

    expect(readPrefs("librarygenres", "genres").favoriteFilter).toBeUndefined();
  });
});

describe("pruneStaleProviderFilters", () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue(user());
    mockGetProviderConfigs.mockReset();
    mockGetProviderConfigs.mockResolvedValue([
      { instance_id: "spotify1" } as ProviderConfig,
    ]);
  });

  it("drops deconfigured provider ids from both itemsListing and discover row filters", async () => {
    storeMock.currentUser = {
      user_id: "u1",
      preferences: {
        "itemsListing.libraryalbums.albums": {
          providerFilter: ["spotify1", "removed1"],
        },
        "discover.hiddenProviders.recently_played": ["spotify1", "removed1"],
      },
    };

    await pruneStaleProviderFilters();

    expect(storeMock.currentUser.preferences).toEqual({
      "itemsListing.libraryalbums.albums": { providerFilter: ["spotify1"] },
      "discover.hiddenProviders.recently_played": ["spotify1"],
    });
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no ids reference a deconfigured provider", async () => {
    storeMock.currentUser = {
      user_id: "u1",
      preferences: {
        "discover.hiddenProviders.recently_played": ["spotify1"],
      },
    };

    await pruneStaleProviderFilters();

    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("deletes a discover row filter key once every hidden id is pruned", async () => {
    storeMock.currentUser = {
      user_id: "u1",
      preferences: {
        "discover.hiddenProviders.recently_played": ["removed1"],
      },
    };

    await pruneStaleProviderFilters();

    expect(storeMock.currentUser.preferences).toEqual({});
  });
});

describe("userPreferences - failed saves", () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    toastError.mockReset();
    storeMock.currentUser = { user_id: "u1", preferences: { theme: "dark" } };
  });

  it("resolves true and keeps the value when the server accepts it", async () => {
    mockUpdateUser.mockResolvedValue(user());
    await expect(setUserPreference("theme", "light")).resolves.toBe(true);
    expect(storeMock.currentUser?.preferences?.theme).toBe("light");
    expect(toastError).not.toHaveBeenCalled();
  });

  it("rolls the value back, tells the user and resolves false when it fails", async () => {
    mockUpdateUser.mockRejectedValue(new Error("offline"));
    await expect(setUserPreference("theme", "light")).resolves.toBe(false);
    expect(storeMock.currentUser?.preferences?.theme).toBe("dark");
    expect(toastError).toHaveBeenCalledWith("preference_save_failed");
  });

  it("does not undo a newer save when an older one fails", async () => {
    let rejectFirst: (error: Error) => void = () => {};
    mockUpdateUser
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejectFirst = reject)),
      )
      .mockResolvedValue(user());
    const first = setUserPreference("theme", "light");
    await setUserPreference("theme", "sepia");
    rejectFirst(new Error("offline"));
    await expect(first).resolves.toBe(false);
    expect(storeMock.currentUser?.preferences?.theme).toBe("sepia");
  });
});
