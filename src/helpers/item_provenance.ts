import type { ArchiveCapabilities } from "@/library-manager/enrichment";
import { api } from "@/plugins/api";

let capabilityRequest: Promise<ArchiveCapabilities | null> | undefined;

/** Cache the optional capability probe for the life of this frontend session. */
export function getItemProvenanceCapabilities() {
  capabilityRequest ??= api
    .sendCommand<ArchiveCapabilities>(
      "library_enrichment/capabilities",
      undefined,
      { suppressGlobalError: true },
    )
    .catch(() => null);
  return capabilityRequest;
}

/** Test helper: production callers intentionally retain the session cache. */
export function resetItemProvenanceCapabilityCache() {
  capabilityRequest = undefined;
}
