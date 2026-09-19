import { shallowRef } from "vue";
import type { GridItem } from "../columns";
import type { ItemRef } from "./useLibraryFilter";

export interface BrowseTrackContext {
  artist?: ItemRef;
  album?: ItemRef;
  rows: GridItem[];
}

// Published by LibraryManagerView whenever the bottom TrackGrid is showing
// the library's Track listing narrowed to a single artist or album. A
// double-click on that same artist/album in the browser strip's columns
// (BrowserColumn.vue) reads this to start playback in the order actually
// shown in the table below, instead of asking the server to decide (which,
// for artists, hits a known backend ordering bug — out of scope here).
export const browseTrackContext = shallowRef<BrowseTrackContext | undefined>(
  undefined,
);
