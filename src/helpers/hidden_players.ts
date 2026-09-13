// Players the current user hid from the player picker. Kept as a user
// preference (so it follows the account to every device) rather than the
// server-side per-user player filter: that filter is an allow-list, so a hide
// expressed through it would also hide every player added later.
import { setUserPreference } from "@/composables/userPreferences";
import { store } from "@/plugins/store";
import { computed } from "vue";

export const HIDDEN_PLAYERS_PREFERENCE_KEY = "playerSelect.hiddenPlayers";

const readHiddenPlayerIds = (): string[] => {
  const value = store.currentUser?.preferences?.[HIDDEN_PLAYERS_PREFERENCE_KEY];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
};

export const hiddenPlayerIds = computed(readHiddenPlayerIds);

export const isHiddenPlayer = (playerId: string): boolean =>
  readHiddenPlayerIds().includes(playerId);

export async function setPlayerHidden(
  playerId: string,
  hidden: boolean,
): Promise<void> {
  const current = readHiddenPlayerIds();
  const next = hidden
    ? current.includes(playerId)
      ? current
      : [...current, playerId]
    : current.filter((entry) => entry !== playerId);
  if (next === current) return;
  await setUserPreference(HIDDEN_PLAYERS_PREFERENCE_KEY, next);
}
