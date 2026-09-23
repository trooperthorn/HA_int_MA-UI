import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Rebind from "@/views/settings/ArchiveDestinationRebind.vue";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn() }));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));
enableAutoUnmount(afterEach);

const props = {
  kind: "mirror" as const,
  subscriptionId: "subscription-1",
  oldItemId: "old-id",
  contentDigest: "a".repeat(64),
  revision: 4,
};
const review = {
  kind: "mirror",
  subscription_id: "subscription-1",
  old_item_id: "old-id",
  candidate_item_id: "new-id",
  expected_content_digest: "a".repeat(64),
  observed_content_digest: "a".repeat(64),
  revision: 4,
  classification: "exact_content",
};

describe("archive destination restore rebind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never offers reconnect for different playlist bytes", async () => {
    mocks.sendCommand.mockResolvedValue({
      ...review,
      observed_content_digest: "b".repeat(64),
      classification: "mismatch",
    });
    const wrapper = mount(Rebind, { props });
    await wrapper
      .get('[data-testid="archive-rebind-candidate"]')
      .setValue("new-id");
    await wrapper
      .get('[data-testid="archive-rebind-inspect"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.rebind_mismatch");
    expect(wrapper.find('[data-testid="archive-rebind-apply"]').exists()).toBe(
      false,
    );
    expect(mocks.sendCommand).toHaveBeenCalledTimes(1);
  });

  it("submits the reviewed digests and revision before emitting success", async () => {
    mocks.sendCommand.mockImplementation(async (name: string) =>
      name.endsWith("_inspect")
        ? review
        : { ...review, destination: { destination_item_id: "new-id" } },
    );
    const wrapper = mount(Rebind, { props });
    await wrapper
      .get('[data-testid="archive-rebind-candidate"]')
      .setValue("new-id");
    await wrapper
      .get('[data-testid="archive-rebind-inspect"]')
      .trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="archive-rebind-apply"]').trigger("click");
    await flushPromises();
    expect(mocks.sendCommand.mock.calls[1][0]).toBe(
      "library_enrichment/destination_rebind_apply",
    );
    expect(mocks.sendCommand.mock.calls[1][1]).toEqual({
      kind: "mirror",
      subscription_id: "subscription-1",
      candidate_item_id: "new-id",
      expected_old_item_id: "old-id",
      expected_content_digest: "a".repeat(64),
      expected_observed_digest: "a".repeat(64),
      expected_revision: 4,
    });
    expect(wrapper.emitted("rebound")).toHaveLength(1);
  });
});
