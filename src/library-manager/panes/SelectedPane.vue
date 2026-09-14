<template>
  <div class="selected-pane">
    <div class="selected-pane__head">
      <span class="selected-pane__title">
        {{ $t("library_manager.selected.title") }}
      </span>
      <span v-if="items.length > 1" class="selected-pane__count">
        {{ $t("items_selected", [items.length]) }}
      </span>
    </div>

    <div v-if="!item" class="selected-pane__empty">
      {{ $t("library_manager.selected.empty") }}
    </div>

    <!-- artwork only: nothing to show without an image, so the pane stays
         blank rather than filling with the placeholder cover -->
    <div
      v-else-if="variant === 'art' && !hasImage"
      class="selected-pane__empty"
    ></div>

    <div
      v-else
      class="selected-pane__body"
      :class="{ 'selected-pane__body--art': variant === 'art' }"
    >
      <div v-if="variant !== 'details' && hasImage" class="selected-pane__art">
        <MediaItemThumb :item="item" size="100%" />
      </div>
      <template v-if="variant !== 'art'">
        <div class="selected-pane__name" :title="item.name">
          {{ item.name }}
        </div>
        <div
          v-if="artistLine"
          class="selected-pane__line selected-pane__line--strong"
        >
          {{ artistLine }}
        </div>
        <div v-if="albumLine" class="selected-pane__line">{{ albumLine }}</div>
        <div
          v-if="formatLine"
          class="selected-pane__line selected-pane__line--muted"
        >
          {{ formatLine }}
        </div>
        <!-- each source icon opens its own menu: info, where the file is,
             drop this source, add to a playlist -->
        <div class="selected-pane__sources">
          <button
            v-for="mapping in mappings"
            :key="`${mapping.provider_instance}:${mapping.item_id}`"
            type="button"
            class="selected-pane__source"
            :data-source="mapping.provider_instance"
            :title="mapping.provider_instance"
            :aria-label="mapping.provider_instance"
            @click="openSourceMenu($event, mapping)"
            @contextmenu.prevent="openSourceMenu($event, mapping)"
          >
            <ProviderIcon :domain="mapping.provider_domain" :size="14" />
          </button>
        </div>
        <div v-if="pathLine" class="selected-pane__path" :title="pathLine">
          {{ pathLine }}
        </div>
      </template>
    </div>

    <!-- the actions sit under the scrolling text so a short pane still
         shows every button -->
    <TooltipProvider v-if="item && variant !== 'art'" :delay-duration="300">
      <div class="selected-pane__actions" role="toolbar">
        <Tooltip v-for="action in actions" :key="action.id">
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-sm"
              class="selected-pane__action"
              :class="{ 'selected-pane__action--on': action.active }"
              :aria-label="action.label"
              :data-action="action.id"
              @click="action.run($event)"
            >
              <component :is="action.icon" :size="16" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{{ action.label }}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  </div>
</template>

<script setup lang="ts">
import {
  Disc3,
  FolderOpen,
  Heart,
  Info,
  ListEnd,
  ListMusic,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  Users,
} from "@lucide/vue";
import { computed, type Component } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import MediaItemThumb from "@/components/MediaItemThumb.vue";
import ProviderIcon from "@/components/ProviderIcon.vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ContextMenuItem } from "@/helpers/context_menu_item";
import {
  handleMenuBtnClick,
  handlePlayBtnClick,
} from "@/helpers/media_item_actions";
import { getImageThumbForItem } from "@/helpers/utils";
import { api } from "@/plugins/api";
import {
  MediaType,
  QueueOption,
  type MediaItemType,
  type Playlist,
  type ProviderMapping,
  type Radio,
  type Track,
} from "@/plugins/api/interfaces";
import { eventbus } from "@/plugins/eventbus";
import type { GridItem } from "../columns";
import { ensurePlayer } from "../playerGate";

const props = withDefaults(
  defineProps<{
    items: GridItem[];
    // the listing the items came from, so play continues through it
    parentItem?: MediaItemType;
    // the pane is shown in two places: the text and actions under the
    // source tree ("details"), the artwork under the queue ("art"); "full"
    // is both in one
    variant?: "full" | "details" | "art";
  }>(),
  { parentItem: undefined, variant: "full" },
);

const emit = defineEmits<{
  // show the folder a file lives in, in the library manager's tree
  openFolder: [path: string, provider: string];
}>();

const { t } = useI18n();
const router = useRouter();

// the panel describes the last item picked; actions apply to every one
const item = computed(() => props.items.at(-1));

const hasImage = computed(() => !!getImageThumbForItem(item.value));

const artists = computed(() => {
  const current = item.value;
  return current && "artists" in current && Array.isArray(current.artists)
    ? current.artists
    : [];
});

const artistLine = computed(() =>
  artists.value.map((artist) => artist.name).join(", "),
);

const album = computed(() => {
  const current = item.value;
  return current && "album" in current && current.album ? current.album : null;
});

const albumLine = computed(() => {
  const current = item.value;
  if (!current) return "";
  const parts: string[] = [];
  if (album.value) parts.push(album.value.name);
  if ("track_number" in current && current.track_number) {
    parts.push(`#${current.track_number}`);
  }
  const year =
    "year" in current && current.year
      ? current.year
      : album.value && "year" in album.value && album.value.year
        ? album.value.year
        : undefined;
  if (year) parts.push(String(year));
  return parts.join(" · ");
});

const mappings = computed<ProviderMapping[]>(() => {
  const current = item.value;
  return current && "provider_mappings" in current
    ? (current.provider_mappings ?? [])
    : [];
});

const formatLine = computed(() => {
  const format = mappings.value.find(
    (mapping) => mapping.available,
  )?.audio_format;
  if (!format) return "";
  const parts: string[] = [];
  if (format.content_type)
    parts.push(String(format.content_type).toUpperCase());
  if (format.sample_rate) parts.push(`${format.sample_rate / 1000} kHz`);
  if (format.bit_depth) parts.push(`${format.bit_depth} bit`);
  if (format.bit_rate) parts.push(`${format.bit_rate} kbps`);
  return parts.join(" · ");
});

// filesystem providers key their items by path
const pathLine = computed(
  () =>
    mappings.value.find((mapping) =>
      mapping.provider_domain.startsWith("filesystem_"),
    )?.item_id ?? "",
);

// filesystem providers key their items by the file's path under the share;
// the folder it lives in browses as `<instance>://<directory>`
function folderPathOf(mapping: ProviderMapping): string | undefined {
  if (!mapping.provider_domain.startsWith("filesystem_")) return undefined;
  const slash = mapping.item_id.lastIndexOf("/");
  return `${mapping.provider_instance}://${
    slash >= 0 ? mapping.item_id.slice(0, slash) : ""
  }`;
}

function openSourceMenu(event: MouseEvent, mapping: ProviderMapping) {
  const current = item.value;
  if (!current) return;
  const providerName =
    api.getProvider(mapping.provider_instance)?.name ??
    mapping.provider_instance;
  const folder = folderPathOf(mapping);
  const menuItems: ContextMenuItem[] = [
    {
      label: "library_manager.selected.media_info",
      icon: Info,
      action: () =>
        void router.push({
          name: current.media_type,
          params: { itemId: current.item_id, provider: current.provider },
        }),
    },
    {
      label: "library_manager.selected.file_location",
      icon: FolderOpen,
      disabled: !folder && !mapping.url,
      action: () => {
        if (folder) emit("openFolder", folder, mapping.provider_instance);
        else if (mapping.url) window.open(mapping.url, "_blank", "noopener");
      },
    },
    {
      label: "library_manager.selected.remove_source",
      labelArgs: { provider: providerName },
      icon: Trash2,
      action: () =>
        eventbus.emit("deleteConfirmationDialog", {
          title: t("library_manager.selected.remove_source", {
            provider: providerName,
          }),
          message: t("library_manager.selected.remove_source_confirm", {
            provider: providerName,
          }),
          confirmLabel: t("remove"),
          onConfirm: () =>
            api.removeProviderMapping(
              current.media_type,
              current.item_id,
              mapping,
            ),
        }),
    },
  ];
  if (current.media_type === MediaType.TRACK) {
    menuItems.push({
      label: "add_playlist",
      icon: ListMusic,
      action: () =>
        eventbus.emit("playlistdialog", {
          items: [current as MediaItemType],
          parentItem: props.parentItem,
        }),
    });
  }
  eventbus.emit("contextmenu", {
    items: menuItems,
    posX: event.clientX,
    posY: event.clientY,
  });
}

const isEditable = (current: GridItem): current is Track | Playlist | Radio =>
  current.media_type === MediaType.TRACK ||
  current.media_type === MediaType.PLAYLIST ||
  current.media_type === MediaType.RADIO;

interface PaneAction {
  id: string;
  icon: Component;
  label: string;
  active?: boolean;
  run: (event: MouseEvent) => void;
}

const actions = computed<PaneAction[]>(() => {
  const current = item.value;
  if (!current) return [];
  const all = props.items;
  const single = all.length === 1;
  const list: PaneAction[] = [
    {
      id: "play",
      icon: Play,
      label: t("play_now"),
      run: (event) => {
        const { clientX, clientY } = event;
        void ensurePlayer().then((ready) => {
          if (!ready) return;
          if (single) {
            void handlePlayBtnClick(
              current,
              clientX,
              clientY,
              props.parentItem,
            );
          } else {
            void api.playMedia(all);
          }
        });
      },
    },
    {
      id: "play_next",
      icon: ListEnd,
      label: t("play_next"),
      run: () =>
        void ensurePlayer().then((ready) => {
          if (ready) void api.playMedia(all, QueueOption.NEXT);
        }),
    },
    {
      id: "add_to_queue",
      icon: ListPlus,
      label: t("library_manager.selected.add_to_queue"),
      run: () =>
        void ensurePlayer().then((ready) => {
          if (ready) void api.playMedia(all, QueueOption.ADD);
        }),
    },
  ];
  if (single && "favorite" in current) {
    list.push({
      id: "favorite",
      icon: Heart,
      label: current.favorite ? t("favorites_remove") : t("favorites_add"),
      active: !!current.favorite,
      run: () => api.toggleFavorite(current),
    });
  }
  if (all.every((entry) => entry.media_type === MediaType.TRACK)) {
    list.push({
      id: "add_playlist",
      icon: ListMusic,
      label: t("add_playlist"),
      run: () =>
        eventbus.emit("playlistdialog", {
          items: all as MediaItemType[],
          parentItem: props.parentItem,
        }),
    });
  }
  if (single && isEditable(current)) {
    list.push({
      id: "edit",
      icon: Pencil,
      label: t("edit"),
      run: () => eventbus.emit("editItemDialog", current),
    });
  }
  if (single && album.value) {
    const target = album.value;
    list.push({
      id: "album",
      icon: Disc3,
      label: t("library_manager.selected.go_to_album"),
      run: () =>
        void router.push({
          name: "album",
          params: { itemId: target.item_id, provider: target.provider },
        }),
    });
  }
  if (single && artists.value.length > 0) {
    const target = artists.value[0];
    list.push({
      id: "artist",
      icon: Users,
      label: t("library_manager.selected.go_to_artist"),
      run: () =>
        void router.push({
          name: "artist",
          params: { itemId: target.item_id, provider: target.provider },
        }),
    });
  }
  list.push({
    id: "more",
    icon: MoreHorizontal,
    label: t("library_manager.selected.more"),
    run: (event) =>
      handleMenuBtnClick(
        single ? current : all,
        event.clientX,
        event.clientY,
        props.parentItem,
      ),
  });
  return list;
});
</script>

<style scoped>
.selected-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: rgb(var(--v-theme-panel));
  font-size: 12px;
}

.selected-pane__head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 10px;
  flex: none;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.62);
}

.selected-pane__count {
  margin-left: auto;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: rgba(var(--v-theme-fg), 0.45);
}

.selected-pane__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 24px;
  text-align: center;
  color: rgba(var(--v-theme-fg), 0.5);
}

.selected-pane__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

/* a short pane scrolls rather than squeezing the text lines to nothing */
.selected-pane__body > * {
  flex: none;
}

.selected-pane__art {
  width: min(100%, 220px);
  aspect-ratio: 1;
  align-self: center;
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-fg), 0.06);
}

/* the artwork alone fills whatever the pane gives it */
.selected-pane__body--art {
  flex: 1;
  align-items: center;
  justify-content: center;
}

.selected-pane__body--art .selected-pane__art {
  width: min(100%, calc(100vh - 200px));
  max-height: 100%;
  margin-bottom: 0;
}

.selected-pane__name {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-pane__line {
  color: rgba(var(--v-theme-fg), 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-pane__line--strong {
  color: rgb(var(--v-theme-fg));
}

.selected-pane__line--muted {
  color: rgba(var(--v-theme-fg), 0.5);
  font-size: 11px;
}

.selected-pane__sources {
  display: flex;
  gap: 6px;
  min-height: 14px;
  margin-top: 2px;
}

.selected-pane__source {
  display: inline-flex;
  padding: 2px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.selected-pane__source:hover {
  background: rgba(var(--v-theme-fg), 0.1);
}

.selected-pane__path {
  font-size: 10.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(var(--v-theme-fg), 0.45);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-pane__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  flex: none;
  margin-top: auto;
  padding: 8px 12px;
  border-top: 1px solid rgba(var(--v-theme-fg), 0.08);
}

.selected-pane__action {
  color: rgba(var(--v-theme-fg), 0.7);
}

.selected-pane__action--on {
  color: rgb(var(--v-theme-primary));
}
</style>
