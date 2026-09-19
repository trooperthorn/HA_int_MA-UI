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
  // Awaited together: a caller that queues something straight afterwards
  // (Replace up next) must not have the deletes land on top of what it added,
  // and a delete the server refused has to reach the caller. The command goes
  // out through sendCommand rather than api.queueCommandDelete because that
  // one fires and forgets, so there is nothing to wait for or to fail on.
  await Promise.all(
    items.map((item) =>
      api.sendCommand("player_queues/delete_item", {
        queue_id: queue.queue_id,
        item_id_or_index: item.queue_item_id,
      }),
    ),
  );
}
