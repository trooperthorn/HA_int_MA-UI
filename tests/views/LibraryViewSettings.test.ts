import LibraryViewSettings from "@/views/settings/LibraryViewSettings.vue";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setUserPreference: vi.fn(async () => {}),
  preferences: {} as Record<string, unknown>,
  getCoreConfigValue: vi.fn(),
  saveCoreConfig: vi.fn(async () => ({})),
}));

vi.mock("@/plugins/api", () => {
  const api = {
    getCoreConfigValue: mocks.getCoreConfigValue,
    saveCoreConfig: mocks.saveCoreConfig,
  };
  return { api, default: api };
});

vi.mock("@/plugins/auth", () => ({
  authManager: { hasScope: () => true },
}));

vi.mock("@/composables/userPreferences", async () => {
  const { computed } = await import("vue");
  return {
    setUserPreference: mocks.setUserPreference,
    useUserPreferences: () => ({
      getPreference: <T>(key: string, fallback: T) =>
        computed(() => (mocks.preferences[key] as T) ?? fallback),
    }),
  };
});

vi.mock("@/views/settings/SettingsHeaderCard.vue", () => ({
  default: { name: "SettingsHeaderCard", template: "<header />" },
}));

vi.mock("vue-sonner", () => ({ toast: { error: vi.fn() } }));

enableAutoUnmount(afterEach);

function mountPage() {
  return mount(LibraryViewSettings, {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

describe("LibraryViewSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preferences = {};
    mocks.getCoreConfigValue.mockImplementation(
      async (_d: string, key: string) =>
        key === "default_click_action_track" ? "play" : "play_track",
    );
  });

  it("writes a column, the density and a pane toggle to the preferences", async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(
      wrapper.find("[data-column='title']").attributes("data-disabled"),
    ).toBeDefined();

    await wrapper.find("[data-column='year']").trigger("click");
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.columns",
      { visibility: { year: false } },
    );

    await wrapper.find("[data-density='comfortable']").trigger("click");
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.columns",
      { density: "comfortable" },
    );

    await wrapper.find("[data-pane='queue']").trigger("click");
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.panes",
      { showQueue: false },
    );

    await wrapper.find("[data-testid='reset-panes']").trigger("click");
    expect(mocks.setUserPreference).toHaveBeenCalledWith(
      "libraryManager.panes",
      {},
    );
  });

  it("shows the queue controller's click settings and saves a change", async () => {
    const wrapper = mountPage();
    await flushPromises();

    const click = wrapper.find("[data-testid='click-action']");
    expect((click.element as HTMLSelectElement).value).toBe("play");
    expect(
      (wrapper.find("[data-testid='play-action']").element as HTMLSelectElement)
        .value,
    ).toBe("play_track");

    await click.setValue("browse");
    expect(mocks.saveCoreConfig).toHaveBeenCalledWith("player_queues", {
      default_click_action_track: "browse",
    });
  });
});
