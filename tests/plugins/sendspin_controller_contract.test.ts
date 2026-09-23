import { SendspinCore } from "@sendspin/sendspin-js";
import { afterEach, describe, expect, it, vi } from "vitest";

type CoreInternals = {
  transport: { sendControl: (message: unknown) => void };
  protocolHandler: { sendClientHello: () => void };
  routeControl: (message: unknown) => void;
};

function setupController() {
  vi.useFakeTimers();
  const core = new SendspinCore({
    storage: null,
    supportedRoles: ["controller@v1"],
  });
  const internals = core as unknown as CoreInternals;
  const send = vi.fn();
  internals.transport.sendControl = send;
  internals.protocolHandler.sendClientHello();
  internals.routeControl({
    type: "server/activate",
    payload: { active_roles: ["controller@v1"] },
  });
  return { core, send, internals };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("patched Sendspin controller contract", () => {
  it("advertises a controller without a player and reports availability", () => {
    const { core, send } = setupController();
    const hello = send.mock.calls.find(
      ([msg]) => msg.type === "client/hello",
    )?.[0];
    expect(hello.payload.supported_roles).toEqual(["controller@v1"]);
    expect(hello.payload).not.toHaveProperty("player@v1_support");
    expect(
      send.mock.calls.find(([msg]) => msg.type === "client/state")?.[0].payload,
    ).toEqual({ available: true });

    core.setAvailable(false);
    expect(send.mock.lastCall?.[0]).toMatchObject({
      type: "client/state",
      payload: { available: false },
    });
    core.leaveGroup();
    expect(send.mock.lastCall?.[0]).toEqual({
      type: "client/leave",
      payload: {},
    });
  });

  it("sends only advertised seek commands within the server range", () => {
    const { core, send, internals } = setupController();
    internals.routeControl({
      type: "server/state",
      payload: {
        controller: {
          supported_commands: ["seek", "seek_relative", "switch"],
          seek_max_ms: 180000,
        },
      },
    });
    core.sendCommand("seek", { position_ms: 90000 });
    expect(send.mock.lastCall?.[0]).toEqual({
      type: "client/command",
      payload: { controller: { command: "seek", position_ms: 90000 } },
    });
    expect(() => core.sendCommand("seek", { position_ms: 180001 })).toThrow(
      RangeError,
    );
    expect(() => core.sendCommand("seek_relative", { offset_ms: 1.5 })).toThrow(
      RangeError,
    );
    core.sendCommand("switch", undefined);
    expect(send.mock.lastCall?.[0]).toEqual({
      type: "client/command",
      payload: { controller: { command: "switch" } },
    });
    expect(() => core.sendCommand("play", undefined)).toThrow(/not supported/);
  });
});
