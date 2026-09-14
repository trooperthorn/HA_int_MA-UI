import type { GraphLink } from "./derive";

// the link colors of the Audio Flow reference: source to stream, stream to
// zone, zone to output
export const LINK_COLORS: Readonly<Record<GraphLink["kind"], string>> = {
  input: "#2dd4cf",
  channel: "#d946ef",
  output: "#10b981",
};

export const IDLE_LINK_COLOR = "rgba(127, 127, 127, 0.35)";
