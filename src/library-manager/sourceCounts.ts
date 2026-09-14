import { api } from "@/plugins/api";
import { MediaType } from "@/plugins/api/interfaces";

// The count endpoints know only the favorites and album-artists filters, so a
// per-source count has to come from the listings themselves. Fetching one
// item at an offset says whether the listing reaches that far; a binary
// search over the offset finds the length in about log2(n) single-item
// requests, which for a twenty-thousand-track library is fifteen.

export type CountableKey =
  | "tracks"
  | "artists"
  | "album_artists"
  | "albums"
  | "playlists";

export const COUNTABLE_MEDIA_TYPE: Readonly<Record<CountableKey, MediaType>> = {
  tracks: MediaType.TRACK,
  artists: MediaType.ARTIST,
  album_artists: MediaType.ARTIST,
  albums: MediaType.ALBUM,
  playlists: MediaType.PLAYLIST,
};

async function reaches(
  key: CountableKey,
  provider: string,
  offset: number,
): Promise<boolean> {
  let items: unknown[];
  switch (key) {
    case "artists":
    case "album_artists":
      items = await api.getLibraryArtists(
        undefined,
        undefined,
        1,
        offset,
        undefined,
        key === "album_artists" || undefined,
        provider,
      );
      break;
    case "albums":
      items = await api.getLibraryAlbums(
        undefined,
        undefined,
        1,
        offset,
        undefined,
        undefined,
        provider,
      );
      break;
    case "playlists":
      items = await api.getLibraryPlaylists(
        undefined,
        undefined,
        1,
        offset,
        undefined,
        provider,
      );
      break;
    default:
      items = await api.getLibraryTracks(
        undefined,
        undefined,
        1,
        offset,
        undefined,
        provider,
      );
  }
  return items.length > 0;
}

/**
 * Number of library items of one kind that a provider instance holds.
 * `upper` is a known bound (the whole library's count); without one the
 * search first doubles the offset until the listing runs out.
 */
export async function countSourceItems(
  key: CountableKey,
  provider: string,
  upper?: number,
): Promise<number> {
  if (!(await reaches(key, provider, 0))) return 0;
  let hi: number;
  if (upper !== undefined && upper >= 0) {
    hi = upper + 1;
  } else {
    hi = 1;
    while (await reaches(key, provider, hi)) hi *= 2;
    hi += 1;
  }
  // invariant: the listing reaches lo - 1 and does not reach hi
  let lo = 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await reaches(key, provider, mid)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
