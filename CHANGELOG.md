# Changelog

## Unreleased (fork: trooperthorn/HA_int_MA-UI)

### Features

- **Library manager** at `/library`: source tree, genre / artist / album browser strip with per-column facet dropdowns, dense virtualized sortable track grid with server-backed type-ahead, Now Playing queue and selected-item panel, every pane resizable and remembered per user. See `docs/LIBRARY-MANAGER.md`.
- **Sync issues** in the source tree: every file the sync tasks could not import cleanly (missing album artist tag, CUE sheet without audio, skipped CUE tracks, invalid MusicBrainz ids, import failures), one folder per kind of failure, listed with the failure and the file path so it can be fixed.
- **Grid**: sorting by Album (or Album artist) keeps album order — disc, then track number — within each album; selecting another tree node (the library, a source, a folder) clears the search, favorites and browser picks; Sources carries the library icon.
- **Grid columns** resize by dragging a header edge (double-click puts the default back, the column picker has _Reset column widths_); widths are remembered per user and apply to every listing. A track's right-click menu gains **Filter by artist / album / genre**, which narrows the browser strip to that pick.
- **Selected item** is shown in two places: its details and quick actions under the source tree (bottom left), its artwork under the queue (bottom right); both resize with their column and hide with the Selected pane toggle.
- **Phone layout**: `/library` on a phone (and in the Home Assistant app) is one list over playlists, podcasts, audiobooks, albums and artists with a chip per kind, Recents / Alphabetical sort, list or grid, tap to open and hold for the menu; the desktop manager stays on wide screens.
- **Navigation**: one flat section — Music Library, Party, Radio, Discover, Search, Browse (then audiobooks, podcasts and the remaining plugins) — and Settings; the Artists / Albums / Tracks / Playlists / Genres entries are gone, those views live inside the library manager. Settings tree rows keep the icon on the left with the label left-aligned.
- **Settings tree** beside every settings page, with Library view and Keyboard pages under User Interface.
- **Keyboard commands** for playback, selection, navigation chords, pane toggles and a `?` help overlay.
- **Player picker**: first play with no player opens the picker and falls back to this browser after 8 s; hide / unhide players per user; players that can play together listed as a block; per-player **Audio delay** (`sync_adjust`) for AirPlay and Squeezelite in the card menu.
- **Music routing** at `/flow`: the whole-home signal path as four columns (the music source, the player it streams to, every receiver and amplifier zone, the zones playing now with their volume), drawn from Music Assistant's players. Tapping a zone powers it on and selects the input that carries the stream; groups act on several zones, masters take over a whole unit; every tap shows its expected result with a pending mark until the device confirms. The topology (streaming player, feed input names, zones, groups, masters) is set up under Settings, User Interface, Music routing. Replaces the `music-flow-card` Home Assistant card; needs the app's Home Assistant player edit for input selection. See `docs/MUSIC-ROUTING.md`.
- **Playing from one source**: a library listing narrowed to one source (the Library node's right-click choice, or a source's own listing) plays through that source; the source column and the selected pane show that source first. Needs the app's `play_source_steer` server edit, which puts the named source ahead of the server's quality order; without it the server still streams from the best-quality copy.
- **Queue pane**: hovering a row's artwork blurs it under a _Play now_ button; the _Up next_ divider carries a button that appends the grid's selected rows and one that clears everything after the current track. Search boxes (toolbar and browser columns) clear with an x. The grid's heart flips as soon as it is clicked.
- **Now playing artwork** (player bar, fullscreen player, dashboard, player cards) is built from the queue item's own image, the way the queue rows already do, with the server-built `current_media.image_url` as the fallback; a played filesystem track's cover was missing because the server's own image id for it returned 404.
- **Player bar volume**: the volume button swaps its percentage for a slider with the mute button and back; the panel with every grouped player's own slider opens with a right click.
- **Home Assistant app** delivery through [trooperthorn/ha_app_music_assistant](https://github.com/trooperthorn/ha_app_music_assistant); `publish-fork.yml` releases the frontend wheel this app installs and starts that repository's upstream sync, so a merge here becomes an app update without a hand on it.

## [2.9.16](https://github.com/music-assistant/frontend/compare/v2.9.16...v2.9.16) (2024-11-21)

### Features

- Adjust to api changes for player grouping ([e1c5820](https://github.com/music-assistant/frontend/commit/e1c58207f2519be34da49d38324944713e7e287a))
- search for radio stream title from full screen player ([#462](https://github.com/music-assistant/frontend/issues/462)) ([9e44528](https://github.com/music-assistant/frontend/commit/9e445284368673f5eea51ac59ccf5b06f5019073))
- Show visual indicator when Dont stop the music is enabled ([b3a738f](https://github.com/music-assistant/frontend/commit/b3a738f8c6e87402e75d50be313a647805783d43))

### Bug Fixes

- Adjust release workflow ([5268aa9](https://github.com/music-assistant/frontend/commit/5268aa9d4f313f2726938d2757f3e136ae385368))
- Allow mousewheel volume control (except in player select) ([faa766c](https://github.com/music-assistant/frontend/commit/faa766cbffa28774148b9941a1b7047de05a4e56))
- Always show add group player button ([17ca019](https://github.com/music-assistant/frontend/commit/17ca0194098b6467f9daaefc86cd5359b6e4199c))
- Correct check if image proxy should be used ([ce08d5d](https://github.com/music-assistant/frontend/commit/ce08d5d26593fc373c62278a1e0dae0263a941e6))
- Don't request thumb for unavailable item/provider ([ecaa985](https://github.com/music-assistant/frontend/commit/ecaa9857d0d8d29315a8e3fe1add39f64f4b3f2a))
- Dont count unavailable players in sync player name ([7013a54](https://github.com/music-assistant/frontend/commit/7013a5453424d89eeb4eb15019af82f88d6ff781))
- endless loop in queue items retrieval ([306314b](https://github.com/music-assistant/frontend/commit/306314b3702158692e4fd3e2bb04ad7fd42b4597))
- Local images being ignored ([9854345](https://github.com/music-assistant/frontend/commit/98543459a13a0d31fdf9a23b6087893ff887968f))
- make the play actions consistent ([#503](https://github.com/music-assistant/frontend/issues/503)) ([8a25591](https://github.com/music-assistant/frontend/commit/8a255917fd14eb557f4bd6093a35cd18284bd7a9))
- Queue items list refresh issues ([138d5e4](https://github.com/music-assistant/frontend/commit/138d5e4297fe50ee19909ca0fc17b7213bffc504))
- release drafter ([15d2043](https://github.com/music-assistant/frontend/commit/15d20431f67565163465bcbb2f9eade37f370ad4))
- search ignore last press sometimes ([21777d5](https://github.com/music-assistant/frontend/commit/21777d59fc14bf5686fdcb0d1a2087ec906fafd5))
- Search ignores last press sometimes ([#488](https://github.com/music-assistant/frontend/issues/488)) ([21777d5](https://github.com/music-assistant/frontend/commit/21777d59fc14bf5686fdcb0d1a2087ec906fafd5))
- Show play buttons when touchscreen is detected ([b328ff8](https://github.com/music-assistant/frontend/commit/b328ff8a2811d188fa3e814fb2ac2d7f898580ea))
- some minor UI glitches fixed ([be482d9](https://github.com/music-assistant/frontend/commit/be482d989f8457708c45399c8e70627ed0030a36))
- Volume up/down should call the backend ([ae97e45](https://github.com/music-assistant/frontend/commit/ae97e45900ea0e846890b5b3efcf5be988110416))

### Miscellaneous Chores

- release 2.9.16 ([4ac5591](https://github.com/music-assistant/frontend/commit/4ac55913b9907da3022eee71fbec51009e6cdf57))

## [2.9.16](https://github.com/music-assistant/frontend/compare/v2.9.15...v2.9.16) (2024-11-21)

### Features

- Adjust to api changes for player grouping ([e1c5820](https://github.com/music-assistant/frontend/commit/e1c58207f2519be34da49d38324944713e7e287a))

## [2.9.15](https://github.com/music-assistant/frontend/compare/v2.9.14...v2.9.15) (2024-11-04)

### Bug Fixes

- Always show add group player button ([17ca019](https://github.com/music-assistant/frontend/commit/17ca0194098b6467f9daaefc86cd5359b6e4199c))

## [2.9.14](https://github.com/music-assistant/frontend/compare/v2.9.13...v2.9.14) (2024-10-28)

### Bug Fixes

- Volume up/down should call the backend ([ae97e45](https://github.com/music-assistant/frontend/commit/ae97e45900ea0e846890b5b3efcf5be988110416))

## [2.9.13](https://github.com/music-assistant/frontend/compare/v2.9.12...v2.9.13) (2024-10-25)

### Bug Fixes

- Local images being ignored ([9854345](https://github.com/music-assistant/frontend/commit/98543459a13a0d31fdf9a23b6087893ff887968f))

## [2.9.12](https://github.com/music-assistant/frontend/compare/v2.9.11...v2.9.12) (2024-10-25)

### Features

- Show visual indicator when Dont stop the music is enabled ([b3a738f](https://github.com/music-assistant/frontend/commit/b3a738f8c6e87402e75d50be313a647805783d43))

### Bug Fixes

- Allow mousewheel volume control (except in player select) ([faa766c](https://github.com/music-assistant/frontend/commit/faa766cbffa28774148b9941a1b7047de05a4e56))
- some minor UI glitches fixed ([be482d9](https://github.com/music-assistant/frontend/commit/be482d989f8457708c45399c8e70627ed0030a36))

## [2.9.11](https://github.com/music-assistant/frontend/compare/v2.9.10...v2.9.11) (2024-10-24)

### Bug Fixes

- Don't request thumb for unavailable item/provider ([ecaa985](https://github.com/music-assistant/frontend/commit/ecaa9857d0d8d29315a8e3fe1add39f64f4b3f2a))
- Dont count unavailable players in sync player name ([7013a54](https://github.com/music-assistant/frontend/commit/7013a5453424d89eeb4eb15019af82f88d6ff781))

## [2.9.10](https://github.com/music-assistant/frontend/compare/v2.9.9...v2.9.10) (2024-10-23)

### Bug Fixes

- Correct check if image proxy should be used ([ce08d5d](https://github.com/music-assistant/frontend/commit/ce08d5d26593fc373c62278a1e0dae0263a941e6))
- endless loop in queue items retrieval ([306314b](https://github.com/music-assistant/frontend/commit/306314b3702158692e4fd3e2bb04ad7fd42b4597))
- Queue items list refresh issues ([138d5e4](https://github.com/music-assistant/frontend/commit/138d5e4297fe50ee19909ca0fc17b7213bffc504))

## [2.9.9](https://github.com/music-assistant/frontend/compare/v2.9.8...v2.9.9) (2024-10-22)

### Bug Fixes

- release drafter ([15d2043](https://github.com/music-assistant/frontend/commit/15d20431f67565163465bcbb2f9eade37f370ad4))

## [2.9.8](https://github.com/music-assistant/frontend/compare/v2.9.7...v2.9.8) (2024-10-22)

### Bug Fixes

- Adjust release workflow ([5268aa9](https://github.com/music-assistant/frontend/commit/5268aa9d4f313f2726938d2757f3e136ae385368))
