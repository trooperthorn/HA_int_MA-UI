import { SendspinCore } from "@sendspin/sendspin-js";
import { afterEach, describe, expect, it, vi } from "vitest";

type CoreInternals = {
  transport: { sendControl: (message: unknown) => void };
  protocolHandler: { sendClientHello: () => void };
  routeControl: (message: unknown) => void;
};

afterEach(() => vi.useRealTimers());

describe("patched Sendspin player wire", () => {
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
