import { describe, expect, it } from "vitest";
import {
  BUFFER_AUTO,
  resolveBuffer,
  resolveCodecs,
} from "@/plugins/web_player_tuning";

describe("resolveBuffer", () => {
  it("keeps the LAN quick and gives a remote link room", () => {
    expect(resolveBuffer(BUFFER_AUTO, true)).toEqual({
      minBufferMs: 500,
      requiredLeadTimeMs: 250,
    });
    expect(resolveBuffer(BUFFER_AUTO, false)).toEqual({
      minBufferMs: 2500,
      requiredLeadTimeMs: 1000,
    });
  });

  it("scales the lead with a chosen buffer, between the two profiles", () => {
    expect(resolveBuffer(500, false)).toEqual({
      minBufferMs: 500,
      requiredLeadTimeMs: 250,
    });
    expect(resolveBuffer(2500, true)).toEqual({
      minBufferMs: 2500,
      requiredLeadTimeMs: 1000,
    });
    expect(resolveBuffer(10000, true).requiredLeadTimeMs).toBe(1000);
  });
});

describe("resolveCodecs", () => {
  it("advertises opus only with a native decoder when automatic", () => {
    expect(resolveCodecs("auto", true)).toEqual(["opus", "flac"]);
    expect(resolveCodecs("auto", false)).toEqual(["flac", "pcm"]);
  });

  it("puts a chosen codec first and keeps the automatic set behind it", () => {
    expect(resolveCodecs("opus", false)).toEqual(["opus", "flac", "pcm"]);
    expect(resolveCodecs("pcm", true)).toEqual(["pcm", "opus", "flac"]);
    expect(resolveCodecs("flac", true)).toEqual(["flac", "opus"]);
  });
});
