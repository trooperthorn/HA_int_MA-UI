<template>
  <div class="p-4">
    <SettingsHeaderCard
      :icon="ListOrdered"
      icon-class="text-teal-500"
      :title="$t('settings.player_menu')"
      :description="$t('settings.player_menu_description')"
      :show-advanced-toggle="false"
      @reset-to-defaults="reset"
    />

    <ul class="play-menu-settings">
      <li
        v-for="(id, index) in order"
        :key="id"
        class="play-menu-settings__row"
      >
        <Checkbox
          :model-value="!disabled.has(id)"
          @update:model-value="
            (v: boolean | 'indeterminate') => setEnabled(id, v === true)
          "
        />
        <span
          class="play-menu-settings__label"
          :class="{ 'play-menu-settings__label--disabled': disabled.has(id) }"
        >
          {{ $t(`settings.player_menu_items.${id}`) }}
        </span>
        <div class="play-menu-settings__move">
          <Button
            variant="ghost-icon"
            size="icon-xs"
            :disabled="index === 0"
            :aria-label="$t('settings.player_menu_move_up')"
            @click="move(index, -1)"
          >
            <ChevronUp class="size-4" />
          </Button>
          <Button
            variant="ghost-icon"
            size="icon-xs"
            :disabled="index === order.length - 1"
            :aria-label="$t('settings.player_menu_move_down')"
            @click="move(index, 1)"
          >
            <ChevronDown class="size-4" />
          </Button>
        </div>
      </li>
    </ul>

    <Button variant="outline" class="mt-4" @click="reset">
      {{ $t("settings.player_menu_reset") }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronUp, ListOrdered } from "@lucide/vue";
import { ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_PLAYER_MENU_ORDER,
  playerMenuPreference,
  setPlayerMenuPreference,
} from "@/helpers/player_menu_preferences";
import SettingsHeaderCard from "./SettingsHeaderCard.vue";

// full known-id order, with the saved order's ids moved to the front (any id
// missing from the saved order, e.g. a menu entry added since, keeps its
// built-in position at the end)
const order = ref<string[]>(resolveOrder());
const disabled = ref<Set<string>>(
  new Set(playerMenuPreference.value.disabled ?? []),
);

function resolveOrder(): string[] {
  const saved = playerMenuPreference.value.order;
  if (!saved || saved.length === 0) return [...DEFAULT_PLAYER_MENU_ORDER];
  const known = new Set<string>(DEFAULT_PLAYER_MENU_ORDER);
  const savedKnown = saved.filter((id) => known.has(id));
  const missing = DEFAULT_PLAYER_MENU_ORDER.filter(
    (id) => !savedKnown.includes(id),
  );
  return [...savedKnown, ...missing];
}

// re-sync if the preference changes elsewhere (another tab/device)
watch(playerMenuPreference, () => {
  order.value = resolveOrder();
  disabled.value = new Set(playerMenuPreference.value.disabled ?? []);
});

async function persist() {
  await setPlayerMenuPreference({
    order: order.value,
    disabled: [...disabled.value],
  });
}

function move(index: number, delta: -1 | 1) {
  const target = index + delta;
  if (target < 0 || target >= order.value.length) return;
  const next = [...order.value];
  [next[index], next[target]] = [next[target], next[index]];
  order.value = next;
  void persist();
}

function setEnabled(id: string, enabled: boolean) {
  const next = new Set(disabled.value);
  if (enabled) next.delete(id);
  else next.add(id);
  disabled.value = next;
  void persist();
}

function reset() {
  order.value = [...DEFAULT_PLAYER_MENU_ORDER];
  disabled.value = new Set();
  void persist();
}
</script>

<style scoped>
.play-menu-settings {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  max-width: 480px;
}

.play-menu-settings__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.06);
}

.play-menu-settings__label {
  flex: 1;
  min-width: 0;
}

.play-menu-settings__label--disabled {
  opacity: 0.5;
  text-decoration: line-through;
}

.play-menu-settings__move {
  display: flex;
  gap: 2px;
}
</style>
