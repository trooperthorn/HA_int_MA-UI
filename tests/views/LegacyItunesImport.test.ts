import Import from "@/views/settings/LegacyItunesImport.vue";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendCommand: vi.fn(),
  hasScope: vi.fn(),
  getToken: vi.fn(),
  baseUrl: "https://music.test",
}));
vi.mock("@/plugins/api", () => ({
  api: {
    sendCommand: mocks.sendCommand,
    get baseUrl() {
      return mocks.baseUrl;
    },
  },
}));
vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: mocks.hasScope, getToken: mocks.getToken },
}));
vi.mock("@/plugins/i18n", () => ({
  $t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ""),
}));
enableAutoUnmount(afterEach);

const capabilities = {
  api_version: 1,
  selected_capture: true,
  max_items: 10000,
  itunes_import: true,
  itunes_import_api_version: 1,
  itunes_zip_packages: true,
  itunes_zip_api_version: 1,
  itunes_zip_upload: true,
  itunes_zip_upload_api_version: 1,
  max_itunes_zip_upload_bytes: 15728640,
  max_itunes_preview_page: 200,
};
const inspection = {
  api_version: 1,
  inspection_id: "inspection-1",
  source_digest: "digest-1",
  library_path: "/imports/iTunes Library.xml",
  source_kind: "xml",
  tracks_total: 120,
  playlists_total: 2,
  roots: [
    {
      source_root: "file://localhost/F:/Music/",
      suggested_target: "/media/music",
    },
  ],
  playlists: [
    {
      id: "p1",
      name: "Road trip",
      track_count: 20,
      kind: "user",
      selectable: true,
    },
    {
      id: "p2",
      name: "Genius",
      track_count: 30,
      kind: "genius",
      selectable: false,
      reason: "genius",
    },
  ],
};
const preview = {
  api_version: 1,
  inspection_id: "inspection-preview-1",
  source_digest: "digest-1",
  preview_digest: "preview-1",
  selected_playlists: 1,
  source_tracks: 20,
  matched: 18,
  unresolved: 1,
  ambiguous: 1,
  unsupported: 0,
};
const applyCapabilities = {
  ...capabilities,
  itunes_apply: true,
  itunes_apply_api_version: 1,
  max_itunes_apply_occurrences: 10000,
};
const applicablePreview = {
  ...preview,
  revision: 3,
  projection_digest: "projection-1",
  matched: 20,
  unresolved: 0,
  ambiguous: 0,
};
const appliedStatus = {
  api_version: 1,
  inspection_id: "inspection-preview-1",
  state: "applied",
  source_count: 20,
  destination: {
    item_id: "playlist-1",
    provider_instance_id: "builtin",
  },
};
const mountPage = () =>
  mount(Import, {
    global: {
      mocks: {
        $t: (key: string, args?: unknown) =>
          key + (args ? JSON.stringify(args) : ""),
      },
    },
  });
const calls = (name: string) =>
  mocks.sendCommand.mock.calls.filter(
    ([command]) => command === `library_enrichment/${name}`,
  );
async function inspect(wrapper: ReturnType<typeof mountPage>) {
  await wrapper
    .get('[data-testid="itunes-library-path"]')
    .setValue("/imports/iTunes Library.xml");
  await wrapper.get('[data-testid="itunes-inspect"]').trigger("click");
  await flushPromises();
  await wrapper
    .get('[data-testid="itunes-provider-instance"]')
    .setValue("filesystem-a");
}

describe("legacy iTunes XML import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasScope.mockReturnValue(true);
    mocks.getToken.mockReturnValue("token-1");
    mocks.baseUrl = "https://music.test";
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/capabilities") return capabilities;
      if (command === "library_enrichment/itunes_inspect")
        return structuredClone(inspection);
      if (command === "library_enrichment/itunes_preview")
        return structuredClone(preview);
      throw new Error(`Unexpected command ${command}`);
    });
  });

  it("does not make requests without provider configuration scope", async () => {
    mocks.hasScope.mockReturnValue(false);
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("settings.itunes_import.permission");
    expect(mocks.sendCommand).not.toHaveBeenCalled();
  });

  it.each([
    { ...capabilities, api_version: 2 },
    { ...capabilities, itunes_import: false },
    { ...capabilities, itunes_import_api_version: 2 },
  ])("requires the exact import capability", async (result) => {
    mocks.sendCommand.mockResolvedValueOnce(result);
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("settings.itunes_import.unsupported");
    expect(wrapper.find('[data-testid="itunes-library-path"]').exists()).toBe(
      false,
    );
    expect(calls("itunes_inspect")).toHaveLength(0);
  });

  it("accepts only a backend-visible XML path and renders the inspection", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper
      .get('[data-testid="itunes-library-path"]')
      .setValue("F:\\Archive\\iTunes Library.itl");
    expect(
      wrapper.get('[data-testid="itunes-inspect"]').attributes("disabled"),
    ).toBeDefined();
    await inspect(wrapper);
    expect(calls("itunes_inspect")[0][1]).toEqual({
      library_path: "/imports/iTunes Library.xml",
    });
    expect(wrapper.get('[data-testid="itunes-inspection"]').text()).toContain(
      "120",
    );
    expect(wrapper.get('[data-testid="itunes-inspection"]').text()).toContain(
      "Road trip",
    );
    expect(wrapper.get('[data-testid="itunes-inspection"]').text()).toContain(
      "Genius",
    );
    expect(
      (
        wrapper.get('[data-testid="itunes-target-root"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("/media/music");
  });

  it("accepts ZIP packages only with the exact ZIP capability and renders a read-only localization preview", async () => {
    const zipInspection = {
      ...inspection,
      library_path: "/imports/iTunes archive.zip",
      source_kind: "zip",
      package: {
        entries_total: 124,
        files_total: 120,
        media_files_total: 117,
        xml_candidates_total: 2,
        compressed_bytes: 1048576,
        uncompressed_bytes: 3145728,
        selected_xml_path: "iTunes/iTunes Library.xml",
        warnings: ["Ignored one unsupported package entry."],
      },
      localization: {
        state: "preview_only",
        proposed_root: "/media/localized/itunes-archive",
        files_total: 117,
        bytes_total: 2097152,
        conflicts: 3,
      },
    } as const;
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/capabilities") return capabilities;
      if (command === "library_enrichment/itunes_inspect")
        return structuredClone(zipInspection);
      throw new Error(`Unexpected command ${command}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper
      .get('[data-testid="itunes-library-path"]')
      .setValue("/imports/iTunes archive.zip");
    await wrapper.get('[data-testid="itunes-inspect"]').trigger("click");
    expect(calls("itunes_inspect")).toHaveLength(1);
    await flushPromises();

    expect(calls("itunes_inspect")[0][1]).toEqual({
      library_path: "/imports/iTunes archive.zip",
    });
    expect(wrapper.get('[data-testid="itunes-source-kind"]').text()).toContain(
      "settings.itunes_import.source_zip",
    );
    expect(
      wrapper.get('[data-testid="itunes-package-inventory"]').text(),
    ).toContain("117");
    expect(
      wrapper.get('[data-testid="itunes-package-inventory"]').text(),
    ).toContain("iTunes/iTunes Library.xml");
    expect(
      wrapper.get('[data-testid="itunes-localization-preview"]').text(),
    ).toContain("/media/localized/itunes-archive");
    expect(wrapper.find('[data-testid="itunes-extract"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="itunes-apply"]').exists()).toBe(false);
  });

  it.each([
    { itunes_zip_packages: false, itunes_zip_api_version: 1 },
    { itunes_zip_packages: true, itunes_zip_api_version: 2 },
  ])(
    "rejects ZIP paths without the exact ZIP capability",
    async (zipCapability) => {
      mocks.sendCommand.mockResolvedValueOnce({
        ...capabilities,
        ...zipCapability,
      });
      const wrapper = mountPage();
      await flushPromises();
      await wrapper
        .get('[data-testid="itunes-library-path"]')
        .setValue("/imports/iTunes archive.zip");
      expect(
        wrapper.get('[data-testid="itunes-inspect"]').attributes("disabled"),
      ).toBeDefined();
      expect(calls("itunes_inspect")).toHaveLength(0);
    },
  );

  it("uploads a bounded XML-only ZIP and inspects the returned staged path", async () => {
    const zipInspection = {
      ...inspection,
      library_path: "/staging/upload-1.zip",
      source_kind: "zip",
      package: {
        entries_total: 1,
        files_total: 1,
        media_files_total: 0,
        xml_candidates_total: 1,
        compressed_bytes: 512,
        uncompressed_bytes: 1024,
        selected_xml_path: "iTunes Library.xml",
        warnings: [],
      },
      localization: {
        state: "preview_only",
        proposed_root: "/media/music",
        files_total: 120,
        bytes_total: 0,
        conflicts: 0,
      },
    } as const;
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/capabilities") return capabilities;
      if (command === "library_enrichment/itunes_inspect")
        return structuredClone(zipInspection);
      throw new Error(`Unexpected command ${command}`);
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ library_path: "/staging/upload-1.zip" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountPage();
    await flushPromises();
    const file = new File(["zip-content"], "library backup.zip", {
      type: "application/zip",
    });
    const input = wrapper.get('[data-testid="itunes-zip-file"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await wrapper.get('[data-testid="itunes-zip-upload"]').trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://music.test/library-enrichment/itunes-upload",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token-1",
          "X-Filename": "library backup.zip",
        },
        body: file,
      },
    );
    expect(calls("itunes_inspect")[0][1]).toEqual({
      library_path: "/staging/upload-1.zip",
    });
    expect(
      (
        wrapper.get('[data-testid="itunes-library-path"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("/staging/upload-1.zip");
    expect(wrapper.get('[data-testid="itunes-inspection"]').text()).toContain(
      "iTunes Library.xml",
    );
  });

  it("preserves the Home Assistant Ingress prefix for ZIP uploads", async () => {
    mocks.baseUrl = "";
    mocks.getToken.mockReturnValue(null);
    window.history.replaceState({}, "", "/hassio_ingress/server/#/settings");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "ZIP has no iTunes XML" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountPage();
    await flushPromises();
    const file = new File(["zip-content"], "iTunes Library.zip", {
      type: "application/zip",
    });
    const input = wrapper.get('[data-testid="itunes-zip-file"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await wrapper.get('[data-testid="itunes-zip-upload"]').trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${window.location.origin}/hassio_ingress/server/library-enrichment/itunes-upload`,
    );
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      "X-Filename": "iTunes Library.zip",
    });
    expect(wrapper.text()).toContain("ZIP has no iTunes XML");
    window.history.replaceState({}, "", "/");
  });

  it("blocks oversized ZIP uploads in the browser", async () => {
    const wrapper = mountPage();
    await flushPromises();
    const file = new File([new Uint8Array(15728641)], "too-large.zip", {
      type: "application/zip",
    });
    const input = wrapper.get('[data-testid="itunes-zip-file"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.itunes_import.upload_too_large");
    expect(
      wrapper.get('[data-testid="itunes-zip-upload"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("previews exact mappings and selected playlists without applying", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await inspect(wrapper);
    await wrapper.get('[data-testid="itunes-playlist"]').setValue(true);
    await wrapper.get('[data-testid="itunes-preview"]').trigger("click");
    await flushPromises();
    expect(calls("itunes_preview")[0][1]).toEqual({
      inspection_id: "inspection-1",
      source_digest: "digest-1",
      path_mappings: [
        {
          source_root: "file://localhost/F:/Music/",
          target_root: "/media/music",
          provider_instance_id: "filesystem-a",
        },
      ],
      playlist_ids: ["p1"],
    });
    expect(
      wrapper.get('[data-testid="itunes-preview-result"]').text(),
    ).toContain("18");
    expect(
      mocks.sendCommand.mock.calls.some(([command]) =>
        String(command).includes("apply"),
      ),
    ).toBe(false);
  });

  it("invalidates preview when a mapping or playlist selection changes", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await inspect(wrapper);
    await wrapper.get('[data-testid="itunes-playlist"]').setValue(true);
    await wrapper.get('[data-testid="itunes-preview"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="itunes-preview-result"]').exists()).toBe(
      true,
    );
    await wrapper
      .get('[data-testid="itunes-target-root"]')
      .setValue("/media/restored");
    await flushPromises();
    expect(wrapper.find('[data-testid="itunes-preview-result"]').exists()).toBe(
      false,
    );
    await wrapper.get('[data-testid="itunes-preview"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="itunes-playlist"]').setValue(false);
    await flushPromises();
    expect(wrapper.find('[data-testid="itunes-preview-result"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.get('[data-testid="itunes-preview"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("applies one fully resolved preview only after explicit confirmation and refreshes status", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/capabilities")
        return applyCapabilities;
      if (command === "library_enrichment/itunes_inspect")
        return structuredClone(inspection);
      if (command === "library_enrichment/itunes_preview")
        return structuredClone(applicablePreview);
      if (command === "library_enrichment/itunes_apply")
        return structuredClone({ ...appliedStatus, state: "creating" });
      if (command === "library_enrichment/itunes_apply_status")
        return structuredClone(appliedStatus);
      throw new Error(`Unexpected command ${command}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    await inspect(wrapper);
    await wrapper.get('[data-testid="itunes-playlist"]').setValue(true);
    await wrapper.get('[data-testid="itunes-preview"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("settings.itunes_import.preview_resolved");
    expect(
      wrapper.get('[data-testid="itunes-apply"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-testid="itunes-apply-confirm"]').setValue(true);
    await wrapper.get('[data-testid="itunes-apply"]').trigger("click");
    await flushPromises();

    expect(calls("itunes_apply")[0][1]).toEqual({
      inspection_id: "inspection-preview-1",
      revision: 3,
      source_digest: "digest-1",
      preview_digest: "preview-1",
      playlist_id: "p1",
      allow_partial: false,
    });
    expect(calls("itunes_apply_status")).toHaveLength(1);
    expect(wrapper.get('[data-testid="itunes-apply-status"]').text()).toContain(
      "applied",
    );
  });

  it("requires explicit partial consent when some occurrences did not resolve", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/capabilities")
        return applyCapabilities;
      if (command === "library_enrichment/itunes_inspect")
        return structuredClone(inspection);
      if (command === "library_enrichment/itunes_preview")
        return structuredClone({ ...applicablePreview, unresolved: 1 });
      if (command === "library_enrichment/itunes_apply")
        return structuredClone({ ...appliedStatus, source_count: 20 });
      if (command === "library_enrichment/itunes_apply_status")
        return structuredClone(appliedStatus);
      throw new Error(`Unexpected command ${command}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    await inspect(wrapper);
    await wrapper.get('[data-testid="itunes-playlist"]').setValue(true);
    await wrapper.get('[data-testid="itunes-preview"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="itunes-apply-partial"]').exists()).toBe(
      true,
    );
    await wrapper.get('[data-testid="itunes-apply-confirm"]').setValue(true);
    expect(
      wrapper.get('[data-testid="itunes-apply"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-testid="itunes-apply-partial"]').setValue(true);
    await wrapper.get('[data-testid="itunes-apply"]').trigger("click");
    await flushPromises();
    expect(calls("itunes_apply")[0][1]).toMatchObject({ allow_partial: true });
  });

  it("never previews an unbound media path mapping", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper
      .get('[data-testid="itunes-library-path"]')
      .setValue("/imports/iTunes Library.xml");
    await wrapper.get('[data-testid="itunes-inspect"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="itunes-playlist"]').setValue(true);

    expect(
      wrapper.get('[data-testid="itunes-preview"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('[data-testid="itunes-preview"]').trigger("click");
    expect(calls("itunes_preview")).toHaveLength(0);
  });

  it("refreshes and distinguishes uncertain status after an apply error", async () => {
    mocks.sendCommand.mockImplementation(async (command: string) => {
      if (command === "library_enrichment/capabilities")
        return applyCapabilities;
      if (command === "library_enrichment/itunes_inspect")
        return structuredClone(inspection);
      if (command === "library_enrichment/itunes_preview")
        return structuredClone(applicablePreview);
      if (command === "library_enrichment/itunes_apply")
        throw new Error("Creation outcome uncertain");
      if (command === "library_enrichment/itunes_apply_status")
        return structuredClone({ ...appliedStatus, state: "uncertain" });
      throw new Error(`Unexpected command ${command}`);
    });
    const wrapper = mountPage();
    await flushPromises();
    await inspect(wrapper);
    await wrapper.get('[data-testid="itunes-playlist"]').setValue(true);
    await wrapper.get('[data-testid="itunes-preview"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="itunes-apply-confirm"]').setValue(true);
    await wrapper.get('[data-testid="itunes-apply"]').trigger("click");
    await flushPromises();

    expect(calls("itunes_apply_status")).toHaveLength(1);
    expect(
      wrapper.find('[data-testid="itunes-apply-uncertain"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain("Creation outcome uncertain");
  });

  it("uses stacked, full-width mobile controls", async () => {
    const source = (await import("@/views/settings/LegacyItunesImport.vue?raw"))
      .default;
    expect(source).toContain("@media (max-width: 639px)");
    expect(source).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(source).toContain('[data-testid="itunes-preview"]');
    expect(source).toContain("width: 100%");
    expect(source).toContain("overflow-wrap: anywhere");
  });
});
