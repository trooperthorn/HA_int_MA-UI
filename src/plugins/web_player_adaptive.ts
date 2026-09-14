// Adaptive mode for the web player: steps the stream down a ladder when the
// link cannot keep up, and back up once it has been quiet for a while.
//
// The signal is what sendspin-js reports about the running stream: a resync
// (the player threw its buffer away and re-anchored) and a large sync error
// both mean audio arrived later than it could be played, which is the
// dropout the listener hears. There is no bandwidth probe; the stream is
// the probe.
//
// A rung names the codec, the Opus bitrate and the buffer. Rung 0 is
// whatever the user chose (the ceiling); the rungs below trade quality for
// tolerance. Codec and bitrate are applied on the server through the
// player's config (the stream changes in place), the buffer on the running
// player.

import type { WebPlayerCodecPref } from "./web_player_tuning";

export interface Rung {
  // "keep" leaves the user's codec choice alone
  codec: WebPlayerCodecPref | "keep";
  // bits per second; 0 is the encoder default
  bitrate: number;
  // the floor for the buffer in ms; the user's own choice applies when larger
  bufferMs: number;
}

export const LADDER: readonly Rung[] = [
  { codec: "keep", bitrate: 0, bufferMs: 0 },
  { codec: "opus", bitrate: 128000, bufferMs: 2500 },
  { codec: "opus", bitrate: 96000, bufferMs: 5000 },
  { codec: "opus", bitrate: 64000, bufferMs: 10000 },
];

export interface HealthSample {
  // sendspin-js syncInfo.resyncCount, cumulative
  resyncCount: number;
  // sendspin-js syncInfo.syncErrorMs, absolute
  syncErrorMs: number;
  // milliseconds, any monotonic clock
  now: number;
}

// two resyncs within a minute, or a sync error past this for ten seconds
// running, is a link that is not keeping up
export const RESYNC_WINDOW_MS = 60_000;
export const RESYNCS_TO_STEP_DOWN = 2;
export const SYNC_ERROR_LIMIT_MS = 250;
export const SYNC_ERROR_HOLD_MS = 10_000;
// quiet this long before trying the rung above
export const STEP_UP_AFTER_MS = 600_000;
// after a change, ignore what the stream does while it settles
export const SETTLE_MS = 30_000;

export type Verdict = "down" | "up" | null;

// what Chromium says about the link (navigator.connection); absent on
// Firefox and Safari, where the stream stays the only probe
export interface ConnectionHint {
  // "slow-2g" | "2g" | "3g" | "4g"
  effectiveType?: string;
  // the user asked for less data
  saveData?: boolean;
  // estimated round trip in ms, in 25 ms steps
  rtt?: number;
}

const CONNECTION_RTT_SLOW_MS = 300;

/** The browser's connection hint, or null where it offers none. */
export function readConnection(): ConnectionHint | null {
  const connection = connectionTarget() as
    | (EventTarget & ConnectionHint)
    | null;
  if (!connection) return null;
  return {
    effectiveType: connection.effectiveType,
    saveData: connection.saveData,
    rtt: connection.rtt,
  };
}

/** navigator.connection as an event target (it fires "change"), or null. */
export function connectionTarget(): EventTarget | null {
  if (typeof navigator === "undefined") return null;
  const connection = (navigator as { connection?: unknown }).connection;
  return connection && typeof connection === "object"
    ? (connection as EventTarget)
    : null;
}

/**
 * The lowest rung a link of this kind should start on, before a dropout
 * has been heard: data saver and 2G take the last rung, 3G the middle one,
 * a slow round trip the first step down, anything else the user's choices.
 */
export function rungForConnection(hint: ConnectionHint | null): number {
  if (!hint) return 0;
  const last = LADDER.length - 1;
  if (hint.saveData) return last;
  if (hint.effectiveType === "slow-2g" || hint.effectiveType === "2g") {
    return last;
  }
  if (hint.effectiveType === "3g") return Math.min(2, last);
  if ((hint.rtt ?? 0) >= CONNECTION_RTT_SLOW_MS) return Math.min(1, last);
  return 0;
}

/**
 * Watches the stream's health and says when to move on the ladder. Feed it
 * a sample every couple of seconds; it answers "down", "up" or nothing.
 */
export class AdaptiveController {
  rung = 0;
  private resyncTimes: number[] = [];
  private lastResyncCount: number | null = null;
  private errorSince: number | null = null;
  private quietSince: number | null = null;
  private settleUntil = 0;

  constructor(private readonly ladderSize = LADDER.length) {}

  /** Forget everything, for a fresh session. */
  reset(now: number) {
    this.resyncTimes = [];
    this.lastResyncCount = null;
    this.errorSince = null;
    this.quietSince = now;
    this.settleUntil = now + SETTLE_MS;
  }

  observe(sample: HealthSample): Verdict {
    const { now } = sample;
    // resyncs are counted from the first sample on; the count before that
    // belongs to a stream this controller never saw
    if (
      this.lastResyncCount !== null &&
      sample.resyncCount > this.lastResyncCount
    ) {
      this.resyncTimes.push(now);
    }
    this.lastResyncCount = sample.resyncCount;
    this.resyncTimes = this.resyncTimes.filter(
      (time) => now - time <= RESYNC_WINDOW_MS,
    );

    if (Math.abs(sample.syncErrorMs) > SYNC_ERROR_LIMIT_MS) {
      this.errorSince ??= now;
    } else {
      this.errorSince = null;
    }

    const troubled =
      this.resyncTimes.length >= RESYNCS_TO_STEP_DOWN ||
      (this.errorSince !== null && now - this.errorSince >= SYNC_ERROR_HOLD_MS);

    if (troubled) this.quietSince = null;
    else this.quietSince ??= now;

    if (now < this.settleUntil) return null;

    if (troubled) {
      if (this.rung >= this.ladderSize - 1) return null;
      this.rung += 1;
      this.moved(now);
      return "down";
    }
    if (
      this.rung > 0 &&
      this.quietSince !== null &&
      now - this.quietSince >= STEP_UP_AFTER_MS
    ) {
      this.rung -= 1;
      this.moved(now);
      return "up";
    }
    return null;
  }

  /**
   * Move down to at least this rung, for a link known to be poor before
   * the stream has said so. Never moves up; that stays with the quiet
   * timer. Returns whether it moved.
   */
  floor(rung: number, now: number): boolean {
    const wanted = Math.min(rung, this.ladderSize - 1);
    if (wanted <= this.rung) return false;
    this.rung = wanted;
    this.moved(now);
    return true;
  }

  private moved(now: number) {
    this.resyncTimes = [];
    this.errorSince = null;
    this.quietSince = now;
    this.settleUntil = now + SETTLE_MS;
  }
}

/** What a rung asks for, given the user's own choices as the ceiling. */
export function resolveRung(
  rung: Rung,
  chosen: { codec: WebPlayerCodecPref; bitrate: number; bufferMs: number },
): { codec: WebPlayerCodecPref; bitrate: number; bufferMs: number } {
  return {
    codec: rung.codec === "keep" ? chosen.codec : rung.codec,
    bitrate: rung.bitrate || chosen.bitrate,
    bufferMs: Math.max(rung.bufferMs, chosen.bufferMs),
  };
}
