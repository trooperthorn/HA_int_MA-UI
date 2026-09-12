import { computed, reactive } from "vue";
import { MediaType } from "@/plugins/api/interfaces";

export type FilterScope = "library" | "browse";

// a library item the browser strip narrowed the listing to
export interface ItemRef {
  item_id: string;
  provider: string;
  name: string;
}

export interface GenreRef {
  id: number;
  name: string;
}

// what a tree node contributes to the listing; search, sort and favorites
// come from the toolbar and the browser strip's picks are merged in by the
// view
export interface NodeFilter {
  scope: FilterScope;
  // tree node id, so the tree can show which node the grid is listing
  node: string;
  mediaType: MediaType;
  // browse scope: the provider path handed to api.browse
  browsePath?: string;
  provider?: string[];
  albumArtistsOnly?: boolean;
  // library tracks with no album, album artist or year
  filesToEdit?: boolean;
  // forces a sort the node implies (Recently added), ignoring the grid's
  sortOverride?: string;
}

export interface LibraryFilter extends NodeFilter {
  search: string;
  sortBy: string;
  favoritesOnly: boolean;
  genreIds?: number[];
  // narrow tracks (and albums) to one artist, or tracks to one album
  artist?: ItemRef;
  album?: ItemRef;
}

export const LIBRARY_TRACKS_NODE: NodeFilter = {
  scope: "library",
  node: "library.tracks",
  mediaType: MediaType.TRACK,
};

export function useLibraryFilter() {
  const node = reactive<NodeFilter>({ ...LIBRARY_TRACKS_NODE });
  const toolbar = reactive({
    search: "",
    sortBy: "name",
    favoritesOnly: false,
  });
  const browser = reactive<{
    genres: GenreRef[];
    artist?: ItemRef;
    album?: ItemRef;
  }>({ genres: [], artist: undefined, album: undefined });

  function selectNode(next: NodeFilter) {
    for (const key of Object.keys(node) as Array<keyof NodeFilter>) {
      delete node[key];
    }
    Object.assign(node, next);
  }

  function setGenres(genres: GenreRef[]) {
    browser.genres = genres;
    // a narrower genre pick invalidates the artist and album under it
    browser.artist = undefined;
    browser.album = undefined;
  }

  function setArtist(artist: ItemRef | undefined) {
    browser.artist = artist;
    browser.album = undefined;
  }

  function setAlbum(album: ItemRef | undefined) {
    browser.album = album;
  }

  function clearBrowser() {
    browser.genres = [];
    browser.artist = undefined;
    browser.album = undefined;
  }

  const filter = computed<LibraryFilter>(() => {
    const isLibrary = node.scope === "library";
    const isTracks = isLibrary && node.mediaType === MediaType.TRACK;
    const isAlbums = isLibrary && node.mediaType === MediaType.ALBUM;
    return {
      ...node,
      search: toolbar.search,
      sortBy: node.sortOverride ?? toolbar.sortBy,
      favoritesOnly: toolbar.favoritesOnly,
      genreIds:
        isLibrary && browser.genres.length > 0
          ? browser.genres.map((genre) => genre.id)
          : undefined,
      artist: isTracks || isAlbums ? browser.artist : undefined,
      album: isTracks ? browser.album : undefined,
    };
  });

  return {
    node,
    toolbar,
    browser,
    filter,
    selectNode,
    setGenres,
    setArtist,
    setAlbum,
    clearBrowser,
  };
}
