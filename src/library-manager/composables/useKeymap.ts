import { onBeforeUnmount, onMounted } from "vue";
import { api } from "@/plugins/api";
import { store } from "@/plugins/store";
import {
  findBinding,
  SEEK_STEP_SECONDS,
  type KeymapHandlerId,
} from "../keymap";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
// elements that act on Space and Enter themselves
const ACTIVATABLE_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return EDITABLE_TAGS.has(el.tagName) || el.isContentEditable;
}

function isActivatable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    ACTIVATABLE_TAGS.has(el.tagName) ||
    el.getAttribute("role") === "button" ||
    el.getAttribute("role") === "switch"
  );
}

function elapsedSeconds(): number {
  return (
    store.activePlayerQueue?.elapsed_time ??
    store.activePlayer?.elapsed_time ??
    0
  );
}

export function runKeymapHandler(handler: KeymapHandlerId): boolean {
  const player = store.activePlayer;
  if (!player) return false;
  const id = player.player_id;
  switch (handler) {
    case "playPause":
      void api.playerCommandPlayPause(id);
      return true;
    case "nextTrack":
      void api.playerCommandNext(id);
      return true;
    case "previousTrack":
      void api.playerCommandPrevious(id);
      return true;
    case "seekBack":
      api.playerCommandSeek(
        id,
        Math.max(0, elapsedSeconds() - SEEK_STEP_SECONDS),
      );
      return true;
    case "seekForward":
      api.playerCommandSeek(id, elapsedSeconds() + SEEK_STEP_SECONDS);
      return true;
    case "volumeUp":
      void api.playerCommandVolumeUp(id);
      return true;
    case "volumeDown":
      void api.playerCommandVolumeDown(id);
      return true;
    case "muteToggle":
      void api.playerCommandVolumeMute(id, !player.volume_muted);
      return true;
  }
}

/**
 * Global playback keys for the library manager.
 *
 * Mounted by the manager view only, so no other route changes behaviour.
 * Keys are ignored while typing, while a dialog or the player picker is
 * open, and Space is left to any button that has focus.
 */
export function useKeymap() {
  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (store.dialogActive || store.showPlayersMenu) return;
    if (isTyping(event.target)) return;
    const binding = findBinding(event);
    if (!binding) return;
    if (binding.keys.includes(" ") && isActivatable(event.target)) return;
    event.preventDefault();
    runKeymapHandler(binding.handler);
  };

  onMounted(() => document.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
}
