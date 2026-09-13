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

  it("serves splitter layouts from the preference and writes them back", async () => {
    vi.useFakeTimers();
    mocks.preference.value = { groups: { main: '{"a":1}' } };
    const { storage } = usePaneLayout();
    expect(storage.getItem("main")).toBe('{"a":1}');
    expect(storage.getItem("other")).toBeNull();

    // a drag reports every frame; one write lands once it settles
    storage.setItem("main", '{"a":2}');
    storage.setItem("main", '{"a":3}');
    storage.setItem("strip", '{"b":1}');
    // the new value is readable before the preference round-trips
    expect(storage.getItem("main")).toBe('{"a":3}');
    expect(mocks.setUserPreference).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(mocks.setUserPreference).toHaveBeenCalledTimes(1);
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.panes",
      { groups: { main: '{"a":3}', strip: '{"b":1}' } },
    );

    storage.setItem("main", '{"a":3}');
    await vi.advanceTimersByTimeAsync(400);
    expect(mocks.setUserPreference).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
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
