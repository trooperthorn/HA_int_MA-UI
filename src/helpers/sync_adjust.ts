// The per-player audio delay setting (server config entry sync_adjust).
import api from "@/plugins/api";
import type { Player } from "@/plugins/api/interfaces";

export const SYNC_ADJUST_KEY = "sync_adjust";
export const SYNC_ADJUST_MIN = -500;
export const SYNC_ADJUST_MAX = 500;

// providers whose players expose sync_adjust (airplay as a plain setting,
// squeezelite under advanced); other protocols have no such knob
export const SYNC_ADJUST_PROVIDER_DOMAINS: readonly string[] = [
  "airplay",
  "squeezelite",
];

export const supportsSyncAdjust = (
  player: Pick<Player, "provider">,
): boolean => {
  const domain = api.providers?.[player.provider]?.domain ?? player.provider;
  return SYNC_ADJUST_PROVIDER_DOMAINS.includes(domain);
};
