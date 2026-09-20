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
        <div v-if="uploadSupported" class="space-y-2 rounded-lg border p-3">
          <label class="block space-y-1 text-sm">
            <span>{{ $t("settings.itunes_import.upload") }}</span>
            <input
              data-testid="itunes-zip-file"
              class="block w-full text-sm"
              type="file"
              accept=".zip,application/zip"
              :disabled="reading || uploading"
              @change="selectZipFile"
            />
          </label>
          <p class="text-xs text-muted-foreground">
            {{
              $t("settings.itunes_import.upload_help", {
                maximum: formatBytes(maxUploadBytes),
              })
            }}
          </p>
          <p v-if="selectedZipTooLarge" role="alert" class="text-destructive">
            {{ $t("settings.itunes_import.upload_too_large") }}
          </p>
          <Button
            data-testid="itunes-zip-upload"
            variant="outline"
            :disabled="!canUpload"
            @click="uploadZip"
            >{{
              $t(
                uploading
                  ? "settings.itunes_import.uploading"
                  : "settings.itunes_import.upload_action",
              )
            }}</Button
          >
        </div>
        <p v-if="uploadSupported" class="text-sm text-muted-foreground">
          {{ $t("settings.itunes_import.path_alternative") }}
        </p>
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
            <p data-testid="itunes-source-kind">
              {{
                $t("settings.itunes_import.source_kind", {
                  kind: $t(
                    `settings.itunes_import.source_${inspection.source_kind}`,
                  ),
                })
              }}
            </p>
          </div>
          <div
            v-if="inspection.package"
            data-testid="itunes-package-inventory"
            class="space-y-1 rounded-lg border p-3"
          >
            <p class="font-medium">
              {{ $t("settings.itunes_import.package_inventory") }}
            </p>
            <p>
              {{
                $t("settings.itunes_import.package_counts", {
                  entries: inspection.package.entries_total,
                  files: inspection.package.files_total,
                  media: inspection.package.media_files_total,
                  xml: inspection.package.xml_candidates_total,
                })
              }}
            </p>
            <p>
              {{
                $t("settings.itunes_import.package_size", {
                  compressed: formatBytes(inspection.package.compressed_bytes),
                  uncompressed: formatBytes(
                    inspection.package.uncompressed_bytes,
                  ),
                })
              }}
            </p>
            <p class="break-words">
              {{
                $t("settings.itunes_import.selected_xml", {
                  path: inspection.package.selected_xml_path,
                })
              }}
            </p>
            <p
              v-for="warning in inspection.package.warnings"
              :key="warning"
              class="text-muted-foreground"
            >
              {{ warning }}
            </p>
          </div>
          <div
            v-if="inspection.localization"
            data-testid="itunes-localization-preview"
            class="space-y-1 rounded-lg border p-3"
          >
            <p class="font-medium">
              {{ $t("settings.itunes_import.localization_preview") }}
            </p>
            <p>
              {{
                $t("settings.itunes_import.localization_counts", {
                  files: inspection.localization.files_total,
                  bytes: formatBytes(inspection.localization.bytes_total),
                  conflicts: inspection.localization.conflicts,
                })
              }}
            </p>
            <p class="break-words">
              {{
                $t("settings.itunes_import.proposed_root", {
                  root: inspection.localization.proposed_root,
                })
              }}
            </p>
            <p class="text-muted-foreground">
              {{ $t("settings.itunes_import.localization_read_only") }}
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { hasHomeAssistantIngressPath } from "@/helpers/ingress";
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
const zipSupported = ref(false);
const uploadSupported = ref(false);
const maxUploadBytes = ref(0);
const selectedZip = ref<File>();
const libraryPath = ref("");
const inspection = ref<ItunesImportInspection>();
const pathMappings = ref<ItunesPathMapping[]>([]);
const selectedPlaylistIds = ref<string[]>([]);
const preview = ref<ItunesImportPreview>();
const reading = ref(false);
const previewing = ref(false);
const uploading = ref(false);
const error = ref("");
let generation = 0;
let alive = true;

const validPath = computed(
  () =>
    /\.xml$/i.test(libraryPath.value) ||
    (zipSupported.value && /\.zip$/i.test(libraryPath.value)),
);
const selectedZipTooLarge = computed(
  () => !!selectedZip.value && selectedZip.value.size > maxUploadBytes.value,
);
const canUpload = computed(
  () =>
    uploadSupported.value &&
    !!selectedZip.value &&
    !selectedZipTooLarge.value &&
    !reading.value &&
    !uploading.value,
);
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
    (value.source_kind === "xml" || value.source_kind === "zip") &&
    Array.isArray(value.roots) &&
    Array.isArray(value.playlists) &&
    (value.source_kind !== "zip" ||
      (!!value.package && value.localization?.state === "preview_only"))
  );
}
function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit++;
  }
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unit]}`;
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
function selectZipFile(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedZip.value = input.files?.[0];
  invalidateInspection();
}
function uploadEndpoint(): string {
  const serverBase = api.baseUrl?.replace(/\/+$/, "");
  if (serverBase) return `${serverBase}/library-enrichment/itunes-upload`;
  const pathBase = hasHomeAssistantIngressPath()
    ? window.location.pathname.replace(/\/?$/, "/")
    : "/";
  return new URL(
    `${pathBase}library-enrichment/itunes-upload`,
    window.location.origin,
  ).toString();
}
async function uploadZip() {
  const file = selectedZip.value;
  if (!file || !canUpload.value) return;
  const token = ++generation;
  uploading.value = true;
  error.value = "";
  try {
    const authToken = authManager.getToken();
    const ingress = hasHomeAssistantIngressPath();
    if (!authToken && !ingress)
      throw new Error($t("settings.itunes_import.upload_failed"));
    const headers: Record<string, string> = { "X-Filename": file.name };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const response = await fetch(uploadEndpoint(), {
      method: "POST",
      headers,
      body: file,
    });
    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as {
        detail?: unknown;
        error?: unknown;
      } | null;
      const detail =
        typeof failure?.detail === "string"
          ? failure.detail
          : typeof failure?.error === "string"
            ? failure.error
            : "";
      throw new Error(
        `${$t("settings.itunes_import.upload_failed")}${detail ? ` ${detail}` : ""}`,
      );
    }
    const result = (await response.json()) as { library_path?: unknown };
    if (!alive || token !== generation || selectedZip.value !== file) return;
    if (
      typeof result.library_path !== "string" ||
      !/\.zip$/i.test(result.library_path)
    )
      throw new Error($t("settings.itunes_import.invalid_response"));
    libraryPath.value = result.library_path;
    await nextTick();
    await inspectLibrary();
  } catch (value) {
    if (alive && token === generation)
      error.value = value instanceof Error ? value.message : String(value);
  } finally {
    if (alive && (token === generation || libraryPath.value))
      uploading.value = false;
  }
}
async function inspectLibrary() {
  if (!allowed.value || !supported.value || !validPath.value || reading.value)
    return;
  const token = ++generation;
  const sourcePath = libraryPath.value;
  reading.value = true;
  error.value = "";
  preview.value = undefined;
  try {
    const result = await api.sendCommand<ItunesImportInspection>(
      "library_enrichment/itunes_inspect",
      { library_path: sourcePath },
      { suppressGlobalError: true },
    );
    if (!alive || token !== generation || libraryPath.value !== sourcePath)
      return;
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
    if (alive && token === generation) {
      supported.value =
        result.api_version === 1 &&
        result.itunes_import === true &&
        result.itunes_import_api_version === 1;
      zipSupported.value =
        supported.value &&
        result.itunes_zip_packages === true &&
        result.itunes_zip_api_version === 1;
      uploadSupported.value =
        zipSupported.value &&
        result.itunes_zip_upload === true &&
        result.itunes_zip_upload_api_version === 1 &&
        typeof result.max_itunes_zip_upload_bytes === "number" &&
        result.max_itunes_zip_upload_bytes > 0;
      maxUploadBytes.value = uploadSupported.value
        ? result.max_itunes_zip_upload_bytes!
        : 0;
    }
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
  [data-testid="itunes-zip-upload"],
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
