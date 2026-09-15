<template>
  <Dialog v-model:open="model">
    <DialogContent
      class="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-[560px]"
      @open-auto-focus="preventOnScreenKeyboardOnOpen"
    >
      <DialogHeader class="border-b px-5 py-4 pr-12 text-left">
        <DialogTitle>{{ $t("settings.folder_picker.title") }}</DialogTitle>
      </DialogHeader>

      <!-- the roots the server allows: the mounted drive, media, share -->
      <div class="flex flex-wrap gap-2 px-5 pt-4" data-folder-roots>
        <Button
          v-for="root of roots"
          :key="root.path"
          type="button"
          size="sm"
          :variant="isUnder(root.path) ? 'default' : 'outline'"
          :disabled="!root.present"
          :title="
            root.present
              ? root.path
              : $t('settings.folder_picker.not_mounted', { path: root.path })
          "
          @click="open(root.path)"
        >
          <HardDrive v-if="root.path === '/music'" class="size-4" />
          <Folder v-else class="size-4" />
          {{ root.label }}
          <span v-if="!root.present" class="text-muted-foreground text-xs">
            {{ $t("settings.folder_picker.not_mounted_short") }}
          </span>
        </Button>
      </div>

      <!-- where we are -->
      <div
        v-if="current"
        class="text-muted-foreground flex min-w-0 items-center gap-1 px-5 pt-3 text-xs"
        data-folder-breadcrumb
      >
        <button
          v-for="crumb of crumbs"
          :key="crumb.path"
          type="button"
          class="hover:text-foreground max-w-[12rem] truncate"
          @click="open(crumb.path)"
        >
          {{ crumb.name }}
        </button>
      </div>

      <div
        class="min-h-[180px] flex-1 overflow-y-auto px-5 py-3"
        :class="{ 'opacity-60': loading }"
      >
        <div
          v-if="loading && folders.length === 0"
          class="flex justify-center py-10"
        >
          <Spinner class="text-primary size-8" />
        </div>
        <p v-else-if="error" class="text-destructive py-8 text-center text-sm">
          {{ error }}
        </p>
        <p
          v-else-if="!current"
          class="text-muted-foreground py-8 text-center text-sm"
        >
          {{ $t("settings.folder_picker.pick_root") }}
        </p>
        <p
          v-else-if="folders.length === 0"
          class="text-muted-foreground py-8 text-center text-sm"
        >
          {{ $t("settings.folder_picker.no_folders") }}
        </p>
        <template v-else>
          <button
            v-for="folder of folders"
            :key="folder.path"
            type="button"
            class="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-2 text-left"
            data-folder-row
            @click="open(folder.path)"
          >
            <Folder class="text-muted-foreground size-4 shrink-0" />
            <span class="min-w-0 flex-1 truncate text-sm">{{
              folder.name
            }}</span>
            <ChevronRight class="text-muted-foreground size-4 shrink-0" />
          </button>
        </template>
      </div>

      <DialogFooter
        class="items-center gap-2 border-t px-5 py-3 sm:justify-between"
      >
        <span
          class="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
          :title="current ?? ''"
        >
          {{ current ?? "" }}
        </span>
        <div class="flex gap-2">
          <Button type="button" variant="outline" @click="model = false">
            {{ $t("close") }}
          </Button>
          <Button
            type="button"
            :disabled="!current"
            data-folder-use
            @click="use()"
          >
            {{ $t("settings.folder_picker.use_folder") }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
// A folder browser over the app's music roots (the server's
// config/providers/browse_path command, an app-side edit). Roots the server
// reports as absent stay visible but greyed, so an unmounted drive says so
// instead of showing an empty tree.
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { preventOnScreenKeyboardOnOpen } from "@/helpers/dialog_focus";
import { api } from "@/plugins/api";
import type {
  BrowsePathFolder,
  BrowsePathRoot,
} from "@/plugins/api/interfaces";
import { $t } from "@/plugins/i18n";
import { ChevronRight, Folder, HardDrive } from "@lucide/vue";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  // the path the entry holds now; the dialog opens there when it lies under a root
  initialPath?: string | null;
}>();
const model = defineModel<boolean>();
const emit = defineEmits<{ pick: [path: string] }>();

const roots = ref<BrowsePathRoot[]>([]);
const folders = ref<BrowsePathFolder[]>([]);
const current = ref<string | null>(null);
const loading = ref(false);
const error = ref("");
let requestId = 0;

const isUnder = (root: string) =>
  !!current.value &&
  (current.value === root || current.value.startsWith(root + "/"));

const crumbs = computed(() => {
  if (!current.value) return [];
  const root = roots.value.find((candidate) => isUnder(candidate.path));
  if (!root) return [{ name: current.value, path: current.value }];
  const rest = current.value.slice(root.path.length).split("/").filter(Boolean);
  const out = [{ name: root.label, path: root.path }];
  let path = root.path;
  for (const part of rest) {
    path += "/" + part;
    out.push({ name: part, path });
  }
  return out;
});

async function open(path: string | null) {
  const id = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const result = await api.browseProviderPath(path ?? undefined);
    if (id !== requestId) return;
    roots.value = result.roots;
    current.value = result.path;
    folders.value = result.folders;
  } catch (err) {
    if (id !== requestId) return;
    error.value = $t("settings.folder_picker.failed");
    console.warn("folder picker: browse failed", err);
  } finally {
    if (id === requestId) loading.value = false;
  }
}

function use() {
  if (!current.value) return;
  emit("pick", current.value);
  model.value = false;
}

watch(model, (opened) => {
  if (!opened) return;
  folders.value = [];
  current.value = null;
  // start where the entry points when that is browsable, else at the roots
  void open(null).then(() => {
    const start = props.initialPath?.trim();
    if (
      start &&
      roots.value.some(
        (root) =>
          root.present &&
          (start === root.path || start.startsWith(root.path + "/")),
      )
    ) {
      void open(start);
    }
  });
});
</script>
