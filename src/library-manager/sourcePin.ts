import type { GridItem } from "./columns";

/**
 * Rows of a listing narrowed to one source, pinned to that source.
 *
 * The server resolves any uri to the full library item and then picks the
 * stream by quality, so a track that is on Spotify and on disk streams from
 * Spotify however it was found. Naming the source's own item in the row's
 * uri lets the server (with the app's play_source_steer patch) prefer that
 * source, and putting its mapping first makes the source column and the
 * selected pane describe the copy that will play. Everything else on the row
 * (the library id, favorite, metadata) stays as it is, so the row's other
 * actions keep addressing the library item.
 */
export function pinRowsToSource(
  rows: GridItem[],
  instance: string,
): GridItem[] {
  return rows.map((row) => {
    if (!row || !("provider_mappings" in row)) return row;
    const mappings = row.provider_mappings ?? [];
    const pinned = mappings.find(
      (mapping) => mapping.provider_instance === instance,
    );
    if (!pinned) return row;
    return {
      ...row,
      uri: `${instance}://${row.media_type}/${pinned.item_id}`,
      provider_mappings: [
        pinned,
        ...mappings.filter((mapping) => mapping !== pinned),
      ],
    } as GridItem;
  });
}
