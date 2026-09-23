<!--
  Audio delay popout for player settings. Sendspin's output delay has a
  different range and direction from AirPlay/Squeezelite sync_adjust.
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
        :min="config.min"
        :max="config.max"
        :step="5"
        :disabled="!loaded || !available || saving"
        class="sync-adjust-menu__slider"
        :aria-label="$t('player_select.sync_adjust')"
        @update:model-value="onSlide"
        @value-commit="onCommit"
      />
    </div>
    <div class="sync-adjust-menu__row sync-adjust-menu__row--steps">
      <Button
        v-for="step in config.steps"
        :key="step"
        variant="outline"
        size="sm"
        :disabled="!loaded || !available || saving"
        @click="nudge(step)"
      >
        {{ step > 0 ? `+${step}` : step }}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :disabled="!loaded || !available || saving || draft === 0"
        @click="save(0)"
      >
        {{ $t("player_select.sync_adjust_reset") }}
      </Button>
    </div>
    <p class="sync-adjust-menu__hint">
      {{ $t(statusMessage || config.hint) }}
    </p>
    <div
      v-if="config.key === SENDSPIN_DELAY_KEY"
      class="sync-adjust-menu__timing"
    >
      <p data-testid="sendspin-reported-delay">
        {{
          reportedTiming.delay === undefined
            ? $t("player_select.sendspin_delay_unreported")
            : $t("player_select.sendspin_delay_reported", [
                reportedTiming.delay,
              ])
        }}
      </p>
      <p v-if="reportedTiming.lead !== undefined">
        {{ $t("player_select.sendspin_startup_lead", [reportedTiming.lead]) }}
      </p>
      <p v-if="reportedTiming.buffer !== undefined">
        {{ $t("player_select.sendspin_min_buffer", [reportedTiming.buffer]) }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { getAudioDelayConfig, SENDSPIN_DELAY_KEY } from "@/helpers/sync_adjust";
import { api } from "@/plugins/api";
import { $t } from "@/plugins/i18n";
import { Timer } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";

const props = defineProps<{ playerId: string; provider: string }>();
const config = computed(() => {
  const result = getAudioDelayConfig({ provider: props.provider });
  if (!result)
    throw new Error("Audio delay is not available for this provider");
  return result;
});

const draft = ref(0);
const saved = ref(0);
const loaded = ref(false);
const available = ref(false);
const saving = ref(false);
const statusMessage = ref("");

const reportedTiming = computed(() => {
  const attrs = api.players[props.playerId]?.extra_attributes;
  const readMs = (key: string, max: number) => {
    const value = attrs?.[key];
    return typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= max
      ? value
      : undefined;
  };
  return {
    delay: readMs("sendspin_output_delay_ms", 5000),
    lead: readMs("sendspin_startup_lead_ms", 60000),
    buffer: readMs("sendspin_min_buffer_ms", 60000),
  };
});

const valueLabel = computed(() =>
  !loaded.value
    ? "…"
    : available.value
      ? `${draft.value > 0 ? "+" : ""}${draft.value} ms`
      : "—",
);

const clamp = (value: number) =>
  Math.min(config.value.max, Math.max(config.value.min, Math.round(value)));

onMounted(async () => {
  try {
    let defaultValue = 0;
    if (config.value.requiresCapability) {
      const entries = await api.getPlayerConfigEntries(props.playerId);
      const entry = entries.find((item) => item.key === config.value.key);
      if (!entry) {
        statusMessage.value = "player_select.sync_adjust_unavailable";
        return;
      }
      defaultValue = Number(entry.default_value ?? 0);
    }
    const value = await api.getPlayerConfigValue(
      props.playerId,
      config.value.key,
    );
    const numericValue = Number(value ?? defaultValue);
    if (!Number.isFinite(numericValue)) throw new Error("Invalid audio delay");
    saved.value = clamp(numericValue);
    draft.value = saved.value;
    available.value = true;
  } catch (error) {
    console.error("Failed to read audio delay:", error);
    statusMessage.value = "player_select.sync_adjust_load_failed";
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
  if (!available.value || saving.value) return;
  draft.value = value;
  if (value === saved.value) return;
  saving.value = true;
  try {
    await api.savePlayerConfig(props.playerId, { [config.value.key]: value });
    saved.value = value;
  } catch (error) {
    console.error("Failed to save audio delay:", error);
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
