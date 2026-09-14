import { getImageThumbForItem, getMediaImageUrl } from "@/helpers/utils";
import {
  ImageType,
  type Player,
  type QueueItem,
} from "@/plugins/api/interfaces";

/**
 * Artwork for what a player is playing.
 *
 * The queue item's own image is built here from the image the server sent
 * with the item, which is what the queue rows already show. The player's
 * `current_media.image_url` is a url the server built for the player and is
 * the only source for anything without a queue item (an external source, a
 * plain url). The two can disagree: on a filesystem track the server's own
 * id for the played track's art came back 404 while the queue item's
 * resolved, so the queue item is asked first and the player's url is the
 * fallback.
 */
export function nowPlayingImageUrl(
  player: Player | undefined,
  queueItem: QueueItem | undefined,
  size?: number,
): string {
  if (!player) return "";
  const fromItem = queueItem
    ? getImageThumbForItem(queueItem, ImageType.THUMB, size)
    : undefined;
  return fromItem || getMediaImageUrl(player.current_media?.image_url);
}
