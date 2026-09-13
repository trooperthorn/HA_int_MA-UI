// The sendspin player id, mirrored into localStorage so the other tabs in this
// storage scope and the proxy handshake can read it. It lives here rather than
// in web_player.ts because sendspin-connection.ts reads it too, and web_player
// already imports that module -- owning the key in a third place keeps the two
// plugins from importing each other.

const SENDSPIN_PLAYER_ID_KEY = "sendspin_webplayer_id";

/**
 * Read the mirrored player id, or null when there is none.
 *
 * Also null when site data is blocked, the way readDeviceSetting is: a
 * cross-origin iframe is the usual case, and an Android WebView blocks
 * third-party site data by default.
 */
export function readSendspinPlayerId(): string | null {
  try {
    return window.localStorage.getItem(SENDSPIN_PLAYER_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Mirror the player id for the other tabs, if storage will take it.
 *
 * A failure here is not worth losing the registration over. Where storage is
 * blocked there are no other tabs in the scope to coordinate with anyway, so
 * the mirror has nothing to be read by and the id still stands for this tab.
 */
export function writeSendspinPlayerId(playerId: string): void {
  try {
    window.localStorage.setItem(SENDSPIN_PLAYER_ID_KEY, playerId);
  } catch {
    // blocked storage; carry on unmirrored
  }
}
