// The per-player audio delay setting (server config entry sync_adjust).
import api from "@/plugins/api";
import type { Player } from "@/plugins/api/interfaces";

export const SYNC_ADJUST_KEY = "sync_adjust";
export const SYNC_ADJUST_MIN = -500;
export const SYNC_ADJUST_MAX = 500;
export const SENDSPIN_DELAY_KEY = "sendspin_static_delay";

export interface AudioDelayConfig {
  key: string;
  min: number;
  max: number;
  steps: readonly number[];
  hint: string;
  requiresCapability: boolean;
}

const syncAdjustConfig: AudioDelayConfig = {
  key: SYNC_ADJUST_KEY,
  min: SYNC_ADJUST_MIN,
  max: SYNC_ADJUST_MAX,
  steps: [-50, -10, 10, 50],
  hint: "player_select.sync_adjust_hint",
  requiresCapability: false,
};

const sendspinDelayConfig: AudioDelayConfig = {
  key: SENDSPIN_DELAY_KEY,
  min: 0,
  max: 5000,
  steps: [-100, -10, 10, 100],
  hint: "player_select.sync_adjust_sendspin_hint",
  requiresCapability: true,
};

export const getAudioDelayConfig = (
  player: Pick<Player, "provider">,
): AudioDelayConfig | undefined => {
  const domain = api.providers?.[player.provider]?.domain ?? player.provider;
  if (domain === "sendspin") return sendspinDelayConfig;
  if (domain === "airplay" || domain === "squeezelite") return syncAdjustConfig;
  return undefined;
};

export const supportsSyncAdjust = (
  player: Pick<Player, "provider">,
): boolean => {
  return getAudioDelayConfig(player) !== undefined;
};
