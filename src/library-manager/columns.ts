import {
  MediaType,
  type Album,
  type ItemMapping,
  type MediaItemType,
  type Playlist,
  type Track,
} from "@/plugins/api/interfaces";
import { formatDuration, getArtistsString } from "@/helpers/utils";
import { getListItemProviderIconDomain } from "@/plugins/api/helpers";

// Library listings carry two stats fields the item interfaces leave out
// because they only exist for database items: seconds since epoch of the
// last play, and the ISO date the item entered the library.
export type GridItem = MediaItemType & {
  last_played?: number;
  date_added?: string | null;
};

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

export type ItemColumnId = TrackColumnId | "owner" | "type";

export interface GridColumn<Id extends string = ItemColumnId> {
  id: Id;
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
  text?: (item: GridItem) => string;
  // what a local sort compares when the cell shows an icon rather than text
  sortText?: (item: GridItem) => string;
}

export type TrackColumn = GridColumn<TrackColumnId>;

const asTrack = (item: GridItem) => item as LibraryTrack;

const albumOf = (item: GridItem) =>
  "album" in item ? ((item as Track).album ?? undefined) : undefined;

const filesystemMapping = (item: GridItem) =>
  "provider_mappings" in item
    ? item.provider_mappings.find((mapping) =>
        mapping.provider_domain.startsWith("filesystem"),
      )
    : undefined;

const formatOf = (item: GridItem): string => {
  if (!("provider_mappings" in item)) return "";
  const mapping = item.provider_mappings[0];
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

const metadataOf = (item: GridItem) =>
  "metadata" in item ? item.metadata : undefined;

// ---- shared columns ---------------------------------------------------------

const FAVORITE: GridColumn = {
  id: "favorite",
  labelKey: "library_manager.columns.favorite",
  width: 40,
  align: "center",
  defaultVisible: true,
  sortText: (item) => ("favorite" in item && item.favorite ? "1" : "0"),
};

const SOURCE: GridColumn = {
  id: "source",
  labelKey: "library_manager.columns.source",
  width: 48,
  align: "center",
  defaultVisible: true,
  sortText: (item) => getListItemProviderIconDomain(item),
};

const LAST_PLAYED: GridColumn = {
  id: "last_played",
  labelKey: "library_manager.columns.last_played",
  sortKey: "last_played",
  width: 140,
  align: "left",
  defaultVisible: true,
  text: (item) => dateText(item.last_played),
};

const DATE_ADDED: GridColumn = {
  id: "date_added",
  labelKey: "library_manager.columns.date_added",
  sortKey: "timestamp_added",
  width: 140,
  align: "left",
  defaultVisible: false,
  text: (item) => dateText(item.date_added),
};

const MENU: GridColumn = {
  id: "menu",
  labelKey: "library_manager.columns.menu",
  width: 36,
  align: "center",
  defaultVisible: true,
  fixed: true,
};

const nameColumn = (sortable: boolean): GridColumn => ({
  id: "title",
  labelKey: "library_manager.columns.name",
  sortKey: sortable ? "name" : undefined,
  width: 260,
  grow: true,
  align: "left",
  defaultVisible: true,
  fixed: true,
  text: (item) => item.name,
});

// ---- tracks -----------------------------------------------------------------

export const TRACK_COLUMNS: readonly TrackColumn[] = [
  {
    id: "track_number",
    labelKey: "library_manager.columns.track_number",
    width: 44,
    align: "right",
    defaultVisible: true,
    text: (item) => {
      const track = asTrack(item);
      return track.track_number ? String(track.track_number) : "";
    },
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
    text: (item) => item.name,
  },
  {
    id: "artist",
    labelKey: "library_manager.columns.artist",
    sortKey: "track_artist_name",
    width: 180,
    align: "left",
    defaultVisible: true,
    text: (item) => getArtistsString(asTrack(item).artists, 2),
  },
  {
    id: "album",
    labelKey: "library_manager.columns.album",
    width: 180,
    align: "left",
    defaultVisible: true,
    text: (item) => albumOf(item)?.name ?? "",
  },
  {
    id: "album_artist",
    labelKey: "library_manager.columns.album_artist",
    width: 160,
    align: "left",
    defaultVisible: false,
    text: (item) => {
      const album = albumOf(item);
      return album && "artists" in album ? getArtistsString(album.artists) : "";
    },
  },
  {
    id: "year",
    labelKey: "library_manager.columns.year",
    width: 60,
    align: "left",
    defaultVisible: true,
    text: (item) => {
      const album = albumOf(item) as ItemMapping | undefined;
      return album?.year ? String(album.year) : "";
    },
  },
  {
    id: "genre",
    labelKey: "library_manager.columns.genre",
    width: 120,
    align: "left",
    defaultVisible: true,
    text: (item) => metadataOf(item)?.genres?.join(", ") ?? "",
  },
  FAVORITE as TrackColumn,
  SOURCE as TrackColumn,
  {
    id: "duration",
    labelKey: "library_manager.columns.duration",
    sortKey: "duration",
    width: 64,
    align: "right",
    defaultVisible: true,
    text: (item) => {
      const track = asTrack(item);
      return track.duration ? formatDuration(track.duration) : "";
    },
  },
  LAST_PLAYED as TrackColumn,
  DATE_ADDED as TrackColumn,
  {
    id: "disc_number",
    labelKey: "library_manager.columns.disc_number",
    width: 48,
    align: "right",
    defaultVisible: false,
    text: (item) => {
      const track = asTrack(item);
      return track.disc_number ? String(track.disc_number) : "";
    },
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
    text: (item) => filesystemMapping(item)?.item_id ?? "",
  },
  {
    id: "explicit",
    labelKey: "library_manager.columns.explicit",
    width: 60,
    align: "center",
    defaultVisible: false,
    text: (item) => (metadataOf(item)?.explicit ? "E" : ""),
  },
  {
    id: "popularity",
    labelKey: "library_manager.columns.popularity",
    width: 80,
    align: "right",
    defaultVisible: false,
    text: (item) => {
      const popularity = metadataOf(item)?.popularity;
      return popularity != null ? String(popularity) : "";
    },
  },
  MENU as TrackColumn,
];

// ---- other listings ---------------------------------------------------------

export const ARTIST_COLUMNS: readonly GridColumn[] = [
  nameColumn(true),
  FAVORITE,
  SOURCE,
  LAST_PLAYED,
  { ...DATE_ADDED, defaultVisible: true },
  MENU,
];

export const ALBUM_COLUMNS: readonly GridColumn[] = [
  nameColumn(true),
  {
    id: "artist",
    labelKey: "library_manager.columns.artist",
    sortKey: "album_artist_name",
    width: 200,
    align: "left",
    defaultVisible: true,
    text: (item) =>
      "artists" in item ? getArtistsString((item as Album).artists, 2) : "",
  },
  {
    id: "year",
    labelKey: "library_manager.columns.year",
    sortKey: "year",
    width: 60,
    align: "left",
    defaultVisible: true,
    text: (item) => {
      const year = (item as Album).year;
      return year ? String(year) : "";
    },
  },
  FAVORITE,
  SOURCE,
  LAST_PLAYED,
  { ...DATE_ADDED, defaultVisible: true },
  MENU,
];

export const PLAYLIST_COLUMNS: readonly GridColumn[] = [
  nameColumn(true),
  {
    id: "owner",
    labelKey: "library_manager.columns.owner",
    width: 180,
    align: "left",
    defaultVisible: true,
    text: (item) => ("owner" in item ? ((item as Playlist).owner ?? "") : ""),
  },
  FAVORITE,
  SOURCE,
  LAST_PLAYED,
  { ...DATE_ADDED, defaultVisible: true },
  MENU,
];

export const GENRE_COLUMNS: readonly GridColumn[] = [
  nameColumn(true),
  FAVORITE,
  MENU,
];

// a browse listing mixes folders and playable items and keeps the order the
// provider returned, so nothing here sorts
export const BROWSE_COLUMNS: readonly GridColumn[] = [
  nameColumn(false),
  {
    id: "type",
    labelKey: "library_manager.columns.type",
    width: 110,
    align: "left",
    defaultVisible: true,
    text: (item) => item.media_type,
  },
  {
    id: "artist",
    labelKey: "library_manager.columns.artist",
    width: 200,
    align: "left",
    defaultVisible: true,
    text: (item) =>
      "artists" in item && Array.isArray(item.artists)
        ? getArtistsString(item.artists, 2)
        : "",
  },
  { ...SOURCE, defaultVisible: true },
  MENU,
];

export function columnsForMediaType(
  mediaType: MediaType,
  scope: "library" | "browse",
): readonly GridColumn[] {
  if (scope === "browse") return BROWSE_COLUMNS;
  switch (mediaType) {
    case MediaType.ARTIST:
      return ARTIST_COLUMNS;
    case MediaType.ALBUM:
      return ALBUM_COLUMNS;
    case MediaType.PLAYLIST:
      return PLAYLIST_COLUMNS;
    case MediaType.GENRE:
      return GENRE_COLUMNS;
    default:
      return TRACK_COLUMNS;
  }
}

export const TRACK_COLUMN_BY_ID: Readonly<Record<TrackColumnId, TrackColumn>> =
  Object.fromEntries(
    TRACK_COLUMNS.map((column) => [column.id, column]),
  ) as Record<TrackColumnId, TrackColumn>;

export const DEFAULT_COLUMN_VISIBILITY: Readonly<
  Record<TrackColumnId, boolean>
> = Object.fromEntries(
  TRACK_COLUMNS.map((column) => [column.id, column.defaultVisible]),
) as Record<TrackColumnId, boolean>;

// The server sort keys the track grid can request; every sortable column's
// key appears here in both directions.
export const TRACK_SORT_KEYS: readonly string[] = TRACK_COLUMNS.flatMap(
  (column) =>
    column.sortKey ? [column.sortKey, `${column.sortKey}_desc`] : [],
);

export interface GridSort {
  columnId: string;
  desc: boolean;
}

// a sort applied in the browser to a fully loaded listing, on any column
export const LOCAL_SORT_PREFIX = "local:";

export function localSortToGridSort(sortBy: string): GridSort | undefined {
  if (!sortBy.startsWith(LOCAL_SORT_PREFIX)) return undefined;
  const rest = sortBy.slice(LOCAL_SORT_PREFIX.length);
  const desc = rest.endsWith("_desc");
  return { columnId: desc ? rest.slice(0, -"_desc".length) : rest, desc };
}

export function gridSortToLocalSort(sort: GridSort): string {
  return `${LOCAL_SORT_PREFIX}${sort.columnId}${sort.desc ? "_desc" : ""}`;
}

export function sortItemsLocally(
  items: GridItem[],
  sort: GridSort,
  columns: readonly GridColumn[],
): GridItem[] {
  const column = columns.find((candidate) => candidate.id === sort.columnId);
  const text = column?.sortText ?? column?.text;
  if (!text) return items;
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const sorted = items
    .map((item, index) => ({ item, index, key: text(item) }))
    .sort((a, b) => collator.compare(a.key, b.key) || a.index - b.index)
    .map((entry) => entry.item);
  return sort.desc ? sorted.reverse() : sorted;
}

export function sortByToGridSort(
  sortBy: string,
  columns: readonly GridColumn[] = TRACK_COLUMNS,
): GridSort | undefined {
  const local = localSortToGridSort(sortBy);
  if (local) {
    return columns.some((candidate) => candidate.id === local.columnId)
      ? local
      : undefined;
  }
  const desc = sortBy.endsWith("_desc");
  const key = desc ? sortBy.slice(0, -"_desc".length) : sortBy;
  const column = columns.find((candidate) => candidate.sortKey === key);
  return column ? { columnId: column.id, desc } : undefined;
}

export function gridSortToSortBy(
  sort: GridSort,
  columns: readonly GridColumn[] = TRACK_COLUMNS,
): string | undefined {
  const column = columns.find((candidate) => candidate.id === sort.columnId);
  if (!column?.sortKey) return undefined;
  return sort.desc ? `${column.sortKey}_desc` : column.sortKey;
}

// the sort to request for a column set when the stored one does not apply
export function sortByForColumns(
  sortBy: string,
  columns: readonly GridColumn[],
): string | undefined {
  if (localSortToGridSort(sortBy)) {
    // a local sort never reaches the server; ask for the natural order
    return columns.some((column) => column.sortKey === "name")
      ? "name"
      : undefined;
  }
  if (sortByToGridSort(sortBy, columns)) return sortBy;
  return columns.some((column) => column.sortKey === "name")
    ? "name"
    : undefined;
}
