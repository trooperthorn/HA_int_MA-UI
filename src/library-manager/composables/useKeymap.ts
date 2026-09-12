import { onBeforeUnmount, onMounted } from "vue";
import { useRouter } from "vue-router";
import { api } from "@/plugins/api";
import { store } from "@/plugins/store";
import {
  CHORD_PREFIXES,
  CHORD_TIMEOUT_MS,
  findBinding,
  findChord,
  SEEK_STEP_SECONDS,
  type KeymapHandlerId,
  type PlayerHandlerId,
  type ViewHandlerId,
} from "../keymap";

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
// elements that act on Space and Enter themselves
const ACTIVATABLE_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);

const PLAYER_HANDLERS = new Set<KeymapHandlerId>([
  "playPause",
  "nextTrack",
  "previousTrack",
  "seekBack",
  "seekForward",
  "volumeUp",
  "volumeDown",
  "muteToggle",
  "playerPicker",
  "fullscreenPlayer",
  "preferences",
]);

// what the hosting view does for the bindings that need its panes and grid;
// sortByColumn receives the 1-based column number of the chord
export type KeymapActions = {
  [K in ViewHandlerId]?: K extends "sortByColumn"
    ? (column: number) => void
    : () => void;
};

export interface KeymapOptions {
  actions?: KeymapActions;
  navigate?: (target: "settings") => void;
}

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

export function runPlayerHandler(
  handler: PlayerHandlerId,
  navigate?: KeymapOptions["navigate"],
): boolean {
  switch (handler) {
    case "playerPicker":
      store.showPlayersMenu = true;
      return true;
    case "fullscreenPlayer":
      store.showFullscreenPlayer = !store.showFullscreenPlayer;
      return true;
    case "preferences":
      navigate?.("settings");
      return true;
  }
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

export function runKeymapHandler(
  handler: KeymapHandlerId,
  options: KeymapOptions = {},
  column?: number,
): boolean {
  if (PLAYER_HANDLERS.has(handler)) {
    return runPlayerHandler(handler as PlayerHandlerId, options.navigate);
  }
  const action = options.actions?.[handler as ViewHandlerId];
  if (!action) return false;
  if (handler === "sortByColumn") {
    (action as (column: number) => void)(column ?? 0);
  } else {
    (action as () => void)();
  }
  return true;
}

/**
 * Keyboard commands for the library manager.
 *
 * Mounted by the manager view only, so no other route changes behaviour.
 * Keys are ignored while typing, while a dialog or the player picker is
 * open, and Space is left to any button that has focus. Two-key chords
 * ("g" then "a") wait CHORD_TIMEOUT_MS for their second key; the grid and
 * browser columns keep single letters for their own type-ahead, so chords
 * work from anywhere else (the tree, the panes, the page).
 */
export function useKeymap(options: KeymapOptions = {}) {
  const router = useRouter();
  const navigate =
    options.navigate ??
    ((target: "settings") => {
      if (target === "settings") void router.push({ name: "settings" });
    });
  const run = (handler: KeymapHandlerId, column?: number) =>
    runKeymapHandler(handler, { ...options, navigate }, column);

  let pendingChord: string | null = null;
  let chordTimer: ReturnType<typeof setTimeout> | undefined;

  const clearChord = () => {
    clearTimeout(chordTimer);
    pendingChord = null;
  };

  const plainKey = (event: KeyboardEvent) =>
    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (store.dialogActive || store.showPlayersMenu) return;
    if (isTyping(event.target)) return;

    if (pendingChord) {
      const prefix = pendingChord;
      clearChord();
      if (plainKey(event)) {
        const chord = findChord(prefix, event.key);
        if (chord) {
          event.preventDefault();
          const column = Number(chord.combo.slice(2));
          run(chord.binding.handler, Number.isNaN(column) ? undefined : column);
        }
        return;
      }
    }

    if (plainKey(event) && CHORD_PREFIXES.includes(event.key.toLowerCase())) {
      event.preventDefault();
      pendingChord = event.key.toLowerCase();
      chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
      return;
    }

    const binding = findBinding(event);
    if (!binding) return;
    if (binding.keys.includes(" ") && isActivatable(event.target)) return;
    event.preventDefault();
    run(binding.handler);
  };

  onMounted(() => document.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => {
    document.removeEventListener("keydown", onKeydown);
    clearChord();
  });
}
