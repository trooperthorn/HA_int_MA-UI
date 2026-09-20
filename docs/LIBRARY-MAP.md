# Library map

The page at `/map` draws the library as a graph: who made what, what it sits on, where it
came from, and when it was released. It is the third tool built on one shared graph engine,
alongside the SolarWinds entity map and the Home Assistant SOC panel's Entity Map tab.

`/flow` answers "where is the music going right now". This answers "what is in here, and how
does it fit together".

## The model

Artists are the main entity, in the same sense that `Orion.Nodes` anchors the SolarWinds map
and devices anchor the Home Assistant one: everything else exists because an artist made it.
Artists are pinned at the centre of the relationship view and everything arranges around them.

| Node group | Source |
| --- | --- |
| Artists | `music/artists/library_items`, plus any artist named by an album or track |
| Albums | `music/albums/library_items` |
| Tracks | `music/tracks/library_items`, off by default |
| Playlists | `music/playlists/library_items` |
| Providers | the distinct `provider_domain` values across every item's `provider_mappings` |

| Edge kind | Source |
| --- | --- |
| Album by artist | `album.artists` |
| Track on album | `track.album` |
| Track by artist | `track.artists`, drawn only when the track has no album to reach it through |
| Playlist contains track | `music/playlists/playlist_tracks`, opt-in |
| Provided by | `provider_mappings[].provider_domain` |

Node size is degree within the currently shown edge kinds, so hiding a kind in the legend
shrinks the nodes that depended on it.

### Why this is cheap

An album listing already carries its artists, and a track listing already carries its artists
and its album. So artists, albums, tracks and providers cost **one listing call each**, not
one call per item: four websocket commands build the whole graph. Playlist membership is the
one exception, because it needs `getPlaylistTracks` per playlist, which is why it is opt-in
and runs sequentially rather than opening hundreds of commands at once.

## The two views

**Library web** is the force layout, artists pinned at the centre. Clicking a node dims
everything that is not a neighbour and opens a panel with the item's metadata and its links,
each of which walks to the other end.

**By era** is the arc. Release year is the one real ordering a library carries, so the band
runs from the oldest decade present to the newest, one scope per decade, weighted by how many
releases each decade holds. Each dot is one release at its year within its decade, and each
artist gets a dot for every album they made, so an artist lands in their era and one whose
catalogue spans forty years floats away from the band while a one-album act sits on it.

Items with no year are drawn as nodes but never as events: they have no place on a year axis.

## Controls

Items per type (100 to 1000), include tracks, node size, labels, fit, export PNG, and the
view switch. The item cap exists because the picture stops being readable long before a real
library runs out of rows.

## The engine

`src/vendor/graph-core/` is vendored from
[trooperthorn/relationship-maps](https://github.com/trooperthorn/relationship-maps)
`packages/graph-core`, the framework-neutral half only: model, layouts, canvas renderer.
`src/vendor/graph-core/VENDOR.md` says how to refresh it. `src/map/MapView.vue` drives it
from Vue; `src/map/buildDataset.ts` is the whole Music Assistant adapter.

The arc maps the ordered axis to an angle, `theta = pi - u * pi`, and places each node at the
circular mean of its own events, pushed outward in proportion to how scattered they are. The
full explanation is in the upstream README.

## Verification status

`tests/map/buildDataset.test.ts` covers node and edge construction for every edge kind, the
anchor rule, tracks and playlists being opt-in, degree weights, decade scopes and their
population weighting, the year-to-arc-position mapping, undated items being excluded from the
arc, provider collapsing, the call pattern of `loadLibrary`, and a failing listing not taking
the whole map down. Ten tests, all passing, alongside typecheck, oxlint, eslint, prettier and
a full `pnpm build`.

Not yet opened against the live server at 192.168.30.3:8095. The first open is the real test,
and the thing most likely to need tuning there is the default item cap on a large library.

## Limits

- Genres are not drawn. They are available per item and would make a natural sixth group.
- There is no play history on the arc: Music Assistant's library items carry no played-at
  timestamp, and `music/recently_played_items` returns item mappings without times. Release
  year is the honest axis until a timestamped play log is available.
- Layout is synchronous. At the 1000-item cap with tracks on, the first layout takes a
  visible moment; beyond that it wants a worker.
- The PNG export writes the canvas only, without the toolbar and legend.
