import { buildSyncClusters } from "@/helpers/player_sync_clusters";
import type { Player } from "@/plugins/api/interfaces";
import { describe, expect, it } from "vitest";

const player = (id: string, name: string, canGroupWith: string[] = []) =>
  ({ player_id: id, name, can_group_with: canGroupWith }) as Player;

describe("buildSyncClusters", () => {
  it("joins players through can_group_with in either direction", () => {
    const clusters = buildSyncClusters([
      player("k", "Kitchen", ["l"]),
      player("l", "Living room"),
      player("o", "Office", ["k"]),
      player("t", "TV"),
    ]);
    const kitchen = clusters.get("k");
    expect(kitchen?.members).toEqual(["k", "l", "o"]);
    expect(kitchen?.label).toBe("Kitchen");
    expect(clusters.get("l")).toBe(kitchen);
    expect(clusters.get("o")).toBe(kitchen);
    expect(clusters.get("t")?.members).toEqual(["t"]);
  });

  it("ignores partners that are not in the listing", () => {
    const clusters = buildSyncClusters([player("a", "A", ["ghost"])]);
    expect(clusters.get("a")?.members).toEqual(["a"]);
  });
});
