// Groups players that can stream in sync with each other ("party mode").
// A cluster is the connected component of the can_group_with relation, taken
// in both directions because providers do not always report it symmetrically.
import type { Player } from "@/plugins/api/interfaces";

export interface SyncCluster {
  // the alphabetically first member name; sorts the cluster against singles
  label: string;
  members: string[];
}

const byName = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

/** Cluster key per player id; players that can group with nobody are alone. */
export function buildSyncClusters(players: Player[]): Map<string, SyncCluster> {
  const ids = new Set(players.map((player) => player.player_id));
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let cursor = id;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor) ?? root;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot);
  };

  for (const player of players) parent.set(player.player_id, player.player_id);
  for (const player of players) {
    for (const other of player.can_group_with ?? []) {
      if (ids.has(other)) union(player.player_id, other);
    }
  }

  const names = new Map(
    players.map((player) => [player.player_id, player.name]),
  );
  const members = new Map<string, string[]>();
  for (const player of players) {
    const root = find(player.player_id);
    const list = members.get(root) ?? [];
    list.push(player.player_id);
    members.set(root, list);
  }

  const clusters = new Map<string, SyncCluster>();
  for (const list of members.values()) {
    const sorted = [...list].sort((left, right) =>
      byName(names.get(left) ?? left, names.get(right) ?? right),
    );
    const cluster: SyncCluster = {
      label: names.get(sorted[0]) ?? sorted[0],
      members: sorted,
    };
    for (const id of sorted) clusters.set(id, cluster);
  }
  return clusters;
}
