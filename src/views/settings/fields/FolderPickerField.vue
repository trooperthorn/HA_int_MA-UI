<template>
  <div class="flex items-start gap-2">
    <v-text-field
      class="min-w-0 flex-1"
      :model-value="entry.value"
      :placeholder="entry.default_value?.toString()"
      clearable
      :disabled="disabled"
      :label="label"
      :required="entry.required"
      :rules="[(v) => !(!v && entry.required) || $t('settings.invalid_input')]"
      variant="outlined"
      density="comfortable"
      @update:model-value="emit('update:value', $event)"
      @click:clear="emit('update:value', null)"
    />
    <Button
      v-if="available"
      type="button"
      variant="outline"
      class="mt-1"
      :disabled="disabled"
      data-folder-browse
      @click="showPicker = true"
    >
      <FolderOpen class="size-4" />
      {{ $t("settings.folder_picker.browse") }}
    </Button>
    <FolderPickerDialog
      v-if="available"
      v-model="showPicker"
      :initial-path="initialPath"
      @pick="(path) => emit('update:value', path)"
    />
  </div>
</template>

<script setup lang="ts">
// The Filesystem provider's path entry with a Browse button. The text field
// stays for anyone who prefers to type; the button hides itself when the
// server has no folder listing (an image without the app's browse_path edit).
import FolderPickerDialog from "@/components/FolderPickerDialog.vue";
import { Button } from "@/components/ui/button";
import type { ConfigEntryUI } from "@/helpers/config_entry_ui";
import { folderBrowseAvailable } from "@/helpers/folder_picker";
import type { ConfigValueType } from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { FolderOpen } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";

const props = defineProps<{
  entry: ConfigEntryUI;
  label: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:value", value: ConfigValueType): void;
}>();

// the entry may hold a non-string (a cleared value); the dialog only wants a path
const initialPath = computed(() =>
  typeof props.entry.value === "string" ? props.entry.value : null,
);

const showPicker = ref(false);
const available = ref(false);

onMounted(async () => {
  available.value = await folderBrowseAvailable();
});
</script>
