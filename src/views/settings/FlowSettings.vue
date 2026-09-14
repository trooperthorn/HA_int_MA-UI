<template>
  <div class="p-4">
    <SettingsHeaderCard
      :icon="Waypoints"
      icon-class="text-emerald-500"
      :title="$t('settings.flow.title')"
      :description="$t('settings.flow.description')"
      :show-advanced-toggle="false"
      @reset-to-defaults="discard"
    />

    <div class="flow-settings">
      <section class="flow-settings__group">
        <label class="flow-settings__field">
          <span>{{ $t("settings.flow.input") }}</span>
          <select
            v-model="draft.input"
            class="flow-settings__select"
            data-testid="input"
          >
            <option :value="undefined">{{ $t("settings.flow.none") }}</option>
            <option
              v-for="player in players"
              :key="player.player_id"
              :value="player.player_id"
            >
              {{ player.name }}
            </option>
          </select>
          <span class="flow-settings__hint">
            {{ $t("settings.flow.input_hint") }}
          </span>
        </label>
        <label class="flow-settings__field">
          <span>{{ $t("settings.flow.channel") }}</span>
          <select
            v-model="draft.channel"
            class="flow-settings__select"
            data-testid="channel"
          >
            <option :value="undefined">{{ $t("settings.flow.none") }}</option>
            <option
              v-for="player in players"
              :key="player.player_id"
              :value="player.player_id"
            >
              {{ player.name }}
            </option>
          </select>
          <span class="flow-settings__hint">
            {{ $t("settings.flow.channel_hint") }}
          </span>
        </label>
        <label class="flow-settings__field">
          <span>{{ $t("settings.flow.feed_aliases") }}</span>
          <input
            v-model="aliasesText"
            type="text"
            class="flow-settings__input"
            data-testid="feed-aliases"
            placeholder="AUDIO2, Source 2"
          />
          <span class="flow-settings__hint">
            {{ $t("settings.flow.feed_aliases_hint") }}
          </span>
        </label>
      </section>

      <section class="flow-settings__group">
        <h3 class="flow-settings__heading">{{ $t("settings.flow.zones") }}</h3>
        <table v-if="draft.zones.length" class="flow-settings__table">
          <thead>
            <tr>
              <th>{{ $t("settings.flow.zone_player") }}</th>
              <th>{{ $t("settings.flow.zone_name") }}</th>
              <th>{{ $t("settings.flow.zone_feed") }}</th>
              <th>{{ $t("settings.flow.zone_volume") }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(zone, index) in draft.zones" :key="index" data-zone>
              <td>
                <select v-model="zone.player_id" class="flow-settings__select">
                  <option
                    v-for="player in players"
                    :key="player.player_id"
                    :value="player.player_id"
                  >
                    {{ player.name }}
                  </option>
                </select>
              </td>
              <td>
                <input
                  v-model="zone.name"
                  type="text"
                  class="flow-settings__input"
                  :placeholder="playerName(zone.player_id)"
                />
              </td>
              <td>
                <input
                  v-model="zone.feed_source"
                  type="text"
                  class="flow-settings__input"
                  :list="`flow-inputs-${index}`"
                  :placeholder="draft.feed_aliases[0] ?? ''"
                />
                <datalist :id="`flow-inputs-${index}`">
                  <option
                    v-for="source in inputsOf(zone.player_id)"
                    :key="source"
                    :value="source"
                  ></option>
                </datalist>
              </td>
              <td class="flow-settings__volume">
                <select
                  v-model="zone.volumeDisplay"
                  class="flow-settings__select"
                >
                  <option value="percent">
                    {{ $t("settings.flow.volume_percent") }}
                  </option>
                  <option value="raw">
                    {{ $t("settings.flow.volume_raw") }}
                  </option>
                </select>
                <input
                  v-if="zone.volumeDisplay === 'raw'"
                  v-model.number="zone.volumeMax"
                  type="number"
                  min="1"
                  class="flow-settings__input flow-settings__input--short"
                  :aria-label="$t('settings.flow.volume_max')"
                />
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="$t('settings.flow.remove')"
                  @click="draft.zones.splice(index, 1)"
                >
                  <Trash2 :size="14" />
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
        <Button
          variant="outline"
          size="sm"
          data-testid="add-zone"
          @click="addZone"
        >
          <Plus :size="14" class="mr-2" />
          {{ $t("settings.flow.add_zone") }}
        </Button>
      </section>

      <section class="flow-settings__group">
        <h3 class="flow-settings__heading">{{ $t("settings.flow.groups") }}</h3>
        <div
          v-for="(group, index) in draft.groups"
          :key="group.id"
          class="flow-settings__card"
          data-group
        >
          <div class="flow-settings__row">
            <input
              v-model="group.name"
              type="text"
              class="flow-settings__input"
              :placeholder="$t('settings.flow.group_name')"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              :aria-label="$t('settings.flow.remove')"
              @click="draft.groups.splice(index, 1)"
            >
              <Trash2 :size="14" />
            </Button>
          </div>
          <div class="flow-settings__members">
            <span class="flow-settings__hint">
              {{ $t("settings.flow.group_members") }}
            </span>
            <label
              v-for="zone in draft.zones"
              :key="zone.player_id"
              class="flow-settings__check"
            >
              <Checkbox
                :model-value="group.members.includes(zone.player_id)"
                @update:model-value="setMember(group, zone.player_id, !!$event)"
              />
              <span>{{ zone.name || playerName(zone.player_id) }}</span>
            </label>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="add-group"
          @click="addGroup"
        >
          <Plus :size="14" class="mr-2" />
          {{ $t("settings.flow.add_group") }}
        </Button>
      </section>

      <section class="flow-settings__group">
        <h3 class="flow-settings__heading">
          {{ $t("settings.flow.masters") }}
        </h3>
        <p class="flow-settings__hint">
          {{ $t("settings.flow.masters_hint") }}
        </p>
        <div
          v-for="(master, index) in draft.masters"
          :key="index"
          class="flow-settings__row"
          data-master
        >
          <select v-model="master.player_id" class="flow-settings__select">
            <option
              v-for="player in players"
              :key="player.player_id"
              :value="player.player_id"
            >
              {{ player.name }}
            </option>
          </select>
          <input
            v-model="master.name"
            type="text"
            class="flow-settings__input"
            :placeholder="playerName(master.player_id)"
          />
          <input
            v-model="master.feed_source"
            type="text"
            class="flow-settings__input"
            :placeholder="$t('settings.flow.zone_feed')"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="$t('settings.flow.remove')"
            @click="draft.masters.splice(index, 1)"
          >
            <Trash2 :size="14" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="add-master"
          @click="addMaster"
        >
          <Plus :size="14" class="mr-2" />
          {{ $t("settings.flow.add_master") }}
        </Button>
      </section>

      <section class="flow-settings__group">
        <label class="flow-settings__field">
          <span>{{ $t("settings.flow.optimistic_ttl") }}</span>
          <input
            v-model.number="draft.optimistic_ttl"
            type="number"
            min="1000"
            step="500"
            class="flow-settings__input flow-settings__input--short"
            data-testid="ttl"
          />
          <span class="flow-settings__hint">
            {{ $t("settings.flow.optimistic_ttl_hint") }}
          </span>
        </label>
      </section>

      <div class="flow-settings__actions">
        <Button data-testid="save" :disabled="!dirty || saving" @click="save">
          {{ $t("settings.flow.save") }}
        </Button>
        <Button variant="ghost" :disabled="!dirty" @click="discard">
          {{ $t("settings.flow.discard") }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Trash2, Waypoints } from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import {
  FLOW_PREFERENCE_KEY,
  normalizeFlowConfig,
  type FlowConfig,
  type FlowGroup,
  type VolumeDisplay,
} from "@/flow/flowConfig";
import { api } from "@/plugins/api";
import { PlayerType } from "@/plugins/api/interfaces";
import SettingsHeaderCard from "./SettingsHeaderCard.vue";

defineOptions({ name: "FlowSettings" });

const { t } = useI18n();
const { getPreference } = useUserPreferences();

// the form edits a flat copy; the stored shape is rebuilt on save
interface ZoneDraft {
  player_id: string;
  name: string;
  feed_source: string;
  volumeDisplay: VolumeDisplay;
  volumeMax: number | undefined;
}

interface MasterDraft {
  player_id: string;
  name: string;
  feed_source: string;
}

interface Draft {
  input: string | undefined;
  channel: string | undefined;
  feed_aliases: string[];
  zones: ZoneDraft[];
  groups: FlowGroup[];
  masters: MasterDraft[];
  optimistic_ttl: number;
}

const stored = getPreference<unknown>(FLOW_PREFERENCE_KEY, undefined);
const storedConfig = computed(() => normalizeFlowConfig(stored.value));

function toDraft(config: FlowConfig): Draft {
  return {
    input: config.input,
    channel: config.channel,
    feed_aliases: [...config.feed_aliases],
    zones: config.zones.map((zone) => ({
      player_id: zone.player_id,
      name: zone.name ?? "",
      feed_source: zone.feed_source ?? "",
      volumeDisplay: zone.volume?.display ?? "percent",
      volumeMax: zone.volume?.max,
    })),
    groups: config.groups.map((group) => ({
      ...group,
      members: [...group.members],
    })),
    masters: config.masters.map((master) => ({
      player_id: master.player_id,
      name: master.name ?? "",
      feed_source: master.feed_source ?? "",
    })),
    optimistic_ttl: config.optimistic_ttl,
  };
}

function fromDraft(draft: Draft): FlowConfig {
  return normalizeFlowConfig({
    input: draft.input,
    channel: draft.channel,
    feed_aliases: draft.feed_aliases,
    zones: draft.zones.map((zone) => ({
      player_id: zone.player_id,
      name: zone.name || undefined,
      feed_source: zone.feed_source || undefined,
      volume:
        zone.volumeDisplay === "raw"
          ? { display: "raw", max: zone.volumeMax }
          : undefined,
    })),
    groups: draft.groups,
    masters: draft.masters.map((master) => ({
      player_id: master.player_id,
      name: master.name || undefined,
      feed_source: master.feed_source || undefined,
    })),
    optimistic_ttl: draft.optimistic_ttl,
  });
}

const draft = ref<Draft>(toDraft(storedConfig.value));
const saving = ref(false);

// another device saving the routing replaces an untouched form
watch(storedConfig, (config) => {
  if (!dirty.value) draft.value = toDraft(config);
});

const dirty = computed(
  () =>
    JSON.stringify(fromDraft(draft.value)) !==
    JSON.stringify(storedConfig.value),
);

const aliasesText = computed({
  get: () => draft.value.feed_aliases.join(", "),
  set: (value: string) => {
    draft.value.feed_aliases = value
      .split(",")
      .map((alias) => alias.trim())
      .filter(Boolean);
  },
});

// every real player, hidden ones included: a receiver zone is often hidden
// from the player picker on purpose
const players = computed(() =>
  Object.values(api.players)
    .filter((player) => player.type !== PlayerType.PROTOCOL)
    .sort((left, right) => left.name.localeCompare(right.name)),
);

const playerName = (playerId: string) =>
  api.players[playerId]?.name ?? playerId;

const inputsOf = (playerId: string) =>
  api.players[playerId]?.source_list
    ?.filter((source) => !source.passive)
    .map((source) => source.id) ?? [];

function addZone() {
  const used = new Set(draft.value.zones.map((zone) => zone.player_id));
  const next = players.value.find((player) => !used.has(player.player_id));
  draft.value.zones.push({
    player_id: next?.player_id ?? "",
    name: "",
    feed_source: "",
    volumeDisplay: "percent",
    volumeMax: undefined,
  });
}

function addGroup() {
  draft.value.groups.push({
    id: `group-${Date.now().toString(36)}`,
    name: "",
    members: [],
  });
}

function setMember(group: FlowGroup, playerId: string, on: boolean) {
  const members = group.members.filter((member) => member !== playerId);
  group.members = on ? [...members, playerId] : members;
}

function addMaster() {
  draft.value.masters.push({
    player_id: players.value[0]?.player_id ?? "",
    name: "",
    feed_source: "",
  });
}

async function save() {
  saving.value = true;
  try {
    await setUserPreference(FLOW_PREFERENCE_KEY, fromDraft(draft.value));
    toast.success(t("settings.flow.saved"));
  } catch (err) {
    console.error("[FlowSettings] save failed", err);
    toast.error(String(err));
  } finally {
    saving.value = false;
  }
}

function discard() {
  draft.value = toDraft(storedConfig.value);
}
</script>

<style scoped>
.flow-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 960px;
  font-size: 13px;
}

.flow-settings__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.flow-settings__heading {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-fg), 0.6);
}

.flow-settings__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 480px;
}

.flow-settings__hint {
  font-size: 11.5px;
  color: rgba(var(--v-theme-fg), 0.55);
}

.flow-settings__select,
.flow-settings__input {
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid rgba(var(--v-theme-fg), 0.15);
  background: rgba(var(--v-theme-fg), 0.04);
  color: rgb(var(--v-theme-fg));
  font: inherit;
  min-width: 0;
  width: 100%;
}

/* a native select paints its list with the control's own background; a
   near-transparent one comes out white under the dark theme and hides the
   text, so the select and its options get the panel's solid gray */
.flow-settings__select,
.flow-settings__select option {
  background: rgb(var(--v-theme-panel));
  color: rgb(var(--v-theme-fg));
}

.flow-settings__input--short {
  width: 110px;
}

.flow-settings__table {
  width: 100%;
  border-collapse: collapse;
}

.flow-settings__table th {
  text-align: left;
  font-weight: 500;
  font-size: 11.5px;
  color: rgba(var(--v-theme-fg), 0.55);
  padding: 0 6px 4px;
}

.flow-settings__table td {
  padding: 3px 6px;
  vertical-align: middle;
}

.flow-settings__volume {
  display: flex;
  gap: 6px;
}

.flow-settings__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(var(--v-theme-fg), 0.04);
}

.flow-settings__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-settings__members {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}

.flow-settings__check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.flow-settings__actions {
  display: flex;
  gap: 8px;
}

.flow-settings__actions > * {
  align-self: flex-start;
}
</style>
