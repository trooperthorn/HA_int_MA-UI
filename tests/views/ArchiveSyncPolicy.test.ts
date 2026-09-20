import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Sync from "@/views/settings/ArchiveSyncPolicy.vue";
import type {
  ArchiveSyncPolicy,
  ArchiveSyncStatus,
} from "@/library-manager/enrichment";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn(), hasScope: vi.fn() }));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());

let policy: ArchiveSyncPolicy;
let status: ArchiveSyncStatus;
const mountPage = () =>
  mount(Sync, {
    props: { subscriptionId: "sub", bounds: { min: 3600, max: 604800 } },
  });
const open = async (wrapper: ReturnType<typeof mountPage>) => {
  await wrapper.get('[data-testid="sync-open"]').trigger("click");
  await flushPromises();
};
const calls = (name: string) =>
  mocks.sendCommand.mock.calls.filter(
    ([command]) => command === `library_enrichment/${name}`,
  );
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const job = (
  state: ArchiveSyncStatus["jobs"][number]["state"],
  version_id: string | null = null,
): ArchiveSyncStatus["jobs"][number] => ({
  id: "job",
  subscription_id: "sub",
  trigger: "manual",
  state,
  created_at: "2026-09-20T10:00:00Z",
  started_at: null,
  finished_at: null,
  observed_snapshot: "snapshot1",
  version_id,
  error: null,
});

describe("Archive sync policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    policy = {
      subscription_id: "sub",
      mode: "manual",
      interval_seconds: 86400,
      initiating_user_id: null,
      revision: 0,
      updated_at: null,
    };
    status = {
      policy,
      state: {
        subscription_id: "sub",
        next_check_at: null,
        last_check_at: null,
        last_success_at: null,
        consecutive_failures: 0,
        access_state: "unknown",
        last_error_code: null,
        last_error: null,
      },
      jobs: [],
      latest_job: null,
    };
    mocks.sendCommand.mockImplementation(
      async (name: string, args: Record<string, unknown>) => {
        if (name === "library_enrichment/sync_policy")
          return structuredClone(policy);
        if (name === "library_enrichment/sync_status")
          return structuredClone({ ...status, policy });
        if (name === "library_enrichment/set_sync_policy") {
          policy = {
            ...policy,
            mode: args.mode as ArchiveSyncPolicy["mode"],
            interval_seconds: Number(args.interval_seconds),
            revision: policy.revision + 1,
          };
          return structuredClone(policy);
        }
        if (name === "library_enrichment/sync_now") {
          status.jobs = [job("queued")];
          status.latest_job = status.jobs[0];
          return { job_id: "job", task_id: "task", state: "queued" };
        }
        throw new Error(`Unexpected ${name}`);
      },
    );
  });

  it("loads only on opening and never writes on mount/open/draft edits", async () => {
    const wrapper = mountPage();
    expect(mocks.sendCommand).not.toHaveBeenCalled();
    await open(wrapper);
    expect(calls("sync_policy")).toHaveLength(1);
    expect(calls("sync_status")).toHaveLength(1);
    await wrapper.get('[data-testid="sync-scheduled"]').setValue();
    await wrapper.get('[data-testid="sync-interval"]').setValue(2);
    expect(calls("set_sync_policy")).toHaveLength(0);
    expect(calls("sync_now")).toHaveLength(0);
  });

  it("requires configuration permission", async () => {
    mocks.hasScope.mockReturnValue(false);
    const wrapper = mountPage();
    expect(
      wrapper.get('[data-testid="sync-open"]').attributes("disabled"),
    ).toBeDefined();
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });

  it("saves scheduled days with expected revision without starting a check", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper.get('[data-testid="sync-scheduled"]').setValue();
    await wrapper.get('[data-testid="sync-interval"]').setValue(2);
    await wrapper.get('[data-testid="sync-save"]').trigger("click");
    await flushPromises();
    expect(calls("set_sync_policy")[0][1]).toEqual({
      subscription_id: "sub",
      expected_revision: 0,
      mode: "scheduled",
      interval_seconds: 172800,
    });
    expect(calls("sync_now")).toHaveLength(0);
    expect(wrapper.text()).toContain("settings.archives.sync_saved");
  });

  it("saves hours and restores persisted policy when reopened", async () => {
    policy = {
      ...policy,
      mode: "scheduled",
      interval_seconds: 7200,
      revision: 3,
    };
    const wrapper = mountPage();
    await open(wrapper);
    expect(
      (wrapper.get('[data-testid="sync-unit"]').element as HTMLSelectElement)
        .value,
    ).toBe("hours");
    expect(
      (wrapper.get('[data-testid="sync-interval"]').element as HTMLInputElement)
        .value,
    ).toBe("2");
    await wrapper.get('[data-testid="sync-interval"]').setValue(3);
    await wrapper.get('[data-testid="sync-save"]').trigger("click");
    await flushPromises();
    expect(calls("set_sync_policy")[0][1].interval_seconds).toBe(10800);
    expect(calls("set_sync_policy")[0][1].expected_revision).toBe(3);
  });

  it.each([0, -1, 8, ""])(
    "blocks an invalid day interval %s",
    async (amount) => {
      const wrapper = mountPage();
      await open(wrapper);
      await wrapper.get('[data-testid="sync-scheduled"]').setValue();
      await wrapper.get('[data-testid="sync-interval"]').setValue(amount);
      expect(
        wrapper.get('[data-testid="sync-save"]').attributes("disabled"),
      ).toBeDefined();
      expect(wrapper.text()).toContain(
        "settings.archives.sync_invalid_interval",
      );
      expect(calls("set_sync_policy")).toHaveLength(0);
    },
  );

  it("pauses future checks without changing the interval or starting/cancelling a job", async () => {
    policy = {
      ...policy,
      mode: "scheduled",
      interval_seconds: 7200,
      revision: 4,
    };
    status.jobs = [job("running")];
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper.get('[data-testid="sync-pause"]').trigger("click");
    await flushPromises();
    expect(calls("set_sync_policy")[0][1]).toEqual({
      subscription_id: "sub",
      expected_revision: 4,
      mode: "manual",
      interval_seconds: 7200,
    });
    expect(calls("sync_now")).toHaveLength(0);
    expect(wrapper.text()).toContain("settings.archives.sync_job_running");
  });

  it("checks only on an explicit click and blocks a second queued check", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper.get('[data-testid="sync-now"]').trigger("click");
    await flushPromises();
    expect(calls("sync_now")[0][1]).toEqual({ subscription_id: "sub" });
    expect(
      wrapper.get('[data-testid="sync-now"]').attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.text()).toContain("settings.archives.sync_job_queued");
  });

  it.each([null, "version2"])(
    "distinguishes unchanged success from a new capture (%s)",
    async (version) => {
      status.jobs = [job("succeeded", version)];
      const wrapper = mountPage();
      await open(wrapper);
      expect(wrapper.text()).toContain(
        version
          ? "settings.archives.sync_committed"
          : "settings.archives.sync_unchanged",
      );
      expect(wrapper.text()).toContain("snapshot1");
    },
  );

  it.each([
    "authentication_required",
    "access_denied",
    "provider_offline",
    "temporarily_unavailable",
  ] as const)(
    "shows %s access status and persisted errors",
    async (access_state) => {
      status.state = {
        ...status.state,
        access_state,
        last_error: "Provider request failed",
        consecutive_failures: 2,
      };
      const wrapper = mountPage();
      await open(wrapper);
      expect(wrapper.text()).toContain(
        `settings.archives.sync_access_${access_state}`,
      );
      expect(wrapper.text()).toContain("Provider request failed");
      expect(calls("sync_now")).toHaveLength(0);
    },
  );

  it("preserves a draft while polling status and detects concurrent policy edits", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper.get('[data-testid="sync-scheduled"]').setValue();
    await wrapper.get('[data-testid="sync-interval"]').setValue(3);
    await wrapper.get('[data-testid="sync-refresh"]').trigger("click");
    await flushPromises();
    expect(
      (wrapper.get('[data-testid="sync-interval"]').element as HTMLInputElement)
        .value,
    ).toBe("3");
    policy.revision = 2;
    await wrapper.get('[data-testid="sync-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.sync_revision_changed");
    expect(
      wrapper.get('[data-testid="sync-save"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("requires a policy reload after an uncertain save and never retries the write", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper.get('[data-testid="sync-scheduled"]').setValue();
    mocks.sendCommand.mockRejectedValueOnce(new Error("Revision conflict"));
    await wrapper.get('[data-testid="sync-save"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Revision conflict");
    expect(
      wrapper.get('[data-testid="sync-save"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-testid="sync-reload"]').trigger("click");
    await flushPromises();
    expect(calls("set_sync_policy")).toHaveLength(1);
    expect(
      wrapper.get('[data-testid="sync-now"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("ignores a policy response for a previous subscription", async () => {
    const response = deferred<ArchiveSyncPolicy>();
    mocks.sendCommand.mockReturnValueOnce(response.promise);
    const wrapper = mountPage();
    await wrapper.get('[data-testid="sync-open"]').trigger("click");
    await wrapper.setProps({ subscriptionId: "other" });
    response.resolve(policy);
    await flushPromises();
    expect(wrapper.find('[data-testid="sync-save"]').exists()).toBe(false);
    expect(calls("sync_status")).toHaveLength(0);
  });

  it("bounds a hung status read and labels old values as stale", async () => {
    vi.useFakeTimers();
    const wrapper = mountPage();
    await open(wrapper);
    mocks.sendCommand.mockReturnValueOnce(new Promise(() => {}));
    await wrapper.get('[data-testid="sync-refresh"]').trigger("click");
    await vi.advanceTimersByTimeAsync(15000);
    expect(wrapper.text()).toContain("settings.archives.sync_timeout");
    expect(wrapper.text()).toContain("settings.archives.sync_stale");
    expect(
      wrapper.get('[data-testid="sync-now"]').attributes("disabled"),
    ).toBeDefined();
    expect(
      wrapper.get('[data-testid="sync-refresh"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("polls server state without triggering sync and stops when unmounted", async () => {
    vi.useFakeTimers();
    policy.mode = "scheduled";
    const wrapper = mountPage();
    await open(wrapper);
    await vi.advanceTimersByTimeAsync(30000);
    expect(calls("sync_status")).toHaveLength(2);
    expect(calls("sync_now")).toHaveLength(0);
    wrapper.unmount();
    await vi.advanceTimersByTimeAsync(60000);
    expect(calls("sync_status")).toHaveLength(2);
  });

  it("notifies the archive view once when a captured version commits", async () => {
    status.jobs = [job("succeeded", "v2")];
    const wrapper = mountPage();
    await open(wrapper);
    expect(wrapper.emitted("committed")).toEqual([["v2"]]);
    await wrapper.get('[data-testid="sync-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("committed")).toHaveLength(1);
  });

  it("keeps policy recovery available after a status-only refresh", async () => {
    const wrapper = mountPage();
    await open(wrapper);
    await wrapper.get('[data-testid="sync-scheduled"]').setValue();
    mocks.sendCommand.mockRejectedValueOnce(new Error("Connection lost"));
    await wrapper.get('[data-testid="sync-save"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="sync-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="sync-reload"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("settings.archives.sync_verify_saved");
    expect(calls("set_sync_policy")).toHaveLength(1);
  });
});
