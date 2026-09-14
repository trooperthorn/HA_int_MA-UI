import {
  AdaptiveController,
  LADDER,
  resolveRung,
  rungForConnection,
  SETTLE_MS,
  STEP_UP_AFTER_MS,
} from "@/plugins/web_player_adaptive";
import { describe, expect, it } from "vitest";

const sample = (now: number, resyncCount = 0, syncErrorMs = 0) => ({
  now,
  resyncCount,
  syncErrorMs,
});

describe("AdaptiveController", () => {
  it("steps down after two resyncs inside a minute, once the stream has settled", () => {
    const controller = new AdaptiveController();
    controller.reset(0);
    // the first sample is the baseline; resyncs during the settle window
    // are noted but not acted on
    expect(controller.observe(sample(500, 0))).toBeNull();
    expect(controller.observe(sample(1_000, 1))).toBeNull();
    expect(controller.observe(sample(2_000, 2))).toBeNull();
    // still inside the settle window
    expect(controller.observe(sample(SETTLE_MS - 1, 2))).toBeNull();
    expect(controller.observe(sample(SETTLE_MS + 1_000, 2))).toBe("down");
    expect(controller.rung).toBe(1);
  });

  it("ignores resyncs that happened before it started watching", () => {
    const controller = new AdaptiveController();
    controller.reset(0);
    expect(controller.observe(sample(SETTLE_MS + 1_000, 40))).toBeNull();
    expect(controller.observe(sample(SETTLE_MS + 3_000, 40))).toBeNull();
    expect(controller.rung).toBe(0);
  });

  it("steps down on a sync error held for ten seconds and stops at the last rung", () => {
    const controller = new AdaptiveController();
    controller.reset(0);
    let now = SETTLE_MS + 1_000;
    // the error has to persist; a blip does nothing
    expect(controller.observe(sample(now, 0, 900))).toBeNull();
    expect(controller.observe(sample(now + 5_000, 0, 10))).toBeNull();
    for (let rung = 1; rung < LADDER.length; rung++) {
      now += SETTLE_MS + 1_000;
      expect(controller.observe(sample(now, 0, 900))).toBeNull();
      expect(controller.observe(sample(now + 10_000, 0, 900))).toBe("down");
      expect(controller.rung).toBe(rung);
      now += 10_000;
    }
    now += SETTLE_MS + 1_000;
    controller.observe(sample(now, 0, 900));
    expect(controller.observe(sample(now + 10_000, 0, 900))).toBeNull();
    expect(controller.rung).toBe(LADDER.length - 1);
  });

  it("steps back up after ten quiet minutes, one rung at a time", () => {
    const controller = new AdaptiveController();
    controller.reset(0);
    let now = SETTLE_MS + 1_000;
    controller.observe(sample(now - 1_000, 0));
    controller.observe(sample(now, 1));
    expect(controller.observe(sample(now + 1_000, 2))).toBe("down");
    now += 1_000;
    // quiet, but not yet for long enough
    expect(
      controller.observe(sample(now + STEP_UP_AFTER_MS - 1_000, 2)),
    ).toBeNull();
    expect(controller.observe(sample(now + STEP_UP_AFTER_MS + 1_000, 2))).toBe(
      "up",
    );
    expect(controller.rung).toBe(0);
    // nothing above the ceiling
    expect(
      controller.observe(sample(now + 2 * STEP_UP_AFTER_MS + 2_000, 2)),
    ).toBeNull();
  });
});

describe("AdaptiveController.floor", () => {
  it("moves down to the floor but never up", () => {
    const controller = new AdaptiveController();
    controller.reset(0);
    expect(controller.floor(2, 0)).toBe(true);
    expect(controller.rung).toBe(2);
    expect(controller.floor(1, 1_000)).toBe(false);
    expect(controller.rung).toBe(2);
    expect(controller.floor(99, 2_000)).toBe(true);
    expect(controller.rung).toBe(LADDER.length - 1);
    // a move starts a settle window like any other
    expect(controller.observe(sample(3_000, 0, 900))).toBeNull();
    expect(controller.observe(sample(SETTLE_MS + 13_000, 0, 900))).toBeNull();
  });
});

describe("rungForConnection", () => {
  it("maps what the browser says about the link to a starting rung", () => {
    expect(rungForConnection(null)).toBe(0);
    expect(rungForConnection({ effectiveType: "4g", rtt: 50 })).toBe(0);
    expect(rungForConnection({ effectiveType: "4g", rtt: 300 })).toBe(1);
    expect(rungForConnection({ effectiveType: "3g" })).toBe(2);
    expect(rungForConnection({ effectiveType: "2g" })).toBe(3);
    expect(rungForConnection({ effectiveType: "slow-2g" })).toBe(3);
    expect(rungForConnection({ effectiveType: "4g", saveData: true })).toBe(3);
  });
});

describe("resolveRung", () => {
  it("keeps the user's choices as the ceiling and never shrinks their buffer", () => {
    const chosen = { codec: "flac" as const, bitrate: 0, bufferMs: 5000 };
    expect(resolveRung(LADDER[0], chosen)).toEqual(chosen);
    expect(resolveRung(LADDER[1], chosen)).toEqual({
      codec: "opus",
      bitrate: 128000,
      bufferMs: 5000,
    });
    expect(resolveRung(LADDER[3], chosen)).toEqual({
      codec: "opus",
      bitrate: 64000,
      bufferMs: 10000,
    });
  });
});
