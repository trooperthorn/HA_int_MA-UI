<template>
  <section
    class="mt-3 space-y-3 border-t pt-3"
    data-testid="archive-playback-policy"
  >
    <p v-if="!allowed" role="alert">
      {{ $t("settings.archives.playback_permission") }}
    </p>
    <Button
      v-else-if="!opened"
      data-testid="archive-playback-open"
      variant="outline"
      :disabled="reading"
      @click="open"
      >{{ $t("settings.archives.playback_open") }}</Button
    >
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="font-medium">
            {{ $t("settings.archives.playback_title") }}
          </p>
          <p class="text-muted-foreground">
            {{ $t("settings.archives.playback_description") }}
          </p>
        </div>
        <Button
          data-testid="archive-playback-refresh"
          variant="outline"
          :disabled="reading || writing"
          @click="refresh"
          >{{ $t("settings.archives.playback_refresh") }}</Button
        >
      </div>
      <p v-if="locked" role="alert" class="text-destructive">
        {{ $t("settings.archives.playback_uncertain") }}
      </p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <p v-if="reading" role="status">
        {{ $t("settings.archives.playback_loading") }}
      </p>
      <template v-if="policy">
        <label class="block space-y-1">
          <span>{{ $t("settings.archives.playback_mode") }}</span>
          <select
            v-model="selectedMode"
            data-testid="archive-playback-mode"
            class="archive-input"
            :disabled="reading || writing || locked"
          >
            <option v-for="mode in modes" :key="mode" :value="mode">
              {{ $t(`settings.archives.playback_mode_${mode}`) }}
            </option>
          </select>
        </label>
        <p class="text-sm text-muted-foreground">
          {{
            $t(`settings.archives.playback_mode_${selectedMode}_description`)
          }}
        </p>
        <p v-if="selectedMode === 'local_only'" role="alert">
          {{ $t("settings.archives.playback_local_only_warning") }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            data-testid="archive-playback-save"
            variant="outline"
            :disabled="!dirty || reading || writing || locked"
            @click="savePolicy"
            >{{ $t("settings.archives.playback_save") }}</Button
          >
          <Button
            data-testid="archive-playback-preview"
            variant="outline"
            :disabled="dirty || reading || writing || locked"
            @click="previewProjection"
            >{{ $t("settings.archives.playback_preview") }}</Button
          >
        </div>
      </template>
      <div
        v-if="preview"
        data-testid="archive-playback-preview-result"
        class="space-y-2 rounded-lg border p-3"
      >
        <p>
          {{
            $t("settings.archives.playback_counts", {
              source: preview.source_count,
              local: localCount,
              spotify: spotifyCount,
              omitted: preview.omitted_count,
            })
          }}
        </p>
        <div
          v-if="omittedGaps.length"
          data-testid="archive-playback-gaps"
          role="alert"
        >
          <p>{{ $t("settings.archives.playback_gaps") }}</p>
          <ul class="list-inside list-disc">
            <li
              v-for="gap in omittedGaps.slice(0, 50)"
              :key="`${gap.position}:${gap.reason}`"
            >
              {{
                $t("settings.archives.playback_gap", {
                  position: gap.position + 1,
                  reason: gap.reason,
                })
              }}
            </li>
          </ul>
        </div>
        <div v-if="fallbacks.length" data-testid="archive-playback-fallbacks">
          <p>{{ $t("settings.archives.playback_fallbacks") }}</p>
          <ul class="list-inside list-disc">
            <li
              v-for="item in fallbacks.slice(0, 50)"
              :key="`${item.position}:${item.fallback}`"
            >
              {{
                $t("settings.archives.playback_fallback", {
                  position: item.position + 1,
                  reason: item.fallback,
                })
              }}
            </li>
          </ul>
        </div>
        <label
          v-if="preview.requires_partial_consent"
          class="flex items-start gap-2"
        >
          <input
            v-model="partialConsent"
            data-testid="archive-playback-consent"
            type="checkbox"
            :disabled="writing || locked"
          />
          <span>{{ $t("settings.archives.playback_partial_consent") }}</span>
        </label>
        <Button
          data-testid="archive-playback-apply"
          :disabled="
            writing ||
            reading ||
            locked ||
            (preview.requires_partial_consent && !partialConsent)
          "
          @click="applyProjection"
          >{{ $t("settings.archives.playback_apply") }}</Button
        >
      </div>
      <p v-if="writing" role="status">
        {{ $t("settings.archives.playback_sending") }}
      </p>
      <div
        v-if="status && status.state !== 'not_applied'"
        data-testid="archive-playback-status"
      >
        <p>{{ $t(`settings.archives.playback_state_${status.state}`) }}</p>
        <p v-if="status.error" role="alert" class="text-destructive">
          {{ status.error }}
        </p>
        <Button
          v-if="canDetach && status.destination && !locked"
          data-testid="archive-playback-detach"
          variant="outline"
          :disabled="reading || writing"
          @click="detachProjection"
          >{{ $t("settings.archives.playback_detach") }}</Button
        >
      </div>
      <p v-if="detachedDestination" role="status">
        {{
          $t("settings.archives.playback_detached", { id: detachedDestination })
        }}
      </p>
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
  ArchivePlaybackPolicy,
  ArchivePlaybackPolicyMode,
  ArchivePlaybackPreview,
  ArchivePlaybackProjectionStatus,
  ArchivePlaybackStatus,
} from "@/library-manager/enrichment";

const props = defineProps<{
  subscriptionId: string;
  versionId: string;
  modes: ArchivePlaybackPolicyMode[];
  canDetach?: boolean;
}>();
const allowed = computed(
  () =>
    authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE) &&
    authManager.hasScope(Scope.LIBRARY_WRITE),
);
const opened = ref(false);
const reading = ref(false);
const writing = ref(false);
const locked = ref(false);
const error = ref("");
const policy = ref<ArchivePlaybackPolicy>();
const selectedMode = ref<ArchivePlaybackPolicyMode>("prefer_spotify");
const preview = ref<ArchivePlaybackPreview>();
const status = ref<ArchivePlaybackProjectionStatus>();
const partialConsent = ref(false);
const detachedDestination = ref("");
const dirty = computed(
  () => !!policy.value && selectedMode.value !== policy.value.mode,
);
const localCount = computed(
  () =>
    preview.value?.rows.filter((row) => row.selected_source === "local")
      .length ?? 0,
);
const spotifyCount = computed(
  () =>
    preview.value?.rows.filter((row) => row.selected_source === "spotify")
      .length ?? 0,
);
const fallbacks = computed(
  () => preview.value?.gaps.filter((gap) => !!gap.fallback) ?? [],
);
const omittedGaps = computed(
  () => preview.value?.gaps.filter((gap) => gap.omitted) ?? [],
);
let alive = true;
let generation = 0;
const request = <T,>(command: string, args: Record<string, unknown>) =>
  api.sendCommand<T>(`library_enrichment/${command}`, args, {
    suppressGlobalError: true,
  });
const errorText = (err: unknown) =>
  err && typeof err === "object" && "message" in err
    ? String(err.message)
    : String(err);
function current(token: number) {
  return alive && token === generation && allowed.value;
}
function validatePolicy(value: ArchivePlaybackPolicy) {
  if (
    value.subscription_id !== props.subscriptionId ||
    !props.modes.includes(value.mode) ||
    !Number.isInteger(value.revision) ||
    value.revision < 0
  )
    throw new Error($t("settings.archives.playback_invalid_response"));
}
function validatePreview(value: ArchivePlaybackPreview) {
  if (
    value.subscription_id !== props.subscriptionId ||
    value.version_id !== props.versionId ||
    value.mode !== policy.value?.mode ||
    value.policy_revision !== policy.value?.revision ||
    !value.projection_digest ||
    !Array.isArray(value.rows) ||
    !Array.isArray(value.gaps) ||
    !Number.isInteger(value.source_count) ||
    !Number.isInteger(value.projected_count) ||
    !Number.isInteger(value.omitted_count) ||
    value.projected_count !== value.rows.length ||
    value.omitted_count !== value.gaps.filter((gap) => gap.omitted).length ||
    value.source_count !== value.projected_count + value.omitted_count ||
    value.requires_partial_consent !== value.omitted_count > 0
  )
    throw new Error($t("settings.archives.playback_invalid_preview"));
}
async function load(token: number) {
  const savedStatus = await request<ArchivePlaybackStatus>("playback_status", {
    subscription_id: props.subscriptionId,
  });
  if (!current(token)) return;
  validatePolicy(savedStatus.policy);
  policy.value = savedStatus.policy;
  selectedMode.value = savedStatus.policy.mode;
  status.value = savedStatus.projection;
  locked.value = savedStatus.projection.state === "uncertain";
}
async function open() {
  if (!allowed.value || reading.value) return;
  opened.value = true;
  await refresh();
}
async function refresh() {
  if (!allowed.value || reading.value || writing.value) return;
  const token = ++generation;
  reading.value = true;
  error.value = "";
  preview.value = undefined;
  partialConsent.value = false;
  detachedDestination.value = "";
  try {
    await load(token);
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) reading.value = false;
  }
}
async function savePolicy() {
  if (
    !policy.value ||
    !dirty.value ||
    reading.value ||
    writing.value ||
    locked.value
  )
    return;
  const token = generation;
  writing.value = true;
  error.value = "";
  preview.value = undefined;
  try {
    const saved = await request<ArchivePlaybackPolicy>("set_playback_policy", {
      subscription_id: props.subscriptionId,
      mode: selectedMode.value,
      expected_revision: policy.value.revision,
    });
    if (!current(token)) return;
    validatePolicy(saved);
    policy.value = saved;
    selectedMode.value = saved.mode;
  } catch (err) {
    if (current(token)) {
      locked.value = true;
      error.value = errorText(err);
    }
  } finally {
    if (current(token)) writing.value = false;
  }
}
async function previewProjection() {
  if (
    !policy.value ||
    dirty.value ||
    reading.value ||
    writing.value ||
    locked.value
  )
    return;
  const token = generation;
  reading.value = true;
  error.value = "";
  preview.value = undefined;
  partialConsent.value = false;
  try {
    const result = await request<ArchivePlaybackPreview>("playback_preview", {
      version_id: props.versionId,
    });
    if (!current(token)) return;
    validatePreview(result);
    preview.value = result;
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) reading.value = false;
  }
}
async function applyProjection() {
  const approved = preview.value;
  if (
    !approved ||
    reading.value ||
    writing.value ||
    locked.value ||
    (approved.requires_partial_consent && !partialConsent.value)
  )
    return;
  const token = generation;
  writing.value = true;
  error.value = "";
  status.value = { state: "applying" };
  try {
    const result = await request<ArchivePlaybackProjectionStatus>(
      "playback_apply",
      {
        version_id: approved.version_id,
        expected_digest: approved.projection_digest,
        expected_policy_revision: approved.policy_revision,
        allow_partial: partialConsent.value,
      },
    );
    if (!current(token)) return;
    status.value = result;
    preview.value = undefined;
    partialConsent.value = false;
  } catch (err) {
    if (current(token)) {
      locked.value = true;
      preview.value = undefined;
      status.value = { state: "uncertain" };
      error.value = errorText(err);
    }
  } finally {
    if (current(token)) writing.value = false;
  }
}

async function detachProjection() {
  const destination = status.value?.destination;
  if (
    !props.canDetach ||
    !destination ||
    reading.value ||
    writing.value ||
    locked.value
  )
    return;
  const token = generation;
  writing.value = true;
  error.value = "";
  try {
    const result = await request<{
      subscription_id: string;
      state: "not_applied";
      detached_destination: { item_id: string };
    }>("playback_detach", {
      subscription_id: props.subscriptionId,
      expected_destination_item_id: destination.item_id,
      expected_content_digest: status.value?.destination_content_digest ?? null,
    });
    if (!current(token)) return;
    if (
      result.subscription_id !== props.subscriptionId ||
      result.state !== "not_applied" ||
      result.detached_destination?.item_id !== destination.item_id
    )
      throw new Error($t("settings.archives.playback_invalid_response"));
    status.value = { state: "not_applied" };
    preview.value = undefined;
    detachedDestination.value = destination.item_id;
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) writing.value = false;
  }
}
watch(
  [() => props.subscriptionId, () => props.versionId, allowed],
  () => {
    generation++;
    opened.value = false;
    reading.value = false;
    writing.value = false;
    locked.value = false;
    error.value = "";
    policy.value = undefined;
    preview.value = undefined;
    status.value = undefined;
    detachedDestination.value = "";
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
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
