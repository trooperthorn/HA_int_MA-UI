import {
  SENDSPIN_DELAY_KEY,
  SYNC_ADJUST_KEY,
  suggestCalibratedDelay,
  type AudioDelayConfig,
} from "@/helpers/sync_adjust";
import { describe, expect, it } from "vitest";

const config = (key: string, min: number, max: number): AudioDelayConfig => ({
  key,
  min,
  max,
  steps: [],
  hint: "",
  requiresCapability: false,
});

describe("room delay calibration", () => {
  it("advances a late AirPlay player with a negative correction", () => {
    expect(
      suggestCalibratedDelay(config(SYNC_ADJUST_KEY, -500, 500), 0, 250),
    ).toEqual({ value: -250, limited: false });
    expect(
      suggestCalibratedDelay(config(SYNC_ADJUST_KEY, -500, 500), -100, -50),
    ).toEqual({ value: -50, limited: false });
  });

  it("advances a late Sendspin player by increasing output delay", () => {
    expect(
      suggestCalibratedDelay(config(SENDSPIN_DELAY_KEY, 0, 5000), 200, 250),
    ).toEqual({ value: 450, limited: false });
    expect(
      suggestCalibratedDelay(config(SENDSPIN_DELAY_KEY, 0, 5000), 200, -250),
    ).toEqual({ value: 0, limited: true });
  });

  it("rejects missing, fractional, excessive and unknown inputs", () => {
    const sendspin = config(SENDSPIN_DELAY_KEY, 0, 5000);
    expect(suggestCalibratedDelay(sendspin, 0, Number.NaN)).toBeUndefined();
    expect(suggestCalibratedDelay(sendspin, 0, 10.5)).toBeUndefined();
    expect(suggestCalibratedDelay(sendspin, 0, 5001)).toBeUndefined();
    expect(
      suggestCalibratedDelay(config("other", 0, 5000), 0, 250),
    ).toBeUndefined();
  });
});
