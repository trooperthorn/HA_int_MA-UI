import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "@/plugins/api/interfaces";
import Review from "@/views/settings/ArchiveMatchReview.vue";
import type { ArchiveMatchReviewPage } from "@/library-manager/enrichment";

const mocks = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  hasScope: vi.fn(),
}));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());

const candidate = {
  id: "candidate-1",
  asset_id: "asset-1",
  score: 0.92,
  evidence: {
    provider_domain: "filesystem_local",
    title: "exact",
    duration_delta: 1,
  },
  algorithm_version: "v1",
  observed_at: "2026-09-20T12:00:00Z",
  rejected: false,
  approved: false,
  asset: {
    id: "asset-1",
    media_type: "track" as const,
    provider_instance_id: "local-1",
    item_id: "track-9",
    metadata: {
      name: "Local song",
      artist: "Local artist",
      album: "Local album",
      provider_domain: "filesystem_local",
    },
    evidence: {},
    created_at: "2026-09-20T12:00:00Z",
    updated_at: "2026-09-20T12:00:00Z",
    locations: [
      {
        id: "location-1",
        asset_id: "asset-1",
        provider_instance_id: "local-1",
        item_id: "track-9",
        evidence: { provider_domain: "filesystem_local" },
        created_at: "2026-09-20T12:00:00Z",
        updated_at: "2026-09-20T12:00:00Z",
      },
    ],
  },
};
const item = {
  position: 0,
  state: "available",
  source_item_id: "spotify-track-1",
  classification: "ambiguous" as const,
  match: {
    source: {
      id: "source-1",
      provider_domain: "spotify",
      account_id: "account-1",
      media_type: "track" as const,
      source_item_id: "spotify-track-1",
    },
    revision: 4,
    decision: null,
    decision_history: [],
    approved_asset_id: null,
    candidates: [candidate],
  },
};
const page: ArchiveMatchReviewPage = {
  version_id: "version-1",
  subscription_id: "subscription-1",
  source: {
    provider_domain: "spotify",
    provider_instance_id: "spotify-1",
    account_id: "account-1",
  },
  limit: 100,
  offset: 0,
  total: 101,
  has_more: true,
  candidate_freshness: "fresh",
  candidate_error: null,
  items: [item, { ...item, position: 1 }],
};
const mountReview = () =>
  mount(Review, {
    props: {
      subscriptionId: "subscription-1",
      versionId: "version-1",
      pageSize: 100,
    },
  });
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

describe("Archive local match review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/match_review")
        return structuredClone(page);
      if (command === "library_enrichment/set_match_decision")
        return {
          match: {
            ...structuredClone(item.match),
            revision: 5,
            decision: {
              id: "decision-1",
              source_id: "source-1",
              action: "approve",
              asset_id: "asset-1",
              revision: 5,
              actor_id: "user-1",
              evidence: {},
              algorithm_version: "v1",
              created_at: "2026-09-20T12:00:00Z",
            },
            approved_asset_id: "asset-1",
          },
          classification: "approved",
        };
      throw new Error("Unexpected command");
    });
  });

  it("does no work until the user opens the review", async () => {
    const wrapper = mountReview();
    await flushPromises();
    expect(mocks.sendCommand).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    expect(calls("match_review")[0][1]).toEqual({
      version_id: "version-1",
      limit: 100,
      offset: 0,
    });
    expect(wrapper.findAll('[data-testid="archive-match-item"]')).toHaveLength(
      2,
    );
    expect(wrapper.text()).toContain("settings.archives.match_ambiguous");
    expect(wrapper.text()).toContain("filesystem_local");
    expect(wrapper.text()).toContain('"duration_delta": 1');
  });

  it("requires provider configuration scope for reads and library scope for writes", async () => {
    mocks.hasScope.mockReturnValue(false);
    const denied = mountReview();
    expect(denied.text()).toContain("settings.archives.match_permission");
    expect(mocks.sendCommand).not.toHaveBeenCalled();
    denied.unmount();

    mocks.hasScope.mockImplementation((scope) => scope !== Scope.LIBRARY_WRITE);
    const readOnly = mountReview();
    await readOnly.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    expect(
      readOnly
        .get('[data-testid="archive-match-approve"]')
        .attributes("disabled"),
    ).toBeDefined();
    expect(calls("set_match_decision")).toHaveLength(0);
  });

  it("filters the current page without issuing a background request", async () => {
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="archive-match-filter"]')
      .setValue("unmatched");
    expect(wrapper.findAll('[data-testid="archive-match-item"]')).toHaveLength(
      0,
    );
    expect(calls("match_review")).toHaveLength(1);
  });

  it("pages explicitly with bounded offsets", async () => {
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    mocks.sendCommand.mockResolvedValueOnce({
      ...structuredClone(page),
      offset: 100,
      has_more: false,
      items: [],
    });
    await wrapper.get('[data-testid="archive-match-next"]').trigger("click");
    await flushPromises();
    expect(calls("match_review")[1][1].offset).toBe(100);
    expect(
      wrapper.get('[data-testid="archive-match-next"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("sends a revisioned decision and updates every repeated occurrence", async () => {
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="archive-match-approve"]').trigger("click");
    await flushPromises();
    expect(calls("set_match_decision")[0][1]).toEqual({
      version_id: "version-1",
      source_item_id: "spotify-track-1",
      expected_revision: 4,
      action: "approve",
      asset_id: "asset-1",
    });
    expect(wrapper.findAll('[data-testid="archive-match-clear"]')).toHaveLength(
      2,
    );
  });

  it("checks recommended candidates by default and atomically approves checked rows", async () => {
    mocks.sendCommand.mockImplementation(async (command: string, args) => {
      if (command === "library_enrichment/match_review")
        return structuredClone(page);
      if (command === "library_enrichment/approve_match_candidates")
        return {
          operation_id: args.operation_id,
          approved_count: 1,
          idempotent_replay: false,
          items: [
            {
              match: {
                ...structuredClone(item.match),
                revision: 5,
                approved_asset_id: "asset-1",
              },
              classification: "approved",
            },
          ],
        };
      throw new Error("Unexpected command");
    });
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    expect(
      wrapper.get<HTMLInputElement>('[data-testid="archive-match-select"]')
        .element.checked,
    ).toBe(true);
    await wrapper
      .get('[data-testid="archive-match-approve-all"]')
      .trigger("click");
    await flushPromises();
    const request = calls("approve_match_candidates")[0][1];
    expect(request.version_id).toBe("version-1");
    expect(request.operation_id).toEqual(expect.any(String));
    expect(request.approvals).toEqual([
      {
        source_item_id: "spotify-track-1",
        asset_id: "asset-1",
        expected_revision: 4,
      },
    ]);
    expect(wrapper.findAll('[data-testid="archive-match-clear"]')).toHaveLength(
      2,
    );
    expect(
      wrapper
        .get('[data-testid="archive-match-diagnostics-text"]')
        .attributes("value"),
    ).toContain('"state": "approved"');
  });

  it("lets the user uncheck a proposed match before bulk approval", async () => {
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="archive-match-select-all"]')
      .setValue(false);
    expect(
      wrapper
        .get('[data-testid="archive-match-approve-all"]')
        .attributes("disabled"),
    ).toBeDefined();
    expect(calls("approve_match_candidates")).toHaveLength(0);
  });

  it("provides selectable diagnostics when clipboard access is unavailable", async () => {
    const sensitivePage = structuredClone(page);
    sensitivePage.source.account_id = "SECRET_ACCOUNT";
    sensitivePage.source.provider_instance_id = "SECRET_PROVIDER_INSTANCE";
    sensitivePage.items[0].source_item_id = "SECRET_SOURCE_ID";
    sensitivePage.items[0].match.source.source_item_id = "SECRET_SOURCE_ID";
    sensitivePage.items[0].match.candidates[0].asset.item_id =
      "C:\\Secret\\Music\\private.mp3";
    sensitivePage.items[0].match.candidates[0].evidence = {
      raw_secret: "SECRET_EVIDENCE",
    };
    mocks.sendCommand.mockResolvedValueOnce(sensitivePage);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    const textarea = wrapper.get<HTMLTextAreaElement>(
      '[data-testid="archive-match-diagnostics-text"]',
    );
    const select = vi.spyOn(textarea.element, "select");
    await wrapper
      .get('[data-testid="archive-match-copy-diagnostics"]')
      .trigger("click");
    await flushPromises();
    expect(textarea.element.value).toContain('"title": "Local song"');
    expect(textarea.element.value).toContain('"classification": "ambiguous"');
    for (const secret of [
      "subscription-1",
      "version-1",
      "SECRET_ACCOUNT",
      "SECRET_PROVIDER_INSTANCE",
      "SECRET_SOURCE_ID",
      "C:\\Secret\\Music\\private.mp3",
      "SECRET_EVIDENCE",
      "spotify-track-1",
      "local-1",
      "track-9",
      "duration_delta",
    ]) {
      expect(textarea.element.value).not.toContain(secret);
    }
    expect(select).toHaveBeenCalledOnce();
  });

  it("sends a candidate-specific rejection", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/match_review")
        return {
          ...structuredClone(page),
          items: [
            {
              ...structuredClone(item),
              classification: "ambiguous",
            },
          ],
        };
      return { match: item.match, classification: "rejected" };
    });
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="archive-match-reject"]').trigger("click");
    await flushPromises();
    expect(calls("set_match_decision")[0][1]).toEqual({
      version_id: "version-1",
      source_item_id: "spotify-track-1",
      expected_revision: 4,
      action: "reject",
      asset_id: "asset-1",
    });
  });

  it("clears an approved source without sending an asset id", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/match_review")
        return {
          ...structuredClone(page),
          items: [{ ...structuredClone(item), classification: "approved" }],
        };
      return { match: item.match, classification: "candidate" };
    });
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="archive-match-clear"]').trigger("click");
    await flushPromises();
    expect(calls("set_match_decision")[0][1]).toEqual({
      version_id: "version-1",
      source_item_id: "spotify-track-1",
      expected_revision: 4,
      action: "clear",
    });
  });

  it("locks all decisions after an uncertain write until refresh succeeds", async () => {
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    mocks.sendCommand.mockRejectedValueOnce(new Error("Connection lost"));
    await wrapper.get('[data-testid="archive-match-reject"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.match_uncertain");
    expect(
      wrapper
        .get('[data-testid="archive-match-approve"]')
        .attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-testid="archive-match-refresh"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("settings.archives.match_uncertain");
    expect(
      wrapper
        .get('[data-testid="archive-match-approve"]')
        .attributes("disabled"),
    ).toBeUndefined();
    expect(calls("set_match_decision")).toHaveLength(1);
  });

  it("bounds reads at 15 seconds and ignores stale version responses", async () => {
    vi.useFakeTimers();
    mocks.sendCommand.mockReturnValueOnce(new Promise(() => {}));
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await vi.advanceTimersByTimeAsync(15000);
    expect(wrapper.text()).toContain("settings.archives.match_timeout");
    expect(
      wrapper
        .get('[data-testid="archive-match-diagnostics-text"]')
        .attributes("value"),
    ).toContain('"code": "timeout"');

    const response = deferred<ArchiveMatchReviewPage>();
    mocks.sendCommand.mockReturnValueOnce(response.promise);
    await wrapper.get('[data-testid="archive-match-refresh"]').trigger("click");
    await wrapper.setProps({ versionId: "version-2" });
    response.resolve(page);
    await flushPromises();
    expect(wrapper.find('[data-testid="archive-match-item"]').exists()).toBe(
      false,
    );
  });

  it("shows stale evidence and library-read failures explicitly", async () => {
    mocks.sendCommand.mockResolvedValueOnce({
      ...structuredClone(page),
      candidate_freshness: "stale",
      candidate_error: "library_read_failed",
    });
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.archives.match_stale");
    expect(wrapper.text()).toContain(
      "settings.archives.match_error_library_read_failed",
    );
    expect(
      wrapper
        .get('[data-testid="archive-match-diagnostics-text"]')
        .attributes("value"),
    ).toContain('"candidate_error": "library_read_failed"');
  });

  it("reports invalid responses with a normalized copy-safe diagnostic", async () => {
    mocks.sendCommand.mockResolvedValueOnce({
      ...structuredClone(page),
      version_id: "SECRET_WRONG_VERSION",
    });
    const wrapper = mountReview();
    await wrapper.get('[data-testid="archive-match-open"]').trigger("click");
    await flushPromises();
    const diagnostics = wrapper.get<HTMLTextAreaElement>(
      '[data-testid="archive-match-diagnostics-text"]',
    ).element.value;
    expect(diagnostics).toContain('"code": "invalid_response"');
    expect(diagnostics).toContain(
      '"message": "The server returned an invalid match review response."',
    );
    expect(diagnostics).not.toContain("SECRET_WRONG_VERSION");
  });
});
