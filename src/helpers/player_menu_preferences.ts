// Per-user order and visibility for the player/queue overflow ("Play Popup")
// menu built in player_menu_items.ts. Kept as a user preference, the same
// pattern as hidden_players.ts, so it follows the account to every device.
import type { ContextMenuItem } from "@/helpers/context_menu_item";
import { setUserPreference } from "@/composables/userPreferences";
import { store } from "@/plugins/store";
import { computed } from "vue";

export const PLAYER_MENU_PREFERENCE_KEY = "playerMenu.itemPreferences";

// every menuId getPlayerMenuItems can emit, in its default/insertion order.
// an id not in this list (e.g. a future menu entry) is left in its built-in
// position rather than silently hidden.
export const DEFAULT_PLAYER_MENU_ORDER = [
  "power",
  "stop",
  "sleep_timer",
  "shuffle",
  "repeat",
  "audio_overlay",
  "announce",
  "transfer",
  "clear_queue",
  "save_as_playlist",
  "select_source",
  "ai_dj",
  "sound_mode",
  "milkdrop",
  "audio_delay",
  "hide_player",
  "settings",
] as const;

export interface PlayerMenuPreference {
  order?: string[];
  disabled?: string[];
}

const readPreference = (): PlayerMenuPreference => {
  const value = store.currentUser?.preferences?.[PLAYER_MENU_PREFERENCE_KEY];
  return value && typeof value === "object"
    ? (value as PlayerMenuPreference)
    : {};
};

export const playerMenuPreference = computed(readPreference);

export async function setPlayerMenuPreference(
  next: PlayerMenuPreference,
): Promise<void> {
  await setUserPreference(PLAYER_MENU_PREFERENCE_KEY, next);
}

/**
 * Filters out disabled entries and reorders the rest per the user's saved
 * order. Items without a menuId (nothing set one) always pass through
 * unmodified, in their built-in position.
 */
export function applyPlayerMenuPreference(
  items: ContextMenuItem[],
): ContextMenuItem[] {
  const preference = readPreference();
  const disabled = new Set(preference.disabled ?? []);
  const visible = items.filter(
    (item) => !item.menuId || !disabled.has(item.menuId),
  );
  const order = preference.order;
  if (!order || order.length === 0) return visible;

  const rank = new Map(order.map((id, index) => [id, index]));
  // items with a menuId not in the saved order keep their relative built-in
  // position, ordered after every item the saved order does cover
  let nextRank = order.length;
  const rankOf = (item: ContextMenuItem): number => {
    if (!item.menuId) return nextRank++;
    const known = rank.get(item.menuId);
    return known ?? nextRank++;
  };
  return visible
    .map((item, index) => ({ item, index, rank: rankOf(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}
