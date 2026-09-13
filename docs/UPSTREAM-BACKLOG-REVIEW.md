# Upstream backlog review, database and audio stack

A comparison of this fork and
[`trooperthorn/ha_app_music_assistant`](https://github.com/trooperthorn/ha_app_music_assistant)
against the open items in
[`music-assistant/backlog`](https://github.com/music-assistant/backlog/issues), plus a
review of the database, the audio stack, dependency health and outbound network calls.

This is a review. It recommends work; it does not do any.

Taken on 2026-09-13 against:

| Tree | Commit |
| --- | --- |
| `trooperthorn/HA_int_MA-UI` | `d8784ac` |
| `music-assistant/frontend` `main` | `fdabf43` |
| `music-assistant/server` | tag `2.10.3` (what the app ships) and `main` |
| `trooperthorn/ha_app_music_assistant` | `43b7d84` |

## Contents

1. [Scope and method](#scope-and-method)
2. [Where the backend and the database are](#where-the-backend-and-the-database-are)
3. [Backlog triage](#backlog-triage)
4. [This fork against upstream](#this-fork-against-upstream)
5. [The database](#the-database)
6. [100k tracks in the library manager](#100k-tracks-in-the-library-manager)
7. [Audio sinks, latency and native components](#audio-sinks-latency-and-native-components)
8. [Dependency health](#dependency-health)
9. [Call-home and external reporting](#call-home-and-external-reporting)
10. [Security](#security)
11. [Recommendations](#recommendations)

## Scope and method

Both repositories were read in full. The upstream server was cloned and read at both
`main` and the `2.10.3` tag the app pins, because the two differ in ways that matter for
the audio stack. The upstream frontend was cloned so this fork could be diffed against it
directly rather than by inspection.

**Backlog coverage is incomplete and the report says so rather than implying a census.**
The backlog has 98 open issues. The GitHub API is not reachable from the environment this
review was written in, so issues were enumerated by paging the web UI, which returns
partial pages. 92 of 98 were confirmed. The six not confirmed are accounted for in
[Backlog triage](#backlog-triage); none of the confirmed issues suggests a missing theme,
but the gap is real.

## Where the backend and the database are

Neither of your repositories contains a backend or a database. Both sit downstream of the
upstream server.

```
trooperthorn/HA_int_MA-UI          (this repo — Vue PWA + library manager)
        │
        │  Publish fork wheel  →  music_assistant_frontend-*.whl  (+ SHA256SUMS)
        ▼
trooperthorn/ha_app_music_assistant  (HA app repo)
        │
        │  music_assistant_lm/Dockerfile:
        │    FROM ghcr.io/music-assistant/server:2.10.3
        │    uv pip install <fork wheel>   (over the stock frontend)
        ▼
music-assistant/server             (Python — THE BACKEND)
        │
        ▼
SQLite, under the app's /data
   ├── library database   controllers/music/database.py, migrations.py
   ├── cache.db           controllers/cache/controller.py:434
   └── auth tables        controllers/webserver/auth.py
```

- **Backend repository:** [`music-assistant/server`](https://github.com/music-assistant/server).
  Pinned by `ARG SERVER_VERSION="2.10.3"` in `music_assistant_lm/Dockerfile`.
- **Database:** SQLite through `aiosqlite`. The connection helper is
  `music_assistant/helpers/database.py`; the library schema is
  `music_assistant/controllers/music/database.py` at schema version 59
  (`controllers/music/constants.py:12`).
- The cache is a **separate file**, `cache.db` under `mass.cache_path`
  (`controllers/cache/controller.py:434`), and the app already excludes it from Home
  Assistant backups — `backup_exclude: [cache.db, collage_images/*, .cache/*]` in
  `music_assistant_lm/config.yaml`. That is the right call and worth keeping.

Everything in the [database](#the-database), [audio](#audio-sinks-latency-and-native-components)
and [dependency](#dependency-health) sections below therefore describes upstream code.
Where a fix is available to you locally, it is marked as such.

## Backlog triage

Issues are bucketed by where the work would land:

- **A — this fork.** Touches the frontend, so it either conflicts with the library manager
  or duplicates it.
- **B — the app repo.** Packaging, image, updates, storage.
- **C — backend only.** Affects your users but there is nothing to do in either repo.
- **D — not relevant.** Upstream project process, other components.

Difficulty is S (under a day), M (a few days), L (a week or more), assuming familiarity
with the code.

### A — applies to this fork

| # | Title | Diff. | Conflicts with the fork? | Implement? |
| --- | --- | --- | --- | --- |
| 116 | Onboarding: a guided start for admins and members (Epic) | L | **Yes — already landing upstream** | No — merge upstream instead |
| 118 | Admin onboarding wizard | M | **Yes** — `Settings.vue`, `router.ts` | No — merge upstream |
| 119 | First-run account setup in the web UI | M | **Yes** | No — merge upstream |
| 120 | Member onboarding | M | **Yes** | No — merge upstream |
| 122 | Step model and orchestrator | M | Yes | No — merge upstream |
| 123 | Wizard page at `/onboarding` | S | Yes — `router.ts` | No — merge upstream |
| 126 | Core settings step | M | **Yes** — fork rewrote `Settings.vue` | No — merge upstream |
| 127 | Invite household members step | S | Yes | No — merge upstream |
| 128 | Finish the admin track, replace the settings banner | S | Yes | No — merge upstream |
| 129 | Welcome and persona defaults | S | Yes | No — merge upstream |
| 130 | What you can listen to and your players | S | Yes | No — merge upstream |
| 131 | Quick tour cards | S | Yes | No — merge upstream |
| 117 | Onboarding engine: step registry and checklist | M | Yes | No — merge upstream |
| 37 | UX/UI — user-friendly onboarding | L | Yes | No — superseded by the above |
| 84 | Personal music sources per household member (Epic) | L | **Yes** — `getMenuItems.ts`, `ItemContextMenu.vue` | No — merge upstream |
| 91 | Members add their own sources through their role | M | **Yes** | No — merge upstream |
| 61 | Genre maintainability: pagination + URL params | M | Overlaps `useLibraryFilter.ts` | **Yes** — closest fit to the library manager |
| 13 | Update the UI/UX of the settings page | M | **Yes** — direct collision | No — upstream owns it |
| 18 | Revamping the user settings page | M | Yes | No — upstream owns it |
| 31 | Player settings design follows Providers and Users | S | Yes — `Players.vue` | No |
| 34 | Settings/Players as a list view | S | Yes — `Players.vue` | No |
| 70 | Move audio player below players in settings list view | S | Yes — `Players.vue` | No |
| 134 | A failed preference save is logged, not shown | S | Yes — `userPreferences.ts` | **Yes** — small, and the fork changed this file |
| 27 | Remove sync button from the items-listing filters | S | Overlaps the grid toolbar | Maybe — check it still applies |
| 23 | Improve multi-select checkbox visibility | S | Overlaps `TrackGrid.vue` | **Yes** — cheap, the grid is multi-select heavy |
| 46 | Utilise album art better on the now-playing screen | M | Overlaps `SelectedPane.vue` | No — upstream's design call |
| 47 | Revamp how people interact with media items | L | Yes | No — needs UX design upstream |
| 48 | Player name on top in the player bar | S | Low | No |
| 52 | UX/UI — Players and Player Drawer | L | Yes — `PlayerSelect.vue` | No — needs UX design |
| 54 | Only show the player popup the first time | S | **Yes** — interacts with `playerGate.ts` | **Yes** — the fork already has a picker timeout |
| 59 | UX/UI — 'Now Playing' page | L | Yes | No — needs UX design |
| 60 | Always expand players from the now-playing screen | S | Yes | No |
| 63 | Improving warning on settings players | S | Yes | No |
| 64 | Blank space between player and party dashboard | S | No | No |
| 66 | Rectangular album art poorly displayed | S | No | No |
| 68 | Mute button in volume slider also lowers volume | S | No | **Yes** — a real bug, cheap |
| 43 | Frontend formatting on iPad in portrait | S | Overlaps `MobileLibraryView.vue` | **Yes** — the fork added a phone layout |
| 45 | Bugs with the HD label on track thumb | S | Overlaps `columns.ts` | Maybe |
| 39 | Provider type on items in the playlist view | S | Overlaps `columns.ts` | **Yes** — the grid already has columns for this |
| 44 | Clicking album/artist/track name opens details | S | Overlaps `TrackGrid.vue` | **Yes** — fits the grid |
| 20 | Extra info line for radio stations | S | Low | No |
| 14 | Show release year in UI | S | Overlaps `columns.ts` | **Yes** — the grid likely has it already |
| 53 | Hide/show the HA layout from MA | S | Low | No |
| 56 | Remove `any` / `as any` from the code | M | Yes — fork added 14k lines | **Yes** — as hygiene on fork code |
| 69 | Replace ESLint with Oxlint when mature | S | No | No — upstream already runs both |
| 25 | Volume slider updates | S | No | No |
| 19 | Volume control in grouped player | M | Low | No |
| 41 | Keep phone screen on when displaying lyrics | S | No | No |

### B — applies to the app repo

| # | Title | Diff. | Implement? |
| --- | --- | --- | --- |
| 101 | One-click updates, schedule that never interrupts playback | L | No — but **track it**; it changes how HA apps update |
| 102 | HAOS and Supervisor: appliance mode, version source, variants | L | No — upstream/HA core |
| 98 | USB drives and NAS shares show up as music sources | M | No — server side, but it justifies your `SYS_ADMIN` grant |
| 96 | Music Assistant OS as a branded HAOS variant | L | No — **watch**: a bundled OS could displace app repos |
| 94 | MA OS: flashable image, base for a ready-made box (Epic) | L | No — same |
| 95 | Spike: appliance mode on real hardware | M | No |
| 104 | Fundamentals for a ready-made box (commercial partners) | L | No |
| 106 | Standalone installer for macOS and Windows | L | No |
| 105 | Publish automatically to NAS and homelab catalogs | M | No — but the pattern is relevant to your app repo |
| 103 | Docs: flashing guide, DIY setup, support scope | S | No |
| 93 | Make it easier to get started (Epic) | L | No |
| 97 | Connect the box to Wi-Fi from a phone | M | No |
| 99 | Local audio: the box plays music itself | M | No — server side; `audio: true` already set |
| 110 | Add local audio in provider | M | No — server side |
| 26 | **Update librespot** | S | No — but it is your `go-librespot` 0.9.0 pin; see [audio](#audio-sinks-latency-and-native-components) |

### C — backend only, for information

| # | Title | Why it matters to you |
| --- | --- | --- |
| 82 | Speaker keeps playing a track the queue dropped | Affects WiiM, DLNA, MusicCast, Sonos S1, Squeezelite **and sync groups** |
| 81 | A failed track change leaves the player unaware | AirPlay speakers can report playing after disconnect |
| 83 | Sonos: re-acquire the playback session after reconnect | Sonos users |
| 132 | Sonos: shuffle and repeat for unmapped services | Sonos users |
| 137 | aiosonos: skip properties Sonos never sends | Sonos users |
| 112 | aiosonos: removed groups keep event subscriptions | Sonos users |
| 24 | Repeat mode does not work on Sonos | Sonos users |
| 78, 79 | Group stays on the Sendspin bridge after the speaker leaves | Sendspin is a builtin provider |
| 16 | DSP option on permanent sync groups | See [audio](#audio-sinks-latency-and-native-components) — interacts with `sync_adjust.ts` |
| 17, 29, 30 | Resonate protocol: web player, builtin, cast | Changes the web player's transport and quality tiers |
| 10 | `get_library` filter order returns no results | Filter applied after limit — relevant to grid filtering |
| 21 | History / Statistics controller | Would give the grid play-count and last-played data |
| 12 | Auto-favourite local items based on rating | Library curation |
| 7 | Options to control the import | Large-library scanning |
| 71 | `get_item_by_name` with AI plugins | — |
| 115 | MCP server tools run without user context | See [Security](#security) |
| 133 | Refuse an empty username when updating a user | See [Security](#security) |
| 51 | Fix security issues in unauthenticated endpoints | See [Security](#security) |
| 33 | Startup argument to reset the auth db | Recovery path |
| 136 | Last.fm scrobbler re-authenticates after restart | Scrobbler users |
| 32 | Volume control on Spotify Connect | — |
| 62 | New TaskController schedule types | — |
| 15 | Extra information in `get_queue` | Could enrich `QueuePane.vue` |
| 9 | Manage source control | — |
| 2, 3 | Refactor Player model, server-side Player base class | Model churn — watch for breaking API changes |
| 58 | Revisit calling a private method in the music controller | — |
| 11 | Type hints / mypy on MusicProvider | — |
| 8, 6, 4 | HA integration: favourite action, add-to-playlist, more options | HA integration, not the app |

### D — not relevant

#107 (sign-in federation research), #121 (upstream docs), #72 (upstream dev docs), #73
(Python client test infrastructure), #135 (aiosonos CI), #100 (system settings inside MA).

**Not confirmed:** six of the 98 open issues could not be enumerated. Based on the
numbering around them they fall in the ranges #28–36, #49–50, #55, #57, #65, #67, #74–77,
#80, #85–90, #92, #108–109, #111, #113–114, #124–125 — most of those numbers are closed
issues. Re-run the triage with API access before treating this table as complete.

## This fork against upstream

This is the most actionable finding in the review.

```
merge base   ce95e28  (2026-09-12)
fork HEAD    d8784ac  →  46 commits ahead, +14,409 / −533 across 75 files
upstream     fdabf43  →  23 commits ahead
overlap                  13 files changed on both sides
```

The 23 commits you have not merged are **the onboarding and user-roles epic landing
upstream right now**:

| Commit | What landed |
| --- | --- |
| `aaa54d9` | Guide new admins through setup with an onboarding wizard |
| `fd41f0e` | Add server settings and household members to the onboarding wizard |
| `b14749e` | Create your own user roles in user management |
| `31fe10d` | Show each user only the actions their role allows |
| `42cd496` | Share Music Assistant playlists with other members |
| `2c73a1f` | Let members pick who to share a music source with |
| `cce9a5a` | Spot and prevent music sources that nobody can use |
| `2f14694` | Show the Home Assistant system account in user management |

Those commits change the same files the library manager rewrote:

```
src/views/settings/Settings.vue          ← fork changed 653 lines
src/plugins/router.ts
src/plugins/store.ts
src/components/navigation/AppSidebar.vue
src/components/navigation/utils/getMenuItems.ts
src/composables/userPreferences.ts
src/helpers/media_item_actions.ts
src/helpers/player_menu_items.ts
src/layouts/default/ItemContextMenu.vue
src/views/settings/Players.vue
src/translations/en.json
tests/components/navigation/getMenuItems.test.ts
tests/composables/userPreferences.test.ts
```

**So roughly a third of bucket A is not future work — it is already merging upstream, into
exactly the files you rewrote.** `Settings.vue` is the worst case: the fork replaced most
of it with `SettingsTree.vue` and `settingsSections.ts` while upstream is adding wizard
steps and role gating to the original.

Merge now, while the delta is 23 commits. Suggested order:

1. Merge the commits that do not touch the 13 overlapping files first, to shrink the set.
2. Take `src/translations/en.json` as a union — it is additive on both sides and will
   conflict noisily but resolve trivially.
3. Resolve `Settings.vue` deliberately: decide whether `SettingsTree.vue` hosts upstream's
   new wizard entry points or sits beside them. This is a design decision, not a merge.
4. Re-run `pnpm test:run`; upstream added `tests/views/Onboarding.test.ts`,
   `tests/views/UserManagement.test.ts` and `tests/layouts/PlaylistAccessDialog.test.ts`,
   which will exercise the merge.

Note also that the fork does **not** modify `package.json` at all — `git diff
ce95e28..HEAD -- package.json` is empty. Every dependency comes from upstream verbatim.
That matters for [dependency health](#dependency-health).

## The database

The common assumption is that a 100k-track library is limited by a naive database. That is
not what is there. Upstream SQLite is well tuned, and the report is more useful if it says
so before proposing anything.

### What already exists

`music_assistant/helpers/database.py:245-252` sets, on every connection:

```
PRAGMA analysis_limit=10000;
PRAGMA locking_mode=exclusive;
PRAGMA journal_mode=WAL;
PRAGMA journal_size_limit = 6144000;
PRAGMA synchronous=normal;
PRAGMA temp_store=memory;
PRAGMA mmap_size = <scaled to host memory>;
PRAGMA cache_size = -<scaled to host memory>;
```

and `PRAGMA optimize;` on close (`:258`). `mmap_size` and `cache_size` are computed from
available host memory by `get_sqlite_memory_settings()`, then clamped, so a Raspberry Pi
and a NUC get different ceilings without configuration.

**Full-text search already uses FTS5 with the trigram tokenizer**, one virtual table per
media table (`controllers/music/database.py:564-577`), behind an explicit guard:

> "The library database requires SQLite 3.34+ with FTS5 support"

So substring search is not `LIKE '%x%'` over 100k rows. This is the single most important
thing to know before proposing database work.

**Indexes** (`controllers/music/database.py:598-718`). Per media table: `favorite`, `name`,
`search_name`, `sort_name`, `search_sort_name`, `timestamp_added`, `play_count`,
`last_played`. Plus join and lookup indexes on `provider_mappings` (including a unique
index on provider instance), `external_id_lookup`, `track_artists`, `album_artists`,
`genre_media_item_mapping`, `genre_media_item_exclusion` and `playlog` (unique index, plus
`userid_timestamp` and `provider_media_type`).

**Both databases are compacted, not left to grow.** `VACUUM_MIN_RECLAIM_RATIO = 0.2`
(`constants.py:264`) gates a conditional `VACUUM` in the cache controller
(`controllers/cache/controller.py:488`) *and* in the library database
(`controllers/music/database.py:241-251`) — a full rebuild is skipped unless at least 20%
of the file is reclaimable. The cache additionally has `MAX_CACHE_DB_SIZE_MB = 2048`, TTL
expiry and a 90-day stale-while-revalidate fallback (`controllers/cache/constants.py`).

**SQL is parameterised.** Every f-string in a query interpolates a *table or index name
from `constants.py`* — never a value. Values go through named bind parameters, and
`helpers/database.py:136-164` expands list parameters into `(:_param_0, :_param_1)` rather
than joining them into the string. There is no injection surface in the query layer.

### Where it actually hurts at 100k

Three real bottlenecks, in order of impact:

**1. Offset pagination.** `controllers/music/media/base.py:448-606` takes
`limit: int = 500, offset: int = 0, order_by: str = "sort_name"`. SQLite's `OFFSET` is
O(offset) — it walks and discards rows. At row 90,000 that is 90,000 discarded rows per
page. The fix is keyset ("seek") pagination: order by `(sort_key, item_id)` and pass the
last-seen tuple as a cursor instead of a count. It is a well-understood change and the
indexes to support it already exist.

This needs an upstream API change (`limit`/`offset` → cursor), so it is not yours to make.
It is the change most worth asking for.

**2. `locking_mode=exclusive`.** One connection, one writer. During a full library scan
the write lock is held for long stretches while the UI is trying to read. This is a
deliberate trade — exclusive locking is meaningfully faster for the single-process case —
but it is the reason browsing feels slow *during* a scan specifically. Worth measuring
before proposing anything: the fix may be scheduling (batch and yield between commits)
rather than a locking change.

**3. Maintenance is tied to restart, not to uptime.** Both maintenance paths fire on a
lifecycle boundary rather than on a schedule: `VACUUM` is evaluated at startup
(`controllers/music/database.py:238`), and `PRAGMA optimize` runs on connection close
(`helpers/database.py:258`). `analysis_limit=10000` is set, so the statistics refresh is
bounded and cheap. But a server that runs for months and is killed rather than shut down
cleanly never re-plans, and a library that grew by 50k tracks in that window is being
queried against stale statistics. A periodic `PRAGMA optimize` on an idle timer — not a
full `ANALYZE`, and not a vacuum — is cheap insurance.

### Proposals

Marked by who can act.

| Proposal | Where | Effort |
| --- | --- | --- |
| Keyset pagination for library listings | **Upstream** — API change | M |
| Periodic `PRAGMA optimize` on an idle timer, so maintenance is not restart-bound | **Upstream** | S |
| Batch-and-yield during scans so readers are not starved | **Upstream** | M |
| Avoid deep offsets from the client (see next section) | **This fork** | M |
| Raise password hashing from PBKDF2 to argon2id | **Upstream** | S |

On hashing: `controllers/webserver/helpers/auth_providers.py:518-529` uses
`hashlib.pbkdf2_hmac("sha256", password, salt, iterations=100000)` with a per-user random
salt combined with the server id. That is a correct construction and the salt handling is
good. 100,000 SHA-256 iterations is defensible but below current guidance; argon2id or
scrypt would be the modern choice. Tokens are JWT, with a SHA-256 hash stored for
revocation (`auth.py:264, 704-709`) — that is fine, since the token is high-entropy and
not a password.

**Do not move to PostgreSQL.** Embedded single-writer SQLite with WAL, mmap and FTS5 is
the correct shape for a Home Assistant app: no second container, no credentials to manage,
no network hop, and backups are a file copy. The bottlenecks above are all addressable
within SQLite. Swapping engines would trade a solvable pagination problem for an
operational one.

## 100k tracks in the library manager

The grid itself is built correctly for scale. `src/library-manager/composables/useItemSource.ts`
pages on demand at `TRACK_PAGE_SIZE = 200` (`:27`) behind a virtualised grid, prefetches
the next page as you approach it (`:437-438`), and seeks by binary search over pages
(`:495-508`).

**The defect is `loadAll()`.** At `:519-549` it walks the entire listing:

```ts
const all: GridItem[] = [];
for (;;) {
  const items = await fetchLibraryPage(current, LOAD_ALL_PAGE_SIZE, all.length);
  if (forGeneration !== generation) return;
  all.push(...items);
  rows.value = all.slice();
  if (items.length < LOAD_ALL_PAGE_SIZE) break;
}
```

with `LOAD_ALL_PAGE_SIZE = 2000` (`:29`). `LibraryManagerView.vue:614` calls it whenever
the user sorts on a client-only (`local:`) column:

```ts
if (localSortToGridSort(sortBy) && !allLoaded) void source.loadAll();
```

At 100k tracks that is 50 sequential round-trips — each one a deep `OFFSET` query, so they
get progressively slower — and 100k objects held in browser memory. `rows.value =
all.slice()` also copies the whole accumulated array on every iteration, so the loop is
O(n²) in copying: roughly 2.5M element copies by the end.

Two fixes, either acceptable:

1. **Push those columns to server sort keys.** `TRACK_SORT_KEYS` (`columns.ts:476`) is
   built from each column's `sortKey`; a column with no `sortKey` falls back to
   `local:`. Giving the remaining columns server-side sort keys removes the need for
   `loadAll()` entirely — but it needs matching `order_by` support upstream, so it is only
   available for columns the server can already sort.
2. **Gate `loadAll()` on a row-count ceiling.** Above, say, 10,000 rows, refuse and show
   the user that this column cannot be sorted across the whole library, offering to sort
   within the current filter instead. Cheap, entirely local, and honest about the limit.

Worth doing (2) now and (1) as the upstream sort keys become available.

Two smaller notes in the same function:

- `loadAll()` sets `total.value = all.length` on completion. If a filter change races the
  walk, `forGeneration !== generation` returns early and leaves `total` stale.
- The binary-search seek (`:495-508`) computes `hi` from `total.value`. If `total` is
  stale from the point above, the seek can land outside the loaded range.

Neither is likely to bite at small scale, which is exactly why they are worth fixing
before someone runs this on a real 100k library.

## Audio sinks, latency and native components

**There are no DLLs.** This is Linux shared objects inside a container image — `libav*.so`,
`libswresample`, `libsoxr` — built from source in the upstream base image. The underlying
concern (stale native audio components) is real, and the answer is below.

### What actually ships

The important detail: **the app pins server `2.10.3`, and `2.10.3` is not what `main`
looks like.** Reading `main` overstates how current the shipped image is.

| Component | Ships (server 2.10.3) | server `main` | Latest upstream | Assessment |
| --- | --- | --- | --- | --- |
| ffmpeg | **7.1.2** | 9.0.1 | 9.x | Shipped build is two majors behind; `main` already moved |
| shairport-sync | **4.3.7** | 4.3.7 | **5.5.1** (2026-09-07) | Major behind, **network-facing** |
| snapcast | 0.34.0 | 0.34.0 | 0.35.0 (2026-03) | One minor behind — this is the multiroom sync engine |
| go-librespot | 0.9.0 | 0.9.0 | 0.9.1 (2026-09-07) | One patch behind — this *is* backlog #26 |
| Python | 3.14 | 3.14 | 3.14 | Current |

Credit where due: ffmpeg is built from source with `--enable-libsoxr`, and PyAV is compiled
against those exact libraries in the same image (`Dockerfile.base:109-127`), so ffmpeg and
PyAV cannot drift apart — a common failure mode avoided. snapcast and go-librespot
downloads are sha256-checked. `helpers/ffmpeg.py:705-754` enforces a minimum ffmpeg version
at runtime and *probes a demuxer* rather than trusting the version string.

### shairport-sync 4.3.7 is the one to act on

This is the AirPlay **receiver** (`providers/airplay_receiver`), so it listens on the
network on a host-network app. Upstream has since moved to a 5.x line, and recent 5.x
releases are explicitly security-motivated.

To be precise about what was and was not verified: the version gap is confirmed, and that
the 5.x line carries security fixes is confirmed from the release notes. **Individual CVE
identifiers were not verified.** Treat this as "a major version behind on a network-facing
daemon, with security fixes in the intervening line" — enough to justify raising it
upstream, not enough to name a specific vulnerability.

### Latency and sync

The per-player latency knob is `CONF_SYNC_ADJUST` (`constants.py:142`), and **this fork
already surfaces it** — `src/helpers/sync_adjust.ts` exposes a −500..+500 ms range, and
`src/layouts/default/PlayerOSD/SyncAdjustMenuControl.vue` renders the control. It is
correctly gated:

```ts
export const SYNC_ADJUST_PROVIDER_DOMAINS: readonly string[] = [
  "airplay",
  "squeezelite",
];
```

Those are the two providers that expose the setting; the gate is right, not a limitation.

Backlog **#16 (DSP option on permanent sync groups)** is the natural next step here and
interacts directly with this code — DSP on a sync group changes the latency budget the
`sync_adjust` values were tuned against. Worth watching rather than implementing.

DSP itself (`helpers/dsp.py`) compiles to ffmpeg filter parameters via
`filter_to_ffmpeg_params`, including resample and dither selection (`ffmpeg.py:488`). It
runs in the ffmpeg process, not in Python, so its cost scales with stream count rather than
with library size.

### Backlog items that will produce audio symptoms

Worth knowing about because they will look like your fork's problem when users report them:

- **#82** — a speaker keeps playing a track the queue dropped. Affects WiiM, DLNA,
  MusicCast, Sonos S1, Squeezelite **and sync groups**. Sonos S2 is unaffected because it
  reads the queue live. Needs a "drop track" mechanism no provider currently implements.
- **#81** — a failed track change clears the transitioning flag without stopping the queue.
  On AirPlay this can leave a speaker reporting playback after disconnect.
- **#17 / #29 / #30** — Resonate protocol for the web player, as a builtin, and for Cast.
  This changes the web player's transport and introduces lossless/max/low-bandwidth quality
  tiers. It will change what the frontend needs to show.
- **#78 / #79** — a group stays on the Sendspin bridge after the speaker leaves. Sendspin is
  a builtin provider, so this is on by default.
- **#26** — update librespot. That is the `go-librespot 0.9.0` pin above, and the issue
  cites two support tickets it may fix.

## Dependency health

**Lead with the framing: the fork changes no dependencies.** `git diff ce95e28..HEAD --
package.json` is empty. Every npm package is inherited verbatim from upstream, and every
Python and native component comes from the upstream server image. Dependency rot here is
almost entirely an upstream question.

The one piece that *is* yours: being 23 commits behind means you are missing upstream's
just-landed refresh of `caniuse-lite`, `electron-to-chromium`, `nanoid` and `node-releases`
(commit `efc6b14`).

### Stale or unmaintained (npm)

| Package | Pinned | Last publish | Note |
| --- | --- | --- | --- |
| `butterchurn-presets` | 2.4.7 | **2018-06-09** | 8 years. Visualiser presets only — low risk |
| `butterchurn` | GitHub **tarball URL** | — | Installed from a `music-assistant/butterchurn` release asset; upstream butterchurn is abandoned. Not in any registry, so no audit coverage |
| `mobile-detect` | 1.4.5 | **2021-03-13** | ~5.5 years. UA sniffing; replaceable with media queries |
| `material-design-icons-iconfont` | 6.7.0 | **2022-04-23** | Dev dependency |
| `@mdi/font` | 7.4.47 | **2023-12-27** | The package line stopped shipping |

### Major versions behind

- **`vuetify` 3.12.0 → 4.2.1.** The UI framework the whole app — and the entire library
  manager — is built on. By far the largest latent upgrade in the repository, and the one
  most likely to collide with fork code when upstream eventually takes it.
- `@tanstack/vue-table` 8 → 9
- `typescript` 6 → 7
- `vitest` / `@vitest/ui` / `@vitest/coverage-v8` 4 → 5

### Hygiene

`happy-dom` (a test DOM implementation) is declared in `dependencies`, not
`devDependencies`. An upstream `package.json` bug; worth a one-line PR upstream.

Everything else is current or one patch behind — including the security-critical
`dompurify` (3.4.14 against 3.4.15). **The npm tree is in good shape overall**; the list
above is the exception, not the rule.

### Python (verified at tag 2.10.3)

`aiohttp`, `aiosqlite`, `mutagen` and `pillow` are all exactly latest. `cryptography`
(50.0.0 vs 50.0.1), `orjson` (3.11.6 vs 3.12.0), `zeroconf` (0.149.16 vs 0.151.3) and
`mashumaro` (3.20 vs 3.22) are minor lags. `librosa` is a major behind (0.11.0 vs 1.0.0).

`numpy` is held at 2.3.5 against 2.5.3 **deliberately**, with the reason inline:

```python
"numpy==2.3.5",  # numpy 2.4.0+ uses X86_V2 CPU baseline (requires SSE4.2)
                 # which breaks older CPUs
```

That is good practice, not rot, and it is the kind of thing an automated dependency bot
would get wrong.

Worth noting separately: a full `torch` / `torchaudio` / `librosa` stack ships inside the
app image. That is a large image and a real cost on aarch64, independent of how current
the versions are.

### The worst dependency finding, and it is in the shipped release

`pyproject.toml` at tag **2.10.3** — the version your app ships — contains:

```python
# TEMPORARY test-drive pin — replace with PyPI release before merge
#   (see webrtc_aiolibdatachannel_plan.md Phase C)
"aiolibdatachannel @ git+https://github.com/music-assistant/aiolibdatachannel@feat/certpem-testdrive",
```

`git ls-remote` confirms `feat/certpem-testdrive` is a **mutable branch** at `950e7f0`,
*behind* that repository's own `main` (`a7f2683`), while the repository publishes proper
tags up to `2026.9.5`.

So a released image depends on a stale feature branch that can be force-pushed or deleted.
Two builds of "2.10.3" are not guaranteed to be identical, and the build can break with no
version anywhere changing. This is upstream's to fix — its own comment says exactly that —
but it is worth raising, because your app inherits the consequence.

### Reproducibility

Related, and partly yours:

- Server `2.10.3`'s Dockerfile uses `ARG BASE_IMAGE_VERSION=latest`. The base image
  carrying ffmpeg, shairport-sync and snapcast is not pinned by tag or digest.
- Your `music_assistant_lm/Dockerfile` uses
  `FROM ghcr.io/music-assistant/server:${SERVER_VERSION}` — a mutable tag, not a digest.

Contrast with what the app repo does **well**, and should be credited: the fork frontend
wheel is pinned by release tag *and* `FRONTEND_SHA256`, verified with `sha256sum --check`
before install, and the install fails closed if the hash does not match. That is better
than most app repositories manage.

Adding a digest pin for the server base image would extend that same discipline one layer
down, and it is entirely within your control — `sync_upstream.py` already rewrites
`SERVER_VERSION`, so it can resolve and write the digest alongside it.

> Versions above were compared on 2026-09-13. Re-run the comparison before acting on it.

## Call-home and external reporting

**No telemetry or analytics exists in any of the three codebases.** No Sentry, Google
Analytics, PostHog, Mixpanel, Matomo, Plausible, Segment, Amplitude, Bugsnag, Datadog or
Rollbar. `index.html` loads no third-party script. There is no version-check call-home, and
`helpers/diagnostics.py` never uploads anything.

Google Fonts are fetched **at build time** and self-hosted (`vite-plugin-webfont-dl`,
`vite.config.ts:19-21`) — the opposite of a tracking call, and worth knowing because
"Roboto from Google Fonts" usually means the reverse.

**This fork adds no external calls.** Checked across every fork-added file under `src/`: no
absolute URLs, no `fetch`, no `XMLHttpRequest`, no `sendBeacon`. The app repo is likewise
clean — only `github.com`, `api.github.com` and `raw.githubusercontent.com`, exclusively in
CI and `scripts/sync_upstream.py` at build time.

What does leave the network, all inherited from upstream:

| Source | Destination | Default | Nature |
| --- | --- | --- | --- |
| `MediaItemThumb.vue:113-124` | `ui-avatars.com` | **always on** | Fallback thumbnails. Sends the item name in the URL, plus the viewer's IP, to a third-party service |
| 7 builtin metadata providers | `musicbrainz.org`, `coverartarchive.org`, `fanart.tv`, `theaudiodb.com` (also `wikipedia.org`, `allmusic.com`), `itunes.apple.com`, `lrclib.net`, `wikidata.org` | **always on** | Library enrichment by design |
| `controllers/webserver/remote_access/` | `wss://signaling.music-assistant.io/ws` | **off** | Opt-in remote access |
| `lastfm_scrobble`, `listenbrainz_scrobble`, `subsonic_scrobble` | Respective services | Opt-in | Listening history |
| `providers/tidal/play_reporting.py` | Tidal | Only if Tidal configured | Tidal's required play reporting |
| `acoustid_lookup` | AcoustID | **Not builtin** — opt-in | Audio fingerprints |

### The one thing worth changing

`getAvatarImage()` in `src/components/MediaItemThumb.vue`:

```ts
return `https://ui-avatars.com/api/?name=${name}&size=${size || 256}&bold=true&...`;
```

It is always on, has no configuration gate, and has exactly **one caller**
(`MediaItemThumb.vue:87`). Replacing it with initials rendered locally in an SVG is a small,
entirely fork-local change — and one of the few privacy improvements fully in your control.
Worth doing here and offering upstream.

### The rest, in context

The seven builtin metadata providers are **disclosure, not a defect** — that is the product
working, and it is why album art and lyrics appear at all. But it should be said plainly:
with a default install, your library's artist, album and track names and your server's IP
reach seven external services without anyone opting in.

Remote access is the only persistent connection to project infrastructure, and it is
correctly opt-in: `remote_access/__init__.py:80` reads the config with a `False` default,
and the code notes it connects "when remote access is actually enabled, never at idle"
(`:189`).

Three things that look like call-homes and are not:

- `sendspin-audio.com` appears in the builtin sendspin provider, but only as a credits link
  in `manifest.json`. No runtime call.
- `beta.music-assistant.io` in `helpers/utils.ts:45` rewrites *documentation* links on beta
  builds, and only when the user clicks one.
- `public/sw.js` is an HTTP-over-WebRTC proxy for remote mode, not a beacon.

## Security

### App configuration

`music_assistant_lm/config.yaml`: `host_network: true`, `ingress: true` (port 8094),
`audio: true`, `map: [media:rw, ssl:ro]`, `privileged: [SYS_ADMIN, DAC_READ_SEARCH]`,
`apparmor: true`.

`SYS_ADMIN` and `DAC_READ_SEARCH` are load-bearing, not gratuitous — they exist for the
`filesystem_smb` and `filesystem_nfs` mount providers. Worth documenting in the app's
`docs/security.md` so it does not look like over-provisioning.

### AppArmor

`music_assistant_lm/apparmor.txt` is broadly permissive. It grants bare `capability,`,
`file,`, `mount,`, `umount,`, `remount,`, wide network rules across every address family,
and `/dev/* mrwkl`. In practice the profile constrains very little beyond signals.

The important caveat: **it is inherited verbatim from upstream.** `scripts/sync_upstream.py`
refreshes `apparmor.txt` from `music-assistant/home-assistant-addon` on every sync, so
tightening it locally means either owning a permanent divergence or having the sync
overwrite it. Raise it upstream rather than patching it here — and if you do want a local
profile, teach `sync_upstream.py` to leave it alone first, deliberately.

### Bundled credentials

`helpers/app_vars.py` ships obfuscated **shared** third-party API credentials inside the
image (Spotify client id and similar). Upstream is admirably direct about it:

> "The bundled values are lightly, per-key obfuscated. To be completely clear: this is NOT
> a security boundary."

Not a vulnerability — a documented design decision — but worth knowing that the image
contains recoverable third-party credentials shared across the whole user base.

### Backlog security items

- **#51 — fix security issues in unauthenticated endpoints.** The body is empty
  ("@marcelveldt and @MarvinSchenkel have details") and the project board marks it Done.
  Low signal; most likely already fixed. Do not treat it as a known open hole.
- **#115 — MCP server tools run without a user context.** Real and specific: the MCP server
  verifies tokens but does not bind the user into the request, so tool calls run with
  internal privileges. User-based source and playlist filtering is bypassed. Only matters
  if you enable the MCP provider.
- **#133 — refuse an empty username when updating a user.** Small input-validation bug.
- **#33 — startup argument to reset the auth db.** A recovery path, not a weakness.

### What is done well

Worth stating, because reviews tend to list only problems:

- The frontend wheel is pinned by tag **and** sha256, verified before install, failing
  closed.
- SQL is fully parameterised, with list parameters expanded into bind placeholders rather
  than string-joined.
- Password hashing uses a per-user random salt combined with the server id — the
  construction is right, only the iteration count and algorithm choice are dated.
- Remote access is off by default and does not connect at idle.

## Recommendations

Ranked by value per unit of effort. "Yours" means you can do it in these two repositories
without upstream.

| # | Action | Effort | Whose |
| --- | --- | --- | --- |
| 1 | **Merge the 23 upstream commits now.** The onboarding and roles epic is landing in the 13 files the fork rewrote. This gets harder every week. | M | **Yours** |
| 2 | **Gate `loadAll()` on a row-count ceiling** (`useItemSource.ts:519`). Today, sorting a client-only column on a 100k library issues 50 deepening queries and copies the array on every page. | S | **Yours** |
| 3 | **Drop `ui-avatars.com`** (`MediaItemThumb.vue:113`). One caller; render initials locally. Removes the only always-on third-party call in the request path. | S | **Yours** |
| 4 | **Digest-pin the server base image** in `music_assistant_lm/Dockerfile`, and have `sync_upstream.py` resolve the digest. Extends the discipline you already apply to the frontend wheel. | S | **Yours** |
| 5 | Fix the stale `total.value` race in `loadAll()` and the seek that depends on it. | S | **Yours** |
| 6 | Raise **shairport-sync 4.3.7 → 5.x** upstream. Network-facing daemon, a major behind, security fixes in between. | S to report | Upstream |
| 7 | Raise the **`aiolibdatachannel` mutable-branch pin** upstream. A shipped release depends on a branch that can move or vanish. | S to report | Upstream |
| 8 | Ask upstream for **keyset pagination** on library listings. The single biggest structural win for 100k libraries. | M | Upstream |
| 9 | Pick up the cheap bucket-A issues that land in fork-owned files: **#134**, **#23**, **#68**, **#43**, **#39**, **#44**, **#54**. | S each | **Yours** |
| 10 | Note **#96 / #94** (Music Assistant OS) as a strategic watch item — a bundled OS image could change how app repositories like yours are distributed. | — | Watch |

Two things explicitly **not** recommended: migrating off SQLite, and tightening
`apparmor.txt` locally. Both trade a solvable problem for a permanent maintenance burden.
