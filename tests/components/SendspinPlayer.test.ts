import SendspinPlayer from "@/components/SendspinPlayer.vue";
import { BrowserMediaControlsMode } from "@/helpers/device_settings";
import type { MusicAssistantApi } from "@/plugins/api";
import { PlaybackState } from "@/plugins/api/interfaces";
import { webPlayer, WebPlayerMode } from "@/plugins/web_player";
import {
  setWebPlayerAdaptive,
  setWebPlayerBuffer,
  setWebPlayerCodec,
  webPlayerStatus,
} from "@/plugins/web_player_tuning";
import { SETTLE_MS } from "@/plugins/web_player_adaptive";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { originalUserAgentDescriptor } = vi.hoisted(() => {
  const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(
    navigator,
    "userAgent",
  );
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "iPhone",
  });
  return { originalUserAgentDescriptor };
});

afterAll(() => {
  if (originalUserAgentDescriptor) {
    Object.defineProperty(navigator, "userAgent", originalUserAgentDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "userAgent");
  }
});

// Only the fields the component and the timing helper read are mocked.
interface MockPlayer {
  player_id?: string;
  active_source?: string;
  playback_state?: PlaybackState;
  synced_to?: string;
  group_members: string[];
}

interface MockQueue {
  queue_id: string;
  state?: PlaybackState;
  active?: boolean;
  items?: number;
  current_item?: { extra_attributes?: { playback_speed?: number } };
}

const {
  authState,
  apiMock,
  storeMock,
  mockPlayerCommandNext,
  mockPlayerCommandPause,
  mockPlayerCommandPlay,
  mockPlayerCommandPrevious,
  mockPlayerCommandSeek,
  mockPrepareSendspinSession,
  mockRegisterWebPlayerAudioUnlock,
  mockSendCommand,
  mockSendspinConnect,
  mockSendspinDisconnect,
  mockSendspinUnlock,
  mockUseMediaBrowserMetaData,
  mockSetMinBufferMs,
  mockSetRequiredLeadTimeMs,
  mockGetPlayerConfigEntries,
  mockSavePlayerConfig,
  connectionState,
  routeState,
  sendspinState,
} = vi.hoisted(() => {
  const mockPlayerCommandNext = vi.fn<MusicAssistantApi["playerCommandNext"]>();
  const mockPlayerCommandPause =
    vi.fn<MusicAssistantApi["playerCommandPause"]>();
  const mockPlayerCommandPlay = vi.fn<MusicAssistantApi["playerCommandPlay"]>();
  const mockPlayerCommandPrevious =
    vi.fn<MusicAssistantApi["playerCommandPrevious"]>();
  const mockPlayerCommandSeek = vi.fn<MusicAssistantApi["playerCommandSeek"]>();
  const mockSendCommand = vi.fn<MusicAssistantApi["sendCommand"]>();
  const mockGetPlayerConfigEntries = vi.fn(
    async (): Promise<
      Array<{ key: string; options: Array<{ value: unknown }> }>
    > => [],
  );
  const mockSavePlayerConfig = vi.fn(async () => ({}));
  return {
    mockGetPlayerConfigEntries,
    mockSavePlayerConfig,
    authState: {
      guest: null as "music_quiz" | "party" | null,
    },
    // Mutable so tests can drive the players/queues the seek handlers read.
    apiMock: {
      players: {} as Record<string, MockPlayer>,
      queues: {} as Record<string, MockQueue>,
      queueElapsedTime: {} as Record<
        string,
        { elapsed_time?: number; elapsed_time_last_updated?: number }
      >,
      playerCommandNext: mockPlayerCommandNext,
      playerCommandPause: mockPlayerCommandPause,
      playerCommandPlay: mockPlayerCommandPlay,
      playerCommandPrevious: mockPlayerCommandPrevious,
      playerCommandSeek: mockPlayerCommandSeek,
      sendCommand: mockSendCommand,
      getPlayerConfigEntries: mockGetPlayerConfigEntries,
      savePlayerConfig: mockSavePlayerConfig,
    },
    storeMock: {
      activePlayerId: "active-player",
      activePlayer: undefined as MockPlayer | undefined,
    },
    mockPlayerCommandNext,
    mockPlayerCommandPause,
    mockPlayerCommandPlay,
    mockPlayerCommandPrevious,
    mockPlayerCommandSeek,
    mockPrepareSendspinSession: vi.fn(),
    mockRegisterWebPlayerAudioUnlock: vi.fn<(handler: () => boolean) => void>(),
    mockSendCommand,
    mockSendspinConnect: vi.fn<() => Promise<void>>(),
    mockSendspinDisconnect: vi.fn<(reason?: string) => void>(),
    mockSendspinUnlock: vi.fn<() => Promise<void>>(),
    sendspinState: {
      pairingToken: null as string | null,
      syncInfo: { resyncCount: 0, syncErrorMs: 0 },
      lastOptions: null as {
        codecs?: string[];
        minBufferMs?: number;
        requiredLeadTimeMs?: number;
        latencyHint?: string;
        onStateChange?: (state: {
          isPlaying: boolean;
          volume: number;
          muted: boolean;
          playerState: "synchronized" | "error";
        }) => void;
        reconnect?: { onReconnected?: () => void };
      } | null,
    },
    mockUseMediaBrowserMetaData: vi.fn(() => vi.fn()),
    mockSetMinBufferMs: vi.fn<(ms: number) => void>(),
    mockSetRequiredLeadTimeMs: vi.fn<(ms: number) => void>(),
    connectionState: { direct: true },
    routeState: {
      current: null as { meta: Record<string, unknown> } | null,
    },
  };
});

vi.mock("@/helpers/useMediaBrowserMetaData", () => ({
  useMediaBrowserMetaData: mockUseMediaBrowserMetaData,
}));

vi.mock("@/plugins/auth", () => ({
  default: {
    isGuestAccessSession: () => authState.guest !== null,
    isMusicQuizGuest: () => authState.guest === "music_quiz",
    isPartyGuest: () => authState.guest === "party",
  },
}));

vi.mock("vue-router", async () => {
  const { shallowReactive } =
    await vi.importActual<typeof import("vue")>("vue");
  routeState.current = shallowReactive({ meta: {} });
  return {
    useRoute: () => routeState.current,
  };
});

vi.mock("@/plugins/api", () => ({
  default: apiMock,
}));

vi.mock("@/plugins/store", () => ({
  store: storeMock,
}));

vi.mock("@/plugins/web_player", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  return {
    WebPlayerMode: {
      DISABLED: "disabled",
      CONTROLS_ONLY: "controls_only",
      SENDSPIN_ONLY: "sendspin_only",
      SENDSPIN_WITH_CONTROLS: "sendspin_with_controls",
    },
    clearWebPlayerAudioUnlock: vi.fn(),
    isPlaybackMode: (mode: string) =>
      mode === "sendspin_only" || mode === "sendspin_with_controls",
    registerWebPlayerAudioUnlock: mockRegisterWebPlayerAudioUnlock,
    webPlayer: reactive({
      browserControlsMode: "web_player",
      interacted: false,
      mode: "sendspin_only",
      tabMode: "sendspin_only",
    }),
  };
});

vi.mock("@/plugins/sendspin-connection", () => ({
  isDirectConnection: () => connectionState.direct,
  prepareSendspinSession: mockPrepareSendspinSession,
}));

vi.mock("@/plugins/api/helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/plugins/api/helpers")>()),
  getDeviceName: () => "Browser",
}));

vi.mock("@sendspin/sendspin-js", () => ({
  SendspinPlayer: class {
    constructor(options: (typeof sendspinState)["lastOptions"]) {
      sendspinState.lastOptions = options;
    }
    connect = mockSendspinConnect;
    get pairingToken() {
      return sendspinState.pairingToken;
    }
    get syncInfo() {
      return sendspinState.syncInfo;
    }
    disconnect = mockSendspinDisconnect;
    setCorrectionMode = vi.fn();
    setMinBufferMs = mockSetMinBufferMs;
    setRequiredLeadTimeMs = mockSetRequiredLeadTimeMs;
    setMuted = vi.fn();
    setVolume = vi.fn();
    unlock = mockSendspinUnlock;
  },
}));

type ActionHandler = ((details: MediaSessionActionDetails) => void) | null;

const handlers = new Map<MediaSessionAction, ActionHandler>();
const mediaSession = {
  metadata: {} as MediaMetadata | null,
  playbackState: "playing" as MediaSessionPlaybackState,
  setActionHandler: vi.fn(
    (action: MediaSessionAction, handler: ActionHandler) => {
      handlers.set(action, handler);
    },
  ),
  setPositionState: vi.fn(),
};

const actions: MediaSessionAction[] = [
  "play",
  "pause",
  "nexttrack",
  "previoustrack",
  "seekto",
  "seekforward",
  "seekbackward",
];

// epoch seconds the fake clock starts at; timestamps below are relative to this
const ANCHOR = 1_700_000_000;

describe("SendspinPlayer MediaSession", () => {
  beforeEach(() => {
    authState.guest = null;
    handlers.clear();
    mediaSession.metadata = {} as MediaMetadata;
    mediaSession.playbackState = "playing";
    mediaSession.setActionHandler.mockClear();
    mediaSession.setActionHandler.mockImplementation((action, handler) => {
      handlers.set(action, handler);
    });
    mediaSession.setPositionState.mockClear();
    mockPrepareSendspinSession.mockReset();
    mockPrepareSendspinSession.mockReturnValue(new Promise(() => {}));
    mockUseMediaBrowserMetaData.mockClear();
    mockPlayerCommandNext.mockReset();
    mockPlayerCommandPause.mockReset();
    mockPlayerCommandPlay.mockReset();
    mockPlayerCommandPrevious.mockReset();
    mockPlayerCommandSeek.mockReset();
    mockRegisterWebPlayerAudioUnlock.mockClear();
    mockSendCommand.mockReset();
    mockSendCommand.mockResolvedValue(undefined);
    mockSendspinConnect.mockReset();
    mockSendspinConnect.mockResolvedValue(undefined);
    mockSendspinDisconnect.mockReset();
    sendspinState.pairingToken = "SP:0TESTTOKEN";
    sendspinState.lastOptions = null;
    mockSendspinUnlock.mockReset();
    mockSendspinUnlock.mockResolvedValue(undefined);
    webPlayer.interacted = false;
    webPlayer.browserControlsMode = BrowserMediaControlsMode.WEB_PLAYER;
    webPlayer.mode = WebPlayerMode.SENDSPIN_ONLY;
    webPlayer.tabMode = WebPlayerMode.SENDSPIN_ONLY;
    if (routeState.current) routeState.current.meta = {};
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: mediaSession,
    });
    vi.stubGlobal("localStorage", createStorage());
    apiMock.players = {
      "web-player": {
        player_id: "web-player",
        playback_state: PlaybackState.PLAYING,
        active_source: "queue",
        group_members: [],
      },
    };
    apiMock.queues = { queue: { queue_id: "queue", active: true, items: 1 } };
    apiMock.queueElapsedTime = { queue: { elapsed_time: 30 } };
    storeMock.activePlayer = {
      player_id: "active-player",
      playback_state: PlaybackState.PLAYING,
      group_members: [],
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["party", "music_quiz"] as const)(
    "keeps %s guests receive-only",
    (guest) => {
      authState.guest = guest;
      seedStaleMediaSession();

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });

      expect(mediaSession.metadata).toBeNull();
      expect(mediaSession.playbackState).toBe("none");
      expect(mediaSession.setPositionState).toHaveBeenCalledWith();
      expect(mockUseMediaBrowserMetaData).not.toHaveBeenCalled();
      expect(actions.every((action) => handlers.get(action) === null)).toBe(
        true,
      );

      invokeAllActions();
      expectPlayerCommandsNotCalled();
      wrapper.unmount();
    },
  );

  // opus decoding falls back to the bundled opus-encdec WASM build when
  // WebCodecs is missing. That package was last published in 2021 and decodes
  // untrusted audio, so opus must only be requested when the browser can
  // decode it natively.
  const withAudioDecoder = (present: boolean) => {
    const key = "AudioDecoder" as keyof typeof globalThis;
    const had = key in globalThis;
    const previous = (globalThis as Record<string, unknown>).AudioDecoder;
    if (present) {
      (globalThis as Record<string, unknown>).AudioDecoder = class {};
    } else {
      delete (globalThis as Record<string, unknown>).AudioDecoder;
    }
    return () => {
      if (had) (globalThis as Record<string, unknown>).AudioDecoder = previous;
      else delete (globalThis as Record<string, unknown>).AudioDecoder;
    };
  };
  it("asks for opus when the browser decodes it natively", async () => {
    const restore = withAudioDecoder(true);
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();
    expect(sendspinState.lastOptions?.codecs).toEqual(["opus", "flac"]);
    wrapper.unmount();
    restore();
  });
  it("never asks for opus without a native decoder", async () => {
    // the insecure-context case: a Home Assistant app reached over plain http
    // on a LAN address, where WebCodecs is unavailable. Safari advertises opus
    // regardless, so the request itself has to exclude it. pcm is in the list
    // because Safari has no flac support.
    const restore = withAudioDecoder(false);
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();
    expect(sendspinState.lastOptions?.codecs).toEqual(["flac", "pcm"]);
    expect(sendspinState.lastOptions?.codecs).not.toContain("opus");
    wrapper.unmount();
    restore();
  });

  it("buffers 0.5 s on the LAN and 2.5 s over a remote link", async () => {
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    connectionState.direct = true;
    let wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();
    expect(sendspinState.lastOptions).toMatchObject({
      minBufferMs: 500,
      requiredLeadTimeMs: 250,
    });
    wrapper.unmount();

    // the Home Assistant ingress proxy, a phone on cellular
    connectionState.direct = false;
    wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();
    expect(sendspinState.lastOptions).toMatchObject({
      minBufferMs: 2500,
      requiredLeadTimeMs: 1000,
    });
    wrapper.unmount();
    connectionState.direct = true;
  });

  it("applies a chosen buffer to the running player and restarts it for a codec", async () => {
    const restore = withAudioDecoder(true);
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();
    expect(mockSendspinConnect).toHaveBeenCalledTimes(1);

    setWebPlayerBuffer(5000);
    await nextTick();
    expect(mockSetMinBufferMs).toHaveBeenCalledWith(5000);
    expect(mockSetRequiredLeadTimeMs).toHaveBeenCalledWith(1000);
    expect(mockSendspinDisconnect).not.toHaveBeenCalled();

    // the codecs are advertised at creation, so a new choice means a
    // new session with the choice first and the automatic set behind it
    setWebPlayerCodec("pcm");
    await flushPromises();
    expect(mockSendspinDisconnect).toHaveBeenCalledWith("restart");
    expect(mockSendspinConnect).toHaveBeenCalledTimes(2);
    expect(sendspinState.lastOptions?.codecs).toEqual(["pcm", "opus", "flac"]);
    expect(sendspinState.lastOptions?.minBufferMs).toBe(5000);

    setWebPlayerBuffer(0);
    setWebPlayerCodec("auto");
    await flushPromises();
    wrapper.unmount();
    restore();
  });

  it("switches the codec on the server when it offers it, without a restart", async () => {
    const restore = withAudioDecoder(true);
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    mockGetPlayerConfigEntries.mockResolvedValue([
      {
        key: "preferred_sendspin_format",
        options: [
          { value: "automatic" },
          { value: "opus:48000:16:2" },
          { value: "flac:48000:16:2" },
        ],
      },
      { key: "sendspin_opus_bitrate", options: [] },
    ]);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();

    setWebPlayerCodec("flac");
    await flushPromises();
    expect(mockSavePlayerConfig).toHaveBeenCalledWith("web-player", {
      preferred_sendspin_format: "flac:48000:16:2",
      sendspin_opus_bitrate: 0,
    });
    expect(mockSendspinDisconnect).not.toHaveBeenCalled();

    setWebPlayerCodec("auto");
    await flushPromises();
    mockGetPlayerConfigEntries.mockResolvedValue([]);
    wrapper.unmount();
    restore();
  });

  it("steps down the ladder when the stream keeps resyncing", async () => {
    vi.useFakeTimers();
    try {
      const restore = withAudioDecoder(true);
      mockPrepareSendspinSession.mockResolvedValue(undefined);
      mockGetPlayerConfigEntries.mockResolvedValue([
        {
          key: "preferred_sendspin_format",
          options: [{ value: "automatic" }, { value: "opus:48000:16:2" }],
        },
        { key: "sendspin_opus_bitrate", options: [] },
      ]);
      setWebPlayerAdaptive("on");
      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      await flushPromises();
      expect(webPlayerStatus.adaptive).toBe(true);

      // let the stream settle, then two resyncs a few seconds apart
      await vi.advanceTimersByTimeAsync(SETTLE_MS + 2_000);
      sendspinState.syncInfo = { resyncCount: 1, syncErrorMs: 0 };
      await vi.advanceTimersByTimeAsync(2_000);
      sendspinState.syncInfo = { resyncCount: 2, syncErrorMs: 0 };
      await vi.advanceTimersByTimeAsync(2_000);
      await flushPromises();

      expect(webPlayerStatus.rung).toBe(1);
      // rung 1: opus at 128 kb/s on the server, a 2.5 s buffer on the player
      expect(mockSavePlayerConfig).toHaveBeenLastCalledWith("web-player", {
        preferred_sendspin_format: "opus:48000:16:2",
        sendspin_opus_bitrate: 128000,
      });
      expect(mockSetMinBufferMs).toHaveBeenLastCalledWith(2500);

      // off puts the user's own choices back
      setWebPlayerAdaptive("off");
      await flushPromises();
      expect(webPlayerStatus.rung).toBe(0);
      expect(mockSetMinBufferMs).toHaveBeenLastCalledWith(500);

      setWebPlayerAdaptive("auto");
      sendspinState.syncInfo = { resyncCount: 0, syncErrorMs: 0 };
      mockGetPlayerConfigEntries.mockResolvedValue([]);
      wrapper.unmount();
      restore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts adaptive mode on the rung the connection type suggests and follows changes", async () => {
    vi.useFakeTimers();
    const nav = navigator as { connection?: unknown };
    const listeners = new Set<() => void>();
    const connection = {
      effectiveType: "3g",
      saveData: false,
      rtt: 400,
      addEventListener: (_: string, handler: () => void) =>
        listeners.add(handler),
      removeEventListener: (_: string, handler: () => void) =>
        listeners.delete(handler),
    };
    nav.connection = connection;
    try {
      const restore = withAudioDecoder(true);
      mockPrepareSendspinSession.mockResolvedValue(undefined);
      mockGetPlayerConfigEntries.mockResolvedValue([
        {
          key: "preferred_sendspin_format",
          options: [{ value: "automatic" }, { value: "opus:48000:16:2" }],
        },
        { key: "sendspin_opus_bitrate", options: [] },
      ]);
      setWebPlayerAdaptive("on");
      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      await flushPromises();
      // 3G: the middle rung before any dropout
      expect(webPlayerStatus.rung).toBe(2);
      expect(listeners.size).toBe(1);
      expect(mockSetMinBufferMs).toHaveBeenLastCalledWith(5000);
      // the test user agent counts as a phone: the power-friendly hint
      expect(sendspinState.lastOptions?.latencyHint).toBe("playback");

      // the phone drops to 2G: the last rung at once
      connection.effectiveType = "2g";
      for (const handler of listeners) handler();
      await flushPromises();
      expect(webPlayerStatus.rung).toBe(3);

      // back on 4G nothing moves up; that is the quiet timer's call
      connection.effectiveType = "4g";
      connection.rtt = 50;
      for (const handler of listeners) handler();
      await flushPromises();
      expect(webPlayerStatus.rung).toBe(3);

      // off puts the rung back so later mounts start clean
      setWebPlayerAdaptive("off");
      await flushPromises();
      expect(webPlayerStatus.rung).toBe(0);
      setWebPlayerAdaptive("auto");
      mockGetPlayerConfigEntries.mockResolvedValue([]);
      wrapper.unmount();
      expect(listeners.size).toBe(0);
      restore();
    } finally {
      delete nav.connection;
      vi.useRealTimers();
    }
  });

  it("keeps Sendspin audio hidden behind custom controls", () => {
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });

    const audioElements = wrapper.findAll("audio");
    expect(audioElements).toHaveLength(2);
    expect(
      audioElements.every((audio) => !("controls" in audio.attributes())),
    ).toBe(true);
    wrapper.unmount();
  });

  it("unlocks iOS audio once the Sendspin player is ready", async () => {
    let resolvePrepare!: () => void;
    mockPrepareSendspinSession.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    const unlockAudio = getAudioUnlockHandler();

    expect(unlockAudio()).toBe(false);
    expect(mockSendspinUnlock).not.toHaveBeenCalled();

    resolvePrepare();
    await flushPromises();

    expect(unlockAudio()).toBe(true);
    expect(mockSendspinUnlock).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("hands the server its pairing token once connected", async () => {
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();

    expect(mockSendCommand).toHaveBeenCalledWith(
      "sendspin/pair_web_player",
      { pairing_token: "SP:0TESTTOKEN" },
      { suppressGlobalError: true },
    );
    wrapper.unmount();
  });

  it("re-pairs after the sendspin transport reconnects on its own", async () => {
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();
    mockSendCommand.mockClear();

    // The server may have dropped the pairing while we were away (guest
    // pairings are removed on disconnect), so a reconnect pairs again.
    sendspinState.lastOptions?.reconnect?.onReconnected?.();

    expect(mockSendCommand).toHaveBeenCalledWith(
      "sendspin/pair_web_player",
      { pairing_token: "SP:0TESTTOKEN" },
      { suppressGlobalError: true },
    );
    wrapper.unmount();
  });

  it("keeps the player registered while another tab takes over playback", async () => {
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();

    // Only this tab steps back; the browser still wants a player.
    webPlayer.tabMode = WebPlayerMode.CONTROLS_ONLY;
    wrapper.unmount();

    expect(mockSendspinDisconnect).toHaveBeenCalledWith("restart");
  });

  it("unregisters the player once this browser wants none", async () => {
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();

    webPlayer.mode = WebPlayerMode.CONTROLS_ONLY;
    webPlayer.tabMode = WebPlayerMode.CONTROLS_ONLY;
    wrapper.unmount();

    expect(mockSendspinDisconnect).toHaveBeenCalledWith("user_request");
  });

  it("does not connect a player when unmounted while the session is prepared", async () => {
    let resolvePrepare!: () => void;
    mockPrepareSendspinSession.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePrepare = resolve;
      }),
    );
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });

    wrapper.unmount();
    resolvePrepare();
    await flushPromises();

    // A player connected here would never be disconnected again.
    expect(mockSendspinConnect).not.toHaveBeenCalled();
  });

  it("skips pairing when the client has no pairing token", async () => {
    sendspinState.pairingToken = null;
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();

    expect(mockSendCommand).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("logs rejected iOS audio unlocks", async () => {
    const error = new Error("unlock failed");
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    mockSendspinUnlock.mockRejectedValue(error);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();

    expect(getAudioUnlockHandler()()).toBe(true);
    await flushPromises();

    expect(debugSpy).toHaveBeenCalledWith(
      "Sendspin: failed to prime audio for listen-in",
      error,
    );
    wrapper.unmount();
  });

  it("clears stale guest state again when the player mode changes", async () => {
    authState.guest = "music_quiz";
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    seedStaleMediaSession();

    webPlayer.tabMode = WebPlayerMode.SENDSPIN_WITH_CONTROLS;
    await nextTick();

    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe("none");
    expect(actions.every((action) => handlers.get(action) === null)).toBe(true);
    invokeAllActions();
    expectPlayerCommandsNotCalled();
    wrapper.unmount();
  });

  it("disables controls while a signed-in user plays along", async () => {
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    seedStaleMediaSession();

    if (routeState.current) {
      routeState.current.meta = { disableMediaSession: true };
    }
    await nextTick();

    expect(mediaSession.metadata).toBeNull();
    expect(mediaSession.playbackState).toBe("none");
    expect(actions.every((action) => handlers.get(action) === null)).toBe(true);
    invokeAllActions();
    expectPlayerCommandsNotCalled();

    if (routeState.current) routeState.current.meta = {};
    await nextTick();

    expect(mockUseMediaBrowserMetaData).toHaveBeenCalledTimes(2);
    invokeAction("play");
    expect(mockPlayerCommandPlay).toHaveBeenCalledWith("web-player");
    wrapper.unmount();
  });

  it("does not enable controls without MediaSession support", async () => {
    if (routeState.current) {
      routeState.current.meta = { disableMediaSession: true };
    }
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: undefined,
    });
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });

    if (routeState.current) routeState.current.meta = {};
    await nextTick();

    expect(mockUseMediaBrowserMetaData).not.toHaveBeenCalled();
    expectPlayerCommandsNotCalled();
    wrapper.unmount();
  });

  it.each(["party", "music_quiz"] as const)(
    "does not require MediaSession for %s guests",
    async (guest) => {
      authState.guest = guest;
      Object.defineProperty(navigator, "mediaSession", {
        configurable: true,
        value: undefined,
      });

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      webPlayer.tabMode = WebPlayerMode.SENDSPIN_WITH_CONTROLS;
      await nextTick();

      wrapper.unmount();
      expectPlayerCommandsNotCalled();
    },
  );

  it("registers existing controls for normal users", () => {
    vi.useFakeTimers();
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });

    invokeAction("play");
    invokeAction("pause");
    invokeAction("nexttrack");
    invokeAction("previoustrack");
    invokeAction("seekto", { seekTime: 12.6 });
    vi.advanceTimersByTime(250);

    expect(mockUseMediaBrowserMetaData).toHaveBeenCalledWith("web-player");
    expect(mockPlayerCommandPlay).toHaveBeenCalledWith("web-player");
    expect(mockPlayerCommandPause).toHaveBeenCalledWith("web-player");
    expect(mockPlayerCommandNext).toHaveBeenCalledWith("web-player");
    expect(mockPlayerCommandPrevious).toHaveBeenCalledWith("web-player");
    expect(mockPlayerCommandSeek).toHaveBeenCalledWith("web-player", 13);

    wrapper.unmount();
    expect(actions.every((action) => handlers.get(action) === null)).toBe(true);
  });

  it("ignores play while the web player's queue is empty", () => {
    apiMock.players["web-player"].playback_state = PlaybackState.IDLE;
    apiMock.queues.queue.items = 0;

    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    invokeAction("play");

    expect(mockPlayerCommandPlay).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("limits built-in-only controls to the web player", () => {
    webPlayer.browserControlsMode = BrowserMediaControlsMode.WEB_PLAYER;
    apiMock.players["web-player"].playback_state = PlaybackState.PAUSED;

    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    invokeAction("play");

    expect(mockUseMediaBrowserMetaData).toHaveBeenCalledWith("web-player");
    expect(mockPlayerCommandPlay).toHaveBeenCalledWith("web-player");
    wrapper.unmount();
  });

  it("reports the web player paused while its stream is still open", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    mockPrepareSendspinSession.mockResolvedValue(undefined);
    webPlayer.interacted = true;
    apiMock.players["web-player"].playback_state = PlaybackState.PAUSED;

    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    await flushPromises();
    // The library only drops isPlaying on stream/end, which a pause does not send.
    sendspinState.lastOptions?.onStateChange?.({
      isPlaying: true,
      volume: 100,
      muted: false,
      playerState: "synchronized",
    });
    await nextTick();

    expect(mediaSession.playbackState).toBe("paused");
    wrapper.unmount();
  });

  it("targets the selected player when that mode is enabled", () => {
    webPlayer.browserControlsMode = BrowserMediaControlsMode.ACTIVE_PLAYER;

    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    invokeAction("play");

    expect(mockUseMediaBrowserMetaData).toHaveBeenCalledWith(undefined);
    expect(mockPlayerCommandPlay).toHaveBeenCalledWith("active-player");
    wrapper.unmount();
  });

  it("starts selected-player controls when their mode becomes active", async () => {
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    webPlayer.interacted = true;
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    playSpy.mockClear();

    webPlayer.browserControlsMode = BrowserMediaControlsMode.ACTIVE_PLAYER;
    await nextTick();

    expect(playSpy).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("starts selected-player controls after the first interaction", async () => {
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    webPlayer.browserControlsMode = BrowserMediaControlsMode.ACTIVE_PLAYER;
    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });
    playSpy.mockClear();

    webPlayer.interacted = true;
    await nextTick();

    expect(playSpy).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it("clears media controls when they are disabled", () => {
    webPlayer.browserControlsMode = BrowserMediaControlsMode.DISABLED;
    seedStaleMediaSession();

    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });

    expect(mockUseMediaBrowserMetaData).not.toHaveBeenCalled();
    expect(mediaSession.metadata).toBeNull();
    expect(actions.every((action) => handlers.get(action) === null)).toBe(true);
    invokeAllActions();
    expectPlayerCommandsNotCalled();
    wrapper.unmount();
  });

  it("continues clearing actions when an action is unsupported", () => {
    authState.guest = "party";
    mediaSession.setActionHandler.mockImplementation((action, handler) => {
      if (action === "seekforward") {
        throw new DOMException("Unsupported", "NotSupportedError");
      }
      handlers.set(action, handler);
    });

    const wrapper = mount(SendspinPlayer, {
      props: { playerId: "web-player" },
    });

    expect(handlers.get("seekbackward")).toBeNull();
    wrapper.unmount();
  });

  // Registering seekforward/seekbackward is skipped on iOS/Mac (see
  // registerMediaSessionActionHandlers), so these override the file-wide
  // "iPhone" user agent to exercise the handlers.
  describe("seekforward/seekbackward extrapolation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(ANCHOR * 1000);
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "Android",
      });
    });

    afterEach(() => {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: "iPhone",
      });
    });

    it("seeks forward from the extrapolated (displayed) position at 2x speed", () => {
      seedPlayingQueue({ elapsed_time: 30, secondsAgo: 3, playback_speed: 2 });

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekforward", { seekOffset: 10 });

      // Displayed position is 30 + 3s * 2x = 36, so a +10s skip lands on 46;
      // the raw stored position would give 40.
      expect(mockPlayerCommandSeek).toHaveBeenCalledWith("web-player", 46);
      wrapper.unmount();
    });

    it("seeks backward from the extrapolated (displayed) position at 2x speed", () => {
      seedPlayingQueue({ elapsed_time: 30, secondsAgo: 3, playback_speed: 2 });

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekbackward", { seekOffset: 10 });

      expect(mockPlayerCommandSeek).toHaveBeenCalledWith("web-player", 26);
      wrapper.unmount();
    });

    it("clamps seekbackward at 0 instead of going negative", () => {
      seedPlayingQueue({ elapsed_time: 2, secondsAgo: 1, playback_speed: 2 });

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekbackward", { seekOffset: 10 });

      // Displayed position is 2 + 1s * 2x = 4; 4 - 10 would go negative.
      expect(mockPlayerCommandSeek).toHaveBeenCalledWith("web-player", 0);
      wrapper.unmount();
    });

    it("chains repeated seekforward presses off the previous target instead of re-resolving", () => {
      seedPlayingQueue({ elapsed_time: 30, secondsAgo: 3, playback_speed: 2 });

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekforward", { seekOffset: 10 });
      expect(mockPlayerCommandSeek).toHaveBeenLastCalledWith("web-player", 46);

      // Resolving the position again instead of chaining would land on 16 here.
      apiMock.queueElapsedTime.queue.elapsed_time = 0;
      invokeAction("seekforward", { seekOffset: 10 });
      expect(mockPlayerCommandSeek).toHaveBeenLastCalledWith("web-player", 56);

      wrapper.unmount();
    });

    it("resolves the position again once the chained seek position expires", () => {
      seedPlayingQueue({ elapsed_time: 30, secondsAgo: 3, playback_speed: 2 });

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekforward", { seekOffset: 10 });
      expect(mockPlayerCommandSeek).toHaveBeenLastCalledWith("web-player", 46);

      vi.advanceTimersByTime(2000);

      // Displayed position is now 30 + 5s * 2x = 40, so the skip lands on 50;
      // chaining off the previous target would give 56.
      invokeAction("seekforward", { seekOffset: 10 });
      expect(mockPlayerCommandSeek).toHaveBeenLastCalledWith("web-player", 50);

      wrapper.unmount();
    });

    it("seeks relative to the target player, not the active player", () => {
      // The web player is listening in at 36s while the selected player, whose
      // metadata the media session would otherwise follow, sits at 500s.
      seedPlayingQueue({ elapsed_time: 30, secondsAgo: 3, playback_speed: 2 });
      apiMock.players["active-player"] = {
        player_id: "active-player",
        playback_state: PlaybackState.PLAYING,
        active_source: "other-queue",
        group_members: [],
      };
      apiMock.queues["other-queue"] = {
        queue_id: "other-queue",
        state: PlaybackState.PLAYING,
        active: true,
      };
      apiMock.queueElapsedTime["other-queue"] = {
        elapsed_time: 500,
        elapsed_time_last_updated: ANCHOR,
      };
      storeMock.activePlayer = apiMock.players["active-player"];

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekforward", { seekOffset: 10 });

      // The active player's position would give 510.
      expect(mockPlayerCommandSeek).toHaveBeenCalledWith("web-player", 46);
      wrapper.unmount();
    });

    it("does not seek when no timing source is available", () => {
      apiMock.queues = {};
      apiMock.queueElapsedTime = {};

      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekforward", { seekOffset: 10 });
      invokeAction("seekbackward", { seekOffset: 10 });

      expect(mockPlayerCommandSeek).not.toHaveBeenCalled();
      wrapper.unmount();
    });

    it("seeks to the start for a seekto of 0", () => {
      const wrapper = mount(SendspinPlayer, {
        props: { playerId: "web-player" },
      });
      invokeAction("seekto", { seekTime: 0 });

      expect(mockPlayerCommandSeek).toHaveBeenCalledWith("web-player", 0);
      wrapper.unmount();
    });
  });
});

function getAudioUnlockHandler(): () => boolean {
  const handler = mockRegisterWebPlayerAudioUnlock.mock.calls.at(-1)?.[0];
  if (!handler) throw new Error("Audio unlock handler was not registered");
  return handler;
}

/**
 * Set the queue the web player is attached to playing at the given position.
 */
function seedPlayingQueue(timing: {
  elapsed_time: number;
  secondsAgo: number;
  playback_speed: number;
}): void {
  apiMock.queues.queue = {
    queue_id: "queue",
    state: PlaybackState.PLAYING,
    active: true,
    items: 1,
    current_item: {
      extra_attributes: { playback_speed: timing.playback_speed },
    },
  };
  apiMock.queueElapsedTime.queue = {
    elapsed_time: timing.elapsed_time,
    elapsed_time_last_updated: ANCHOR - timing.secondsAgo,
  };
}

function seedStaleMediaSession(): void {
  mediaSession.metadata = {} as MediaMetadata;
  mediaSession.playbackState = "playing";
  for (const action of actions) {
    handlers.set(action, () => {
      mockPlayerCommandPlay("stale-player");
    });
  }
}

function invokeAction(
  action: MediaSessionAction,
  details: Partial<MediaSessionActionDetails> = {},
): void {
  handlers.get(action)?.({
    action,
    ...details,
  } as MediaSessionActionDetails);
}

function invokeAllActions(): void {
  for (const action of actions) invokeAction(action);
}

// isMobileOutput is read once at import, so the desktop variant of the
// component needs a fresh import under a desktop user agent.
describe("SendspinPlayer silent audio on desktop", () => {
  let DesktopSendspinPlayer: typeof SendspinPlayer;
  let desktopWebPlayer: typeof webPlayer;

  beforeAll(async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Macintosh",
    });
    vi.resetModules();
    DesktopSendspinPlayer = (await import("@/components/SendspinPlayer.vue"))
      .default;
    desktopWebPlayer = (await import("@/plugins/web_player")).webPlayer;
  });

  afterAll(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "iPhone",
    });
  });

  beforeEach(() => {
    authState.guest = null;
    mockPrepareSendspinSession.mockReset();
    mockPrepareSendspinSession.mockReturnValue(new Promise(() => {}));
    mockUseMediaBrowserMetaData.mockClear();
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: mediaSession,
    });
    vi.stubGlobal("localStorage", createStorage());
    apiMock.players = {
      "web-player": {
        player_id: "web-player",
        playback_state: PlaybackState.PLAYING,
        active_source: "queue",
        group_members: [],
      },
    };
    apiMock.queues = { queue: { queue_id: "queue", active: true, items: 1 } };
    desktopWebPlayer.interacted = true;
    desktopWebPlayer.browserControlsMode = BrowserMediaControlsMode.WEB_PLAYER;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("backs the web player's media session with the silent audio", () => {
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();

    const wrapper = mount(DesktopSendspinPlayer, {
      props: { playerId: "web-player" },
    });

    expect(playSpy).toHaveBeenCalled();
    wrapper.unmount();
  });
});

function expectPlayerCommandsNotCalled(): void {
  expect(mockPlayerCommandPlay).not.toHaveBeenCalled();
  expect(mockPlayerCommandPause).not.toHaveBeenCalled();
  expect(mockPlayerCommandNext).not.toHaveBeenCalled();
  expect(mockPlayerCommandPrevious).not.toHaveBeenCalled();
  expect(mockPlayerCommandSeek).not.toHaveBeenCalled();
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
