<template>
  <section v-if="canRead" class="mt-2" data-testid="archive-provenance">
    <Button
      v-if="!opened"
      data-testid="archive-provenance-open"
      variant="outline"
      :disabled="loading"
      @click="open"
      >{{ $t("settings.archives.provenance_open") }}</Button
    >
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="font-medium">
          {{ $t("settings.archives.provenance_title") }}
        </p>
        <Button
          data-testid="archive-provenance-refresh"
          variant="outline"
          :disabled="loading"
          @click="refresh"
          >{{ $t("settings.archives.provenance_refresh") }}</Button
        >
      </div>
      <p v-if="loading" role="status">
        {{ $t("settings.archives.provenance_loading") }}
      </p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <template v-if="page">
        <p class="text-muted-foreground">
          {{
            $t("settings.archives.provenance_page", {
              start: page.total ? page.offset + 1 : 0,
              end: Math.min(page.offset + page.items.length, page.total),
              total: page.total,
            })
          }}
        </p>
        <p
          v-if="!page.items.length && !loading"
          class="text-muted-foreground"
          data-testid="archive-provenance-empty"
        >
          {{ $t("settings.archives.provenance_empty") }}
        </p>
        <article
          v-for="item in page.items"
          :key="`${item.position}:${item.source_item_id}`"
          class="mt-2 space-y-2 rounded-lg border p-3"
          data-testid="archive-provenance-item"
        >
          <p class="font-medium break-all">
            {{
              $t("settings.archives.provenance_item", {
                position: item.position + 1,
                id: item.source_item_id,
              })
            }}
          </p>
          <p class="text-muted-foreground">
            {{
              $t("settings.archives.provenance_item_state", {
                state: item.state,
              })
            }}
          </p>
          <p v-if="!item.provenance" class="text-muted-foreground">
            {{ $t("settings.archives.provenance_unavailable") }}
          </p>
          <template v-else>
            <p class="break-all text-muted-foreground">
              {{
                $t("settings.archives.provenance_subject", {
                  provider: item.provenance.subject.provider_domain,
                  account: item.provenance.subject.account_id,
                })
              }}
            </p>
            <p
              v-if="!Object.keys(item.provenance.fields).length"
              class="text-muted-foreground"
            >
              {{ $t("settings.archives.provenance_no_fields") }}
            </p>
            <div
              v-for="(field, name) in item.provenance.fields"
              :key="name"
              class="rounded border p-2"
              data-testid="archive-provenance-field"
            >
              <p class="font-medium">{{ name }}</p>
              <p>
                {{
                  field.override
                    ? $t("settings.archives.provenance_effective_override", {
                        value: displayValue(field.override.value),
                      })
                    : $t("settings.archives.provenance_effective", {
                        value: displayValue(field.observation?.value),
                        state: field.observation?.state || "unknown",
                      })
                }}
              </p>
              <p v-if="field.override" class="text-muted-foreground">
                {{
                  $t("settings.archives.provenance_override", {
                    actor: field.override.actor_id,
                    at: field.override.created_at,
                  })
                }}
              </p>
              <p v-if="field.observation" class="text-muted-foreground">
                {{
                  $t("settings.archives.provenance_observation", {
                    source: field.observation.source,
                    value: displayValue(field.observation.value),
                  })
                }}
              </p>
              <p v-if="field.observation" class="text-muted-foreground">
                {{
                  $t("settings.archives.provenance_source", {
                    fetched: field.observation.fetched_at,
                    parser: field.observation.parser_version,
                  })
                }}
              </p>
            </div>
          </template>
        </article>
        <div class="mt-2 flex flex-wrap gap-2">
          <Button
            data-testid="archive-provenance-previous"
            variant="outline"
            :disabled="page.offset === 0 || loading"
            @click="previousPage"
            >{{ $t("settings.archives.provenance_previous") }}</Button
          >
          <Button
            data-testid="archive-provenance-next"
            variant="outline"
            :disabled="!page.has_more || loading"
            @click="nextPage"
            >{{ $t("settings.archives.provenance_next") }}</Button
          >
        </div>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import type { ArchiveProvenancePage } from "@/library-manager/enrichment";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";

const props = defineProps<{ versionId: string; pageSize: number }>();
const opened = ref(false);
const loading = ref(false);
const error = ref("");
const page = ref<ArchiveProvenancePage>();
let generation = 0;
let alive = true;

const canRead = computed(() =>
  authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE),
);
const errorText = (value: unknown) =>
  value && typeof value === "object" && "message" in value
    ? String(value.message)
    : String(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const OBSERVATION_STATES = new Set([
  "value",
  "stale",
  "missing",
  "empty",
  "not_loaded",
  "inaccessible",
]);
const validObservation = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    typeof value.state === "string" &&
    OBSERVATION_STATES.has(value.state) &&
    typeof value.source === "string" &&
    typeof value.fetched_at === "string" &&
    typeof value.parser_version === "string" &&
    (value.date_precision === null ||
      typeof value.date_precision === "string") &&
    (value.unit === null || typeof value.unit === "string"));
const validOverride = (value: unknown) =>
  value === null ||
  (isRecord(value) &&
    value.action === "set" &&
    Number.isInteger(value.revision) &&
    typeof value.actor_id === "string" &&
    typeof value.created_at === "string");
const validFields = (value: unknown) =>
  isRecord(value) &&
  Object.values(value).every(
    (field) =>
      isRecord(field) &&
      Number.isInteger(field.revision) &&
      validObservation(field.observation) &&
      validOverride(field.override) &&
      (field.override
        ? validOverride(field.effective)
        : validObservation(field.effective)),
  );

function displayValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  const rendered =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  return rendered.length > 300 ? `${rendered.slice(0, 297)}…` : rendered;
}

function validPage(result: ArchiveProvenancePage, offset: number) {
  return (
    result.api_version === 1 &&
    result.version_id === props.versionId &&
    typeof result.subscription_id === "string" &&
    result.limit === props.pageSize &&
    result.offset === offset &&
    result.raw_payload_inline === false &&
    Number.isInteger(result.total) &&
    result.total >= 0 &&
    typeof result.has_more === "boolean" &&
    Array.isArray(result.items) &&
    result.items.length <= props.pageSize &&
    result.items.every(
      (item) =>
        Number.isInteger(item.position) &&
        item.position >= 0 &&
        typeof item.state === "string" &&
        typeof item.source_item_id === "string" &&
        (item.provenance === null ||
          (isRecord(item.provenance.subject) &&
            typeof item.provenance.subject.provider_domain === "string" &&
            typeof item.provenance.subject.account_id === "string" &&
            typeof item.provenance.subject.media_type === "string" &&
            typeof item.provenance.subject.source_item_id === "string" &&
            validFields(item.provenance.fields))),
    )
  );
}

async function load(offset: number) {
  if (!canRead.value || loading.value || !alive) return;
  const token = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const result = await api.sendCommand<ArchiveProvenancePage>(
      "library_enrichment/provenance",
      { version_id: props.versionId, limit: props.pageSize, offset },
      { suppressGlobalError: true },
    );
    if (!alive || token !== generation || !canRead.value) return;
    if (!validPage(result, offset))
      throw new Error($t("settings.archives.provenance_invalid_response"));
    page.value = result;
  } catch (value) {
    if (alive && token === generation) error.value = errorText(value);
  } finally {
    if (alive && token === generation) loading.value = false;
  }
}
function open() {
  if (opened.value || !canRead.value) return;
  opened.value = true;
  void load(0);
}
function refresh() {
  void load(page.value?.offset ?? 0);
}
function previousPage() {
  if (page.value) void load(Math.max(0, page.value.offset - props.pageSize));
}
function nextPage() {
  if (page.value?.has_more) void load(page.value.offset + page.value.limit);
}

watch(
  () => props.versionId,
  () => {
    generation++;
    page.value = undefined;
    error.value = "";
    opened.value = false;
    loading.value = false;
  },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
</script>
