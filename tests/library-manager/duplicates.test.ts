import {
  buildGroups,
  cueRowsFrom,
  keepIndex,
  loadTrashBins,
  normalizeName,
  rowsOf,
  summarizeFormat,
  tagHealth,
  toCsv,
} from "@/library-manager/duplicates";
import type { SyncIssue } from "@/library-manager/syncIssues";
import type { ProviderMapping, Track } from "@/plugins/api/interfaces";
import { describe, expect, it, vi } from "vitest";

const trashList = vi.hoisted(() => vi.fn());

vi.mock("@/plugins/api", () => ({
  api: {
    getProvider: (instance: string) =>
      instance === "filesystem_local--ssd" ? { name: "SSD" } : undefined,
    trashList,
  },
}));

function mapping(
  over: Partial<ProviderMapping> & { item_id: string },
): ProviderMapping {
  return {
    provider_domain: "filesystem_local",
    provider_instance: "filesystem_local--ssd",
    available: true,
    in_library: true,
    audio_format: {
      content_type: "flac",
      codec_type: "flac",
      sample_rate: 44100,
      bit_depth: 16,
      channels: 2,
      output_format_str: "flac",
      bit_rate: 0,
    },
    details: null,
    url: null,
    ...over,
  } as ProviderMapping;
}

function track(
  over: Record<string, unknown> & { item_id: string; name: string },
): Track {
  return {
    provider: "library",
    version: "",
    uri: `library://track/${over.item_id}`,
    external_ids: [],
    is_playable: true,
    media_type: "track",
    duration: 200,
    artists: [{ name: "Evanescence" }],
    album: { name: "Origin", year: 2000, image: null },
    disc_number: 1,
    track_number: 9,
    provider_mappings: [],
    metadata: { images: [{}] },
    favorite: false,
    available: true,
    ...over,
  } as unknown as Track;
}

const mp3 = (item_id: string, details = "a1") =>
  mapping({
    item_id,
    details,
    audio_format: {
      content_type: "mp3",
      codec_type: "mp3",
      sample_rate: 44100,
      bit_depth: 16,
      channels: 2,
      output_format_str: "mp3",
      bit_rate: 320,
    } as ProviderMapping["audio_format"],
  });

describe("format ranking", () => {
  it("prefers lossless, then depth and rate, then bit rate", () => {
    const flac16 = summarizeFormat(mapping({ item_id: "a" }));
    const flac24 = summarizeFormat(
      mapping({
        item_id: "b",
        audio_format: {
          ...mapping({ item_id: "b" }).audio_format,
          bit_depth: 24,
        },
      }),
    );
    const mp3320 = summarizeFormat(mp3("c"));
    expect(flac24.score).toBeGreaterThan(flac16.score);
    expect(flac16.score).toBeGreaterThan(mp3320.score);
    expect(flac16.label).toBe("FLAC 44.1 kHz 16-bit");
    expect(mp3320.label).toBe("MP3 320 kb/s");
  });

  it("keeps the best format, then the better tags, then the older row", () => {
    const rows = rowsOf(
      track({
        item_id: "1",
        name: "Lies",
        provider_mappings: [
          mp3("x.mp3"),
          mapping({ item_id: "x.flac", details: "b2" }),
        ],
      }),
    );
    expect(keepIndex(rows)).toBe(1);
  });
});

describe("tag health", () => {
  it("counts what the listing shows", () => {
    expect(tagHealth(track({ item_id: "1", name: "x" })).missing).toEqual([
      "ids",
    ]);
    const bare = track({
      item_id: "2",
      name: "y",
      album: null,
      track_number: 0,
      metadata: {},
    });
    expect(tagHealth(bare)).toEqual({
      score: 1,
      missing: ["album", "track_number", "ids", "cover"],
      unknown: [],
    });
  });

  it.each([undefined, null])(
    "keeps unloaded IDs unknown (%s)",
    (external_ids) => {
      const summary = track({ item_id: "1", name: "x", external_ids });
      expect(tagHealth(summary)).toEqual({
        score: 4,
        missing: [],
        unknown: ["ids"],
      });
      expect(
        rowsOf({
          ...summary,
          provider_mappings: [mapping({ item_id: "a" })],
        })[0].tagsUnknown,
      ).toEqual(["ids"]);
    },
  );

  it("does not claim missing MusicBrainz/ISRC based on unrelated loaded IDs", () => {
    const full = track({
      item_id: "1",
      name: "x",
      external_ids: [["acoustid", "value"]],
    });
    expect(tagHealth(full)).toEqual({ score: 5, missing: [], unknown: [] });
  });
});

describe("buildGroups", () => {
  it("finds copies and probable pairs without treating provider details as hashes", () => {
    const tracks = [
      // A: one track, a flac and an mp3 copy on the same source
      track({
        item_id: "1",
        name: "Lies",
        provider_mappings: [
          mapping({ item_id: "E/O/9 - Lies.flac", details: "c1" }),
          mp3("E/O/9 - Lies.mp3", "c2"),
        ],
      }),
      // B: matching metadata under two tracks; opaque details prove no identity
      track({
        item_id: "2",
        name: "Anywhere",
        provider_mappings: [
          mapping({ item_id: "E/O/8.flac", details: "same" }),
        ],
      }),
      track({
        item_id: "3",
        name: "Anywhere (copy)",
        provider_mappings: [mapping({ item_id: "Dl/8.flac", details: "same" })],
      }),
      // C: same song filed twice, one under Various Artists
      track({
        item_id: "4",
        name: "Eternal",
        duration: 442,
        provider_mappings: [mapping({ item_id: "E/O/11.flac", details: "d1" })],
      }),
      track({
        item_id: "5",
        name: "Eternal",
        duration: 445,
        album: { name: "Origin", year: null, image: null },
        provider_mappings: [mp3("VA/11.mp3", "d2")],
      }),
      // not a duplicate: a streaming copy beside a file
      track({
        item_id: "6",
        name: "Away From Me",
        provider_mappings: [
          mapping({ item_id: "E/O/10.flac", details: "e1" }),
          mapping({
            item_id: "spotify:1",
            provider_domain: "spotify",
            provider_instance: "spotify--x",
          }),
        ],
      }),
    ] as Track[];
    const groups = buildGroups(tracks);
    expect(groups.map((group) => group.kind)).toEqual([
      "copies",
      "probable",
      "probable",
    ]);

    const copies = groups[0];
    expect(copies.rows.map((row) => row.path)).toEqual([
      "E/O/9 - Lies.flac",
      "E/O/9 - Lies.mp3",
    ]);
    expect(copies.keep).toBe(0);
    expect(copies.rows[0].sourceName).toBe("SSD");

    const candidate = groups[1];
    expect(candidate.reason).toBe("name and duration");
    expect(new Set(candidate.rows.map((row) => row.trackId))).toEqual(
      new Set(["2", "3"]),
    );

    const probable = groups[2];
    expect(probable.rows.map((row) => row.trackId)).toEqual(["4", "5"]);
    expect(probable.rows[probable.keep].trackId).toBe("4");
  });

  it.each(["1726704000", "abcdef0123456789", "sha256:" + "a".repeat(64)])(
    "never groups unrelated files by opaque provider details: %s",
    (details) => {
      const tracks = [
        track({
          item_id: "1",
          name: "Lies",
          provider_mappings: [mapping({ item_id: "a.flac", details })],
        }),
        track({
          item_id: "2",
          name: "Pyramid",
          artists: [{ name: "Alan Parsons" }],
          provider_mappings: [mapping({ item_id: "b.flac", details })],
        }),
      ];
      expect(buildGroups(tracks)).toEqual([]);
      expect(rowsOf(tracks[0])[0].checksum).toBeNull();
    },
  );

  it("keeps same-track mappings as import candidates when mtimes match", () => {
    const groups = buildGroups([
      track({
        item_id: "1",
        name: "Lies",
        provider_mappings: [
          mapping({ item_id: "a.flac", details: "1726704000" }),
          mapping({ item_id: "b.flac", details: "1726704000" }),
        ],
      }),
    ]);
    expect(groups[0].kind).toBe("copies");
    expect(groups[0].reason).toBe("merged at import");
  });

  it("does not pair songs whose durations differ too much", () => {
    const groups = buildGroups([
      track({
        item_id: "1",
        name: "Intro",
        duration: 60,
        provider_mappings: [mapping({ item_id: "a" })],
      }),
      track({
        item_id: "2",
        name: "Intro",
        duration: 200,
        provider_mappings: [mapping({ item_id: "b" })],
      }),
    ]);
    expect(groups).toEqual([]);
  });

  it("normalizes names for matching", () => {
    expect(normalizeName("Bring Me To Life (Remastered) [2021]")).toBe(
      "bring me to life",
    );
  });
});

describe("cue rows and csv", () => {
  it("keeps only the orphaned sheets and writes the csv", () => {
    const issues: SyncIssue[] = [
      {
        type: "cue_audio_missing",
        kind: "cue_audio_missing",
        path: "Aaron Lewis/Town Line/Town Line.cue",
        message: "Audio file not found",
        occurrences: 1,
        providerInstance: "filesystem_local--ssd",
        providerDomain: "filesystem_local",
        providerName: "SSD",
        taskId: "t",
      },
      {
        type: "missing_tag:albumartist",
        kind: "missing_tag",
        detail: "albumartist",
        path: "x.flac",
        message: "",
        occurrences: 1,
        providerInstance: "filesystem_local--ssd",
        providerDomain: "filesystem_local",
        providerName: "SSD",
        taskId: "t",
      },
    ];
    const cues = cueRowsFrom(issues);
    expect(cues).toHaveLength(1);
    const groups = buildGroups([
      track({
        item_id: "1",
        name: 'Say "hi", now',
        provider_mappings: [
          mapping({ item_id: "a.flac", details: "c1" }),
          mp3("a.mp3", "c2"),
        ],
      }),
    ]);
    const csv = toCsv(groups, cues);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "kind,group,keep,track,artists,album,source,path,format,checksum,tags_missing,tags_unknown",
    );
    expect(lines[1]).toContain('"Say ""hi"", now"');
    expect(lines[1]).toContain(",keep,");
    expect(lines.at(-1)).toContain(
      "cue,orphaned CUE sheet,,,,,SSD,Aaron Lewis/Town Line/Town Line.cue",
    );
  });

  it("exports unloaded IDs separately from absent IDs", () => {
    const groups = buildGroups([
      track({
        item_id: "1",
        name: "Lies",
        external_ids: undefined,
        provider_mappings: [mapping({ item_id: "a.flac" }), mp3("a.mp3")],
      }),
    ]);
    expect(toCsv(groups, []).trim().split("\n")[1]).toMatch(/,,,ids$/);
  });
});

describe("loadTrashBins", () => {
  it("is null without the commands, and keeps going past one unreadable source", async () => {
    trashList.mockRejectedValueOnce(new Error("unknown command"));
    expect(await loadTrashBins([{ id: "a", name: "A" }])).toBeNull();

    trashList
      .mockResolvedValueOnce([{ path: "x.mp3", size: 1, trashed_at: 1 }])
      .mockRejectedValueOnce(new Error("io"));
    expect(
      await loadTrashBins([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ]),
    ).toEqual([
      {
        instance: "a",
        name: "A",
        entries: [{ path: "x.mp3", size: 1, trashed_at: 1 }],
      },
      { instance: "b", name: "B", entries: [] },
    ]);
    expect(await loadTrashBins([])).toEqual([]);
  });
});
