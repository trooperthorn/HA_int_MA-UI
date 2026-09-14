<template>
  <div class="flow-view">
    <div class="flow-view__header">
      <h1 class="flow-view__title">{{ $t("flow.title") }}</h1>
      <Button
        v-if="selection"
        variant="outline"
        size="sm"
        class="h-8"
        data-testid="clear-selection"
        @click="selection = null"
      >
        <X :size="14" class="mr-2" />
        {{ $t("flow.clear_selection") }}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="$t('flow.configure')"
        data-testid="configure"
        @click="router.push({ name: 'frontendflow' })"
      >
        <Settings2 :size="16" />
      </Button>
    </div>

    <div v-if="!configured" class="flow-view__empty">
      <p>{{ $t("flow.not_configured") }}</p>
      <Button variant="outline" @click="router.push({ name: 'frontendflow' })">
        {{ $t("flow.configure") }}
      </Button>
    </div>

    <template v-else>
      <FlowGraph
        :model="model"
        :closure="closure"
        :selection="selection"
        @tap="onTap"
        @select="select"
        @volume="onVolume"
        @mute="onMute"
      />
      <div class="flow-view__legend">
        <span
          v-for="entry in legend"
          :key="entry.key"
          class="flow-view__legend-item"
        >
          <svg width="26" height="8" aria-hidden="true">
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              :stroke="entry.color"
              stroke-width="3"
              stroke-linecap="round"
              :stroke-dasharray="entry.dashed ? '4 4' : ''"
            />
          </svg>
          {{ $t(entry.key) }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Settings2, X } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { useUserPreferences } from "@/composables/userPreferences";
import { api } from "@/plugins/api";
import { store } from "@/plugins/store";
import {
  setVolume,
  toggleGroup,
  toggleMaster,
  toggleMute,
  toggleZone,
  type ActionContext,
} from "./actions";
import {
  deriveModel,
  selectionClosure,
  type GraphNode,
  type NowPlaying,
} from "./derive";
import {
  FLOW_PREFERENCE_KEY,
  isFlowConfigured,
  normalizeFlowConfig,
} from "./flowConfig";
import FlowGraph from "./FlowGraph.vue";
import { IDLE_LINK_COLOR, LINK_COLORS } from "./linkColors";
import { PendingStore } from "./optimistic";

defineOptions({ name: "FlowView" });

const router = useRouter();
const { getPreference } = useUserPreferences();

const stored = getPreference<unknown>(FLOW_PREFERENCE_KEY, undefined);
const config = computed(() => normalizeFlowConfig(stored.value));
const configured = computed(() => isFlowConfigured(config.value));

const pending = new PendingStore();
// bumped whenever an expectation is recorded or may have expired, so the
// model recomputes without the players changing
const pendingVersion = ref(0);
const bump = () => {
  pendingVersion.value += 1;
};

// the input node follows the active player's queue when no input player is
// named; a named one carries its own now playing
const nowPlaying = computed<NowPlaying>(() => {
  if (config.value.input) return {};
  const queueItem = store.curQueueItem;
  const player = store.activePlayer;
  return {
    media: queueItem?.media_item
      ? {
          uri: queueItem.media_item.uri,
          media_type: queueItem.media_item.media_type,
          title: queueItem.media_item.name,
          artist:
            "artists" in queueItem.media_item &&
            Array.isArray(queueItem.media_item.artists)
              ? queueItem.media_item.artists
                  .map((artist) => artist.name)
                  .join(", ")
              : null,
          album: null,
          image_url: queueItem.image?.path ?? null,
          palette: null,
          duration: null,
          source_id: null,
          elapsed_time: null,
          elapsed_time_last_updated: null,
          queue_item_id: queueItem.queue_item_id,
        }
      : player?.current_media,
    state: player?.playback_state,
  };
});

const model = computed(() => {
  // read so the model follows the players and the pending store
  void pendingVersion.value;
  pending.reconcile(api.players, Date.now());
  return deriveModel(api.players, config.value, pending, nowPlaying.value);
});

// expectations time out on their own; while any is outstanding the model
// is re-read once a second so an expired one drops off the screen
let ticker: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  ticker = setInterval(() => {
    if (!pending.isEmpty()) bump();
  }, 1000);
});
onBeforeUnmount(() => clearInterval(ticker));

// a new topology starts clean
watch(config, () => {
  pending.clear();
  selection.value = null;
  bump();
});

const selection = ref<string | null>(null);
const closure = computed(() => selectionClosure(model.value, selection.value));

function select(id: string) {
  selection.value = selection.value === id ? null : id;
}

const context = (): ActionContext => ({
  players: api.players,
  config: config.value,
  pending,
});

function run(action: Promise<void>) {
  bump();
  action
    .catch((err) => console.error("[FlowView] command failed", err))
    .finally(bump);
}

// input and channel trace their path; zones, groups and masters route
function onTap(node: GraphNode) {
  if (!node.found || !node.available) {
    select(node.id);
    return;
  }
  const current = config.value;
  switch (node.kind) {
    case "zone": {
      const zone = current.zones.find((z) => z.player_id === node.playerId);
      if (zone) run(toggleZone(context(), zone, node));
      return;
    }
    case "group": {
      const group = current.groups.find((g) => g.id === node.playerId);
      if (!group) return;
      const members = new Map(
        model.value.mixes
          .filter((mix) => mix.kind === "zone")
          .map((mix) => [mix.playerId, mix] as const),
      );
      run(toggleGroup(context(), group, node, members));
      return;
    }
    case "master": {
      const master = current.masters.find((m) => m.player_id === node.playerId);
      if (master) run(toggleMaster(context(), master, node));
      return;
    }
    default:
      select(node.id);
  }
}

// the slider fires on every step; the command goes a beat after the last
let volumeTimer: ReturnType<typeof setTimeout> | undefined;
function onVolume(playerId: string, level: number) {
  clearTimeout(volumeTimer);
  volumeTimer = setTimeout(
    () => run(setVolume(context(), playerId, level)),
    250,
  );
}

function onMute(playerId: string, currentlyMuted: boolean) {
  run(toggleMute(context(), playerId, currentlyMuted));
}

const legend = [
  { key: "flow.legend_input", color: LINK_COLORS.input },
  { key: "flow.legend_channel", color: LINK_COLORS.channel },
  { key: "flow.legend_output", color: LINK_COLORS.output },
  { key: "flow.muted", color: "rgba(127, 127, 127, 0.7)", dashed: true },
  { key: "flow.legend_idle", color: IDLE_LINK_COLOR },
];
</script>

<style scoped>
.flow-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 16px 24px;
  color: rgb(var(--v-theme-fg));
}

.flow-view__header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-view__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.flow-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;
  color: rgba(var(--v-theme-fg), 0.6);
}

.flow-view__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 11px;
  color: rgba(var(--v-theme-fg), 0.6);
}

.flow-view__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
