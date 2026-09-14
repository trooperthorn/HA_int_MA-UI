import { pinRowsToSource } from "@/library-manager/sourcePin";
import type { ProviderMapping, Track } from "@/plugins/api/interfaces";
import { describe, expect, it } from "vitest";
import { track } from "../fixtures/track";

const mapping = (
  provider_instance: string,
  item_id: string,
  available = true,
): ProviderMapping =>
  ({
    item_id,
    provider_domain: provider_instance.replace(/--.*$/, ""),
    provider_instance,
    available,
    in_library: true,
    audio_format: {},
    details: null,
    url: null,
  }) as unknown as ProviderMapping;

describe("pinRowsToSource", () => {
  it("names the source's own item in the uri and puts its mapping first", () => {
    const row = track({
      item_id: "42",
      provider_mappings: [
        mapping("spotify--abc", "sp1"),
        mapping("filesystem_local--xyz", "Muse/Uprising.flac"),
      ],
    });

    const [pinned] = pinRowsToSource([row], "filesystem_local--xyz") as Track[];

    expect(pinned.uri).toBe("filesystem_local--xyz://track/Muse/Uprising.flac");
    expect(
      pinned.provider_mappings.map((entry) => entry.provider_instance),
    ).toEqual(["filesystem_local--xyz", "spotify--abc"]);
    // the library identity and the row's other fields are untouched, so
    // favorites, edits and the rest still address the library item
    expect(pinned.item_id).toBe("42");
    expect(pinned.provider).toBe("library");
    expect(row.uri).toBe("library://track/42");
    expect(row.provider_mappings[0].provider_instance).toBe("spotify--abc");
  });

  it("leaves rows the source does not carry, and empty slots, as they are", () => {
    const row = track({
      item_id: "7",
      provider_mappings: [mapping("spotify--abc", "sp7")],
    });
    const rows = [row, undefined as unknown as Track];

    const pinned = pinRowsToSource(rows, "filesystem_local--xyz");

    expect(pinned[0]).toBe(row);
    expect(pinned[1]).toBeUndefined();
  });
});
