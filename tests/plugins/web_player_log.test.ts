import {
  clearWebPlayerLog,
  formatWebPlayerLog,
  installWebPlayerLog,
  logWebPlayerEvent,
  WEB_PLAYER_LOG_LIMIT,
  webPlayerLog,
} from "@/plugins/web_player_log";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("web player log", () => {
  beforeEach(() => clearWebPlayerLog());
  afterEach(() => vi.restoreAllMocks());

  it("keeps the newest entries within the limit", () => {
    for (let i = 0; i < WEB_PLAYER_LOG_LIMIT + 10; i++) {
      logWebPlayerEvent("debug", `line ${i}`, i);
    }
    expect(webPlayerLog.entries).toHaveLength(WEB_PLAYER_LOG_LIMIT);
    expect(webPlayerLog.entries[0].message).toBe("line 10");
  });

  it("captures the SDK's and the player's console lines, and nothing else", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const uninstall = installWebPlayerLog();
    try {
      clearWebPlayerLog();
      console.log("Sendspin: Connected to server");
      console.warn("[NativeFlac] WebCodecs init failed, will use fallback:", {
        code: 1,
      });
      console.debug("Sendspin: adaptive mode stepped down to rung 1");
      console.log("unrelated line");
      expect(webPlayerLog.entries.map((entry) => entry.message)).toEqual([
        "Sendspin: Connected to server",
        '[NativeFlac] WebCodecs init failed, will use fallback: {"code":1}',
        "Sendspin: adaptive mode stepped down to rung 1",
      ]);
      expect(webPlayerLog.entries.map((entry) => entry.level)).toEqual([
        "info",
        "warn",
        "debug",
      ]);
      // installing twice changes nothing
      expect(installWebPlayerLog()).toBe(uninstall);
    } finally {
      uninstall();
    }
    console.log("Sendspin: after uninstall");
    expect(webPlayerLog.entries).toHaveLength(3);
  });

  it("notes page visibility changes", () => {
    const uninstall = installWebPlayerLog();
    try {
      clearWebPlayerLog();
      document.dispatchEvent(new Event("visibilitychange"));
      expect(webPlayerLog.entries[0].message).toMatch(/^page (visible|hidden)/);
    } finally {
      uninstall();
    }
  });

  it("formats a header and one line per entry", () => {
    logWebPlayerEvent(
      "info",
      "hello",
      new Date(2026, 8, 14, 17, 28, 44, 5).getTime(),
    );
    const text = formatWebPlayerLog(new Date(2026, 8, 14, 17, 30).getTime());
    expect(text).toContain("Music Assistant web player log, ");
    expect(text).toContain("player: not running");
    expect(text).toContain("settings: buffer auto, codec auto");
    expect(text.split("\n").at(-1)).toBe("17:28:44.005 info  hello");
  });
});
