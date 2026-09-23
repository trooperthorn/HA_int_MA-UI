import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "@/plugins/api/interfaces";
import PlaybackPolicy from "@/views/settings/ArchivePlaybackPolicy.vue";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn(), hasScope: vi.fn() }));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);

const policy = {
  subscription_id: "sub-1",
  mode: "prefer_local",
  revision: 3,
};
const preview = {
  subscription_id: "sub-1",
  version_id: "version-1",
  mode: "prefer_local",
  name: "Morning",
  policy_revision: 3,
  source_count: 4,
  projected_count: 3,
  omitted_count: 1,
  rows: [
    {
      position: 0,
      selected_source: "local",
      uri: "library://track/1",
      fallback: null,
      strict_provider: null,
    },
    {
      position: 1,
      selected_source: "spotify",
      uri: "spotify://track/2",
      fallback: null,
      strict_provider: null,
    },
    {
      position: 2,
      selected_source: "local",
      uri: "library://track/3",
      fallback: null,
      strict_provider: null,
    },
  ],
  gaps: [
    { position: 1, reason: "missing", omitted: false, fallback: "spotify" },
    { position: 3, reason: "ambiguous", omitted: true, fallback: null },
  ],
  projection_digest: "digest-1",
  requires_partial_consent: true,
  destination: null,
};
const modes = ["prefer_local", "local_only", "prefer_spotify"] as const;
const calls = (command: string) =>
  mocks.sendCommand.mock.calls.filter(
    ([name]) => name === `library_enrichment/${command}`,
  );
const mountPage = () =>
  mount(PlaybackPolicy, {
    props: {
      subscriptionId: "sub-1",
      versionId: "version-1",
      modes: [...modes],
    },
  });
const open = async (wrapper: ReturnType<typeof mountPage>) => {
  await wrapper.get('[data-testid="archive-playback-open"]').trigger("click");
  await flushPromises();
};

describe("Archive playback policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/playback_status")
        return {
          policy: structuredClone(policy),
          projection: { state: "not_applied" },
        };
      if (command === "library_enrichment/set_playback_policy")
        return { ...policy, mode: "local_only", revision: 4 };
      if (command === "library_enrichment/playback_preview")
        return structuredClone(preview);
      if (command === "library_enrichment/playback_apply")
        return { state: "applied", omitted_count: 1 };
      throw new Error(`Unexpected command: ${command}`);
    });
  });

  it("does not create per-subscription reads or writes until explicitly opened", async () => {
    mountPage();
    await flushPromises();
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });

  it.each([Scope.CONFIG_PROVIDERS_WRITE, Scope.LIBRARY_WRITE])(
    "requires %s",
    async (missing) => {
      mocks.hasScope.mockImplementation((scope) => scope !== missing);
      const wrapper = mountPage();
      expect(wrapper.text()).toContain("settings.archives.playback_permission");
      expect(
        wrapper.find('[data-testid="archive-playback-open"]').exists(),
      ).toBe(false);
      expect(mocks.sendCommand).not.toHaveBeenCalled();
    },
  );

  it("saves a selected policy with CAS but never previews or applies automatically", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper
      .get('[data-testid="archive-playback-mode"]')
      .setValue("local_only");
    expect(wrapper.text()).toContain(
      "settings.archives.playback_local_only_warning",
    );
    await wrapper.get('[data-testid="archive-playback-save"]').trigger("click");
    await flushPromises();
    expect(calls("set_playback_policy")[0][1]).toEqual({
      subscription_id: "sub-1",
      mode: "local_only",
      expected_revision: 3,
    });
    expect(calls("playback_preview")).toHaveLength(0);
    expect(calls("playback_apply")).toHaveLength(0);
  });

  it("shows source counts, gaps, and fallbacks before an explicit digest-bound apply", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper
      .get('[data-testid="archive-playback-preview"]')
      .trigger("click");
    await flushPromises();
    expect(
      wrapper.get('[data-testid="archive-playback-preview-result"]').text(),
    ).toContain('"local":2');
    expect(
      wrapper.get('[data-testid="archive-playback-preview-result"]').text(),
    ).toContain('"spotify":1');
    expect(
      wrapper.get('[data-testid="archive-playback-gaps"]').text(),
    ).toContain("ambiguous");
    expect(
      wrapper.get('[data-testid="archive-playback-fallbacks"]').text(),
    ).toContain("spotify");
    expect(calls("playback_apply")).toHaveLength(0);
    expect(
      wrapper
        .get('[data-testid="archive-playback-apply"]')
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper
      .get('[data-testid="archive-playback-consent"]')
      .setValue(true);
    await wrapper
      .get('[data-testid="archive-playback-apply"]')
      .trigger("click");
    await flushPromises();
    expect(calls("playback_apply")[0][1]).toEqual({
      version_id: "version-1",
      expected_digest: "digest-1",
      expected_policy_revision: 3,
      allow_partial: true,
    });
  });

  it("locks all writes after an uncertain policy save until Refresh succeeds", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper
      .get('[data-testid="archive-playback-mode"]')
      .setValue("local_only");
    mocks.sendCommand.mockRejectedValueOnce(new Error("Connection lost"));
    await wrapper.get('[data-testid="archive-playback-save"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.playback_uncertain");
    expect(
      wrapper
        .get('[data-testid="archive-playback-preview"]')
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper
      .get('[data-testid="archive-playback-refresh"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain(
      "settings.archives.playback_uncertain",
    );
    expect(calls("set_playback_policy")).toHaveLength(1);
  });

  it("rejects a preview whose policy revision does not match the loaded policy", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/playback_status")
        return { policy, projection: { state: "not_applied" } };
      if (command === "library_enrichment/playback_preview")
        return { ...preview, policy_revision: 2 };
      throw new Error("Unexpected command");
    });
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper
      .get('[data-testid="archive-playback-preview"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(
      "settings.archives.playback_invalid_preview",
    );
    expect(
      wrapper.find('[data-testid="archive-playback-apply"]').exists(),
    ).toBe(false);
  });

  it("detaches an edited destination only on an explicit click and keeps its ID visible", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/playback_status")
        return {
          policy,
          projection: {
            state: "failed",
            destination: {
              item_id: "playlist-1",
              uri: "library://playlist/playlist-1",
            },
            destination_content_digest: "b".repeat(64),
          },
        };
      if (command === "library_enrichment/playback_detach")
        return {
          subscription_id: "sub-1",
          state: "not_applied",
          detached_destination: { item_id: "playlist-1" },
        };
      throw new Error(`Unexpected command: ${command}`);
    });
    const wrapper = mount(PlaybackPolicy, {
      props: {
        subscriptionId: "sub-1",
        versionId: "version-1",
        modes: [...modes],
        canDetach: true,
      },
    });
    await wrapper.get('[data-testid="archive-playback-open"]').trigger("click");
    await flushPromises();
    expect(calls("playback_detach")).toHaveLength(0);
    await wrapper
      .get('[data-testid="archive-playback-detach"]')
      .trigger("click");
    await flushPromises();
    expect(calls("playback_detach")[0][1]).toEqual({
      subscription_id: "sub-1",
      expected_destination_item_id: "playlist-1",
      expected_content_digest: "b".repeat(64),
    });
    expect(wrapper.text()).toContain("playlist-1");
    expect(
      wrapper.find('[data-testid="archive-playback-detach"]').exists(),
    ).toBe(false);
  });
});
