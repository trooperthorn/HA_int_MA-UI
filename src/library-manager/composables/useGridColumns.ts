import { computed } from "vue";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import {
  DEFAULT_COLUMN_VISIBILITY,
  TRACK_COLUMNS,
  type GridColumn,
  type TrackColumn,
  type TrackColumnId,
} from "../columns";

export const GRID_COLUMNS_PREFERENCE_KEY = "libraryManager.columns";

export type GridDensity = "compact" | "comfortable" | "thumbnails";

export const ROW_HEIGHT_BY_DENSITY: Readonly<Record<GridDensity, number>> = {
  compact: 28,
  comfortable: 36,
  thumbnails: 50,
};

export interface GridColumnsPreference {
  visibility?: Partial<Record<TrackColumnId, boolean>>;
  density?: GridDensity;
  // column widths the user dragged, in px, by column id (any listing)
  widths?: Partial<Record<string, number>>;
}

export const MIN_COLUMN_WIDTH = 40;

export function useGridColumns() {
  const { getPreference } = useUserPreferences();
  const preference = getPreference<GridColumnsPreference>(
    GRID_COLUMNS_PREFERENCE_KEY,
    {},
  );

  const visibility = computed<Record<TrackColumnId, boolean>>(() => ({
    ...DEFAULT_COLUMN_VISIBILITY,
    ...preference.value.visibility,
  }));

  // the user's widths laid over any column set (the track grid, a browse
  // or issues listing)
  function applyWidths<T extends GridColumn<string>>(
    columns: readonly T[],
  ): T[] {
    const widths = preference.value.widths ?? {};
    return columns.map((column) => {
      const width = widths[column.id];
      return width ? { ...column, width } : column;
    });
  }

  const visibleColumns = computed<TrackColumn[]>(() =>
    applyWidths(
      TRACK_COLUMNS.filter(
        (column) => column.fixed || visibility.value[column.id],
      ),
    ),
  );

  const density = computed<GridDensity>(
    () => preference.value.density ?? "compact",
  );

  const rowHeight = computed(() => ROW_HEIGHT_BY_DENSITY[density.value]);

  async function setColumnVisible(id: string, visible: boolean) {
    await setUserPreference(GRID_COLUMNS_PREFERENCE_KEY, {
      ...preference.value,
      visibility: { ...preference.value.visibility, [id]: visible },
    });
  }

  async function setDensity(value: GridDensity) {
    await setUserPreference(GRID_COLUMNS_PREFERENCE_KEY, {
      ...preference.value,
      density: value,
    });
  }

  // undefined puts the column back to its default width
  async function setColumnWidth(id: string, width: number | undefined) {
    const widths = { ...preference.value.widths };
    if (width === undefined) delete widths[id];
    else widths[id] = Math.max(MIN_COLUMN_WIDTH, Math.round(width));
    await setUserPreference(GRID_COLUMNS_PREFERENCE_KEY, {
      ...preference.value,
      widths,
    });
  }

  async function resetColumnWidths() {
    const { widths: _widths, ...rest } = preference.value;
    await setUserPreference(GRID_COLUMNS_PREFERENCE_KEY, rest);
  }

  async function reset() {
    await setUserPreference(GRID_COLUMNS_PREFERENCE_KEY, {});
  }

  return {
    visibility,
    visibleColumns,
    density,
    rowHeight,
    applyWidths,
    setColumnVisible,
    setColumnWidth,
    resetColumnWidths,
    setDensity,
    reset,
  };
}
