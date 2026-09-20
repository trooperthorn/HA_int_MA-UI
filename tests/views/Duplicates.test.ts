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
  trashList: vi.fn<MusicAssistantApi["trashList"]>(),
  trashMove: vi.fn<MusicAssistantApi["trashMove"]>(),
  trashRestore: vi.fn<MusicAssistantApi["trashRestore"]>(),
  trashEmpty: vi.fn<MusicAssistantApi["trashEmpty"]>(),
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
    // an app image without the trash commands, unless a test says otherwise
    mocks.trashList.mockRejectedValue(new Error("unknown command"));
    mocks.trashMove.mockImplementation(async (_instance, path) => ({
      path,
      trashed_path: path,
    }));
    mocks.trashRestore.mockImplementation(async (_instance, path) => ({
      path,
      trashed_path: path,
    }));
    mocks.trashEmpty.mockResolvedValue({ deleted: 2 });
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

  it("shows unloaded external IDs without reporting them missing", async () => {
    mocks.getLibraryTracks.mockResolvedValue(
      TRACKS.map((track) => {
        const summary = { ...track };
        Reflect.deleteProperty(summary, "external_ids");
        return summary;
      }),
    );
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();
    const tags = wrapper.find(".duplicates__cell--tags");
    expect(tags.text()).toContain("settings.duplicates.tag_ids_unknown");
    expect(tags.attributes("title")).toBe(
      "settings.duplicates.tag_ids_unknown",
    );
    expect(wrapper.find('[data-group-kind="checksum"]').exists()).toBe(false);
  });

  it("does not offer bulk cleanup for unrelated files sharing an mtime", async () => {
    mocks.getLibraryTracks.mockResolvedValue([
      {
        ...TRACKS[0],
        provider_mappings: [mapping("a.flac", "flac", 0, "1726704000")],
      },
      {
        ...TRACKS[1],
        provider_mappings: [mapping("b.flac", "flac", 0, "1726704000")],
      },
    ]);
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();
    expect(wrapper.findAll("[data-group-kind]")).toHaveLength(0);
    expect(wrapper.find("[data-duplicates-select-lesser]").exists()).toBe(
      false,
    );
    expect(mocks.removeProviderMapping).not.toHaveBeenCalled();
    expect(mocks.trashMove).not.toHaveBeenCalled();
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

  it("hides every trash action when the server lacks the commands", async () => {
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();
    expect(mocks.trashList).toHaveBeenCalledWith("filesystem_local--ssd", {
      suppressGlobalError: true,
    });
    expect(wrapper.find("[data-duplicates-trash]").exists()).toBe(false);
    expect(wrapper.find("[data-duplicates-trash-selected]").exists()).toBe(
      false,
    );
    expect(wrapper.find("[data-duplicates-bin]").exists()).toBe(false);
  });

  it("moves a lesser copy to the trash: mapping removed, file renamed, bin refreshed", async () => {
    mocks.trashList
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { path: "E/O/9.mp3", size: 5_000_000, trashed_at: 1_700_000_000 },
      ]);
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();

    const rows = wrapper
      .findAll("[data-group-kind]")[0]
      .findAll("[data-duplicates-row]");
    // the keeper never offers the trash
    expect(rows[0].find("[data-duplicates-trash]").exists()).toBe(false);
    await rows[1].find("[data-duplicates-trash]").trigger("click");
    await flushPromises();
    expect(mocks.removeProviderMapping).toHaveBeenCalledWith(
      MediaType.TRACK,
      "1",
      TRACKS[0].provider_mappings[1],
    );
    expect(mocks.trashMove).toHaveBeenCalledWith(
      "filesystem_local--ssd",
      "E/O/9.mp3",
    );
    const bin = wrapper.find("[data-duplicates-bin]");
    expect(bin.attributes("data-bin-instance")).toBe("filesystem_local--ssd");
    const entries = bin.findAll("[data-duplicates-trash-entry]");
    expect(entries).toHaveLength(1);
    expect(entries[0].text()).toContain("E/O/9.mp3");
    expect(entries[0].text()).toContain("5.0 MB");

    // restore, then empty behind its confirmation
    await entries[0].find("[data-duplicates-restore]").trigger("click");
    await flushPromises();
    expect(mocks.trashRestore).toHaveBeenCalledWith(
      "filesystem_local--ssd",
      "E/O/9.mp3",
    );
    await bin.find("[data-duplicates-empty]").trigger("click");
    await flushPromises();
    expect(mocks.trashEmpty).not.toHaveBeenCalled();
    await bin.find("[data-duplicates-confirm-empty]").trigger("click");
    await flushPromises();
    expect(mocks.trashEmpty).toHaveBeenCalledWith("filesystem_local--ssd");
  });

  it("moves the selected copies and the orphaned sheets to the trash in bulk", async () => {
    mocks.trashList.mockResolvedValue([]);
    mocks.getTasks.mockResolvedValue([
      {
        task_id: "t",
        name: "Sync",
        status: "completed",
        metadata: {
          task_domain: "music_sync",
          provider_instance: "filesystem_local--ssd",
          provider_domain: "filesystem_local",
          provider_name: "SSD",
        },
        logs: [
          "2026-09-14 20:52:37 WARNING [music_assistant.Filesystem (local disk)] Failed to process A/B/B.cue: Audio file not found for CUE sheet",
        ],
      },
    ] as never);
    const wrapper = mountPage();
    await wrapper.find("[data-duplicates-scan]").trigger("click");
    await flushPromises();

    await wrapper.find("[data-duplicates-select-lesser]").trigger("click");
    await wrapper.find("[data-duplicates-trash-selected]").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("settings.duplicates.confirm_trash");
    await wrapper.find("[data-duplicates-confirm]").trigger("click");
    await flushPromises();
    expect(mocks.removeProviderMapping).toHaveBeenCalledTimes(1);
    expect(mocks.trashMove).toHaveBeenCalledWith(
      "filesystem_local--ssd",
      "E/O/9.mp3",
    );

    const cueSection = wrapper.find('[data-group-kind="cue"]');
    expect(cueSection.exists()).toBe(true);
    await cueSection.find("[data-duplicates-trash-cues]").trigger("click");
    await flushPromises();
    await cueSection.find("[data-duplicates-confirm-cues]").trigger("click");
    await flushPromises();
    expect(mocks.trashMove).toHaveBeenLastCalledWith(
      "filesystem_local--ssd",
      "A/B/B.cue",
    );
    expect(cueSection.find("[data-duplicates-cue]").classes()).toContain(
      "duplicates__row--gone",
    );
  });
});
