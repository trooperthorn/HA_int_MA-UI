<template>
  <section class="mt-3 space-y-3 border-t pt-3" data-testid="archive-mirror">
    <p v-if="!allowed" role="alert">
      {{ $t("settings.archives.mirror_permission") }}
    </p>
    <Button
      v-else-if="!opened"
      data-testid="archive-mirror-open"
      variant="outline"
      @click="open"
    >
      {{ $t("settings.archives.mirror_open") }}
    </Button>
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="font-medium">{{ $t("settings.archives.mirror_title") }}</p>
          <p class="text-muted-foreground">
            {{ $t("settings.archives.mirror_description") }}
          </p>
        </div>
        <Button
          variant="outline"
          data-testid="archive-mirror-refresh"
          :disabled="busy"
          @click="refresh"
        >
          {{ $t("settings.archives.playback_refresh") }}
        </Button>
      </div>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <p v-if="busy" role="status">{{ $t("settings.archives.mirror_busy") }}</p>
      <div
        v-if="status"
        data-testid="archive-mirror-status"
        class="space-y-2 rounded-lg border p-3"
      >
        <p>{{ $t(`settings.archives.mirror_state_${status.state}`) }}</p>
        <p v-if="status.error" role="alert" class="text-destructive">
          {{ status.error }}
        </p>
        <p v-if="status.destination_item_id" class="break-all">
          {{
            $t("settings.archives.mirror_destination", {
              id: status.destination_item_id,
            })
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="!locked"
            variant="outline"
            data-testid="archive-mirror-preview"
            :disabled="busy"
            @click="loadPreview"
            >{{ $t("settings.archives.mirror_preview") }}</Button
          >
          <Button
            v-if="status.enabled && !locked"
            variant="outline"
            data-testid="archive-mirror-disable"
            :disabled="busy"
            @click="disable"
            >{{ $t("settings.archives.mirror_disable") }}</Button
          >
          <Button
            v-if="
              status.destination_item_id &&
              status.state !== 'detached' &&
              !locked
            "
            variant="outline"
            data-testid="archive-mirror-detach"
            :disabled="busy"
            @click="detach"
            >{{ $t("settings.archives.mirror_detach") }}</Button
          >
        </div>
      </div>
      <div
        v-if="preview"
        data-testid="archive-mirror-preview-result"
        class="space-y-2 rounded-lg border p-3"
      >
        <p>
          {{
            $t("settings.archives.mirror_counts", {
              source: preview.source_count,
              included: preview.projected_count,
              omitted: preview.omitted_count,
            })
          }}
        </p>
        <p v-if="preview.omitted_count" role="alert">
          {{ $t("settings.archives.mirror_omitted") }}
        </p>
        <label
          v-if="preview.requires_partial_consent && !status?.allow_partial"
          class="flex items-start gap-2"
        >
          <input
            v-model="partialConsent"
            type="checkbox"
            data-testid="archive-mirror-consent"
            :disabled="busy"
          />
          <span>{{ $t("settings.archives.mirror_partial_consent") }}</span>
        </label>
        <Button
          data-testid="archive-mirror-apply"
          :disabled="
            busy ||
            locked ||
            (preview.requires_partial_consent &&
              !status?.allow_partial &&
              !partialConsent)
          "
          @click="apply"
          >{{
            $t(
              status?.enabled
                ? "settings.archives.mirror_update"
                : "settings.archives.mirror_enable",
            )
          }}</Button
        >
      </div>
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
  ArchiveMirrorPreview,
  ArchiveMirrorStatus,
} from "@/library-manager/enrichment";

const props = defineProps<{ subscriptionId: string; versionId: string }>();
const allowed = computed(
  () =>
    authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE) &&
    authManager.hasScope(Scope.LIBRARY_WRITE),
);
const opened = ref(false);
const busy = ref(false);
const error = ref("");
const status = ref<ArchiveMirrorStatus>();
const preview = ref<ArchiveMirrorPreview>();
const partialConsent = ref(false);
const locked = computed(
  () =>
    status.value?.state === "writing" || status.value?.state === "uncertain",
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
const current = (token: number) =>
  alive && allowed.value && token === generation;

function validateStatus(value: ArchiveMirrorStatus) {
  if (
    value.subscription_id !== props.subscriptionId ||
    !Number.isInteger(value.revision) ||
    value.revision < 0 ||
    ![0, 1].includes(value.enabled) ||
    ![0, 1].includes(value.allow_partial)
  )
    throw new Error($t("settings.archives.mirror_invalid_response"));
}
function validatePreview(value: ArchiveMirrorPreview) {
  if (
    value.subscription_id !== props.subscriptionId ||
    value.version_id !== props.versionId ||
    !value.projection_digest ||
    !Array.isArray(value.omitted) ||
    value.omitted_count !== value.omitted.length ||
    value.projected_count + value.omitted_count !== value.source_count
  )
    throw new Error($t("settings.archives.mirror_invalid_response"));
}
async function open() {
  if (!allowed.value || busy.value) return;
  opened.value = true;
  await refresh();
}
async function refresh() {
  if (!allowed.value || busy.value) return;
  const token = ++generation;
  busy.value = true;
  error.value = "";
  preview.value = undefined;
  partialConsent.value = false;
  try {
    const result = await request<ArchiveMirrorStatus>("mirror_status", {
      subscription_id: props.subscriptionId,
    });
    if (!current(token)) return;
    validateStatus(result);
    status.value = result;
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) busy.value = false;
  }
}
async function loadPreview() {
  if (!status.value || busy.value || locked.value) return;
  const token = generation;
  busy.value = true;
  error.value = "";
  preview.value = undefined;
  try {
    const result = await request<ArchiveMirrorPreview>("mirror_preview", {
      subscription_id: props.subscriptionId,
    });
    if (!current(token)) return;
    validatePreview(result);
    preview.value = result;
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) busy.value = false;
  }
}
async function apply() {
  const target = preview.value;
  const saved = status.value;
  if (
    !target ||
    !saved ||
    busy.value ||
    locked.value ||
    (target.requires_partial_consent &&
      !saved.allow_partial &&
      !partialConsent.value)
  )
    return;
  const token = generation;
  busy.value = true;
  error.value = "";
  try {
    if (
      !saved.enabled ||
      (target.requires_partial_consent && !saved.allow_partial)
    ) {
      const configured = await request<ArchiveMirrorStatus>(
        "mirror_configure",
        {
          subscription_id: props.subscriptionId,
          enabled: true,
          allow_partial: !!saved.allow_partial || partialConsent.value,
          expected_revision: saved.revision,
        },
      );
      if (!current(token)) return;
      validateStatus(configured);
      status.value = configured;
    }
    const result = await request<ArchiveMirrorStatus>("mirror_apply", {
      subscription_id: props.subscriptionId,
      expected_version_id: target.version_id,
      expected_digest: target.projection_digest,
    });
    if (!current(token)) return;
    validateStatus(result);
    status.value = result;
    preview.value = undefined;
    partialConsent.value = false;
  } catch (err) {
    if (current(token)) {
      error.value = errorText(err);
      preview.value = undefined;
      try {
        const latest = await request<ArchiveMirrorStatus>("mirror_status", {
          subscription_id: props.subscriptionId,
        });
        if (current(token)) {
          validateStatus(latest);
          status.value = latest;
        }
      } catch {
        // Keep the original write error visible; the next explicit refresh can reconcile status.
      }
    }
  } finally {
    if (current(token)) busy.value = false;
  }
}
async function disable() {
  const saved = status.value;
  if (!saved?.enabled || busy.value || locked.value) return;
  const token = generation;
  busy.value = true;
  error.value = "";
  try {
    const result = await request<ArchiveMirrorStatus>("mirror_configure", {
      subscription_id: props.subscriptionId,
      enabled: false,
      allow_partial: !!saved.allow_partial,
      expected_revision: saved.revision,
    });
    if (!current(token)) return;
    validateStatus(result);
    status.value = result;
    preview.value = undefined;
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) busy.value = false;
  }
}
async function detach() {
  const saved = status.value;
  if (!saved?.destination_item_id || busy.value || locked.value) return;
  const token = generation;
  busy.value = true;
  error.value = "";
  try {
    const result = await request<ArchiveMirrorStatus>("mirror_detach", {
      subscription_id: props.subscriptionId,
      expected_destination_item_id: saved.destination_item_id,
      expected_content_digest: saved.destination_content_digest ?? null,
    });
    if (!current(token)) return;
    validateStatus(result);
    status.value = result;
    preview.value = undefined;
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) busy.value = false;
  }
}
watch(
  [() => props.subscriptionId, () => props.versionId, allowed],
  () => {
    generation++;
    opened.value = false;
    busy.value = false;
    error.value = "";
    status.value = undefined;
    preview.value = undefined;
    partialConsent.value = false;
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
</script>
