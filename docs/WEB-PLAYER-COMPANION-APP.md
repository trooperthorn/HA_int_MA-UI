# The web player and the Home Assistant Companion app

Why the built-in web player registers as a player in a browser but often never
appears in the Home Assistant Companion app.

Written 2026-09-13 against this fork at `d8784ac` and
`@sendspin/sendspin-js@5.0.0` (since patched at install time, see
`SENDSPIN-JS-PATCH.md`).

**Nothing here was executed.** No build was run, no WebView was attached, no
device was tested. Every finding is from reading this repository's source, the
published Sendspin SDK tarball and upstream documentation. The `file:line`
references are verified; the conclusions drawn from them are not, and the
sections below say which is which.

Related documents already on this branch:
[UPSTREAM-BACKLOG-REVIEW.md](UPSTREAM-BACKLOG-REVIEW.md), and in the app
repository `docs/upstream-review.md` and `docs/upstream-review-notes.md`.

## The symptom, stated precisely

The web player works in a desktop or mobile browser but is not offered as a
player option inside the HA Companion app.

"Not visible" and "visible but silent" are different faults with different
causes, and the distinction drives everything below. A player appears in the
list only once it has registered with the server over Sendspin —
`isSelectablePlayer` (`src/helpers/players.ts:87-96`) filters on `enabled`,
`available` and `!needs_setup`, all of which are server-side state. So an
absent player means **registration never completed**, not that audio failed.

## First, a naming trap

`src/plugins/companion.ts` is **not** about the Home Assistant Companion app.
It integrates the *Music Assistant* desktop companion app (Tauri), detected
through `window.__TAURI__` or `window.__COMPANION__`.

It matters because it short-circuits the mode resolver
(`src/plugins/web_player.ts:187-190`):

```ts
// Companion mode handles audio natively, so it always wins.
if (companionMode.value) {
  return WebPlayerMode.DISABLED;
}
```

The HA app sets neither global, so this is not what is disabling the player.
But it is the first thing anyone grepping for "companion" will find, and it
reads exactly like the answer.

## Five gates, any one of which produces the same symptom

There is no single root cause to name. Five independent conditions each end
with no player in the list. They are ordered by how likely they are to be the
one biting in a given install.

### 1. The mode resolver

`resolvePreferredMode()` (`src/plugins/web_player.ts:179-217`) returns
`DISABLED` when any of these hold: Tauri companion mode, a party guest without
listen-in, a route carrying `meta.disableWebPlayer`, or the
`web_player_enabled` device setting being `"false"` (`:209`).

That setting lives in **per-device `localStorage`**
(`src/helpers/device_settings.ts`), and is surfaced as "Enable built-in
(Sendspin) Web Player" under Settings › Frontend
(`src/views/settings/FrontendConfig.vue:274`).

The consequence is easy to miss: the HA app's WebView has its own storage,
separate from the phone's browser. **A browser that works proves nothing about
the app.** This is the cheapest thing to check and it has to be checked from
inside the app.

### 2. An unguarded `localStorage` write

This is the most likely cause of a player that never appears at all.

`src/helpers/device_settings.ts:19-28` knows storage can be unavailable, and
guards reads accordingly:

```ts
/**
 * Read a per-device setting, or null when it is unset.
 *
 * Also null when site data is blocked, as it is in a cross-origin iframe.
 */
export function readDeviceSetting(key: string): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_PREFIX + key);
  } catch {
    return null;
  }
}
```

The registration path does not (`src/plugins/web_player.ts:357-362`):

```ts
// The sendspin client id is its Noise public key, so the SDK owns it. Mirror
// it into localStorage for the tabs and the proxy handshake that read it.
const player_id = loadSendspinClientIdentity().clientId;
window.localStorage.setItem("sendspin_webplayer_id", player_id);
this.player_id = player_id;
this.lastUpdate = Date.now();
```

If site data is blocked, `setItem` throws **before** `this.player_id` is
assigned. The ID is never set, the `DISCONNECTED` and `PLAYER_REMOVED`
subscriptions below it are never registered, `tabMode` is never applied, and no
player is ever announced to the server.

It does not recover, either. `queueModeApplication()` (`:221-231`) chains onto
a shared promise with no `.catch()`:

```ts
function queueModeApplication(): Promise<void> {
  pendingModeApplication = pendingModeApplication.then(async () => {
    ...
    await webPlayer.setMode(mode);
  });
  return pendingModeApplication;
}
```

Once `pendingModeApplication` rejects, every later `.then()` on it rejects too
— so route changes, reconnects and settings changes all stop re-applying the
mode for the rest of the session.

Whether this fires depends on how Music Assistant is reached:

- **Through ingress** (the app repository sets `ingress: true`), the frontend is
  served from Home Assistant's own origin. Same-origin, storage works.
- **Through a custom iframe panel** pointing at `http://<ip>:8095`, it is
  cross-origin. Android WebView blocks third-party site data by default, and the
  comment quoted above names exactly this case.

*Verified:* the code, the missing guard, the un-caught chain. *Inferred:* that
storage is actually blocked in any particular user's WebView.

### 3. Codec negotiation

`src/components/SendspinPlayer.vue:298-300`:

```ts
// Prefer opus for bandwidth efficiency, flac as fallback
// (opus requires secure context which may not be available)
const codecs: Codec[] = ["opus", "flac"];
```

In the SDK's `dist/core/codec-support.js`, `getBrowserSupportedCodecs()`:

- Opus needs `AudioDecoder` (WebCodecs), which requires a secure context. Over
  plain HTTP it is dropped, and the SDK logs
  `[Opus] Running in insecure context, falling back to FLAC/PCM`.
- The Safari branch returns `new Set(["pcm", "opus"])` — **no FLAC**.

`getSupportedFormats()` throws `No supported codecs` when the intersection of
requested and supported is empty. On iOS every WebView is WebKit, so an iOS
Companion app on plain HTTP would have opus removed by the secure-context check
and flac removed by the Safari branch, leaving nothing.

*This one carries real uncertainty.* The Safari test is a user-agent regex,
`/^((?!chrome|android).)*safari/i`, and the HA Companion app sets a custom user
agent that was **not** checked. If that UA does not match, the code falls
through to `["pcm", "flac"]` and flac survives. Treat this as a plausible
mechanism for the platform split, not as an established cause.

### 4. The 90-second server expiry

`src/plugins/web_player.ts:66-68`:

```ts
// Assume we timed out if after this time we did not send any updates
// This is slightly smaller than on the server (90s) to avoid false positives with isAnotherTabActive
const TIMEOUT_DURATION_MS = 75_000;
```

Mobile WebViews throttle background timers aggressively. Backgrounding the HA
app stops the updates, the server drops the player after 90 seconds, and
`PLAYER_REMOVED` (`:394`) silently falls back to controls-only:

```ts
api.subscribe(
  EventType.PLAYER_REMOVED,
  () => {
    // Player removed server-side: silently fall back to controls only.
    this.setTabMode(WebPlayerMode.CONTROLS_ONLY, true);
  },
  this.player_id,
),
```

There is no retry on this path — the mode is only re-applied by `App.vue` on
reconnect, or on navigation. This is the best explanation for the widely
reported pattern of the web player working once and being gone the next time
the app is opened.

### 5. One playback tab per storage scope

`BroadcastChannel("web-player")` (`:56`) elects a single leader so two tabs
never play at once. Any other Music Assistant tab already holding control in the
same WebView demotes this one to `CONTROLS_ONLY`, which is not a player.

## What upstream says

Upstream documentation states the web player has been tested working in the iOS
Home Assistant app but not the Android one, and advises using a supported
browser on Android.

Companion-app playback as a feature request
([discussion #396](https://github.com/orgs/music-assistant/discussions/396)) was
marked implemented in 2.5.0b11. So this is a support and environment gap, not a
missing capability.

## How to diagnose it, in order

1. **Inside the HA app's WebView**, open Settings › Frontend and check "Enable
   built-in (Sendspin) Web Player". Per-device storage means the browser's
   setting is irrelevant here.
2. Determine whether Music Assistant is reached through **ingress** or a custom
   iframe panel. If it is an iframe panel on `http://<ip>:8095`, move to
   ingress — that alone may resolve gate 2.
3. Check whether Home Assistant itself is reached over **https**. Plain HTTP
   removes Opus, and on WebKit may empty the codec set entirely.
4. Remote-debug the WebView and look for either
   `[Opus] Running in insecure context` or an exception thrown at
   `src/plugins/web_player.ts:360`.

Steps 2 and 3 are configuration. Step 4 distinguishes gate 2 from gate 3.

## Two defects worth fixing upstream

Both are small, well-scoped and independent of the environment questions above.

1. **Guard the storage write.** `src/plugins/web_player.ts:360` should use the
   same `try`/`catch` treatment `readDeviceSetting` already applies two files
   over. A blocked write should degrade the web player, not abort registration.
2. **Catch the mode-application chain.** `queueModeApplication()` (`:221-231`)
   should attach a `.catch()` so one failure does not disable mode sync for the
   remainder of the session.

Neither is fixed here; this document only records them.
