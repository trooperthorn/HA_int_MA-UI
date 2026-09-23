import SyncAdjustMenuControl from "@/layouts/default/PlayerOSD/SyncAdjustMenuControl.vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  providers: {
    sendspin: { domain: "sendspin" },
    airplay: { domain: "airplay" },
  },
  players: {} as Record<string, { extra_attributes: Record<string, unknown> }>,
  getPlayerConfigEntries: vi.fn(),
  getPlayerConfigValue: vi.fn(),
  savePlayerConfig: vi.fn(),
}));

vi.mock("@/plugins/api", () => ({ default: apiMock, api: apiMock }));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown[]) =>
    args ? `${key} ${args.join(",")}` : key,
}));
vi.mock("vue-sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/ui/button", () => ({
  Button: {
    props: ["disabled"],
    template: '<button :disabled="disabled"><slot /></button>',
  },
}));
vi.mock("@/components/ui/slider", () => ({
  Slider: {
    props: ["min", "max", "disabled"],
    template:
      '<div class="test-slider" :data-min="min" :data-max="max" :data-disabled="disabled" />',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(apiMock.players)) delete apiMock.players[key];
  apiMock.getPlayerConfigValue.mockResolvedValue(0);
  apiMock.savePlayerConfig.mockResolvedValue({});
});

describe("audio delay menu", () => {
  it("uses the Sendspin setting only when the player offers delay control", async () => {
    apiMock.players.kitchen = {
      extra_attributes: {
        sendspin_output_delay_ms: 250,
        sendspin_startup_lead_ms: 125,
        sendspin_min_buffer_ms: 80,
      },
    };
    apiMock.getPlayerConfigEntries.mockResolvedValue([
      { key: "sendspin_static_delay", default_value: 0 },
    ]);
    apiMock.getPlayerConfigValue.mockResolvedValue(250);
    const wrapper = mount(SyncAdjustMenuControl, {
      props: { playerId: "kitchen", provider: "sendspin" },
    });
    await flushPromises();

    expect(apiMock.getPlayerConfigEntries).toHaveBeenCalledWith("kitchen");
    expect(apiMock.getPlayerConfigValue).toHaveBeenCalledWith(
      "kitchen",
      "sendspin_static_delay",
    );
    expect(wrapper.find(".test-slider").attributes("data-min")).toBe("0");
    expect(wrapper.find(".test-slider").attributes("data-max")).toBe("5000");
    expect(wrapper.text()).toContain("250 ms");
    expect(wrapper.text()).toContain(
      "player_select.sendspin_delay_reported 250",
    );
    expect(wrapper.text()).toContain("player_select.sendspin_startup_lead 125");
    expect(wrapper.text()).toContain("player_select.sendspin_min_buffer 80");

    const plusTen = wrapper
      .findAll("button")
      .find((button) => button.text() === "+10");
    await plusTen!.trigger("click");
    await flushPromises();
    expect(apiMock.savePlayerConfig).toHaveBeenCalledWith("kitchen", {
      sendspin_static_delay: 260,
    });
  });

  it("disables adjustment when the Sendspin client lacks the command", async () => {
    apiMock.getPlayerConfigEntries.mockResolvedValue([]);
    const wrapper = mount(SyncAdjustMenuControl, {
      props: { playerId: "display", provider: "sendspin" },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("player_select.sync_adjust_unavailable");
    expect(wrapper.text()).toContain("player_select.sendspin_delay_unreported");
    expect(apiMock.getPlayerConfigValue).not.toHaveBeenCalled();
    expect(
      wrapper
        .findAll("button")
        .every((button) => button.attributes("disabled") !== undefined),
    ).toBe(true);
  });

  it("keeps the signed AirPlay control on sync_adjust", async () => {
    const wrapper = mount(SyncAdjustMenuControl, {
      props: { playerId: "bedroom", provider: "airplay" },
    });
    await flushPromises();

    expect(apiMock.getPlayerConfigEntries).not.toHaveBeenCalled();
    expect(
      wrapper.find('[data-testid="sendspin-reported-delay"]').exists(),
    ).toBe(false);
    expect(wrapper.find(".test-slider").attributes("data-min")).toBe("-500");
    expect(wrapper.find(".test-slider").attributes("data-max")).toBe("500");
    const minusTen = wrapper
      .findAll("button")
      .find((button) => button.text() === "-10");
    await minusTen!.trigger("click");
    await flushPromises();
    expect(apiMock.savePlayerConfig).toHaveBeenCalledWith("bedroom", {
      sync_adjust: -10,
    });
  });
});
