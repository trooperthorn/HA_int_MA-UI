import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const instances: Array<{
    config: Record<string, unknown>;
    clientId: string;
    pairingToken: string;
    isConnected: boolean;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onConnectionClose?: () => void;
    onArtworkStreamStart?: (config: {
      channels: Array<{ source: string; format: string }>;
    }) => void;
    onArtworkFrame?: (frame: Uint8Array) => void;
    onArtworkStreamEnd?: () => void;
  }> = [];
  return {
    instances,
    connection: vi.fn(async () => ({ readyState: 1, close: vi.fn() })),
    sendCommand: vi.fn(async () => undefined),
  };
});

vi.mock("@sendspin/sendspin-js", () => ({
  loadSendspinClientIdentity: () => ({ clientId: "display-client" }),
  SendspinCore: class {
    clientId = "display-client";
    pairingToken = "display-token";
    isConnected = true;
    onConnectionClose?: () => void;
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn();
    constructor(readonly config: Record<string, unknown>) {
      mocks.instances.push(this);
    }
    getCurrentServerTimeUs() {
      return 500_000;
    }
  },
}));
vi.mock("@/plugins/sendspin-connection", () => ({
  createSendspinConnection: mocks.connection,
}));
vi.mock("@/plugins/api", () => ({ api: { sendCommand: mocks.sendCommand } }));

import {
  SendspinDisplaySession,
  displayStorage,
} from "@/plugins/sendspin-display";

const storageValues = new Map<string, string>();
const storage = {
  getItem: (key: string) => storageValues.get(key) ?? null,
  setItem: (key: string, value: string) => storageValues.set(key, value),
};

beforeEach(() => {
  storageValues.clear();
  vi.stubGlobal("localStorage", storage);
  mocks.instances.length = 0;
  mocks.connection.mockClear();
  mocks.sendCommand.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Sendspin browser display", () => {
  it("keeps its identity separate and pairs a metadata and artwork display", async () => {
    const scoped = displayStorage(storage);
    scoped.setItem("identity", "display-identity");
    expect(storage.getItem("identity")).toBeNull();
    expect(scoped.getItem("identity")).toBe("display-identity");

    const changes: unknown[] = [];
    const session = new SendspinDisplaySession((snapshot) =>
      changes.push(snapshot),
    );
    await session.start();
    expect(mocks.connection).toHaveBeenCalledWith("display-client");
    const core = mocks.instances[0];
    expect(core.config.supportedRoles).toEqual(["metadata@v1", "artwork@v1"]);
    expect(core.config.artworkWireMode).toBe("legacy");
    expect(core.config.unpairedAccess).toBe(false);
    expect(core.config.productName).toBe("Music Assistant Display");
    expect(mocks.sendCommand).toHaveBeenCalledWith(
      "sendspin/pair_web_player",
      { pairing_token: "display-token" },
      { suppressGlobalError: true },
    );
    expect(session.snapshot.status).toBe("ready");
    expect(session.getCurrentServerTimeUs()).toBe(500_000);
    (core.config.onStateChange as (state: unknown) => void)({
      serverState: { metadata: { title: "Current track" } },
    });
    expect(session.snapshot.metadata?.title).toBe("Current track");
    session.stop();
    expect(core.disconnect).toHaveBeenCalledWith("user_request");
    expect(session.snapshot.metadata).toBeNull();
    expect(changes.length).toBeGreaterThan(2);
  });

  it("retains a connected client after a pairing failure for explicit retry", async () => {
    mocks.sendCommand.mockRejectedValueOnce(new Error("pairing unavailable"));
    const session = new SendspinDisplaySession(() => undefined);
    await session.start();
    expect(session.snapshot.status).toBe("failed");
    expect(mocks.instances).toHaveLength(1);
    await session.retryPairing();
    expect(mocks.instances).toHaveLength(1);
    expect(session.snapshot.status).toBe("ready");
    session.stop();
  });

  it("shows timed binary album art and revokes it when the stream ends", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:album-art");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const session = new SendspinDisplaySession(() => undefined);
    await session.start();
    const core = mocks.instances[0];
    core.onArtworkStreamStart?.({
      channels: [{ source: "album", format: "jpeg" }],
    });
    const frame = new Uint8Array(11);
    frame[0] = 8;
    new DataView(frame.buffer).setBigInt64(1, 600_000n, false);
    frame.set([0xff, 0xd8], 9);
    core.onArtworkFrame?.(frame);
    expect(session.snapshot.artworkUrls[0]).toBeNull();
    vi.advanceTimersByTime(99);
    expect(session.snapshot.artworkUrls[0]).toBeNull();
    vi.advanceTimersByTime(1);
    expect(session.snapshot.artworkUrls[0]).toBe("blob:album-art");
    core.onArtworkStreamEnd?.();
    expect(session.snapshot.artworkUrls[0]).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:album-art");
    session.stop();
  });

  it("retains an unchanged artwork channel when the other channel is reconfigured", async () => {
    let serial = 0;
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => `blob:image-${++serial}`),
      revokeObjectURL,
    });
    const session = new SendspinDisplaySession(() => undefined);
    await session.start();
    const core = mocks.instances[0];
    core.onArtworkStreamStart?.({
      channels: [
        { source: "album", format: "jpeg" },
        { source: "artist", format: "jpeg" },
      ],
    });
    const frame = (channel: number) => {
      const bytes = new Uint8Array(10);
      bytes[0] = 8 + channel;
      new DataView(bytes.buffer).setBigInt64(1, 500_000n, false);
      bytes[9] = channel;
      return bytes;
    };
    core.onArtworkFrame?.(frame(0));
    core.onArtworkFrame?.(frame(1));
    expect(session.snapshot.artworkUrls).toEqual([
      "blob:image-1",
      "blob:image-2",
    ]);
    core.onArtworkStreamStart?.({
      channels: [
        { source: "album", format: "jpeg" },
        { source: "artist", format: "png" },
      ],
    });
    expect(session.snapshot.artworkUrls).toEqual(["blob:image-1", null]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:image-2");
    expect(revokeObjectURL).not.toHaveBeenCalledWith("blob:image-1");
    session.stop();
  });
});
