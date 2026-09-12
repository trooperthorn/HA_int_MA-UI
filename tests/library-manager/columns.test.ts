import {
  DEFAULT_COLUMN_VISIBILITY,
  gridSortToSortBy,
  sortByToGridSort,
  TRACK_COLUMN_BY_ID,
  TRACK_COLUMNS,
  TRACK_SORT_KEYS,
} from "@/library-manager/columns";
import { describe, expect, it } from "vitest";
import { audioFormat } from "../fixtures/audioFormat";
import { providerMapping } from "../fixtures/providerMapping";
import { track } from "../fixtures/track";

// the sort keys the tracks library endpoint accepts, as LibraryTracks.vue
// offers them today
const SERVER_TRACK_SORT_KEYS = [
  "name",
  "name_desc",
  "sort_name",
  "sort_name_desc",
  "track_artist_name",
  "track_artist_name_desc",
  "duration",
  "duration_desc",
  "timestamp_added",
  "timestamp_added_desc",
  "last_played",
  "last_played_desc",
  "play_count",
  "play_count_desc",
];

describe("track columns", () => {
  it("only sorts by keys the server accepts", () => {
    for (const key of TRACK_SORT_KEYS) {
      expect(SERVER_TRACK_SORT_KEYS).toContain(key);
    }
  });

  it("has unique ids and a fixed title and menu column", () => {
    const ids = TRACK_COLUMNS.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TRACK_COLUMN_BY_ID.title.fixed).toBe(true);
    expect(TRACK_COLUMN_BY_ID.menu.fixed).toBe(true);
  });

  it("hides the long-tail columns by default", () => {
    expect(DEFAULT_COLUMN_VISIBILITY.title).toBe(true);
    expect(DEFAULT_COLUMN_VISIBILITY.artist).toBe(true);
    expect(DEFAULT_COLUMN_VISIBILITY.path).toBe(false);
    expect(DEFAULT_COLUMN_VISIBILITY.format).toBe(false);
    expect(DEFAULT_COLUMN_VISIBILITY.popularity).toBe(false);
  });

  it("round-trips a sort key through the grid sort", () => {
    expect(sortByToGridSort("name")).toEqual({
      columnId: "title",
      desc: false,
    });
    expect(sortByToGridSort("duration_desc")).toEqual({
      columnId: "duration",
      desc: true,
    });
    expect(gridSortToSortBy({ columnId: "artist", desc: true })).toBe(
      "track_artist_name_desc",
    );
    expect(
      gridSortToSortBy({ columnId: "album", desc: false }),
    ).toBeUndefined();
    expect(sortByToGridSort("play_count")).toBeUndefined();
  });

  it("renders cell text from a library track", () => {
    const item = track({
      name: "Crusaders Of Death",
      track_number: 3,
      disc_number: 1,
      duration: 288,
      artists: [
        {
          item_id: "a1",
          provider: "library",
          name: "Horisont",
          version: "",
          uri: "library://artist/a1",
          external_ids: [],
          is_playable: false,
          media_type: "artist" as never,
          available: true,
        },
      ],
      album: {
        item_id: "b1",
        provider: "library",
        name: "Second Assault",
        version: "",
        uri: "library://album/b1",
        external_ids: [],
        is_playable: true,
        media_type: "album" as never,
        available: true,
        year: 2024,
      },
      metadata: { genres: ["Heavy Metal"], explicit: true, popularity: 42 },
      provider_mappings: [
        providerMapping({
          provider_domain: "filesystem_local",
          item_id: "/music/Horisont/03 - Crusaders Of Death.flac",
          audio_format: audioFormat({
            content_type: "flac" as never,
            sample_rate: 44100,
            bit_depth: 16,
          }),
        }),
      ],
    });
    const text = (id: keyof typeof TRACK_COLUMN_BY_ID) =>
      TRACK_COLUMN_BY_ID[id].text?.(item);

    expect(text("track_number")).toBe("3");
    expect(text("title")).toBe("Crusaders Of Death");
    expect(text("artist")).toBe("Horisont");
    expect(text("album")).toBe("Second Assault");
    expect(text("year")).toBe("2024");
    expect(text("genre")).toBe("Heavy Metal");
    expect(text("duration")).toBe("04:48");
    expect(text("disc_number")).toBe("1");
    expect(text("format")).toBe("FLAC · 44.1 kHz · 16-bit");
    expect(text("path")).toBe("/music/Horisont/03 - Crusaders Of Death.flac");
    expect(text("explicit")).toBe("E");
    expect(text("popularity")).toBe("42");
    expect(text("last_played")).toBe("");
  });
});
