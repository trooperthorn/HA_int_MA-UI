import FolderPickerDialog from "@/components/FolderPickerDialog.vue";
import type { ConfigEntryUI } from "@/helpers/config_entry_ui";
import { resetFolderBrowseProbe } from "@/helpers/folder_picker";
import type { MusicAssistantApi } from "@/plugins/api";
import {
  ConfigEntryType,
  type BrowsePathResult,
} from "@/plugins/api/interfaces";
import ConfigEntryField from "@/views/settings/ConfigEntryField.vue";
import FolderPickerField from "@/views/settings/fields/FolderPickerField.vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    browseProviderPath: vi.fn<MusicAssistantApi["browseProviderPath"]>(),
  },
}));

vi.mock("@/plugins/api", () => ({
  api: apiMock,
  default: apiMock,
}));

vi.mock("@/plugins/i18n", () => ({
  $t: (key: string) => key,
}));

const vuetify = createVuetify({ components, directives });

const ROOTS: BrowsePathResult["roots"] = [
  { path: "/music", label: "Music drive", present: true },
  { path: "/media", label: "Media", present: true },
  { path: "/share", label: "Share", present: false },
];

// a tiny tree: /music/musicnix/Evanescence
function fakeBrowse(path?: string): Promise<BrowsePathResult> {
  const tree: Record<string, string[]> = {
    "/music": ["musicnix"],
    "/music/musicnix": ["Evanescence", "Linkin Park"],
    "/music/musicnix/Evanescence": [],
    "/media": [],
  };
  if (!path) {
    return Promise.resolve({
      roots: ROOTS,
      path: null,
      parent: null,
      folders: [],
    });
  }
  if (!(path in tree))
    return Promise.reject(new Error("outside the browsable folders"));
  const root = ROOTS.find(
    (candidate) =>
      path === candidate.path || path.startsWith(candidate.path + "/"),
  )!;
  return Promise.resolve({
    roots: ROOTS,
    path,
    parent: path === root.path ? null : path.slice(0, path.lastIndexOf("/")),
    folders: tree[path].map((name) => ({ name, path: `${path}/${name}` })),
  });
}

const pathEntry = (value: string | null = null): ConfigEntryUI =>
  ({
    key: "path",
    type: ConfigEntryType.STRING,
    label: "Path",
    default_value: "/media",
    required: true,
    options: [],
    value,
  }) as unknown as ConfigEntryUI;

describe("FolderPickerField", () => {
  beforeEach(() => {
    apiMock.browseProviderPath.mockReset();
    resetFolderBrowseProbe();
  });

  it("is chosen for the filesystem provider's path entry only", async () => {
    apiMock.browseProviderPath.mockImplementation(fakeBrowse);
    const forFilesystem = mount(ConfigEntryField, {
      props: {
        confEntry: pathEntry(),
        showPasswordValues: false,
        providerDomain: "filesystem_local",
      },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    expect(forFilesystem.findComponent(FolderPickerField).exists()).toBe(true);
    expect(forFilesystem.find("[data-folder-browse]").exists()).toBe(true);

    const forSpotify = mount(ConfigEntryField, {
      props: {
        confEntry: pathEntry(),
        showPasswordValues: false,
        providerDomain: "spotify",
      },
      global: { plugins: [vuetify] },
    });
    expect(forSpotify.findComponent(FolderPickerField).exists()).toBe(false);
  });

  it("hides the Browse button on a server without the folder listing", async () => {
    apiMock.browseProviderPath.mockRejectedValue(
      new Error("Unknown command: config/providers/browse_path"),
    );
    const wrapper = mount(FolderPickerField, {
      props: { entry: pathEntry(), label: "Path" },
      global: { plugins: [vuetify] },
    });
    await flushPromises();
    expect(wrapper.find("[data-folder-browse]").exists()).toBe(false);
    // typing still works
    await wrapper.find("input").setValue("/media/music");
    expect(wrapper.emitted("update:value")?.at(-1)).toEqual(["/media/music"]);
  });

  it("browses from the roots, descends, and writes the picked folder into the entry", async () => {
    apiMock.browseProviderPath.mockImplementation(fakeBrowse);
    const wrapper = mount(FolderPickerField, {
      props: { entry: pathEntry(), label: "Path" },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.find("[data-folder-browse]").trigger("click");
    await flushPromises();

    const dialog = wrapper.findComponent(FolderPickerDialog);
    expect(dialog.exists()).toBe(true);
    // the dialog renders in a portal; query the document
    const rootButtons = Array.from(
      document.querySelectorAll("[data-folder-roots] button"),
    );
    expect(
      rootButtons.map((button) => button.textContent?.trim().split(/\s+/)[0]),
    ).toEqual(["Music", "Media", "Share"]);
    // the absent share root cannot be opened
    expect((rootButtons[2] as HTMLButtonElement).disabled).toBe(true);

    (rootButtons[0] as HTMLButtonElement).click();
    await flushPromises();
    let rows = Array.from(document.querySelectorAll("[data-folder-row]"));
    expect(rows.map((row) => row.textContent?.trim())).toEqual(["musicnix"]);
    (rows[0] as HTMLButtonElement).click();
    await flushPromises();
    rows = Array.from(document.querySelectorAll("[data-folder-row]"));
    expect(rows.map((row) => row.textContent?.trim())).toEqual([
      "Evanescence",
      "Linkin Park",
    ]);
    expect(
      Array.from(
        document.querySelectorAll("[data-folder-breadcrumb] button"),
      ).map((crumb) => crumb.textContent?.trim()),
    ).toEqual(["Music drive", "musicnix"]);

    (document.querySelector("[data-folder-use]") as HTMLButtonElement).click();
    await flushPromises();
    expect(wrapper.emitted("update:value")?.at(-1)).toEqual([
      "/music/musicnix",
    ]);
    wrapper.unmount();
  });

  it("opens where the entry already points when that is browsable", async () => {
    apiMock.browseProviderPath.mockImplementation(fakeBrowse);
    const wrapper = mount(FolderPickerField, {
      props: { entry: pathEntry("/music/musicnix/Evanescence"), label: "Path" },
      global: { plugins: [vuetify] },
      attachTo: document.body,
    });
    await flushPromises();
    await wrapper.find("[data-folder-browse]").trigger("click");
    await flushPromises();
    expect(apiMock.browseProviderPath).toHaveBeenLastCalledWith(
      "/music/musicnix/Evanescence",
    );
    expect(
      document.querySelector("[data-folder-use]")?.hasAttribute("disabled"),
    ).toBe(false);
    wrapper.unmount();
  });
});
