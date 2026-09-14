import FlowSettings from "@/views/settings/FlowSettings.vue";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setUserPreference: vi.fn(async () => {}),
  preferences: {} as Record<string, unknown>,
}));

vi.mock("@/plugins/api", () => {
  const api = {
    players: {
      cast: { player_id: "cast", name: "Chromecast", type: "player" },
      "media_player.rx_main": {
        player_id: "media_player.rx_main",
        name: "RX-A3080 Main",
        type: "player",
        source_list: [
          { id: "AUDIO2", name: "AUDIO2", passive: false },
          { id: "External", name: "External", passive: true },
        ],
      },
      "media_player.zone_11": {
        player_id: "media_player.zone_11",
        name: "Zone 11",
        type: "player",
      },
      proto: { player_id: "proto", name: "AirPlay", type: "protocol" },
    },
  };
  return { api, default: api };
});

vi.mock("@/composables/userPreferences", async () => {
  const { computed } = await import("vue");
  return {
    setUserPreference: mocks.setUserPreference,
    useUserPreferences: () => ({
      getPreference: <T>(key: string, fallback: T) =>
        computed(() => (mocks.preferences[key] as T) ?? fallback),
    }),
  };
});

vi.mock("@/views/settings/SettingsHeaderCard.vue", () => ({
  default: { name: "SettingsHeaderCard", template: "<header />" },
}));

vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("vue-i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-i18n")>()),
  useI18n: () => ({ t: (key: string) => key }),
}));

// transitive imports reach for the app-wide translator
vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));

enableAutoUnmount(afterEach);

function mountPage() {
  return mount(FlowSettings, {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

describe("FlowSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preferences = {};
  });

  it("offers every real player and saves a topology", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const channel = wrapper.find("[data-testid='channel']");
    expect(channel.findAll("option").map((option) => option.text())).toEqual([
      "settings.flow.none",
      "Chromecast",
      "RX-A3080 Main",
      "Zone 11",
    ]);
    await channel.setValue("cast");
    await wrapper
      .find("[data-testid='feed-aliases']")
      .setValue("AUDIO2, Source 2");

    await wrapper.find("[data-testid='add-zone']").trigger("click");
    await wrapper.find("[data-testid='add-zone']").trigger("click");
    const zones = wrapper.findAll("[data-zone]");
    expect(zones).toHaveLength(2);
    // the first free player is picked for each new zone
    expect(
      zones.map(
        (row) => (row.find("select").element as HTMLSelectElement).value,
      ),
    ).toEqual(["cast", "media_player.rx_main"]);
    await zones[0].find("select").setValue("media_player.zone_11");
    await zones[0].findAll("input")[0].setValue("Kitchen");
    await zones[0].findAll("select")[1].setValue("raw");
    await zones[0].find("input[type='number']").setValue("38");

    await wrapper.find("[data-testid='add-group']").trigger("click");
    const group = wrapper.find("[data-group]");
    await group.find("input").setValue("Downstairs");
    await group.findAll("[role='checkbox']")[0].trigger("click");

    await wrapper.find("[data-testid='save']").trigger("click");
    await flushPromises();
    expect(mocks.setUserPreference).toHaveBeenCalledWith("flow.config", {
      input: undefined,
      channel: "cast",
      feed_aliases: ["AUDIO2", "Source 2"],
      zones: [
        {
          player_id: "media_player.zone_11",
          name: "Kitchen",
          volume: { display: "raw", max: 38 },
        },
        { player_id: "media_player.rx_main" },
      ],
      groups: [
        {
          id: expect.stringMatching(/^group-/),
          name: "Downstairs",
          members: ["media_player.zone_11"],
        },
      ],
      masters: [],
      optimistic_ttl: 8000,
    });
  });

  it("loads the stored topology and discards edits", async () => {
    mocks.preferences = {
      "flow.config": {
        channel: "cast",
        feed_aliases: ["AUDIO2"],
        zones: [{ player_id: "media_player.rx_main", name: "Great Room" }],
        masters: [
          { player_id: "media_player.zone_11", feed_source: "Source 2" },
        ],
      },
    };
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.findAll("[data-zone]")).toHaveLength(1);
    expect(wrapper.findAll("[data-master]")).toHaveLength(1);
    const save = wrapper.find("[data-testid='save']");
    expect(save.attributes("disabled")).toBeDefined();

    await wrapper.find("[data-testid='add-zone']").trigger("click");
    expect(wrapper.findAll("[data-zone]")).toHaveLength(2);
    expect(
      wrapper.find("[data-testid='save']").attributes("disabled"),
    ).toBeUndefined();
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "settings.flow.discard")!
      .trigger("click");
    expect(wrapper.findAll("[data-zone]")).toHaveLength(1);
  });
});
