<template>
  <section
    v-if="summary"
    class="item-provenance-summary"
    :aria-label="$t('item_provenance.playlist_source')"
    data-testid="item-provenance-summary"
  >
    <div class="item-provenance-source">
      <span class="item-provenance-label">{{
        $t("item_provenance.source")
      }}</span>
      <span class="item-provenance-value" :title="summary.source">
        {{ summary.source }}
      </span>
      <span class="item-provenance-identity">{{ summary.sourceIdentity }}</span>
    </div>
    <div class="item-provenance-status">
      <span class="item-provenance-state" :data-state="summary.state">
        {{ stateLabel }}
      </span>
      <time
        v-if="verifiedAt"
        :datetime="verifiedAt.iso"
        :title="verifiedAt.absolute"
        :aria-label="
          $t('item_provenance.last_verified', { date: verifiedAt.absolute })
        "
      >
        {{ verifiedAt.absolute }} · {{ verifiedAt.relative }}
      </time>
    </div>
  </section>
</template>

<script setup lang="ts">
import { getItemProvenanceCapabilities } from "@/helpers/item_provenance";
import type {
  ItemProvenance,
  ItemProvenanceState,
} from "@/library-manager/enrichment";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = defineProps<{ libraryItemId: string; provider: string }>();

const KNOWN_STATES = new Set<ItemProvenanceState>([
  "current",
  "source_changed",
  "capture_pending",
  "capture_failed",
  "mirror_conflict",
  "mirror_uncertain",
  "mirror_detached",
  "unknown",
]);
const STATE_LABEL_KEYS: Record<ItemProvenanceState, string> = {
  current: "item_provenance.states.current",
  source_changed: "item_provenance.states.source_changed",
  capture_pending: "item_provenance.states.capture_pending",
  capture_failed: "item_provenance.states.capture_failed",
  mirror_conflict: "item_provenance.states.mirror_conflict",
  mirror_uncertain: "item_provenance.states.mirror_uncertain",
  mirror_detached: "item_provenance.states.mirror_detached",
  unknown: "item_provenance.states.unknown",
};

const provenance = ref<ItemProvenance>();
let alive = true;
let requestRevision = 0;

const summary = computed(() => {
  const value = provenance.value;
  if (
    !value ||
    value.api_version !== 1 ||
    value.linked !== true ||
    value.media_type !== "playlist" ||
    value.library_item_id !== props.libraryItemId ||
    !value.subscription ||
    !KNOWN_STATES.has(value.state)
  )
    return undefined;
  return {
    source: value.subscription.name,
    sourceIdentity: `${value.subscription.provider_domain} · ${value.subscription.account_id}`,
    state: value.state,
  };
});
const stateLabel = computed(() =>
  summary.value ? $t(STATE_LABEL_KEYS[summary.value.state]) : "",
);
const verifiedAt = computed(() => {
  const value = provenance.value?.check?.last_check_at;
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const iso = parsed.toISOString();
  const diffSeconds = Math.round((parsed.getTime() - Date.now()) / 1000);
  const absolute = parsed.toLocaleString();
  const abs = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const relative =
    abs < 60
      ? formatter.format(0, "second")
      : abs < 3600
        ? formatter.format(Math.trunc(diffSeconds / 60), "minute")
        : abs < 86400
          ? formatter.format(Math.trunc(diffSeconds / 3600), "hour")
          : formatter.format(Math.trunc(diffSeconds / 86400), "day");
  return { iso, absolute, relative };
});

async function load() {
  const revision = ++requestRevision;
  provenance.value = undefined;
  if (
    props.provider !== "library" ||
    !props.libraryItemId ||
    !authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE)
  )
    return;
  const capabilities = await getItemProvenanceCapabilities();
  if (!alive || revision !== requestRevision) return;
  if (
    capabilities?.api_version !== 1 ||
    capabilities.item_provenance !== true ||
    capabilities.item_provenance_api_version !== 1
  )
    return;
  try {
    const result = await api.sendCommand<ItemProvenance>(
      "library_enrichment/item_provenance",
      { media_type: "playlist", library_item_id: props.libraryItemId },
      { suppressGlobalError: true },
    );
    if (!alive || revision !== requestRevision) return;
    provenance.value = result;
  } catch {
    // This is optional enhancement data; absent and failed requests stay silent.
  }
}

watch(() => [props.libraryItemId, props.provider], load, { immediate: true });
onBeforeUnmount(() => {
  alive = false;
  requestRevision++;
});
</script>

<style scoped>
.item-provenance-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.5rem;
  width: 100%;
  min-width: 0;
  padding: 0.75rem 1rem;
  color: rgb(var(--v-theme-on-surface));
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgb(var(--v-theme-on-surface) / 0.12);
  font-size: 0.875rem;
}

.item-provenance-source,
.item-provenance-status {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 0.5rem;
}

.item-provenance-label,
.item-provenance-identity,
time {
  color: rgb(var(--v-theme-on-surface) / 0.7);
}

.item-provenance-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-provenance-identity {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-provenance-state {
  font-weight: 600;
  white-space: nowrap;
}

time {
  white-space: nowrap;
}

@media (max-width: 639px) {
  .item-provenance-summary {
    align-items: stretch;
    flex-direction: column;
  }

  .item-provenance-source,
  .item-provenance-status {
    width: 100%;
  }

  .item-provenance-value {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .item-provenance-identity {
    margin-left: auto;
    max-width: 45%;
  }

  .item-provenance-status {
    justify-content: space-between;
    flex-wrap: wrap;
  }
}
</style>
