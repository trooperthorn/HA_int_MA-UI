import { SendspinCore } from "@sendspin/sendspin-js";
import { afterEach, describe, expect, it, vi } from "vitest";

type CoreInternals = {
  transport: {
    sendControl: (message: unknown) => void;
    handleActivate: (message: unknown) => void;
    matched: { category: string };
    deps: { unpairedAccess: boolean };
  };
  protocolHandler: { sendClientHello: () => void };
  routeControl: (message: unknown) => void;
};

afterEach(() => vi.useRealTimers());

describe("patched Sendspin player wire", () => {
  it("accepts an omitted first role list and clears roles after trust drops", () => {
    vi.useFakeTimers();
    const core = new SendspinCore({ storage: null });
    const internals = core as unknown as CoreInternals & {
      stateManager: { serverState: Record<string, unknown> };
    };
    const send = vi.fn();
    internals.transport.sendControl = send;
    internals.transport.matched = { category: "long_term" };
    internals.transport.handleActivate({
      type: "server/activate",
      payload: { activities: [] },
    });
    expect(
      send.mock.calls.find(([message]) => message.type === "client/state")?.[0]
        .payload,
    ).not.toHaveProperty("player");
    internals.transport.handleActivate({
      type: "server/activate",
      payload: { activities: ["playback"], active_roles: ["metadata@v1"] },
    });
    internals.routeControl({
      type: "server/state",
      payload: { metadata: { title: "Old title" } },
    });
    expect(internals.stateManager.serverState).toHaveProperty("metadata");

    internals.transport.matched = { category: "sentinel" };
    internals.transport.deps.unpairedAccess = false;
    internals.transport.handleActivate({
      type: "server/activate",
      payload: { activities: [] },
    });
    expect(internals.stateManager.serverState).not.toHaveProperty("metadata");
  });

  it("keeps inactive roles out of state and clears revoked role output", () => {
    vi.useFakeTimers();
    const core = new SendspinCore({ storage: null });
    const internals = core as unknown as CoreInternals & {
      stateManager: {
        serverState: Record<string, unknown>;
        isPlaying: boolean;
      };
    };
    const send = vi.fn();
    internals.transport.sendControl = send;
    internals.routeControl({ type: "server/activate", payload: {} });
    expect(
      send.mock.calls.find(([message]) => message.type === "client/state")?.[0]
        .payload,
    ).not.toHaveProperty("player");
    internals.routeControl({
      type: "server/activate",
      payload: { active_roles: ["player@v1", "metadata@v1", "controller@v1"] },
    });
    expect(send.mock.lastCall?.[0].payload.player).toHaveProperty(
      "supported_commands",
    );
    internals.routeControl({
      type: "server/state",
      payload: {
        metadata: { title: "Old title" },
        controller: { supported_commands: ["play"] },
      },
    });
    expect(internals.stateManager.serverState.metadata).toEqual({
      title: "Old title",
    });
    internals.routeControl({
      type: "server/activate",
      payload: { active_roles: ["controller@v1"] },
    });
    expect(internals.stateManager.serverState).not.toHaveProperty("metadata");
    expect(internals.stateManager.serverState.controller).toEqual({
      supported_commands: ["play"],
    });
    expect(internals.stateManager.isPlaying).toBe(false);
    internals.routeControl({
      type: "server/state",
      payload: { metadata: { title: "Ignored" } },
    });
    expect(internals.stateManager.serverState).not.toHaveProperty("metadata");
    internals.routeControl({
      type: "server/activate",
      payload: { active_roles: ["controller@v1", "player@v1"] },
    });
    expect(send.mock.lastCall?.[0].payload.player).toHaveProperty(
      "supported_commands",
    );
  });

  it("reports current-spec output delay and acknowledges server changes", () => {
    vi.useFakeTimers();
    const core = new SendspinCore({ storage: null, syncDelay: 250 });
    const internals = core as unknown as CoreInternals;
    const send = vi.fn();
    internals.transport.sendControl = send;
    internals.protocolHandler.sendClientHello();
    const hello = send.mock.calls.find(
      ([message]) => message.type === "client/hello",
    )?.[0];
    expect(hello.payload["player@v1_support"]).not.toHaveProperty(
      "supported_commands",
    );
    internals.routeControl({
      type: "server/activate",
      payload: { active_roles: ["player@v1"] },
    });
    const first = send.mock.calls.find(
      ([message]) => message.type === "client/state",
    )?.[0];
    expect(first.payload.player).toMatchObject({
      output_delay_ms: 250,
      supported_commands: ["volume", "mute", "set_output_delay"],
    });
    expect(first.payload.player).not.toHaveProperty("static_delay_ms");

    internals.routeControl({
      type: "server/command",
      payload: {
        player: { command: "set_output_delay", output_delay_ms: 300 },
      },
    });
    expect(send.mock.lastCall?.[0]).toMatchObject({
      type: "client/state",
      payload: { player: { output_delay_ms: 300 } },
    });

    internals.routeControl({
      type: "server/command",
      payload: {
        player: { command: "set_static_delay", static_delay_ms: 200 },
      },
    });
    expect(send.mock.lastCall?.[0]).toMatchObject({
      type: "client/state",
      payload: { player: { output_delay_ms: 200 } },
    });
  });
});
