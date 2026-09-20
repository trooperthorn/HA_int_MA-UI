import {
  DEFAULT_BUILD_OPTIONS,
  buildLibraryDataset,
  loadLibrary,
  type BuildOptions,
  type LibrarySource,
} from "@/map/buildDataset";
import type { Album, Artist, Playlist, Track } from "@/plugins/api/interfaces";
import { describe, expect, it, vi } from "vitest";

function artist(name: string, overrides: Partial<Artist> = {}): Artist {
  return {
    item_id: name,
    provider: "library",
    name,
    version: "",
    uri: `library://artist/${name}`,
    external_ids: [],
    is_playable: true,
    media_type: "artist",
    provider_mappings: [
      {
        item_id: name,
        provider_domain: "spotify",
        provider_instance: "spotify--1",
        available: true,
        in_library: true,
        audio_format: {} as never,
        details: null,
        url: null,
      },
    ],
    metadata: {} as never,
    favorite: false,
    artist_type: "artist",
    ...overrides,
  } as Artist;
}

function album(name: string, year: number | null, artists: Artist[]): Album {
  return {
    item_id: name,
    provider: "library",
    name,
    version: "",
    uri: `library://album/${name}`,
    external_ids: [],
    is_playable: true,
    media_type: "album",
    provider_mappings: [
      {
        item_id: name,
        provider_domain: "filesystem",
        provider_instance: "filesystem--1",
        available: true,
        in_library: true,
        audio_format: {} as never,
        details: null,
        url: null,
      },
    ],
    metadata: {} as never,
    favorite: false,
    year,
    artists,
    album_type: "album",
  } as Album;
}

function track(name: string, on: Album | null, artists: Artist[]): Track {
  return {
    item_id: name,
    provider: "library",
    name,
    version: "",
    uri: `library://track/${name}`,
    external_ids: [],
    is_playable: true,
    media_type: "track",
    provider_mappings: [],
    metadata: {} as never,
    favorite: false,
    duration: 180,
    artists,
    album: on,
    disc_number: 1,
    track_number: 1,
  } as Track;
}

function playlist(name: string): Playlist {
  return {
    item_id: name,
    provider: "library",
    name,
    version: "",
    uri: `library://playlist/${name}`,
    external_ids: [],
    is_playable: true,
    media_type: "playlist",
    provider_mappings: [],
    metadata: {} as never,
    favorite: false,
    owner: "sean",
    is_editable: true,
    supported_mediatypes: [],
    is_dynamic: false,
    access: null,
  } as Playlist;
}

const ada = artist("Ada");
const bo = artist("Bo");
const early = album("Early", 1974, [ada]);
const late = album("Late", 2021, [ada, bo]);
const undated = album("Undated", null, [bo]);

function build(options: Partial<BuildOptions> = {}) {
  const tracks = [track("One", late, [ada]), track("Orphan", null, [bo])];
  return buildLibraryDataset(
    {
      artists: [ada, bo],
      albums: [early, late, undated],
      tracks,
      playlists: [playlist("Mix")],
      playlistTracks: new Map([["library://playlist/Mix", [tracks[0]!]]]),
    },
    { ...DEFAULT_BUILD_OPTIONS, ...options },
  );
}

describe("buildLibraryDataset", () => {
  it("makes a node per library item and links albums to their artists", () => {
    const dataset = build();
    const ids = new Set(dataset.entities.map((entity) => entity.id));
    expect(ids.has("artist:library://artist/Ada")).toBe(true);
    expect(ids.has("album:library://album/Late")).toBe(true);
    expect(ids.has("playlist:library://playlist/Mix")).toBe(true);

    const albumArtist = dataset.relations.filter(
      (r) => r.kind === "album_artist",
    );
    // Early has one artist, Late has two, Undated has one.
    expect(albumArtist).toHaveLength(4);
  });

  it("treats artists as the anchors", () => {
    const dataset = build();
    const anchors = dataset.entities.filter((entity) => entity.emphasis);
    expect(anchors.every((entity) => entity.group === "artist")).toBe(true);
    expect(anchors).toHaveLength(2);
  });

  it("leaves tracks out unless asked for them", () => {
    expect(build().entities.some((entity) => entity.group === "track")).toBe(
      false,
    );
    const withTracks = build({ includeTracks: true });
    expect(
      withTracks.entities.filter((entity) => entity.group === "track"),
    ).toHaveLength(2);
    expect(withTracks.relations.some((r) => r.kind === "track_album")).toBe(
      true,
    );
    // A track with no album still reaches its artist directly.
    expect(withTracks.relations.some((r) => r.kind === "track_artist")).toBe(
      true,
    );
  });

  it("links playlists only to tracks that are on the map", () => {
    expect(build().relations.some((r) => r.kind === "playlist_track")).toBe(
      false,
    );
    const withTracks = build({ includeTracks: true });
    expect(
      withTracks.relations.filter((r) => r.kind === "playlist_track"),
    ).toHaveLength(1);
  });

  it("weights nodes by degree", () => {
    const dataset = build();
    const ada2 = dataset.entities.find(
      (e) => e.id === "artist:library://artist/Ada",
    )!;
    const degree = dataset.relations.filter(
      (r) => r.source === ada2.id || r.target === ada2.id,
    ).length;
    expect(ada2.weight).toBe(degree);
    expect(degree).toBeGreaterThan(0);
  });

  it("puts release years on the arc, one scope per decade, weighted by population", () => {
    const dataset = build();
    expect(dataset.scopes.map((scope) => scope.title)).toEqual([
      "1970s",
      "2020s",
    ]);
    expect(dataset.scopes.every((scope) => (scope.weight ?? 0) > 0)).toBe(true);

    const events = dataset.events.filter(
      (e) => e.entityId === "album:library://album/Early",
    );
    expect(events).toHaveLength(1);
    // 1974 sits four tenths through the 1970s.
    expect(events[0]!.scopeId).toBe("d1970");
    expect(events[0]!.t).toBeCloseTo(0.4, 5);

    // An undated album is a node but never an event: it has no place on a year axis.
    expect(
      dataset.entities.some((e) => e.id === "album:library://album/Undated"),
    ).toBe(true);
    expect(
      dataset.events.some(
        (e) => e.entityId === "album:library://album/Undated",
      ),
    ).toBe(false);
  });

  it("gives an artist an event for each of their albums so they land in their era", () => {
    const dataset = build();
    const adaEvents = dataset.events.filter(
      (e) => e.entityId === "artist:library://artist/Ada",
    );
    expect(adaEvents.map((e) => e.scopeId).sort()).toEqual(["d1970", "d2020"]);
  });

  it("collapses provider mappings into one node per provider", () => {
    const dataset = build();
    const providers = dataset.entities.filter(
      (entity) => entity.group === "provider",
    );
    expect(providers.map((p) => p.name).sort()).toEqual([
      "filesystem",
      "spotify",
    ]);
    expect(dataset.relations.some((r) => r.kind === "item_provider")).toBe(
      true,
    );

    const without = build({ includeProviders: false });
    expect(without.entities.some((entity) => entity.group === "provider")).toBe(
      false,
    );
  });
});

describe("loadLibrary", () => {
  it("asks for one listing per media type and skips what is switched off", async () => {
    const api: LibrarySource = {
      getLibraryArtists: vi.fn().mockResolvedValue([ada]),
      getLibraryAlbums: vi.fn().mockResolvedValue([early]),
      getLibraryTracks: vi.fn().mockResolvedValue([]),
      getLibraryPlaylists: vi.fn().mockResolvedValue([]),
      getPlaylistTracks: vi.fn().mockResolvedValue([]),
    };
    const dataset = await loadLibrary(api, {
      ...DEFAULT_BUILD_OPTIONS,
      limit: 42,
      includeTracks: false,
      includePlaylists: false,
    });

    expect(api.getLibraryArtists).toHaveBeenCalledWith(
      undefined,
      undefined,
      42,
    );
    expect(api.getLibraryTracks).not.toHaveBeenCalled();
    expect(api.getLibraryPlaylists).not.toHaveBeenCalled();
    expect(api.getPlaylistTracks).not.toHaveBeenCalled();
    expect(
      dataset.entities.some(
        (entity) => entity.id === "artist:library://artist/Ada",
      ),
    ).toBe(true);
  });

  it("survives a listing that fails", async () => {
    const api: LibrarySource = {
      getLibraryArtists: vi.fn().mockRejectedValue(new Error("nope")),
      getLibraryAlbums: vi.fn().mockResolvedValue([early]),
      getLibraryTracks: vi.fn().mockResolvedValue([]),
      getLibraryPlaylists: vi.fn().mockResolvedValue([]),
      getPlaylistTracks: vi.fn().mockResolvedValue([]),
    };
    const dataset = await loadLibrary(api, {
      ...DEFAULT_BUILD_OPTIONS,
      includePlaylists: false,
    });
    // The album still contributes its artist, so the map is not empty.
    expect(dataset.entities.some((entity) => entity.group === "artist")).toBe(
      true,
    );
  });
});
