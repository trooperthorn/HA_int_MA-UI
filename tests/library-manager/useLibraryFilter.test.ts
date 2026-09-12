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

  it("applies the strip's picks to tracks only and clears them together", () => {
    const { filter, setPicks, selectNode, clearBrowser } = useLibraryFilter();
    const playlist = { item_id: "p1", provider: "spotify--1", name: "Mix" };
    const artist = { item_id: "a1", provider: "library", name: "Muse" };
    setPicks({ genres: [{ id: 7, name: "Rock" }], artist, playlist });
    expect(filter.value).toMatchObject({
      genreIds: [7],
      artist,
      playlist,
    });

    selectNode({
      scope: "library",
      node: "library.albums",
      mediaType: MediaType.ALBUM,
    });
    expect(filter.value.artist).toEqual(artist);
    expect(filter.value.playlist).toBeUndefined();

    clearBrowser();
    expect(filter.value.genreIds).toBeUndefined();
    expect(filter.value.artist).toBeUndefined();
  });
});
