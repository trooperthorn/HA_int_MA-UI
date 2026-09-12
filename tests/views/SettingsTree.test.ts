import SettingsTree from "@/views/settings/SettingsTree.vue";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  route: { name: "settings", params: {} as Record<string, string>, query: {} },
  push: vi.fn(),
  getProviderConfigs: vi.fn(),
  getCoreConfigs: vi.fn(),
}));

vi.mock("@/plugins/api", async () => {
  const { ref } = await import("vue");
  const api = {
    state: ref("initialized"),
    getProviderConfigs: mocks.getProviderConfigs,
    getCoreConfigs: mocks.getCoreConfigs,
    getProvider: (id: string) =>
      id === "spotify--1" ? { type: "music", domain: "spotify" } : undefined,
    providerManifests: { spotify: { name: "Spotify", type: "music" } },
  };
  return {
    api,
    default: api,
    ConnectionState: { INITIALIZED: "initialized" },
  };
});

vi.mock("@/plugins/auth", () => ({
  authManager: {
    isAdmin: () => mocks.isAdmin,
    hasScope: () => true,
  },
}));

vi.mock("@/plugins/api/helpers", () => ({ requireServerVersion: () => true }));

vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  return {
    useRoute: () => reactive(mocks.route),
    useRouter: () => ({ push: mocks.push }),
  };
});

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/Icon.vue", () => ({
  default: { name: "Icon", props: ["icon"], template: "<i />" },
}));
vi.mock("@/components/ProviderIcon.vue", () => ({
  default: { name: "ProviderIcon", props: ["domain"], template: "<i />" },
}));

enableAutoUnmount(afterEach);

const labels = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll(".settings-tree__label").map((el) => el.text());

function mountTree() {
  return mount(SettingsTree, {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

describe("SettingsTree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin = true;
    mocks.route.name = "settings";
    mocks.route.params = {};
    mocks.getProviderConfigs.mockResolvedValue([
      {
        instance_id: "spotify--1",
        domain: "spotify",
        enabled: true,
        name: null,
        default_name: "Spotify",
      },
      {
        instance_id: "tidal--1",
        domain: "tidal",
        enabled: false,
        name: "Tidal",
        default_name: null,
      },
    ]);
    mocks.getCoreConfigs.mockResolvedValue([
      { domain: "player_queues" },
      { domain: "cache" },
    ]);
  });

  it("lists every section an admin may open, with sources, modules and frontend pages under them", async () => {
    mocks.route.name = "frontendlibraryview";
    const wrapper = mountTree();
    await flushPromises();

    const seen = labels(wrapper);
    expect(seen[0]).toBe("settings.music_sources");
    expect(seen).toContain("settings.system");
    expect(seen).toContain("auth.user_management");
    // the frontend branch is open because the route sits in it
    expect(seen).toContain("settings.appearance");
    expect(seen).toContain("settings.library_view.title");
    expect(seen).toContain("settings.keyboard.title");
    expect(wrapper.find(".settings-tree__row--active").text()).toContain(
      "settings.library_view.title",
    );
    // other branches stay closed until opened
    expect(seen).not.toContain("Spotify");

    await wrapper
      .find("[data-node='music_providers'] .settings-tree__chevron")
      .trigger("click");
    expect(labels(wrapper)).toContain("Spotify");
    expect(labels(wrapper)).not.toContain("Tidal");

    await wrapper
      .find("[data-node='system'] .settings-tree__chevron")
      .trigger("click");
    const after = labels(wrapper);
    // no translation in the test, so the modules fall back to their domain
    expect(after).toContain("cache");
    expect(after).toContain("player_queues");
    expect(after).toContain("background_tasks.title");
    expect(after).toContain("settings.diagnostics");
  });

  it("navigates on click and marks the route's node", async () => {
    mocks.route.name = "editprovider";
    mocks.route.params = { instanceId: "spotify--1" };
    const wrapper = mountTree();
    await flushPromises();

    expect(wrapper.find(".settings-tree__row--active").text()).toContain(
      "Spotify",
    );
    await wrapper.find("[data-node='about']").trigger("click");
    expect(mocks.push).toHaveBeenCalledWith({ name: "aboutsettings" });
  });

  it("hides admin-only sections and the system modules from a member", async () => {
    mocks.isAdmin = false;
    const wrapper = mountTree();
    await flushPromises();

    const seen = labels(wrapper);
    expect(seen).not.toContain("settings.system");
    expect(seen).not.toContain("auth.user_management");
    expect(seen).toContain("settings.frontend");
    expect(mocks.getCoreConfigs).not.toHaveBeenCalled();
  });
});
