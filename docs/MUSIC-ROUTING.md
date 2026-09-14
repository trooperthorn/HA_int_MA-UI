# Music routing

The page at `/flow` shows whole-home audio as a signal path and routes it
with taps, modeled on the Audio Flow view in Elgato Wave Link. It replaces
the `music-flow-card` Home Assistant card with the same four questions,
answered from Music Assistant's own players: what is playing, where is it
streaming, which zones should hear it, and how loud each zone is right now.

It was built for this topology and works for any setup with the same shape,
a source player, a streaming target, and source-selectable zones:

```
Music Assistant  -->  Chromecast Audio  --optical split-->  Yamaha RX-A3080 zones
                                                       \->  Monoprice 6-zone amp zones
```

## The four columns

| Column   | Shows                                   | Tap                                                                             |
| -------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| Inputs   | The music source with the current track | Traces its signal path                                                          |
| Channels | The player the music streams to         | Traces its signal path                                                          |
| Mixes    | Every zone, group and master            | Routes audio: powers the zone on and selects the feed input; again to power off |
| Outputs  | Only the zones playing right now        | Volume slider, mute, and readout per zone                                       |

Clicking any node traces its full path in the stage colors (source to
stream, stream to zone, zone to output) and dims everything else. Muted
stages render as dashed links. The Clear selection button resets.

## What Music Assistant knows, and what it cannot see

The Chromecast is a native Music Assistant player. The receiver and
amplifier zones arrive through the Home Assistant player provider, which
imports every Home Assistant media player with power, volume and mute. That
provider does not mirror the entity's inputs upstream, so the Home Assistant
app repository ([trooperthorn/ha_app_music_assistant](https://github.com/trooperthorn/ha_app_music_assistant))
edits it at image build time: the entity's `source_list` becomes selectable
player sources, its current `source` is mirrored as
`extra_attributes.hass_source`, and `select_source` calls
`media_player.select_source`. Without that edit the page draws the graph but
cannot switch a zone's input, and the zone tiles never show which input they
are on.

Nothing on either side can see the optical split, so the wiring is
configuration: which player streams, and which input on each zone carries
that stream.

## Setting it up

Settings, User Interface, Music routing. Stored with your profile.

- **Music source player**: the player whose queue is the music. Leave empty
  to follow the active player.
- **Streaming player**: the player the music streams to, usually the
  Chromecast. Its playing or paused state lights the first link.
- **Feed input names**: input names that carry the stream on any zone, such
  as `AUDIO2` on the Yamaha and `Source 2` on the Monoprice. A zone whose
  input list contains one of them resolves automatically.
- **Zones**: one row per receiver or amplifier zone. Name is optional (the
  player's name is used), Feed input overrides the aliases for this zone,
  Volume readout can show the device's own steps (`22/38` on a Monoprice)
  beside the percent.
- **Groups**: a named set of zones acted on together. A partial group shows
  "n of m zones on" and tapping it completes the group rather than
  restarting it. Groups are sets on this page, not Home Assistant group
  helpers: Music Assistant does not carry a helper's member list.
- **Masters**: players whose commands switch a whole unit in firmware, such
  as the Monoprice master zones 10, 20 and 30. One tap enables every zone of
  the unit and sets their input. The child zones confirm on the
  integration's next poll.
- **Confirmation timeout**: how long a tap is shown as expected before the
  device has confirmed it (8 seconds by default, sized for the Monoprice
  five second poll).

## How routing works

- A zone is **in the signal path** when it is powered on and its input
  matches its resolved feed name. An input of `Unknown` never matches; a zone
  that is on with a different input renders half-bright with its actual
  input shown.
- Activating a zone sends power on, waits briefly (receivers coming out of
  standby ignore an instant input change), then select source with the
  resolved feed name. A zone that is already on only gets the input change.
- Every tap renders its expected result immediately, marked with a spinner
  until the device confirms. If a device never confirms within the timeout,
  the expectation is dropped and the page shows device truth again. What you
  see during the pending window is intent, not confirmed state.
- The volume slider sends a beat after the last movement; mute sends at
  once. Controls are hidden when the player does not offer them.

## Where the code lives

- `src/flow/flowConfig.ts`: the topology and its normalization.
- `src/flow/derive.ts`: players plus config to the graph, and the
  click-to-trace closure.
- `src/flow/optimistic.ts`: expectations and the overlay the graph reads.
- `src/flow/actions.ts`: the player commands behind every tap.
- `src/flow/FlowView.vue`, `FlowGraph.vue`, `FlowNode.vue`, `FlowOutput.vue`:
  the page, the four columns with the link overlay, a tile, an output row.
- `src/views/settings/FlowSettings.vue`: the settings page.
- `tests/flow/`: the model, the actions, the page and the settings page.
