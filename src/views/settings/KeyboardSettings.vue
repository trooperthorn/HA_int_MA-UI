<template>
  <div class="p-4">
    <SettingsHeaderCard
      :icon="Keyboard"
      icon-class="text-violet-500"
      :title="$t('settings.keyboard.title')"
      :description="$t('settings.keyboard.description')"
      :show-advanced-toggle="false"
      @reset-to-defaults="() => {}"
    />

    <table class="keyboard-settings">
      <thead>
        <tr>
          <th>{{ $t("settings.keyboard.action") }}</th>
          <th>{{ $t("settings.keyboard.keys") }}</th>
          <th>{{ $t("settings.keyboard.scope") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="binding in KEY_BINDINGS" :key="binding.id">
          <td>{{ $t(binding.labelKey) }}</td>
          <td>
            <span
              v-for="combo in binding.keys"
              :key="combo"
              class="keyboard-settings__combo"
            >
              <Kbd v-for="part in parts(combo)" :key="part">{{ part }}</Kbd>
            </span>
          </td>
          <td>{{ $t(`settings.keyboard.scope_${binding.scope}`) }}</td>
        </tr>
        <tr v-for="row in GRID_KEYS" :key="row.label">
          <td>{{ $t(row.label) }}</td>
          <td>
            <span class="keyboard-settings__combo">
              <Kbd v-for="part in row.keys" :key="part">{{ part }}</Kbd>
            </span>
          </td>
          <td>{{ $t("settings.keyboard.scope_grid") }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { Keyboard } from "@lucide/vue";
import { Kbd } from "@/components/ui/kbd";
import { KEY_BINDINGS } from "@/library-manager/keymap";
import SettingsHeaderCard from "./SettingsHeaderCard.vue";

// keys the grid and browser handle themselves (not routed through the keymap)
const GRID_KEYS: Array<{ label: string; keys: string[] }> = [
  { label: "settings.keyboard.grid_letter", keys: ["A", "…", "Z"] },
  { label: "settings.keyboard.grid_play", keys: ["Enter"] },
  { label: "settings.keyboard.grid_menu", keys: ["Shift", "Enter"] },
  { label: "settings.keyboard.grid_select_all", keys: ["Ctrl", "A"] },
  { label: "settings.keyboard.grid_search", keys: ["/"] },
  { label: "settings.keyboard.queue_remove", keys: ["Delete"] },
];

const KEY_NAMES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

function parts(combo: string): string[] {
  return combo.split("+").map((part) => {
    if (part in KEY_NAMES) return KEY_NAMES[part];
    if (part.length === 1) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  });
}
</script>

<style scoped>
.keyboard-settings {
  width: 100%;
  max-width: 720px;
  border-collapse: collapse;
  font-size: 13px;
}

.keyboard-settings th {
  text-align: left;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.62);
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.1);
}

.keyboard-settings td {
  padding: 6px 10px;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.06);
}

.keyboard-settings__combo {
  display: inline-flex;
  gap: 4px;
  margin-right: 10px;
}
</style>
