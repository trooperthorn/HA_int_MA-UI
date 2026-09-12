import type { ItemMapping, Track } from "@/plugins/api/interfaces";
import { formatDuration, getArtistsString } from "@/helpers/utils";

// Library listings carry two stats fields the Track interface leaves out
// because they only exist for database items: seconds since epoch of the
// last play, and the ISO date the item entered the library.
export type LibraryTrack = Track & {
  last_played?: number;
  date_added?: string | null;
};

export type TrackColumnId =
  | "track_number"
  | "title"
  | "artist"
  | "album"
  | "album_artist"
  | "year"
  | "genre"
  | "favorite"
  | "source"
  | "duration"
  | "last_played"
  | "date_added"
  | "disc_number"
  | "format"
  | "path"
  | "explicit"
  | "popularity"
  | "menu";

export interface TrackColumn {
  id: TrackColumnId;
  labelKey: string;
  // server sort key; columns without one are not sortable
  sortKey?: string;
  width: number;
  // a column with grow takes the remaining width of the grid
  grow?: boolean;
  align: "left" | "center" | "right";
  defaultVisible: boolean;
  // fixed columns are always shown and never offered in the column picker
  fixed?: boolean;
  // text shown in the cell; icon columns (favorite, source, menu) have none
  text?: (track: LibraryTrack) => string;
}

const albumOf = (track: LibraryTrack) => track.album ?? undefined;

const filesystemMapping = (track: LibraryTrack) =>
  track.provider_mappings.find((mapping) =>
    mapping.provider_domain.startsWith("filesystem"),
  );

const formatOf = (track: LibraryTrack): string => {
  const mapping = track.provider_mappings[0];
  if (!mapping?.audio_format) return "";
  const { content_type, sample_rate, bit_depth } = mapping.audio_format;
  const parts: string[] = [String(content_type).toUpperCase()];
  if (sample_rate) parts.push(`${sample_rate / 1000} kHz`);
  if (bit_depth) parts.push(`${bit_depth}-bit`);
  return parts.join(" · ");
};

const dateText = (value: string | number | null | undefined): string => {
  if (!value) return "";
  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
};

export const TRACK_COLUMNS: readonly TrackColumn[] = [
  {
    id: "track_number",
    labelKey: "library_manager.columns.track_number",
    width: 44,
    align: "right",
    defaultVisible: true,
    text: (track) => (track.track_number ? String(track.track_number) : ""),
  },
  {
    id: "title",
    labelKey: "library_manager.columns.title",
    sortKey: "name",
    width: 260,
    grow: true,
    align: "left",
    defaultVisible: true,
    fixed: true,
    text: (track) => track.name,
  },
  {
    id: "artist",
    labelKey: "library_manager.columns.artist",
    sortKey: "track_artist_name",
    width: 180,
    align: "left",
    defaultVisible: true,
    text: (track) => getArtistsString(track.artists, 2),
  },
  {
    id: "album",
    labelKey: "library_manager.columns.album",
    width: 180,
    align: "left",
    defaultVisible: true,
    text: (track) => albumOf(track)?.name ?? "",
  },
  {
    id: "album_artist",
    labelKey: "library_manager.columns.album_artist",
    width: 160,
    align: "left",
    defaultVisible: false,
    text: (track) => {
      const album = albumOf(track);
      return album && "artists" in album ? getArtistsString(album.artists) : "";
    },
  },
  {
    id: "year",
    labelKey: "library_manager.columns.year",
    width: 60,
    align: "left",
    defaultVisible: true,
    text: (track) => {
      const album = albumOf(track) as ItemMapping | undefined;
      return album?.year ? String(album.year) : "";
    },
  },
  {
    id: "genre",
    labelKey: "library_manager.columns.genre",
    width: 120,
    align: "left",
    defaultVisible: true,
    text: (track) => track.metadata?.genres?.join(", ") ?? "",
  },
  {
    id: "favorite",
    labelKey: "library_manager.columns.favorite",
    width: 40,
    align: "center",
    defaultVisible: true,
  },
  {
    id: "source",
    labelKey: "library_manager.columns.source",
    width: 48,
    align: "center",
    defaultVisible: true,
  },
  {
    id: "duration",
    labelKey: "library_manager.columns.duration",
    sortKey: "duration",
    width: 64,
    align: "right",
    defaultVisible: true,
    text: (track) => (track.duration ? formatDuration(track.duration) : ""),
  },
  {
    id: "last_played",
    labelKey: "library_manager.columns.last_played",
    sortKey: "last_played",
    width: 140,
    align: "left",
    defaultVisible: true,
    text: (track) => dateText(track.last_played),
  },
  {
    id: "date_added",
    labelKey: "library_manager.columns.date_added",
    sortKey: "timestamp_added",
    width: 140,
    align: "left",
    defaultVisible: false,
    text: (track) => dateText(track.date_added),
  },
  {
    id: "disc_number",
    labelKey: "library_manager.columns.disc_number",
    width: 48,
    align: "right",
    defaultVisible: false,
    text: (track) => (track.disc_number ? String(track.disc_number) : ""),
  },
  {
    id: "format",
    labelKey: "library_manager.columns.format",
    width: 150,
    align: "left",
    defaultVisible: false,
    text: formatOf,
  },
  {
    id: "path",
    labelKey: "library_manager.columns.path",
    width: 320,
    align: "left",
    defaultVisible: false,
    text: (track) => filesystemMapping(track)?.item_id ?? "",
  },
  {
    id: "explicit",
    labelKey: "library_manager.columns.explicit",
    width: 60,
    align: "center",
    defaultVisible: false,
    text: (track) => (track.metadata?.explicit ? "E" : ""),
  },
  {
    id: "popularity",
    labelKey: "library_manager.columns.popularity",
    width: 80,
    align: "right",
    defaultVisible: false,
    text: (track) =>
      track.metadata?.popularity != null
        ? String(track.metadata.popularity)
        : "",
  },
  {
    id: "menu",
    labelKey: "library_manager.columns.menu",
    width: 36,
    align: "center",
    defaultVisible: true,
    fixed: true,
  },
];

export const TRACK_COLUMN_BY_ID: Readonly<Record<TrackColumnId, TrackColumn>> =
  Object.fromEntries(
    TRACK_COLUMNS.map((column) => [column.id, column]),
  ) as Record<TrackColumnId, TrackColumn>;

export const DEFAULT_COLUMN_VISIBILITY: Readonly<
  Record<TrackColumnId, boolean>
> = Object.fromEntries(
  TRACK_COLUMNS.map((column) => [column.id, column.defaultVisible]),
) as Record<TrackColumnId, boolean>;

// The server sort keys the grid can request; every sortable column's key
// appears here in both directions.
export const TRACK_SORT_KEYS: readonly string[] = TRACK_COLUMNS.flatMap(
  (column) =>
    column.sortKey ? [column.sortKey, `${column.sortKey}_desc`] : [],
);

export interface GridSort {
  columnId: TrackColumnId;
  desc: boolean;
}

export function sortByToGridSort(sortBy: string): GridSort | undefined {
  const desc = sortBy.endsWith("_desc");
  const key = desc ? sortBy.slice(0, -"_desc".length) : sortBy;
  const column = TRACK_COLUMNS.find((candidate) => candidate.sortKey === key);
  return column ? { columnId: column.id, desc } : undefined;
}

export function gridSortToSortBy(sort: GridSort): string | undefined {
  const column = TRACK_COLUMN_BY_ID[sort.columnId];
  if (!column.sortKey) return undefined;
  return sort.desc ? `${column.sortKey}_desc` : column.sortKey;
}
