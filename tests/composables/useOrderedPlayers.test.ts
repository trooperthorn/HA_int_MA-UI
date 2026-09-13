import { useOrderedPlayers } from "@/composables/useOrderedPlayers";
import { api } from "@/plugins/api";
import {
  PlaybackState,
  PlayerType,
  type Player,
} from "@/plugins/api/interfaces";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("@/plugins/api", () => {
  const api = { players: {} as Record<string, Player> };
  return { api, default: api };
});

vi.mock("@/plugins/store", () => ({
  store: { activePlayerId: undefined, currentUser: undefined },
}));

vi.mock("@/plugins/web_player", () => ({
  webPlayer: { player_id: null },
  WebPlayerMode: {},
}));

const player = (id: string, name: string, canGroupWith: string[] = []) =>
  ({
    player_id: id,
    provider: "test",
    type: PlayerType.PLAYER,
    name,
    available: true,
    enabled: true,
    hide_in_ui: false,
    needs_setup: false,
    playback_state: PlaybackState.IDLE,
    can_group_with: canGroupWith,
    group_members: [],
    output_protocols: [],
    active_group: null,
    synced_to: null,
  }) as unknown as Player;

const names = (players: Player[]) => players.map((entry) => entry.name);

describe("useOrderedPlayers", () => {
  beforeEach(() => {
    for (const key of Object.keys(api.players)) delete api.players[key];
    api.players.b = player("b", "Bedroom", ["k"]);
    api.players.g = player("g", "Garage");
    api.players.k = player("k", "Kitchen");
    api.players.t = player("t", "TV");
  });

  it("sorts by name alone unless asked to cluster", () => {
    const ordered = useOrderedPlayers();
    expect(names(ordered.value)).toEqual([
      "Bedroom",
      "Garage",
      "Kitchen",
      "TV",
    ]);
  });

  it("keeps players that can group with each other together", () => {
    const together = ref(true);
    const ordered = useOrderedPlayers({ groupCapableTogether: together });
    expect(names(ordered.value)).toEqual([
      "Bedroom",
      "Kitchen",
      "Garage",
      "TV",
    ]);
    together.value = false;
    expect(names(ordered.value)).toEqual([
      "Bedroom",
      "Garage",
      "Kitchen",
      "TV",
    ]);
  });

  it("leaves excluded players out", () => {
    const excluded = ref(["g"]);
    const ordered = useOrderedPlayers({ excludeIds: excluded });
    expect(names(ordered.value)).toEqual(["Bedroom", "Kitchen", "TV"]);
    excluded.value = [];
    expect(names(ordered.value)).toHaveLength(4);
  });
});
