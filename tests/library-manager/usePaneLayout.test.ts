import { usePaneLayout } from "@/library-manager/composables/usePaneLayout";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setUserPreference: vi.fn(),
  preference: { value: {} as Record<string, unknown> },
}));

vi.mock("@/composables/userPreferences", async () => {
  const { computed } = await import("vue");
  return {
    setUserPreference: mocks.setUserPreference,
    useUserPreferences: () => ({
      getPreference: () => computed(() => mocks.preference.value),
    }),
  };
});

describe("usePaneLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preference.value = {};
  });

  it("serves splitter layouts from the preference and writes them back", () => {
    mocks.preference.value = { groups: { main: '{"a":1}' } };
    const { storage } = usePaneLayout();
    expect(storage.getItem("main")).toBe('{"a":1}');
    expect(storage.getItem("other")).toBeNull();

    storage.setItem("main", '{"a":2}');
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.panes",
      { groups: { main: '{"a":2}' } },
    );
    // the new value is readable before the preference round-trips
    expect(storage.getItem("main")).toBe('{"a":2}');

    storage.setItem("main", '{"a":2}');
    expect(mocks.setUserPreference).toHaveBeenCalledTimes(1);
  });

  it("shows the queue and selected panes unless the user hid them", async () => {
    mocks.preference.value = { showSelected: false };
    const layout = usePaneLayout();
    expect(layout.showQueue.value).toBe(true);
    expect(layout.showSelected.value).toBe(false);
    await layout.setShowQueue(false);
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.panes",
      { showSelected: false, showQueue: false },
    );
  });

  it("shows the tree unless the user hid it", async () => {
    const layout = usePaneLayout();
    expect(layout.showTree.value).toBe(true);
    await layout.setShowTree(false);
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.panes",
      { showTree: false },
    );
  });
});
