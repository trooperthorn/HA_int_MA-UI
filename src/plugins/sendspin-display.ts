import {
  SendspinCore,
  loadSendspinClientIdentity,
  type ServerStateMetadata,
  type SendspinStorage,
} from "@sendspin/sendspin-js";
import { api } from "@/plugins/api";
import { createSendspinConnection } from "@/plugins/sendspin-connection";

export type DisplayConnectionState =
  | "connecting"
  | "pairing"
  | "ready"
  | "disconnected"
  | "failed";

export interface DisplaySnapshot {
  status: DisplayConnectionState;
  clientId: string | null;
  metadata: ServerStateMetadata | null;
  error: string | null;
}

const DISPLAY_STORAGE_PREFIX = "frontend.sendspin_display.";

/** A separate stable identity keeps a wall display from replacing this browser's audio player. */
export function displayStorage(
  backing: Pick<Storage, "getItem" | "setItem">,
): SendspinStorage {
  return {
    getItem: (key) => backing.getItem(DISPLAY_STORAGE_PREFIX + key),
    setItem: (key, value) =>
      backing.setItem(DISPLAY_STORAGE_PREFIX + key, value),
  };
}

export class SendspinDisplaySession {
  private core: SendspinCore | null = null;
  private stopped = false;
  private connecting = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs = 1000;
  readonly snapshot: DisplaySnapshot = {
    status: "disconnected",
    clientId: null,
    metadata: null,
    error: null,
  };

  constructor(private readonly onChange: (snapshot: DisplaySnapshot) => void) {}

  getCurrentServerTimeUs(): number | null {
    return this.core?.isConnected ? this.core.getCurrentServerTimeUs() : null;
  }

  private publish(update: Partial<DisplaySnapshot>): void {
    Object.assign(this.snapshot, update);
    this.onChange({ ...this.snapshot });
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    this.publish({ status: "connecting", metadata: null, error: null });
    try {
      const storage = displayStorage(localStorage);
      // Register this display's own identity with the authenticated proxy. It
      // must never claim the separate browser audio player's client id.
      const displayId = loadSendspinClientIdentity(storage).clientId;
      const bridge = await createSendspinConnection(displayId);
      if (this.stopped) {
        bridge.close();
        return;
      }
      const core = new SendspinCore({
        webSocket: bridge as WebSocket,
        storage,
        supportedRoles: ["metadata@v1"],
        clientName: "Music Assistant Display",
        productName: "Music Assistant Display",
        unpairedAccess: false,
        onStateChange: (state) => {
          if (this.core !== core || this.stopped) return;
          this.publish({ metadata: state.serverState.metadata ?? null });
        },
      });
      this.core = core;
      core.onConnectionClose = () => {
        if (this.core !== core || this.stopped) return;
        this.core = null;
        this.publish({ status: "disconnected", metadata: null });
        this.scheduleRetry();
      };
      await core.connect();
      if (this.stopped || this.core !== core) return;
      this.retryDelayMs = 1000;
      this.publish({ status: "pairing", clientId: core.clientId });
      await this.pair(core);
    } catch (error) {
      if (!this.stopped) {
        this.publish({
          status: "failed",
          error: String(error),
          metadata: null,
        });
        // A live connection with failed pairing should stay put so the user can
        // retry its token; reconnecting would create competing display clients.
        if (!this.core?.isConnected) {
          this.core?.disconnect("restart");
          this.core = null;
          this.scheduleRetry();
        }
      }
    } finally {
      this.connecting = false;
    }
  }

  private async pair(core: SendspinCore): Promise<void> {
    const pairingToken = core.pairingToken;
    if (!pairingToken)
      throw new Error("Display identity storage is unavailable");
    await api.sendCommand(
      "sendspin/pair_web_player",
      { pairing_token: pairingToken },
      { suppressGlobalError: true },
    );
    if (this.core === core && !this.stopped)
      this.publish({ status: "ready", error: null });
  }

  async retryPairing(): Promise<void> {
    if (this.stopped) return;
    if (!this.core) {
      if (this.retryTimer !== null) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      await this.connect();
      return;
    }
    this.publish({ status: "pairing", error: null });
    try {
      await this.pair(this.core);
    } catch (error) {
      this.publish({ status: "failed", error: String(error) });
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, this.retryDelayMs);
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 30000);
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const core = this.core;
    this.core = null;
    core?.disconnect("user_request");
    this.publish({ status: "disconnected", metadata: null });
  }
}
