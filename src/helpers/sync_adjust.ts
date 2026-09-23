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

export interface AudioDelayTarget {
  playerId: string;
  provider: string;
  name: string;
}

/** Positive offset means this player is heard after the reference room. */
export function suggestCalibratedDelay(
  config: AudioDelayConfig,
  currentMs: number,
  measuredOffsetMs: number,
): { value: number; limited: boolean } | undefined {
  if (
    (config.key !== SENDSPIN_DELAY_KEY && config.key !== SYNC_ADJUST_KEY) ||
    !Number.isInteger(currentMs) ||
    !Number.isInteger(measuredOffsetMs) ||
    Math.abs(measuredOffsetMs) > 5000
  )
    return undefined;
  const delta =
    config.key === SENDSPIN_DELAY_KEY ? measuredOffsetMs : -measuredOffsetMs;
  const requested = currentMs + delta;
  const value = Math.min(config.max, Math.max(config.min, requested));
  return { value, limited: value !== requested };
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

/** Return the real protocol players that own the delay setting.
 *
 * A universal player only delegates playback. In particular, Sendspin over
 * AirPlay uses the AirPlay bridge's signed sync_adjust. Cast has a separate
 * Sendspin receiver delay, saved on its derived Sendspin player.
 */
export const getAudioDelayTargets = (
  player: Pick<Player, "player_id" | "provider" | "output_protocols">,
): AudioDelayTarget[] => {
  if (supportsSyncAdjust(player)) {
    return [
      { playerId: player.player_id, provider: player.provider, name: "" },
    ];
  }
  const targets: AudioDelayTarget[] = [];
  const protocols = player.output_protocols ?? [];
  const byId = new Map(
    protocols.map((item) => [item.output_protocol_id, item]),
  );
  for (const protocol of protocols) {
    if (protocol.output_protocol_id === "native") continue;
    if (protocol.derived_from) {
      const base = byId.get(protocol.derived_from);
      if (
        protocol.protocol_domain !== "sendspin" ||
        base?.protocol_domain !== "chromecast"
      )
        continue;
    }
    if (!getAudioDelayConfig({ provider: protocol.protocol_domain })) continue;
    targets.push({
      playerId: protocol.output_protocol_id,
      provider: protocol.protocol_domain,
      name: protocol.name,
    });
  }
  return targets;
};
