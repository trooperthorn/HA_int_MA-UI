import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The device flags are resolved once when the module is first imported, so each
 * case has to reset the module registry and re-import it against a stubbed
 * navigator. What is asserted is DEVICE_TYPE and the three flags every consumer
 * actually reads -- not the mechanism, which moved from mobile-detect to Client
 * Hints plus a short user-agent test.
 */
async function classify(
  userAgent: string,
  opts: { uaDataMobile?: boolean; maxTouchPoints?: number } = {},
) {
  vi.resetModules();
  Object.defineProperty(window.navigator, "userAgent", {
    value: userAgent,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    value: opts.maxTouchPoints ?? 0,
    configurable: true,
  });
  Object.defineProperty(window.navigator, "userAgentData", {
    value:
      opts.uaDataMobile === undefined
        ? undefined
        : { mobile: opts.uaDataMobile },
    configurable: true,
  });
  return await import("@/helpers/device");
}

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAC_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const WINDOWS_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

afterEach(() => {
  vi.resetModules();
});

describe("device classification", () => {
  it("reads a phone as a phone", async () => {
    for (const [ua, hint] of [
      [IPHONE, undefined],
      [ANDROID_PHONE, true],
    ] as const) {
      const d = await classify(ua, { uaDataMobile: hint });
      expect(d.DEVICE_TYPE).toBe("phone");
      expect(d.IS_PHONE_UA).toBe(true);
      expect(d.IS_TABLET_UA).toBe(false);
      // a phone is also mobile: the flags overlap by design
      expect(d.IS_MOBILE_UA).toBe(true);
    }
  });

  it("reads a tablet as a tablet, not a phone", async () => {
    // Chrome reports mobile:false on an Android tablet, so the Client Hint
    // alone would call this a desktop -- the tablet test has to be the UA
    for (const [ua, hint] of [
      [IPAD, undefined],
      [ANDROID_TABLET, false],
    ] as const) {
      const d = await classify(ua, { uaDataMobile: hint });
      expect(d.DEVICE_TYPE).toBe("tablet");
      expect(d.IS_TABLET_UA).toBe(true);
      expect(d.IS_PHONE_UA).toBe(false);
      expect(d.IS_MOBILE_UA).toBe(true);
    }
  });

  it("sees through an iPad reporting itself as a Mac", async () => {
    // iPadOS 13+ sends a desktop Safari user agent; the touch points give it away
    const d = await classify(MAC_DESKTOP, { maxTouchPoints: 5 });
    expect(d.DEVICE_TYPE).toBe("tablet");
    expect(d.IS_TABLET_UA).toBe(true);
  });

  it("leaves a real Mac a desktop", async () => {
    const d = await classify(MAC_DESKTOP, { maxTouchPoints: 0 });
    expect(d.DEVICE_TYPE).toBe("desktop");
    expect(d.IS_MOBILE_UA).toBe(false);
  });

  it("reads a desktop as a desktop, with or without the Client Hint", async () => {
    for (const hint of [undefined, false] as const) {
      const d = await classify(WINDOWS_DESKTOP, { uaDataMobile: hint });
      expect(d.DEVICE_TYPE).toBe("desktop");
      expect(d.IS_PHONE_UA).toBe(false);
      expect(d.IS_TABLET_UA).toBe(false);
      expect(d.IS_MOBILE_UA).toBe(false);
    }
  });

  it("prefers the Client Hint over the user agent string", async () => {
    // a desktop UA with the browser saying "mobile" is what a spoofed or
    // reduced user agent looks like; the browser's own answer wins
    const d = await classify(WINDOWS_DESKTOP, { uaDataMobile: true });
    expect(d.IS_MOBILE_UA).toBe(true);
    expect(d.DEVICE_TYPE).toBe("phone");
  });
});
