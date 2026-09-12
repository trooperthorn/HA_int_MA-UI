export type KeymapScope = "global" | "grid" | "queue";

export type KeymapHandlerId =
  | "playPause"
  | "nextTrack"
  | "previousTrack"
  | "seekBack"
  | "seekForward"
  | "volumeUp"
  | "volumeDown"
  | "muteToggle";

export interface KeyBinding {
  id: string;
  labelKey: string;
  // one or more combos; a combo is modifiers joined with "+" and the
  // KeyboardEvent.key value last ("ctrl+alt+ArrowRight", " " for Space)
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

export const KEY_BINDINGS: readonly KeyBinding[] = [
  {
    id: "play_pause",
    labelKey: "library_manager.shortcuts.play_pause",
    keys: [" "],
    scope: "global",
    handler: "playPause",
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
];

export interface ParsedCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
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
  if (parsed.shift !== event.shiftKey) return false;
  const single = parsed.key.length === 1;
  return single
    ? event.key.toLowerCase() === parsed.key.toLowerCase()
    : event.key === parsed.key;
}

export function findBinding(event: KeyboardEvent): KeyBinding | undefined {
  return KEY_BINDINGS.find((binding) =>
    binding.keys.some((combo) => comboMatches(combo, event)),
  );
}
