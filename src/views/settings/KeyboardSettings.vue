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
        <tr v-for="row in rows" :key="row.labelKey">
          <td>{{ $t(row.labelKey) }}</td>
          <td>
            <span
              v-for="(combo, index) in row.combos"
              :key="index"
              class="keyboard-settings__combo"
            >
              <template v-for="(part, i) in combo" :key="i">
                <span v-if="part === THEN" class="keyboard-settings__then">
                  {{ $t("library_manager.shortcuts.then") }}
                </span>
                <Kbd v-else>{{ part }}</Kbd>
              </template>
            </span>
          </td>
          <td>{{ $t(`settings.keyboard.scope_${row.scope}`) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { Keyboard } from "@lucide/vue";
import { Kbd } from "@/components/ui/kbd";
import { KEY_BINDINGS, LOCAL_KEY_ROWS } from "@/library-manager/keymap";
import { comboParts, THEN } from "@/library-manager/keymapDisplay";
import SettingsHeaderCard from "./SettingsHeaderCard.vue";

const rows = [
  ...KEY_BINDINGS.map((binding) => ({
    labelKey: binding.labelKey,
    scope: binding.scope,
    combos:
      binding.id === "sort_by_column"
        ? [["S", THEN, "1", "…", "9"]]
        : binding.keys.map(comboParts),
  })),
  ...LOCAL_KEY_ROWS.map((local) => ({
    labelKey: local.labelKey,
    scope: local.scope,
    combos: [local.keys],
  })),
];
</script>

<style scoped>
.keyboard-settings {
  width: 100%;
  max-width: 760px;
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
  align-items: center;
  gap: 3px;
  margin-right: 10px;
}

.keyboard-settings__then {
  font-size: 11px;
  color: rgba(var(--v-theme-fg), 0.5);
  padding: 0 2px;
}
</style>
