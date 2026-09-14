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
