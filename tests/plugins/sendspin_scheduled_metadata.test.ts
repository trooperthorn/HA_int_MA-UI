import { SendspinCore } from "@sendspin/sendspin-js";
import { afterEach, describe, expect, it, vi } from "vitest";

type CoreInternals = {
  routeControl: (message: unknown) => void;
  onTransportClose: () => void;
};

function setupMetadataClient() {
  vi.useFakeTimers();
  const states: Array<{
    serverState: {
      metadata?: {
        timestamp?: number;
        title?: string | null;
        progress?: unknown;
      };
    };
  }> = [];
  const core = new SendspinCore({
    storage: null,
    supportedRoles: ["metadata@v1"],
    onStateChange: (state) => states.push(state),
  });
  const internals = core as unknown as CoreInternals;
  internals.routeControl({
    type: "server/activate",
    payload: { active_roles: ["metadata@v1"] },
  });
  return { core, internals, states };
}

afterEach(() => vi.useRealTimers());

describe("scheduled Sendspin metadata", () => {
  it("applies only the newest future track at its audible timestamp", () => {
    const { core, internals, states } = setupMetadataClient();
    const now = core.getCurrentServerTimeUs();
    internals.routeControl({
      type: "server/state",
      payload: {
        metadata: {
          timestamp: now,
          title: "Current",
          progress: {
            track_progress: 1,
            track_duration: 30,
            playback_speed: 1000,
          },
        },
      },
    });
    internals.routeControl({
      type: "server/state",
      payload: { metadata: { timestamp: now + 100_000, title: "Discarded" } },
    });
    internals.routeControl({
      type: "server/state",
      payload: { metadata: { timestamp: now + 150_000, title: "Next" } },
    });
    expect(states.at(-1)?.serverState.metadata?.title).toBe("Current");
    vi.advanceTimersByTime(100);
    expect(states.at(-1)?.serverState.metadata?.title).toBe("Current");
    vi.advanceTimersByTime(50);
    expect(states.at(-1)?.serverState.metadata).toEqual({
      timestamp: now + 150_000,
      title: "Next",
    });
  });

  it("clears an omitted progress value and cancels pending metadata on revocation", () => {
    const { core, internals, states } = setupMetadataClient();
    const now = core.getCurrentServerTimeUs();
    internals.routeControl({
      type: "server/state",
      payload: {
        metadata: {
          timestamp: now,
          title: "Playing",
          progress: {
            track_progress: 1,
            track_duration: 30,
            playback_speed: 1000,
          },
        },
      },
    });
    internals.routeControl({
      type: "server/state",
      payload: { metadata: { timestamp: now + 100_000, title: "Future" } },
    });
    internals.routeControl({
      type: "server/activate",
      payload: { active_roles: [] },
    });
    vi.advanceTimersByTime(150);
    expect(states.at(-1)?.serverState.metadata).toBeUndefined();

    internals.routeControl({
      type: "server/activate",
      payload: { active_roles: ["metadata@v1"] },
    });
    internals.routeControl({
      type: "server/state",
      payload: {
        metadata: { timestamp: core.getCurrentServerTimeUs(), title: "Paused" },
      },
    });
    expect(states.at(-1)?.serverState.metadata).not.toHaveProperty("progress");
  });

  it("drops a pending update when the transport closes", () => {
    const { core, internals, states } = setupMetadataClient();
    const now = core.getCurrentServerTimeUs();
    internals.routeControl({
      type: "server/state",
      payload: { metadata: { timestamp: now, title: "Current" } },
    });
    internals.routeControl({
      type: "server/state",
      payload: { metadata: { timestamp: now + 100_000, title: "Future" } },
    });
    internals.onTransportClose();
    vi.advanceTimersByTime(150);
    expect(states.at(-1)?.serverState.metadata?.title).not.toBe("Future");
  });
});
