<template>
  <section
    class="mt-3 space-y-3 border-t pt-3"
    data-testid="archive-sync-policy"
  >
    <Button
      data-testid="sync-open"
      variant="outline"
      :disabled="!allowed || loading"
      @click="open"
      >{{ $t("settings.archives.sync_title") }}</Button
    >
    <p v-if="!allowed" role="alert">{{ $t("settings.archives.permission") }}</p>
    <template v-else-if="opened">
      <p class="text-sm text-muted-foreground">
        {{ $t("settings.archives.sync_description") }}
      </p>
      <p v-if="loading" role="status">{{ $t("settings.archives.loading") }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <Button
        v-if="error || uncertain"
        data-testid="sync-reload"
        variant="outline"
        :disabled="loading || saving || checking"
        @click="load"
        >{{ $t("settings.archives.sync_reload") }}</Button
      >
      <p v-if="uncertain" role="alert">
        {{ $t("settings.archives.sync_verify_saved") }}
      </p>
      <template v-if="policy">
        <fieldset class="space-y-2" :disabled="loading || saving || checking">
          <legend class="mb-2 font-medium">
            {{ $t("settings.archives.sync_mode") }}
          </legend>
          <label class="flex items-start gap-2"
            ><input
              v-model="mode"
              data-testid="sync-manual"
              type="radio"
              :name="`sync-mode-${subscriptionId}`"
              value="manual"
            /><span>{{ $t("settings.archives.sync_manual") }}</span></label
          >
          <label class="flex items-start gap-2"
            ><input
              v-model="mode"
              data-testid="sync-scheduled"
              type="radio"
              :name="`sync-mode-${subscriptionId}`"
              value="scheduled"
            /><span>{{ $t("settings.archives.sync_scheduled") }}</span></label
          >
          <div
            v-if="mode === 'scheduled'"
            class="flex flex-wrap items-end gap-2"
          >
            <label class="space-y-1"
              ><span>{{ $t("settings.archives.sync_interval") }}</span
              ><input
                v-model.number="amount"
                data-testid="sync-interval"
                class="block rounded-md border bg-background p-2"
                type="number"
                step="any"
                :min="bounds.min / unitSeconds"
                :max="bounds.max / unitSeconds"
            /></label>
            <label class="space-y-1"
              ><span>{{ $t("settings.archives.sync_unit") }}</span
              ><select
                v-model="unit"
                data-testid="sync-unit"
                class="block rounded-md border bg-background p-2"
              >
                <option value="hours">
                  {{ $t("settings.archives.sync_hours") }}
                </option>
                <option value="days">
                  {{ $t("settings.archives.sync_days") }}
                </option>
              </select></label
            >
          </div>
          <p v-if="mode === 'scheduled'" class="text-xs text-muted-foreground">
            {{
              $t("settings.archives.sync_bounds", {
                min: bounds.min / 3600,
                max: bounds.max / 3600,
              })
            }}
          </p>
        </fieldset>
        <p v-if="!validInterval" role="alert">
          {{ $t("settings.archives.sync_invalid_interval") }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            data-testid="sync-save"
            :disabled="!dirty || !validInterval || busy || uncertain"
            @click="save(false)"
            >{{ $t("settings.archives.sync_save") }}</Button
          >
          <Button
            v-if="policy.mode === 'scheduled'"
            data-testid="sync-pause"
            variant="outline"
            :disabled="busy || uncertain"
            @click="save(true)"
            >{{ $t("settings.archives.sync_pause") }}</Button
          >
          <Button
            data-testid="sync-now"
            variant="outline"
            :disabled="busy || uncertain || running || !statusFresh"
            @click="checkNow"
            >{{ $t("settings.archives.sync_now") }}</Button
          >
          <Button
            data-testid="sync-refresh"
            variant="outline"
            :disabled="busy"
            @click="refresh(true)"
            >{{ $t("settings.archives.refresh") }}</Button
          >
        </div>
        <p v-if="notice" role="status">{{ notice }}</p>
        <p v-if="paused" role="status">
          {{ $t("settings.archives.sync_polling_paused") }}
        </p>
        <div
          v-if="status"
          data-testid="sync-status"
          class="space-y-1 rounded-md border p-3 text-sm"
        >
          <p>
            {{
              $t(`settings.archives.sync_access_${status.state.access_state}`)
            }}
          </p>
          <p>
            {{
              $t("settings.archives.sync_last_check", {
                at: displayTime(status.state.last_check_at),
              })
            }}
          </p>
          <p>
            {{
              $t("settings.archives.sync_last_success", {
                at: displayTime(status.state.last_success_at),
              })
            }}
          </p>
          <p>
            {{
              $t("settings.archives.sync_next_check", {
                at: displayTime(status.state.next_check_at),
              })
            }}
          </p>
          <p>
            {{
              $t("settings.archives.sync_last_refresh", {
                at: displayTime(lastRefresh),
              })
            }}
          </p>
          <p v-if="!statusFresh" role="alert">
            {{ $t("settings.archives.sync_stale") }}
          </p>
          <p v-if="latestJob">
            {{ $t(`settings.archives.sync_job_${latestJob.state}`) }}
          </p>
          <p v-if="latestJob?.state === 'succeeded'">
            {{
              $t(
                latestJob.version_id
                  ? "settings.archives.sync_committed"
                  : "settings.archives.sync_unchanged",
              )
            }}
          </p>
          <p v-if="latestJob?.observed_snapshot" class="break-all">
            {{
              $t("settings.archives.snapshot", {
                snapshot: latestJob.observed_snapshot,
              })
            }}
          </p>
          <p v-if="status.state.consecutive_failures">
            {{
              $t("settings.archives.sync_failures", {
                count: status.state.consecutive_failures,
              })
            }}
          </p>
          <p
            v-if="status.state.last_error || latestJob?.error"
            role="alert"
            class="text-destructive"
          >
            {{ status.state.last_error || latestJob?.error }}
          </p>
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";
import type {
  ArchiveSyncPolicy,
  ArchiveSyncStatus,
} from "@/library-manager/enrichment";

const props = defineProps<{
  subscriptionId: string;
  bounds: { min: number; max: number };
}>();
const emit = defineEmits<{ committed: [versionId: string] }>();
const allowed = computed(() =>
  authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE),
);
const opened = ref(false);
const loading = ref(false);
const saving = ref(false);
const checking = ref(false);
const refreshing = ref(false);
const uncertain = ref(false);
const error = ref("");
const notice = ref("");
const policy = ref<ArchiveSyncPolicy>();
const status = ref<ArchiveSyncStatus>();
const statusFresh = ref(false);
const lastRefresh = ref<string>();
const mode = ref<"manual" | "scheduled">("manual");
const amount = ref<number | string>(24);
const unit = ref<"hours" | "days">("hours");
const paused = ref(false);
const unitSeconds = computed(() => (unit.value === "hours" ? 3600 : 86400));
const intervalSeconds = computed(() =>
  Math.round(Number(amount.value) * unitSeconds.value),
);
const validInterval = computed(
  () =>
    typeof amount.value === "number" &&
    Number.isFinite(amount.value) &&
    intervalSeconds.value >= props.bounds.min &&
    intervalSeconds.value <= props.bounds.max,
);
const dirty = computed(
  () =>
    !!policy.value &&
    (mode.value !== policy.value.mode ||
      intervalSeconds.value !== policy.value.interval_seconds),
);
const busy = computed(
  () => loading.value || saving.value || checking.value || refreshing.value,
);
const latestJob = computed(
  () =>
    status.value?.latest_job ??
    status.value?.jobs.reduce<ArchiveSyncStatus["jobs"][number] | undefined>(
      (latest, job) =>
        !latest || job.created_at > latest.created_at ? job : latest,
      undefined,
    ),
);
const running = computed(
  () =>
    status.value?.jobs.some(
      (job) => job.state === "queued" || job.state === "running",
    ) ?? false,
);
let alive = true;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pollCount = 0;
let notifiedVersion: string | undefined;
const timeouts = new Set<ReturnType<typeof setTimeout>>();
const current = (token: number) =>
  alive && token === generation && allowed.value;
const errorText = (err: unknown) =>
  err && typeof err === "object" && "message" in err
    ? String(err.message)
    : String(err);
const displayTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString()
    : $t("settings.archives.sync_no_time");
function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
async function request<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      api.sendCommand<T>(
        `library_enrichment/${name}`,
        { subscription_id: props.subscriptionId, ...args },
        { suppressGlobalError: true },
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error($t("settings.archives.sync_timeout"))),
          15000,
        );
        timeouts.add(timeout);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
      timeouts.delete(timeout);
    }
  }
}
function acceptPolicy(value: ArchiveSyncPolicy) {
  if (
    value.subscription_id !== props.subscriptionId ||
    !["manual", "scheduled"].includes(value.mode) ||
    !Number.isInteger(value.revision) ||
    !Number.isInteger(value.interval_seconds) ||
    value.interval_seconds < props.bounds.min ||
    value.interval_seconds > props.bounds.max
  )
    throw new Error($t("settings.archives.sync_invalid_policy"));
  policy.value = value;
  mode.value = value.mode;
  unit.value = value.interval_seconds % 86400 === 0 ? "days" : "hours";
  amount.value = value.interval_seconds / unitSeconds.value;
}
async function open() {
  opened.value = true;
  if (!policy.value) await load();
}
async function load() {
  if (!allowed.value || loading.value || saving.value || checking.value) return;
  const token = ++generation;
  stopPolling();
  refreshing.value = false;
  loading.value = true;
  error.value = "";
  try {
    const value = await request<ArchiveSyncPolicy>("sync_policy");
    if (!current(token)) return;
    acceptPolicy(value);
    uncertain.value = false;
    await refresh(true);
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) loading.value = false;
  }
}
async function save(pause: boolean) {
  if (
    !allowed.value ||
    !policy.value ||
    busy.value ||
    uncertain.value ||
    (!pause && !validInterval.value)
  )
    return;
  const token = generation;
  stopPolling();
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const value = await request<ArchiveSyncPolicy>("set_sync_policy", {
      expected_revision: policy.value.revision,
      mode: pause ? "manual" : mode.value,
      interval_seconds: pause
        ? policy.value.interval_seconds
        : intervalSeconds.value,
    });
    if (!current(token)) return;
    acceptPolicy(value);
    notice.value = $t(
      pause ? "settings.archives.sync_paused" : "settings.archives.sync_saved",
    );
    await refresh(true);
  } catch (err) {
    if (current(token)) {
      uncertain.value = true;
      error.value = errorText(err);
    }
  } finally {
    if (current(token)) saving.value = false;
  }
}
async function checkNow() {
  if (
    !allowed.value ||
    !policy.value ||
    busy.value ||
    uncertain.value ||
    running.value ||
    !statusFresh.value
  )
    return;
  const token = generation;
  stopPolling();
  checking.value = true;
  error.value = "";
  notice.value = "";
  try {
    await request("sync_now");
    if (!current(token)) return;
    notice.value = $t("settings.archives.sync_queued");
    await refresh(true);
  } catch (err) {
    if (current(token)) {
      uncertain.value = true;
      error.value = errorText(err);
    }
  } finally {
    if (current(token)) checking.value = false;
  }
}
async function refresh(reset = false) {
  if (!allowed.value || !policy.value || refreshing.value || !alive) return;
  const token = generation;
  stopPolling();
  refreshing.value = true;
  error.value = "";
  if (reset) {
    pollCount = 0;
    paused.value = false;
  }
  try {
    const result = await request<ArchiveSyncStatus>("sync_status");
    if (!current(token)) return;
    if (
      result.policy.subscription_id !== props.subscriptionId ||
      result.state.subscription_id !== props.subscriptionId ||
      !Array.isArray(result.jobs)
    )
      throw new Error($t("settings.archives.sync_invalid_policy"));
    status.value = result;
    statusFresh.value = true;
    lastRefresh.value = new Date().toISOString();
    const completed = latestJob.value;
    if (
      completed?.state === "succeeded" &&
      completed.version_id &&
      completed.version_id !== notifiedVersion
    ) {
      notifiedVersion = completed.version_id;
      emit("committed", completed.version_id);
    }
    if (result.policy.revision !== policy.value.revision) {
      uncertain.value = true;
      error.value = $t("settings.archives.sync_revision_changed");
      return;
    }
    if (running.value || result.policy.mode === "scheduled") {
      if (++pollCount >= 150) paused.value = true;
      else
        timer = setTimeout(
          () => {
            void refresh();
          },
          running.value ? 2000 : 30000,
        );
    }
  } catch (err) {
    if (current(token)) {
      statusFresh.value = false;
      error.value = errorText(err);
    }
  } finally {
    if (current(token)) refreshing.value = false;
  }
}
watch(
  [() => props.subscriptionId, allowed],
  () => {
    generation++;
    stopPolling();
    policy.value = undefined;
    notifiedVersion = undefined;
    status.value = undefined;
    statusFresh.value = false;
    lastRefresh.value = undefined;
    opened.value = false;
    loading.value = false;
    saving.value = false;
    checking.value = false;
    refreshing.value = false;
    uncertain.value = false;
    error.value = "";
    notice.value = "";
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
  stopPolling();
  for (const timeout of timeouts) clearTimeout(timeout);
});
</script>
