import type { MusicAssistantApi } from "@/plugins/api";
import {
  MediaType,
  type ProviderMapping,
  type Track,
} from "@/plugins/api/interfaces";
import Duplicates from "@/views/settings/Duplicates.vue";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLibraryTracks: vi.fn<MusicAssistantApi["getLibraryTracks"]>(),
  getTasks: vi.fn<MusicAssistantApi["getTasks"]>(),
  removeProviderMapping: vi.fn<MusicAssistantApi["removeProviderMapping"]>(),
  removeItemFromLibrary: vi.fn<MusicAssistantApi["removeItemFromLibrary"]>(),
  addProviderMapping: vi.fn<MusicAssistantApi["addProviderMapping"]>(),
}));

vi.mock("@/plugins/api", () => {
  const api = {
    ...mocks,
    getProvider: () => ({ name: "SSD" }),
  };
  return { api, default: api };
});

vi.mock("@/plugins/i18n", () => ({ $t: (key: string) => key }));
vi.mock("vue-sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/views/settings/SettingsHeaderCard.vue", () => ({
  default: { name: "SettingsHeaderCard", template: "<header />" },
}));
vi.mock("@/components/ProviderIcon.vue", () => ({
  default: { name: "ProviderIcon", template: "<i />" },
}));

enableAutoUnmount(afterEach);

function mapping(
  item_id: string,
  codec: string,
  bit_rate = 0,
  details = "x",
): ProviderMapping {
  return {
    item_id,
    provider_domain: "filesystem_local",
    provider_instance: "filesystem_local--ssd",
    available: true,
    in_library: true,
    audio_format: {
      content_type: codec,
      codec_type: codec,
      sample_rate: 44100,
      bit_depth: 16,
      channels: 2,
      output_format_str: codec,
      bit_rate,
    },
    details,
    url: null,
  } as ProviderMapping;
}

const TRACKS = [
  {
    item_id: "1",
    name: "Lies",
    duration: 200,
    artists: [{ name: "Evanescence" }],
    album: { name: "Origin", year: 2000 },
    track_number: 9,
    external_ids: [],
    metadata: { images: [{}] },
    provider_mappings: [
      mapping("E/O/9.flac", "flac", 0, "a"),
      mapping("E/O/9.mp3", "mp3", 320, "b"),
    ],
  },
  {
    item_id: "2",
    name: "Eternal",
    duration: 442,
    artists: [{ name: "Evanescence" }],
    album: { name: "Origin", year: 2000 },
    track_number: 11,
    external_ids: [],
    metadata: { images: [{}] },
    provider_mappings: [mapping("E/O/11.flac", "flac", 0, "c")],
  },
  {
    item_id: "3",
    name: "Eternal",
    duration: 444,
    artists: [{ name: "Evanescence" }],
    album: null,
    track_number: 0,
    external_ids: [],
    metadata: {},
    provider_mappings: [mapping("VA/11.mp3", "mp3", 128, "d")],
  },
] as unknown as Track[];

function mountPage() {
  return mount(Duplicates, {
    global: { mocks: { $t: (key: string) => key } },
    attachTo: document.body,
  });
}

describe("Duplicates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getLibraryTracks.mockResolvedValue(TRACKS);
    mocks.getTasks.mockResolvedValue([]);
    mocks.removeProviderMapping.mockResolvedValue(undefined);
    mocks.removeItemFromLibrary.mockResolvedValue(undefined);
    mocks.addProviderMapping.mockResolvedValue(undefined);
  });

  it("scans, groups and removes a lesser copy", async () => {
    const wrapper = mountPage();
    expect(wrapper.find("[data-duplicates-status]").text()).toBe(
      "settings.duplicates.not_scanned",
    );
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();

    expect(mocks.getLibraryTracks).toHaveBeenCalledWith(
      undefined,
      undefined,
      500,
      0,
      "sort_name",
    );
    const groups = wrapper.findAll("[data-group-kind]");
    expect(groups.map((group) => group.attributes("data-group-kind"))).toEqual([
      "copies",
      "probable",
    ]);

    const rows = groups[0].findAll("[data-duplicates-row]");
    expect(rows[0].classes()).toContain("duplicates__row--keep");
    expect(rows[0].text()).toContain("FLAC 44.1 kHz 16-bit");
    expect(rows[1].text()).toContain("MP3 320 kb/s");

    await rows[1].find("[data-duplicates-remove]").trigger("click");
    await flushPromises();
    expect(mocks.removeProviderMapping).toHaveBeenCalledWith(
      MediaType.TRACK,
      "1",
      TRACKS[0].provider_mappings[1],
    );
    expect(groups[0].findAll("[data-duplicates-row]")[1].classes()).toContain(
      "duplicates__row--gone",
    );
  });

  it("selects every lesser copy of the safe kinds and removes them after a confirmation", async () => {
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();

    await wrapper.find("[data-duplicates-select-lesser]").trigger("click");
    await flushPromises();
    // only the copies group's mp3; the probable pair is review-only
    expect(wrapper.text()).toContain("settings.duplicates.selected");
    await wrapper.find("[data-duplicates-remove-selected]").trigger("click");
    await flushPromises();
    await wrapper.find("[data-duplicates-confirm]").trigger("click");
    await flushPromises();
    expect(mocks.removeProviderMapping).toHaveBeenCalledTimes(1);
    expect(mocks.removeProviderMapping).toHaveBeenCalledWith(
      MediaType.TRACK,
      "1",
      TRACKS[0].provider_mappings[1],
    );
  });

  it("merges a probable pair into the kept track", async () => {
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();

    await wrapper.find("[data-duplicates-merge]").trigger("click");
    await flushPromises();
    expect(mocks.addProviderMapping).toHaveBeenCalledWith(
      MediaType.TRACK,
      "2",
      TRACKS[2].provider_mappings[0],
    );
    expect(mocks.removeItemFromLibrary).toHaveBeenCalledWith(
      MediaType.TRACK,
      "3",
    );
  });

  it("filters by kind", async () => {
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();
    await wrapper.find("[data-duplicates-kind]").setValue("probable");
    await flushPromises();
    expect(
      wrapper
        .findAll("[data-group-kind]")
        .map((group) => group.attributes("data-group-kind")),
    ).toEqual(["probable"]);
  });
});
