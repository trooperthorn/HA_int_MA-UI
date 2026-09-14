// Pure derivation: (players, config, pending, now playing) to the graph.
//
// Music Assistant cannot see the optical split between the streaming player
// and the receivers, so "this zone is in the signal path" is derived, never
// read: a zone is in the path when it is powered on and its input is the
// configured feed for that device. An input of undefined or the literal
// "Unknown" (yamaha_ynca's unmapped value) never matches.

import {
  PlaybackState,
  PlayerFeature,
  type Player,
  type PlayerMedia,
} from "@/plugins/api/interfaces";
import type { FlowConfig, FlowGroup, FlowMaster, FlowZone } from "./flowConfig";
import { playerSource, type PendingStore } from "./optimistic";

export type NodeKind = "input" | "channel" | "zone" | "group" | "master";

export interface GraphNode {
  // stable id for selection and link anchoring, "zone:media_player.zone_11"
  id: string;
  kind: NodeKind;
  playerId: string;
  name: string;
  // what the tile says under the name; a translation key with args, so the
  // view can render it in the user's language
  subtitle: { key: string; args?: Record<string, string | number> };
  // the player is known to the server
  found: boolean;
  available: boolean;
  // fully in the signal path
  inPath: boolean;
  // group with some but not all members in the path
  partial: boolean;
  // powered on but listening to a different input
  offPath: boolean;
  // an expectation is outstanding for this player
  pending: boolean;
  muted: boolean;
  artwork?: string;
  memberTotal?: number;
  memberActive?: number;
  // group: node ids of its member zones
  members?: string[];
}

export interface OutputRow {
  id: string;
  zoneId: string;
  playerId: string;
  name: string;
  // 0 to 100
  volumeLevel: number;
  // secondary readout, "22/38"; empty when percent only
  readout: string;
  muted: boolean;
  pending: boolean;
  hasVolume: boolean;
  hasMute: boolean;
}

export type LinkKind = "input" | "channel" | "output";

export interface GraphLink {
  fromId: string;
  toId: string;
  kind: LinkKind;
  // audio is flowing over this link right now
  active: boolean;
  // the downstream end is muted: drawn dashed
  muted: boolean;
}

export interface GraphModel {
  input: GraphNode;
  channel: GraphNode;
  mixes: GraphNode[];
  outputs: OutputRow[];
  links: GraphLink[];
}

export interface NowPlaying {
  media?: PlayerMedia | null;
  state?: PlaybackState;
}

export const nodeId = (kind: NodeKind, playerId: string) =>
  `${kind}:${playerId}`;

export const outputId = (playerId: string) => `out:${playerId}`;

const isPoweredOn = (player: Player | undefined) =>
  !!player && player.available && player.powered !== false;

// the input on this zone that carries the stream: the explicit one, else
// the first feed alias the zone lists, else the first alias (a zone whose
// list is empty while it is off can still be switched on)
export function resolveFeedName(
  entry: FlowZone | FlowMaster,
  config: FlowConfig,
  player: Player | undefined,
): string | undefined {
  if (entry.feed_source) return entry.feed_source;
  const offered = player?.source_list?.map((source) => source.id) ?? [];
  const match = config.feed_aliases.find((alias) => offered.includes(alias));
  return match ?? config.feed_aliases[0];
}

function sourceMatchesFeed(
  entry: FlowZone | FlowMaster,
  config: FlowConfig,
  player: Player | undefined,
): boolean {
  const source = playerSource(player);
  if (!source || source === "Unknown") return false;
  if (entry.feed_source) return source === entry.feed_source;
  return config.feed_aliases.includes(source);
}

function baseNode(
  kind: NodeKind,
  playerId: string,
  player: Player | undefined,
  name: string,
): GraphNode {
  return {
    id: nodeId(kind, playerId),
    kind,
    playerId,
    name,
    subtitle: { key: "" },
    found: player !== undefined,
    available: !!player?.available,
    inPath: false,
    partial: false,
    offPath: false,
    pending: false,
    muted: player?.volume_muted === true,
  };
}

function nameOf(
  configured: string | undefined,
  player: Player | undefined,
  fallback: string,
): string {
  return configured ?? player?.name ?? fallback;
}

function deriveInput(
  players: Record<string, Player>,
  config: FlowConfig,
  nowPlaying: NowPlaying,
): GraphNode {
  const player = config.input ? players[config.input] : undefined;
  const node = baseNode(
    "input",
    config.input ?? "",
    player,
    nameOf(undefined, player, "Music Assistant"),
  );
  if (!config.input) {
    node.found = true;
    node.available = true;
  }
  const media = nowPlaying.media ?? player?.current_media ?? null;
  const state = nowPlaying.state ?? player?.playback_state;
  if (!node.found) {
    node.subtitle = { key: "flow.player_not_found" };
  } else if (!node.available) {
    node.subtitle = { key: "flow.unavailable" };
  } else if (state === PlaybackState.PLAYING) {
    node.inPath = true;
    node.subtitle = media?.title
      ? media.artist
        ? {
            key: "flow.title_artist",
            args: { title: media.title, artist: media.artist },
          }
        : { key: "flow.title", args: { title: media.title } }
      : { key: "flow.playing" };
    node.artwork = media?.image_url ?? undefined;
  } else if (state === PlaybackState.PAUSED) {
    node.inPath = true;
    node.subtitle = { key: "flow.paused" };
    node.artwork = media?.image_url ?? undefined;
  } else {
    node.subtitle = { key: "flow.nothing_playing" };
  }
  return node;
}

function deriveChannel(
  players: Record<string, Player>,
  config: FlowConfig,
): GraphNode {
  const player = config.channel ? players[config.channel] : undefined;
  const node = baseNode(
    "channel",
    config.channel ?? "",
    player,
    nameOf(undefined, player, "Chromecast"),
  );
  if (!node.found) {
    node.subtitle = { key: "flow.player_not_found" };
  } else if (!node.available) {
    node.subtitle = { key: "flow.unavailable" };
  } else if (
    player &&
    (player.playback_state === PlaybackState.PLAYING ||
      player.playback_state === PlaybackState.PAUSED)
  ) {
    node.inPath = true;
    node.subtitle =
      typeof player.volume_level === "number"
        ? {
            key: "flow.streaming_volume",
            args: { volume: player.volume_level },
          }
        : { key: "flow.streaming" };
  } else {
    node.subtitle = { key: "flow.no_signal" };
  }
  return node;
}

function deriveZone(
  players: Record<string, Player>,
  config: FlowConfig,
  pending: PendingStore,
  zone: FlowZone,
): GraphNode {
  const effective = pending.overlay(zone.player_id, players[zone.player_id]);
  const node = baseNode(
    "zone",
    zone.player_id,
    effective,
    nameOf(zone.name, effective, zone.player_id),
  );
  node.pending = pending.has(zone.player_id);
  const on = isPoweredOn(effective);
  const onFeed = sourceMatchesFeed(zone, config, effective);
  node.inPath = on && onFeed;
  node.offPath = on && !onFeed;
  if (!node.found) {
    node.subtitle = { key: "flow.player_not_found" };
  } else if (!node.available) {
    node.subtitle = { key: "flow.unavailable" };
  } else if (node.inPath) {
    node.subtitle =
      typeof effective?.volume_level === "number"
        ? { key: "flow.volume", args: { volume: effective.volume_level } }
        : { key: "flow.on" };
  } else if (node.offPath) {
    const source = playerSource(effective);
    node.subtitle = source
      ? { key: "flow.source", args: { source } }
      : { key: "flow.source_unknown" };
  } else {
    node.subtitle = { key: "flow.off" };
  }
  return node;
}

function deriveGroup(
  pending: PendingStore,
  group: FlowGroup,
  zoneNodes: Map<string, GraphNode>,
): GraphNode {
  const node: GraphNode = {
    ...baseNode("group", group.id, undefined, group.name),
    found: true,
    available: true,
    muted: false,
  };
  node.pending = pending.has(`group:${group.id}`);
  // judged by the members that are zones on the view; anything else has
  // no known feed input
  const memberZones = group.members
    .map((member) => zoneNodes.get(member))
    .filter((zone): zone is GraphNode => zone !== undefined);
  const active = memberZones.filter((zone) => zone.inPath).length;
  node.memberTotal = memberZones.length;
  node.memberActive = active;
  node.members = memberZones.map((zone) => zone.id);
  node.inPath = memberZones.length > 0 && active === memberZones.length;
  node.partial = active > 0 && active < memberZones.length;
  if (memberZones.length === 0) {
    node.subtitle = { key: "flow.group_no_members" };
  } else if (node.inPath) {
    node.subtitle = {
      key: "flow.group_all_on",
      args: { total: memberZones.length },
    };
  } else if (node.partial) {
    node.subtitle = {
      key: "flow.group_partial",
      args: { active, total: memberZones.length },
    };
  } else {
    node.subtitle = { key: "flow.off" };
  }
  return node;
}

function deriveMaster(
  players: Record<string, Player>,
  config: FlowConfig,
  pending: PendingStore,
  master: FlowMaster,
): GraphNode {
  const effective = pending.overlay(
    master.player_id,
    players[master.player_id],
  );
  const node = baseNode(
    "master",
    master.player_id,
    effective,
    nameOf(master.name, effective, master.player_id),
  );
  node.pending = pending.has(master.player_id);
  const on = isPoweredOn(effective);
  const onFeed = sourceMatchesFeed(master, config, effective);
  node.inPath = on && onFeed;
  node.offPath = on && !onFeed;
  if (!node.found) {
    node.subtitle = { key: "flow.player_not_found" };
  } else if (!node.available) {
    node.subtitle = { key: "flow.unavailable" };
  } else if (node.inPath) {
    node.subtitle = { key: "flow.takeover_active" };
  } else if (node.offPath) {
    const source = playerSource(effective);
    node.subtitle = source
      ? { key: "flow.source", args: { source } }
      : { key: "flow.source_unknown" };
  } else {
    node.subtitle = { key: "flow.takeover" };
  }
  return node;
}

function deriveOutput(
  players: Record<string, Player>,
  pending: PendingStore,
  zone: FlowZone,
  zoneNode: GraphNode,
): OutputRow {
  const effective = pending.overlay(zone.player_id, players[zone.player_id]);
  const level =
    typeof effective?.volume_level === "number" ? effective.volume_level : 0;
  const features = effective?.supported_features ?? [];
  let readout = "";
  if (zone.volume?.display === "raw" && zone.volume.max) {
    readout = `${Math.round((level / 100) * zone.volume.max)}/${zone.volume.max}`;
  }
  return {
    id: outputId(zone.player_id),
    zoneId: zoneNode.id,
    playerId: zone.player_id,
    name: zoneNode.name,
    volumeLevel: level,
    readout,
    muted: effective?.volume_muted === true,
    pending: pending.has(zone.player_id),
    hasVolume: features.includes(PlayerFeature.VOLUME_SET),
    hasMute: features.includes(PlayerFeature.VOLUME_MUTE),
  };
}

export function deriveModel(
  players: Record<string, Player>,
  config: FlowConfig,
  pending: PendingStore,
  nowPlaying: NowPlaying = {},
): GraphModel {
  const input = deriveInput(players, config, nowPlaying);
  const channel = deriveChannel(players, config);

  const zoneNodes = new Map<string, GraphNode>();
  const zoneConfigs = new Map<string, FlowZone>();
  for (const zone of config.zones) {
    zoneNodes.set(zone.player_id, deriveZone(players, config, pending, zone));
    zoneConfigs.set(zone.player_id, zone);
  }

  const mixes: GraphNode[] = [...zoneNodes.values()];
  for (const group of config.groups) {
    mixes.push(deriveGroup(pending, group, zoneNodes));
  }
  for (const master of config.masters) {
    mixes.push(deriveMaster(players, config, pending, master));
  }

  const outputs: OutputRow[] = [];
  for (const [playerId, node] of zoneNodes) {
    if (!node.inPath) continue;
    const zone = zoneConfigs.get(playerId);
    if (zone) outputs.push(deriveOutput(players, pending, zone, node));
  }

  const links: GraphLink[] = [];
  links.push({
    fromId: input.id,
    toId: channel.id,
    kind: "input",
    active: input.inPath && channel.inPath,
    muted: false,
  });
  for (const mix of mixes) {
    links.push({
      fromId: channel.id,
      toId: mix.id,
      kind: "channel",
      active: (mix.inPath || mix.partial) && channel.inPath,
      muted: mix.kind === "zone" && mix.inPath && mix.muted,
    });
  }
  for (const out of outputs) {
    links.push({
      fromId: out.zoneId,
      toId: out.id,
      kind: "output",
      active: true,
      muted: out.muted,
    });
  }

  return { input, channel, mixes, outputs, links };
}

// click-to-trace: the node, output and link-endpoint ids that stay bright
// while `selectedId` is selected; a link stays bright when both its ends do
export function selectionClosure(
  model: GraphModel,
  selectedId: string | null,
): Set<string> | null {
  if (selectedId === null) return null;
  const keep = new Set<string>();
  const upstream = [model.input.id, model.channel.id];

  const zoneWithOutput = (zoneNodeId: string) => {
    keep.add(zoneNodeId);
    for (const out of model.outputs) {
      if (out.zoneId === zoneNodeId) keep.add(out.id);
    }
  };

  if (selectedId === model.input.id || selectedId === model.channel.id) {
    upstream.forEach((id) => keep.add(id));
    for (const mix of model.mixes) {
      if (mix.inPath || mix.partial) zoneWithOutput(mix.id);
    }
    return keep;
  }

  const output = model.outputs.find((out) => out.id === selectedId);
  if (output) {
    upstream.forEach((id) => keep.add(id));
    keep.add(output.zoneId);
    keep.add(output.id);
    return keep;
  }

  const mix = model.mixes.find((entry) => entry.id === selectedId);
  if (mix) {
    upstream.forEach((id) => keep.add(id));
    if (mix.kind === "group") {
      keep.add(mix.id);
      for (const memberId of mix.members ?? []) zoneWithOutput(memberId);
    } else {
      zoneWithOutput(mix.id);
    }
    return keep;
  }

  return null;
}
