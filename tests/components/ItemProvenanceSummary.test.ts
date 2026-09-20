import ItemProvenanceSummary from "@/components/ItemProvenanceSummary.vue";
import { resetItemProvenanceCapabilityCache } from "@/helpers/item_provenance";
import type {
  ItemProvenance,
  ItemProvenanceState,
} from "@/library-manager/enrichment";
import type { Scope } from "@/plugins/api/interfaces";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  hasScope: vi.fn<(scope: Scope) => boolean>(),
}));

vi.mock("@/plugins/api", () => ({
  api: { sendCommand: mocks.sendCommand },
}));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));

const capabilities = {
  api_version: 1,
  selected_capture: true,
  item_provenance: true,
  item_provenance_api_version: 1,
  max_items: 10000,
};

const response = (
  state: ItemProvenanceState = "current",
  overrides: Partial<ItemProvenance> = {},
): ItemProvenance => ({
  api_version: 1,
  linked: true,
  media_type: "playlist",
  library_item_id: "123",
  state,
  destination: {
    kind: "archive",
    item_id: "123",
    provider_instance_id: "library",
    version_id: "version-1",
    updated_at: "2026-09-20T05:00:00Z",
  },
  subscription: {
    id: "sub-1",
    provider_domain: "spotify",
    account_id: "listener@example.com",
    source_playlist_id: "source-1",
    name: "Road trip source playlist",
  },
  snapshots: {
    observed: { id: "snapshot-1", at: "2026-09-20T05:00:00Z" },
    attempted: { id: "snapshot-1", at: "2026-09-20T05:00:00Z" },
    committed: {
      id: "snapshot-1",
      at: "2026-09-20T05:00:00Z",
      version_id: "version-1",
    },
  },
  check: {
    state: "ok",
    last_check_at: "2026-09-20T05:00:00Z",
    last_success_at: "2026-09-20T05:00:00Z",
    next_check_at: null,
    access_state: null,
    error_code: null,
  },
  ...overrides,
});

async function mountSummary() {
  const wrapper = mount(ItemProvenanceSummary, {
    props: { libraryItemId: "123", provider: "library" },
  });
  await flushPromises();
  return wrapper;
}

describe("ItemProvenanceSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetItemProvenanceCapabilityCache();
    mocks.hasScope.mockReturnValue(true);
    mocks.sendCommand.mockImplementation(async (command: string) =>
      command === "library_enrichment/capabilities" ? capabilities : response(),
    );
  });

  it.each([
    ["current", "Current"],
    ["source_changed", "Source changed"],
    ["capture_pending", "Capture pending"],
    ["capture_failed", "Capture failed"],
    ["unknown", "Status unknown"],
  ] as const)("renders the %s state explicitly", async (state, label) => {
    mocks.sendCommand.mockImplementation(async (command: string) =>
      command === "library_enrichment/capabilities"
        ? capabilities
        : response(state),
    );
    const wrapper = await mountSummary();

    expect(wrapper.text()).toContain("Road trip source playlist");
    expect(wrapper.text()).toContain("spotify · listener@example.com");
    expect(wrapper.text()).toContain(label);
    expect(wrapper.get("time").attributes("datetime")).toBe(
      "2026-09-20T05:00:00.000Z",
    );
    expect(wrapper.get("time").attributes("title")).toBeTruthy();
    expect(wrapper.get("time").text()).toContain("·");
  });

  it("keeps capability and provenance failures silent", async () => {
    mocks.sendCommand.mockRejectedValue(new Error("missing command"));
    const wrapper = await mountSummary();

    expect(wrapper.html()).toBe("<!--v-if-->");
    expect(mocks.sendCommand).toHaveBeenCalledWith(
      "library_enrichment/capabilities",
      undefined,
      { suppressGlobalError: true },
    );
  });

  it("keeps a provenance lookup failure silent", async () => {
    mocks.sendCommand
      .mockResolvedValueOnce(capabilities)
      .mockRejectedValueOnce(new Error("lookup failed"));
    const wrapper = await mountSummary();

    expect(wrapper.html()).toBe("<!--v-if-->");
    expect(mocks.sendCommand).toHaveBeenCalledTimes(2);
    expect(mocks.sendCommand).toHaveBeenLastCalledWith(
      "library_enrichment/item_provenance",
      { media_type: "playlist", library_item_id: "123" },
      { suppressGlobalError: true },
    );
  });

  it.each([
    [{ ...capabilities, item_provenance: false }],
    [{ ...capabilities, item_provenance_api_version: 2 }],
    [{ ...capabilities, api_version: 2 }],
  ])("fails closed when the capability is unsupported", async (caps) => {
    mocks.sendCommand.mockResolvedValue(caps);
    const wrapper = await mountSummary();

    expect(wrapper.html()).toBe("<!--v-if-->");
    expect(mocks.sendCommand).toHaveBeenCalledOnce();
  });

  it("does not probe without admin authorization", async () => {
    mocks.hasScope.mockReturnValue(false);
    const wrapper = await mountSummary();

    expect(wrapper.html()).toBe("<!--v-if-->");
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });

  it("renders nothing when the item is unlinked", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) =>
      command === "library_enrichment/capabilities"
        ? capabilities
        : response("unknown", {
            linked: false,
            destination: null,
            subscription: null,
            snapshots: null,
            check: null,
          }),
    );
    const wrapper = await mountSummary();
    expect(wrapper.html()).toBe("<!--v-if-->");
  });

  it("does not probe provenance for a non-library item", async () => {
    const wrapper = mount(ItemProvenanceSummary, {
      props: { libraryItemId: "123", provider: "spotify" },
    });
    await flushPromises();

    expect(wrapper.html()).toBe("<!--v-if-->");
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });

  it("ignores a response for the previous route item", async () => {
    let resolveFirst!: (value: ItemProvenance) => void;
    const first = new Promise<ItemProvenance>((resolve) => {
      resolveFirst = resolve;
    });
    mocks.sendCommand
      .mockResolvedValueOnce(capabilities)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(response("current", { library_item_id: "456" }));
    const wrapper = mount(ItemProvenanceSummary, {
      props: { libraryItemId: "123", provider: "library" },
    });
    await flushPromises();
    await wrapper.setProps({ libraryItemId: "456" });
    await flushPromises();
    resolveFirst(response("capture_failed"));
    await flushPromises();

    expect(wrapper.text()).toContain("Current");
    expect(wrapper.text()).not.toContain("Capture failed");
  });

  it.each([
    [response("current", { api_version: 2 })],
    [response("current", { state: "future_state" as ItemProvenanceState })],
  ])("fails closed for an unknown response API or state", async (result) => {
    mocks.sendCommand.mockImplementation(async (command: string) =>
      command === "library_enrichment/capabilities" ? capabilities : result,
    );
    const wrapper = await mountSummary();
    expect(wrapper.html()).toBe("<!--v-if-->");
  });

  it("uses visible two-line mobile content with wrapping and no hover dependency", async () => {
    const wrapper = await mountSummary();
    expect(wrapper.get("section").classes()).toContain(
      "item-provenance-summary",
    );
    expect(wrapper.get(".item-provenance-source").text()).toContain("Source");
    expect(wrapper.get(".item-provenance-status").text()).toContain("Current");
    expect(wrapper.get(".item-provenance-value").attributes("title")).toBe(
      "Road trip source playlist",
    );
  });
});
