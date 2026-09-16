// Keeps the app's document alive when the user backs out past the router's
// own root, so an in-page player (the browser's Sendspin web player, and the
// companion app's own webview) never loses its audio context to a back
// gesture/button with nowhere left to go in-app.
//
// The router runs in hash mode: every in-app navigation is a same-document
// history entry, so a `popstate` reliably fires for it (unlike a real path
// change, a hash change never unloads the document). The one transition that
// would actually exit the app is going back past the very first entry the
// router pushed - the moment `canGoBack` reads false straight after a
// backward pop. Reinserting the current entry there absorbs that single
// "over-back" tap: the document never unmounts, so playback never stops.
//
// This is a web-layer guard: it protects the browser tab and the companion
// app's webview (both are just this document). An OS-level gesture that
// closes the app/tab outright (rather than firing a history pop this page can
// see) is outside what any page script can intercept.
import type { Router } from "vue-router";
import { canGoBack } from "@/helpers/navigation";

let installed = false;

export function installBackNavigationGuard(router: Router): void {
  if (installed) return;
  installed = true;

  window.addEventListener("popstate", () => {
    // give the router a tick to resolve the popped route before checking
    // whether it left anything to go back to
    void router.isReady().then(() => {
      if (canGoBack(router)) return;
      // we're one tap short of leaving the app entirely; re-push the current
      // route so this history position is filled by us again
      history.pushState(history.state, "", location.href);
    });
  });
}
