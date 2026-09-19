import { api } from "@/plugins/api";
import { store } from "@/plugins/store";
import { currentQueueIndex } from "@/helpers/queue_position";

export const isPlayerQueueControlDisabled = function (): boolean {
  return (
    !store.activePlayerQueue ||
    !store.activePlayerId ||
    (store.showFullscreenPlayer && !store.curQueueItem && !store.showQueueItems)
  );
};

export const togglePlayerQueue = function (): void {
  if (store.showFullscreenPlayer && store.showQueueItems) {
    store.showQueueItems = false;
    return;
  }
  store.showQueueItems = true;
  store.showFullscreenPlayer = true;
};

// drops everything after the current track, leaving the now-playing item (and
// whatever the server has already handed to the stream buffer) untouched —
// scoped alternative to the destructive full clear_queue command
export async function clearUpNext(): Promise<void> {
  const queue = store.activePlayerQueue;
  if (!queue) return;
  const first = currentQueueIndex(queue) + 1;
  const count = (queue.items ?? 0) - first;
  if (count <= 0) return;
  const items = await api.getPlayerQueueItems(queue.queue_id, count, first);
  for (const item of items) {
    api.queueCommandDelete(queue.queue_id, item.queue_item_id);
  }
}
