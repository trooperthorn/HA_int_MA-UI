# Library Manager rework - phased build plan

Status: plan, 2026-09-12. Concept canvas: Music Assistant Library Manager
(artboards Main, TwoPane, Mapping, Settings).

Goal: a desktop library-manager workflow for a large local collection -
tree of sources on the left, a Genre > Artist > Album browser narrowing a
dense sortable track grid in the centre, queue and selected-item panels on
the right, resizable panes, and a two-pane Settings view. The server and
its API are not touched; every pane rides on calls the frontend already
makes.

This is a fork of music-assistant/frontend. Nothing here goes upstream;
upstream changes are merged in periodically, so the new code lives in its
own folders and hooks into upstream at as few points as possible.

## Ground truth (checked 2026-09-12)

- Live instance walked at 192.168.30.3:8095. Artists and Albums render
  tile grids by default; Tracks is a 50 px thumbnail list; filtering is
  one facet at a time from the header menu. The Genres and System settings
  pages froze the tab renderer on this library, twice each.
- `src/components/ItemsListing.vue` (2,313 lines) already pages every
  list through `loadPagedData(params)` with `offset`, `limit`, `sortBy`,
  `search`, `genreIds`, `provider[]`, `favoritesOnly`, and persists view
  state per `path.itemtype` through `useUserPreferences`.
- `src/views/LibraryTracks.vue` exposes sort keys `name`, `sort_name`,
  `track_artist_name`, `duration`, `timestamp_added`, `last_played`,
  `play_count` (each with `_desc`).
- `@tanstack/vue-table` and `@tanstack/vue-virtual` are already
  dependencies and already used (`components/genre/GenreDataTable.vue`,
  `DataTableColumnHeader.vue`, `DataTableViewOptions.vue`,
  `ui/sortable-header`, `ui/table-*`).
- `reka-ui` 2.x is a dependency; it ships `SplitterGroup` /
  `SplitterPanel` / `SplitterResizeHandle` and `TreeRoot` / `TreeItem`.
  Verify against the installed version before Phase 0 ends.
- `api.browse(path)` returns each provider's own tree. Spotify's root
  returns New Releases, Genres & Moods, Artists, Albums, Tracks,
  Playlists, Podcasts; Filesystem returns its folder tree.
- Counts: `getLibraryArtistsCount`, `getLibraryAlbumsCount`,
  `getLibraryTracksCount`, `getLibraryPlaylistsCount`,
  `getLibraryGenresCount`. Narrowing: `getArtistAlbums`,
  `getArtistTracks`, `getAlbumTracks`. Queue: `getPlayerQueueItems` plus
  queue events, already used by `PlayerOSD/PlayerFullscreen.vue`.
- Player picker already lives bottom-right of the player bar
  (`layouts/default/PlayerSelect.vue`, `store.showPlayersMenu`). Kept as
  is.
- Rating: `music-assistant-models` 1.1.210 has only `favorite: bool`. No
  star rating anywhere in server or models. The grid shows a heart
  column; stars are out of scope for a frontend rework.
- Shell: `layouts/default/View.vue` = `SidebarProvider` >
  `AppSidebar` + `SidebarInset` > `router-view`; `Footer.vue` is the
  player bar. Settings: `views/settings/Settings.vue` (1,294 lines) with
  a breadcrumb per tab and child routes under `/settings`.

## Layout of the new code

```
src/library-manager/
  LibraryManagerView.vue        route: /library  (Phase 1)
  panes/
    SourceTree.vue              Phase 2
    BrowserStrip.vue            Phase 3
    TrackGrid.vue               Phase 1
    QueuePane.vue               Phase 4
    SelectedPane.vue            Phase 4
  composables/
    useLibraryFilter.ts         one filter object shared by strip + grid
    usePaneLayout.ts            splitter sizes -> user preferences
    useGridColumns.ts           column set + density -> user preferences
  columns.ts                    column definitions for TanStack
src/views/settings/
  SettingsTree.vue              Phase 5
  LibraryViewSettings.vue       Phase 5
docs/LIBRARY-MANAGER-PLAN.md    this file
docs/LIBRARY-MANAGER.md         user-facing description, written in Phase 6
```

Upstream touch points, kept to a list so merges stay reviewable:

1. `plugins/router.ts` - one new route `/library` and the settings child
   routes for Phase 5.
2. `components/navigation/NavMain.vue` - one nav entry "Library".
3. `views/settings/Settings.vue` - swap the tab strip for `SettingsTree`
   behind a preference flag (Phase 5).
4. `composables/userPreferences.ts` - three new preference keys.

Nothing else upstream is edited. `ItemsListing.vue` is not modified; the
grid is a sibling, not a fourth view mode inside it.

## Phase 0 - baseline and harness

- Confirm the fork builds and tests pass locally: `pnpm install`,
  `pnpm build`, `pnpm test:run`, `pnpm lint:check`.
- Confirm `SplitterGroup` and `TreeRoot` exist in the installed
  `reka-ui`; if not, pin a version that has them.
- Add `docs/` to the repo (this file) and a CHANGELOG entry heading.
- Exit: green `pnpm build` on `main`, plan committed.

## Phase 1 - TrackGrid at /library

The piece that fixes the pain first: a text-first, virtualized, sortable
track grid fed by the same `getLibraryTracks` call `LibraryTracks.vue`
uses today.

- `TrackGrid.vue`: TanStack table (`useVueTable`, manual sorting, manual
  pagination) + `@tanstack/vue-virtual` row virtualizer, 28 px rows,
  sticky header. Columns from `columns.ts`: track #, title, artist,
  album, year, genre, favorite (heart), source (provider icon via
  `getListItemProviderIconDomain`), length, plays, last played, row menu.
  Hidden by default: album artist, date added, disc #, bitrate/format,
  path, explicit, popularity.
- Sorting: header click maps to the existing sort keys; columns without a
  server sort key (genre, favorite, source, year) render as not sortable
  rather than sorting client-side on a partial page.
- Paging: infinite scroll driven by the virtualizer's last visible index,
  `limit` 200. Row selection (single, shift, ctrl) held in the component;
  the selected `Track[]` is emitted for Phase 4.
- Row menu and double-click reuse `handleMenuBtnClick` /
  `handlePlayBtnClick` / `handleMediaItemClick` from
  `helpers/media_item_actions.ts`, so every context-menu item and the
  `default_click_action_track` setting work unchanged.
- `LibraryManagerView.vue`: for this phase, a full-width `TrackGrid`
  plus the existing header search. Route `/library`, nav entry.
- Tests (vitest, existing setup under `tests/`): column definitions,
  sort-key mapping, page-request arguments for a given scroll position,
  selection model.
- Exit: `/library` lists the whole track library at 28 px rows without
  a renderer stall on this collection; sort and search work; the row
  menu is the same menu as today.

## Phase 2 - SourceTree

- `SourceTree.vue` on `reka-ui` `TreeRoot`. Nodes:
  - Now Playing
  - Library (all sources): Artists, Album Artists, Albums, Genres,
    Playlists, Recently Added, Files to Edit - counts from the
    `getLibrary*Count` calls, refreshed on `onLibrarySyncCompleted`.
  - Sources: one node per music provider from `api.providers` whose
    manifest is a music provider; children loaded lazily on expand from
    `api.browse(path)` for that provider's root. Local Files gets a
    Folders child that keeps browsing; Spotify gets whatever its root
    returns.
  - Players: count of selectable players; click opens the existing
    player picker.
- Selecting a node sets the filter object in `useLibraryFilter`
  (`scope: library | provider`, `provider?`, `browsePath?`,
  `mediaType`), and `TrackGrid` switches its loader: library scope ->
  `getLibraryTracks(provider filter)`, browse scope -> `api.browse(path)`
  rendered through the same columns.
- "Files to Edit": client-side filter over the library for tracks with
  no album, no album artist, or no year - a first-pass definition until a
  server predicate exists. Show the count lazily (computed on first
  expand), never on boot.
- Layout: tree pane left of the grid inside a `SplitterGroup`; size in
  `usePaneLayout`, key `libraryManager.panes`.
- Exit: every provider on the live instance expands to its children;
  clicking a Spotify child lists that provider's items in the grid;
  Local Files > Folders browses the filesystem.

## Phase 3 - BrowserStrip

- `BrowserStrip.vue`: three virtualized columns Genre | Artist | Album,
  each with an "All (n)" head row and a per-column search.
  - Genre column: `getLibraryGenres` (paged). This is the list that
    hung the Genres page - it is virtualized from day one.
  - Artist column: `getLibraryArtists` narrowed by the selected genre
    ids; album-artists-only toggle maps to `albumArtistsFilter`.
  - Album column: `getArtistAlbums` for a selected artist, else
    `getLibraryAlbums` narrowed by genre.
- Selections write into `useLibraryFilter`; `TrackGrid` re-requests with
  `genreIds`, and for a selected album uses `getAlbumTracks` (for an
  artist, `getArtistTracks`). Active filters render as removable chips
  above the grid; chips and columns share the one filter object so
  there is no second source of truth.
- Strip height is a horizontal splitter pane; "Show browser strip" and
  "Remember filters" preferences from the Settings concept.
- Exit: Genre > Artist > Album narrowing on the live library with no
  stall; filter chips clear correctly; strip height persists.

## Phase 4 - QueuePane and SelectedPane

- `QueuePane.vue`: the queue list from `PlayerOSD/PlayerFullscreen.vue`
  factored into a docked panel - reuse `QueueListItem.vue`,
  `useQueueDragReorder.ts`, `useQueueModes.ts`; do not fork them. Header
  shows "n of m" and the queue menu.
- `SelectedPane.vue`: driven by `TrackGrid`'s selection. Art, title,
  artist, album, track #, year, format line from `provider_mappings`
  audio format, file path for filesystem items. Icon bar with tooltips
  (`ui/tooltip`): play now, add to queue, favorite, add to playlist,
  edit track, go to album, go to artist, more (opens the full context
  menu). Every action calls the same helpers the row menu does.
- Right column is a vertical `SplitterGroup` (queue over selected); the
  whole right column is a pane of the outer horizontal group.
- Detail routes (`TrackDetails`, `AlbumDetails`, ...) stay for deep
  links; the pane is the in-place path.
- Exit: selecting a row never navigates; queue reorders and jumps work
  from the pane; all three splitters persist per user.

## Phase 5 - Settings as a two-pane options view

- `SettingsTree.vue`: one tree for every existing settings child route
  (Profile; Music sources with a child per configured provider; Player,
  Metadata, Plugin, Audio-analysis providers; Players; System with the
  core modules from `getCoreConfigs` plus Background tasks, Diagnostics,
  Genre management; Frontend: Appearance, Language, Library view,
  Search; Users; About). Nodes route to the existing views - no settings
  page is rewritten in this phase. Admin-only nodes hide by the same
  `requiresAdmin` / `requiresScope` meta the router uses.
- `Settings.vue`: render `SettingsTree` in place of the tab strip when
  preference `settings.treeLayout` is true (default true on desktop,
  false on mobile). Breadcrumb logic stays.
- `LibraryViewSettings.vue` (`/settings/frontend/library-view`): the
  page from the concept - column checkboxes, density, browser-strip and
  pane toggles, reset pane sizes, double-click behaviour bound to the
  existing `default_click_action_track` / `default_play_action_album_track`
  core config values. Writes `useGridColumns` and `usePaneLayout`
  preferences.
- `/settings/frontend/search` is a placeholder page that only lists what
  the server searches today; field selection needs a server change and
  is noted as a follow-up, not built.
- The System settings stall: `SystemConfig.vue` renders every core
  config form at once. Out of scope to rewrite here; the tree makes each
  core module its own node, which sidesteps the stall by only mounting
  one module's form at a time.
- Exit: every settings route reachable from the tree; Library view page
  round-trips its preferences into the grid.

## Phase 6 - keyboard commands

What exists today: `Ctrl+K` opens the command center
(`CommandCenter.vue`); inside `ItemsListing` with `allowKeyHooks`,
`Ctrl+A` selects all, `Escape` closes search, `Backspace` focuses search,
and any other printable key opens and focuses the search box
(`ItemsListing.vue` ~1731). Nothing for playback, queue, navigation, or
panes. `helpers/mediaSession.ts` handles hardware media keys through the
browser's Media Session API; that stays as is.

Reference sets compared: iTunes for Windows
(support.apple.com/guide/itunes/itns1019/windows) and MediaMonkey
(mediamonkey.com/sw/webhelp/frame/keyboardshortcuts.htm). Where they
disagree, MediaMonkey wins - it is the workflow this rework copies - unless
the browser owns the combination. Chrome/Edge on Windows own `Ctrl+N/T/W`,
`Ctrl+O/P/S`, `Ctrl+J` (downloads), `Ctrl+H`, `Ctrl+1-8` (tabs), `F5`,
`F6`, `F11`, `Alt+letter`, and reserve `Ctrl+F`; the app never binds those.
Single-letter chords are Gmail-style (`g` then a key) so they cannot
collide with a browser shortcut and cannot fire while typing.

| Action | iTunes | MediaMonkey | Ours | Calls |
| --- | --- | --- | --- | --- |
| Play / pause | Space | Ctrl+P | `Space` | `api.playerCommandPlayPause` |
| Play selected now | Enter | Enter | `Enter` | `handlePlayBtnClick` |
| Play selected next | - | Shift+Ctrl+Enter | `Shift+Ctrl+Enter` | `playMedia(..., "next")` |
| Add selected to end of queue | - | Ctrl+Enter | `Ctrl+Enter` | `playMedia(..., "add")` |
| Next / previous track | Right / Left while playing | Ctrl+N / Ctrl+B, Ctrl+Alt+Right/Left | `Ctrl+Alt+Right` / `Ctrl+Alt+Left` | `playerCommandNext/Previous` |
| Seek back / forward 10 s | Ctrl+Alt+Left/Right | Shift+Ctrl+B / N | `Shift+Ctrl+Left` / `Shift+Ctrl+Right` | `playerCommandSeek` |
| Volume up / down | Ctrl+Up / Ctrl+Down | Ctrl+Alt+Up / Down | `Ctrl+Alt+Up` / `Ctrl+Alt+Down` | `playerCommandVolumeUp/Down` |
| Mute | Ctrl+Alt+Down | - | `Ctrl+Alt+M` | `playerCommandVolumeMute` |
| Stop | - | Ctrl+O | not bound (browser owns Ctrl+O; Space covers it) | - |
| Show now-playing track in list | Ctrl+L | F6 | `Ctrl+L` | grid scroll-to + select |
| Toggle favorite on selection | - | - | `Shift+Ctrl+L` | `api.toggleFavorite` |
| Edit selected track | - | Shift+Enter | `Shift+Enter` | `eventbus editItemDialog` |
| Show info | Ctrl+I | - | `Ctrl+I` | opens Selected pane if hidden |
| Add selection to playlist | - | - | `Shift+Ctrl+P` | `eventbus.emit("playlistdialog", {items})` |
| Remove selection (queue / playlist context only) | Delete | Delete | `Delete` | queue/playlist remove |
| Select all / none | Ctrl+A / Shift+Ctrl+A | Ctrl+A | `Ctrl+A` / `Shift+Ctrl+A` | grid selection |
| First / last row, page | Home / End | Home / End | `Home` `End` `PgUp` `PgDn`, `Shift+` extends | grid |
| Move in list | Up / Down | Up / Down | `Up` / `Down`, `Shift+Up/Down` extends | grid |
| Type-ahead jump in a column | - | - | letters while grid focused (Explorer-style) | replaces "any key opens search" |
| Focus search | Ctrl+F | Ctrl+F, F3 | `/` and `Ctrl+K` (exists) | `CommandCenter` |
| Sort by column | - | - | `s` then `1-9` (column index) | grid sort |
| Go to Now Playing | - | F6 | `g` `n` | tree select |
| Go to Library / Artists / Albums / Genres / Playlists | - | F7 / F8 / F9 / F10 | `g` `l` / `g` `a` / `g` `b` / `g` `g` / `g` `p` | tree select |
| Back / forward node | - | Alt+Left / Alt+Right | `Alt+Left` / `Alt+Right` | browser history already does this via the router |
| Refresh view | F5 | F5 | `Ctrl+Alt+R` | reload grid, keep filters |
| Toggle browser strip | Ctrl+B (column browser) | - | `Ctrl+B` | pane preference |
| Toggle queue pane / selected pane | - | Ctrl+Alt+N / Ctrl+Alt+P | `Ctrl+Alt+Q` / `Ctrl+Alt+I` | pane preference |
| Player picker | - | Ctrl+Alt+L (player) | `Ctrl+Alt+P` | `store.showPlayersMenu` |
| Fullscreen player | Shift+Ctrl+F | - | `Shift+Ctrl+F` | `store.showFullscreenPlayer` |
| Preferences | Ctrl+, | - | `Ctrl+,` | route `/settings` |
| Shortcut help | - | - | `?` | overlay listing this table |

Not carried over, with the reason: iTunes `Ctrl+1..5` star ratings (no
rating in MA); MediaMonkey auto-tag / auto-organize / rip / burn / convert
(no equivalents); MediaMonkey `Ctrl+Alt+A/V/E` (album art, visualizer,
equalizer toggles - the visualizer and DSP live in the fullscreen player
and player settings, reachable from `Shift+Ctrl+F`); MediaMonkey property
editor `Alt+Left/Right` (the Selected pane follows the grid selection, so
`Up`/`Down` does this).

Implementation:

- `src/library-manager/composables/useKeymap.ts`: one document-level
  keydown listener mounted by `LibraryManagerView.vue` only, so no other
  route changes behaviour. Ignores events from inputs, textareas and
  contenteditable, and while `store.dialogActive` or
  `store.showPlayersMenu` is set - the same guards `ItemsListing` uses.
  Chord state (`g`, `s`) times out after 1.5 s.
- Bindings are a data table (`keymap.ts`: id, label, default keys, handler
  name), not scattered `@keydown` handlers, so the help overlay and the
  settings page render from the same source.
- `ShortcutHelp.vue`: overlay on `?`, built from `ui/dialog` and `ui/kbd`.
- Settings > Frontend > Keyboard: read-only list in this phase (same
  table); rebinding is a follow-up.
- The grid's own arrow / Home / End / Page keys are handled by
  `TrackGrid.vue` (roving focus over virtual rows), not by the global
  listener, so they work in every context the grid appears in.
- Tests: chord timeout, guard conditions, every binding resolves to a
  handler, no binding in the browser-owned list.
- Exit: every row in the table works on the live instance from
  `/library` with the grid focused; `?` shows the list.

## Phase 7 - polish, docs, release

- Mobile: `/library` redirects to the existing `/tracks` view below the
  `md` breakpoint; the manager is desktop-only by design.
- `docs/LIBRARY-MANAGER.md`, CHANGELOG, screenshots from the live
  instance.
- Release per the fork's existing `release.yml`.

## Out of scope (documented follow-ups)

- Star ratings (server + models change).
- Rebindable keyboard shortcuts (Phase 6 ships fixed bindings).
- Server-side "Files to Edit" predicate and search-field selection.
- Rewriting `SystemConfig.vue` and `ItemsListing.vue`.
- Any upstream PR.

## Order and dependencies

```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5 -> Phase 6 -> Phase 7
                        \____ Phase 5 can start after Phase 1 ____/
                        \____ Phase 6 grid keys land with Phase 1; the rest after Phase 4
```

Phase 1 alone is shippable and is where the performance complaint is
answered. Phases 2-4 each add one pane to the same view. Phase 5 only
needs the preference composables from Phase 1. Phase 6's grid-local keys
(arrows, Enter, Ctrl+A, type-ahead) ship inside Phase 1; the global
keymap waits for the panes it toggles.
