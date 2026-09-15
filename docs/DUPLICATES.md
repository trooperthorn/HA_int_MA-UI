# Duplicates

Settings, User Interface, **Duplicates** (`/settings/frontend/duplicates`).
The page reads the whole library (the track listing, 500 at a time) and the
sync task log, and reports what is held more than once.

## Kinds

- **Several copies**: one library track with two or more file copies. The
  import merged them (same MusicBrainz recording, ISRC, or a normalized
  name match). Each copy shows its source, path, format and tag score.
- **Identical files**: byte-identical files (the filesystem provider's
  checksum) filed under different tracks.
- **Probably the same**: two library tracks with the same normalized name
  and first artist whose durations lie within 8 s (the server's own
  tolerance) or that share an ISRC or MusicBrainz recording id. The import
  did not merge them, usually because of a tag difference. Review only.
- **Orphaned CUE sheets**: `.cue` files whose audio image is gone, from the
  sync log line "Audio file not found for CUE sheet". The per-track files
  import normally; only the sheet is clutter.

Streaming copies (Spotify and the like) are shown for information and never
offered for removal.

## Ranking

Lossless beats lossy; within lossless higher bit depth then sample rate;
within lossy higher bit rate, AAC and Opus ahead of MP3 at equal rate. Ties
go to the copy with the more complete tags (album, track number, year, a
MusicBrainz id or ISRC, a cover, as far as the listing shows them), then to
the older library row. The winner is marked **keep**.

## Actions

- **Remove from library** on a lesser copy drops that provider mapping
  (`music/remove_provider_mapping`); the server deletes the track row when
  it was the last mapping. The file stays on disk.
- **Select every lesser copy**, then **Remove selected**: the same, in bulk,
  behind a confirmation. Only the first two kinds take part.
- **Merge into kept** on a probable pair attaches the other rows' mappings
  to the kept track (`music/add_provider_mapping`) and removes the other
  track rows, which is what the import would have done.
- **Remove track** on a probable row removes that library track outright.
- **Export CSV** writes the visible groups and sheets with their paths.

## The trash

With the app's `music/trash/*` commands (ha_app_music_assistant's
`music_trash` patch) the page also moves files. **Move to trash** on a
lesser copy removes its mapping from the library and renames the file into
`.music-assistant-trash/` at the root of that source's folder, keeping its
relative path; **Move selected to trash** does the same in bulk behind a
confirmation, and orphaned CUE sheets get the same action one by one or
all at once. The move is a rename on the same drive: nothing is copied and
no space is used, and the sync skips the dot folder. A trash section per
file source lists what it holds with **Restore** (the file goes back where
it came from and the next sync imports it again; refused when that path is
taken) and **Empty trash**, the only action that deletes anything, behind
its own confirmation.

A server without the commands (an older app image, or upstream) hides every
trash action; the CSV still names the files for cleaning by hand.

Code: `src/library-manager/duplicates.ts` (grouping, ranking, CSV, trash
listing) and `src/views/settings/Duplicates.vue`.
