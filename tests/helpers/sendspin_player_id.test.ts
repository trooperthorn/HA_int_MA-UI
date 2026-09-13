import {
  readSendspinPlayerId,
  writeSendspinPlayerId,
} from "@/helpers/sendspin_player_id";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Storage that refuses every operation, the way a WebView with site data
 * blocked does -- which is what an HA Companion app reaching Music Assistant
 * through a cross-origin iframe panel gets on Android.
 */
function blockedStorage(): Storage {
  const refuse = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return {
    get length(): number {
      return refuse();
    },
    clear: refuse,
    getItem: refuse,
    key: refuse,
    removeItem: refuse,
    setItem: refuse,
  } as unknown as Storage;
}

function workingStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  } as unknown as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendspin player id mirror", () => {
  it("round-trips through working storage", () => {
    vi.stubGlobal("localStorage", workingStorage());
    writeSendspinPlayerId("noise-public-key");
    expect(readSendspinPlayerId()).toBe("noise-public-key");
  });

  it("reports no id when none was written", () => {
    vi.stubGlobal("localStorage", workingStorage());
    expect(readSendspinPlayerId()).toBeNull();
  });

  it("does not throw when storage refuses the write", () => {
    // The registration path assigns player_id and then mirrors it. Before this
    // guard the throw happened first, player_id stayed unset, and no player was
    // ever announced to the server -- the web player simply never appeared.
    vi.stubGlobal("localStorage", blockedStorage());
    expect(() => writeSendspinPlayerId("noise-public-key")).not.toThrow();
  });

  it("reads null rather than throwing when storage refuses", () => {
    vi.stubGlobal("localStorage", blockedStorage());
    expect(() => readSendspinPlayerId()).not.toThrow();
    expect(readSendspinPlayerId()).toBeNull();
  });
});
