export type KeymapScope = "global" | "grid" | "queue";

// handlers the composable runs itself, against the active player and app state
export type PlayerHandlerId =
  | "playPause"
  | "nextTrack"
  | "previousTrack"
  | "seekBack"
  | "seekForward"
  | "volumeUp"
  | "volumeDown"
  | "muteToggle"
  | "playerPicker"
  | "fullscreenPlayer"
  | "preferences";

// handlers the hosting view supplies, because they need its panes and grid
export type ViewHandlerId =
  | "playSelectedNext"
  | "addSelectedToQueue"
  | "locateNowPlaying"
  | "toggleFavorite"
  | "toggleSelectedPane"
  | "addToPlaylist"
  | "goNowPlaying"
  | "goLibrary"
  | "goArtists"
  | "goAlbums"
  | "goGenres"
  | "goPlaylists"
  | "sortByColumn"
  | "refresh"
  | "toggleStrip"
  | "toggleQueuePane"
  | "showHelp";

export type KeymapHandlerId = PlayerHandlerId | ViewHandlerId;

export interface KeyBinding {
  id: string;
  labelKey: string;
  // one or more combos; a combo is modifiers joined with "+" and the
  // KeyboardEvent.key value last ("ctrl+alt+ArrowRight", " " for Space);
  // a chord is two plain keys separated by a space ("g n")
  keys: string[];
  scope: KeymapScope;
  handler: KeymapHandlerId;
}

// Combinations the browser owns on Windows and Linux; nothing here may ever
// appear in a binding.
export const BROWSER_OWNED_KEYS: readonly string[] = [
  "ctrl+n",
  "ctrl+t",
  "ctrl+w",
  "ctrl+o",
  "ctrl+p",
  "ctrl+s",
  "ctrl+j",
  "ctrl+h",
  "ctrl+f",
  "ctrl+1",
  "ctrl+2",
  "ctrl+3",
  "ctrl+4",
  "ctrl+5",
  "ctrl+6",
  "ctrl+7",
  "ctrl+8",
  "F5",
  "F6",
  "F11",
];

export const SEEK_STEP_SECONDS = 10;
// how long the first key of a chord waits for the second
export const CHORD_TIMEOUT_MS = 1500;

export const KEY_BINDINGS: readonly KeyBinding[] = [
  {
    id: "play_pause",
    labelKey: "library_manager.shortcuts.play_pause",
    keys: [" "],
    scope: "global",
    handler: "playPause",
  },
  {
    id: "play_selected_next",
    labelKey: "library_manager.shortcuts.play_selected_next",
    keys: ["ctrl+shift+Enter"],
    scope: "grid",
    handler: "playSelectedNext",
  },
  {
    id: "add_selected_to_queue",
    labelKey: "library_manager.shortcuts.add_selected_to_queue",
    keys: ["ctrl+Enter"],
    scope: "grid",
    handler: "addSelectedToQueue",
  },
  {
    id: "next_track",
    labelKey: "library_manager.shortcuts.next_track",
    keys: ["ctrl+alt+ArrowRight"],
    scope: "global",
    handler: "nextTrack",
  },
  {
    id: "previous_track",
    labelKey: "library_manager.shortcuts.previous_track",
    keys: ["ctrl+alt+ArrowLeft"],
    scope: "global",
    handler: "previousTrack",
  },
  {
    id: "seek_back",
    labelKey: "library_manager.shortcuts.seek_back",
    keys: ["ctrl+shift+ArrowLeft"],
    scope: "global",
    handler: "seekBack",
  },
  {
    id: "seek_forward",
    labelKey: "library_manager.shortcuts.seek_forward",
    keys: ["ctrl+shift+ArrowRight"],
    scope: "global",
    handler: "seekForward",
  },
  {
    id: "volume_up",
    labelKey: "library_manager.shortcuts.volume_up",
    keys: ["ctrl+alt+ArrowUp"],
    scope: "global",
    handler: "volumeUp",
  },
  {
    id: "volume_down",
    labelKey: "library_manager.shortcuts.volume_down",
    keys: ["ctrl+alt+ArrowDown"],
    scope: "global",
    handler: "volumeDown",
  },
  {
    id: "mute_toggle",
    labelKey: "library_manager.shortcuts.mute_toggle",
    keys: ["ctrl+alt+m"],
    scope: "global",
    handler: "muteToggle",
  },
  {
    id: "locate_now_playing",
    labelKey: "library_manager.shortcuts.locate_now_playing",
    keys: ["ctrl+l"],
    scope: "grid",
    handler: "locateNowPlaying",
  },
  {
    id: "toggle_favorite",
    labelKey: "library_manager.shortcuts.toggle_favorite",
    keys: ["ctrl+shift+l"],
    scope: "grid",
    handler: "toggleFavorite",
  },
  {
    id: "show_info",
    labelKey: "library_manager.shortcuts.show_info",
    keys: ["ctrl+i"],
    scope: "global",
    handler: "toggleSelectedPane",
  },
  {
    id: "add_to_playlist",
    labelKey: "library_manager.shortcuts.add_to_playlist",
    keys: ["ctrl+shift+p"],
    scope: "grid",
    handler: "addToPlaylist",
  },
  {
    id: "go_now_playing",
    labelKey: "library_manager.shortcuts.go_now_playing",
    keys: ["g n"],
    scope: "global",
    handler: "goNowPlaying",
  },
  {
    id: "go_library",
    labelKey: "library_manager.shortcuts.go_library",
    keys: ["g l"],
    scope: "global",
    handler: "goLibrary",
  },
  {
    id: "go_artists",
    labelKey: "library_manager.shortcuts.go_artists",
    keys: ["g a"],
    scope: "global",
    handler: "goArtists",
  },
  {
    id: "go_albums",
    labelKey: "library_manager.shortcuts.go_albums",
    keys: ["g b"],
    scope: "global",
    handler: "goAlbums",
  },
  {
    id: "go_genres",
    labelKey: "library_manager.shortcuts.go_genres",
    keys: ["g g"],
    scope: "global",
    handler: "goGenres",
  },
  {
    id: "go_playlists",
    labelKey: "library_manager.shortcuts.go_playlists",
    keys: ["g p"],
    scope: "global",
    handler: "goPlaylists",
  },
  {
    id: "sort_by_column",
    labelKey: "library_manager.shortcuts.sort_by_column",
    keys: ["s 1", "s 2", "s 3", "s 4", "s 5", "s 6", "s 7", "s 8", "s 9"],
    scope: "global",
    handler: "sortByColumn",
  },
  {
    id: "refresh",
    labelKey: "library_manager.shortcuts.refresh",
    keys: ["ctrl+alt+r"],
    scope: "global",
    handler: "refresh",
  },
  {
    id: "toggle_strip",
    labelKey: "library_manager.shortcuts.toggle_strip",
    keys: ["ctrl+b"],
    scope: "global",
    handler: "toggleStrip",
  },
  {
    id: "toggle_queue",
    labelKey: "library_manager.shortcuts.toggle_queue",
    keys: ["ctrl+alt+q"],
    scope: "global",
    handler: "toggleQueuePane",
  },
  {
    id: "player_picker",
    labelKey: "library_manager.shortcuts.player_picker",
    keys: ["ctrl+alt+p"],
    scope: "global",
    handler: "playerPicker",
  },
  {
    id: "fullscreen_player",
    labelKey: "library_manager.shortcuts.fullscreen_player",
    keys: ["ctrl+shift+f"],
    scope: "global",
    handler: "fullscreenPlayer",
  },
  {
    id: "preferences",
    labelKey: "library_manager.shortcuts.preferences",
    keys: ["ctrl+,"],
    scope: "global",
    handler: "preferences",
  },
  {
    id: "help",
    labelKey: "library_manager.shortcuts.help",
    keys: ["?"],
    scope: "global",
    handler: "showHelp",
  },
];

// keys the grid, browser columns and queue handle themselves; listed so the
// help and the settings page can show them beside the bindings
export const LOCAL_KEY_ROWS: ReadonlyArray<{
  labelKey: string;
  keys: string[];
  scope: KeymapScope;
}> = [
  {
    labelKey: "settings.keyboard.grid_letter",
    keys: ["A", "…", "Z"],
    scope: "grid",
  },
  { labelKey: "settings.keyboard.grid_play", keys: ["Enter"], scope: "grid" },
  {
    labelKey: "settings.keyboard.grid_menu",
    keys: ["Shift", "Enter"],
    scope: "grid",
  },
  {
    labelKey: "settings.keyboard.grid_select_all",
    keys: ["Ctrl", "A"],
    scope: "grid",
  },
  {
    labelKey: "settings.keyboard.grid_select_none",
    keys: ["Shift", "Ctrl", "A"],
    scope: "grid",
  },
  { labelKey: "settings.keyboard.grid_search", keys: ["/"], scope: "grid" },
  {
    labelKey: "settings.keyboard.queue_play",
    keys: ["Enter"],
    scope: "queue",
  },
  {
    labelKey: "settings.keyboard.queue_remove",
    keys: ["Delete"],
    scope: "queue",
  },
];

export interface ParsedCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

export function isChord(combo: string): boolean {
  return combo.length === 3 && combo[1] === " ";
}

export function parseCombo(combo: string): ParsedCombo {
  const parts = combo.split("+");
  const key = parts.pop() ?? "";
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  return {
    ctrl: mods.has("ctrl"),
    alt: mods.has("alt"),
    shift: mods.has("shift"),
    key,
  };
}

export function comboMatches(combo: string, event: KeyboardEvent): boolean {
  const parsed = parseCombo(combo);
  const ctrl = event.ctrlKey || event.metaKey;
  if (parsed.ctrl !== ctrl) return false;
  if (parsed.alt !== event.altKey) return false;
  const single = parsed.key.length === 1;
  // a printable key that needs Shift to type ("?") carries it itself
  const shiftInKey = single && parsed.key !== parsed.key.toLowerCase();
  const shiftIsPunctuation = single && /[^a-z0-9 ]/i.test(parsed.key);
  if (!shiftInKey && !shiftIsPunctuation && parsed.shift !== event.shiftKey) {
    return false;
  }
  return single
    ? event.key.toLowerCase() === parsed.key.toLowerCase()
    : event.key === parsed.key;
}

// the binding a lone key event triggers; chords are matched by useKeymap
export function findBinding(event: KeyboardEvent): KeyBinding | undefined {
  return KEY_BINDINGS.find((binding) =>
    binding.keys.some((combo) => !isChord(combo) && comboMatches(combo, event)),
  );
}

// the first keys that begin a chord ("g", "s")
export const CHORD_PREFIXES: readonly string[] = [
  ...new Set(
    KEY_BINDINGS.flatMap((binding) =>
      binding.keys.filter(isChord).map((combo) => combo[0]),
    ),
  ),
];

export function findChord(
  prefix: string,
  key: string,
): { binding: KeyBinding; combo: string } | undefined {
  const combo = `${prefix} ${key.toLowerCase()}`;
  for (const binding of KEY_BINDINGS) {
    if (binding.keys.includes(combo)) return { binding, combo };
  }
  return undefined;
}
