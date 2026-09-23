import { SendspinCore } from "@sendspin/sendspin-js";
import { describe, expect, it, vi } from "vitest";

type CoreInternals = {
  protocolHandler: {
    sender: { sendControl: (message: unknown) => void };
    sendClientHello: () => void;
    sendStateUpdate: () => void;
  };
  routeControl: (message: unknown) => void;
  handleBinaryMessage: (frame: ArrayBuffer) => void;
};

const channel = {
  source: "album" as const,
  format: "jpeg" as const,
  width: 320,
  height: 320,
};

describe("Sendspin artwork SDK role", () => {
  it("advertises the pinned server's hello channels and routes binary only in an active artwork stream", () => {
    const core = new SendspinCore({
      storage: null,
      supportedRoles: ["metadata@v1", "artwork@v1"],
      artworkChannels: [channel],
      artworkWireMode: "legacy",
    });
    const internals = core as unknown as CoreInternals;
    const sendControl = vi.fn();
    internals.protocolHandler.sender = { sendControl };
    internals.protocolHandler.sendClientHello();
    expect(sendControl).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          "artwork@v1_support": {
            channels: [
              {
                source: "album",
                format: "jpeg",
                media_width: 320,
                media_height: 320,
              },
            ],
          },
        }),
      }),
    );
    const onFrame = vi.fn();
    const onEnd = vi.fn();
    core.onArtworkFrame = onFrame;
    core.onArtworkStreamEnd = onEnd;
    const binary = new Uint8Array([8, 0, 0, 0, 0, 0, 0, 0, 1, 0xff]);
    internals.handleBinaryMessage(binary.buffer);
    expect(onFrame).not.toHaveBeenCalled();
    internals.routeControl({
      type: "server/activate",
      payload: { active_roles: ["metadata@v1", "artwork@v1"] },
    });
    internals.routeControl({
      type: "stream/start",
      payload: { artwork: { channels: [channel] } },
    });
    internals.handleBinaryMessage(binary.buffer);
    expect(onFrame).toHaveBeenCalledWith(binary);
    internals.routeControl({
      type: "stream/end",
      payload: { roles: ["artwork"] },
    });
    expect(onEnd).toHaveBeenCalledTimes(1);
    internals.handleBinaryMessage(binary.buffer);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("declares channels in client/state for current-spec servers", () => {
    const core = new SendspinCore({
      storage: null,
      supportedRoles: ["artwork@v1"],
      artworkChannels: [channel],
      artworkWireMode: "announce-parts",
    });
    const internals = core as unknown as CoreInternals;
    const sendControl = vi.fn();
    internals.protocolHandler.sender = { sendControl };
    internals.protocolHandler.sendClientHello();
    expect(sendControl.mock.calls[0][0].payload).not.toHaveProperty(
      "artwork@v1_support",
    );
    internals.protocolHandler.sendStateUpdate();
    expect(sendControl.mock.calls[1][0].payload.artwork).toEqual({
      channels: [channel],
    });
  });
});
