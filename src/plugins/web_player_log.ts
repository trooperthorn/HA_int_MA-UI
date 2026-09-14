// A short memory of what the web player did, for the phone layout's menu.
//
// The Home Assistant Companion app never shows the page's console, so when
// playback stops on a phone there is nothing to read. This keeps the last
// few hundred events in memory: every console line the Sendspin SDK and the
// fork's player print (they all start with "Sendspin" or "[Native"), page
// visibility and connection changes, and a health sample now and then. The
// menu copies it as text.
import { reactive } from "vue";

import { webPlayerStatus, webPlayerTuning } from "./web_player_tuning";

export type WebPlayerLogLevel = "debug" | "info" | "warn" | "error";

export interface WebPlayerLogEntry {
  // epoch ms
  time: number;
  level: WebPlayerLogLevel;
  message: string;
}

export const WEB_PLAYER_LOG_LIMIT = 400;

// console lines worth keeping: the SDK's ("Sendspin: ...", "[NativeOpus]",
// "[NativeFlac]") and the fork's ("Sendspin: ...", "[web_player] ...")
const CAPTURE = /^(Sendspin|\[Native|\[web_player\])/;

export const webPlayerLog = reactive({
  entries: [] as WebPlayerLogEntry[],
});

export function clearWebPlayerLog() {
  webPlayerLog.entries = [];
}

/** Record one event. */
export function logWebPlayerEvent(
  level: WebPlayerLogLevel,
  message: string,
  now = Date.now(),
) {
  const entries = webPlayerLog.entries;
  entries.push({ time: now, level, message });
  if (entries.length > WEB_PLAYER_LOG_LIMIT) {
    entries.splice(0, entries.length - WEB_PLAYER_LOG_LIMIT);
  }
}

function describe(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
}

type ConsoleMethod = "debug" | "log" | "info" | "warn" | "error";
const LEVEL_OF: Record<ConsoleMethod, WebPlayerLogLevel> = {
  debug: "debug",
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
};

let uninstallCapture: (() => void) | null = null;

/**
 * Wrap the console so the SDK's and the player's own lines land in the log
 * as well. Idempotent; returns the function that undoes it (for tests).
 */
export function installWebPlayerLog(): () => void {
  if (uninstallCapture) return uninstallCapture;
  const originals: Partial<
    Record<ConsoleMethod, (...args: unknown[]) => void>
  > = {};
  for (const method of Object.keys(LEVEL_OF) as ConsoleMethod[]) {
    const original = console[method] as (...args: unknown[]) => void;
    originals[method] = original;
    console[method] = (...args: unknown[]) => {
      original.apply(console, args);
      const first = args[0];
      if (typeof first === "string" && CAPTURE.test(first)) {
        logWebPlayerEvent(LEVEL_OF[method], args.map(describe).join(" "));
      }
    };
  }

  const onVisibility = () =>
    logWebPlayerEvent("info", `page ${document.visibilityState}`);
  document.addEventListener("visibilitychange", onVisibility);
  const connection = (navigator as { connection?: EventTarget }).connection;
  const onConnection = () => logWebPlayerEvent("info", connectionLine());
  connection?.addEventListener("change", onConnection);
  logWebPlayerEvent("info", `log started, ${connectionLine()}`);

  uninstallCapture = () => {
    for (const method of Object.keys(originals) as ConsoleMethod[]) {
      console[method] = originals[method] as typeof console.log;
    }
    document.removeEventListener("visibilitychange", onVisibility);
    connection?.removeEventListener("change", onConnection);
    uninstallCapture = null;
  };
  return uninstallCapture;
}

function connectionLine(): string {
  const connection = (
    navigator as {
      connection?: { effectiveType?: string; rtt?: number; saveData?: boolean };
    }
  ).connection;
  if (!connection) return "connection unknown";
  return `connection ${connection.effectiveType ?? "?"} rtt=${connection.rtt ?? "?"}ms saveData=${connection.saveData ? "yes" : "no"}`;
}

function stamp(time: number): string {
  const date = new Date(time);
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** The log as text, with a header saying what the player is running. */
export function formatWebPlayerLog(now = Date.now()): string {
  const status = webPlayerStatus;
  const header = [
    `Music Assistant web player log, ${new Date(now).toISOString()}`,
    `agent: ${typeof navigator === "undefined" ? "?" : navigator.userAgent}`,
    `player: ${status.connected ? "connected" : "not running"}, ${status.direct ? "local network" : "remote link"}, codec ${status.codec ?? "?"} ${status.sampleRate ?? "?"} Hz, buffer ${status.minBufferMs ?? "?"} ms, lead ${status.requiredLeadTimeMs ?? "?"} ms, bitrate ${status.bitrate || "default"}, adaptive ${status.adaptive ? `on (rung ${status.rung})` : "off"}`,
    `settings: buffer ${webPlayerTuning.bufferMs || "auto"}, codec ${webPlayerTuning.codec}, bitrate ${webPlayerTuning.bitrate || "default"}, adaptive ${webPlayerTuning.adaptive}`,
    `page: ${typeof document === "undefined" ? "?" : document.visibilityState}, ${connectionLine()}`,
    "",
  ];
  const lines = webPlayerLog.entries.map(
    (entry) => `${stamp(entry.time)} ${entry.level.padEnd(5)} ${entry.message}`,
  );
  return [...header, ...lines].join("\n");
}
