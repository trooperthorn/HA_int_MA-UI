// Shuffle, a multi-track selection, or playing a whole album/playlist/artist
// are all "start a bunch of music going" actions; force Autoplay on for them
// when the user has opted into that (queue.playbackBehavior's
// autoplayOnShuffleOrBulkPlay), rather than leaving playback to stop once
// whatever queued finishes. Kept standalone (not in media_item_actions.ts or
// ItemContextMenu.vue) since those two already import from each other.
import { useQueuePlaybackPreferences } from "@/composables/useQueuePlaybackPreferences";
import api from "@/plugins/api";
import { MediaType } from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";

export const WHOLE_COLLECTION_TYPES = new Set([
  MediaType.ALBUM,
  MediaType.PLAYLIST,
  MediaType.ARTIST,
]);

export function forceAutoplayIfConfigured() {
  const queueId = store.activePlayerQueue?.queue_id;
  if (!queueId) return;
  const { flag } = useQueuePlaybackPreferences();
  if (!flag("autoplayOnShuffleOrBulkPlay")) return;
  void api.queueCommandAutoplay(queueId, true);
}
