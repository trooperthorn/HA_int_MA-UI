// Commands for every tap. Each records an expectation first (optimistic.ts)
// so the tile answers at once even on a zone that confirms slowly.
//
// Switching a zone on is power then select source with a short pause:
// yamaha_ynca zones coming out of standby ignore an input change sent in the
// same instant as the wake command.

import { api } from "@/plugins/api";
import type { Player } from "@/plugins/api/interfaces";
import { resolveFeedName, type GraphNode } from "./derive";
import type { FlowConfig, FlowGroup, FlowMaster, FlowZone } from "./flowConfig";
import type { PendingStore } from "./optimistic";

const POWER_ON_SETTLE_MS = 300;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ActionContext {
  players: Record<string, Player>;
  config: FlowConfig;
  pending: PendingStore;
  now?: () => number;
}

const nowOf = (context: ActionContext) => (context.now ?? Date.now)();

async function activate(
  context: ActionContext,
  entry: FlowZone | FlowMaster,
): Promise<void> {
  const { config, pending } = context;
  const player = context.players[entry.player_id];
  const feed = resolveFeedName(entry, config, player);
  pending.set(
    entry.player_id,
    feed ? { powered: true, source: feed } : { powered: true },
    config.optimistic_ttl,
    nowOf(context),
  );
  if (player?.powered !== true) {
    await api.playerCommandPower(entry.player_id, true);
    if (feed) await delay(POWER_ON_SETTLE_MS);
  }
  if (feed) {
    await api.playerCommand(entry.player_id, "select_source", {
      source: feed,
    });
  }
}

async function deactivate(
  context: ActionContext,
  playerId: string,
): Promise<void> {
  context.pending.set(
    playerId,
    { powered: false },
    context.config.optimistic_ttl,
    nowOf(context),
  );
  await api.playerCommandPower(playerId, false);
}

export async function toggleZone(
  context: ActionContext,
  zone: FlowZone,
  node: GraphNode,
): Promise<void> {
  if (node.inPath) await deactivate(context, zone.player_id);
  else await activate(context, zone);
}

// a group switches its members together; a partial group is completed
// rather than restarted, so only the members not yet in the path are touched
export async function toggleGroup(
  context: ActionContext,
  group: FlowGroup,
  node: GraphNode,
  memberNodes: Map<string, GraphNode>,
): Promise<void> {
  const { config, pending } = context;
  const zones = config.zones.filter((zone) =>
    group.members.includes(zone.player_id),
  );
  if (node.inPath) {
    pending.set(
      `group:${group.id}`,
      { powered: false },
      config.optimistic_ttl,
      nowOf(context),
    );
    for (const zone of zones) await deactivate(context, zone.player_id);
    return;
  }
  pending.set(
    `group:${group.id}`,
    { powered: true },
    config.optimistic_ttl,
    nowOf(context),
  );
  for (const zone of zones) {
    const member = memberNodes.get(zone.player_id);
    if (member === undefined || !member.inPath) await activate(context, zone);
  }
}

// a master's commands fan out to a whole unit in firmware; its child zones
// confirm on the next poll, so their expectations bridge the gap
export async function toggleMaster(
  context: ActionContext,
  master: FlowMaster,
  node: GraphNode,
): Promise<void> {
  if (node.inPath) await deactivate(context, master.player_id);
  else await activate(context, master);
}

export async function setVolume(
  context: ActionContext,
  playerId: string,
  level: number,
): Promise<void> {
  const clamped = Math.round(Math.min(100, Math.max(0, level)));
  context.pending.set(
    playerId,
    { volume_level: clamped },
    context.config.optimistic_ttl,
    nowOf(context),
  );
  await api.playerCommandVolumeSet(playerId, clamped);
}

export async function toggleMute(
  context: ActionContext,
  playerId: string,
  currentlyMuted: boolean,
): Promise<void> {
  context.pending.set(
    playerId,
    { volume_muted: !currentlyMuted },
    context.config.optimistic_ttl,
    nowOf(context),
  );
  await api.playerCommandVolumeMute(playerId, !currentlyMuted);
}
