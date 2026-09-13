import { computed, reactive } from "vue";
import { MediaType } from "@/plugins/api/interfaces";
import type { BrowserFacet } from "../browserFacets";

// issues: the files the sync tasks could not import cleanly
export type FilterScope = "library" | "browse" | "issues";

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
  // issues scope: one kind of failure ("missing_tag:albumartist"); all when unset
  issueType?: string;
  // a listing node (Artists, Albums, ...) puts its facet in the browser's
  // first column; the grid keeps listing tracks
  leadFacet?: BrowserFacet;
}

// what the browser strip has picked
export interface BrowserPicks {
  genres: GenreRef[];
  artist?: ItemRef;
  album?: ItemRef;
  playlist?: ItemRef;
}

export interface LibraryFilter extends NodeFilter {
  search: string;
  sortBy: string;
  favoritesOnly: boolean;
  genreIds?: number[];
  // narrow tracks (and albums) to one artist, or tracks to one album or
  // playlist
  artist?: ItemRef;
  album?: ItemRef;
  playlist?: ItemRef;
}

export const LIBRARY_TRACKS_NODE: NodeFilter = {
  scope: "library",
  node: "library.tracks",
  mediaType: MediaType.TRACK,
};

// the library nodes the "g" chords jump to; ids match the source tree's
export const LIBRARY_NODES: Readonly<
  Record<"library" | "artists" | "albums" | "genres" | "playlists", NodeFilter>
> = {
  library: { scope: "library", node: "library", mediaType: MediaType.TRACK },
  artists: {
    scope: "library",
    node: "library.artists",
    mediaType: MediaType.ARTIST,
  },
  albums: {
    scope: "library",
    node: "library.albums",
    mediaType: MediaType.ALBUM,
  },
  genres: {
    scope: "library",
    node: "library.genres",
    mediaType: MediaType.GENRE,
  },
  playlists: {
    scope: "library",
    node: "library.playlists",
    mediaType: MediaType.PLAYLIST,
  },
};

export function useLibraryFilter() {
  const node = reactive<NodeFilter>({ ...LIBRARY_TRACKS_NODE });
  const toolbar = reactive({
    search: "",
    sortBy: "name",
    favoritesOnly: false,
  });
  const browser = reactive<BrowserPicks>({
    genres: [],
    artist: undefined,
    album: undefined,
    playlist: undefined,
  });

  function selectNode(next: NodeFilter) {
    for (const key of Object.keys(node) as Array<keyof NodeFilter>) {
      delete node[key];
    }
    Object.assign(node, next);
  }

  // the strip decides what a pick invalidates (the columns to its right);
  // these only set one facet each
  function setGenres(genres: GenreRef[]) {
    browser.genres = genres;
  }

  function setArtist(artist: ItemRef | undefined) {
    browser.artist = artist;
  }

  function setAlbum(album: ItemRef | undefined) {
    browser.album = album;
  }

  function setPlaylist(playlist: ItemRef | undefined) {
    browser.playlist = playlist;
  }

  function setPicks(picks: BrowserPicks) {
    browser.genres = picks.genres;
    browser.artist = picks.artist;
    browser.album = picks.album;
    browser.playlist = picks.playlist;
  }

  function clearBrowser() {
    setPicks({ genres: [] });
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
      playlist: isTracks ? browser.playlist : undefined,
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
    setPlaylist,
    setPicks,
    clearBrowser,
  };
}
