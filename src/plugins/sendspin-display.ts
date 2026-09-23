import {
  SendspinCore,
  loadSendspinClientIdentity,
  type ServerStateMetadata,
  type SendspinStorage,
} from "@sendspin/sendspin-js";
import { api } from "@/plugins/api";
import { createSendspinConnection } from "@/plugins/sendspin-connection";
import { SendspinArtworkFramer } from "@/plugins/sendspin-artwork";

export type DisplayConnectionState =
  | "connecting"
  | "pairing"
  | "ready"
  | "disconnected"
  | "unsupported"
  | "failed";

export interface DisplaySnapshot {
  status: DisplayConnectionState;
  clientId: string | null;
  metadata: ServerStateMetadata | null;
  artworkUrls: Array<string | null>;
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
  private readonly artworkFramer = new SendspinArtworkFramer("legacy");
  private artworkChannels: Array<{
    source: string;
    format?: string;
    width?: number;
    height?: number;
  }> = [];
  private artworkPending = new Map<
    number,
    { timer: ReturnType<typeof setTimeout>; url: string | null }
  >();
  readonly snapshot: DisplaySnapshot = {
    status: "disconnected",
    clientId: null,
    metadata: null,
    artworkUrls: [null, null],
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

  private clearArtwork(): void {
    this.artworkFramer.reset();
    for (const pending of this.artworkPending.values()) {
      clearTimeout(pending.timer);
      if (pending.url) URL.revokeObjectURL(pending.url);
    }
    this.artworkPending.clear();
    for (const url of this.snapshot.artworkUrls)
      if (url) URL.revokeObjectURL(url);
    this.artworkChannels = [];
    this.publish({ artworkUrls: [null, null] });
  }

  private startArtworkStream(
    channels: Array<{
      source: string;
      format?: string;
      width?: number;
      height?: number;
    }>,
  ): void {
    const artworkUrls = [...this.snapshot.artworkUrls];
    let changed = false;
    for (
      let channel = 0;
      channel < Math.max(this.artworkChannels.length, channels.length);
      channel++
    ) {
      if (
        JSON.stringify(this.artworkChannels[channel]) ===
        JSON.stringify(channels[channel])
      )
        continue;
      this.artworkFramer.resetChannel(channel);
      const pending = this.artworkPending.get(channel);
      if (pending) {
        clearTimeout(pending.timer);
        if (pending.url) URL.revokeObjectURL(pending.url);
        this.artworkPending.delete(channel);
      }
      const previous = artworkUrls[channel];
      if (previous) URL.revokeObjectURL(previous);
      artworkUrls[channel] = null;
      changed = true;
    }
    this.artworkChannels = channels;
    if (changed) this.publish({ artworkUrls });
  }

  private receiveArtwork(frame: Uint8Array, core: SendspinCore): void {
    try {
      const event = this.artworkFramer.push(frame);
      if (!event) return;
      const pending = this.artworkPending.get(event.channel);
      if (pending) {
        clearTimeout(pending.timer);
        if (pending.url) URL.revokeObjectURL(pending.url);
        this.artworkPending.delete(event.channel);
      }
      if (event.kind === "cancel") return;
      const format = this.artworkChannels[event.channel]?.format;
      const mime = format === "png" ? "image/png" : "image/jpeg";
      const url = event.bytes.length
        ? URL.createObjectURL(
            new Blob([new Uint8Array(event.bytes)], { type: mime }),
          )
        : null;
      const apply = () => {
        this.artworkPending.delete(event.channel);
        const artworkUrls = [...this.snapshot.artworkUrls];
        const previous = artworkUrls[event.channel];
        if (previous) URL.revokeObjectURL(previous);
        artworkUrls[event.channel] = url;
        this.publish({ artworkUrls });
      };
      const waitMs = Math.max(
        0,
        (event.timestampUs - core.getCurrentServerTimeUs()) / 1000,
      );
      if (waitMs <= 0) apply();
      else {
        const timer = setTimeout(apply, Math.min(waitMs, 2147483647));
        this.artworkPending.set(event.channel, { timer, url });
      }
    } catch (error) {
      this.publish({ error: `Invalid Sendspin artwork: ${String(error)}` });
      core.disconnect("restart");
    }
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.connecting) return;
    this.connecting = true;
    this.clearArtwork();
    this.publish({ status: "connecting", metadata: null, error: null });
    try {
      // The frontend wheel is released before the matching app image. Do not
      // register a display with an older server that cannot pair it privately.
      let capabilities: { api_version?: number; browser_display_pairing?: boolean };
      try {
        capabilities = await api.sendCommand<{
          api_version?: number;
          browser_display_pairing?: boolean;
        }>(
          "sendspin/display_capabilities",
          undefined,
          { suppressGlobalError: true },
        );
      } catch {
        if (!this.stopped) this.publish({ status: "unsupported" });
        return;
      }
      if (this.stopped) return;
      if (
        capabilities?.api_version !== 1 ||
        capabilities.browser_display_pairing !== true
      ) {
        this.publish({ status: "unsupported" });
        return;
      }
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
        supportedRoles: ["metadata@v1", "artwork@v1"],
        artworkWireMode: "legacy",
        artworkChannels: [
          { source: "album", format: "jpeg", width: 640, height: 640 },
          { source: "artist", format: "jpeg", width: 320, height: 320 },
        ],
        clientName: "Music Assistant Display",
        productName: "Music Assistant Display",
        unpairedAccess: false,
        onStateChange: (state) => {
          if (this.core !== core || this.stopped) return;
          this.publish({ metadata: state.serverState.metadata ?? null });
        },
      });
      this.core = core;
      core.onArtworkStreamStart = (config) => {
        if (this.core !== core || this.stopped) return;
        this.startArtworkStream(config.channels);
      };
      core.onArtworkFrame = (frame) => {
        if (this.core === core && !this.stopped)
          this.receiveArtwork(frame, core);
      };
      core.onArtworkStreamEnd = () => {
        if (this.core === core && !this.stopped) this.clearArtwork();
      };
      core.onConnectionClose = () => {
        if (this.core !== core || this.stopped) return;
        this.core = null;
        this.clearArtwork();
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
    this.clearArtwork();
    this.publish({ status: "disconnected", metadata: null });
  }
}
