import { sendspinProxyAuthMessage } from "@/plugins/sendspin-connection";
import { describe, expect, it } from "vitest";

describe("Sendspin proxy identity", () => {
  it("omits an audio player identity for a display-only connection", () => {
    expect(JSON.parse(sendspinProxyAuthMessage("test-token", null))).toEqual({
      type: "auth",
      token: "test-token",
    });
    expect(
      JSON.parse(sendspinProxyAuthMessage("test-token", "player-id")),
    ).toEqual({
      type: "auth",
      token: "test-token",
      client_id: "player-id",
    });
  });
});
