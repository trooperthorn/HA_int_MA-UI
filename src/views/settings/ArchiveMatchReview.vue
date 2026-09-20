<template>
  <section
    class="mt-3 space-y-3 border-t pt-3"
    data-testid="archive-match-review"
  >
    <p v-if="!canRead" role="alert">
      {{ $t("settings.archives.match_permission") }}
    </p>
    <Button
      v-else-if="!opened"
      data-testid="archive-match-open"
      variant="outline"
      :disabled="reading"
      @click="open"
      >{{ $t("settings.archives.match_open") }}</Button
    >
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="font-medium">{{ $t("settings.archives.match_title") }}</p>
          <p class="text-muted-foreground">
            {{ $t("settings.archives.match_description") }}
          </p>
        </div>
        <Button
          data-testid="archive-match-refresh"
          variant="outline"
          :disabled="reading || writing"
          @click="refresh"
          >{{ $t("settings.archives.match_refresh") }}</Button
        >
      </div>
      <p v-if="uncertain" role="alert" class="text-destructive">
        {{ $t("settings.archives.match_uncertain") }}
      </p>
      <p v-if="!canWrite" role="status" class="text-muted-foreground">
        {{ $t("settings.archives.match_write_permission") }}
      </p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <p v-if="reading" role="status">
        {{ $t("settings.archives.match_loading") }}
      </p>
      <template v-if="page">
        <p
          v-if="page.candidate_freshness === 'stale'"
          role="status"
          class="text-muted-foreground"
        >
          {{ $t("settings.archives.match_stale") }}
        </p>
        <p v-if="page.candidate_error" role="alert" class="text-destructive">
          {{ $t(`settings.archives.match_error_${page.candidate_error}`) }}
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <label class="space-y-1">
            <span>{{ $t("settings.archives.match_filter") }}</span>
            <select
              v-model="filter"
              class="match-input"
              data-testid="archive-match-filter"
            >
              <option value="all">
                {{ $t("settings.archives.match_all") }}
              </option>
              <option
                v-for="value in classifications"
                :key="value"
                :value="value"
              >
                {{ $t(`settings.archives.match_${value}`) }}
              </option>
            </select>
          </label>
          <p class="text-muted-foreground">
            {{
              $t("settings.archives.match_page", {
                start: page.total ? page.offset + 1 : 0,
                end: Math.min(page.offset + page.items.length, page.total),
                total: page.total,
              })
            }}
          </p>
        </div>
        <p
          v-if="!visibleItems.length && !reading"
          class="text-muted-foreground"
        >
          {{ $t("settings.archives.match_no_items") }}
        </p>
        <article
          v-for="item in visibleItems"
          :key="`${item.position}:${item.source_item_id}`"
          class="space-y-2 rounded-lg border p-3"
          data-testid="archive-match-item"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="font-medium">
              {{
                $t("settings.archives.match_source", {
                  position: item.position + 1,
                  id: item.source_item_id,
                })
              }}
            </p>
            <span class="rounded border px-2 py-1">
              {{ $t(`settings.archives.match_${item.classification}`) }}
            </span>
          </div>
          <p v-if="item.state !== 'available'" class="text-muted-foreground">
            {{
              $t("settings.archives.match_source_state", { state: item.state })
            }}
          </p>
          <p v-if="!item.match.candidates.length" class="text-muted-foreground">
            {{ $t("settings.archives.match_no_candidates") }}
          </p>
          <div
            v-for="candidate in item.match.candidates"
            :key="candidate.asset_id"
            class="space-y-1 rounded border p-2"
            data-testid="archive-match-candidate"
          >
            <p class="font-medium">
              {{ metadata(candidate, "name") || candidate.asset_id }}
              <span v-if="metadata(candidate, 'artist')">
                · {{ metadata(candidate, "artist") }}</span
              >
            </p>
            <p
              v-if="metadata(candidate, 'album')"
              class="text-muted-foreground"
            >
              {{ metadata(candidate, "album") }}
            </p>
            <p>
              {{
                $t("settings.archives.match_score", { score: candidate.score })
              }}
            </p>
            <p class="break-all text-muted-foreground">
              {{
                $t("settings.archives.match_location", {
                  domain: metadata(candidate, "provider_domain") || "—",
                  instance: candidate.asset.provider_instance_id,
                  item: candidate.asset.item_id,
                })
              }}
            </p>
            <p
              v-for="location in candidate.asset.locations"
              :key="`${location.provider_instance_id}:${location.item_id}`"
              class="break-all text-muted-foreground"
            >
              {{
                $t("settings.archives.match_location", {
                  domain:
                    evidenceValue(location.evidence, "provider_domain") || "—",
                  instance: location.provider_instance_id,
                  item: location.item_id,
                })
              }}
            </p>
            <pre class="overflow-auto whitespace-pre-wrap text-xs">{{
              evidence(candidate.evidence)
            }}</pre>
            <Button
              data-testid="archive-match-approve"
              :disabled="!canWrite || uncertain || writing || reading"
              @click="decide(item, 'approve', candidate.asset_id)"
              >{{ $t("settings.archives.match_approve") }}</Button
            >
            <Button
              data-testid="archive-match-reject"
              variant="outline"
              :disabled="
                !canWrite ||
                uncertain ||
                writing ||
                reading ||
                candidate.rejected
              "
              @click="decide(item, 'reject', candidate.asset_id)"
              >{{
                $t(
                  candidate.rejected
                    ? "settings.archives.match_candidate_rejected"
                    : "settings.archives.match_reject",
                )
              }}</Button
            >
          </div>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="item.classification === 'approved'"
              data-testid="archive-match-clear"
              variant="outline"
              :disabled="!canWrite || uncertain || writing || reading"
              @click="decide(item, 'clear')"
              >{{ $t("settings.archives.match_clear") }}</Button
            >
          </div>
        </article>
        <div class="flex flex-wrap gap-2">
          <Button
            data-testid="archive-match-previous"
            variant="outline"
            :disabled="page.offset === 0 || reading || writing"
            @click="previousPage"
            >{{ $t("settings.archives.match_previous") }}</Button
          >
          <Button
            data-testid="archive-match-next"
            variant="outline"
            :disabled="!page.has_more || reading || writing"
            @click="nextPage"
            >{{ $t("settings.archives.match_next") }}</Button
          >
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import type {
  ArchiveMatchCandidate,
  ArchiveMatchClassification,
  ArchiveMatchDecisionResult,
  ArchiveMatchReviewItem,
  ArchiveMatchReviewPage,
} from "@/library-manager/enrichment";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";

const props = defineProps<{
  subscriptionId: string;
  versionId: string;
  pageSize: number;
}>();
const canRead = computed(() =>
  authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE),
);
const canWrite = computed(
  () => canRead.value && authManager.hasScope(Scope.LIBRARY_WRITE),
);
const classifications: ArchiveMatchClassification[] = [
  "unmatched",
  "candidate",
  "ambiguous",
  "approved",
  "rejected",
];
const filter = ref<ArchiveMatchClassification | "all">("all");
const page = ref<ArchiveMatchReviewPage>();
const opened = ref(false);
const reading = ref(false);
const writing = ref(false);
const uncertain = ref(false);
const error = ref("");
let generation = 0;
let alive = true;
const timers = new Set<ReturnType<typeof setTimeout>>();
const visibleItems = computed(() =>
  filter.value === "all"
    ? (page.value?.items ?? [])
    : (page.value?.items ?? []).filter(
        (item) => item.classification === filter.value,
      ),
);
const request = <T,>(name: string, args: Record<string, unknown>) =>
  api.sendCommand<T>(`library_enrichment/${name}`, args, {
    suppressGlobalError: true,
  });
const errorText = (value: unknown) =>
  value && typeof value === "object" && "message" in value
    ? String(value.message)
    : String(value);
function evidence(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}
function evidenceValue(value: Record<string, unknown>, key: string) {
  const result = value[key];
  return typeof result === "string" || typeof result === "number"
    ? String(result)
    : "";
}
function metadata(candidate: ArchiveMatchCandidate, key: string) {
  return evidenceValue(candidate.asset.metadata, key);
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error($t("settings.archives.match_timeout"))),
          15000,
        );
        timers.add(timer);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
      timers.delete(timer);
    }
  }
}
function validPage(result: ArchiveMatchReviewPage, expectedOffset: number) {
  return (
    result.version_id === props.versionId &&
    result.subscription_id === props.subscriptionId &&
    result.limit === props.pageSize &&
    result.offset === expectedOffset &&
    Number.isInteger(result.total) &&
    result.total >= 0 &&
    Array.isArray(result.items) &&
    (result.candidate_freshness === "fresh" ||
      result.candidate_freshness === "stale") &&
    result.items.every(
      (item) =>
        Number.isInteger(item.position) &&
        item.position >= 0 &&
        !!item.source_item_id &&
        classifications.includes(item.classification) &&
        Number.isInteger(item.match?.revision) &&
        item.match.revision >= 0 &&
        Array.isArray(item.match.candidates),
    )
  );
}
async function load(offset: number, clearsUncertain = false) {
  if (!canRead.value || reading.value || writing.value || !alive) return;
  const token = ++generation;
  reading.value = true;
  error.value = "";
  try {
    const result = await bounded(
      request<ArchiveMatchReviewPage>("match_review", {
        version_id: props.versionId,
        limit: props.pageSize,
        offset,
      }),
    );
    if (!alive || token !== generation || !canRead.value) return;
    if (!validPage(result, offset))
      throw new Error($t("settings.archives.match_invalid_response"));
    page.value = result;
    if (clearsUncertain) uncertain.value = false;
  } catch (value) {
    if (alive && token === generation) error.value = errorText(value);
  } finally {
    if (alive && token === generation) reading.value = false;
  }
}
function open() {
  if (!canRead.value || opened.value) return;
  opened.value = true;
  void load(0);
}
function refresh() {
  void load(page.value?.offset ?? 0, true);
}
function previousPage() {
  if (!page.value) return;
  void load(Math.max(0, page.value.offset - props.pageSize));
}
function nextPage() {
  if (!page.value?.has_more) return;
  void load(page.value.offset + page.value.limit);
}
async function decide(
  item: ArchiveMatchReviewItem,
  action: "approve" | "reject" | "clear",
  assetId?: string,
) {
  if (!canWrite.value || uncertain.value || reading.value || writing.value)
    return;
  const token = generation;
  writing.value = true;
  error.value = "";
  try {
    const result = await bounded(
      request<ArchiveMatchDecisionResult>("set_match_decision", {
        version_id: props.versionId,
        source_item_id: item.source_item_id,
        expected_revision: item.match.revision,
        action,
        ...(assetId ? { asset_id: assetId } : {}),
      }),
    );
    if (!alive || token !== generation || !canWrite.value || !page.value)
      return;
    if (
      result.match.source.source_item_id !== item.source_item_id ||
      result.match.revision !== item.match.revision + 1 ||
      !classifications.includes(result.classification)
    )
      throw new Error($t("settings.archives.match_invalid_response"));
    page.value.items = page.value.items.map((occurrence) =>
      occurrence.source_item_id === item.source_item_id
        ? {
            ...occurrence,
            match: result.match,
            classification: result.classification,
          }
        : occurrence,
    );
  } catch (value) {
    if (alive && token === generation) {
      uncertain.value = true;
      error.value = errorText(value);
    }
  } finally {
    if (alive && token === generation) writing.value = false;
  }
}
watch(
  [() => props.subscriptionId, () => props.versionId, canRead],
  () => {
    generation++;
    page.value = undefined;
    opened.value = false;
    reading.value = false;
    writing.value = false;
    uncertain.value = false;
    error.value = "";
    filter.value = "all";
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
  for (const timer of timers) clearTimeout(timer);
});
</script>

<style scoped>
.match-input {
  display: block;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.5rem;
  background: var(--background);
}
</style>
