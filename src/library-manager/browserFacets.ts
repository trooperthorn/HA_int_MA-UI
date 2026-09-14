import { MediaType } from "@/plugins/api/interfaces";

// what a browser column can list; the user picks one per column
export type BrowserFacet =
  | "genre"
  | "artist"
  | "album_artist"
  | "album"
  | "playlist";

export interface BrowserFacetDef {
  id: BrowserFacet;
  labelKey: string;
  mediaType: MediaType;
  // more than one item may be picked at once
  multiple: boolean;
}

export const BROWSER_FACETS: readonly BrowserFacetDef[] = [
  {
    id: "genre",
    labelKey: "genre",
    mediaType: MediaType.GENRE,
    multiple: true,
  },
  {
    id: "artist",
    labelKey: "artist",
    mediaType: MediaType.ARTIST,
    multiple: false,
  },
  {
    id: "album_artist",
    labelKey: "library_manager.tree.album_artist",
    mediaType: MediaType.ARTIST,
    multiple: false,
  },
  {
    id: "album",
    labelKey: "album",
    mediaType: MediaType.ALBUM,
    multiple: false,
  },
  {
    id: "playlist",
    labelKey: "playlist",
    mediaType: MediaType.PLAYLIST,
    multiple: false,
  },
];

export const DEFAULT_BROWSER_FACETS: BrowserFacet[] = [
  "genre",
  "artist",
  "album",
];

// a source without playlists leads with its artists instead
export const DEFAULT_BROWSER_FACETS_NO_PLAYLISTS: BrowserFacet[] = [
  "artist",
  "album",
  "album_artist",
];

export const BROWSER_FACETS_PREFERENCE_KEY = "libraryManager.browserFacets";

// each source keeps its own three columns; the whole library has the base key
export function browserFacetsPreferenceKey(provider?: string[]): string {
  return provider?.length === 1
    ? `${BROWSER_FACETS_PREFERENCE_KEY}.${provider[0]}`
    : BROWSER_FACETS_PREFERENCE_KEY;
}

export function facetDef(id: BrowserFacet): BrowserFacetDef {
  return BROWSER_FACETS.find((facet) => facet.id === id) ?? BROWSER_FACETS[0];
}

export function isBrowserFacet(value: unknown): value is BrowserFacet {
  return BROWSER_FACETS.some((facet) => facet.id === value);
}

// a stored facet list, with anything unknown replaced by the default; a
// playlist column is swapped out while the source has no playlists
export function normalizeFacets(
  value: unknown,
  hasPlaylists = true,
): BrowserFacet[] {
  const list = Array.isArray(value) ? value : [];
  const defaults = hasPlaylists
    ? DEFAULT_BROWSER_FACETS
    : DEFAULT_BROWSER_FACETS_NO_PLAYLISTS;
  const facets = defaults.map((fallback, index) =>
    isBrowserFacet(list[index]) ? list[index] : fallback,
  );
  if (hasPlaylists) return facets;
  return facets.map((facet) =>
    facet === "playlist"
      ? ((["album_artist", "genre", "artist", "album"] as BrowserFacet[]).find(
          (candidate) => !facets.includes(candidate),
        ) ?? "genre")
      : facet,
  );
}
