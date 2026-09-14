import FlowView from "@/flow/FlowView.vue";
import { PlaybackState, PlayerFeature } from "@/plugins/api/interfaces";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  playerCommandPower: vi.fn(async () => {}),
  playerCommand: vi.fn(async () => {}),
  playerCommandVolumeSet: vi.fn(async () => {}),
  playerCommandVolumeMute: vi.fn(async () => {}),
  push: vi.fn(),
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/plugins/api", async () => {
  const { reactive } = await import("vue");
  const api = {
    players: reactive<Record<string, unknown>>({}),
    playerCommandPower: mocks.playerCommandPower,
    playerCommand: mocks.playerCommand,
    playerCommandVolumeSet: mocks.playerCommandVolumeSet,
    playerCommandVolumeMute: mocks.playerCommandVolumeMute,
  };
  return { api, default: api };
});

vi.mock("@/plugins/store", async () => {
  const { reactive } = await import("vue");
  return {
    store: reactive({ curQueueItem: undefined, activePlayer: undefined }),
  };
});

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("@/composables/userPreferences", async () => {
  const { computed } = await import("vue");
  return {
    setUserPreference: vi.fn(),
    useUserPreferences: () => ({
      getPreference: <T>(key: string, fallback: T) =>
        computed(() => (mocks.preferences[key] as T) ?? fallback),
    }),
  };
});

enableAutoUnmount(afterEach);

const player = (id: string, extra: Record<string, unknown> = {}) => ({
  player_id: id,
  name: id,
  type: "player",
  available: true,
  powered: false,
  playback_state: PlaybackState.IDLE,
  volume_level: 50,
  volume_muted: false,
  supported_features: [PlayerFeature.VOLUME_SET, PlayerFeature.VOLUME_MUTE],
  source_list: [],
  extra_attributes: {},
  current_media: null,
  ...extra,
});

function mountView() {
  return mount(FlowView, {
    global: {
      mocks: {
        $t: (key: string, args?: Record<string, unknown>) =>
          args && Object.keys(args).length
            ? `${key} ${JSON.stringify(args)}`
            : key,
      },
    },
    attachTo: document.body,
  });
}

describe("FlowView", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { api } = await import("@/plugins/api");
    for (const key of Object.keys(api.players)) delete api.players[key];
    Object.assign(api.players, {
      cast: player("cast", { playback_state: PlaybackState.PLAYING }),
      "media_player.rx_main": player("media_player.rx_main", {
        powered: true,
        extra_attributes: { hass_source: "AUDIO2" },
      }),
      "media_player.zone_11": player("media_player.zone_11"),
    });
    mocks.preferences = {
      "flow.config": {
        channel: "cast",
        feed_aliases: ["AUDIO2", "Source 2"],
        zones: [
          { player_id: "media_player.rx_main", name: "Great Room" },
          { player_id: "media_player.zone_11", name: "Kitchen" },
        ],
      },
    };
  });

  it("asks for a topology before it draws anything", async () => {
    mocks.preferences = {};
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("flow.not_configured");
    await wrapper.find("[data-testid='configure']").trigger("click");
    expect(mocks.push).toHaveBeenCalledWith({ name: "frontendflow" });
  });

  it("draws the zones, lists the one in the path as an output, and routes on tap", async () => {
    const wrapper = mountView();
    await flushPromises();

    const tiles = wrapper.findAll("[data-kind='zone']");
    expect(tiles.map((tile) => tile.text())).toEqual([
      expect.stringContaining("Great Room"),
      expect.stringContaining("Kitchen"),
    ]);
    expect(tiles[0].classes()).toContain("flow-node--in-path");
    expect(wrapper.findAll("[data-node-id^='out:']")).toHaveLength(1);

    // tapping the kitchen switches it on and to the feed; the tile shows the
    // expectation with a pending mark at once
    vi.useFakeTimers();
    try {
      await tiles[1].trigger("click");
      expect(mocks.playerCommandPower).toHaveBeenCalledWith(
        "media_player.zone_11",
        true,
      );
      await vi.advanceTimersByTimeAsync(300);
      expect(mocks.playerCommand).toHaveBeenCalledWith(
        "media_player.zone_11",
        "select_source",
        { source: "AUDIO2" },
      );
      await flushPromises();
      const kitchen = wrapper.findAll("[data-kind='zone']")[1];
      expect(kitchen.classes()).toContain("flow-node--in-path");
      expect(kitchen.find(".flow-node__pending").exists()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("traces a path on the channel and clears it again", async () => {
    const wrapper = mountView();
    await flushPromises();

    await wrapper.find("[data-kind='channel']").trigger("click");
    const kitchen = wrapper.findAll("[data-kind='zone']")[1];
    expect(kitchen.classes()).toContain("flow-node--dimmed");
    await wrapper.find("[data-testid='clear-selection']").trigger("click");
    expect(wrapper.findAll("[data-kind='zone']")[1].classes()).not.toContain(
      "flow-node--dimmed",
    );
  });

  it("sets the volume a beat after the slider stops and toggles mute at once", async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountView();
      await flushPromises();
      const slider = wrapper.find("input[type='range']");
      (slider.element as HTMLInputElement).value = "72";
      await slider.trigger("input");
      expect(mocks.playerCommandVolumeSet).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(250);
      expect(mocks.playerCommandVolumeSet).toHaveBeenCalledWith(
        "media_player.rx_main",
        72,
      );
      await wrapper.find(".flow-output__mute").trigger("click");
      expect(mocks.playerCommandVolumeMute).toHaveBeenCalledWith(
        "media_player.rx_main",
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
