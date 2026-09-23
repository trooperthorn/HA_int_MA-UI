import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Provenance from "@/views/settings/ArchiveVersionProvenance.vue";

const mocks = vi.hoisted(() => ({ sendCommand: vi.fn(), hasScope: vi.fn() }));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope },
}));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);

const page = (offset = 0) => ({
  api_version: 1,
  version_id: "v1",
  subscription_id: "sub",
  limit: 25,
  offset,
  total: 2,
  has_more: offset === 0,
  raw_payload_inline: false,
  items: [
    {
      position: offset,
      state: "available",
      source_item_id: `track-${offset}`,
      provenance: {
        subject: {
          provider_domain: "spotify",
          account_id: "account-a",
          media_type: "track",
          source_item_id: `track-${offset}`,
        },
        fields: {
          title: {
            revision: 2,
            effective: {
              state: "value",
              value: "A song",
              source: "spotify",
              fetched_at: "2026-09-20T00:00:00Z",
              parser_version: "1",
              date_precision: null,
              unit: null,
              raw_reference: "must-never-render",
            },
            observation: {
              state: "value",
              value: "A song",
              source: "spotify",
              fetched_at: "2026-09-20T00:00:00Z",
              parser_version: "1",
              date_precision: null,
              unit: null,
              raw_reference: { secret: "hidden" },
            },
            override: null,
          },
        },
      },
    },
  ],
});

function mountPage(versionId = "v1", canOverride = false) {
  return mount(Provenance, {
    props: { versionId, pageSize: 25, canOverride },
    global: {
      mocks: {
        $t: (key: string, args?: unknown) =>
          key + (args ? JSON.stringify(args) : ""),
      },
    },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("archive version provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    mocks.sendCommand.mockResolvedValue(page());
  });

  it("loads only when opened and never renders raw references", async () => {
    const wrapper = mountPage();
    expect(mocks.sendCommand).not.toHaveBeenCalled();
    await wrapper
      .get('[data-testid="archive-provenance-open"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.sendCommand).toHaveBeenCalledWith(
      "library_enrichment/provenance",
      { version_id: "v1", limit: 25, offset: 0 },
      { suppressGlobalError: true },
    );
    expect(
      wrapper.get('[data-testid="archive-provenance-field"]').text(),
    ).toContain("A song");
    expect(wrapper.text()).not.toContain("must-never-render");
    expect(wrapper.text()).not.toContain("hidden");
  });

  it("sends a revision-checked correction and retains the observation", async () => {
    const initial = page();
    const field = initial.items[0].provenance.fields.title;
    mocks.sendCommand.mockResolvedValueOnce(initial).mockResolvedValueOnce({
      subject: initial.items[0].provenance.subject,
      fields: {
        title: {
          ...field,
          revision: 3,
          override: {
            action: "set",
            revision: 3,
            actor_id: "admin",
            value: "Correct title",
            created_at: "2026-09-23T00:00:00Z",
          },
          effective: {
            action: "set",
            revision: 3,
            actor_id: "admin",
            value: "Correct title",
            created_at: "2026-09-23T00:00:00Z",
          },
        },
      },
    });
    const wrapper = mountPage("v1", true);
    await wrapper
      .get('[data-testid="archive-provenance-open"]')
      .trigger("click");
    await flushPromises();
    const correct = wrapper
      .findAll("button")
      .find((button) => button.text().includes("provenance_correct"));
    expect(correct).toBeDefined();
    await correct!.trigger("click");
    await wrapper.get("textarea").setValue('"Correct title"');
    const save = wrapper
      .findAll("button")
      .find((button) => button.text().includes("provenance_save"));
    await save!.trigger("click");
    await flushPromises();
    expect(mocks.sendCommand).toHaveBeenLastCalledWith(
      "library_enrichment/set_provenance_override",
      {
        version_id: "v1",
        source_item_id: "track-0",
        field_name: "title",
        value: "Correct title",
        expected_revision: 2,
      },
      { suppressGlobalError: true },
    );
    expect(wrapper.text()).toContain("Correct title");
    expect(wrapper.text()).toContain("A song");
  });

  it("uses bounded server pages", async () => {
    mocks.sendCommand
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page(25));
    const wrapper = mountPage();
    await wrapper
      .get('[data-testid="archive-provenance-open"]')
      .trigger("click");
    await flushPromises();
    await wrapper
      .get('[data-testid="archive-provenance-next"]')
      .trigger("click");
    await flushPromises();
    expect(mocks.sendCommand).toHaveBeenLastCalledWith(
      "library_enrichment/provenance",
      { version_id: "v1", limit: 25, offset: 25 },
      { suppressGlobalError: true },
    );
  });

  it("shows distinct empty and invalid-response states", async () => {
    mocks.sendCommand.mockResolvedValueOnce({
      ...page(),
      items: [],
      total: 0,
      has_more: false,
    });
    const wrapper = mountPage();
    await wrapper
      .get('[data-testid="archive-provenance-open"]')
      .trigger("click");
    await flushPromises();
    expect(
      wrapper.find('[data-testid="archive-provenance-empty"]').exists(),
    ).toBe(true);

    mocks.sendCommand.mockResolvedValueOnce({
      ...page(),
      raw_payload_inline: true,
    });
    await wrapper
      .get('[data-testid="archive-provenance-refresh"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "provenance_invalid_response",
    );
  });

  it("fails closed for an unknown observation state", async () => {
    const invalid = page();
    const field = invalid.items[0].provenance!.fields.title;
    field.observation!.state = "invented";
    field.effective!.state = "invented";
    mocks.sendCommand.mockResolvedValueOnce(invalid);
    const wrapper = mountPage();
    await wrapper
      .get('[data-testid="archive-provenance-open"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "provenance_invalid_response",
    );
    expect(
      wrapper.find('[data-testid="archive-provenance-item"]').exists(),
    ).toBe(false);
  });

  it("ignores a response for a version that is no longer selected", async () => {
    const response = deferred<ReturnType<typeof page>>();
    mocks.sendCommand.mockReturnValueOnce(response.promise);
    const wrapper = mountPage();
    await wrapper
      .get('[data-testid="archive-provenance-open"]')
      .trigger("click");
    await wrapper.setProps({ versionId: "v2" });
    response.resolve(page());
    await flushPromises();
    expect(
      wrapper.find('[data-testid="archive-provenance-item"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="archive-provenance-open"]').exists(),
    ).toBe(true);
  });

  it("does not request data without provider-admin scope", async () => {
    mocks.hasScope.mockReturnValue(false);
    const wrapper = mountPage();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="archive-provenance-open"]').exists(),
    ).toBe(false);
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });
});
