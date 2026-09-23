import { describe, expect, it } from "vitest";
import { SendspinArtworkFramer } from "@/plugins/sendspin-artwork";

function legacy(
  channel: number,
  timestampUs: bigint,
  bytes: number[],
): Uint8Array {
  const frame = new Uint8Array(9 + bytes.length);
  const view = new DataView(frame.buffer);
  frame[0] = 8 + channel;
  view.setBigInt64(1, timestampUs, false);
  frame.set(bytes, 9);
  return frame;
}

function announce(
  channel: number,
  timestampUs: bigint,
  size: number,
): Uint8Array {
  const frame = new Uint8Array(14);
  const view = new DataView(frame.buffer);
  frame[0] = 8 + channel;
  frame[1] = 2;
  view.setBigInt64(2, timestampUs, false);
  view.setUint32(10, size, false);
  return frame;
}

describe("Sendspin artwork framing", () => {
  it("reads the pinned server's complete timestamped image and clear", () => {
    const framer = new SendspinArtworkFramer("legacy");
    expect(framer.push(legacy(1, 123456n, [0x89, 0x50]))).toEqual({
      kind: "image",
      channel: 1,
      timestampUs: 123456,
      bytes: new Uint8Array([0x89, 0x50]),
    });
    expect(framer.push(legacy(1, 123457n, []))).toEqual({
      kind: "image",
      channel: 1,
      timestampUs: 123457,
      bytes: new Uint8Array(),
    });
  });

  it("assembles current-spec parts and preserves channel and display time", () => {
    const framer = new SendspinArtworkFramer("announce-parts");
    expect(framer.push(announce(2, 345678n, 3))).toBeNull();
    expect(framer.push(new Uint8Array([10, 0, 1, 2]))).toBeNull();
    expect(framer.push(new Uint8Array([10, 0, 3]))).toEqual({
      kind: "image",
      channel: 2,
      timestampUs: 345678,
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(framer.push(announce(2, 345679n, 0))).toEqual({
      kind: "image",
      channel: 2,
      timestampUs: 345679,
      bytes: new Uint8Array(),
    });
  });

  it("cancels an unfinished transfer and rejects invalid sequences", () => {
    const framer = new SendspinArtworkFramer("announce-parts");
    expect(() => framer.push(new Uint8Array([8, 0, 1]))).toThrow();
    framer.push(announce(0, 100n, 2));
    expect(() => framer.push(announce(1, 101n, 1))).toThrow();
    expect(() => framer.push(new Uint8Array([9, 0, 1]))).toThrow();
    expect(framer.push(new Uint8Array([8, 1]))).toEqual({
      kind: "cancel",
      channel: 0,
    });
    expect(() => framer.push(new Uint8Array([8, 0, 1]))).toThrow();
    expect(() => framer.push(new Uint8Array([8, 4]))).toThrow();
  });
});
