<template>
  <Button
    id="player-select-button"
    variant="ghost"
    :class="[
      navigation
        ? 'player-control-button mobile-navigation-item min-w-0 flex-1 px-1'
        : 'player-control-button player-bar-action player-bar-player-button h-20 w-24 min-w-0 rounded-none px-1',
    ]"
    :data-active="store.showPlayersMenu"
    :data-suppress-hover="suppressHover"
    :aria-label="playerSelectLabel"
    :aria-expanded="store.showPlayersMenu"
    aria-haspopup="dialog"
    @click="togglePlayersMenu"
    @pointerenter="onPointerEnter"
  >
    <span
      :class="navigation ? 'mobile-navigation-icon' : 'player-bar-action-icon'"
      :style="navigation ? 'position: relative' : undefined"
    >
      <PlayerIcon
        :icon="store.activePlayer?.icon"
        :size="28"
        :stroke-width="1.4"
        class="size-7"
      />
      <!-- a small badge marking this as "tap to see/switch players" rather
           than a plain status readout of what's currently playing -->
      <ChevronsUpDown
        v-if="navigation"
        :size="11"
        class="player-select-affordance"
      />
    </span>
    <span
      :class="
        navigation ? 'mobile-navigation-label' : 'player-bar-action-label'
      "
    >
      {{ playerName }}
    </span>
  </Button>
</template>

<script setup lang="ts">
import PlayerIcon from "@/components/PlayerIcon.vue";
import { Button } from "@/components/ui/button";
import { usePopoutTriggerHover } from "@/composables/usePopoutTriggerHover";
import { $t } from "@/plugins/i18n";
import { store } from "@/plugins/store";
import { ChevronsUpDown } from "@lucide/vue";
import { computed } from "vue";

const { suppressHover, onPointerEnter } = usePopoutTriggerHover(
  () => store.showPlayersMenu,
);
const playerName = computed(() => store.activePlayer?.name || $t("no_player"));
const playerSelectLabel = computed(
  () => `${$t("tooltip.select_player")}: ${playerName.value}`,
);

withDefaults(
  defineProps<{
    navigation?: boolean;
  }>(),
  {
    navigation: false,
  },
);

function togglePlayersMenu() {
  store.showPlayersMenu = !store.showPlayersMenu;
}
</script>

<style scoped>
.player-select-affordance {
  position: absolute;
  right: -6px;
  bottom: -3px;
  padding: 1px;
  border-radius: 999px;
  background: var(--background);
  color: color-mix(in srgb, var(--foreground) 70%, transparent);
}
</style>
