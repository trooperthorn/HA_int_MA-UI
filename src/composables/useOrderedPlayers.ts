import {
  isBuiltinPlayer,
  isPlayerActive,
  playerVisible,
} from "@/helpers/players";
import {
  buildSyncClusters,
  type SyncCluster,
} from "@/helpers/player_sync_clusters";
import { api } from "@/plugins/api";
import { PlaybackState, type Player } from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import { computed, type MaybeRefOrGetter, toValue } from "vue";

interface OrderedPlayersOptions {
  allowNeedsSetup?: boolean;
  allowSources?: boolean;
  selectedPlayerFirst?: MaybeRefOrGetter<boolean>;
  activePlayersFirst?: MaybeRefOrGetter<boolean>;
  includePausedAsActive?: boolean;
  // keep players that can stream in sync with each other next to one another
  groupCapableTogether?: MaybeRefOrGetter<boolean>;
  // player ids left out of the listing (the user's hidden players)
  excludeIds?: MaybeRefOrGetter<readonly string[]>;
}

export function useOrderedPlayers(opts?: OrderedPlayersOptions) {
  return computed(() => {
    const excluded = new Set(toValue(opts?.excludeIds) ?? []);
    const players = Object.values(api.players).filter(
      (player) =>
        !excluded.has(player.player_id) &&
        playerVisible(
          player,
          false,
          opts?.allowNeedsSetup ?? false,
          opts?.allowSources ?? false,
        ),
    );
    const clusters = toValue(opts?.groupCapableTogether ?? false)
      ? buildSyncClusters(players)
      : undefined;
    return players.sort((left, right) =>
      comparePlayers(left, right, opts, clusters),
    );
  });
}

const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });
const compareNames = (left: string, right: string) =>
  NAME_COLLATOR.compare(left, right);

function comparePlayers(
  left: Player,
  right: Player,
  opts?: OrderedPlayersOptions,
  clusters?: Map<string, SyncCluster>,
) {
  const priorityDifference =
    getPlayerPriority(left, opts) - getPlayerPriority(right, opts);
  if (priorityDifference !== 0) return priorityDifference;

  if (clusters) {
    const leftCluster = clusters.get(left.player_id);
    const rightCluster = clusters.get(right.player_id);
    if (leftCluster && rightCluster && leftCluster !== rightCluster) {
      const clusterDifference = compareNames(
        leftCluster.label,
        rightCluster.label,
      );
      if (clusterDifference !== 0) return clusterDifference;
    }
  }

  return compareNames(left.name, right.name);
}

function getPlayerPriority(player: Player, opts?: OrderedPlayersOptions) {
  if (
    toValue(opts?.selectedPlayerFirst ?? true) &&
    player.player_id === store.activePlayerId
  ) {
    return 0;
  }
  if (isBuiltinPlayer(player)) return 1;
  if (
    toValue(opts?.activePlayersFirst ?? true) &&
    isPrioritizedActivePlayer(player, opts)
  ) {
    return 2;
  }
  return 3;
}

function isPrioritizedActivePlayer(
  player: Player,
  opts?: OrderedPlayersOptions,
) {
  if (opts?.includePausedAsActive) return isPlayerActive(player);
  return player.playback_state === PlaybackState.PLAYING;
}
