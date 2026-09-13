export type DeviceType = "desktop" | "phone" | "tablet";

/**
 * The User-Agent Client Hints surface, where the browser has it.
 *
 * `mobile` is the browser's own answer to the question the regexes below have
 * to guess at, so it is preferred wherever it exists. It says nothing about
 * tablets: Chrome reports `mobile: false` on an Android tablet, which is why
 * the tablet test stays a UA test.
 */
type UserAgentData = { mobile?: boolean };

const ua = window.navigator.userAgent;
const uaData = (
  window.navigator as Navigator & { userAgentData?: UserAgentData }
).userAgentData;

// iPadOS 13 and later report a desktop Safari user agent. The touch points are
// what give it away -- a real Mac reports 0, and a trackpad does not change that.
const isIPadOS =
  /Macintosh/.test(ua) && (window.navigator.maxTouchPoints ?? 0) > 1;

// Android tablets are Android without the "Mobile" token; phones carry it.
const looksLikeTablet =
  /\b(iPad|Tablet|PlayBook|Silk)\b/i.test(ua) ||
  (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
  isIPadOS;

const looksLikeMobile =
  uaData?.mobile ??
  /Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini|Mobile/i.test(ua);

// All resolved once from the user agent, so they never change while the app runs.
// The flags say nothing about the viewport and overlap: a phone or tablet is also
// mobile, while mobile on its own means the device could not be sized as either.
//
// Replaces mobile-detect, which was last published in 2021 and carried a device
// regex table that stopped being updated with it. These derive the same three
// answers from Client Hints where the browser offers them and a short user-agent
// test where it does not; every consumer reads the constants below, not the
// mechanism. Note that breakpoint.ts treats these as an override that forces the
// mobile layout on, with a viewport-width fallback underneath -- so a device that
// matches nothing here still gets the right layout by size.
export const IS_TABLET_UA = looksLikeTablet;
export const IS_PHONE_UA = !looksLikeTablet && looksLikeMobile;
export const IS_MOBILE_UA = looksLikeTablet || looksLikeMobile;

export const DEVICE_TYPE: DeviceType = IS_TABLET_UA
  ? "tablet"
  : IS_PHONE_UA || IS_MOBILE_UA
    ? "phone"
    : "desktop";

/**
 * How far in from a side of the screen it is safe to draw, in pixels.
 *
 * The layout viewport spans the cutout and the rounded corners, so anything
 * measured from `window.innerWidth` has to take this off to clear them.
 */
export function deviceInset(side: "left" | "right") {
  // read off a padding rather than the custom property itself: WebKit reports 0
  // for a custom property holding env(), while a length it lays a box out with
  // carries the inset the page is actually drawn against
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;padding-left:var(--device-inset-${side})`;
  document.body.appendChild(probe);
  const inset = parseFloat(getComputedStyle(probe).paddingLeft) || 0;
  probe.remove();
  return inset;
}

export function isTouchscreenDevice() {
  // detect if device/browser is touch enabled
  let result = false;
  if (window.PointerEvent && "maxTouchPoints" in navigator) {
    if (navigator.maxTouchPoints > 0) {
      result = true;
    }
  } else {
    if (
      window.matchMedia &&
      window.matchMedia("(any-pointer:coarse)").matches
    ) {
      result = true;
    } else if (window.TouchEvent || "ontouchstart" in window) {
      result = true;
    }
  }
  return result;
}
