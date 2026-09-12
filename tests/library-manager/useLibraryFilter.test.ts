import { useLibraryFilter } from "@/library-manager/composables/useLibraryFilter";
import { MediaType } from "@/plugins/api/interfaces";
import { describe, expect, it } from "vitest";

describe("useLibraryFilter", () => {
  it("starts on library tracks and merges the toolbar", () => {
    const { filter, toolbar } = useLibraryFilter();
    expect(filter.value).toMatchObject({
      scope: "library",
      mediaType: MediaType.TRACK,
      search: "",
      sortBy: "name",
      favoritesOnly: false,
    });
    toolbar.search = "x";
    toolbar.favoritesOnly = true;
    expect(filter.value.search).toBe("x");
    expect(filter.value.favoritesOnly).toBe(true);
  });

  it("replaces the node completely and lets a node override the sort", () => {
    const { filter, selectNode, toolbar } = useLibraryFilter();
    toolbar.sortBy = "duration";
    selectNode({
      scope: "library",
      node: "library.recently_added",
      mediaType: MediaType.TRACK,
      sortOverride: "timestamp_added_desc",
      filesToEdit: true,
    });
    expect(filter.value.sortBy).toBe("timestamp_added_desc");
    expect(filter.value.filesToEdit).toBe(true);

    selectNode({
      scope: "browse",
      node: "browse:spotify://",
      mediaType: MediaType.FOLDER,
      browsePath: "spotify://",
    });
    expect(filter.value.sortBy).toBe("duration");
    expect(filter.value.filesToEdit).toBeUndefined();
    expect(filter.value.browsePath).toBe("spotify://");
  });
});
