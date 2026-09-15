<template>
  <audio ref="audioRef" class="hidden-audio"></audio>
  <audio
    ref="silentAudioRef"
    class="hidden-audio"
    :src="almostSilentMp3"
    loop
  ></audio>
</template>

<script setup lang="ts">
import { resolveActiveElapsedTime } from "@/helpers/activeElapsedTime";
import { useMediaBrowserMetaData } from "@/helpers/useMediaBrowserMetaData";
import { BrowserMediaControlsMode } from "@/helpers/device_settings";
import {
  isMediaSessionDisabled,
  resetMediaSession,
} from "@/helpers/mediaSession";
import { getDeviceName, resolvePlayerQueue } from "@/plugins/api/helpers";
import { SendspinPlayer } from "@sendspin/sendspin-js";

import almostSilentMp3 from "@/assets/almost_silent.mp3";
import api from "@/plugins/api";
import authManager from "@/plugins/auth";
import { PlaybackState } from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import {
  webPlayer,
  isPlaybackMode,
  registerWebPlayerAudioUnlock,
  clearWebPlayerAudioUnlock,
  WebPlayerMode,
} from "@/plugins/web_player";
import {
  prepareSendspinSession,
  isDirectConnection,
} from "@/plugins/sendspin-connection";
import {
  adaptiveActive,
  resolveBuffer,
  resolveCodecs,
  webPlayerStatus,
  webPlayerTuning,
} from "@/plugins/web_player_tuning";
import {
  installWebPlayerLog,
  logWebPlayerEvent,
} from "@/plugins/web_player_log";
import {
  AdaptiveController,
  connectionTarget,
  LADDER,
  readConnection,
  resolveRung,
  rungForConnection,
} from "@/plugins/web_player_adaptive";
import type { ConfigValueType } from "@/plugins/api/interfaces";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";

// Properties
export interface Props {
  playerId: string;
}
const props = defineProps<Props>();
const route = useRoute();

// Versioned: delays saved before sendspin-js 4.0.0 dropped its 200ms default would replay early.
const SYNC_DELAY_STORAGE_KEY = "frontend.settings.sendspin_static_delay_v2";

const audioRef = ref<HTMLAudioElement>();
const silentAudioRef = ref<HTMLAudioElement>();

// Detect Android for MediaSession workaround
const isAndroid = /android/i.test(navigator.userAgent);
const isIOS =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isMobileOutput = isAndroid || isIOS;

// Sendspin Player instance
let player: SendspinPlayer | null = null;
// Set on teardown, so a session that is still being prepared does not connect a
// player nothing owns.
let unmounted = false;

// iOS only lets audio start inside a user gesture, but listen-in audio starts
// asynchronously (after the server groups this player), so the library would
// otherwise unlock its audio outside the gesture and stay silent.
const primeAudio = () => {
  if (!isIOS) return true;
  if (!player) return false;
  void player.unlock().catch((error) => {
    console.debug("Sendspin: failed to prime audio for listen-in", error);
  });
  return true;
};

// Reactive state
const isPlaying = ref(false);
const volume = ref(100);
const muted = ref(false);
const playerState = ref<"synchronized" | "error">("synchronized");

// Watch for volume/mute changes from UI
watch(volume, (newVolume) => {
  if (player) {
    player.setVolume(newVolume);
  }
});

watch(muted, (newMuted) => {
  if (player) {
    player.setMuted(newMuted);
  }
});

// MediaSession setup for metadata - at top level for proper reactivity
let unsubMetadata: (() => void) | undefined;

// Interval to reset silent audio to avoid audible tone portion
let silentAudioInterval: number | undefined;

// Track seek position for accurate repeated seek forward/backward
let lastSeekPos: number | undefined;
let lastSeekPosTimeout: number | undefined;
const pauseCommandTimeouts = new Set<number>();

const resetLastSeekPos = () => {
  if (lastSeekPosTimeout) clearTimeout(lastSeekPosTimeout);
  lastSeekPosTimeout = window.setTimeout(() => {
    lastSeekPos = undefined;
    lastSeekPosTimeout = undefined;
  }, 2000);
};

// An undefined player ID makes the metadata helper follow the selected player.
const metadataPlayerId = computed(() =>
  webPlayer.browserControlsMode === BrowserMediaControlsMode.WEB_PLAYER
    ? props.playerId
    : undefined,
);
const mediaSessionDisabled = computed(
  () =>
    webPlayer.browserControlsMode === BrowserMediaControlsMode.DISABLED ||
    isMediaSessionDisabled(route, authManager.isGuestAccessSession()),
);

const correctionMode = computed(() => {
  // Only do the more precise but distorting "full" correction when grouped
  const thisPlayer = api.players[props.playerId];
  const isGrouped =
    thisPlayer && (thisPlayer.synced_to || thisPlayer.group_members.length > 0);
  return isGrouped ? "sync" : "quality-local";
});

// Subscribe to metadata immediately (doesn't require user interaction)
watch(
  [metadataPlayerId, mediaSessionDisabled],
  ([newPlayerId, disabled]) => {
    if (unsubMetadata) unsubMetadata();
    if (disabled) {
      resetMediaSession();
      unsubMetadata = undefined;
      return;
    }
    unsubMetadata = useMediaBrowserMetaData(newPlayerId);
  },
  { immediate: true },
);

watch(
  () => webPlayer.tabMode,
  () => {
    if (!mediaSessionDisabled.value) return;
    if (unsubMetadata) {
      unsubMetadata();
      unsubMetadata = undefined;
    }
    resetMediaSession();
  },
  { immediate: true },
);

watch(
  mediaSessionDisabled,
  (disabled) => {
    if (disabled) {
      resetMediaSession();
    } else {
      registerMediaSessionActionHandlers();
    }
  },
  { immediate: true },
);

// On desktop sendspin plays through Web Audio, which is not a media element.
// Once that goes quiet on pause the browser drops the media session and the
// OS gives the media keys to another app. The silent element keeps the
// session alive there too. On mobile the sendspin audio element does that.
const silentAudioBacksSession = computed(
  () => metadataPlayerId.value === undefined || !isMobileOutput,
);

watch(
  [
    () => store.activePlayer?.playback_state,
    () => api.players[props.playerId]?.playback_state,
    mediaSessionDisabled,
    metadataPlayerId,
    silentAudioBacksSession,
    () => webPlayer.interacted,
  ],
  ([activeState, ownState, disabled, targetPlayerId, backs, interacted]) => {
    if (silentAudioInterval) {
      clearInterval(silentAudioInterval);
      silentAudioInterval = undefined;
    }
    if (disabled || !backs || !interacted) {
      silentAudioRef.value?.pause();
      return;
    }
    if (!silentAudioRef.value) return;

    const state = targetPlayerId === undefined ? activeState : ownState;
    if (state === PlaybackState.PLAYING) {
      silentAudioRef.value.play().catch(() => {});
      // Reset to silent portion every 55 seconds to avoid audible tone on loop restart
      silentAudioInterval = window.setInterval(() => {
        if (silentAudioRef.value) silentAudioRef.value.currentTime = 2;
      }, 55000);
    } else if (state === PlaybackState.PAUSED) {
      silentAudioRef.value.pause();
      silentAudioRef.value.currentTime = 2; // Skip to silent portion
    } else {
      silentAudioRef.value.pause();
      silentAudioRef.value.currentTime = 2; // Skip to silent portion
    }
  },
  { immediate: true },
);

// Centralized watcher for playbackState - handles all state changes
watch(
  [
    isPlaying,
    playerState,
    () => store.activePlayer?.playback_state,
    () => api.players[props.playerId]?.playback_state,
    metadataPlayerId,
    () => webPlayer.interacted,
    mediaSessionDisabled,
  ],
  ([, pState, , ownState, metaPlayerId, interacted, disabled]) => {
    if (disabled) {
      resetMediaSession();
      return;
    }
    if (!interacted) return;

    let state: MediaSessionPlaybackState;
    if (metaPlayerId !== undefined) {
      // Web player is the source. Use the server's player state: the library's
      // isPlaying only follows stream start/end, so it can stay true while
      // paused and the OS would then send pause instead of play.
      // Show as paused if player has error.
      const playing = ownState
        ? ownState === PlaybackState.PLAYING
        : isPlaying.value;
      state = playing && pState !== "error" ? "playing" : "paused";
    } else {
      // Active player is the source
      const activeState = store.activePlayer?.playback_state;
      if (activeState === PlaybackState.PLAYING) {
        state = "playing";
      } else if (activeState === PlaybackState.PAUSED) {
        state = "paused";
      } else {
        state = "none";
      }
    }
    navigator.mediaSession.playbackState = state;
  },
  { immediate: true },
);

watch(correctionMode, (mode) => {
  player?.setCorrectionMode(mode);
});

// Hand this client's pairing token to the server so it can pair us without an
// operator step. The server derives the client id from the token itself, and
// ignores the call once we are paired.
const registerPairing = () => {
  const pairingToken = player?.pairingToken;
  if (!pairingToken) return;
  api
    .sendCommand(
      "sendspin/pair_web_player",
      { pairing_token: pairingToken },
      { suppressGlobalError: true },
    )
    .catch((error) => console.warn("Sendspin: auto-pairing failed", error));
};

// what the player negotiated, for the phone layout's menu
function reportFormat() {
  const format = player?.currentFormat ?? null;
  webPlayerStatus.codec = format?.codec ?? null;
  webPlayerStatus.sampleRate = format?.sample_rate ?? null;
}

// Creates the Sendspin player for this browser and connects it. Called on
// mount and again when the codec choice changes, since the codecs are
// advertised when the player is created.
function startPlayer() {
  // Create and initialize player
  if (audioRef.value) {
    const audioElement = isMobileOutput ? audioRef.value : undefined;

    const savedSyncDelay = localStorage.getItem(SYNC_DELAY_STORAGE_KEY);
    const parsed = savedSyncDelay !== null ? parseInt(savedSyncDelay, 10) : NaN;
    const syncDelay = isNaN(parsed) ? undefined : parsed;

    // Prepare session first, then create player with appropriate codecs
    prepareSendspinSession()
      .then(() => {
        if (unmounted) return;

        // Prefer opus for bandwidth efficiency, flac as fallback -- but only
        // ask for opus when the browser can decode it natively.
        //
        // Opus decoding falls back to the bundled `opus-encdec` WASM build
        // when WebCodecs is unavailable, and that package was last published
        // in 2021, is pre-1.0, has a single maintainer and no newer release
        // to move to. It decodes untrusted audio, so the less reachable it
        // is the better. WebCodecs needs a secure context, which a Home
        // Assistant app reached over plain http on a LAN address is not.
        //
        // sendspin-js already drops opus from the advertised set on Chrome
        // and Edge when AudioDecoder is missing, but Safari is special-cased
        // to ["pcm", "opus"] unconditionally -- so on Safari over http opus
        // is negotiated and the WASM decoder is what runs. Asking for
        // flac/pcm instead closes that path in every browser. Safari has no
        // flac support, hence pcm in the fallback list.
        const hasNativeOpus = typeof AudioDecoder !== "undefined";
        const direct = isDirectConnection();
        const codecs = resolveCodecs(webPlayerTuning.codec, hasNativeOpus);
        // the buffer follows the link: the ingress proxy a phone comes in
        // through needs far more cushion than the LAN, and the user can
        // pick a size outright from the phone layout's menu
        const buffer = resolveBuffer(webPlayerTuning.bufferMs, direct);
        webPlayerStatus.direct = direct;
        webPlayerStatus.minBufferMs = buffer.minBufferMs;
        webPlayerStatus.requiredLeadTimeMs = buffer.requiredLeadTimeMs;

        console.debug(
          `Sendspin: Using codecs [${codecs.join(", ")}] and a ${buffer.minBufferMs} ms buffer for ${direct ? "direct" : "remote"} connection`,
        );

        // Use a placeholder URL - the WebSocket interceptor will route through WebRTC
        // The URL just needs to be valid and contain "/sendspin" for the interceptor
        player = new SendspinPlayer({
          baseUrl: "http://sendspin.local",
          audioElement,
          clientName: getDeviceName(),
          // How the server recognizes us as its built-in player rather than a
          // third-party client that has to be paired by hand.
          productName: "Web Player",
          codecs,
          syncDelay,
          requiredLeadTimeMs: buffer.requiredLeadTimeMs,
          // Startup lead the server uses to schedule the first chunk, so it
          // directly delays first audio and must stay small. Once playback is
          // running the buffer grows well beyond this on its own.
          minBufferMs: buffer.minBufferMs,
          // A phone runs a buffered stream, not an instrument: the larger
          // output buffer "playback" asks for survives the WebView being
          // throttled, and the SDK measures and compensates its latency.
          latencyHint: isMobileOutput ? "playback" : undefined,
          onStateChange: (state) => {
            reportFormat();
            if (
              state.isPlaying !== isPlaying.value ||
              state.playerState !== playerState.value
            ) {
              logWebPlayerEvent(
                "info",
                `state ${state.playerState}, ${state.isPlaying ? "playing" : "idle"}, format ${webPlayerStatus.codec ?? "?"} ${webPlayerStatus.sampleRate ?? "?"} Hz`,
              );
            }
            // Update reactive state when player state changes
            isPlaying.value = state.isPlaying;
            volume.value = state.volume;
            muted.value = state.muted;
            playerState.value = state.playerState;
          },
          correctionMode: correctionMode.value,
          onPairing: (event: string, detail?: string) =>
            console.debug(`Sendspin: pairing ${event}`, detail ?? ""),
          onDelayCommand: (delayMs: number) => {
            localStorage.setItem(SYNC_DELAY_STORAGE_KEY, String(delayMs));
          },
          // Recover a sendspin transport that drops on its own (e.g. its socket is
          // idle-timed-out while the main API connection stays up). Drops that also
          // take the main connection down are handled by the web player, which
          // tears this component down and remounts it on reconnect. The interceptor
          // rebuilds a fresh connection per attempt; retries are unbounded so
          // playback recovers whenever connectivity returns, and the loop is torn
          // down with the component on unmount.
          reconnect: {
            baseDelayMs: 1000,
            maxDelayMs: 30000,
            onReconnecting: (attempt: number) =>
              console.debug(`Sendspin: reconnecting (attempt ${attempt})`),
            // Re-pair after a reconnect: the server may have dropped our pairing
            // record in the meantime (guest pairings are removed on disconnect),
            // leaving the new connection unpaired. A no-op while still paired.
            onReconnected: () => {
              console.debug("Sendspin: reconnected");
              registerPairing();
            },
            onExhausted: () =>
              console.warn("Sendspin: reconnect attempts exhausted"),
          },
        });

        return player.connect().then(() => {
          webPlayerStatus.connected = true;
          reportFormat();
          registerPairing();
          startAdaptive();
          // the server keeps a preferred format per player; the bitrate
          // the rung asks for has to be there on every fresh session
          if (effective.value.bitrate || webPlayerStatus.rung > 0) {
            void applyServerFormat(
              effective.value.codec,
              effective.value.bitrate,
            );
          }
        });
      })
      .catch((error) => {
        console.error("Sendspin: Failed to connect", error);
      });
  }
}

// ---- adaptive mode and live settings ----------------------------------------

// what the stream runs with: the user's choices, lowered by the rung the
// adaptive mode is on (rung 0 is the choices themselves)
const effective = computed(() => {
  const direct = webPlayerStatus.direct;
  const chosenBuffer = resolveBuffer(webPlayerTuning.bufferMs, direct);
  const rung = LADDER[webPlayerStatus.rung] ?? LADDER[0];
  const wanted = resolveRung(rung, {
    codec: webPlayerTuning.codec,
    bitrate: webPlayerTuning.bitrate,
    bufferMs: chosenBuffer.minBufferMs,
  });
  return {
    codec: wanted.codec,
    bitrate: wanted.bitrate,
    buffer: resolveBuffer(wanted.bufferMs, direct),
  };
});

// a new buffer applies to the running player
watch(
  () => [
    effective.value.buffer.minBufferMs,
    effective.value.buffer.requiredLeadTimeMs,
  ],
  () => {
    if (!player) return;
    const buffer = effective.value.buffer;
    player.setMinBufferMs(buffer.minBufferMs);
    player.setRequiredLeadTimeMs(buffer.requiredLeadTimeMs);
    webPlayerStatus.minBufferMs = buffer.minBufferMs;
    webPlayerStatus.requiredLeadTimeMs = buffer.requiredLeadTimeMs;
  },
);

// Codec and bitrate are the server's to change: its preferred-format
// setting switches the stream in place, and the app's sendspin_opus_bitrate
// edit adds the bitrate beside it. Returns false when the server does not
// offer the codec for this player (the browser never advertised it), in
// which case the caller restarts the session advertising it first.
async function applyServerFormat(
  codec: (typeof webPlayerTuning)["codec"],
  bitrate: number,
): Promise<boolean> {
  let entries;
  try {
    entries = await api.getPlayerConfigEntries(props.playerId);
  } catch (error) {
    console.warn("Sendspin: cannot read the player settings", error);
    return false;
  }
  const values: Record<string, ConfigValueType> = {};
  const format = entries.find(
    (entry) => entry.key === "preferred_sendspin_format",
  );
  let offered = format === undefined;
  if (format) {
    const option =
      codec === "auto"
        ? "automatic"
        : format.options.find((candidate) =>
            String(candidate.value).startsWith(`${codec}:`),
          )?.value;
    offered = option !== undefined;
    values.preferred_sendspin_format = option ?? "automatic";
  }
  if (entries.some((entry) => entry.key === "sendspin_opus_bitrate")) {
    values.sendspin_opus_bitrate = bitrate;
    webPlayerStatus.bitrate = bitrate;
  }
  if (Object.keys(values).length === 0) return false;
  try {
    await api.savePlayerConfig(props.playerId, values);
  } catch (error) {
    console.warn("Sendspin: cannot save the player settings", error);
    return false;
  }
  return offered;
}

function restartPlayer() {
  if (!player) return;
  logWebPlayerEvent("info", "restarting the player to advertise a codec");
  player.disconnect("restart");
  player = null;
  webPlayerStatus.connected = false;
  webPlayerStatus.codec = null;
  startPlayer();
}

watch(
  [() => effective.value.codec, () => effective.value.bitrate],
  ([codec, bitrate]) => {
    if (!player) return;
    void applyServerFormat(codec, bitrate).then((applied) => {
      if (!applied) restartPlayer();
    });
  },
);

// the adaptive loop: every couple of seconds ask the player how the
// stream is doing and move on the ladder when it says so
const adaptive = new AdaptiveController();
let adaptiveTimer: number | undefined;
// a health line in the log every so often while audio plays
const HEALTH_LOG_EVERY_TICKS = 15;
let healthTicks = 0;

function logHealth(info: NonNullable<SendspinPlayer["syncInfo"]>) {
  const progress = player?.trackProgress;
  logWebPlayerEvent(
    "debug",
    `health sync=${Math.round(info.syncErrorMs)}ms resyncs=${info.resyncCount} latency=${Math.round(info.outputLatencyMs)}ms rate=${info.playbackRate.toFixed(4)} method=${info.correctionMethod} pos=${progress ? Math.round(progress.positionMs / 1000) : "?"}s rung=${webPlayerStatus.rung}`,
  );
}

function stopAdaptive() {
  if (adaptiveTimer) clearInterval(adaptiveTimer);
  adaptiveTimer = undefined;
  connectionTarget()?.removeEventListener("change", applyConnectionFloor);
}

// the browser knows the kind of link before a dropout has been heard:
// start on the rung it suggests, and follow it when a phone changes
// networks (Wi-Fi to cellular); the ladder only ever moves down here
function applyConnectionFloor() {
  if (!webPlayerStatus.adaptive) return;
  const floor = rungForConnection(readConnection());
  if (adaptive.floor(floor, Date.now())) {
    webPlayerStatus.rung = adaptive.rung;
    console.debug(
      `Sendspin: adaptive mode started at rung ${adaptive.rung} for this connection`,
    );
  }
}

function startAdaptive() {
  stopAdaptive();
  adaptive.reset(Date.now());
  adaptive.rung = webPlayerStatus.rung;
  applyConnectionFloor();
  connectionTarget()?.addEventListener("change", applyConnectionFloor);
  healthTicks = 0;
  adaptiveTimer = window.setInterval(() => {
    if (!player) return;
    const info = player.syncInfo;
    if (!info) return;
    if (isPlaying.value && ++healthTicks % HEALTH_LOG_EVERY_TICKS === 0) {
      logHealth(info);
    }
    if (!webPlayerStatus.adaptive) return;
    const verdict = adaptive.observe({
      now: Date.now(),
      resyncCount: info.resyncCount,
      syncErrorMs: info.syncErrorMs,
    });
    if (verdict) {
      webPlayerStatus.rung = adaptive.rung;
      console.debug(
        `Sendspin: adaptive mode stepped ${verdict} to rung ${adaptive.rung}`,
      );
    }
  }, 2000);
}

// whether the loop should act follows the setting and the link; switching
// it off puts the user's own choices back
watch(
  () => adaptiveActive(webPlayerTuning.adaptive, webPlayerStatus.direct),
  (active) => {
    webPlayerStatus.adaptive = active;
    if (!active) {
      webPlayerStatus.rung = 0;
      adaptive.rung = 0;
    }
  },
  { immediate: true },
);

// Setup on mount
onMounted(() => {
  installWebPlayerLog();
  console.debug("Sendspin: Component mounted, connecting...");

  registerWebPlayerAudioUnlock(primeAudio);

  // If the silent audio backs the session, play it now that silentAudioRef exists
  if (
    silentAudioBacksSession.value &&
    !mediaSessionDisabled.value &&
    webPlayer.interacted &&
    silentAudioRef.value
  ) {
    silentAudioRef.value.play().catch(() => {});
  }

  startPlayer();

  // Audio element event listeners for mobile MediaSession resilience
  if (audioRef.value) {
    // Ensure audio element doesn't stay paused after interruptions while stream should play
    audioRef.value.addEventListener("pause", () => {
      console.debug("Sendspin: Audio element paused");
      if (!isMobileOutput) return;

      const shouldBePlaying =
        isPlaying.value &&
        playerState.value !== "error" &&
        api.players[props.playerId]?.playback_state === PlaybackState.PLAYING;
      if (!shouldBePlaying || !audioRef.value) return;

      audioRef.value.play().catch((error) => {
        console.warn(
          "Sendspin: Failed to recover audio element playback:",
          error,
        );
      });
    });
  }
});

// Cleanup on unmount
onBeforeUnmount(() => {
  unmounted = true;
  clearWebPlayerAudioUnlock(primeAudio);
  if (player) {
    // The server holds a player registered for minutes after a "restart"
    // goodbye, which is what a hand-over to another tab needs. Once this
    // browser wants no player at all, say so instead, or it stays targetable
    // while nothing is listening.
    const reason = isPlaybackMode(webPlayer.mode) ? "restart" : "user_request";
    logWebPlayerEvent(
      "info",
      `player torn down (${reason}), api ${String(api.state?.value ?? "?")}`,
    );
    player.disconnect(reason);
    player = null;
    webPlayerStatus.connected = false;
    webPlayerStatus.codec = null;
  }
  stopAdaptive();
  if (unsubMetadata) unsubMetadata();
  if (silentAudioInterval) clearInterval(silentAudioInterval);
  if (lastSeekPosTimeout) clearTimeout(lastSeekPosTimeout);
  for (const timeout of pauseCommandTimeouts) clearTimeout(timeout);
  pauseCommandTimeouts.clear();
  if (
    mediaSessionDisabled.value ||
    webPlayer.browserControlsMode !== BrowserMediaControlsMode.ACTIVE_PLAYER ||
    webPlayer.tabMode !== WebPlayerMode.CONTROLS_ONLY
  ) {
    resetMediaSession();
  }
});

function getTargetPlayerId(): string | undefined {
  if (metadataPlayerId.value !== undefined) return props.playerId;
  return store.activePlayerId;
}

function hasSomethingToPlay(playerId: string): boolean {
  const queue = resolvePlayerQueue(api.players[playerId]);
  return !queue || queue.items > 0;
}

function registerMediaSessionActionHandlers(): void {
  navigator.mediaSession.setActionHandler("play", () => {
    const targetId = getTargetPlayerId();
    // The server rejects play on an empty queue
    if (!targetId || !hasSomethingToPlay(targetId)) return;
    api.playerCommandPlay(targetId);
  });

  navigator.mediaSession.setActionHandler("pause", () => {
    const targetId = getTargetPlayerId();
    if (!targetId) return;
    // Delay avoids Chromium sending pause when a computer enters standby.
    const timeout = window.setTimeout(() => {
      api.playerCommandPause(targetId);
      pauseCommandTimeouts.delete(timeout);
    }, 250);
    pauseCommandTimeouts.add(timeout);
  });

  navigator.mediaSession.setActionHandler("nexttrack", () => {
    const targetId = getTargetPlayerId();
    if (!targetId) return;
    api.playerCommandNext(targetId);
  });

  navigator.mediaSession.setActionHandler("previoustrack", () => {
    const targetId = getTargetPlayerId();
    if (!targetId) return;
    api.playerCommandPrevious(targetId);
  });

  navigator.mediaSession.setActionHandler("seekto", (evt) => {
    const targetId = getTargetPlayerId();
    if (!targetId || evt.seekTime == null) return;
    api.playerCommandSeek(targetId, Math.round(evt.seekTime));
  });

  // Implementing seek forward/backward hides prev/next buttons on iOS/Mac.
  if (!navigator.userAgent.match(/(iPhone|iPod|iPad|Mac)/i)) {
    navigator.mediaSession.setActionHandler("seekforward", (evt) => {
      const targetId = getTargetPlayerId();
      if (!targetId) return;
      const offset = evt.seekOffset || 10;
      const elapsed = lastSeekPos ?? resolveActiveElapsedTime(targetId);
      if (elapsed == null) return;
      const newPos = Math.round(elapsed + offset);
      lastSeekPos = newPos;
      resetLastSeekPos();
      api.playerCommandSeek(targetId, newPos);
    });

    navigator.mediaSession.setActionHandler("seekbackward", (evt) => {
      const targetId = getTargetPlayerId();
      if (!targetId) return;
      const offset = evt.seekOffset || 10;
      const elapsed = lastSeekPos ?? resolveActiveElapsedTime(targetId);
      if (elapsed == null) return;
      const newPos = Math.round(Math.max(0, elapsed - offset));
      lastSeekPos = newPos;
      resetLastSeekPos();
      api.playerCommandSeek(targetId, newPos);
    });
  }
}
</script>

<style lang="css">
.hidden-audio {
  width: 0;
  height: 0;
}
</style>
