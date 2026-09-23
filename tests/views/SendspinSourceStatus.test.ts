import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SourceStatus from "@/views/settings/SendspinSourceStatus.vue";
import { QueueOption } from "@/plugins/api/interfaces";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn(), playMedia: vi.fn() }));
vi.mock("@/plugins/api", () => ({
  api: {
    sendCommand: mocks.sendCommand,
    playMedia: mocks.playMedia,
    players: {
      "living-room": {
        player_id: "living-room",
        name: "Living Room",
        type: "player",
        enabled: true,
        available: true,
        needs_setup: false,
      },
    },
  },
}));

enableAutoUnmount(afterEach);

describe("Sendspin input diagnostics", () => {
  beforeEach(() => {
    mocks.sendCommand.mockReset();
    mocks.playMedia.mockReset();
  });

  it("labels target latency separately from observed source activity", async () => {
    mocks.sendCommand.mockResolvedValue({
      target_latency_ms: 80,
      sources: [
        {
          client_id: "source-a",
          name: "Turntable",
          source_uri: "sendspin_source--1://audio_source/source-a",
          signal: "present",
          selected_player_id: "living-room",
          owner_player_id: "living-room",
          playback_session_id: "session-1",
          receiving_pcm: true,
          last_pcm_age_ms: 52,
          bridge_buffer_ms: 73,
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
    expect(wrapper.text()).toContain("73 ms");
    expect(wrapper.text()).toContain(
      "settings.sendspin_source_status.bridge_buffer_hint",
    );
  });

  it("routes through the native queue command and stops only the observed session", async () => {
    mocks.sendCommand.mockResolvedValue({
      target_latency_ms: 80,
      sources: [
        {
          client_id: "source-a",
          name: "Turntable",
          source_uri: "sendspin_source--1://audio_source/source-a",
          signal: "present",
          selected_player_id: "living-room",
          owner_player_id: "living-room",
          playback_session_id: "session-1",
          receiving_pcm: true,
          last_pcm_age_ms: 50,
        },
      ],
    });
    mocks.playMedia.mockResolvedValue(undefined);
    const wrapper = mount(SourceStatus, {
      global: { mocks: { $t: (key: string) => key } },
    });
    await flushPromises();

    expect(wrapper.find("select").element.value).toBe("living-room");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(".start"))!
      .trigger("click");
    await flushPromises();
    expect(mocks.playMedia).toHaveBeenCalledWith(
      "sendspin_source--1://audio_source/source-a",
      QueueOption.PLAY,
      { queue_id: "living-room" },
    );

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes(".stop"))!
      .trigger("click");
    await flushPromises();
    expect(mocks.sendCommand).toHaveBeenCalledWith("sendspin_source/stop", {
      client_id: "source-a",
      playback_session_id: "session-1",
    });
  });
});
