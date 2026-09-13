<template>
  <div class="p-4">
    <SettingsHeaderCard
      :icon="LayoutList"
      icon-class="text-sky-500"
      :title="$t('settings.library_view.title')"
      :description="$t('settings.library_view.description')"
      :show-advanced-toggle="false"
      @reset-to-defaults="resetAll"
    />

    <div class="library-view-settings">
      <section class="library-view-settings__group">
        <h3 class="library-view-settings__heading">
          {{ $t("settings.library_view.columns") }}
        </h3>
        <div class="library-view-settings__columns">
          <label
            v-for="column in TRACK_COLUMNS"
            :key="column.id"
            class="library-view-settings__check"
          >
            <Checkbox
              :model-value="!!visibility[column.id]"
              :disabled="column.fixed"
              :data-column="column.id"
              @update:model-value="setColumnVisible(column.id, !!$event)"
            />
            <span>{{ $t(column.labelKey) }}</span>
            <span v-if="column.fixed" class="library-view-settings__hint">
              {{ $t("settings.library_view.always_shown") }}
            </span>
          </label>
        </div>
      </section>

      <div class="library-view-settings__side">
        <section class="library-view-settings__group">
          <h3 class="library-view-settings__heading">
            {{ $t("settings.library_view.density") }}
          </h3>
          <RadioGroup
            :model-value="density"
            class="library-view-settings__radios"
            @update:model-value="setDensity($event as GridDensity)"
          >
            <label
              v-for="option in DENSITIES"
              :key="option"
              class="library-view-settings__check"
            >
              <RadioGroupItem :value="option" :data-density="option" />
              <span>
                {{ $t(`settings.library_view.density_${option}`) }} ·
                {{ ROW_HEIGHT_BY_DENSITY[option] }}px
              </span>
            </label>
          </RadioGroup>
        </section>

        <section class="library-view-settings__group">
          <h3 class="library-view-settings__heading">
            {{ $t("settings.library_view.panes") }}
          </h3>
          <label class="library-view-settings__check">
            <Switch
              :model-value="showTree"
              data-pane="tree"
              @update:model-value="setShowTree(!!$event)"
            />
            <span>{{ $t("settings.library_view.show_tree") }}</span>
          </label>
          <label class="library-view-settings__check">
            <Switch
              :model-value="showStrip"
              data-pane="strip"
              @update:model-value="setShowStrip(!!$event)"
            />
            <span>{{ $t("settings.library_view.show_strip") }}</span>
          </label>
          <label class="library-view-settings__check">
            <Switch
              :model-value="showQueue"
              data-pane="queue"
              @update:model-value="setShowQueue(!!$event)"
            />
            <span>{{ $t("settings.library_view.show_queue") }}</span>
          </label>
          <label class="library-view-settings__check">
            <Switch
              :model-value="showSelected"
              data-pane="selected"
              @update:model-value="setShowSelected(!!$event)"
            />
            <span>{{ $t("settings.library_view.show_selected") }}</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            class="library-view-settings__reset"
            data-testid="reset-panes"
            @click="resetPanes"
          >
            <RotateCcw :size="14" class="mr-2" />
            {{ $t("settings.library_view.reset_panes") }}
          </Button>
        </section>

        <section class="library-view-settings__group">
          <h3 class="library-view-settings__heading">
            {{ $t("settings.library_view.double_click") }}
          </h3>
          <label class="library-view-settings__field">
            <span>{{ $t("settings.library_view.click_track") }}</span>
            <select
              class="library-view-settings__select"
              :value="clickAction"
              :disabled="!isAdmin || savingClick"
              data-testid="click-action"
              @change="saveClickAction($event)"
            >
              <option value="browse">
                {{ $t("settings.library_view.click_browse") }}
              </option>
              <option value="play">
                {{ $t("settings.library_view.click_play") }}
              </option>
            </select>
          </label>
          <label class="library-view-settings__field">
            <span>{{ $t("settings.library_view.play_album_track") }}</span>
            <select
              class="library-view-settings__select"
              :value="playAction"
              :disabled="!isAdmin || savingClick"
              data-testid="play-action"
              @change="savePlayAction($event)"
            >
              <option value="play_from_here">
                {{ $t("settings.library_view.play_from_here") }}
              </option>
              <option value="play_track">
                {{ $t("settings.library_view.play_track") }}
              </option>
            </select>
          </label>
          <p class="library-view-settings__hint">
            {{ $t("settings.library_view.double_click_hint") }}
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LayoutList, RotateCcw } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { TRACK_COLUMNS } from "@/library-manager/columns";
import { Scope } from "@/plugins/api/interfaces";
import {
  ROW_HEIGHT_BY_DENSITY,
  useGridColumns,
  type GridDensity,
} from "@/library-manager/composables/useGridColumns";
import { usePaneLayout } from "@/library-manager/composables/usePaneLayout";
import { api } from "@/plugins/api";
import { authManager } from "@/plugins/auth";
import SettingsHeaderCard from "./SettingsHeaderCard.vue";

const DENSITIES: GridDensity[] = ["compact", "comfortable", "thumbnails"];

const QUEUE_DOMAIN = "player_queues";
const CLICK_ACTION_KEY = "default_click_action_track";
const PLAY_ACTION_KEY = "default_play_action_album_track";

const {
  visibility,
  density,
  setColumnVisible,
  setDensity,
  reset: resetColumns,
} = useGridColumns();
const {
  showTree,
  showStrip,
  showQueue,
  showSelected,
  setShowTree,
  setShowStrip,
  setShowQueue,
  setShowSelected,
  reset: resetPanes,
} = usePaneLayout();

async function resetAll() {
  await resetColumns();
  await resetPanes();
}

// ---- click behaviour: core config of the queue controller ---------------------

// writes core config of the queue controller, so it takes the same scope
// upstream gives the system settings section
const isAdmin = computed(() => authManager.hasScope(Scope.CONFIG_CORE_WRITE));
const clickAction = ref("browse");
const playAction = ref("play_from_here");
const savingClick = ref(false);

onMounted(async () => {
  try {
    const [click, play] = await Promise.all([
      api.getCoreConfigValue(QUEUE_DOMAIN, CLICK_ACTION_KEY),
      api.getCoreConfigValue(QUEUE_DOMAIN, PLAY_ACTION_KEY),
    ]);
    if (typeof click === "string") clickAction.value = click;
    if (typeof play === "string") playAction.value = play;
  } catch (err) {
    console.error("[LibraryViewSettings] click settings unavailable", err);
  }
});

async function saveQueueSetting(key: string, value: string) {
  savingClick.value = true;
  try {
    await api.saveCoreConfig(QUEUE_DOMAIN, { [key]: value });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    savingClick.value = false;
  }
}

function saveClickAction(event: Event) {
  clickAction.value = (event.target as HTMLSelectElement).value;
  void saveQueueSetting(CLICK_ACTION_KEY, clickAction.value);
}

function savePlayAction(event: Event) {
  playAction.value = (event.target as HTMLSelectElement).value;
  void saveQueueSetting(PLAY_ACTION_KEY, playAction.value);
}
</script>

<style scoped>
.library-view-settings {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  font-size: 13px;
}

.library-view-settings__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.library-view-settings__side {
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  min-width: 260px;
}

.library-view-settings__heading {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.62);
}

.library-view-settings__columns {
  display: flex;
  flex-direction: column;
  width: 320px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-fg), 0.1);
  background: rgb(var(--v-theme-panel));
}

.library-view-settings__radios {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.library-view-settings__check {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 28px;
  cursor: pointer;
}

.library-view-settings__hint {
  font-size: 11px;
  color: rgba(var(--v-theme-fg), 0.45);
}

.library-view-settings__reset {
  align-self: flex-start;
  margin-top: 4px;
}

.library-view-settings__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 360px;
}

.library-view-settings__select {
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(var(--v-theme-fg), 0.15);
  background: rgb(var(--v-theme-panel));
  color: rgb(var(--v-theme-fg));
  font: inherit;
}
</style>
