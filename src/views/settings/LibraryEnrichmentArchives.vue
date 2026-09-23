<template>
  <Card class="mb-4" data-testid="archive-controls">
    <CardHeader>
      <CardTitle>{{ $t("settings.archives.title") }}</CardTitle>
      <CardDescription>{{
        $t("settings.archives.description")
      }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p v-if="!allowed" role="alert">
        {{ $t("settings.archives.permission") }}
      </p>
      <p v-else-if="checking" role="status">
        {{ $t("settings.archives.checking") }}
      </p>
      <div v-else-if="!capabilities" role="alert">
        <p>{{ $t("settings.archives.unsupported") }}</p>
        <p v-if="capabilityError" class="text-sm">{{ capabilityError }}</p>
        <Button variant="outline" @click="initialize">{{
          $t("settings.archives.retry")
        }}</Button>
      </div>
      <template v-else>
        <p v-if="!spotifyProviders.length" role="status">
          {{ $t("settings.archives.no_sources") }}
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1 text-sm">
            <span>{{ $t("settings.archives.provider") }}</span>
            <select
              v-model="providerId"
              data-testid="archive-provider"
              class="archive-input"
              :disabled="writing"
            >
              <option value="">
                {{ $t("settings.archives.choose_provider") }}
              </option>
              <option
                v-for="provider in spotifyProviders"
                :key="provider.instance_id"
                :value="provider.instance_id"
              >
                {{ provider.name }} · {{ provider.instance_id }}
              </option>
            </select>
          </label>
          <label class="space-y-1 text-sm">
            <span>{{ $t("settings.archives.playlist_id") }}</span>
            <input
              v-model.trim="playlistId"
              data-testid="archive-playlist-id"
              class="archive-input"
              :disabled="writing"
              autocomplete="off"
            />
          </label>
          <label v-if="capabilities.source_listing" class="space-y-1 text-sm">
            <span>{{ $t("settings.archives.library_playlists") }}</span>
            <select
              :value="playlistId"
              data-testid="archive-source"
              class="archive-input"
              :disabled="writing || !providerId"
              @change="playlistId = ($event.target as HTMLSelectElement).value"
            >
              <option value="">
                {{ $t("settings.archives.choose_playlist") }}
              </option>
              <option
                v-for="source in sources"
                :key="source.source_playlist_id"
                :value="source.source_playlist_id"
              >
                {{ source.name }} · {{ source.source_playlist_id }}
              </option>
            </select>
            <span class="text-xs text-muted-foreground">{{
              $t("settings.archives.loaded_sources", { count: sources.length })
            }}</span>
          </label>
          <label class="space-y-1 text-sm">
            <span>{{
              $t("settings.archives.max_items", { max: capabilities.max_items })
            }}</span>
            <input
              v-model.number="maxItems"
              data-testid="archive-limit"
              class="archive-input"
              type="number"
              min="1"
              :max="capabilities.max_items"
              step="1"
              :disabled="writing"
            />
          </label>
        </div>
        <div
          v-if="capabilities.source_listing && providerId"
          class="flex flex-wrap items-center gap-2"
        >
          <Button
            variant="outline"
            :disabled="loadingSources"
            @click="loadSources(false)"
            >{{ $t("settings.archives.reload_sources") }}</Button
          >
          <Button
            v-if="hasMoreSources"
            variant="outline"
            :disabled="loadingSources"
            @click="loadSources(true)"
            >{{ $t("settings.archives.more_sources") }}</Button
          >
          <span v-if="loadingSources" role="status">{{
            $t("settings.archives.loading")
          }}</span>
        </div>
        <p v-if="sourceError" role="alert" class="text-destructive">
          {{ sourceError }}
        </p>
        <p v-if="excludedSources" class="text-sm text-muted-foreground">
          {{
            $t("settings.archives.excluded_sources", { count: excludedSources })
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            data-testid="archive-preview"
            variant="outline"
            :disabled="!validSelection || previewing || writing"
            @click="previewSelection"
            >{{
              $t(
                previewing
                  ? "settings.archives.previewing"
                  : "settings.archives.preview",
              )
            }}</Button
          >
          <Button
            data-testid="archive-capture"
            :disabled="
              !preview ||
              !validSelection ||
              writing ||
              previewing ||
              pendingSelection
            "
            @click="captureSelection"
            >{{
              $t(
                writing
                  ? "settings.archives.sending"
                  : "settings.archives.capture",
              )
            }}</Button
          >
        </div>
        <div
          v-if="preview"
          data-testid="archive-preview-result"
          class="rounded-lg border p-3 text-sm"
        >
          <p class="font-medium">{{ preview.name }}</p>
          <p>
            {{
              $t("settings.archives.preview_details", {
                account: preview.account_id,
                count: preview.total,
              })
            }}
          </p>
          <p class="break-all">
            {{
              $t("settings.archives.snapshot", {
                snapshot: preview.snapshot_id,
              })
            }}
          </p>
          <p>{{ $t("settings.archives.metadata_only") }}</p>
          <p v-for="reason in preview.eligibility_reasons" :key="reason">
            {{ reason }}
          </p>
        </div>
        <p v-if="actionError" role="alert" class="text-destructive">
          {{ actionError }}
        </p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <div
          class="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
        >
          <h3 class="font-semibold">{{ $t("settings.archives.history") }}</h3>
          <Button
            data-testid="archive-refresh"
            variant="outline"
            :disabled="loadingStatus"
            @click="refreshStatus(true)"
            >{{ $t("settings.archives.refresh") }}</Button
          >
        </div>
        <p v-if="statusError" role="alert" class="text-destructive">
          {{ statusError }}
        </p>
        <p v-if="pollingPaused" role="status">
          {{ $t("settings.archives.polling_paused") }}
        </p>
        <div
          v-for="job in activeJobs"
          :key="job.id"
          class="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          data-testid="archive-job"
        >
          <div>
            <p>
              {{ jobName(job) }} ·
              {{ $t(`settings.archives.state_${job.state}`) }}
            </p>
            <p>
              {{
                $t("settings.archives.progress", {
                  received: job.received,
                  total: job.total ?? "—",
                })
              }}
              · {{ job.created_at }}
            </p>
            <p v-if="job.error" class="text-destructive">{{ job.error }}</p>
          </div>
          <Button
            v-if="job.state === 'pending'"
            data-testid="archive-cancel"
            variant="outline"
            :disabled="cancelling !== ''"
            @click="cancelJob(job.id)"
            >{{ $t("settings.archives.cancel") }}</Button
          >
        </div>
        <details
          v-if="historicalJobs.length"
          class="rounded-lg border text-sm"
          data-testid="archive-job-history"
        >
          <summary class="cursor-pointer p-3 font-medium">
            {{
              $t("settings.archives.job_history", {
                count: historicalJobs.length,
              })
            }}
          </summary>
          <div class="space-y-2 border-t p-3">
            <div
              v-for="job in visibleHistoricalJobs"
              :key="job.id"
              class="rounded border p-2"
              data-testid="archive-history-job"
            >
              <p>
                {{ jobName(job) }} ·
                {{ $t(`settings.archives.state_${job.state}`) }}
              </p>
              <p class="text-muted-foreground">
                {{
                  $t("settings.archives.progress", {
                    received: job.received,
                    total: job.total ?? "—",
                  })
                }}
                · {{ job.created_at }}
              </p>
              <p v-if="job.error" class="text-destructive">{{ job.error }}</p>
            </div>
            <Button
              v-if="historicalJobs.length > JOB_HISTORY_LIMIT"
              data-testid="archive-job-history-more"
              variant="outline"
              @click.prevent="showAllJobHistory = !showAllJobHistory"
              >{{
                $t(
                  showAllJobHistory
                    ? "settings.archives.job_history_less"
                    : "settings.archives.job_history_more",
                )
              }}</Button
            >
          </div>
        </details>
        <p
          v-if="!loadingStatus && !status.subscriptions.length && !statusError"
          class="text-sm text-muted-foreground"
        >
          {{ $t("settings.archives.no_archives") }}
        </p>
        <details
          v-for="subscription in status.subscriptions"
          :key="subscription.id"
          class="rounded-lg border text-sm"
          data-testid="archive-subscription"
        >
          <summary class="cursor-pointer list-none p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="font-medium">{{ subscription.name }}</p>
                <p class="text-muted-foreground">
                  {{ subscription.account_id }} ·
                  {{ subscription.provider_instance_id }}
                </p>
              </div>
              <span class="rounded border px-2 py-1">
                {{
                  subscription.committed_version_id
                    ? $t("settings.archives.history_ready")
                    : $t("settings.archives.not_committed")
                }}
              </span>
            </div>
          </summary>
          <div class="space-y-2 border-t p-3">
            <p class="break-all">{{ subscription.source_playlist_id }}</p>
            <ArchiveSyncPolicy
              v-if="syncBounds"
              :subscription-id="subscription.id"
              :bounds="syncBounds"
              @committed="refreshStatus(true)"
            />
            <p>
              {{
                $t("settings.archives.observed", {
                  snapshot: subscription.observed_snapshot || "—",
                })
              }}
            </p>
            <p>
              {{
                subscription.committed_version_id
                  ? $t("settings.archives.committed", {
                      snapshot: subscription.committed_snapshot,
                      at: subscription.committed_at,
                    })
                  : $t("settings.archives.not_committed")
              }}
            </p>
            <ArchivePlaylistApply
              v-if="
                capabilities.archive_apply && subscription.committed_version_id
              "
              :key="subscription.committed_version_id"
              :version-id="subscription.committed_version_id"
            />
            <ArchiveMatchReview
              v-if="matchPageSize && subscription.committed_version_id"
              :key="`matches:${subscription.committed_version_id}`"
              :subscription-id="subscription.id"
              :version-id="subscription.committed_version_id"
              :page-size="matchPageSize"
              :max-bulk-approvals="maxMatchApprovals"
            />
            <p
              v-else-if="subscription.committed_version_id"
              class="mt-2 text-muted-foreground"
            >
              {{ $t("settings.archives.apply_unavailable") }}
            </p>
            <ArchivePlaybackPolicy
              v-if="playbackModes.length && subscription.committed_version_id"
              :key="`playback:${subscription.committed_version_id}`"
              :subscription-id="subscription.id"
              :version-id="subscription.committed_version_id"
              :modes="playbackModes"
              :can-detach="capabilities.playback_detach === true"
            />
            <Button
              v-if="capabilities.version_listing"
              variant="outline"
              class="mt-2"
              :disabled="loadingVersions"
              @click="loadVersions(subscription.id)"
              >{{ $t("settings.archives.versions") }}</Button
            >
            <div
              v-if="versionSubscription === subscription.id"
              class="mt-2 space-y-1"
              data-testid="archive-versions"
            >
              <p v-if="versionError" role="alert" class="text-destructive">
                {{ versionError }}
              </p>
              <div v-for="version in versions" :key="version.id">
                <p>
                  {{
                    $t("settings.archives.version", {
                      snapshot: version.snapshot_id,
                      count: version.total,
                      at: version.created_at,
                    })
                  }}
                </p>
                <ArchiveVersionProvenance
                  v-if="provenancePageSize"
                  :version-id="version.id"
                  :page-size="provenancePageSize"
                />
              </div>
              <Button
                v-if="moreVersions"
                variant="outline"
                :disabled="loadingVersions"
                @click="loadVersions(subscription.id, true)"
                >{{ $t("settings.archives.more_versions") }}</Button
              >
              <p v-if="!loadingVersions && !versions.length && !versionError">
                {{ $t("settings.archives.not_committed") }}
              </p>
            </div>
          </div>
        </details>
      </template>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";
import ArchivePlaylistApply from "./ArchivePlaylistApply.vue";
import ArchiveMatchReview from "./ArchiveMatchReview.vue";
import ArchivePlaybackPolicy from "./ArchivePlaybackPolicy.vue";
import ArchiveSyncPolicy from "./ArchiveSyncPolicy.vue";
import ArchiveVersionProvenance from "./ArchiveVersionProvenance.vue";
import type {
  ArchiveCapabilities,
  ArchiveJob,
  ArchivePreview,
  ArchiveSelection,
  ArchiveSourcePage,
  ArchiveStatus,
  ArchiveVersion,
} from "@/library-manager/enrichment";

const allowed = computed(() =>
  authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE),
);
const spotifyProviders = computed(() =>
  Object.values(api.providers).filter(
    (provider) => provider.domain === "spotify" && provider.available,
  ),
);
const capabilities = ref<ArchiveCapabilities>();
const syncBounds = computed(() => {
  const caps = capabilities.value;
  const bounds = caps?.interval_bounds;
  return caps?.subscription_sync &&
    caps.sync_policy_api_version === 1 &&
    bounds &&
    Number.isInteger(bounds.min) &&
    Number.isInteger(bounds.max) &&
    bounds.min > 0 &&
    bounds.max >= bounds.min
    ? bounds
    : undefined;
});
const matchPageSize = computed(() => {
  const caps = capabilities.value;
  return caps?.local_matching &&
    (caps.match_review_api_version === 1 ||
      caps.match_review_api_version === 2) &&
    Number.isInteger(caps.max_match_review_page) &&
    Number(caps.max_match_review_page) > 0
    ? Math.min(100, Number(caps.max_match_review_page))
    : 0;
});
const maxMatchApprovals = computed(() => {
  const caps = capabilities.value;
  return caps?.match_review_api_version === 2 &&
    Number.isInteger(caps.max_match_approvals) &&
    Number(caps.max_match_approvals) > 0
    ? Math.min(200, Number(caps.max_match_approvals))
    : 0;
});
const provenancePageSize = computed(() => {
  const caps = capabilities.value;
  return caps?.provenance_read === true &&
    caps.provenance_api_version === 1 &&
    caps.raw_payload_inline === false &&
    Number.isInteger(caps.max_provenance_page) &&
    Number(caps.max_provenance_page) > 0
    ? Math.min(100, Number(caps.max_provenance_page))
    : 0;
});
const playbackModes = computed(() => {
  const caps = capabilities.value;
  const supported = ["prefer_local", "local_only", "prefer_spotify"] as const;
  return caps?.playback_policy &&
    caps.playback_policy_api_version === 1 &&
    Array.isArray(caps.playback_policy_modes)
    ? caps.playback_policy_modes.filter((mode) => supported.includes(mode))
    : [];
});
const checking = ref(false);
const capabilityError = ref("");
const providerId = ref("");
const playlistId = ref("");
const maxItems = ref<number | string>(10000);
const sources = ref<ArchiveSourcePage["items"]>([]);
const hasMoreSources = ref(false);
const excludedSources = ref(0);
const loadingSources = ref(false);
const sourceError = ref("");
const preview = ref<ArchivePreview>();
const previewing = ref(false);
const writing = ref(false);
const actionError = ref("");
const notice = ref("");
const status = ref<ArchiveStatus>({ subscriptions: [], jobs: [] });
const JOB_HISTORY_LIMIT = 5;
const showAllJobHistory = ref(false);
const activeJobs = computed(() =>
  status.value.jobs.filter((job) => job.state === "pending"),
);
const historicalJobs = computed(() =>
  status.value.jobs.filter((job) => job.state !== "pending"),
);
const visibleHistoricalJobs = computed(() =>
  showAllJobHistory.value
    ? historicalJobs.value
    : historicalJobs.value.slice(0, JOB_HISTORY_LIMIT),
);
const loadingStatus = ref(false);
const statusError = ref("");
const cancelling = ref("");
const pollingPaused = ref(false);
const versions = ref<ArchiveVersion[]>([]);
const versionSubscription = ref("");
const loadingVersions = ref(false);
const moreVersions = ref(false);
const versionError = ref("");
let alive = true;
let lifecycle = 0;
let selectionRevision = 0;
let sourcesRevision = 0;
let sourceOffset = 0;
let pollCount = 0;
let refreshRequested = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const POLL_LIMIT = 150;
const validSelection = computed(
  () =>
    allowed.value &&
    !!capabilities.value &&
    spotifyProviders.value.some(
      (provider) => provider.instance_id === providerId.value,
    ) &&
    /^[a-zA-Z0-9]{22}$/.test(playlistId.value) &&
    typeof maxItems.value === "number" &&
    Number.isInteger(maxItems.value) &&
    maxItems.value >= 1 &&
    maxItems.value <= capabilities.value.max_items,
);
const pendingSelection = computed(() =>
  status.value.jobs.some(
    (job) =>
      job.state === "pending" &&
      status.value.subscriptions.some(
        (subscription) =>
          subscription.id === job.subscription_id &&
          subscription.provider_instance_id === providerId.value &&
          subscription.source_playlist_id === playlistId.value,
      ),
  ),
);
const selection = (): ArchiveSelection => ({
  provider_instance_id: providerId.value,
  source_playlist_id: playlistId.value,
  max_items: Number(maxItems.value),
});
const request = <T,>(command: string, args?: Record<string, unknown>) =>
  api.sendCommand<T>(`library_enrichment/${command}`, args, {
    suppressGlobalError: true,
  });
const errorText = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error);
const jobName = (job: ArchiveJob) =>
  status.value.subscriptions.find(
    (subscription) => subscription.id === job.subscription_id,
  )?.name ?? job.subscription_id;
function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}

async function initialize() {
  const token = ++lifecycle;
  stopPolling();
  capabilities.value = undefined;
  preview.value = undefined;
  sourcesRevision++;
  providerId.value = "";
  sources.value = [];
  sourceError.value = "";
  status.value = { subscriptions: [], jobs: [] };
  showAllJobHistory.value = false;
  loadingStatus.value = false;
  refreshRequested = false;
  loadingVersions.value = false;
  versions.value = [];
  versionSubscription.value = "";
  if (!allowed.value) return;
  checking.value = true;
  capabilityError.value = "";
  try {
    const result = await request<ArchiveCapabilities>("capabilities");
    if (!alive || token !== lifecycle) return;
    if (
      result.api_version !== 1 ||
      !result.selected_capture ||
      !result.preview_preconditions ||
      !Number.isInteger(result.max_items) ||
      result.max_items < 1
    )
      throw new Error($t("settings.archives.unsupported"));
    capabilities.value = result;
    maxItems.value = Math.min(10000, result.max_items);
    await refreshStatus(true);
  } catch (error) {
    if (alive && token === lifecycle) capabilityError.value = errorText(error);
  } finally {
    if (alive && token === lifecycle) checking.value = false;
  }
}

async function loadSources(more: boolean) {
  const instance = providerId.value;
  const token = ++sourcesRevision;
  if (!allowed.value || !capabilities.value?.source_listing || !instance)
    return;
  const offset = more ? sourceOffset : 0;
  loadingSources.value = true;
  sourceError.value = "";
  try {
    const page = await request<ArchiveSourcePage>("sources", {
      provider_instance_id: instance,
      limit: 100,
      offset,
    });
    if (!alive || token !== sourcesRevision || !allowed.value) return;
    sources.value = [
      ...new Map(
        (more ? [...sources.value, ...page.items] : page.items).map((item) => [
          item.source_playlist_id,
          item,
        ]),
      ).values(),
    ];
    hasMoreSources.value = page.has_more;
    sourceOffset = page.offset + page.limit;
    excludedSources.value =
      (more ? excludedSources.value : 0) + (page.excluded?.length ?? 0);
  } catch (error) {
    if (alive && token === sourcesRevision)
      sourceError.value = errorText(error);
  } finally {
    if (alive && token === sourcesRevision) loadingSources.value = false;
  }
}

async function previewSelection() {
  if (!validSelection.value || previewing.value || writing.value) return;
  const revision = selectionRevision;
  const args = selection();
  previewing.value = true;
  preview.value = undefined;
  actionError.value = "";
  notice.value = "";
  try {
    const result = await request<ArchivePreview>("preview", { ...args });
    if (!alive || revision !== selectionRevision || !allowed.value) return;
    if (
      result.provider_instance_id !== args.provider_instance_id ||
      result.source_playlist_id !== args.source_playlist_id ||
      !result.account_id ||
      !result.snapshot_id ||
      !Number.isInteger(result.total) ||
      result.total < 0 ||
      result.total > args.max_items
    )
      throw new Error($t("settings.archives.invalid_preview"));
    preview.value = result;
  } catch (error) {
    if (alive && revision === selectionRevision)
      actionError.value = errorText(error);
  } finally {
    if (alive) previewing.value = false;
  }
}

async function captureSelection() {
  if (
    !validSelection.value ||
    !preview.value ||
    writing.value ||
    previewing.value ||
    pendingSelection.value
  )
    return;
  const approved = preview.value;
  writing.value = true;
  actionError.value = "";
  notice.value = "";
  try {
    await request("capture", {
      ...selection(),
      expected_account_id: approved.account_id,
      expected_snapshot_id: approved.snapshot_id,
    });
    if (!alive || !allowed.value) return;
    notice.value = $t("settings.archives.capture_queued");
    preview.value = undefined;
    await refreshStatus(true);
  } catch (error) {
    if (alive) {
      actionError.value = errorText(error);
      preview.value = undefined;
    }
  } finally {
    if (alive) writing.value = false;
  }
}

async function refreshStatus(reset = false) {
  if (loadingStatus.value) {
    refreshRequested ||= reset;
    return;
  }
  if (!allowed.value || !capabilities.value || loadingStatus.value || !alive)
    return;
  stopPolling();
  if (reset) {
    pollCount = 0;
    pollingPaused.value = false;
  }
  const token = lifecycle;
  loadingStatus.value = true;
  statusError.value = "";
  try {
    const result = await request<ArchiveStatus>("status");
    if (!alive || token !== lifecycle || !allowed.value) return;
    status.value = result;
    if (result.jobs.some((job) => job.state === "pending")) {
      if (++pollCount >= POLL_LIMIT) pollingPaused.value = true;
      else
        timer = setTimeout(() => {
          void refreshStatus();
        }, 2000);
    }
  } catch (error) {
    if (alive && token === lifecycle) statusError.value = errorText(error);
  } finally {
    if (alive && token === lifecycle) {
      loadingStatus.value = false;
      if (refreshRequested) {
        refreshRequested = false;
        void refreshStatus(true);
      }
    }
  }
}

async function cancelJob(id: string) {
  if (!allowed.value || cancelling.value) return;
  cancelling.value = id;
  actionError.value = "";
  try {
    const result = await request<{ cancelled: boolean; state: string }>(
      "cancel",
      { job_id: id },
    );
    if (!alive || !allowed.value) return;
    notice.value = $t(
      result.cancelled
        ? "settings.archives.cancelled"
        : result.state === "committed"
          ? "settings.archives.already_committed"
          : "settings.archives.stopping",
    );
    await refreshStatus(true);
  } catch (error) {
    if (alive) actionError.value = errorText(error);
  } finally {
    if (alive) cancelling.value = "";
  }
}

async function loadVersions(subscriptionId: string, more = false) {
  if (
    !allowed.value ||
    !capabilities.value?.version_listing ||
    loadingVersions.value
  )
    return;
  const token = lifecycle;
  loadingVersions.value = true;
  versionError.value = "";
  versionSubscription.value = subscriptionId;
  if (!more) {
    versions.value = [];
    moreVersions.value = false;
  }
  try {
    const page = await request<ArchiveVersion[]>("versions", {
      subscription_id: subscriptionId,
      limit: 50,
      offset: versions.value.length,
    });
    if (!alive || token !== lifecycle || !allowed.value) return;
    versions.value.push(...page);
    moreVersions.value = page.length === 50;
  } catch (error) {
    if (alive && token === lifecycle) versionError.value = errorText(error);
  } finally {
    if (alive && token === lifecycle) loadingVersions.value = false;
  }
}

watch(
  [providerId, playlistId, maxItems],
  () => {
    selectionRevision++;
    preview.value = undefined;
    actionError.value = "";
    notice.value = "";
  },
  { flush: "sync" },
);
watch(
  providerId,
  () => {
    playlistId.value = "";
    sourcesRevision++;
    sources.value = [];
    hasMoreSources.value = false;
    excludedSources.value = 0;
    loadingSources.value = false;
    sourceError.value = "";
    void loadSources(false);
  },
  { flush: "sync" },
);
watch(
  allowed,
  () => {
    selectionRevision++;
    void initialize();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
  lifecycle++;
  sourcesRevision++;
  selectionRevision++;
  stopPolling();
});
</script>

<style scoped>
.archive-input {
  display: block;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.5rem;
  background: var(--background);
}
</style>
