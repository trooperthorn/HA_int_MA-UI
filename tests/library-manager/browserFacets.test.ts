import {
  BROWSER_FACETS,
  DEFAULT_BROWSER_FACETS,
  facetDef,
  normalizeFacets,
} from "@/library-manager/browserFacets";
import { MediaType } from "@/plugins/api/interfaces";
import { describe, expect, it } from "vitest";

describe("browserFacets", () => {
  it("offers genre, artist, album artist, album and playlist", () => {
    expect(BROWSER_FACETS.map((facet) => facet.id)).toEqual([
      "genre",
      "artist",
      "album_artist",
      "album",
      "playlist",
    ]);
    expect(facetDef("playlist").mediaType).toBe(MediaType.PLAYLIST);
    expect(facetDef("genre").multiple).toBe(true);
  });

  it("falls back per column for anything stored that is not a facet", () => {
    expect(normalizeFacets(undefined)).toEqual(DEFAULT_BROWSER_FACETS);
    expect(normalizeFacets(["playlist"])).toEqual([
      "playlist",
      "artist",
      "album",
    ]);
    expect(normalizeFacets(["genre", "bogus", "album_artist"])).toEqual([
      "genre",
      "artist",
      "album_artist",
    ]);
  });
});
