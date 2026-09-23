import {
  getCastReceiverFailure,
  getCastReceiverState,
} from "@/helpers/cast_receiver_status";
import type { Player } from "@/plugins/api/interfaces";
import { describe, expect, it } from "vitest";

const castProtocols = [
  {
    output_protocol_id: "cast-base",
    name: "Google Cast",
    protocol_domain: "chromecast",
    priority: 10,
    is_native: false,
    available: true,
    derived_from: null,
  },
  {
    output_protocol_id: "sendspin-cast",
    name: "Sendspin (over Cast)",
    protocol_domain: "sendspin",
    priority: 20,
    is_native: false,
    available: true,
    derived_from: "cast-base",
  },
];

describe("Cast receiver status", () => {
  it("waits for an actual Cast receiver state", () => {
    const parent = {
      player_id: "combined",
      output_protocols: castProtocols,
      extra_attributes: {},
    } as Player;
    const child = { extra_attributes: {} };
    expect(
      getCastReceiverState(parent, { "sendspin-cast": child }),
    ).toBeUndefined();
  });

  it("uses the derived Sendspin player's receiver state", () => {
    const parent = {
      player_id: "combined",
      output_protocols: castProtocols,
      extra_attributes: {},
    };
    const child = {
      extra_attributes: { sendspin_cast_state: "connecting" },
    };
    expect(getCastReceiverState(parent, { "sendspin-cast": child })).toBe(
      "connecting",
    );
  });

  it("uses only allowlisted failure reasons while in error state", () => {
    const parent = {
      player_id: "combined",
      output_protocols: castProtocols,
      extra_attributes: {},
    } as Player;
    const child = {
      extra_attributes: {
        sendspin_cast_state: "error",
        sendspin_cast_failure: "launch_timeout",
      },
    };
    expect(getCastReceiverFailure(parent, { "sendspin-cast": child })).toBe(
      "launch_timeout",
    );
    child.extra_attributes.sendspin_cast_failure =
      "private receiver diagnostic";
    expect(
      getCastReceiverFailure(parent, { "sendspin-cast": child }),
    ).toBeUndefined();
    child.extra_attributes.sendspin_cast_failure = "launch_failed";
    child.extra_attributes.sendspin_cast_state = "connected";
    expect(
      getCastReceiverFailure(parent, { "sendspin-cast": child }),
    ).toBeUndefined();
  });

  it("does not label an AirPlay bridge as a Cast receiver", () => {
    const parent = {
      player_id: "combined",
      output_protocols: [
        { ...castProtocols[0], protocol_domain: "airplay" },
        castProtocols[1],
      ],
      extra_attributes: {},
    } as Player;
    expect(getCastReceiverState(parent, {})).toBeUndefined();
  });
});
