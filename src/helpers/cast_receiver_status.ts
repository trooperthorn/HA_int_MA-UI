import type { Player } from "@/plugins/api/interfaces";

export type CastReceiverState =
  | "connecting"
  | "connected"
  | "playing"
  | "stopped"
  | "error"
  | "disconnected";

const receiverStates = new Set<CastReceiverState>([
  "connecting",
  "connected",
  "playing",
  "stopped",
  "error",
  "disconnected",
]);

/** Resolve the Sendspin receiver riding on a Cast output, if there is one. */
export function getCastReceiverState(
  player: Pick<Player, "player_id" | "output_protocols" | "extra_attributes">,
  players: Record<string, Pick<Player, "extra_attributes">>,
): CastReceiverState | undefined {
  const protocols = player.output_protocols ?? [];
  const byId = new Map(
    protocols.map((item) => [item.output_protocol_id, item]),
  );
  const castBridge = protocols.find(
    (item) =>
      item.protocol_domain === "sendspin" &&
      item.derived_from &&
      byId.get(item.derived_from)?.protocol_domain === "chromecast",
  );
  const source = castBridge
    ? players[castBridge.output_protocol_id]
    : player.extra_attributes?.sendspin_cast_state
      ? player
      : undefined;
  if (!source) return undefined;
  const state = source.extra_attributes?.sendspin_cast_state;
  return receiverStates.has(state as CastReceiverState)
    ? (state as CastReceiverState)
    : undefined;
}
