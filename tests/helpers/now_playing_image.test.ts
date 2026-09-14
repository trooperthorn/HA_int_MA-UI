import { nowPlayingImageUrl } from "@/helpers/now_playing_image";
import type { Player, QueueItem } from "@/plugins/api/interfaces";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/plugins/api", () => {
  const api = {
    baseUrl: "http://ma.test",
    serverInfo: { value: null },
    getProvider: () => ({ available: true }),
  };
  return { api, default: api };
});

const player = (image_url: string | null) =>
  ({ current_media: { image_url } }) as unknown as Player;

const queueItem = (path: string | undefined) =>
  ({
    queue_id: "q1",
    image: path
      ? {
          type: "thumb",
          path,
          provider: "filesystem_local--x",
          remotely_accessible: false,
        }
      : null,
    media_item: null,
  }) as unknown as QueueItem;

describe("nowPlayingImageUrl", () => {
  it("builds the artwork from the queue item before the player's own url", () => {
    const url = nowPlayingImageUrl(
      player("http://ma.test/imageproxy/deadbeef?size=512"),
      queueItem("/music/a.flac"),
      256,
    );
    expect(url).toContain("/imageproxy?path=");
    expect(url).toContain("provider=filesystem_local--x");
    expect(url).toContain("size=256");
  });

  it("falls back to the player's url without a queue item or its image", () => {
    const own = "http://ma.test/imageproxy/deadbeef?size=512";
    expect(nowPlayingImageUrl(player(own), undefined)).toBe(own);
    expect(nowPlayingImageUrl(player(own), queueItem(undefined))).toBe(own);
    expect(nowPlayingImageUrl(player(null), queueItem(undefined))).toBe("");
    expect(nowPlayingImageUrl(undefined, queueItem("/x.jpg"))).toBe("");
  });
});
