<template>
  <section class="mt-3 space-y-2 border-t pt-3" data-testid="archive-apply">
    <p class="text-sm text-muted-foreground">
      {{ $t("settings.archives.apply_description") }}
    </p>
    <p v-if="!allowed" role="alert">
      {{ $t("settings.archives.apply_permission") }}
    </p>
    <template v-else>
      <div class="flex flex-wrap gap-2">
        <Button
          data-testid="archive-apply-preview"
          variant="outline"
          :disabled="reading || writing || active"
          @click="prepare"
          >{{ $t("settings.archives.apply_preview") }}</Button
        >
        <Button
          v-if="opened"
          data-testid="archive-apply-refresh"
          variant="outline"
          :disabled="reading"
          @click="refresh"
          >{{ $t("settings.archives.refresh") }}</Button
        >
      </div>
      <p v-if="reading" role="status">{{ $t("settings.archives.loading") }}</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <p v-if="paused" role="status">
        {{ $t("settings.archives.apply_polling_paused") }}
      </p>
      <div
        v-if="preview"
        data-testid="archive-apply-preview-result"
        class="space-y-2 rounded-lg border p-3"
      >
        <p class="font-medium">{{ preview.name }}</p>
        <p>
          {{
            $t("settings.archives.apply_counts", {
              source: preview.source_count,
              projected: preview.projected_count,
              omitted: preview.omitted.length,
            })
          }}
        </p>
        <div
          v-if="preview.omitted.length"
          role="alert"
          data-testid="archive-apply-omissions"
        >
          <p>{{ $t("settings.archives.apply_omissions") }}</p>
          <ul class="list-inside list-disc">
            <li
              v-for="item in preview.omitted.slice(0, 50)"
              :key="item.position"
            >
              {{
                $t("settings.archives.apply_omitted_item", {
                  position: item.position + 1,
                  state: item.state,
                })
              }}
            </li>
          </ul>
          <p v-if="preview.omitted.length > 50">
            {{
              $t("settings.archives.apply_more_omissions", {
                count: preview.omitted.length - 50,
              })
            }}
          </p>
        </div>
        <label
          v-if="preview.requires_partial_consent && canApprove"
          class="flex items-start gap-2"
        >
          <input
            v-model="partialConsent"
            data-testid="archive-apply-consent"
            type="checkbox"
            :disabled="writing"
          />
          <span>{{ $t("settings.archives.apply_partial_consent") }}</span>
        </label>
        <Button
          v-if="canApprove"
          data-testid="archive-apply-create"
          :disabled="
            writing ||
            reading ||
            (preview.requires_partial_consent && !partialConsent)
          "
          @click="apply"
          >{{ $t("settings.archives.apply_create") }}</Button
        >
      </div>
      <p v-if="writing" role="status">
        {{ $t("settings.archives.apply_sending") }}
      </p>
      <div
        v-if="status && status.state !== 'not_applied'"
        data-testid="archive-apply-status"
        class="space-y-2"
      >
        <p>{{ $t(`settings.archives.apply_state_${status.state}`) }}</p>
        <p v-if="status.error" role="alert" class="text-destructive">
          {{ status.error }}
        </p>
        <p
          v-if="status.state === 'uncertain' || status.state === 'conflict'"
          role="alert"
        >
          {{ $t("settings.archives.apply_reconcile") }}
        </p>
        <p v-if="completed">
          {{
            $t("settings.archives.apply_counts", {
              source: status.source_count ?? preview?.source_count ?? "—",
              projected:
                status.projected_count ?? preview?.projected_count ?? "—",
              omitted: status.omitted_count ?? preview?.omitted.length ?? "—",
            })
          }}
        </p>
        <Button
          v-if="completed && status.destination"
          data-testid="archive-apply-open"
          variant="outline"
          @click="openDestination"
          >{{
            $t("settings.archives.apply_open", {
              name: status.destination.name,
            })
          }}</Button
        >
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";
import type {
  ArchiveApplyPreview,
  ArchiveApplyStatus,
} from "@/library-manager/enrichment";

const props = defineProps<{ versionId: string }>();
const router = useRouter();
const allowed = computed(
  () =>
    authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE) &&
    authManager.hasScope(Scope.LIBRARY_WRITE),
);
const preview = ref<ArchiveApplyPreview>();
const status = ref<ArchiveApplyStatus>();
const opened = ref(false);
const reading = ref(false);
const writing = ref(false);
const error = ref("");
const partialConsent = ref(false);
const paused = ref(false);
const active = computed(
  () =>
    status.value?.state === "pending" ||
    status.value?.state === "prepared" ||
    status.value?.state === "applying",
);
const completed = computed(
  () => status.value?.state === "applied" || status.value?.state === "partial",
);
const canApprove = computed(
  () =>
    allowed.value &&
    !error.value &&
    !!preview.value &&
    !preview.value.already_applied &&
    (status.value?.state === "not_applied" ||
      (status.value?.state === "failed" && status.value.retryable === true)),
);
let alive = true;
let generation = 0;
let statusRevision = 0;
let pollCount = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
const readTimers = new Set<ReturnType<typeof setTimeout>>();
const request = <T,>(name: string, args: Record<string, unknown>) =>
  api.sendCommand<T>(`library_enrichment/${name}`, args, {
    suppressGlobalError: true,
  });
const errorText = (err: unknown) =>
  err && typeof err === "object" && "message" in err
    ? String(err.message)
    : String(err);
function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}
function isCurrent(token: number) {
  return alive && token === generation && allowed.value;
}
async function read<T>(name: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request<T>(name, { version_id: props.versionId }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error($t("settings.archives.apply_read_timeout"))),
          15000,
        );
        readTimers.add(timeout);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
      readTimers.delete(timeout);
    }
  }
}
function schedule() {
  stopPolling();
  if (!active.value || !alive) return;
  if (++pollCount >= 150) {
    paused.value = true;
    return;
  }
  pollTimer = setTimeout(() => {
    void refresh(false);
  }, 2000);
}
function validatePreview(result: ArchiveApplyPreview) {
  if (
    result.version_id !== props.versionId ||
    !result.projection_digest ||
    !Number.isInteger(result.source_count) ||
    !Number.isInteger(result.projected_count) ||
    result.projected_count < 0 ||
    !Array.isArray(result.omitted) ||
    result.source_count !== result.projected_count + result.omitted.length ||
    result.requires_partial_consent !== result.omitted.length > 0
  )
    throw new Error($t("settings.archives.apply_invalid_preview"));
}
async function prepare() {
  if (!allowed.value || reading.value || writing.value || active.value) return;
  const token = ++generation;
  stopPolling();
  preview.value = undefined;
  partialConsent.value = false;
  opened.value = true;
  reading.value = true;
  error.value = "";
  try {
    const result = await read<ArchiveApplyPreview>("apply_preview");
    if (!isCurrent(token)) return;
    validatePreview(result);
    const current = await read<ArchiveApplyStatus>("apply_status");
    if (!isCurrent(token)) return;
    preview.value = result;
    status.value = current;
    pollCount = 0;
    paused.value = false;
    schedule();
  } catch (err) {
    if (isCurrent(token)) error.value = errorText(err);
  } finally {
    if (isCurrent(token)) reading.value = false;
  }
}
async function refresh(reset = true) {
  if (!allowed.value || reading.value || !opened.value || !alive) return;
  const token = generation;
  const revision = ++statusRevision;
  stopPolling();
  reading.value = true;
  error.value = "";
  if (reset) {
    pollCount = 0;
    paused.value = false;
  }
  try {
    const current = await read<ArchiveApplyStatus>("apply_status");
    if (!isCurrent(token) || revision !== statusRevision) return;
    status.value = current;
    schedule();
  } catch (err) {
    if (isCurrent(token)) error.value = errorText(err);
  } finally {
    if (isCurrent(token)) reading.value = false;
  }
}
async function apply() {
  if (
    !canApprove.value ||
    !preview.value ||
    writing.value ||
    reading.value ||
    (preview.value.requires_partial_consent && !partialConsent.value)
  )
    return;
  const token = generation;
  const approved = preview.value;
  statusRevision++;
  writing.value = true;
  error.value = "";
  status.value = { state: "applying" };
  try {
    const result = await request<ArchiveApplyStatus>("apply", {
      version_id: approved.version_id,
      expected_digest: approved.projection_digest,
      allow_partial: partialConsent.value,
    });
    if (!isCurrent(token)) return;
    statusRevision++;
    status.value = result;
    partialConsent.value = false;
    // A failed/unknown attempt always requires another explicit preview.
    preview.value = undefined;
    pollCount = 0;
    schedule();
  } catch (err) {
    if (isCurrent(token)) {
      statusRevision++;
      if (!completed.value)
        status.value = { state: "uncertain", retryable: false };
      preview.value = undefined;
      error.value = errorText(err);
    }
  } finally {
    if (isCurrent(token)) writing.value = false;
  }
}
function openDestination() {
  const destination = status.value?.destination;
  if (
    !allowed.value ||
    !completed.value ||
    !destination?.item_id ||
    !destination.provider_instance
  )
    return;
  void router.push({
    name: "playlist",
    params: {
      provider: destination.provider_instance,
      itemId: destination.item_id,
    },
  });
}
watch(
  [() => props.versionId, allowed],
  () => {
    generation++;
    stopPolling();
    preview.value = undefined;
    status.value = undefined;
    partialConsent.value = false;
    reading.value = false;
    writing.value = false;
    opened.value = false;
    error.value = "";
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
  stopPolling();
  for (const timer of readTimers) clearTimeout(timer);
});
</script>
