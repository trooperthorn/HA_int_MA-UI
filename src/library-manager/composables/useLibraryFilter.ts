import { computed, reactive } from "vue";
import { MediaType } from "@/plugins/api/interfaces";

export type FilterScope = "library" | "browse";

// what a tree node contributes to the listing; search, sort and favorites
// come from the toolbar and are merged in by the view
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
  genreIds?: number[];
}

export interface LibraryFilter extends NodeFilter {
  search: string;
  sortBy: string;
  favoritesOnly: boolean;
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

  function selectNode(next: NodeFilter) {
    for (const key of Object.keys(node) as Array<keyof NodeFilter>) {
      delete node[key];
    }
    Object.assign(node, next);
  }

  const filter = computed<LibraryFilter>(() => ({
    ...node,
    search: toolbar.search,
    sortBy: node.sortOverride ?? toolbar.sortBy,
    favoritesOnly: toolbar.favoritesOnly,
  }));

  return { node, toolbar, filter, selectNode };
}
