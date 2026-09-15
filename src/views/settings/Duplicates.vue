<template>
  <div class="p-4">
    <SettingsHeaderCard
      :icon="CopyIcon"
      icon-class="text-amber-600"
      :title="$t('settings.duplicates.title')"
      :description="$t('settings.duplicates.description')"
      :show-advanced-toggle="false"
    />

    <div class="duplicates">
      <!-- the scan and what it found -->
      <div class="duplicates__toolbar">
        <Button
          type="button"
          :disabled="scanning"
          data-duplicates-scan
          @click="scan()"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': scanning }" />
          {{
            $t(
              groups.length || cues.length
                ? "settings.duplicates.rescan"
                : "settings.duplicates.scan",
            )
          }}
        </Button>
        <span class="duplicates__status" data-duplicates-status>
          <template v-if="scanning">
            {{ $t("settings.duplicates.scanning", { count: scanned }) }}
          </template>
          <template v-else-if="scannedAt">
            {{
              $t("settings.duplicates.summary", {
                tracks: scanned,
                groups: groups.length,
                cues: cues.length,
              })
            }}
          </template>
          <template v-else>{{
            $t("settings.duplicates.not_scanned")
          }}</template>
        </span>
        <Button
          v-if="groups.length || cues.length"
          type="button"
          variant="outline"
          data-duplicates-export
          @click="exportCsv()"
        >
          <Download class="size-4" />
          {{ $t("settings.duplicates.export") }}
        </Button>
      </div>

      <div v-if="scannedAt" class="duplicates__filters">
        <label class="duplicates__filter">
          {{ $t("settings.duplicates.filter_kind") }}
          <select
            v-model="kindFilter"
            class="duplicates__select"
            data-duplicates-kind
          >
            <option value="all">
              {{ $t("settings.duplicates.kind_all") }}
            </option>
            <option v-for="kind in KINDS" :key="kind" :value="kind">
              {{ $t(`settings.duplicates.kind_${kind}`) }}
            </option>
          </select>
        </label>
        <label class="duplicates__filter">
          {{ $t("settings.duplicates.filter_source") }}
          <select v-model="sourceFilter" class="duplicates__select">
            <option value="">{{ $t("settings.duplicates.source_all") }}</option>
            <option
              v-for="source in sources"
              :key="source.id"
              :value="source.id"
            >
              {{ source.name }}
            </option>
          </select>
        </label>
        <label class="duplicates__filter duplicates__filter--check">
          <Checkbox v-model="lossyOnly" />
          {{ $t("settings.duplicates.filter_lossy") }}
        </label>
      </div>

      <!-- bulk actions on the safe kinds -->
      <div v-if="scannedAt && visibleGroups.length" class="duplicates__bulk">
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-duplicates-select-lesser
          @click="selectLesser()"
        >
          {{ $t("settings.duplicates.select_lesser") }}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          :disabled="selected.size === 0"
          @click="selected.clear()"
        >
          {{ $t("settings.duplicates.clear_selection") }}
        </Button>
        <span class="duplicates__status">
          {{ $t("settings.duplicates.selected", { count: selected.size }) }}
        </span>
        <template v-if="!confirmBulk">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            :disabled="selected.size === 0 || busy"
            data-duplicates-remove-selected
            @click="confirmBulk = 'remove'"
          >
            {{ $t("settings.duplicates.remove_selected") }}
          </Button>
          <Button
            v-if="bins"
            type="button"
            variant="destructive"
            size="sm"
            :disabled="selected.size === 0 || busy"
            data-duplicates-trash-selected
            @click="confirmBulk = 'trash'"
          >
            <Trash2 class="size-4" />
            {{ $t("settings.duplicates.trash_selected") }}
          </Button>
        </template>
        <template v-else>
          <span class="duplicates__confirm">
            {{
              $t(
                confirmBulk === "trash"
                  ? "settings.duplicates.confirm_trash"
                  : "settings.duplicates.confirm_remove",
                { count: selected.size },
              )
            }}
          </span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            :disabled="busy"
            data-duplicates-confirm
            @click="
              confirmBulk === 'trash' ? trashSelected() : removeSelected()
            "
          >
            {{ $t("settings.duplicates.confirm") }}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            @click="confirmBulk = ''"
          >
            {{ $t("cancel") }}
          </Button>
        </template>
      </div>

      <p
        v-if="scannedAt && !visibleGroups.length && !visibleCues.length"
        class="duplicates__empty"
      >
        {{ $t("settings.duplicates.nothing") }}
      </p>

      <!-- the groups -->
      <section
        v-for="group in shownGroups"
        :key="group.id"
        class="duplicates__group"
        :data-group-kind="group.kind"
      >
        <header class="duplicates__group-head">
          <span class="duplicates__kind" :data-kind="group.kind">
            {{ $t(`settings.duplicates.kind_${group.kind}`) }}
          </span>
          <span class="duplicates__group-title">{{ group.title }}</span>
          <span class="duplicates__group-reason">
            {{ $t(`settings.duplicates.reason_${reasonKey(group.reason)}`) }}
          </span>
          <Button
            v-if="group.kind === 'probable'"
            type="button"
            variant="outline"
            size="sm"
            class="ml-auto"
            :disabled="busy"
            data-duplicates-merge
            @click="merge(group)"
          >
            {{ $t("settings.duplicates.merge") }}
          </Button>
        </header>
        <div
          v-for="(row, index) in group.rows"
          :key="row.id"
          class="duplicates__row"
          :class="{
            'duplicates__row--keep': index === group.keep,
            'duplicates__row--gone': removed.has(row.id),
          }"
          data-duplicates-row
        >
          <Checkbox
            v-if="
              row.local && index !== group.keep && group.kind !== 'probable'
            "
            :model-value="selected.has(row.id)"
            :disabled="removed.has(row.id)"
            data-duplicates-pick
            @update:model-value="toggle(row.id, !!$event)"
          />
          <span v-else class="duplicates__spacer"></span>
          <span class="duplicates__mark">
            <template v-if="index === group.keep">{{
              $t("settings.duplicates.keep")
            }}</template>
            <template v-else-if="group.kind === 'probable'">{{
              $t("settings.duplicates.review")
            }}</template>
            <template v-else>{{ $t("settings.duplicates.lesser") }}</template>
          </span>
          <span class="duplicates__cell duplicates__cell--source">
            <ProviderIcon :domain="row.mapping.provider_domain" :size="14" />
            {{ row.sourceName }}
            <span v-if="!row.available" class="duplicates__note">{{
              $t("settings.duplicates.unavailable")
            }}</span>
          </span>
          <span
            class="duplicates__cell duplicates__cell--path"
            :title="row.path"
            >{{ row.path }}</span
          >
          <span class="duplicates__cell duplicates__cell--format">{{
            row.format.label
          }}</span>
          <span
            class="duplicates__cell duplicates__cell--tags"
            :title="
              row.tagsMissing
                .map((tag) => $t(`settings.duplicates.tag_${tag}`))
                .join(', ')
            "
          >
            {{
              $t("settings.duplicates.tags", {
                score: row.tagScore,
                total: TAG_CHECKS,
              })
            }}
          </span>
          <Button
            v-if="row.local && !removed.has(row.id)"
            type="button"
            variant="ghost"
            size="sm"
            :disabled="busy"
            data-duplicates-remove
            @click="
              group.kind === 'probable' ? removeTrack(row) : removeCopy(row)
            "
          >
            {{
              $t(
                group.kind === "probable"
                  ? "settings.duplicates.remove_track"
                  : "settings.duplicates.remove_copy",
              )
            }}
          </Button>
          <Button
            v-if="
              bins &&
              row.local &&
              !removed.has(row.id) &&
              index !== group.keep &&
              group.kind !== 'probable'
            "
            type="button"
            variant="ghost"
            size="sm"
            :disabled="busy"
            data-duplicates-trash
            @click="trashCopy(row)"
          >
            <Trash2 class="size-4" />
            {{ $t("settings.duplicates.trash_copy") }}
          </Button>
        </div>
      </section>
      <Button
        v-if="shownGroups.length < visibleGroups.length"
        type="button"
        variant="outline"
        class="mt-2"
        @click="shown += SHOW_STEP"
      >
        {{
          $t("settings.duplicates.show_more", {
            count: visibleGroups.length - shownGroups.length,
          })
        }}
      </Button>

      <!-- orphaned CUE sheets: files only, nothing in the library -->
      <section
        v-if="visibleCues.length"
        class="duplicates__group"
        data-group-kind="cue"
      >
        <header class="duplicates__group-head">
          <span class="duplicates__kind" data-kind="cue">{{
            $t("settings.duplicates.kind_cue")
          }}</span>
          <span class="duplicates__group-title">
            {{
              $t("settings.duplicates.cue_title", { count: visibleCues.length })
            }}
          </span>
          <span class="duplicates__group-reason">{{
            $t("settings.duplicates.cue_hint")
          }}</span>
          <template v-if="bins && pendingCues.length">
            <Button
              v-if="!confirmCues"
              type="button"
              variant="destructive"
              size="sm"
              class="ml-auto"
              :disabled="busy"
              data-duplicates-trash-cues
              @click="confirmCues = true"
            >
              <Trash2 class="size-4" />
              {{
                $t("settings.duplicates.trash_all_cues", {
                  count: pendingCues.length,
                })
              }}
            </Button>
            <template v-else>
              <span class="duplicates__confirm ml-auto">
                {{
                  $t("settings.duplicates.confirm_trash_cues", {
                    count: pendingCues.length,
                  })
                }}
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                :disabled="busy"
                data-duplicates-confirm-cues
                @click="trashAllCues()"
              >
                {{ $t("settings.duplicates.confirm") }}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="confirmCues = false"
              >
                {{ $t("cancel") }}
              </Button>
            </template>
          </template>
        </header>
        <div
          v-for="cue in visibleCues"
          :key="cue.path"
          class="duplicates__row"
          :class="{ 'duplicates__row--gone': trashedCues.has(cue.path) }"
          data-duplicates-cue
        >
          <span class="duplicates__spacer"></span>
          <span class="duplicates__mark">{{
            $t("settings.duplicates.orphan")
          }}</span>
          <span class="duplicates__cell duplicates__cell--source">{{
            cue.providerName
          }}</span>
          <span
            class="duplicates__cell duplicates__cell--path"
            :title="cue.path"
            >{{ cue.path }}</span
          >
          <span class="duplicates__cell duplicates__cell--format"></span>
          <span class="duplicates__cell duplicates__cell--tags"></span>
          <Button
            v-if="bins && !trashedCues.has(cue.path)"
            type="button"
            variant="ghost"
            size="sm"
            :disabled="busy"
            data-duplicates-trash-cue
            @click="trashCue(cue)"
          >
            <Trash2 class="size-4" />
            {{ $t("settings.duplicates.trash_copy") }}
          </Button>
        </div>
      </section>

      <!-- the trash folder of every file source: restore or empty -->
      <section
        v-for="bin in bins ?? []"
        :key="bin.instance"
        class="duplicates__group"
        data-duplicates-bin
        :data-bin-instance="bin.instance"
      >
        <header class="duplicates__group-head">
          <span class="duplicates__kind" data-kind="trash">{{
            $t("settings.duplicates.kind_trash")
          }}</span>
          <span class="duplicates__group-title">{{
            $t("settings.duplicates.trash_title", { source: bin.name })
          }}</span>
          <span class="duplicates__group-reason">{{
            $t("settings.duplicates.trash_hint", {
              count: bin.entries.length,
            })
          }}</span>
          <template v-if="bin.entries.length">
            <Button
              v-if="confirmEmpty !== bin.instance"
              type="button"
              variant="destructive"
              size="sm"
              class="ml-auto"
              :disabled="busy"
              data-duplicates-empty
              @click="confirmEmpty = bin.instance"
            >
              {{ $t("settings.duplicates.empty_trash") }}
            </Button>
            <template v-else>
              <span class="duplicates__confirm ml-auto">
                {{
                  $t("settings.duplicates.confirm_empty", {
                    count: bin.entries.length,
                  })
                }}
              </span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                :disabled="busy"
                data-duplicates-confirm-empty
                @click="emptyBin(bin)"
              >
                {{ $t("settings.duplicates.confirm_delete") }}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="confirmEmpty = ''"
              >
                {{ $t("cancel") }}
              </Button>
            </template>
          </template>
        </header>
        <div
          v-for="entry in bin.entries"
          :key="entry.path"
          class="duplicates__row"
          data-duplicates-trash-entry
        >
          <span class="duplicates__spacer"></span>
          <span class="duplicates__mark">{{
            $t("settings.duplicates.trashed")
          }}</span>
          <span class="duplicates__cell duplicates__cell--source">{{
            bin.name
          }}</span>
          <span
            class="duplicates__cell duplicates__cell--path"
            :title="entry.path"
            >{{ entry.path }}</span
          >
          <span class="duplicates__cell duplicates__cell--format">{{
            formatSize(entry.size)
          }}</span>
          <span class="duplicates__cell duplicates__cell--tags">{{
            formatWhen(entry.trashed_at)
          }}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :disabled="busy"
            data-duplicates-restore
            @click="restoreEntry(bin, entry)"
          >
            {{ $t("settings.duplicates.restore") }}
          </Button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import ProviderIcon from "@/components/ProviderIcon.vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { runWithConcurrency } from "@/helpers/concurrency";
import {
  buildGroups,
  loadCueRows,
  loadTrashBins,
  scanLibrary,
  TAG_CHECKS,
  toCsv,
  type CopyRow,
  type CueRow,
  type DuplicateGroup,
  type GroupKind,
  type TrashBin,
} from "@/library-manager/duplicates";
import { api } from "@/plugins/api";
import { MediaType, type TrashEntry } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { Copy as CopyIcon, Download, RefreshCw, Trash2 } from "@lucide/vue";
import { computed, reactive, ref } from "vue";
import { toast } from "vue-sonner";
import SettingsHeaderCard from "./SettingsHeaderCard.vue";

const KINDS: GroupKind[] = ["copies", "checksum", "probable"];
const SHOW_STEP = 100;

const scanning = ref(false);
const scanned = ref(0);
const scannedAt = ref<number | null>(null);
const groups = ref<DuplicateGroup[]>([]);
const cues = ref<CueRow[]>([]);
const kindFilter = ref<"all" | GroupKind>("all");
const sourceFilter = ref("");
const lossyOnly = ref(false);
const selected = reactive(new Set<string>());
const removed = reactive(new Set<string>());
const confirmBulk = ref<"" | "remove" | "trash">("");
const confirmCues = ref(false);
const confirmEmpty = ref("");
const busy = ref(false);
const shown = ref(SHOW_STEP);
// null while the server has no trash commands (an older app image)
const bins = ref<TrashBin[] | null>(null);
const trashedCues = reactive(new Set<string>());

const sources = computed(() => {
  const seen = new Map<string, string>();
  for (const group of groups.value) {
    for (const row of group.rows) seen.set(row.sourceInstance, row.sourceName);
  }
  for (const cue of cues.value)
    seen.set(cue.providerInstance, cue.providerName);
  return [...seen].map(([id, name]) => ({ id, name }));
});
// the file sources, the only ones with a trash folder
const localSources = computed(() => {
  const seen = new Map<string, string>();
  for (const group of groups.value) {
    for (const row of group.rows)
      if (row.local) seen.set(row.sourceInstance, row.sourceName);
  }
  for (const cue of cues.value)
    seen.set(cue.providerInstance, cue.providerName);
  return [...seen].map(([id, name]) => ({ id, name }));
});
const pendingCues = computed(() =>
  visibleCues.value.filter((cue) => !trashedCues.has(cue.path)),
);

const visibleGroups = computed(() =>
  groups.value.filter((group) => {
    if (kindFilter.value !== "all" && group.kind !== kindFilter.value)
      return false;
    if (
      sourceFilter.value &&
      !group.rows.some((row) => row.sourceInstance === sourceFilter.value)
    )
      return false;
    if (
      lossyOnly.value &&
      !group.rows.some(
        (row, index) => index !== group.keep && !row.format.lossless,
      )
    )
      return false;
    return true;
  }),
);
const shownGroups = computed(() => visibleGroups.value.slice(0, shown.value));
const visibleCues = computed(() =>
  kindFilter.value !== "all" && kindFilter.value !== "cue"
    ? []
    : cues.value.filter(
        (cue) =>
          !sourceFilter.value || cue.providerInstance === sourceFilter.value,
      ),
);

function reasonKey(reason: string): string {
  return reason.replace(/\s+/g, "_");
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} kB`;
  return `${bytes} B`;
}

function formatWhen(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

async function loadBins() {
  bins.value = await loadTrashBins(localSources.value);
}

// refresh one source's folder after a move or restore
async function refreshBin(instance: string) {
  if (!bins.value) return;
  const bin = bins.value.find((candidate) => candidate.instance === instance);
  if (!bin) {
    await loadBins();
    return;
  }
  try {
    bin.entries = await api.trashList(instance, { suppressGlobalError: true });
  } catch (error) {
    console.error("duplicates: trash list failed", error);
  }
}

async function scan() {
  scanning.value = true;
  scanned.value = 0;
  selected.clear();
  removed.clear();
  confirmBulk.value = "";
  shown.value = SHOW_STEP;
  try {
    const [tracks, cueRows] = await Promise.all([
      scanLibrary((count) => (scanned.value = count)),
      loadCueRows().catch(() => [] as CueRow[]),
    ]);
    groups.value = buildGroups(tracks);
    cues.value = cueRows;
    trashedCues.clear();
    scanned.value = tracks.length;
    scannedAt.value = Date.now();
    await loadBins();
  } catch (error) {
    console.error("duplicates: scan failed", error);
    toast.error($t("settings.duplicates.scan_failed"));
  } finally {
    scanning.value = false;
  }
}

function toggle(id: string, on: boolean) {
  if (on) selected.add(id);
  else selected.delete(id);
}

// every lesser local copy of the safe kinds (never the probable ones)
function selectLesser() {
  for (const group of visibleGroups.value) {
    if (group.kind === "probable") continue;
    group.rows.forEach((row, index) => {
      if (row.local && index !== group.keep && !removed.has(row.id))
        selected.add(row.id);
    });
  }
}

async function removeCopy(row: CopyRow) {
  busy.value = true;
  try {
    await api.removeProviderMapping(MediaType.TRACK, row.trackId, row.mapping);
    removed.add(row.id);
    selected.delete(row.id);
  } catch (error) {
    console.error("duplicates: remove failed", error);
    toast.error($t("settings.duplicates.remove_failed"));
  } finally {
    busy.value = false;
  }
}

async function removeTrack(row: CopyRow) {
  busy.value = true;
  try {
    await api.removeItemFromLibrary(MediaType.TRACK, row.trackId);
    for (const group of groups.value) {
      for (const other of group.rows)
        if (other.trackId === row.trackId) removed.add(other.id);
    }
  } catch (error) {
    console.error("duplicates: remove failed", error);
    toast.error($t("settings.duplicates.remove_failed"));
  } finally {
    busy.value = false;
  }
}

async function removeSelected() {
  const rows = groups.value
    .flatMap((group) => group.rows)
    .filter((row) => selected.has(row.id));
  busy.value = true;
  confirmBulk.value = "";
  let failed = 0;
  await runWithConcurrency(rows, async (row) => {
    try {
      await api.removeProviderMapping(
        MediaType.TRACK,
        row.trackId,
        row.mapping,
      );
      removed.add(row.id);
    } catch {
      failed += 1;
    }
  });
  selected.clear();
  busy.value = false;
  if (failed)
    toast.error(
      $t("settings.duplicates.remove_some_failed", { count: failed }),
    );
  else toast.success($t("settings.duplicates.removed", { count: rows.length }));
}

// a lesser copy leaves the library, then its file moves into the trash
// folder on the same drive; either half failing is reported, and a file
// that stays on disk after the mapping went is picked up again by a sync
async function trashRow(row: CopyRow) {
  await api.removeProviderMapping(MediaType.TRACK, row.trackId, row.mapping);
  removed.add(row.id);
  selected.delete(row.id);
  await api.trashMove(row.sourceInstance, row.path);
}

async function trashCopy(row: CopyRow) {
  busy.value = true;
  try {
    await trashRow(row);
    toast.success($t("settings.duplicates.trashed_count", { count: 1 }));
  } catch (error) {
    console.error("duplicates: trash failed", error);
    toast.error($t("settings.duplicates.trash_failed"));
  } finally {
    busy.value = false;
    await refreshBin(row.sourceInstance);
  }
}

async function trashSelected() {
  const rows = groups.value
    .flatMap((group) => group.rows)
    .filter((row) => selected.has(row.id) && row.local);
  busy.value = true;
  confirmBulk.value = "";
  let failed = 0;
  await runWithConcurrency(rows, async (row) => {
    try {
      await trashRow(row);
    } catch {
      failed += 1;
    }
  });
  selected.clear();
  busy.value = false;
  if (failed)
    toast.error($t("settings.duplicates.trash_some_failed", { count: failed }));
  else
    toast.success(
      $t("settings.duplicates.trashed_count", { count: rows.length }),
    );
  for (const instance of new Set(rows.map((row) => row.sourceInstance)))
    await refreshBin(instance);
}

async function trashCue(cue: CueRow) {
  busy.value = true;
  try {
    await api.trashMove(cue.providerInstance, cue.path);
    trashedCues.add(cue.path);
  } catch (error) {
    console.error("duplicates: trash failed", error);
    toast.error($t("settings.duplicates.trash_failed"));
  } finally {
    busy.value = false;
    await refreshBin(cue.providerInstance);
  }
}

async function trashAllCues() {
  const sheets = pendingCues.value;
  busy.value = true;
  confirmCues.value = false;
  let failed = 0;
  await runWithConcurrency(sheets, async (cue) => {
    try {
      await api.trashMove(cue.providerInstance, cue.path);
      trashedCues.add(cue.path);
    } catch {
      failed += 1;
    }
  });
  busy.value = false;
  if (failed)
    toast.error($t("settings.duplicates.trash_some_failed", { count: failed }));
  else
    toast.success(
      $t("settings.duplicates.trashed_count", { count: sheets.length }),
    );
  for (const instance of new Set(sheets.map((cue) => cue.providerInstance)))
    await refreshBin(instance);
}

// back to where it came from; the next sync imports it again
async function restoreEntry(bin: TrashBin, entry: TrashEntry) {
  busy.value = true;
  try {
    await api.trashRestore(bin.instance, entry.path);
    toast.success($t("settings.duplicates.restored"));
  } catch (error) {
    console.error("duplicates: restore failed", error);
    toast.error($t("settings.duplicates.restore_failed"));
  } finally {
    busy.value = false;
    await refreshBin(bin.instance);
  }
}

// the one action that deletes files
async function emptyBin(bin: TrashBin) {
  busy.value = true;
  confirmEmpty.value = "";
  try {
    const result = await api.trashEmpty(bin.instance);
    toast.success($t("settings.duplicates.emptied", { count: result.deleted }));
  } catch (error) {
    console.error("duplicates: empty trash failed", error);
    toast.error($t("settings.duplicates.empty_failed"));
  } finally {
    busy.value = false;
    await refreshBin(bin.instance);
  }
}

// a probable pair: the kept track gains the other rows' mappings, the
// other tracks go, which is what the import should have done
async function merge(group: DuplicateGroup) {
  const keep = group.rows[group.keep];
  const others = group.rows.filter(
    (row) => row.trackId !== keep.trackId && !removed.has(row.id),
  );
  busy.value = true;
  try {
    for (const row of others) {
      await api.addProviderMapping(MediaType.TRACK, keep.trackId, row.mapping);
    }
    for (const trackId of new Set(others.map((row) => row.trackId))) {
      await api.removeItemFromLibrary(MediaType.TRACK, trackId);
    }
    for (const row of others) removed.add(row.id);
    toast.success($t("settings.duplicates.merged"));
  } catch (error) {
    console.error("duplicates: merge failed", error);
    toast.error($t("settings.duplicates.merge_failed"));
  } finally {
    busy.value = false;
  }
}

function exportCsv() {
  const blob = new Blob([toCsv(visibleGroups.value, visibleCues.value)], {
    type: "text/csv",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "music-assistant-duplicates.csv";
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.duplicates {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}
.duplicates__toolbar,
.duplicates__filters,
.duplicates__bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.duplicates__status,
.duplicates__note,
.duplicates__group-reason {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.85rem;
}
.duplicates__confirm {
  font-size: 0.85rem;
  color: rgb(var(--v-theme-error));
}
.duplicates__filter {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}
.duplicates__select,
.duplicates__select option {
  background: rgb(var(--v-theme-panel, var(--v-theme-surface)));
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.2);
  border-radius: 4px;
  padding: 4px 8px;
}
.duplicates__empty {
  color: rgba(var(--v-theme-on-surface), 0.6);
  padding: 24px 0;
}
.duplicates__group {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 6px;
  padding: 8px 12px;
}
.duplicates__group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.duplicates__group-title {
  font-weight: 600;
}
.duplicates__kind {
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.duplicates__kind[data-kind="probable"] {
  background: rgba(var(--v-theme-warning), 0.2);
}
.duplicates__kind[data-kind="trash"] {
  background: rgba(var(--v-theme-error), 0.15);
}
.duplicates__row {
  display: grid;
  grid-template-columns:
    24px 60px minmax(120px, 1fr) minmax(200px, 3fr) minmax(120px, 1fr)
    70px auto;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.85rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}
.duplicates__row--keep .duplicates__mark {
  color: rgb(var(--v-theme-success, var(--v-theme-primary)));
  font-weight: 600;
}
.duplicates__row--gone {
  opacity: 0.4;
  text-decoration: line-through;
}
.duplicates__cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.duplicates__cell--source {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.duplicates__spacer {
  width: 24px;
}
@media (max-width: 900px) {
  .duplicates__row {
    grid-template-columns: 24px 60px 1fr auto;
  }
  .duplicates__cell--format,
  .duplicates__cell--tags,
  .duplicates__cell--source {
    display: none;
  }
}
</style>
