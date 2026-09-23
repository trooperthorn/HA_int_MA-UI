import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Mirror from "@/views/settings/ArchiveMirror.vue";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn(), hasScope: vi.fn() }));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);

const commands = (suffix: string) =>
  mocks.sendCommand.mock.calls.filter(
    ([name]) => name === `library_enrichment/${suffix}`,
  );
const mountPage = () =>
  mount(Mirror, { props: { subscriptionId: "sub-1", versionId: "version-1" } });
const preview = {
  subscription_id: "sub-1",
  version_id: "version-1",
  name: "Morning - mirror",
  source_count: 3,
  projected_count: 2,
  omitted_count: 1,
  omitted: [{ position: 2, state: "null" }],
  projection_digest: "a".repeat(64),
  requires_partial_consent: true,
};

describe("Archive maintained mirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    mocks.sendCommand.mockImplementation(async (name: string) => {
      if (name === "library_enrichment/mirror_status")
        return {
          subscription_id: "sub-1",
          revision: 0,
          enabled: 0,
          allow_partial: 0,
          state: "disabled",
        };
      if (name === "library_enrichment/mirror_preview") return preview;
      if (name === "library_enrichment/mirror_configure")
        return {
          subscription_id: "sub-1",
          revision: 1,
          enabled: 1,
          allow_partial: 1,
          state: "pending",
        };
      if (name === "library_enrichment/mirror_apply")
        return {
          subscription_id: "sub-1",
          revision: 1,
          enabled: 1,
          allow_partial: 1,
          state: "applied",
          destination_item_id: "mirror-1",
        };
      throw new Error(`Unexpected command ${name}`);
    });
  });

  it("does not read or write until opened and requires explicit partial consent", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(mocks.sendCommand).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="archive-mirror-open"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="archive-mirror-preview"]')
      .trigger("click");
    await flushPromises();
    expect(
      wrapper
        .get('[data-testid="archive-mirror-apply"]')
        .attributes("disabled"),
    ).toBeDefined();
    expect(commands("mirror_configure")).toHaveLength(0);
    await wrapper.get('[data-testid="archive-mirror-consent"]').setValue(true);
    await wrapper.get('[data-testid="archive-mirror-apply"]').trigger("click");
    await flushPromises();
    expect(commands("mirror_configure")[0][1]).toEqual({
      subscription_id: "sub-1",
      enabled: true,
      allow_partial: true,
      expected_revision: 0,
    });
    expect(commands("mirror_apply")[0][1]).toEqual({
      subscription_id: "sub-1",
      expected_version_id: "version-1",
      expected_digest: "a".repeat(64),
    });
    expect(wrapper.text()).toContain("settings.archives.mirror_state_applied");
  });

  it("leaves an uncertain destination locked after a failed apply", async () => {
    let statusReads = 0;
    mocks.sendCommand.mockImplementation(async (name: string) => {
      if (name === "library_enrichment/mirror_status") {
        statusReads++;
        return statusReads === 1
          ? {
              subscription_id: "sub-1",
              revision: 1,
              enabled: 1,
              allow_partial: 1,
              state: "pending",
            }
          : {
              subscription_id: "sub-1",
              revision: 1,
              enabled: 1,
              allow_partial: 1,
              state: "uncertain",
              destination_item_id: "mirror-1",
            };
      }
      if (name === "library_enrichment/mirror_preview") return preview;
      if (name === "library_enrichment/mirror_apply")
        throw new Error("Connection lost");
      throw new Error(`Unexpected command ${name}`);
    });
    const wrapper = mountPage();
    await wrapper.get('[data-testid="archive-mirror-open"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="archive-mirror-preview"]')
      .trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="archive-mirror-apply"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(
      "settings.archives.mirror_state_uncertain",
    );
    expect(wrapper.find('[data-testid="archive-mirror-apply"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="archive-mirror-detach"]').exists()).toBe(
      false,
    );
    expect(commands("mirror_apply")).toHaveLength(1);
  });

  it("shows explicit detachment for a conflicting destination", async () => {
    mocks.sendCommand.mockImplementation(async (name: string) => {
      if (name === "library_enrichment/mirror_status")
        return {
          subscription_id: "sub-1",
          revision: 2,
          enabled: 0,
          allow_partial: 1,
          state: "conflict",
          destination_item_id: "mirror-1",
          destination_content_digest: "b".repeat(64),
        };
      if (name === "library_enrichment/mirror_detach")
        return {
          subscription_id: "sub-1",
          revision: 3,
          enabled: 0,
          allow_partial: 1,
          state: "detached",
          destination_item_id: "mirror-1",
        };
      throw new Error(`Unexpected command ${name}`);
    });
    const wrapper = mountPage();
    await wrapper.get('[data-testid="archive-mirror-open"]').trigger("click");
    await flushPromises();
    expect(commands("mirror_detach")).toHaveLength(0);
    await wrapper.get('[data-testid="archive-mirror-detach"]').trigger("click");
    await flushPromises();
    expect(commands("mirror_detach")[0][1]).toEqual({
      subscription_id: "sub-1",
      expected_destination_item_id: "mirror-1",
      expected_content_digest: "b".repeat(64),
    });
    expect(wrapper.text()).toContain("settings.archives.mirror_state_detached");
    expect(wrapper.find('[data-testid="archive-mirror-detach"]').exists()).toBe(
      false,
    );
  });

  it("accepts an uncertain write only after inspecting the exact playlist", async () => {
    mocks.sendCommand.mockImplementation(async (name: string) => {
      if (name === "library_enrichment/mirror_status")
        return {
          subscription_id: "sub-1",
          revision: 1,
          enabled: 1,
          allow_partial: 0,
          state: "uncertain",
          target_digest: "a".repeat(64),
          destination_item_id: "mirror-1",
        };
      if (name === "library_enrichment/mirror_reconcile_preview")
        return {
          subscription_id: "sub-1",
          candidate_item_id: "mirror-1",
          revision: 1,
          target_version_id: "version-1",
          target_digest: "a".repeat(64),
          observed_content_digest: "b".repeat(64),
          classification: "matches_target",
          observed_count: 2,
          target_count: 2,
        };
      if (name === "library_enrichment/mirror_reconcile")
        return {
          subscription_id: "sub-1",
          revision: 1,
          enabled: 1,
          allow_partial: 0,
          state: "applied",
          destination_item_id: "mirror-1",
        };
      throw new Error(`Unexpected command ${name}`);
    });
    const wrapper = mount(Mirror, {
      props: {
        subscriptionId: "sub-1",
        versionId: "version-1",
        canReconcile: true,
      },
    });
    await wrapper.get('[data-testid="archive-mirror-open"]').trigger("click");
    await flushPromises();
    expect(commands("mirror_reconcile")).toHaveLength(0);
    await wrapper
      .get('[data-testid="archive-mirror-inspect"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(
      "settings.archives.mirror_recovery_matches_target",
    );
    await wrapper
      .get('[data-testid="archive-mirror-reconcile"]')
      .trigger("click");
    await flushPromises();
    expect(commands("mirror_reconcile")[0][1]).toEqual({
      subscription_id: "sub-1",
      candidate_item_id: "mirror-1",
      expected_revision: 1,
      expected_target_digest: "a".repeat(64),
      expected_observed_content_digest: "b".repeat(64),
    });
    expect(wrapper.text()).toContain("settings.archives.mirror_state_applied");
  });

  it("does not claim mismatched content and requires acknowledgement to abandon", async () => {
    mocks.sendCommand.mockImplementation(async (name: string) => {
      if (name === "library_enrichment/mirror_status")
        return {
          subscription_id: "sub-1",
          revision: 1,
          enabled: 1,
          allow_partial: 0,
          state: "uncertain",
          target_digest: "a".repeat(64),
        };
      if (name === "library_enrichment/mirror_reconcile_preview")
        return {
          subscription_id: "sub-1",
          candidate_item_id: "candidate-1",
          revision: 1,
          target_version_id: "version-1",
          target_digest: "a".repeat(64),
          observed_content_digest: "c".repeat(64),
          classification: "mismatch",
          observed_count: 1,
          target_count: 2,
        };
      if (name === "library_enrichment/mirror_abandon_uncertain")
        return {
          subscription_id: "sub-1",
          revision: 2,
          enabled: 0,
          allow_partial: 0,
          state: "detached",
        };
      throw new Error(`Unexpected command ${name}`);
    });
    const wrapper = mount(Mirror, {
      props: {
        subscriptionId: "sub-1",
        versionId: "version-1",
        canReconcile: true,
      },
    });
    await wrapper.get('[data-testid="archive-mirror-open"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="archive-mirror-candidate"]')
      .setValue("candidate-1");
    await wrapper
      .get('[data-testid="archive-mirror-inspect"]')
      .trigger("click");
    await flushPromises();
    expect(
      wrapper.find('[data-testid="archive-mirror-reconcile"]').exists(),
    ).toBe(false);
    expect(
      wrapper
        .get('[data-testid="archive-mirror-abandon"]')
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper
      .get('[data-testid="archive-mirror-abandon-consent"]')
      .setValue(true);
    await wrapper
      .get('[data-testid="archive-mirror-abandon"]')
      .trigger("click");
    await flushPromises();
    expect(commands("mirror_reconcile")).toHaveLength(0);
    expect(commands("mirror_abandon_uncertain")[0][1]).toEqual({
      subscription_id: "sub-1",
      expected_revision: 1,
      expected_target_digest: "a".repeat(64),
    });
    expect(wrapper.text()).toContain("settings.archives.mirror_state_detached");
  });
});
