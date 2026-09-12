<!--
  Audio delay popout for the player menu: edits the player's sync_adjust
  setting (-500..500 ms) so players on different protocols line up when
  they stream together. Saving reloads the player on the server.
-->
<template>
  <div class="sync-adjust-menu" @pointerdown.stop @click.stop>
    <div class="sync-adjust-menu__row">
      <Timer :size="20" class="sync-adjust-menu__icon" />
      <span class="sync-adjust-menu__label">
        {{ $t("player_select.sync_adjust") }}
      </span>
      <span class="sync-adjust-menu__value">{{ valueLabel }}</span>
    </div>
    <div class="sync-adjust-menu__row">
      <Slider
        :model-value="[draft]"
        :min="SYNC_ADJUST_MIN"
        :max="SYNC_ADJUST_MAX"
        :step="5"
        :disabled="!loaded || saving"
        class="sync-adjust-menu__slider"
        :aria-label="$t('player_select.sync_adjust')"
        @update:model-value="onSlide"
        @value-commit="onCommit"
      />
    </div>
    <div class="sync-adjust-menu__row sync-adjust-menu__row--steps">
      <Button
        v-for="step in STEPS"
        :key="step"
        variant="outline"
        size="sm"
        :disabled="!loaded || saving"
        @click="nudge(step)"
      >
        {{ step > 0 ? `+${step}` : step }}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :disabled="!loaded || saving || draft === 0"
        @click="save(0)"
      >
        {{ $t("player_select.sync_adjust_reset") }}
      </Button>
    </div>
    <p class="sync-adjust-menu__hint">
      {{ $t("player_select.sync_adjust_hint") }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  SYNC_ADJUST_KEY,
  SYNC_ADJUST_MAX,
  SYNC_ADJUST_MIN,
} from "@/helpers/sync_adjust";
import { api } from "@/plugins/api";
import { $t } from "@/plugins/i18n";
import { Timer } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";

const STEPS = [-50, -10, 10, 50] as const;

const props = defineProps<{ playerId: string }>();

const draft = ref(0);
const saved = ref(0);
const loaded = ref(false);
const saving = ref(false);

const valueLabel = computed(() =>
  loaded.value ? `${draft.value > 0 ? "+" : ""}${draft.value} ms` : "…",
);

const clamp = (value: number) =>
  Math.min(SYNC_ADJUST_MAX, Math.max(SYNC_ADJUST_MIN, Math.round(value)));

onMounted(async () => {
  try {
    const value = await api.getPlayerConfigValue(
      props.playerId,
      SYNC_ADJUST_KEY,
    );
    saved.value = clamp(Number(value ?? 0) || 0);
    draft.value = saved.value;
  } catch (error) {
    console.error("Failed to read sync_adjust:", error);
  } finally {
    loaded.value = true;
  }
});

function onSlide(value: number[] | undefined) {
  if (value && value.length) draft.value = clamp(value[0]);
}

function onCommit(value: number[] | undefined) {
  if (value && value.length) void save(clamp(value[0]));
}

function nudge(step: number) {
  void save(clamp(draft.value + step));
}

async function save(value: number) {
  draft.value = value;
  if (value === saved.value) return;
  saving.value = true;
  try {
    await api.savePlayerConfig(props.playerId, { [SYNC_ADJUST_KEY]: value });
    saved.value = value;
  } catch (error) {
    console.error("Failed to save sync_adjust:", error);
    draft.value = saved.value;
    toast.error($t("player_select.sync_adjust_failed"));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.sync-adjust-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px 8px;
  font-size: 0.875rem;
  min-width: 260px;
}

.sync-adjust-menu__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sync-adjust-menu__row--steps {
  gap: 6px;
}

.sync-adjust-menu__icon {
  flex: 0 0 auto;
}

.sync-adjust-menu__label {
  flex: 1 1 auto;
}

.sync-adjust-menu__value {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.sync-adjust-menu__slider {
  flex: 1 1 auto;
  padding: 0 4px;
}

.sync-adjust-menu__hint {
  margin: 0;
  font-size: 0.75rem;
  opacity: 0.65;
}
</style>
