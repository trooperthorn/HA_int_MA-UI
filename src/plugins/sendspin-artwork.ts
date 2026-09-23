/** Artwork binary framing used by Sendspin displays.
 *
 * The installed aiosendspin 9.1.1 server sends one timestamped image per
 * binary message. The current protocol sends an announce followed by parts.
 * The framing mode must be chosen from the server capability; the two formats
 * share message types 8-11 and cannot be reliably inferred from image bytes.
 */
export type ArtworkWireMode = "legacy" | "announce-parts";

export type ArtworkFrameEvent =
  | { kind: "image"; channel: number; timestampUs: number; bytes: Uint8Array }
  | { kind: "cancel"; channel: number };

const MIN_CHANNEL_TYPE = 8;
const MAX_CHANNEL_TYPE = 11;
const MAX_CURRENT_FRAME_SIZE = 65519;
const MAX_IMAGE_SIZE = 16 * 1024 * 1024;

function timestamp(view: DataView, offset: number): number {
  const value = Number(view.getBigInt64(offset, false));
  if (!Number.isSafeInteger(value))
    throw new RangeError("Artwork timestamp exceeds JavaScript precision");
  return value;
}

interface Transfer {
  channel: number;
  timestampUs: number;
  totalSize: number;
  chunks: Uint8Array[];
  received: number;
}

/** Parses completed images; display scheduling is handled by the caller. */
export class SendspinArtworkFramer {
  private transfer: Transfer | null = null;

  constructor(readonly mode: ArtworkWireMode) {}

  reset(): void {
    this.transfer = null;
  }

  push(frame: Uint8Array): ArtworkFrameEvent | null {
    if (frame.length < 1) throw new Error("Empty artwork frame");
    const channel = frame[0] - MIN_CHANNEL_TYPE;
    if (frame[0] < MIN_CHANNEL_TYPE || frame[0] > MAX_CHANNEL_TYPE)
      throw new Error("Invalid artwork channel");
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

    if (this.mode === "legacy") {
      if (frame.length < 9) throw new Error("Short legacy artwork frame");
      if (frame.length - 9 > MAX_IMAGE_SIZE)
        throw new Error("Artwork exceeds image size limit");
      return {
        kind: "image",
        channel,
        timestampUs: timestamp(view, 1),
        bytes: frame.slice(9),
      };
    }

    if (frame.length < 2 || frame.length > MAX_CURRENT_FRAME_SIZE)
      throw new Error("Invalid artwork frame length");
    const flags = frame[1];
    if (flags & ~3 || flags === 3) throw new Error("Invalid artwork flags");
    if (flags === 1) {
      if (frame.length !== 2) throw new Error("Invalid artwork cancel length");
      if (this.transfer?.channel === channel) this.transfer = null;
      return { kind: "cancel", channel };
    }
    if (flags === 2) {
      if (frame.length !== 14)
        throw new Error("Invalid artwork announce length");
      if (this.transfer) throw new Error("Artwork transfer already in flight");
      const totalSize = view.getUint32(10, false);
      if (totalSize > MAX_IMAGE_SIZE)
        throw new Error("Artwork exceeds image size limit");
      const timestampUs = timestamp(view, 2);
      if (totalSize === 0)
        return { kind: "image", channel, timestampUs, bytes: new Uint8Array() };
      this.transfer = {
        channel,
        timestampUs,
        totalSize,
        chunks: [],
        received: 0,
      };
      return null;
    }

    const transfer = this.transfer;
    if (!transfer || transfer.channel !== channel)
      throw new Error("Artwork part without matching announce");
    const chunk = frame.slice(2);
    if (transfer.received + chunk.length > transfer.totalSize)
      throw new Error("Artwork part exceeds announced size");
    transfer.chunks.push(chunk);
    transfer.received += chunk.length;
    if (transfer.received < transfer.totalSize) return null;
    this.transfer = null;
    const bytes = new Uint8Array(transfer.totalSize);
    let offset = 0;
    for (const part of transfer.chunks) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return {
      kind: "image",
      channel,
      timestampUs: transfer.timestampUs,
      bytes,
    };
  }
}
