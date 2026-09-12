import { watch } from "vue";
import { toast } from "vue-sonner";
import { isSelectablePlayer } from "@/helpers/players";
import { api } from "@/plugins/api";
import { $t } from "@/plugins/i18n";
import { store } from "@/plugins/store";
import { webPlayer } from "@/plugins/web_player";

// how long the player picker waits for a choice before this browser plays
export const PLAYER_PICK_TIMEOUT_MS = 8000;

function activePlayerReady(): boolean {
  return isSelectablePlayer(store.activePlayer);
}

// this browser's own player, when it is registered and usable
function browserPlayerId(): string | undefined {
  const id = webPlayer.player_id;
  return id && isSelectablePlayer(api.players[id]) ? id : undefined;
}

/**
 * Make sure a player is selected before something plays.
 *
 * The first play with nothing selected opens the player picker; whatever the
 * user picks wins. If nothing is picked before the timeout, this browser's
 * own player is selected so the music starts here. Resolves true when a
 * player is selected, false when there is none to fall back to.
 */
export function ensurePlayer(
  timeoutMs = PLAYER_PICK_TIMEOUT_MS,
): Promise<boolean> {
  if (activePlayerReady()) return Promise.resolve(true);
  store.showPlayersMenu = true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopWatch();
      resolve(value);
    };
    const stopWatch = watch(
      () => [store.activePlayerId, store.showPlayersMenu] as const,
      ([, menuOpen]) => {
        if (activePlayerReady()) {
          store.showPlayersMenu = false;
          finish(true);
        } else if (!menuOpen) {
          // the picker was dismissed without a choice
          finish(false);
        }
      },
    );
    const timer = setTimeout(() => {
      const fallback = browserPlayerId();
      if (fallback) {
        store.activePlayerId = fallback;
        store.showPlayersMenu = false;
        toast.info($t("library_manager.playing_here"));
        finish(true);
      } else {
        finish(false);
      }
    }, timeoutMs);
  });
}
