import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";

// Playback-behavior preferences surfaced on the Queue Settings page
// (src/views/settings/EditPlayerQueue.vue). Global, not per-queue: kept here
// rather than in library-manager/ since they also apply to double-click/
// right-click play outside the library browser.
export const QUEUE_PLAYBACK_PREFERENCE_KEY = "queue.playbackBehavior";

export interface QueuePlaybackPreference {
  // Double-click/right-click an Artist/Album/Playlist in the library
  // browser's Top-3 columns plays it immediately instead of just filtering.
  playOnBrowserClick?: boolean;
  // When sorted by anything other than Track #, still play tracks in their
  // album track-number order rather than the current display sort order.
  albumOrderOverridesSort?: boolean;
  // Shuffle (including the new Shuffle-this-Artist/Album/Playlist menu),
  // playing a multi-track selection, and playing a whole album all force
  // Autoplay on.
  autoplayOnShuffleOrBulkPlay?: boolean;
}

export function useQueuePlaybackPreferences() {
  const { getPreference } = useUserPreferences();
  const preference = getPreference<QueuePlaybackPreference>(
    QUEUE_PLAYBACK_PREFERENCE_KEY,
    {},
  );

  const flag = (key: keyof QueuePlaybackPreference) =>
    preference.value[key] !== false;

  async function setFlag(key: keyof QueuePlaybackPreference, value: boolean) {
    await setUserPreference(QUEUE_PLAYBACK_PREFERENCE_KEY, {
      ...preference.value,
      [key]: value,
    });
  }

  return { preference, flag, setFlag };
}
