import type {
  Album,
  Artist,
  ItemMapping,
  Playlist,
  Track,
} from "@/plugins/api/interfaces";
import type {
  Category,
  Dataset,
  GraphEntity,
  GraphEvent,
  GraphRelation,
  GraphScope,
} from "@/vendor/graph-core/types";

/**
 * Library map: the shape of a music library as a graph.
 *
 * Artists are the main entity, in the same sense that Orion.Nodes anchors the SolarWinds
 * map and devices anchor the Home Assistant one: albums, tracks and playlists exist here
 * because an artist made them.
 *
 * Every edge comes out of the library listings themselves. An album already carries its
 * artists and a track already carries its artists and album, so artists, albums, tracks and
 * providers cost one listing call each rather than one call per item. Playlist membership is
 * the exception: it needs a call per playlist, so it is opt-in.
 */

export const GROUPS: Category[] = [
  { id: "artist", label: "Artists", color: "#4c9ffe", lane: 0 },
  { id: "album", label: "Albums", color: "#3ddc84", lane: 1 },
  { id: "track", label: "Tracks", color: "#f3d04e", lane: 2 },
  { id: "playlist", label: "Playlists", color: "#b45cf0", lane: 3 },
  { id: "provider", label: "Providers", color: "#ff7a5c", lane: 4 },
];

export const KINDS: Category[] = [
  { id: "album_artist", label: "Album by artist", color: "#4c9ffe" },
  { id: "track_album", label: "Track on album", color: "#3ddc84" },
  { id: "track_artist", label: "Track by artist", color: "#5ec8e5" },
  { id: "playlist_track", label: "Playlist contains track", color: "#b45cf0" },
  { id: "item_provider", label: "Provided by", color: "#ff7a5c" },
];

/** What the caller hands in; mirrors the MA api client without importing it. */
export interface LibrarySource {
  getLibraryArtists(...args: unknown[]): Promise<Artist[]>;
  getLibraryAlbums(...args: unknown[]): Promise<Album[]>;
  getLibraryTracks(...args: unknown[]): Promise<Track[]>;
  getLibraryPlaylists(...args: unknown[]): Promise<Playlist[]>;
  getPlaylistTracks(
    item_id: string,
    provider: string,
    force_refresh?: boolean,
  ): Promise<Track[]>;
}

export interface BuildOptions {
  /** Cap per media type. The map stops being readable long before a big library runs out. */
  limit: number;
  includeTracks: boolean;
  includePlaylists: boolean;
  /** Resolve playlist membership, one call per playlist. */
  resolvePlaylistTracks: boolean;
  /** Draw an edge to the provider each item came from. */
  includeProviders: boolean;
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = {
  limit: 500,
  includeTracks: false,
  includePlaylists: true,
  resolvePlaylistTracks: false,
  includeProviders: true,
};

const artistId = (uri: string) => `artist:${uri}`;
const albumId = (uri: string) => `album:${uri}`;
const trackId = (uri: string) => `track:${uri}`;
const playlistId = (uri: string) => `playlist:${uri}`;
const providerId = (domain: string) => `provider:${domain}`;

const yearOf = (item: Album | Track): number | null => {
  if ("year" in item && typeof item.year === "number" && item.year > 0)
    return item.year;
  const album = (item as Track).album;
  if (
    album &&
    "year" in album &&
    typeof album.year === "number" &&
    album.year > 0
  ) {
    return album.year;
  }
  return null;
};

const decadeOf = (year: number) => Math.floor(year / 10) * 10;

export function buildLibraryDataset(
  data: {
    artists: Artist[];
    albums: Album[];
    tracks: Track[];
    playlists: Playlist[];
    playlistTracks: Map<string, Track[]>;
  },
  options: BuildOptions = DEFAULT_BUILD_OPTIONS,
): Dataset {
  const entities: GraphEntity[] = [];
  const relations: GraphRelation[] = [];
  const seen = new Set<string>();
  const add = (entity: GraphEntity) => {
    if (seen.has(entity.id)) return;
    seen.add(entity.id);
    entities.push(entity);
  };
  const link = (
    id: string,
    source: string,
    target: string,
    kind: string,
    label: string,
  ) => {
    if (!seen.has(source) || !seen.has(target) || source === target) return;
    relations.push({ id, source, target, kind, label });
  };

  const providers = new Map<string, number>();
  const noteProviders = (item: {
    provider_mappings?: { provider_domain: string }[];
  }) => {
    const domains = new Set(
      (item.provider_mappings ?? []).map((mapping) => mapping.provider_domain),
    );
    for (const domain of domains)
      providers.set(domain, (providers.get(domain) ?? 0) + 1);
    return domains;
  };

  for (const artist of data.artists) {
    add({
      id: artistId(artist.uri),
      name: artist.name,
      group: "artist",
      kind: artist.artist_type ?? "Artist",
      weight: 0,
      emphasis: true,
      meta: {
        Provider: artist.provider,
        Favorite: artist.favorite ? "yes" : "no",
      },
    });
  }

  for (const album of data.albums) {
    const year = yearOf(album);
    add({
      id: albumId(album.uri),
      name: album.name,
      group: "album",
      kind: album.album_type ?? "Album",
      weight: 0,
      meta: {
        Year: year ?? "unknown",
        Artists: album.artists.map((a) => a.name).join(", "),
        Provider: album.provider,
      },
    });
    for (const artist of album.artists as Array<ItemMapping | Artist>) {
      // An album's artist may be outside the loaded artist page; add it so the edge means
      // something rather than silently disappearing.
      add({
        id: artistId(artist.uri),
        name: artist.name,
        group: "artist",
        kind: "Artist",
        weight: 0,
        emphasis: true,
        meta: { Provider: artist.provider },
      });
      link(
        `aa:${album.uri}:${artist.uri}`,
        artistId(artist.uri),
        albumId(album.uri),
        "album_artist",
        "Album",
      );
    }
  }

  if (options.includeTracks) {
    for (const track of data.tracks) {
      add({
        id: trackId(track.uri),
        name: track.name,
        group: "track",
        kind: "Track",
        weight: 0,
        meta: {
          Year: yearOf(track) ?? "unknown",
          Album: track.album?.name ?? "none",
          Artists: track.artists.map((a) => a.name).join(", "),
        },
      });
      if (track.album) {
        add({
          id: albumId(track.album.uri),
          name: track.album.name,
          group: "album",
          kind: "Album",
          weight: 0,
          meta: { Provider: track.album.provider },
        });
        link(
          `ta:${track.uri}`,
          albumId(track.album.uri),
          trackId(track.uri),
          "track_album",
          "Track",
        );
      }
      for (const artist of track.artists) {
        add({
          id: artistId(artist.uri),
          name: artist.name,
          group: "artist",
          kind: "Artist",
          weight: 0,
          emphasis: true,
          meta: { Provider: artist.provider },
        });
        // Only worth drawing when the track is not already reachable through its album.
        if (!track.album) {
          link(
            `tar:${track.uri}:${artist.uri}`,
            artistId(artist.uri),
            trackId(track.uri),
            "track_artist",
            "Track",
          );
        }
      }
    }
  }

  if (options.includePlaylists) {
    for (const playlist of data.playlists) {
      add({
        id: playlistId(playlist.uri),
        name: playlist.name,
        group: "playlist",
        kind: playlist.is_dynamic ? "Dynamic playlist" : "Playlist",
        weight: 0,
        meta: { Owner: playlist.owner, Provider: playlist.provider },
      });
      for (const track of data.playlistTracks.get(playlist.uri) ?? []) {
        if (!seen.has(trackId(track.uri))) continue;
        link(
          `pt:${playlist.uri}:${track.uri}`,
          playlistId(playlist.uri),
          trackId(track.uri),
          "playlist_track",
          "Contains",
        );
      }
    }
  }

  if (options.includeProviders) {
    const items: Array<{
      id: string;
      item: { provider_mappings?: { provider_domain: string }[] };
    }> = [
      ...data.artists.map((a) => ({ id: artistId(a.uri), item: a })),
      ...data.albums.map((a) => ({ id: albumId(a.uri), item: a })),
      ...(options.includeTracks
        ? data.tracks.map((t) => ({ id: trackId(t.uri), item: t }))
        : []),
      ...(options.includePlaylists
        ? data.playlists.map((p) => ({ id: playlistId(p.uri), item: p }))
        : []),
    ];
    for (const { item } of items) noteProviders(item);
    for (const domain of providers.keys()) {
      add({
        id: providerId(domain),
        name: domain,
        group: "provider",
        kind: "Provider",
        weight: 0,
        meta: { Items: providers.get(domain) ?? 0 },
      });
    }
    for (const { id, item } of items) {
      for (const domain of noteProviders(item)) {
        link(
          `ip:${id}:${domain}`,
          id,
          providerId(domain),
          "item_provider",
          "Provider",
        );
      }
    }
  }

  const degree = new Map<string, number>();
  for (const relation of relations) {
    degree.set(relation.source, (degree.get(relation.source) ?? 0) + 1);
    degree.set(relation.target, (degree.get(relation.target) ?? 0) + 1);
  }
  for (const entity of entities) entity.weight = degree.get(entity.id) ?? 0;

  // The arc axis is release year, the one real ordering a library carries. Scopes are the
  // decades present, so an artist whose catalogue spans forty years floats away from the
  // band while a one-album act sits on it.
  const dated: Array<{ id: string; year: number }> = [];
  for (const album of data.albums) {
    const year = yearOf(album);
    if (year) dated.push({ id: albumId(album.uri), year });
  }
  if (options.includeTracks) {
    for (const track of data.tracks) {
      const year = yearOf(track);
      if (year) dated.push({ id: trackId(track.uri), year });
    }
  }
  // Give each artist the years of their own albums, so artists sit in their era.
  for (const album of data.albums) {
    const year = yearOf(album);
    if (!year) continue;
    for (const artist of album.artists) {
      if (seen.has(artistId(artist.uri)))
        dated.push({ id: artistId(artist.uri), year });
    }
  }

  const decades = [...new Set(dated.map((d) => decadeOf(d.year)))].sort(
    (a, b) => a - b,
  );
  const counts = new Map<number, number>();
  for (const d of dated) {
    const decade = decadeOf(d.year);
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  const scopes: GraphScope[] = decades.map((decade, index) => ({
    id: `d${decade}`,
    title: `${decade}s`,
    ordinal: index + 1,
    subtitle: `${counts.get(decade) ?? 0} releases`,
    // A decade holding three records should not claim the same arc as one holding four
    // hundred; the floor keeps a sparse decade visible.
    weight: Math.max(0.35, counts.get(decade) ?? 0),
  }));

  const events: GraphEvent[] = dated.map((d, index) => ({
    id: `y${index}`,
    scopeId: `d${decadeOf(d.year)}`,
    entityId: d.id,
    t: (d.year - decadeOf(d.year)) / 10,
  }));

  const count = (group: string) =>
    entities.filter((e) => e.group === group).length;
  const oldest = decades[0];
  const newest = decades[decades.length - 1];

  return {
    title: "Library map",
    subtitle:
      `${count("artist")} artists, ${count("album")} albums` +
      (options.includeTracks ? `, ${count("track")} tracks` : "") +
      `, ${relations.length} links`,
    groups: GROUPS,
    relationKinds: KINDS,
    scopes,
    entities,
    relations,
    events,
    axis: {
      start: oldest === undefined ? "Oldest" : `${oldest}s`,
      middle: "",
      end: newest === undefined ? "Newest" : `${newest}s`,
    },
    scopeNoun: ["decade", "decades"],
    viewLabels: { arc: "By era", web: "Library web" },
    arcHint:
      "By era: the band runs from the oldest decade in your library to the newest, and each " +
      "dot is one release. An artist whose catalogue spans decades floats away from the band.",
    webHint:
      "Library web: artists are pinned at the centre, with their albums, tracks, playlists " +
      "and providers arranged around them.",
  };
}

/** Fetch exactly what the map needs, in as few calls as the API allows. */
export async function loadLibrary(
  api: LibrarySource,
  options: BuildOptions = DEFAULT_BUILD_OPTIONS,
): Promise<Dataset> {
  const [artists, albums, tracks, playlists] = await Promise.all([
    api
      .getLibraryArtists(undefined, undefined, options.limit)
      .catch(() => [] as Artist[]),
    api
      .getLibraryAlbums(undefined, undefined, options.limit)
      .catch(() => [] as Album[]),
    options.includeTracks
      ? api
          .getLibraryTracks(undefined, undefined, options.limit)
          .catch(() => [] as Track[])
      : Promise.resolve([] as Track[]),
    options.includePlaylists
      ? api
          .getLibraryPlaylists(undefined, undefined, options.limit)
          .catch(() => [] as Playlist[])
      : Promise.resolve([] as Playlist[]),
  ]);

  const playlistTracks = new Map<string, Track[]>();
  if (
    options.includePlaylists &&
    options.resolvePlaylistTracks &&
    options.includeTracks
  ) {
    // One call per playlist: opt-in, and sequential so a large library does not open
    // hundreds of websocket commands at once.
    for (const playlist of playlists) {
      try {
        playlistTracks.set(
          playlist.uri,
          await api.getPlaylistTracks(playlist.item_id, playlist.provider),
        );
      } catch {
        playlistTracks.set(playlist.uri, []);
      }
    }
  }

  return buildLibraryDataset(
    { artists, albums, tracks, playlists, playlistTracks },
    options,
  );
}
