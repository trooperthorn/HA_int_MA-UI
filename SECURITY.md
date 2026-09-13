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
