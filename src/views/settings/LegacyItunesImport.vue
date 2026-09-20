<template>
  <Card class="mb-4" data-testid="itunes-import">
    <CardHeader>
      <CardTitle>{{ $t("settings.itunes_import.title") }}</CardTitle>
      <CardDescription>{{
        $t("settings.itunes_import.description")
      }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <p v-if="!allowed" role="alert">
        {{ $t("settings.itunes_import.permission") }}
      </p>
      <p v-else-if="checking" role="status">
        {{ $t("settings.itunes_import.checking") }}
      </p>
      <p v-else-if="!supported" role="alert">
        {{ $t("settings.itunes_import.unsupported") }}
      </p>
      <template v-else>
        <label class="block space-y-1 text-sm">
          <span>{{ $t("settings.itunes_import.path") }}</span>
          <input
            v-model.trim="libraryPath"
            data-testid="itunes-library-path"
            class="itunes-input"
            autocomplete="off"
            :disabled="reading"
          />
          <span class="text-xs text-muted-foreground">{{
            $t("settings.itunes_import.path_help")
          }}</span>
        </label>
        <Button
          data-testid="itunes-inspect"
          variant="outline"
          :disabled="!validPath || reading"
          @click="inspectLibrary"
          >{{
            $t(
              reading
                ? "settings.itunes_import.inspecting"
                : "settings.itunes_import.inspect",
            )
          }}</Button
        >

        <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
        <section
          v-if="inspection"
          data-testid="itunes-inspection"
          class="space-y-4 rounded-lg border p-3 text-sm"
        >
          <div>
            <p class="font-medium">
              {{ $t("settings.itunes_import.summary") }}
            </p>
            <p>
              {{
                $t("settings.itunes_import.counts", {
                  tracks: inspection.tracks_total,
                  playlists: inspection.playlists_total,
                })
              }}
            </p>
          </div>
          <div v-if="pathMappings.length" class="space-y-2">
            <p class="font-medium">
              {{ $t("settings.itunes_import.path_mappings") }}
            </p>
            <div
              v-for="(mapping, index) in pathMappings"
              :key="mapping.source_root"
              class="itunes-mapping grid gap-2 sm:grid-cols-2"
              data-testid="itunes-path-mapping"
            >
              <label class="min-w-0 space-y-1">
                <span>{{ $t("settings.itunes_import.old_root") }}</span>
                <input
                  :value="mapping.source_root"
                  class="itunes-input"
                  readonly
                />
              </label>
              <label class="min-w-0 space-y-1">
                <span>{{ $t("settings.itunes_import.current_root") }}</span>
                <input
                  v-model.trim="pathMappings[index].target_root"
                  class="itunes-input"
                  data-testid="itunes-target-root"
                />
              </label>
            </div>
          </div>
          <div class="space-y-2">
            <p class="font-medium">
              {{ $t("settings.itunes_import.playlists") }}
            </p>
            <p v-if="!selectablePlaylists.length" class="text-muted-foreground">
              {{ $t("settings.itunes_import.no_playlists") }}
            </p>
            <label
              v-for="playlist in inspection.playlists"
              :key="playlist.id"
              class="itunes-playlist flex items-start gap-2 rounded-md border p-2"
            >
              <input
                v-if="playlist.selectable"
                v-model="selectedPlaylistIds"
                type="checkbox"
                :value="playlist.id"
                data-testid="itunes-playlist"
              />
              <span class="min-w-0">
                <span class="block font-medium">{{ playlist.name }}</span>
                <span class="block text-muted-foreground">{{
                  $t("settings.itunes_import.playlist_tracks", {
                    count: playlist.track_count,
                  })
                }}</span>
                <span
                  v-if="!playlist.selectable"
                  class="block text-muted-foreground"
                  >{{
                    playlist.reason || $t("settings.itunes_import.excluded")
                  }}</span
                >
              </span>
            </label>
          </div>
          <Button
            data-testid="itunes-preview"
            :disabled="!canPreview || previewing"
            @click="previewImport"
            >{{
              $t(
                previewing
                  ? "settings.itunes_import.previewing"
                  : "settings.itunes_import.preview",
              )
            }}</Button
          >
          <div
            v-if="preview"
            data-testid="itunes-preview-result"
            class="rounded-lg border p-3"
          >
            <p class="font-medium">
              {{ $t("settings.itunes_import.preview_summary") }}
            </p>
            <p>
              {{
                $t("settings.itunes_import.preview_counts", {
                  selected_playlists: preview.selected_playlists,
                  source_tracks: preview.source_tracks,
                  matched: preview.matched,
                  unresolved: preview.unresolved,
                  ambiguous: preview.ambiguous,
                  unsupported: preview.unsupported,
                })
              }}
            </p>
            <p>{{ $t("settings.itunes_import.preview_read_only") }}</p>
          </div>
        </section>
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
import type {
  ArchiveCapabilities,
  ItunesImportInspection,
  ItunesImportPreview,
  ItunesPathMapping,
} from "@/library-manager/enrichment";
import { api } from "@/plugins/api";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { $t } from "@/plugins/i18n";

const allowed = computed(() =>
  authManager.hasScope(Scope.CONFIG_PROVIDERS_WRITE),
);
const checking = ref(false);
const supported = ref(false);
const libraryPath = ref("");
const inspection = ref<ItunesImportInspection>();
const pathMappings = ref<ItunesPathMapping[]>([]);
const selectedPlaylistIds = ref<string[]>([]);
const preview = ref<ItunesImportPreview>();
const reading = ref(false);
const previewing = ref(false);
const error = ref("");
let generation = 0;
let alive = true;

const validPath = computed(() => /\.xml$/i.test(libraryPath.value));
const selectablePlaylists = computed(
  () => inspection.value?.playlists.filter((item) => item.selectable) ?? [],
);
const canPreview = computed(
  () =>
    !!inspection.value &&
    selectedPlaylistIds.value.length > 0 &&
    pathMappings.value.every((item) => item.target_root.trim().length > 0),
);

function validInspection(value: ItunesImportInspection): boolean {
  return (
    value?.api_version === 1 &&
    !!value.inspection_id &&
    !!value.source_digest &&
    Array.isArray(value.roots) &&
    Array.isArray(value.playlists)
  );
}
function validPreview(
  value: ItunesImportPreview,
  source: ItunesImportInspection,
): boolean {
  return (
    value?.api_version === 1 &&
    !!value.inspection_id &&
    value.source_digest === source.source_digest &&
    !!value.preview_digest
  );
}
function invalidateInspection() {
  generation++;
  inspection.value = undefined;
  pathMappings.value = [];
  selectedPlaylistIds.value = [];
  preview.value = undefined;
  error.value = "";
}
function invalidatePreview() {
  generation++;
  preview.value = undefined;
  error.value = "";
}
async function inspectLibrary() {
  if (!allowed.value || !supported.value || !validPath.value || reading.value)
    return;
  const token = ++generation;
  reading.value = true;
  error.value = "";
  preview.value = undefined;
  try {
    const result = await api.sendCommand<ItunesImportInspection>(
      "library_enrichment/itunes_inspect",
      { library_path: libraryPath.value },
      { suppressGlobalError: true },
    );
    if (!alive || token !== generation) return;
    if (!validInspection(result))
      throw new Error($t("settings.itunes_import.invalid_response"));
    inspection.value = result;
    pathMappings.value = result.roots.map((root) => ({
      source_root: root.source_root,
      target_root: root.suggested_target || "",
    }));
    selectedPlaylistIds.value = [];
  } catch (value) {
    if (alive && token === generation)
      error.value = value instanceof Error ? value.message : String(value);
  } finally {
    if (alive && token === generation) reading.value = false;
  }
}
async function previewImport() {
  const source = inspection.value;
  if (!source || !canPreview.value || previewing.value) return;
  const token = ++generation;
  previewing.value = true;
  error.value = "";
  try {
    const result = await api.sendCommand<ItunesImportPreview>(
      "library_enrichment/itunes_preview",
      {
        inspection_id: source.inspection_id,
        source_digest: source.source_digest,
        path_mappings: pathMappings.value.map((item) => ({ ...item })),
        playlist_ids: [...selectedPlaylistIds.value],
      },
      { suppressGlobalError: true },
    );
    if (!alive || token !== generation) return;
    if (!validPreview(result, source))
      throw new Error($t("settings.itunes_import.invalid_response"));
    preview.value = result;
  } catch (value) {
    if (alive && token === generation)
      error.value = value instanceof Error ? value.message : String(value);
  } finally {
    if (alive && token === generation) previewing.value = false;
  }
}
async function initialize() {
  if (!allowed.value) return;
  const token = ++generation;
  checking.value = true;
  try {
    const result = await api.sendCommand<ArchiveCapabilities>(
      "library_enrichment/capabilities",
      {},
      { suppressGlobalError: true },
    );
    if (alive && token === generation)
      supported.value =
        result.api_version === 1 &&
        result.itunes_import === true &&
        result.itunes_import_api_version === 1;
  } catch {
    if (alive && token === generation) supported.value = false;
  } finally {
    if (alive && token === generation) checking.value = false;
  }
}

watch(libraryPath, invalidateInspection);
watch(pathMappings, invalidatePreview, { deep: true });
watch(selectedPlaylistIds, invalidatePreview, { deep: true });
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
void initialize();
</script>

<style scoped>
.itunes-input {
  display: block;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.5rem;
  background: var(--background);
  overflow-wrap: anywhere;
}
@media (max-width: 639px) {
  .itunes-mapping {
    grid-template-columns: minmax(0, 1fr);
  }
  [data-testid="itunes-inspect"],
  [data-testid="itunes-preview"] {
    width: 100%;
    min-height: 44px;
  }
  .itunes-playlist {
    min-height: 44px;
    overflow-wrap: anywhere;
  }
}
</style>
