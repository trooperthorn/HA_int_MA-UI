import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Archives from "@/views/settings/LibraryEnrichmentArchives.vue";
import type { ArchiveStatus } from "@/library-manager/enrichment";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn(), hasScope: vi.fn() }));
vi.mock("@/plugins/api", () => ({
  api: {
    sendCommand: mocks.sendCommand,
    providers: {
      spotify_a: {
        instance_id: "spotify_a",
        domain: "spotify",
        available: true,
        name: "Home",
      },
      spotify_b: {
        instance_id: "spotify_b",
        domain: "spotify",
        available: true,
        name: "Other",
      },
      offline: {
        instance_id: "offline",
        domain: "spotify",
        available: false,
        name: "Offline",
      },
      local: {
        instance_id: "local",
        domain: "filesystem_local",
        available: true,
        name: "Files",
      },
    },
  },
}));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());

const id = "A".repeat(22);
const anotherId = "B".repeat(22);
const cap = {
  api_version: 1,
  selected_capture: true,
  preview_preconditions: true,
  source_listing: true,
  version_listing: true,
  max_items: 10000,
};
const preview = {
  provider_instance_id: "spotify_a",
  source_playlist_id: id,
  account_id: "account-a",
  snapshot_id: "snapshot-a",
  name: "Morning",
  total: 3,
};
const pending: ArchiveStatus = {
  subscriptions: [
    {
      id: "sub",
      account_id: "account-a",
      provider_instance_id: "spotify_a",
      source_playlist_id: id,
      name: "Morning",
      observed_snapshot: "b",
      committed_snapshot: "a",
      committed_at: "2026-09-20T00:00:00Z",
      committed_version_id: "v1",
    },
  ],
  jobs: [
    {
      id: "job",
      subscription_id: "sub",
      state: "pending",
      received: 2,
      total: 3,
      error: null,
      created_at: "2026-09-20T00:01:00Z",
    },
  ],
};
let persisted: ArchiveStatus;
function mountPage() {
  return mount(Archives, {
    global: {
      mocks: {
        $t: (key: string, args?: unknown) =>
          key + (args ? JSON.stringify(args) : ""),
      },
    },
  });
}
async function select(wrapper: ReturnType<typeof mountPage>) {
  await flushPromises();
  await wrapper.get('[data-testid="archive-provider"]').setValue("spotify_a");
  await flushPromises();
  await wrapper.get('[data-testid="archive-playlist-id"]').setValue(id);
}
const calls = (command: string) =>
  mocks.sendCommand.mock.calls.filter(
    ([name]) => name === `library_enrichment/${command}`,
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Library Enrichment archive controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    persisted = { subscriptions: [], jobs: [] };
    mocks.sendCommand.mockImplementation(async (command: string) => {
      switch (command) {
        case "library_enrichment/capabilities":
          return cap;
        case "library_enrichment/sources":
          return {
            items: [
              { source_playlist_id: id, name: "Morning", library_item_id: "1" },
            ],
            limit: 100,
            offset: 0,
            has_more: false,
          };
        case "library_enrichment/preview":
          return preview;
        case "library_enrichment/capture":
          persisted = structuredClone(pending);
          return { job_id: "job", subscription_id: "sub", task_id: "task" };
        case "library_enrichment/status":
          return structuredClone(persisted);
        case "library_enrichment/cancel":
          persisted.jobs[0].state = "failed";
          persisted.jobs[0].error = "Capture cancelled";
          return { cancelled: true, state: "failed" };
        case "library_enrichment/versions":
          return [
            { id: "v1", snapshot_id: "a", total: 3, created_at: "today" },
          ];
        default:
          throw new Error(`Unexpected command: ${command}`);
      }
    });
  });

  it("requires provider configuration permission before making any requests", async () => {
    mocks.hasScope.mockReturnValue(false);
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.permission");
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { ...cap, api_version: 2 },
    { ...cap, selected_capture: false },
    { ...cap, preview_preconditions: false },
  ])(
    "disables writes for absent or incompatible capabilities",
    async (result) => {
      mocks.sendCommand.mockImplementation(async () => {
        if (!result) throw new Error("Unknown command");
        return result;
      });
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.text()).toContain("settings.archives.unsupported");
      expect(wrapper.find('[data-testid="archive-capture"]').exists()).toBe(
        false,
      );
      expect(calls("capture")).toHaveLength(0);
      expect(calls("status")).toHaveLength(0);
    },
  );

  it("previews explicitly selected sources without writing, then captures approved identity", async () => {
    const wrapper = mountPage();
    await select(wrapper);
    expect(
      wrapper.get('[data-testid="archive-provider"]').findAll("option"),
    ).toHaveLength(3);
    expect(calls("sources")[0][1]).toEqual({
      provider_instance_id: "spotify_a",
      limit: 100,
      offset: 0,
    });
    expect(calls("preview")).toHaveLength(0);
    expect(
      wrapper.get('[data-testid="archive-capture"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-testid="archive-preview"]').trigger("click");
    await flushPromises();
    expect(
      wrapper.get('[data-testid="archive-preview-result"]').text(),
    ).toContain("account-a");
    expect(wrapper.text()).toContain("settings.archives.metadata_only");
    expect(calls("capture")).toHaveLength(0);
    await wrapper.get('[data-testid="archive-capture"]').trigger("click");
    await flushPromises();
    expect(calls("capture")[0][1]).toEqual({
      provider_instance_id: "spotify_a",
      source_playlist_id: id,
      max_items: 10000,
      expected_account_id: "account-a",
      expected_snapshot_id: "snapshot-a",
    });
    expect(wrapper.find('[data-testid="archive-job"]').text()).toContain(
      "settings.archives.state_pending",
    );
    expect(
      wrapper.find('[data-testid="archive-preview-result"]').exists(),
    ).toBe(false);
  });

  it.each([
    ["archive-playlist-id", anotherId],
    ["archive-limit", 100],
    ["archive-provider", "spotify_b"],
  ])("invalidates preview when %s changes", async (field, value) => {
    const wrapper = mountPage();
    await select(wrapper);
    await wrapper.get('[data-testid="archive-preview"]').trigger("click");
    await flushPromises();
    await wrapper.get(`[data-testid="${field}"]`).setValue(value);
    expect(
      wrapper.find('[data-testid="archive-preview-result"]').exists(),
    ).toBe(false);
    expect(
      wrapper.get('[data-testid="archive-capture"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("rejects a stale in-flight preview after selection changes", async () => {
    const wrapper = mountPage();
    await select(wrapper);
    const response = deferred<typeof preview>();
    mocks.sendCommand.mockReturnValueOnce(response.promise);
    await wrapper.get('[data-testid="archive-preview"]').trigger("click");
    await wrapper
      .get('[data-testid="archive-playlist-id"]')
      .setValue(anotherId);
    response.resolve(preview);
    await flushPromises();
    expect(
      wrapper.find('[data-testid="archive-preview-result"]').exists(),
    ).toBe(false);
    expect(calls("capture")).toHaveLength(0);
  });

  it.each([0, -1, 10001, 1.5, ""])(
    "does not preview an invalid item bound %s",
    async (limit) => {
      const wrapper = mountPage();
      await select(wrapper);
      await wrapper.get('[data-testid="archive-limit"]').setValue(limit);
      expect(
        wrapper.get('[data-testid="archive-preview"]').attributes("disabled"),
      ).toBeDefined();
      expect(calls("preview")).toHaveLength(0);
    },
  );

  it("shows preview failures without offering capture", async () => {
    const wrapper = mountPage();
    await select(wrapper);
    mocks.sendCommand.mockRejectedValueOnce(new Error("Playlist inaccessible"));
    await wrapper.get('[data-testid="archive-preview"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Playlist inaccessible");
    expect(
      wrapper.get('[data-testid="archive-capture"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("rehydrates pending jobs, polls, and cancels without losing committed history", async () => {
    vi.useFakeTimers();
    persisted = structuredClone(pending);
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.state_pending");
    expect(wrapper.text()).toContain("settings.archives.committed");
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls("status")).toHaveLength(2);
    await wrapper.get('[data-testid="archive-cancel"]').trigger("click");
    await flushPromises();
    expect(calls("cancel")[0][1]).toEqual({ job_id: "job" });
    expect(wrapper.text()).toContain("Capture cancelled");
    expect(wrapper.text()).toContain("settings.archives.committed");
    expect(wrapper.find('[data-testid="archive-cancel"]').exists()).toBe(false);
  });

  it("keeps active jobs prominent and caps completed jobs in collapsed history", async () => {
    persisted = {
      ...structuredClone(pending),
      jobs: [
        ...structuredClone(pending.jobs),
        ...Array.from({ length: 7 }, (_, index) => ({
          id: `completed-${index}`,
          subscription_id: "sub",
          state: "committed" as const,
          received: 3,
          total: 3,
          error: null,
          created_at: `2026-09-20T00:0${index}:00Z`,
        })),
      ],
    };
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.findAll('[data-testid="archive-job"]')).toHaveLength(1);
    const history = wrapper.get('[data-testid="archive-job-history"]');
    expect(history.attributes("open")).toBeUndefined();
    expect(wrapper.findAll('[data-testid="archive-history-job"]')).toHaveLength(
      5,
    );
    await wrapper
      .get('[data-testid="archive-job-history-more"]')
      .trigger("click");
    expect(wrapper.findAll('[data-testid="archive-history-job"]')).toHaveLength(
      7,
    );
  });

  it("reports stopping separately when cancellation has not completed", async () => {
    persisted = structuredClone(pending);
    const wrapper = mountPage();
    await flushPromises();
    mocks.sendCommand.mockResolvedValueOnce({
      cancelled: false,
      state: "stopping",
    });
    await wrapper.get('[data-testid="archive-cancel"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.stopping");
    expect(wrapper.text()).not.toContain("settings.archives.cancelled");
  });

  it("surfaces status/cancel errors and allows explicit retry", async () => {
    persisted = structuredClone(pending);
    const wrapper = mountPage();
    await flushPromises();
    mocks.sendCommand.mockRejectedValueOnce(new Error("Cannot cancel"));
    await wrapper.get('[data-testid="archive-cancel"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Cannot cancel");
    mocks.sendCommand.mockRejectedValueOnce(new Error("Status unavailable"));
    await wrapper.get('[data-testid="archive-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Status unavailable");
    await wrapper.get('[data-testid="archive-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("Status unavailable");
  });

  it("bounds polling and stops it when unmounted", async () => {
    vi.useFakeTimers();
    persisted = structuredClone(pending);
    const wrapper = mountPage();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(310000);
    expect(calls("status")).toHaveLength(150);
    expect(wrapper.text()).toContain("settings.archives.polling_paused");
    await wrapper.get('[data-testid="archive-refresh"]').trigger("click");
    await flushPromises();
    const count = calls("status").length;
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls("status")).toHaveLength(count);
  });

  it("loads retained version metadata only on request", async () => {
    persisted = structuredClone(pending);
    const wrapper = mountPage();
    await flushPromises();
    expect(calls("versions")).toHaveLength(0);
    const button = wrapper
      .findAll("button")
      .find((item) => item.text() === "settings.archives.versions")!;
    await button.trigger("click");
    await flushPromises();
    expect(calls("versions")[0][1]).toEqual({
      subscription_id: "sub",
      limit: 50,
      offset: 0,
    });
    expect(wrapper.get('[data-testid="archive-versions"]').text()).toContain(
      "today",
    );
  });

  it("supports explicit IDs when source listing is unavailable", async () => {
    mocks.sendCommand.mockResolvedValueOnce({ ...cap, source_listing: false });
    const wrapper = mountPage();
    await select(wrapper);
    expect(calls("sources")).toHaveLength(0);
    expect(wrapper.find('[data-testid="archive-source"]').exists()).toBe(false);
    await wrapper.get('[data-testid="archive-preview"]').trigger("click");
    await flushPromises();
    expect(
      wrapper.get('[data-testid="archive-capture"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it.each([true, false])(
    "gates visible playlist controls on archive_apply (%s)",
    async (archive_apply) => {
      persisted = structuredClone(pending);
      mocks.sendCommand.mockResolvedValueOnce({ ...cap, archive_apply });
      const wrapper = mountPage();
      await flushPromises();
      expect(
        wrapper.find('[data-testid="archive-apply-preview"]').exists(),
      ).toBe(archive_apply);
      expect(calls("apply_preview")).toHaveLength(0);
      expect(calls("apply")).toHaveLength(0);
      if (!archive_apply)
        expect(wrapper.text()).toContain("settings.archives.apply_unavailable");
    },
  );

  it.each([1, 2])(
    "gates subscription sync controls on compatible version %s",
    async (sync_policy_api_version) => {
      persisted = structuredClone(pending);
      mocks.sendCommand.mockResolvedValueOnce({
        ...cap,
        subscription_sync: true,
        sync_policy_api_version,
        interval_bounds: { min: 3600, max: 604800 },
      });
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.find('[data-testid="sync-open"]').exists()).toBe(
        sync_policy_api_version === 1,
      );
      expect(calls("sync_policy")).toHaveLength(0);
      expect(calls("sync_now")).toHaveLength(0);
      if (sync_policy_api_version === 1) {
        const previousReads = calls("status").length;
        wrapper
          .findComponent({ name: "ArchiveSyncPolicy" })
          .vm.$emit("committed", "v2");
        await flushPromises();
        expect(calls("status")).toHaveLength(previousReads + 1);
      }
    },
  );

  it.each([1, 2])(
    "gates lazy local match review on compatible version %s",
    async (match_review_api_version) => {
      persisted = structuredClone(pending);
      mocks.sendCommand.mockResolvedValueOnce({
        ...cap,
        local_matching: true,
        match_review_api_version,
        max_match_review_page: 200,
      });
      const wrapper = mountPage();
      await flushPromises();
      expect(wrapper.find('[data-testid="archive-match-open"]').exists()).toBe(
        true,
      );
      expect(calls("match_review")).toHaveLength(0);
      expect(calls("set_match_decision")).toHaveLength(0);
    },
  );

  it.each([
    [
      {
        provenance_read: true,
        provenance_api_version: 1,
        max_provenance_page: 200,
        raw_payload_inline: false,
      },
      true,
    ],
    [
      {
        provenance_read: false,
        provenance_api_version: 1,
        max_provenance_page: 200,
        raw_payload_inline: false,
      },
      false,
    ],
    [
      {
        provenance_read: true,
        provenance_api_version: 2,
        max_provenance_page: 200,
        raw_payload_inline: false,
      },
      false,
    ],
    [
      {
        provenance_read: true,
        provenance_api_version: 1,
        max_provenance_page: 200,
        raw_payload_inline: true,
      },
      false,
    ],
  ])(
    "gates lazy provenance controls on the exact safe contract",
    async (extra, expected) => {
      persisted = structuredClone(pending);
      mocks.sendCommand.mockResolvedValueOnce({ ...cap, ...extra });
      const wrapper = mountPage();
      await flushPromises();
      await wrapper
        .findAll("button")
        .find((button) => button.text() === "settings.archives.versions")!
        .trigger("click");
      await flushPromises();
      expect(
        wrapper.find('[data-testid="archive-provenance-open"]').exists(),
      ).toBe(expected);
      expect(calls("provenance")).toHaveLength(0);
    },
  );

  it("deduplicates imported candidates across live pagination", async () => {
    const wrapper = mountPage();
    await flushPromises();
    mocks.sendCommand.mockResolvedValueOnce({
      items: [
        { source_playlist_id: id, name: "Morning", library_item_id: "1" },
      ],
      offset: 0,
      limit: 100,
      has_more: true,
    });
    await wrapper.get('[data-testid="archive-provider"]').setValue("spotify_a");
    await flushPromises();
    mocks.sendCommand.mockResolvedValueOnce({
      items: [
        { source_playlist_id: id, name: "Morning", library_item_id: "1" },
        {
          source_playlist_id: anotherId,
          name: "Evening",
          library_item_id: "2",
        },
      ],
      offset: 100,
      limit: 100,
      has_more: false,
    });
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "settings.archives.more_sources")!
      .trigger("click");
    await flushPromises();
    expect(calls("sources").at(-1)![1]).toEqual({
      provider_instance_id: "spotify_a",
      limit: 100,
      offset: 100,
    });
    expect(
      wrapper.get('[data-testid="archive-source"]').findAll("option"),
    ).toHaveLength(3);
  });

  it("ignores source responses from a previously selected provider", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const response = deferred<object>();
    mocks.sendCommand.mockReturnValueOnce(response.promise);
    await wrapper.get('[data-testid="archive-provider"]').setValue("spotify_a");
    mocks.sendCommand.mockResolvedValueOnce({
      items: [],
      offset: 0,
      limit: 100,
      has_more: false,
    });
    await wrapper.get('[data-testid="archive-provider"]').setValue("spotify_b");
    await flushPromises();
    response.resolve({
      items: [
        { source_playlist_id: id, name: "Old account", library_item_id: "1" },
      ],
      offset: 0,
      limit: 100,
      has_more: false,
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="archive-source"]').text()).not.toContain(
      "Old account",
    );
  });

  it("clears approval on capture failure and never retries a write automatically", async () => {
    const wrapper = mountPage();
    await select(wrapper);
    await wrapper.get('[data-testid="archive-preview"]').trigger("click");
    await flushPromises();
    mocks.sendCommand.mockRejectedValueOnce(
      new Error("Account changed; preview again"),
    );
    await wrapper.get('[data-testid="archive-capture"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Account changed; preview again");
    expect(
      wrapper.get('[data-testid="archive-capture"]').attributes("disabled"),
    ).toBeDefined();
    expect(calls("capture")).toHaveLength(1);
  });

  it("refreshes again when capture completes during an in-flight status read", async () => {
    const wrapper = mountPage();
    await select(wrapper);
    await wrapper.get('[data-testid="archive-preview"]').trigger("click");
    await flushPromises();
    const response = deferred<ArchiveStatus>();
    mocks.sendCommand.mockReturnValueOnce(response.promise);
    await wrapper.get('[data-testid="archive-refresh"]').trigger("click");
    await wrapper.get('[data-testid="archive-capture"]').trigger("click");
    await flushPromises();
    response.resolve({ subscriptions: [], jobs: [] });
    await flushPromises();
    expect(wrapper.get('[data-testid="archive-job"]').text()).toContain(
      "settings.archives.state_pending",
    );
    expect(calls("status")).toHaveLength(3);
  });
});
