# The Sendspin SDK patch

The web player is `@sendspin/sendspin-js` 5.0.0. The fork does not carry a
copy of the library; it patches the installed package at install time with
[pnpm's patch mechanism](https://pnpm.io/cli/patch). The diff lives in
`patches/@sendspin__sendspin-js@5.0.0.patch`, is registered under
`patchedDependencies` in `pnpm-workspace.yaml`, and `pnpm install` applies it
on every machine and in CI, so the built frontend and the app wheel carry it
without a separate step. The upstream project is not sent these changes
(house rule: no contributions to repositories outside trooperthorn).

## What it changes

**FLAC through WebCodecs** (`dist/audio/decoder.js`). Upstream decodes Opus
with the browser's `AudioDecoder` and FLAC by prepending the stream header to
every chunk and calling `decodeAudioData` on an `OfflineAudioContext`, a
whole-file API run once per chunk on the main thread. Chromium's
`AudioDecoder` also takes `codec: "flac"` with a `description` of the `fLaC`
marker plus the STREAMINFO block, which is exactly the `codec_header` the
server sends in `stream/start`, and the server sends one FLAC frame per
chunk, which is the unit the WebCodecs FLAC registration expects. The patch
routes FLAC through the same native path as Opus: `nativeDecoderWanted`,
`disableNativeDecoder` and `webCodecsConfig` generalise the Opus-only code,
the decoder is reconfigured when the codec or header changes, and any
failure (no `AudioDecoder`, `isConfigSupported` false, a configure error)
falls back to the upstream `decodeAudioData` path for that codec only. Log
lines carry `[NativeFlac]` beside the existing `[NativeOpus]`.

**`latencyHint` for the AudioContext** (`dist/audio/scheduler.js`,
`dist/index.js`, `dist/types.d.ts`). Upstream creates the context with only
a sample rate, so the browser uses `interactive`, the smallest output
buffer the device allows. A new `latencyHint` option on `SendspinPlayerConfig`
is passed through to the scheduler and on to the `AudioContext`; unset keeps
upstream behaviour. The fork passes `playback` on phones, where a larger,
power-friendly buffer survives the WebView being throttled; the SDK's
output-latency tracker measures and compensates the added latency, so sync
is unaffected.

**Controller and device lifecycle contract** (`dist/core/core.js`,
`dist/core/protocol-handler.js`, `dist/index.js`, and declarations). A client
may advertise only its implemented roles, including a controller without a
player role. A controller-only hello omits `player@v1_support`, so Music
Assistant does not mistake it for an audio destination. Controller commands
require an advertised server capability; absolute seek also requires a safe
integer within `seek_max_ms`, and relative seek requires a signed safe
integer. The patch exposes `setAvailable(boolean)` for non-interruptible
external activity and `leaveGroup()` for interruptible activity. Returning to
available does not automatically rejoin a former group; the client must send
the server-advertised `switch` command or use Music Assistant group controls.

**Current player delay wire** (`dist/core/protocol-handler.js`, declarations).
The browser player reports `output_delay_ms` and advertises `volume`, `mute`,
and `set_output_delay` in its initial `client/state`, as the current Sendspin
player specification requires. Its hello carries formats and buffer capacity,
without the legacy command list. It accepts a current `set_output_delay`
command and retains a receive-only `set_static_delay` fallback for older
servers. The Music Assistant image's pinned aiosendspin 9.1.1 requires the
corresponding output-delay compatibility patch before this browser wire is
deployed; the old app image continues to pin its prior frontend wheel.

**Role activation and revocation** (`dist/core/transport.js`,
`dist/core/protocol-handler.js`, `dist/core/state-manager.js`). A first
`server/activate` without `active_roles` means no roles are active. If a
later activity change makes the connection unable to carry playback roles,
the transport clears them when the empty-role activation is otherwise
authorized. Revoked metadata and controller state is discarded immediately;
revoking the player role also stops and clears its audio. When the player
role returns, its next state is a full snapshot.

**Scheduled metadata** (`dist/core/protocol-handler.js`,
`dist/core/state-manager.js`). A future `server/state.metadata.timestamp` holds
one pending track update while the current track remains visible. A newer
pending update replaces it; an immediate update, role revocation, pairing, or
transport reset cancels it. Metadata snapshots replace the old snapshot, so an
omitted `progress` field clears the prior track position. The client translates
server timestamps with its current clock estimate. This also supports a
metadata-only client without advertising an audio player.

**Clock-synchronized readiness** (`dist/core/protocol-handler.js`,
`dist/core/time-sync-manager.js`, `dist/core/core.js`). A player reports
`available: false` until its first successful clock-sync burst, then sends
an updated state with `available: true`. A transport loss resets that clock
estimate, so reconnecting cannot advertise a player as ready using stale
timing. Controller-only clients remain available without audio clock sync.

**Client format preference** (`dist/core/protocol-handler.js`,
`dist/core/core.js`, `dist/index.js`, and declarations). A player may request
one of the formats it advertised in `client/hello` through
`preferredFormat` or `setPreferredFormat()`. The SDK rejects a format it
did not advertise. Runtime changes send a player-state delta; passing
`null` clears the preference. Music Assistant's player configuration can
still override the request when its encoding policy requires it.

## Changing or refreshing it

```bash
pnpm patch @sendspin/sendspin-js@5.0.0 --edit-dir ~/workspace/sendspin-js-patch
# edit the files under ~/workspace/sendspin-js-patch/dist
pnpm patch-commit ~/workspace/sendspin-js-patch
```

The edit directory must sit outside the repository. When the library is
upgraded, the patch has to be re-recorded against the new version (pnpm
refuses to apply a patch whose file names or context no longer match), so a
bump is the moment to check whether upstream has taken either change.

## Tests

`tests/plugins/sendspin_native_flac.test.ts` drives the real decoder with a
fake `AudioDecoder` and checks that a FLAC chunk configures it with the
header as the description; `tests/components/SendspinPlayer.test.ts` checks
that a phone passes `latencyHint: "playback"`.
`tests/plugins/sendspin_controller_contract.test.ts` exercises the patched
package with a controller-only hello, availability and leave messages, and
server-bounded seek commands.
`tests/plugins/sendspin_player_wire.test.ts` checks the current hello/state
layout, output-delay acknowledgement, the legacy command fallback, and role
activation and revocation.
The same fixture covers player readiness before and after clock sync and
after a transport loss.
It also verifies preferred-format selection, runtime change, rejection of
unsupported formats, and clearing the preference.
`tests/plugins/sendspin_scheduled_metadata.test.ts` covers future-track timing,
replacement, omitted progress, revocation, and transport reset.
