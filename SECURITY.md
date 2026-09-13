# Security Policy

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, private
addresses, or logs. Use GitHub's private vulnerability-reporting feature for
this repository. If private reporting is unavailable, open a minimal issue
asking the maintainer to establish a private channel; omit technical details.

Include the affected version/commit, prerequisites, impact, a minimal
reproduction, and suggested remediation. Remove tokens, API keys, cookies,
usernames, and private network details.

Vulnerabilities in the upstream frontend that are not specific to this fork
belong to [music-assistant/frontend](https://github.com/music-assistant/frontend);
report them there so every install benefits, not only this one.

## Response targets

These are project targets, not an SLA: acknowledge critical/high reports in
three business days, establish severity and containment in seven, and publish
a coordinated fix/advisory as soon as safely validated. Lower-severity issues
are prioritized by exploitability and impact.

## Supported version

Only the latest published release (CalVer `vYYYY.MM.DD.N`) and the default
branch receive security fixes. There is no backport branch: the wheel is
rebuilt from `main`, so the fix for any report is the next release.

## Security boundaries

This repository is a fork of the Music Assistant frontend. It publishes one
artifact — the `music_assistant_frontend` wheel attached to each release —
which [trooperthorn/ha_app_music_assistant](https://github.com/trooperthorn/ha_app_music_assistant)
installs over the upstream package inside the Music Assistant server image.

What is in scope here:

- The Vue application in `src/` and the bundle built from it.
- This repository's npm dependency tree and lockfile.
- The release workflow that builds and publishes the wheel.

What is not:

- The Music Assistant server, its Debian base image and its Python
  dependencies. Those ship in the upstream container image and are fixed by
  upstream's next release.
- The signaling service used by Remote Access
  (`wss://signaling.music-assistant.io`), which this project does not operate.

The frontend runs inside a Home Assistant app holding `host_network`,
`SYS_ADMIN` and `DAC_READ_SEARCH`. Treat a bug that lets attacker-controlled
script run in this bundle as higher severity than the same bug would be on an
ordinary web page.

## Dependency handling

Dependency install scripts are gated by pnpm's `allowBuilds` allowlist in
`pnpm-workspace.yaml`, not by `ignore-scripts`; see the note in `.npmrc`.
Advisories in build-time-only transitives are pinned forward with scoped
entries under `overrides` in the same file, using ranges so an upstream bump
still resolves.

## Known dependency gaps

Two dependencies are carried deliberately rather than fixed. Both are
inherited from upstream, and in both cases removing them would cost more than
the exposure is worth. They are recorded here so the decision is visible and
can be revisited rather than rediscovered.

### butterchurn — outside advisory coverage

`butterchurn` is installed from a GitHub release tarball on
`music-assistant/butterchurn`, not from npm:

```
"butterchurn": "https://github.com/music-assistant/butterchurn/releases/download/v3.0.0-beta.5.ma.2/..."
```

**The gap:** no advisory database covers a tarball dependency. Dependabot
cannot raise an alert against it and `pnpm audit` does not see it, so it is a
blind spot by construction — not because anything is known to be wrong with
it, but because nothing is watching. It is also a pre-release of a fork of a
project whose own npm releases stopped in 2019. Its sibling
`butterchurn-presets` *is* an npm package, so advisories do reach it, but it
was last published in June 2018 and is unmaintained in practice.

**What limits it:**

- `pnpm-lock.yaml` pins the tarball by `sha512`, so the bytes cannot change
  under us even if the release asset is replaced.
- Install scripts are refused unless allowlisted in `allowBuilds`, and neither
  package is on that list.
- Both are loaded with `await import(...)`, so they are lazy chunks rather
  than part of the main bundle.
- The visualizer that uses them is gated on the `milkdrop_visualizer` server
  plugin. Where that plugin is not enabled, nothing on this path ever loads.

**Why it is accepted:** removing the feature would delete 21 files and diverge
permanently from upstream on every one of them, against a project preference
to stay cheaply mergeable. That is a poor trade for a blind spot with nothing
currently behind it.

**What would change the decision:** enabling `milkdrop_visualizer`, which puts
a WebGL and WASM path that parses preset expressions into live use; or the
upstream release asset disappearing, which would break installs. Mirroring the
tarball to this fork's own releases is the cheaper answer to the second, and
does not require removing anything.

### opus-encdec — abandoned, and kept unreachable

`opus-encdec` (2021, pre-1.0, single maintainer, no newer release) arrives
through `@sendspin/sendspin-js` as a fallback Opus decoder. It decodes
untrusted audio and is compiled WASM, so it is the kind of dependency worth
keeping away from.

It is not removable — it is a transitive of a package the web player needs —
but it is unreachable: `SendspinPlayer.vue` requests the `opus` codec only
when `AudioDecoder` exists, and asks for `flac`/`pcm` otherwise, so no browser
negotiates a stream that would load it. See the comment there for why the
browser-side default was not enough on its own.
