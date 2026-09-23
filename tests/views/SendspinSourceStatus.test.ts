import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SourceStatus from "@/views/settings/SendspinSourceStatus.vue";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn() }));
vi.mock("@/plugins/api", () => ({
  api: {
    sendCommand: mocks.sendCommand,
    players: { "living-room": { name: "Living Room" } },
  },
}));

enableAutoUnmount(afterEach);

describe("Sendspin input diagnostics", () => {
  beforeEach(() => mocks.sendCommand.mockReset());

  it("labels target latency separately from observed source activity", async () => {
    mocks.sendCommand.mockResolvedValue({
      target_latency_ms: 80,
      sources: [
        {
          client_id: "source-a",
          name: "Turntable",
          signal: "present",
          selected_player_id: "living-room",
          receiving_pcm: true,
          last_pcm_age_ms: 52,
        },
      ],
    });
    const wrapper = mount(SourceStatus, {
      global: { mocks: { $t: (key: string) => key } },
    });
    await flushPromises();

    expect(mocks.sendCommand).toHaveBeenCalledExactlyOnceWith(
      "sendspin_source/status",
    );
    expect(wrapper.text()).toContain("80 ms");
    expect(wrapper.text()).toContain("Turntable");
    expect(wrapper.text()).toContain("present");
    expect(wrapper.text()).toContain("Living Room");
    expect(wrapper.text()).toContain("52 ms");
  });
});
