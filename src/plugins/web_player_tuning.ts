// How this browser's web player buffers and which codec it asks for. Kept
// per device in localStorage (a phone on cellular and a desktop on the LAN
// want different answers), read by SendspinPlayer.vue and changed from the
// phone layout's menu. The status block is what the player reports back so
// the menu can show what is actually in use.
import { reactive } from "vue";

export type WebPlayerCodecPref = "auto" | "opus" | "flac" | "pcm";

export const BUFFER_STORAGE_KEY = "frontend.settings.web_player_buffer_ms";
export const CODEC_STORAGE_KEY = "frontend.settings.web_player_codec";
export const BITRATE_STORAGE_KEY = "frontend.settings.web_player_bitrate";
export const ADAPTIVE_STORAGE_KEY = "frontend.settings.web_player_adaptive";

// Opus bitrates the server offers (bits per second); 0 is the encoder default
export const BITRATE_CHOICES = [
  0, 48000, 64000, 96000, 128000, 160000, 192000, 256000,
];

// "auto" runs adaptive mode on remote links only
export type AdaptivePref = "auto" | "on" | "off";
export const ADAPTIVE_CHOICES: AdaptivePref[] = ["auto", "on", "off"];

// 0 stands for automatic: a short buffer on the LAN, a long one elsewhere
export const BUFFER_AUTO = 0;
export const BUFFER_CHOICES_MS = [BUFFER_AUTO, 500, 1000, 2500, 5000, 10000];
export const CODEC_CHOICES: WebPlayerCodecPref[] = [
  "auto",
  "opus",
  "flac",
  "pcm",
];

// what automatic means: the LAN keeps the small startup lead that makes
// first audio quick; a remote link (the Home Assistant ingress proxy, a
// phone on cellular) gets room to absorb jitter
export const DIRECT_BUFFER_MS = 500;
export const DIRECT_LEAD_MS = 250;
export const REMOTE_BUFFER_MS = 2500;
export const REMOTE_LEAD_MS = 1000;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage may be unavailable (private mode); the setting then lasts
    // for the session
  }
}

function readBuffer(): number {
  const raw = readStorage(BUFFER_STORAGE_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : BUFFER_AUTO;
}

function readCodec(): WebPlayerCodecPref {
  const raw = readStorage(CODEC_STORAGE_KEY);
  return CODEC_CHOICES.includes(raw as WebPlayerCodecPref)
    ? (raw as WebPlayerCodecPref)
    : "auto";
}

function readBitrate(): number {
  const raw = readStorage(BITRATE_STORAGE_KEY);
  const parsed = raw === null ? NaN : Number(raw);
  return BITRATE_CHOICES.includes(parsed) ? parsed : 0;
}

function readAdaptive(): AdaptivePref {
  const raw = readStorage(ADAPTIVE_STORAGE_KEY);
  return ADAPTIVE_CHOICES.includes(raw as AdaptivePref)
    ? (raw as AdaptivePref)
    : "auto";
}

export const webPlayerTuning = reactive({
  bufferMs: readBuffer(),
  codec: readCodec(),
  bitrate: readBitrate(),
  adaptive: readAdaptive(),
});

export function setWebPlayerBitrate(bitrate: number) {
  webPlayerTuning.bitrate = bitrate;
  writeStorage(BITRATE_STORAGE_KEY, bitrate ? String(bitrate) : null);
}

export function setWebPlayerAdaptive(pref: AdaptivePref) {
  webPlayerTuning.adaptive = pref;
  writeStorage(ADAPTIVE_STORAGE_KEY, pref === "auto" ? null : pref);
}

/** Whether adaptive mode runs for the link the player is on. */
export function adaptiveActive(pref: AdaptivePref, direct: boolean): boolean {
  return pref === "on" || (pref === "auto" && !direct);
}

export function setWebPlayerBuffer(ms: number) {
  webPlayerTuning.bufferMs = ms;
  writeStorage(BUFFER_STORAGE_KEY, ms === BUFFER_AUTO ? null : String(ms));
}

export function setWebPlayerCodec(codec: WebPlayerCodecPref) {
  webPlayerTuning.codec = codec;
  writeStorage(CODEC_STORAGE_KEY, codec === "auto" ? null : codec);
}

/** The buffer and startup lead the player should run with, in ms. */
export function resolveBuffer(
  bufferMs: number,
  direct: boolean,
): { minBufferMs: number; requiredLeadTimeMs: number } {
  if (bufferMs === BUFFER_AUTO) {
    return direct
      ? { minBufferMs: DIRECT_BUFFER_MS, requiredLeadTimeMs: DIRECT_LEAD_MS }
      : { minBufferMs: REMOTE_BUFFER_MS, requiredLeadTimeMs: REMOTE_LEAD_MS };
  }
  // a chosen buffer brings a lead in proportion, capped where the remote
  // profile caps it; a short buffer keeps first audio quick
  return {
    minBufferMs: bufferMs,
    requiredLeadTimeMs: Math.max(
      DIRECT_LEAD_MS,
      Math.min(REMOTE_LEAD_MS, Math.round(bufferMs / 2.5)),
    ),
  };
}

export type SendspinCodec = "pcm" | "opus" | "flac";

/**
 * The codecs to advertise, best first. Automatic prefers opus when the
 * browser decodes it natively and otherwise flac then pcm (Safari has no
 * flac, and its WASM opus fallback is not trusted, see SendspinPlayer.vue).
 * A chosen codec goes first with the rest behind it, so a server that cannot
 * encode it still plays.
 */
export function resolveCodecs(
  pref: WebPlayerCodecPref,
  hasNativeOpus: boolean,
): SendspinCodec[] {
  const automatic: SendspinCodec[] = hasNativeOpus
    ? ["opus", "flac"]
    : ["flac", "pcm"];
  if (pref === "auto") return automatic;
  return [pref, ...automatic.filter((codec) => codec !== pref)];
}

// what the running player reports, for the menu
export const webPlayerStatus = reactive({
  connected: false,
  direct: true,
  codec: null as string | null,
  sampleRate: null as number | null,
  minBufferMs: null as number | null,
  requiredLeadTimeMs: null as number | null,
  // the Opus bitrate asked of the server, 0 for its default
  bitrate: 0,
  // adaptive mode: whether it is watching, and the rung it is on
  adaptive: false,
  rung: 0,
  syncErrorMs: null as number | null,
  resyncCount: null as number | null,
  outputLatencyMs: null as number | null,
  healthSampledAt: null as number | null,
});

export function clearWebPlayerHealth() {
  webPlayerStatus.syncErrorMs = null;
  webPlayerStatus.resyncCount = null;
  webPlayerStatus.outputLatencyMs = null;
  webPlayerStatus.healthSampledAt = null;
}
