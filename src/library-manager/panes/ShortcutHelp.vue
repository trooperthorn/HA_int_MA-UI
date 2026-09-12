<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="shortcut-help">
      <DialogHeader>
        <DialogTitle>{{ $t("settings.keyboard.title") }}</DialogTitle>
        <DialogDescription>
          {{ $t("library_manager.shortcuts.help_description") }}
        </DialogDescription>
      </DialogHeader>
      <div class="shortcut-help__groups">
        <section
          v-for="group in groups"
          :key="group.scope"
          class="shortcut-help__group"
        >
          <h3 class="shortcut-help__heading">
            {{ $t(`settings.keyboard.scope_${group.scope}`) }}
          </h3>
          <dl class="shortcut-help__list">
            <template v-for="row in group.rows" :key="row.labelKey">
              <dt>{{ $t(row.labelKey) }}</dt>
              <dd>
                <span
                  v-for="(combo, index) in row.combos"
                  :key="index"
                  class="shortcut-help__combo"
                >
                  <template v-for="(part, i) in combo" :key="i">
                    <span v-if="part === THEN" class="shortcut-help__then">
                      {{ $t("library_manager.shortcuts.then") }}
                    </span>
                    <Kbd v-else>{{ part }}</Kbd>
                  </template>
                </span>
              </dd>
            </template>
          </dl>
        </section>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { KEY_BINDINGS, LOCAL_KEY_ROWS, type KeymapScope } from "../keymap";
import { comboParts, THEN } from "../keymapDisplay";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [open: boolean] }>();

interface HelpRow {
  labelKey: string;
  combos: string[][];
}

const SCOPES: KeymapScope[] = ["global", "grid", "queue"];

const groups = computed(() =>
  SCOPES.map((scope) => {
    const rows: HelpRow[] = KEY_BINDINGS.filter(
      (binding) => binding.scope === scope,
    ).map((binding) => ({
      labelKey: binding.labelKey,
      // the sort chord lists nine keys; one entry with a range reads better
      combos:
        binding.id === "sort_by_column"
          ? [["S", THEN, "1", "…", "9"]]
          : binding.keys.map(comboParts),
    }));
    for (const local of LOCAL_KEY_ROWS) {
      if (local.scope === scope) {
        rows.push({ labelKey: local.labelKey, combos: [local.keys] });
      }
    }
    return { scope, rows };
  }).filter((group) => group.rows.length > 0),
);
</script>

<style scoped>
.shortcut-help {
  max-width: 720px;
}

.shortcut-help__groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-height: 60vh;
  overflow: auto;
  font-size: 13px;
}

.shortcut-help__heading {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.62);
}

.shortcut-help__list {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 16px;
  margin: 0;
}

.shortcut-help__list dt {
  color: rgba(var(--v-theme-fg), 0.85);
}

.shortcut-help__list dd {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
}

.shortcut-help__combo {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.shortcut-help__then {
  font-size: 11px;
  color: rgba(var(--v-theme-fg), 0.5);
  padding: 0 2px;
}
</style>
