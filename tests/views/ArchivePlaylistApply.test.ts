import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "@/plugins/api/interfaces";
import Apply from "@/views/settings/ArchivePlaylistApply.vue";

const mocks = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  hasScope: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());

const preview = {
  version_id: "v1",
  name: "Morning",
  source_count: 3,
  projected_count: 2,
  omitted: [{ position: 1, state: "unavailable" }],
  projection_digest: "digest-a",
  requires_partial_consent: true,
  already_applied: false,
};
const destination = {
  item_id: "123",
  provider_instance: "library",
  uri: "library://playlist/123",
  name: "Morning archive",
};
const applied = {
  state: "partial",
  destination,
  source_count: 3,
  projected_count: 2,
  omitted_count: 1,
};
const calls = (command: string) =>
  mocks.sendCommand.mock.calls.filter(
    ([name]) => name === `library_enrichment/${command}`,
  );
const mountPage = () => mount(Apply, { props: { versionId: "v1" } });
const prepare = async (wrapper: ReturnType<typeof mountPage>) => {
  await wrapper.get('[data-testid="archive-apply-preview"]').trigger("click");
  await flushPromises();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Archive playlist application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/apply_preview")
        return structuredClone(preview);
      if (command === "library_enrichment/apply_status")
        return { state: "not_applied", retryable: true, destination: null };
      if (command === "library_enrichment/apply")
        return structuredClone(applied);
      throw new Error("Unexpected command");
    });
  });

  it("does not request or write anything automatically", async () => {
    mountPage();
    await flushPromises();
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });

  it.each([Scope.CONFIG_PROVIDERS_WRITE, Scope.LIBRARY_WRITE])(
    "requires %s",
    async (missing) => {
      mocks.hasScope.mockImplementation((scope) => scope !== missing);
      const wrapper = mountPage();
      expect(wrapper.text()).toContain("settings.archives.apply_permission");
      expect(
        wrapper.find('[data-testid="archive-apply-preview"]').exists(),
      ).toBe(false);
      expect(mocks.sendCommand).not.toHaveBeenCalled();
    },
  );

  it("previews omitted occurrences, requires consent, and applies only on an explicit click", async () => {
    const wrapper = mountPage();
    await prepare(wrapper);
    expect(calls("apply")).toHaveLength(0);
    expect(calls("apply_preview")[0][1]).toEqual({ version_id: "v1" });
    expect(
      wrapper.get('[data-testid="archive-apply-omissions"]').text(),
    ).toContain('"position":2');
    expect(wrapper.text()).toContain("unavailable");
    expect(
      wrapper
        .get('[data-testid="archive-apply-create"]')
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-testid="archive-apply-consent"]').setValue(true);
    await wrapper.get('[data-testid="archive-apply-create"]').trigger("click");
    await flushPromises();
    expect(calls("apply")[0][1]).toEqual({
      version_id: "v1",
      expected_digest: "digest-a",
      allow_partial: true,
    });
    expect(wrapper.text()).toContain("settings.archives.apply_state_partial");
    expect(wrapper.text()).toContain('"source":3');
    expect(wrapper.text()).toContain('"projected":2');
    expect(wrapper.find('[data-testid="archive-apply-create"]').exists()).toBe(
      false,
    );
    await wrapper.get('[data-testid="archive-apply-open"]').trigger("click");
    expect(mocks.push).toHaveBeenCalledWith({
      name: "playlist",
      params: { provider: "library", itemId: "123" },
    });
  });

  it("does not require partial consent for a complete reference projection", async () => {
    mocks.sendCommand.mockResolvedValueOnce({
      ...preview,
      omitted: [],
      projected_count: 3,
      requires_partial_consent: false,
    });
    const wrapper = mountPage();
    await prepare(wrapper);
    expect(wrapper.find('[data-testid="archive-apply-consent"]').exists()).toBe(
      false,
    );
    await wrapper.get('[data-testid="archive-apply-create"]').trigger("click");
    await flushPromises();
    expect(calls("apply")[0][1].allow_partial).toBe(false);
  });

  it("opens an existing destination without creating another playlist", async () => {
    mocks.sendCommand.mockResolvedValueOnce({
      ...preview,
      already_applied: true,
      destination,
    });
    mocks.sendCommand.mockResolvedValueOnce(applied);
    const wrapper = mountPage();
    await prepare(wrapper);
    expect(wrapper.find('[data-testid="archive-apply-create"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="archive-apply-open"]').exists()).toBe(
      true,
    );
    expect(calls("apply")).toHaveLength(0);
  });

  it.each(["uncertain", "conflict", "failed"])(
    "does not permit creation for nonretryable %s",
    async (state) => {
      mocks.sendCommand.mockResolvedValueOnce(preview).mockResolvedValueOnce({
        state,
        retryable: false,
        error: "Needs review",
      });
      const wrapper = mountPage();
      await prepare(wrapper);
      expect(wrapper.text()).toContain("Needs review");
      expect(
        wrapper.find('[data-testid="archive-apply-create"]').exists(),
      ).toBe(false);
    },
  );

  it("permits an explicit retry only when the backend marks a failure safe", async () => {
    mocks.sendCommand
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce({ state: "failed", retryable: true });
    const wrapper = mountPage();
    await prepare(wrapper);
    expect(wrapper.find('[data-testid="archive-apply-create"]').exists()).toBe(
      true,
    );
    expect(calls("apply")).toHaveLength(0);
  });

  it("invalidates preview and partial consent when the committed version changes", async () => {
    const wrapper = mountPage();
    await prepare(wrapper);
    await wrapper.get('[data-testid="archive-apply-consent"]').setValue(true);
    await wrapper.setProps({ versionId: "v2" });
    expect(
      wrapper.find('[data-testid="archive-apply-preview-result"]').exists(),
    ).toBe(false);
    expect(wrapper.find('[data-testid="archive-apply-create"]').exists()).toBe(
      false,
    );
  });

  it("ignores a stale preview response for an older committed version", async () => {
    const response = deferred<typeof preview>();
    mocks.sendCommand.mockReturnValueOnce(response.promise);
    const wrapper = mountPage();
    await wrapper.get('[data-testid="archive-apply-preview"]').trigger("click");
    await wrapper.setProps({ versionId: "v2" });
    response.resolve(preview);
    await flushPromises();
    expect(
      wrapper.find('[data-testid="archive-apply-preview-result"]').exists(),
    ).toBe(false);
    expect(calls("apply_status")).toHaveLength(0);
  });

  it("rejects an inconsistent preview rather than allowing a partial write", async () => {
    mocks.sendCommand.mockResolvedValueOnce({
      ...preview,
      requires_partial_consent: false,
    });
    const wrapper = mountPage();
    await prepare(wrapper);
    expect(wrapper.text()).toContain("settings.archives.apply_invalid_preview");
    expect(wrapper.find('[data-testid="archive-apply-create"]').exists()).toBe(
      false,
    );
  });

  it("blocks creation after a status refresh fails until a fresh read succeeds", async () => {
    const wrapper = mountPage();
    await prepare(wrapper);
    mocks.sendCommand.mockRejectedValueOnce(new Error("Status unavailable"));
    await wrapper.get('[data-testid="archive-apply-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="archive-apply-create"]').exists()).toBe(
      false,
    );
    await wrapper.get('[data-testid="archive-apply-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="archive-apply-create"]').exists()).toBe(
      true,
    );
    expect(calls("apply")).toHaveLength(0);
  });

  it("treats a lost apply response as uncertain and never retries automatically", async () => {
    const wrapper = mountPage();
    await prepare(wrapper);
    await wrapper.get('[data-testid="archive-apply-consent"]').setValue(true);
    mocks.sendCommand.mockRejectedValueOnce(new Error("Connection lost"));
    await wrapper.get('[data-testid="archive-apply-create"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.apply_state_uncertain");
    expect(wrapper.text()).toContain("settings.archives.apply_reconcile");
    expect(calls("apply")).toHaveLength(1);
    mocks.sendCommand.mockResolvedValueOnce(applied);
    await wrapper.get('[data-testid="archive-apply-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="archive-apply-open"]').exists()).toBe(
      true,
    );
    expect(calls("apply")).toHaveLength(1);
  });

  it("bounds a hung read and allows status recovery without retrying a write", async () => {
    vi.useFakeTimers();
    mocks.sendCommand.mockReturnValueOnce(new Promise(() => {}));
    const wrapper = mountPage();
    await wrapper.get('[data-testid="archive-apply-preview"]').trigger("click");
    await vi.advanceTimersByTimeAsync(15000);
    expect(wrapper.text()).toContain("settings.archives.apply_read_timeout");
    expect(
      wrapper
        .get('[data-testid="archive-apply-refresh"]')
        .attributes("disabled"),
    ).toBeUndefined();
    expect(calls("apply")).toHaveLength(0);
  });

  it("polls persisted in-progress application and stops on unmount", async () => {
    vi.useFakeTimers();
    mocks.sendCommand
      .mockResolvedValueOnce(preview)
      .mockResolvedValue({ state: "applying" });
    const wrapper = mountPage();
    await prepare(wrapper);
    expect(wrapper.text()).toContain("settings.archives.apply_state_applying");
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls("apply_status")).toHaveLength(2);
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls("apply_status")).toHaveLength(2);
    expect(calls("apply")).toHaveLength(0);
  });

  it("does not let a stale concurrent status read erase the completed destination", async () => {
    const wrapper = mountPage();
    await prepare(wrapper);
    await wrapper.get('[data-testid="archive-apply-consent"]').setValue(true);
    const writeResponse = deferred<typeof applied>();
    const statusResponse = deferred<object>();
    mocks.sendCommand
      .mockReturnValueOnce(writeResponse.promise)
      .mockReturnValueOnce(statusResponse.promise);
    await wrapper.get('[data-testid="archive-apply-create"]').trigger("click");
    await wrapper.get('[data-testid="archive-apply-refresh"]').trigger("click");
    writeResponse.resolve(applied);
    await flushPromises();
    statusResponse.resolve({ state: "applying" });
    await flushPromises();
    expect(wrapper.find('[data-testid="archive-apply-open"]').exists()).toBe(
      true,
    );
    expect(wrapper.text()).toContain("settings.archives.apply_state_partial");
  });
});
