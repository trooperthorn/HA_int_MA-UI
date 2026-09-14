import {
  setVolume,
  toggleGroup,
  toggleMaster,
  toggleMute,
  toggleZone,
} from "@/flow/actions";
import type { GraphNode } from "@/flow/derive";
import { normalizeFlowConfig } from "@/flow/flowConfig";
import { PendingStore } from "@/flow/optimistic";
import type { Player } from "@/plugins/api/interfaces";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  playerCommandPower: vi.fn(async () => {}),
  playerCommand: vi.fn(async () => {}),
  playerCommandVolumeSet: vi.fn(async () => {}),
  playerCommandVolumeMute: vi.fn(async () => {}),
}));

vi.mock("@/plugins/api", () => ({
  api: {
    playerCommandPower: mocks.playerCommandPower,
    playerCommand: mocks.playerCommand,
    playerCommandVolumeSet: mocks.playerCommandVolumeSet,
    playerCommandVolumeMute: mocks.playerCommandVolumeMute,
  },
}));

const config = normalizeFlowConfig({
  channel: "cast",
  feed_aliases: ["AUDIO2", "Source 2"],
  zones: [
    { player_id: "media_player.rx_main" },
    { player_id: "media_player.zone_11" },
  ],
  groups: [
    {
      id: "downstairs",
      name: "Downstairs",
      members: ["media_player.rx_main", "media_player.zone_11"],
    },
  ],
  masters: [{ player_id: "media_player.unit_1", feed_source: "Source 2" }],
  optimistic_ttl: 5000,
});

const node = (overrides: Partial<GraphNode>): GraphNode =>
  ({
    id: "zone:x",
    kind: "zone",
    playerId: "x",
    name: "x",
    subtitle: { key: "" },
    found: true,
    available: true,
    inPath: false,
    partial: false,
    offPath: false,
    pending: false,
    muted: false,
    ...overrides,
  }) as GraphNode;

function context(players: Record<string, Partial<Player>> = {}) {
  return {
    players: players as Record<string, Player>,
    config,
    pending: new PendingStore(),
    now: () => 1000,
  };
}

describe("flow actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("switches a zone on, waits, then selects the feed input it offers", async () => {
    const ctx = context({
      "media_player.rx_main": {
        powered: false,
        source_list: [
          { id: "HDMI1", name: "HDMI1", passive: false },
          { id: "AUDIO2", name: "AUDIO2", passive: false },
        ] as never,
      },
    });
    const done = toggleZone(ctx, config.zones[0], node({ inPath: false }));
    await vi.advanceTimersByTimeAsync(300);
    await done;

    expect(mocks.playerCommandPower).toHaveBeenCalledWith(
      "media_player.rx_main",
      true,
    );
    expect(mocks.playerCommand).toHaveBeenCalledWith(
      "media_player.rx_main",
      "select_source",
      { source: "AUDIO2" },
    );
    expect(ctx.pending.has("media_player.rx_main")).toBe(true);
  });

  it("skips the power command for a zone that is already on", async () => {
    const ctx = context({ "media_player.zone_11": { powered: true } });
    await toggleZone(ctx, config.zones[1], node({ inPath: false }));
    expect(mocks.playerCommandPower).not.toHaveBeenCalled();
    // no list to match against: the first alias is sent
    expect(mocks.playerCommand).toHaveBeenCalledWith(
      "media_player.zone_11",
      "select_source",
      { source: "AUDIO2" },
    );
  });

  it("switches a zone in the path off", async () => {
    const ctx = context();
    await toggleZone(ctx, config.zones[0], node({ inPath: true }));
    expect(mocks.playerCommandPower).toHaveBeenCalledWith(
      "media_player.rx_main",
      false,
    );
    expect(mocks.playerCommand).not.toHaveBeenCalled();
  });

  it("completes a partial group rather than restarting it", async () => {
    const ctx = context({
      "media_player.rx_main": { powered: true },
      "media_player.zone_11": { powered: false },
    });
    const members = new Map([
      ["media_player.rx_main", node({ inPath: true })],
      ["media_player.zone_11", node({ inPath: false })],
    ]);
    const done = toggleGroup(
      ctx,
      config.groups[0],
      node({ kind: "group", partial: true }),
      members,
    );
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(mocks.playerCommandPower).toHaveBeenCalledTimes(1);
    expect(mocks.playerCommandPower).toHaveBeenCalledWith(
      "media_player.zone_11",
      true,
    );
    expect(ctx.pending.has("group:downstairs")).toBe(true);
  });

  it("switches every member off for a group in the path", async () => {
    const ctx = context();
    await toggleGroup(
      ctx,
      config.groups[0],
      node({ kind: "group", inPath: true }),
      new Map(),
    );
    expect(mocks.playerCommandPower.mock.calls).toEqual([
      ["media_player.rx_main", false],
      ["media_player.zone_11", false],
    ]);
  });

  it("uses the master's own feed input", async () => {
    const ctx = context({ "media_player.unit_1": { powered: false } });
    const done = toggleMaster(
      ctx,
      config.masters[0],
      node({ kind: "master", inPath: false }),
    );
    await vi.advanceTimersByTimeAsync(300);
    await done;
    expect(mocks.playerCommand).toHaveBeenCalledWith(
      "media_player.unit_1",
      "select_source",
      { source: "Source 2" },
    );
  });

  it("clamps the volume and records mute as an expectation", async () => {
    const ctx = context();
    await setVolume(ctx, "media_player.rx_main", 140);
    expect(mocks.playerCommandVolumeSet).toHaveBeenCalledWith(
      "media_player.rx_main",
      100,
    );
    await toggleMute(ctx, "media_player.rx_main", false);
    expect(mocks.playerCommandVolumeMute).toHaveBeenCalledWith(
      "media_player.rx_main",
      true,
    );
    expect(
      ctx.pending.overlay("media_player.rx_main", {
        volume_muted: false,
        volume_level: 10,
        extra_attributes: {},
      } as never),
    ).toMatchObject({ volume_level: 100, volume_muted: true });
  });
});
