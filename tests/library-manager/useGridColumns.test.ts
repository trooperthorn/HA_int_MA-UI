import { BROWSE_COLUMNS, TRACK_COLUMNS } from "@/library-manager/columns";
import {
  GRID_COLUMNS_PREFERENCE_KEY,
  useGridColumns,
} from "@/library-manager/composables/useGridColumns";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prefs = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));

vi.mock("@/composables/userPreferences", async () => {
  const { computed, reactive } = await import("vue");
  const state = reactive(prefs.store);
  prefs.store = state;
  return {
    setUserPreference: vi.fn(async (key: string, value: unknown) => {
      state[key] = value;
      return true;
    }),
    useUserPreferences: () => ({
      getPreference: <T>(key: string, fallback: T) =>
        computed(() => (state[key] as T | undefined) ?? fallback),
    }),
  };
});

describe("useGridColumns widths", () => {
  beforeEach(() => {
    delete prefs.store[GRID_COLUMNS_PREFERENCE_KEY];
  });

  it("lays a dragged width over the track columns and any other listing", async () => {
    const { visibleColumns, applyWidths, setColumnWidth } = useGridColumns();
    const before = visibleColumns.value.find((c) => c.id === "artist")!.width;

    await setColumnWidth("artist", 250.4);

    expect(visibleColumns.value.find((c) => c.id === "artist")!.width).toBe(
      250,
    );
    expect(before).not.toBe(250);
    // the definition itself is untouched
    expect(TRACK_COLUMNS.find((c) => c.id === "artist")!.width).toBe(before);
    expect(
      applyWidths(BROWSE_COLUMNS).find((c) => c.id === "artist")!.width,
    ).toBe(250);
  });

  it("keeps a column at least forty pixels wide and resets on request", async () => {
    const { visibleColumns, setColumnWidth, resetColumnWidths } =
      useGridColumns();
    const defaultWidth = TRACK_COLUMNS.find((c) => c.id === "year")!.width;

    await setColumnWidth("year", 5);
    expect(visibleColumns.value.find((c) => c.id === "year")!.width).toBe(40);

    await setColumnWidth("year", undefined);
    expect(visibleColumns.value.find((c) => c.id === "year")!.width).toBe(
      defaultWidth,
    );

    await setColumnWidth("year", 90);
    await setColumnWidth("artist", 300);
    await resetColumnWidths();
    expect(visibleColumns.value.find((c) => c.id === "year")!.width).toBe(
      defaultWidth,
    );
    expect(
      (prefs.store[GRID_COLUMNS_PREFERENCE_KEY] as { widths?: unknown }).widths,
    ).toBeUndefined();
  });
});
