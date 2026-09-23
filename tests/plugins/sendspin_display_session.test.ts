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
  it("keeps its identity separate and pairs a metadata-only client", async () => {
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
    expect(core.config.supportedRoles).toEqual(["metadata@v1"]);
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
});
