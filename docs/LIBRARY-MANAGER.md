# Library manager

The library manager is a desktop view for large local collections. It
lives at `/library` ("Music Library" in the navigation) and replaces the
tile grids and one-facet filters with the layout of a desktop music
manager: a source tree on the left, a genre / artist / album browser
above a dense sortable track list in the middle, and the Now Playing
queue over a selected-item panel on the right. Below the `md`
breakpoint (phones) the route redirects to the regular track list.

Everything the manager remembers (pane sizes, which panes are shown,
columns, density, sort, browser columns, open tree branches) is stored
with the user's profile, so it follows the user between browsers.

## Panes

```
┌────────────┬──────────────────────────────────┬──────────────┐
│ toolbar: tree · strip · queue · selected · search · favorites  │
├────────────┼──────────────────────────────────┼──────────────┤
│ Source     │ Genre     │ Artist    │ Album    │ Now playing  │
│ tree       ├──────────────────────────────────┤ (queue)      │
│            │ chips: Genre Rock × · Artist … × ├──────────────┤
│            │ #  Title  Artist  Album  Year …  │ Selected     │
│            │ …                                │ (details +   │
│            │                                  │  icon bar)   │
└────────────┴──────────────────────────────────┴──────────────┘
```

Every divider is a drag handle. The toolbar has a toggle for each pane;
the browser strip only shows for library listings (it has nothing to
narrow in a browsed folder).

### Source tree

- **Now playing** opens the player's queue.
- **Library (all sources)** lists every track, with children in this
  order: Playlists, Artists, Album artists, Genres, Albums, Recently
  added, Files to edit. Counts come from the server and refresh after a
  library sync. *Files to edit* lists tracks without an album, album
  artist or year, walking the library sequentially.
- **Sources** has one node per music provider. A music source offers the
  same five listings, narrowed to that provider; clicking the source
  itself lists its tracks and the browser strip narrows to it too.
  Providers with folder trees (filesystem) keep their folders after the
  listings. A node whose load turns up nothing loses its chevron.
- **Players** opens the player picker.

Note that genres are library-wide on the server (they have no provider
mapping), so a source's Genres node lists the whole taxonomy; picking one
still narrows that source's artists, albums and tracks. There is no
per-provider count endpoint, so source listings show no counts.

### Browser strip

Three columns, each with a dropdown in its head choosing what it lists:
Genre, Artist, Album artist, Album or Playlist. Columns narrow each
other as far as the server allows: genres narrow everything, an artist
narrows albums. A pick clears the columns to its right. Genres take a
Ctrl+click multi-select. A picked playlist lists its tracks, narrowed by
name to any artist or album picked beside it. Each column has its own
search box, a virtualized list with an "All (n)" row, and type-ahead.
Picks appear as chips above the grid; each chip's × clears it, "Clear
filters" clears them all.

### Track list

- Columns (Settings › User Interface › Library view, or the ⚙ in the
  header): #, Title, Artist, Album, Album artist, Year, Genre, Favorite,
  Src, Length, Last played, Date added, Disc, Format, Path, Explicit,
  Popularity. Title and the actions column are always shown.
- Density: compact 28 px, comfortable 36 px, thumbnails 50 px.
- Sorting: click a header. Where the server has a sort key (title,
  artist, length, last played, date added; albums also year and album
  artist) the request is re-issued sorted. Every other column sorts in
  the browser: narrowed lists and folders arrive whole, and the full
  library pages itself in first (2,000 per request, "Loading n of m to
  sort" in the status line; about ten seconds for 22,000 tracks). A
  browser-side sort left active reloads the whole library on the next
  visit, so switch back to a server sort when you do not want that cost.
- Paging: the library is fetched 200 rows at a time as you scroll.
- Selection: click, Shift+click, Ctrl+click, Ctrl+A, Shift+Ctrl+A.
  Ctrl+A selects the rows that have been paged in.
- Double-click plays (a folder opens instead); Enter plays; Shift+Enter
  opens the row menu, which is the same menu as everywhere else in the
  app. The ⋮ at the end of a row opens it too.
- Type-ahead: typing while the list has focus jumps to the first row
  whose sort column starts with what you typed. Rows already loaded are
  scanned first; otherwise the server's own order is bisected by page
  (about seven requests for 22,000 tracks).

### Queue

The same list as the fullscreen player: played, now playing and up-next
sections, the queue-mode banner, drag to reorder up-next rows, ⋮ per
row. Hovering a row's artwork offers _Play now_. The head shows the
position (`n / m`), a button that scrolls to the current track and one
that clears the queue; the _Up next_ divider has a button that appends
the grid's selected rows and one that clears everything after the
current track (rows the player has already buffered stay). With the
list focused: arrows move, Enter plays the row, Delete removes it.

### Playing from one source

A listing narrowed to one source (a source's own tracks, or the Library
node after its right-click choice) plays through that source: each row
is sent with the source's own item in its uri, and the app's
`play_source_steer` server edit puts that source ahead of the server's
quality order when the stream is resolved. The source column and the
selected pane list that source first. On a server without the edit the
listing is unchanged but playback still comes from the best-quality copy
of the track.

### Selected item

Describes the last row picked: art, title, artists, album · track # ·
year, format (codec, sample rate, bit depth, bit rate), source icons and
the file path for filesystem items. The icon bar (labels on hover) has
play now, play next, add to queue, favorite, add to playlist, edit, go
to album, go to artist and the full menu. With several rows selected the
bar keeps the actions that take lists.

## Players

The first play with no player selected opens the player picker. Picking
a player continues the action; after 8 s with no pick this browser's own
player is selected and playback starts here.

The picker's display options (the ⋮ button in its header) gained two
entries:

- **Keep players that can play together next to each other** (on by
  default): players that report they can stream in sync with one
  another are listed as a block, so a party-mode set is easy to find.
  The block sorts by its first member's name; players that can group
  with nobody sort by name on their own.
- **Show hidden players (n)**: reveals players hidden through their card
  menu so they can be unhidden again. The reveal lasts until the picker
  closes.

A player card's menu has **Hide player** / **Unhide player** (saved as a
user preference, so it follows the account to every device and never
hides players added later) and, for AirPlay and Squeezelite players,
**Audio delay**: the server's per-player `sync_adjust` setting from -500
to +500 ms with a slider and ±10/±50 ms steps. Use it to remove the echo
between players on different protocols; the player reloads after each
change.

## Keyboard

The full table is at Settings › User Interface › Keyboard and behind `?`
from the manager. Highlights:

| Keys | Does |
| --- | --- |
| Space | play / pause |
| Ctrl+Alt+← / → | previous / next track |
| Ctrl+Shift+← / → | seek 10 s |
| Ctrl+Alt+↑ / ↓, Ctrl+Alt+M | volume, mute |
| Enter, Ctrl+Enter, Ctrl+Shift+Enter | play the selection now / add it to the queue / play it next |
| Ctrl+L | show the playing track in the list |
| Ctrl+Shift+L, Ctrl+Shift+P | favorite the selection, add it to a playlist |
| g then n / l / a / b / g / p | Now playing, Library, Artists, Albums, Genres, Playlists |
| s then 1…9 | sort by the nth sortable column |
| Ctrl+B, Ctrl+Alt+Q, Ctrl+I | toggle the browser strip, the queue, the selected panel |
| Ctrl+Alt+R | refresh the list |
| Ctrl+Alt+P, Ctrl+Shift+F, Ctrl+, | player picker, fullscreen player, settings |
| ? | this list |

Chords wait 1.5 s for their second key and never fire while typing.
Letters typed in the track list or a browser column are type-ahead, so
the chords work from the tree, the panes and the page body. Keys the
browser owns (Ctrl+N/T/W/O/P/S/J/H/F, Ctrl+1…8, F5, F6, F11) are never
bound.

## Settings

Settings has a tree on the left of every page (toggle in the toolbar;
phones keep the card overview): Music sources with one child per
enabled provider, the other provider types, Players, Profile, User
Interface (Appearance, Library view, Keyboard), User management, Remote
access, System with one child per core module plus Background tasks,
Diagnostics and Genre management, and About.

**Library view** holds the columns, density, pane toggles, "Reset pane
sizes", and the queue controller's "double-clicking a track" and
"playing a track from an album" settings. Those two are the
`player_queues` core settings the whole app follows.

## Known limits and follow-ups

- No star ratings: the server only has a favorite flag.
- Shortcuts are fixed; rebinding is a follow-up.
- Files to edit and its search run in the browser over library pages.
- Ctrl+A selects the paged-in rows, not the whole library.
- The server has no "playlists containing this artist" call, so with
  Artist to the left of Playlist the playlist column is narrowed only by
  genres.
- Spotify's Podcasts browse returns "media item could not be found" on
  the tested server; the node is not offered.

## Code

Everything new lives in `src/library-manager/` (view, panes, composables,
`columns.ts`, `keymap.ts`) with tests in `tests/library-manager/`, plus
`src/views/settings/{SettingsTree,LibraryViewSettings,KeyboardSettings}.vue`
and `settingsSections.ts`. Upstream files touched: the router, the
navigation registry, `en.json`, `Settings.vue` (tree layout),
`useFullscreenQueue.ts` (a `visible` option), `PlayerSelect.vue`,
`useOrderedPlayers.ts` and `player_menu_items.ts` (hidden players,
sync clusters, audio delay; helpers in `src/helpers/{hidden_players,
player_sync_clusters,sync_adjust}.ts`). `ItemsListing.vue` is not
modified. The phase plan that built it is `LIBRARY-MANAGER-PLAN.md`.

## Sync issues

The music sync tasks log every file they could not import cleanly. The
source tree reads those logs (`tasks/list`, kept current through
`TASKS_UPDATED`) and shows a **Sync issues** node while there is anything to
fix, with one folder per kind of failure:

| Folder | Log line |
| --- | --- |
| Missing tag: *tag* | `<file> is missing ID3 tag [<tag>], using … as fallback` |
| CUE sheet track skipped | `CUE sheet <file>.cue track N … ; skipping` (merged per sheet) |
| CUE sheet without its audio file | task failure `Failed to process <file>.cue: Audio file not found for CUE sheet` |
| Invalid MusicBrainz id | `Ignoring invalid MusicBrainz identifier '…' in <file>` |
| Failed to import | any other `Failed to process <file>: …` failure |

Selecting a folder lists the files in the grid with an **Issue** column
(the log message) and the **Path** column shown. Audio files the library
holds are looked up on their provider by path, so they are real tracks with
the usual actions; CUE sheets, `album.nfo` files and files that never
imported get a placeholder row (not playable) that still shows where they
are. A sync that changes the log lights the grid's refresh button.

Parsing lives in `src/library-manager/syncIssues.ts`; lines the parser does
not recognise (an invalid ReplayGain value, which names no file) are left
out.

## On a phone

`/library` on a phone-sized screen (the Home Assistant app included) does
not open the desktop manager. `LibraryEntry.vue` picks
`mobile/MobileLibraryView.vue` instead: one list over playlists, podcasts,
audiobooks, albums and artists (100 of each, newest first), a chip per kind
to narrow it, a **Recents** / **Alphabetical** sort (recents = last played
or date added), list or grid layout, tap to open, hold or right-click for
the item menu. The search icon opens the command center; the plus creates a
playlist. Sort and layout are remembered in the `libraryManager.mobile`
preference.

