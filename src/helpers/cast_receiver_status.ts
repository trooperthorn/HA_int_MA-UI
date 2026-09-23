import type { Player } from "@/plugins/api/interfaces";

export type CastReceiverState =
  | "connecting"
  | "connected"
  | "playing"
  | "stopped"
  | "error"
  | "disconnected";

export type CastReceiverFailure =
  | "device_unavailable"
  | "launch_timeout"
  | "launch_failed"
  | "receiver_error"
  | "audio_unsupported";

const receiverStates = new Set<CastReceiverState>([
  "connecting",
  "connected",
  "playing",
  "stopped",
  "error",
  "disconnected",
]);
const receiverFailures = new Set<CastReceiverFailure>([
  "device_unavailable",
  "launch_timeout",
  "launch_failed",
  "receiver_error",
  "audio_unsupported",
]);

/** Resolve only the Sendspin receiver riding on a Cast output. */
function getCastReceiverAttributes(
  player: Pick<Player, "player_id" | "output_protocols" | "extra_attributes">,
  players: Record<string, Pick<Player, "extra_attributes">>,
): Player["extra_attributes"] | undefined {
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
  return source?.extra_attributes;
}

export function getCastReceiverState(
  player: Pick<Player, "player_id" | "output_protocols" | "extra_attributes">,
  players: Record<string, Pick<Player, "extra_attributes">>,
): CastReceiverState | undefined {
  const state = getCastReceiverAttributes(player, players)?.sendspin_cast_state;
  return receiverStates.has(state as CastReceiverState)
    ? (state as CastReceiverState)
    : undefined;
}

export function getCastReceiverFailure(
  player: Pick<Player, "player_id" | "output_protocols" | "extra_attributes">,
  players: Record<string, Pick<Player, "extra_attributes">>,
): CastReceiverFailure | undefined {
  const attrs = getCastReceiverAttributes(player, players);
  if (attrs?.sendspin_cast_state !== "error") return undefined;
  const reason = attrs.sendspin_cast_failure;
  return receiverFailures.has(reason as CastReceiverFailure)
    ? (reason as CastReceiverFailure)
    : undefined;
}
