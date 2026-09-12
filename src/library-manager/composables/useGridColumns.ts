import { computed } from "vue";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import {
  DEFAULT_COLUMN_VISIBILITY,
  TRACK_COLUMNS,
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
}

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

  const visibleColumns = computed<TrackColumn[]>(() =>
    TRACK_COLUMNS.filter(
      (column) => column.fixed || visibility.value[column.id],
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

  async function reset() {
    await setUserPreference(GRID_COLUMNS_PREFERENCE_KEY, {});
  }

  return {
    visibility,
    visibleColumns,
    density,
    rowHeight,
    setColumnVisible,
    setDensity,
    reset,
  };
}
