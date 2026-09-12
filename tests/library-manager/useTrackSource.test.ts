import {
  TRACK_PAGE_SIZE,
  useTrackSource,
  type TrackFilter,
} from "@/library-manager/composables/useTrackSource";
import type { MusicAssistantApi } from "@/plugins/api";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref, type EffectScope, type Ref } from "vue";
import { track } from "../fixtures/track";

const {
  mockGetLibraryTracks,
  mockGetLibraryTracksCount,
  mockSubscribe,
  syncListeners,
} = vi.hoisted(() => ({
  mockGetLibraryTracks: vi.fn<MusicAssistantApi["getLibraryTracks"]>(),
  mockGetLibraryTracksCount:
    vi.fn<MusicAssistantApi["getLibraryTracksCount"]>(),
  mockSubscribe: vi.fn(() => () => {}),
  syncListeners: [] as Array<() => void>,
}));

vi.mock("@/plugins/api", () => {
  const api = {
    getLibraryTracks: mockGetLibraryTracks,
    getLibraryTracksCount: mockGetLibraryTracksCount,
    subscribe: mockSubscribe,
  };
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return { store: reactive({ libraryTracksCount: 12418 }) };
});

vi.mock("@/composables/useLibrarySync", () => ({
  onLibrarySyncCompleted: (_type: unknown, callback: () => void) => {
    syncListeners.push(callback);
    return () => {
      const index = syncListeners.indexOf(callback);
      if (index !== -1) syncListeners.splice(index, 1);
    };
  },
}));

const page = (offset: number, count = TRACK_PAGE_SIZE) =>
  Array.from({ length: count }, (_, i) =>
    track({ item_id: `t${offset + i}`, name: `Track ${offset + i}` }),
  );

describe("useTrackSource", () => {
  let scope: EffectScope;
  let filter: Ref<TrackFilter>;

  beforeEach(() => {
    vi.clearAllMocks();
    syncListeners.length = 0;
    mockGetLibraryTracksCount.mockResolvedValue(7);
    filter = ref<TrackFilter>({
      search: "",
      sortBy: "name",
      favoritesOnly: false,
    });
    scope = effectScope();
  });

  afterEach(() => {
    scope.stop();
  });

  it("requests the first page with the filter's sort and the library total", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0));
    const source = scope.run(() => useTrackSource(filter))!;
    await flushPromises();

    expect(mockGetLibraryTracks).toHaveBeenCalledWith(
      undefined,
      undefined,
      TRACK_PAGE_SIZE,
      0,
      "name",
      undefined,
      undefined,
    );
    expect(source.rows.value).toHaveLength(TRACK_PAGE_SIZE);
    expect(source.total.value).toBe(12418);
    expect(source.allLoaded.value).toBe(false);
  });

  it("loads the page an index falls in, once", async () => {
    mockGetLibraryTracks.mockImplementation(async (...args) =>
      page(args[3] ?? 0),
    );
    const source = scope.run(() => useTrackSource(filter))!;
    await flushPromises();

    source.ensureLoaded(450);
    source.ensureLoaded(451);
    await flushPromises();

    const offsets = mockGetLibraryTracks.mock.calls.map((call) => call[3]);
    expect(offsets).toEqual([0, 400]);
    expect(source.rows.value[450]?.item_id).toBe("t450");
    expect(source.rows.value[250]).toBeUndefined();
  });

  it("marks the end of the list on a short page", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0, 7));
    filter.value = { search: "", sortBy: "name", favoritesOnly: true };
    const source = scope.run(() => useTrackSource(filter))!;
    await flushPromises();

    expect(mockGetLibraryTracks).toHaveBeenLastCalledWith(
      true,
      undefined,
      TRACK_PAGE_SIZE,
      0,
      "name",
      undefined,
      undefined,
    );
    expect(mockGetLibraryTracksCount).toHaveBeenCalledWith(true);
    expect(source.allLoaded.value).toBe(true);
    expect(source.rows.value).toHaveLength(7);
    expect(source.total.value).toBe(7);
  });

  it("drops a response that belongs to a superseded filter", async () => {
    let resolveSlow: (items: ReturnType<typeof page>) => void = () => {};
    mockGetLibraryTracks
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlow = resolve;
          }),
      )
      .mockResolvedValueOnce(page(0, 3));
    const source = scope.run(() => useTrackSource(filter))!;
    await flushPromises();

    filter.value = { ...filter.value, search: "horisont" };
    await flushPromises();
    expect(source.rows.value).toHaveLength(3);

    resolveSlow(page(0));
    await flushPromises();
    expect(source.rows.value).toHaveLength(3);
    expect(source.total.value).toBe(3);
  });

  it("flags new content after a library sync and reloads on demand", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0, 2));
    const source = scope.run(() => useTrackSource(filter))!;
    await flushPromises();
    expect(source.updateAvailable.value).toBe(false);

    syncListeners.forEach((listener) => listener());
    expect(source.updateAvailable.value).toBe(true);

    source.reload();
    await flushPromises();
    expect(source.updateAvailable.value).toBe(false);
    expect(mockGetLibraryTracks).toHaveBeenCalledTimes(2);
  });

  it("stops listening when its scope ends", async () => {
    mockGetLibraryTracks.mockResolvedValue(page(0, 1));
    scope.run(() => useTrackSource(filter));
    await flushPromises();
    expect(syncListeners).toHaveLength(1);

    scope.stop();
    expect(syncListeners).toHaveLength(0);
  });
});
