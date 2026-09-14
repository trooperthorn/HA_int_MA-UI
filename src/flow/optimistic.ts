// Some zones confirm slowly: Monoprice zones reflect a command only after
// the integration's five second poll. When the view sends a command it
// records what it expects the player to look like; the graph draws the
// expectation with a pending mark until the player confirms it or the time
// runs out. Expired expectations are dropped silently, so the view shows
// device truth after at most one TTL.

import type { Player } from "@/plugins/api/interfaces";

export interface Expectation {
  powered?: boolean;
  source?: string;
  // 0 to 100, as the player reports it
  volume_level?: number;
  volume_muted?: boolean;
}

interface PendingEntry {
  expect: Expectation;
  setAt: number;
  ttl: number;
}

// one step of a 0 to 38 scale is under three percent
const VOLUME_TOLERANCE = 3;

// the input a player is on, as the Home Assistant provider mirrors it
export function playerSource(player: Player | undefined): string | undefined {
  const value = player?.extra_attributes?.hass_source;
  return typeof value === "string" && value ? value : undefined;
}

function satisfied(expect: Expectation, player: Player): boolean {
  if (expect.powered !== undefined && !!player.powered !== expect.powered) {
    return false;
  }
  if (expect.source !== undefined && playerSource(player) !== expect.source) {
    return false;
  }
  if (expect.volume_level !== undefined) {
    const actual = player.volume_level;
    if (
      typeof actual !== "number" ||
      Math.abs(actual - expect.volume_level) > VOLUME_TOLERANCE
    ) {
      return false;
    }
  }
  if (
    expect.volume_muted !== undefined &&
    !!player.volume_muted !== expect.volume_muted
  ) {
    return false;
  }
  return true;
}

export class PendingStore {
  private entries = new Map<string, PendingEntry>();

  // record an expectation, merged over any outstanding one for the player
  set(playerId: string, expect: Expectation, ttl: number, now: number): void {
    const existing = this.entries.get(playerId);
    this.entries.set(playerId, {
      expect: { ...existing?.expect, ...expect },
      setAt: now,
      ttl,
    });
  }

  // drop what the live state now satisfies, and what timed out
  reconcile(players: Record<string, Player>, now: number): void {
    for (const [playerId, entry] of this.entries) {
      const player = players[playerId];
      if (player && satisfied(entry.expect, player)) {
        this.entries.delete(playerId);
      } else if (now - entry.setAt > entry.ttl) {
        this.entries.delete(playerId);
      }
    }
  }

  has(playerId: string): boolean {
    return this.entries.has(playerId);
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  // the player as the view should draw it: live state with the outstanding
  // expectation laid over it
  overlay(playerId: string, player: Player | undefined): Player | undefined {
    const entry = this.entries.get(playerId);
    if (!entry || !player) return player;
    const expect = entry.expect;
    const extra: Record<string, unknown> = { ...player.extra_attributes };
    if (expect.source !== undefined) extra.hass_source = expect.source;
    return {
      ...player,
      powered: expect.powered ?? player.powered,
      volume_level: expect.volume_level ?? player.volume_level,
      volume_muted: expect.volume_muted ?? player.volume_muted,
      extra_attributes: extra,
    } as Player;
  }

  clear(): void {
    this.entries.clear();
  }
}
