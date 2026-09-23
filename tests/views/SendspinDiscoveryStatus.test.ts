import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DiscoveryStatus from "@/views/settings/SendspinDiscoveryStatus.vue";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn() }));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("vue-i18n", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-i18n")>()),
  useI18n: () => ({ t: (key: string) => key }),
}));

enableAutoUnmount(afterEach);

function mountStatus() {
  return mount(DiscoveryStatus, {
    global: { mocks: { $t: (key: string) => key } },
  });
}

describe("Sendspin discovery diagnostics", () => {
  beforeEach(() => mocks.sendCommand.mockReset());

  it("shows live listener, discovery, and client data without changing configuration", async () => {
    mocks.sendCommand.mockResolvedValue({
      listener_active: true,
      listen_address: "127.0.0.1",
      port: 8927,
      advertising_active: false,
      advertise_address: "192.168.1.2",
      client_discovery_active: true,
      discovered_services: [
        { name: "Living Room", url: "ws://192.168.1.10:8927/sendspin" },
      ],
      manual_addresses: [{ address: "192.168.1.11", valid: true }],
      known_clients: 2,
      connected_clients: 1,
      legacy_clients_allowed: false,
    });
    const wrapper = mountStatus();
    await flushPromises();

    expect(mocks.sendCommand).toHaveBeenCalledExactlyOnceWith(
      "sendspin/discovery_status",
    );
    expect(wrapper.text()).toContain("127.0.0.1:8927");
    expect(wrapper.text()).toContain("1 / 2");
    expect(wrapper.text()).toContain("Living Room");
    expect(wrapper.text()).toContain("192.168.1.11");
  });
});
