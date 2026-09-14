<template>
  <div
    class="flow-output"
    :class="{
      'flow-output--dimmed': dimmed,
      'flow-output--selected': selected,
    }"
    :data-node-id="row.id"
  >
    <div
      class="flow-output__top"
      role="button"
      tabindex="0"
      @click="emit('select', row.id)"
      @keydown.enter.prevent="emit('select', row.id)"
    >
      <Speaker :size="16" class="flow-output__icon" />
      <span class="flow-output__name">{{ row.name }}</span>
      <span v-if="row.pending" class="flow-output__pending"></span>
      <span class="flow-output__readout">
        {{
          row.muted
            ? $t("flow.muted")
            : $t("flow.volume", { volume: Math.round(row.volumeLevel) })
        }}{{ row.readout && !row.muted ? ` · ${row.readout}` : "" }}
      </span>
    </div>
    <div class="flow-output__controls">
      <input
        v-if="row.hasVolume"
        type="range"
        min="0"
        max="100"
        step="1"
        class="flow-output__slider"
        :value="Math.round(row.volumeLevel)"
        :aria-label="$t('flow.volume_for', { name: row.name })"
        @input="onSlider"
      />
      <span v-else class="flow-output__readout">
        {{ $t("flow.volume_not_controllable") }}
      </span>
      <button
        v-if="row.hasMute"
        type="button"
        class="flow-output__mute"
        :class="{ 'flow-output__mute--muted': row.muted }"
        :title="row.muted ? $t('unmute') : $t('mute')"
        :aria-label="row.muted ? $t('unmute') : $t('mute')"
        :aria-pressed="row.muted"
        @click="emit('mute', row.playerId, row.muted)"
      >
        <VolumeX v-if="row.muted" :size="16" />
        <Volume2 v-else :size="16" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Speaker, Volume2, VolumeX } from "@lucide/vue";
import type { OutputRow } from "./derive";

const props = defineProps<{
  row: OutputRow;
  dimmed?: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
  volume: [playerId: string, level: number];
  mute: [playerId: string, currentlyMuted: boolean];
}>();

defineOptions({ name: "FlowOutput" });

function onSlider(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  emit("volume", props.row.playerId, value);
}
</script>

<style scoped>
.flow-output {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(var(--v-theme-fg), 0.13);
  color: rgb(var(--v-theme-fg));
  transition: opacity 0.2s ease;
}

.flow-output--dimmed {
  opacity: 0.32;
}

.flow-output--selected {
  border-color: rgba(var(--v-theme-fg), 0.45);
}

.flow-output__top {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  outline: none;
}

.flow-output__icon {
  flex: none;
  color: rgba(var(--v-theme-fg), 0.6);
}

.flow-output__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-output__readout {
  font-size: 11px;
  color: rgba(var(--v-theme-fg), 0.6);
  white-space: nowrap;
}

.flow-output__pending {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(var(--v-theme-fg), 0.6);
  border-top-color: transparent;
  animation: flow-spin 0.9s linear infinite;
}

@keyframes flow-spin {
  to {
    transform: rotate(360deg);
  }
}

.flow-output__controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-output__slider {
  flex: 1;
  min-width: 0;
  accent-color: #10b981;
  cursor: pointer;
}

.flow-output__mute {
  flex: none;
  display: flex;
  padding: 2px;
  border: 0;
  background: none;
  color: rgba(var(--v-theme-fg), 0.6);
  cursor: pointer;
}

.flow-output__mute--muted {
  color: rgb(var(--v-theme-warning, 245, 158, 11));
}
</style>
