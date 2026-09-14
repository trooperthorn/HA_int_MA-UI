// The fork's patch of @sendspin/sendspin-js routes FLAC through the
// browser's AudioDecoder the way Opus already is. This drives the real
// decoder with a fake AudioDecoder and checks the configuration it gets.
import { SendspinDecoder } from "@sendspin/sendspin-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configure = vi.fn();
const decode = vi.fn();
const isConfigSupported = vi.fn(async (config: unknown) => ({
  supported: true,
  config,
}));

class FakeAudioDecoder {
  state = "unconfigured";
  static isConfigSupported = isConfigSupported;
  configure(config: unknown) {
    configure(config);
    this.state = "configured";
  }
  decode(chunk: unknown) {
    decode(chunk);
  }
  close() {
    this.state = "closed";
  }
}

class FakeEncodedAudioChunk {
  constructor(
    public init: { type: string; timestamp: number; data: unknown },
  ) {}
}

const header = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34]);
const headerBase64 = btoa(String.fromCharCode(...header));

function audioMessage(payload: Uint8Array): ArrayBuffer {
  const message = new Uint8Array(9 + payload.length);
  message[0] = 4;
  new DataView(message.buffer).setBigInt64(1, 123456n, false);
  message.set(payload, 9);
  return message.buffer;
}

describe("SendspinDecoder with the fork's FLAC patch", () => {
  const globals = globalThis as Record<string, unknown>;
  let hadDecoder: unknown;
  let hadChunk: unknown;

  beforeEach(() => {
    hadDecoder = globals.AudioDecoder;
    hadChunk = globals.EncodedAudioChunk;
    globals.AudioDecoder = FakeAudioDecoder;
    globals.EncodedAudioChunk = FakeEncodedAudioChunk;
    configure.mockClear();
    decode.mockClear();
    isConfigSupported.mockClear();
  });

  afterEach(() => {
    globals.AudioDecoder = hadDecoder;
    globals.EncodedAudioChunk = hadChunk;
  });

  it("configures the browser decoder for flac with the stream header", async () => {
    const decoder = new SendspinDecoder(vi.fn(), () => 1);
    await decoder.handleBinaryMessage(
      audioMessage(new Uint8Array([0xff, 0xf8, 1, 2, 3])),
      {
        codec: "flac",
        sample_rate: 48000,
        channels: 2,
        bit_depth: 16,
        codec_header: headerBase64,
      },
      1,
    );
    expect(isConfigSupported).toHaveBeenCalledWith(
      expect.objectContaining({ codec: "flac", sampleRate: 48000 }),
    );
    const config = configure.mock.calls[0]?.[0] as {
      codec: string;
      description: Uint8Array;
    };
    expect(config.codec).toBe("flac");
    expect(Array.from(config.description)).toEqual(Array.from(header));
    expect(decode).toHaveBeenCalledTimes(1);
    const chunk = decode.mock.calls[0]?.[0] as FakeEncodedAudioChunk;
    expect(chunk.init.type).toBe("key");
    expect(chunk.init.timestamp).toBe(123456);
  });

  it("leaves flac without a header to the fallback path", async () => {
    const decoder = new SendspinDecoder(vi.fn(), () => 1);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    await decoder.handleBinaryMessage(
      audioMessage(new Uint8Array([0xff, 0xf8, 1, 2, 3])),
      { codec: "flac", sample_rate: 48000, channels: 2, bit_depth: 16 },
      1,
    );
    expect(configure).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("still configures opus as before", async () => {
    const decoder = new SendspinDecoder(vi.fn(), () => 1);
    await decoder.handleBinaryMessage(
      audioMessage(new Uint8Array([1, 2, 3])),
      { codec: "opus", sample_rate: 48000, channels: 2, bit_depth: 16 },
      1,
    );
    expect(configure).toHaveBeenCalledWith({
      codec: "opus",
      sampleRate: 48000,
      numberOfChannels: 2,
    });
  });
});
