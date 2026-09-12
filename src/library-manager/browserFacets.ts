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

export const BROWSER_FACETS_PREFERENCE_KEY = "libraryManager.browserFacets";

export function facetDef(id: BrowserFacet): BrowserFacetDef {
  return BROWSER_FACETS.find((facet) => facet.id === id) ?? BROWSER_FACETS[0];
}

export function isBrowserFacet(value: unknown): value is BrowserFacet {
  return BROWSER_FACETS.some((facet) => facet.id === value);
}

// a stored facet list, with anything unknown replaced by the default
export function normalizeFacets(value: unknown): BrowserFacet[] {
  const list = Array.isArray(value) ? value : [];
  return DEFAULT_BROWSER_FACETS.map((fallback, index) =>
    isBrowserFacet(list[index]) ? list[index] : fallback,
  );
}
