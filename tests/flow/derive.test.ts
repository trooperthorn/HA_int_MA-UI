import { deriveModel, selectionClosure } from "@/flow/derive";
import { normalizeFlowConfig } from "@/flow/flowConfig";
import { PendingStore } from "@/flow/optimistic";
import {
  PlaybackState,
  PlayerFeature,
  type Player,
} from "@/plugins/api/interfaces";
import { describe, expect, it } from "vitest";

function player(overrides: Partial<Player> & { player_id: string }): Player {
  return {
    provider: "hass_players",
    type: "player",
    name: overrides.player_id,
    available: true,
    powered: false,
    playback_state: PlaybackState.IDLE,
    volume_level: 50,
    volume_muted: false,
    supported_features: [PlayerFeature.VOLUME_SET, PlayerFeature.VOLUME_MUTE],
    source_list: [],
    extra_attributes: {},
    current_media: null,
    ...overrides,
  } as unknown as Player;
}

const config = normalizeFlowConfig({
  channel: "cast",
  feed_aliases: ["AUDIO2", "Source 2"],
  zones: [
    { player_id: "media_player.rx_main", name: "Great Room" },
    {
      player_id: "media_player.zone_11",
      name: "Kitchen",
      volume: { display: "raw", max: 38 },
    },
  ],
  groups: [
    {
      id: "downstairs",
      name: "Downstairs",
      members: ["media_player.rx_main", "media_player.zone_11"],
    },
  ],
  masters: [{ player_id: "media_player.unit_1", feed_source: "Source 2" }],
});

const playersOn = () => ({
  cast: player({
    player_id: "cast",
    name: "Chromecast",
    playback_state: PlaybackState.PLAYING,
    volume_level: 40,
  }),
  "media_player.rx_main": player({
    player_id: "media_player.rx_main",
    powered: true,
    extra_attributes: { hass_source: "AUDIO2" },
    source_list: [
      { id: "AUDIO2", name: "AUDIO2", passive: false },
      { id: "HDMI1", name: "HDMI1", passive: false },
    ] as never,
  }),
  "media_player.zone_11": player({
    player_id: "media_player.zone_11",
    powered: true,
    volume_level: 58,
    extra_attributes: { hass_source: "Source 1" },
  }),
  "media_player.unit_1": player({
    player_id: "media_player.unit_1",
    powered: false,
  }),
});

describe("deriveModel", () => {
  it("puts a zone on the feed input in the path and one on another input off it", () => {
    const model = deriveModel(playersOn(), config, new PendingStore(), {
      media: { title: "Uprising", artist: "Muse", image_url: "x" } as never,
      state: PlaybackState.PLAYING,
    });

    expect(model.input.inPath).toBe(true);
    expect(model.input.subtitle).toEqual({
      key: "flow.title_artist",
      args: { title: "Uprising", artist: "Muse" },
    });
    expect(model.channel.inPath).toBe(true);
    expect(model.channel.subtitle).toEqual({
      key: "flow.streaming_volume",
      args: { volume: 40 },
    });

    const [main, kitchen, group, master] = model.mixes;
    expect(main).toMatchObject({ kind: "zone", inPath: true, offPath: false });
    expect(kitchen).toMatchObject({
      kind: "zone",
      inPath: false,
      offPath: true,
      subtitle: { key: "flow.source", args: { source: "Source 1" } },
    });
    expect(group).toMatchObject({
      kind: "group",
      partial: true,
      memberActive: 1,
      memberTotal: 2,
      subtitle: { key: "flow.group_partial", args: { active: 1, total: 2 } },
    });
    expect(master).toMatchObject({ kind: "master", inPath: false });

    // only the zone in the path is an output
    expect(model.outputs.map((out) => out.playerId)).toEqual([
      "media_player.rx_main",
    ]);
    const active = model.links.filter((link) => link.active);
    expect(active.map((link) => `${link.kind}:${link.toId}`)).toEqual([
      "input:channel:cast",
      "channel:zone:media_player.rx_main",
      "channel:group:downstairs",
      "output:out:media_player.rx_main",
    ]);
  });

  it("shows the device steps beside the percent when asked", () => {
    const players = playersOn();
    players["media_player.zone_11"].extra_attributes = {
      hass_source: "Source 2",
    };
    const model = deriveModel(players, config, new PendingStore());
    const kitchen = model.outputs.find(
      (out) => out.playerId === "media_player.zone_11",
    )!;
    expect(kitchen.readout).toBe("22/38");
    expect(kitchen.hasVolume).toBe(true);
  });

  it("never matches an unknown input and marks a missing player", () => {
    const players = playersOn();
    players["media_player.rx_main"].extra_attributes = {
      hass_source: "Unknown",
    };
    delete (players as Record<string, Player>)["media_player.zone_11"];
    const model = deriveModel(players, config, new PendingStore());
    expect(model.mixes[0]).toMatchObject({ inPath: false, offPath: true });
    expect(model.mixes[1]).toMatchObject({
      found: false,
      subtitle: { key: "flow.player_not_found" },
    });
  });

  it("draws an expectation with a pending mark until the player confirms", () => {
    const players = playersOn();
    players["media_player.zone_11"].powered = false;
    const pending = new PendingStore();
    pending.set(
      "media_player.zone_11",
      { powered: true, source: "Source 2" },
      8000,
      1000,
    );

    const before = deriveModel(players, config, pending);
    expect(before.mixes[1]).toMatchObject({ inPath: true, pending: true });

    players["media_player.zone_11"].powered = true;
    players["media_player.zone_11"].extra_attributes = {
      hass_source: "Source 2",
    };
    pending.reconcile(players, 2000);
    expect(pending.isEmpty()).toBe(true);
    const after = deriveModel(players, config, pending);
    expect(after.mixes[1]).toMatchObject({ inPath: true, pending: false });
  });

  it("drops an expectation the device never confirmed once the time is up", () => {
    const players = playersOn();
    const pending = new PendingStore();
    pending.set("media_player.unit_1", { powered: true }, 8000, 1000);
    pending.reconcile(players, 5000);
    expect(pending.has("media_player.unit_1")).toBe(true);
    pending.reconcile(players, 9001);
    expect(pending.has("media_player.unit_1")).toBe(false);
  });
});

describe("selectionClosure", () => {
  it("traces a group through its members to their outputs", () => {
    const model = deriveModel(playersOn(), config, new PendingStore());
    const keep = selectionClosure(model, "group:downstairs")!;
    expect([...keep].sort()).toEqual(
      [
        "input:",
        "channel:cast",
        "group:downstairs",
        "zone:media_player.rx_main",
        "zone:media_player.zone_11",
        "out:media_player.rx_main",
      ].sort(),
    );
    expect(selectionClosure(model, null)).toBeNull();
  });

  it("traces the channel to everything carrying audio", () => {
    const model = deriveModel(playersOn(), config, new PendingStore());
    const keep = selectionClosure(model, "channel:cast")!;
    expect(keep.has("zone:media_player.rx_main")).toBe(true);
    expect(keep.has("group:downstairs")).toBe(true);
    expect(keep.has("zone:media_player.zone_11")).toBe(false);
  });
});
