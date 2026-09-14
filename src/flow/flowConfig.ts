// The routing view's topology. Music Assistant cannot see the wiring between
// the player that streams (a Chromecast) and the receiver and amplifier zones
// it feeds, so the user describes it once: which player is the source, which
// one carries the stream, which zones can hear it and on which input, and
// which zones act together. Stored as a user preference.

export type VolumeDisplay = "percent" | "raw";

export interface FlowVolume {
  // how the readout beside the slider reads; raw shows the device's own
  // steps (0 to 38 on a Monoprice) and needs max
  display?: VolumeDisplay;
  max?: number;
}

export interface FlowZone {
  // the Music Assistant player id of the zone
  player_id: string;
  name?: string;
  // the exact input on this zone that carries the stream; falls back to
  // the first feed alias the zone lists
  feed_source?: string;
  volume?: FlowVolume;
}

export interface FlowGroup {
  // a set of zones acted on together; the id is the user's
  id: string;
  name: string;
  members: string[];
}

export interface FlowMaster {
  // a player whose commands fan out to a whole unit in firmware (Monoprice
  // master zones 10, 20, 30); shown as a takeover node
  player_id: string;
  name?: string;
  feed_source?: string;
}

export interface FlowConfig {
  // the player whose queue is the music: its now playing is the input node
  input?: string;
  // the player the music streams to (the Chromecast); the channel node
  channel?: string;
  // input names that carry the stream on any zone ("AUDIO2", "Source 2")
  feed_aliases: string[];
  zones: FlowZone[];
  groups: FlowGroup[];
  masters: FlowMaster[];
  // milliseconds before an unconfirmed expectation is dropped
  optimistic_ttl: number;
}

export const FLOW_PREFERENCE_KEY = "flow.config";

// sized for the Monoprice five second poll
export const DEFAULT_OPTIMISTIC_TTL = 8000;

export const EMPTY_FLOW_CONFIG: FlowConfig = {
  input: undefined,
  channel: undefined,
  feed_aliases: [],
  zones: [],
  groups: [],
  masters: [],
  optimistic_ttl: DEFAULT_OPTIMISTIC_TTL,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOr = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

function normalizeVolume(value: unknown): FlowVolume | undefined {
  if (!isRecord(value)) return undefined;
  const volume: FlowVolume = {};
  if (value.display === "raw" || value.display === "percent") {
    volume.display = value.display;
  }
  if (typeof value.max === "number" && value.max > 0) volume.max = value.max;
  return Object.keys(volume).length ? volume : undefined;
}

// a stored config with anything unusable dropped; a preference written by
// an older build, or by hand, never breaks the view
export function normalizeFlowConfig(value: unknown): FlowConfig {
  if (!isRecord(value)) return { ...EMPTY_FLOW_CONFIG };
  const zones: FlowZone[] = [];
  for (const entry of Array.isArray(value.zones) ? value.zones : []) {
    if (!isRecord(entry)) continue;
    const player_id = stringOr(entry.player_id);
    if (!player_id) continue;
    const zone: FlowZone = { player_id };
    const name = stringOr(entry.name);
    if (name) zone.name = name;
    const feed = stringOr(entry.feed_source);
    if (feed) zone.feed_source = feed;
    const volume = normalizeVolume(entry.volume);
    if (volume) zone.volume = volume;
    zones.push(zone);
  }
  const groups: FlowGroup[] = [];
  for (const entry of Array.isArray(value.groups) ? value.groups : []) {
    if (!isRecord(entry)) continue;
    const id = stringOr(entry.id);
    if (!id) continue;
    groups.push({
      id,
      name: stringOr(entry.name) ?? id,
      members: stringList(entry.members),
    });
  }
  const masters: FlowMaster[] = [];
  for (const entry of Array.isArray(value.masters) ? value.masters : []) {
    if (!isRecord(entry)) continue;
    const player_id = stringOr(entry.player_id);
    if (!player_id) continue;
    const master: FlowMaster = { player_id };
    const name = stringOr(entry.name);
    if (name) master.name = name;
    const feed = stringOr(entry.feed_source);
    if (feed) master.feed_source = feed;
    masters.push(master);
  }
  const ttl =
    typeof value.optimistic_ttl === "number" && value.optimistic_ttl > 0
      ? value.optimistic_ttl
      : DEFAULT_OPTIMISTIC_TTL;
  return {
    input: stringOr(value.input),
    channel: stringOr(value.channel),
    feed_aliases: stringList(value.feed_aliases).filter((alias) =>
      alias.trim(),
    ),
    zones,
    groups,
    masters,
    optimistic_ttl: ttl,
  };
}

// the view has something to draw once a channel and a zone are named
export function isFlowConfigured(config: FlowConfig): boolean {
  return !!config.channel && config.zones.length > 0;
}
