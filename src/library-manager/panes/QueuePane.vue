<template>
  <div class="queue-pane">
    <div class="queue-pane__head">
      <span class="queue-pane__title">{{ $t("now_playing") }}</span>
      <span v-if="store.activePlayerQueue" class="queue-pane__count">
        {{ positionLabel }}
      </span>
      <TooltipProvider :delay-duration="300">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-xs"
              class="queue-pane__button"
              :disabled="!totalItems"
              :aria-label="$t('library_manager.queue.locate')"
              @click="locate"
            >
              <LocateFixed :size="14" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {{ $t("library_manager.queue.locate") }}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon-xs"
              class="queue-pane__button"
              :disabled="!totalItems"
              :aria-label="$t('library_manager.queue.clear')"
              @click="clearQueue"
            >
              <ListX :size="14" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {{ $t("library_manager.queue.clear") }}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>

    <div v-if="!store.activePlayerQueue" class="queue-pane__empty">
      {{ $t("no_player") }}
    </div>
    <div
      v-else
      ref="queueScrollRef"
      class="queue-pane__scroll"
      tabindex="0"
      @keydown="onKeydown"
    >
      <div v-if="queueEnded" class="queue-pane__ended">
        {{ $t("queue_ended") }}
      </div>
      <div v-if="!totalItems" class="queue-pane__empty">
        {{ $t("queue_empty") }}
      </div>
      <div
        v-else
        class="queue-pane__virt"
        :class="{ 'queue-pane__virt--dragging': isDragging }"
        :style="{ height: `${totalSize}px` }"
      >
        <div
          v-for="row in virtualRows"
          :key="row.item?.queue_item_id ?? `slot-${row.index}`"
          :ref="measureRow"
          :data-index="row.index"
          class="queue-pane__row"
          :class="{ 'queue-pane__row--focused': row.index === focusIndex }"
          :style="{
            transform: `translateY(${row.vItem.start + rowOffset(row.index)}px)`,
          }"
        >
          <div v-if="row.divider" class="queue-pane__divider">
            <span class="queue-pane__divider-label">{{ $t(row.divider) }}</span>
            <span
              v-if="row.divider === 'up_next' && upNextCount"
              class="queue-pane__divider-count"
            >
              {{ upNextCount }}
            </span>
            <span class="queue-pane__divider-line"></span>
          </div>
          <QueueModeBanner v-if="row.divider === 'up_next'" />
          <QueueListItem
            v-if="row.item"
            :item="row.item"
            :state="row.state"
            :is-playing="playerActive"
            :dragging="draggingIndex === row.index"
            :marquee-sync="hoveredMarqueeSync"
            :request-badge-color="requestBadgeColor"
            :boost-badge-color="boostBadgeColor"
            @click="onRowClick(row.index)"
            @menu="(e: Event) => openQueueItemMenu(e, row.index)"
            @dragstart="(e: PointerEvent) => startItemDrag(e, row.index)"
          />
          <div v-else class="queue-pane__skeleton">
            <div class="queue-pane__skeleton-thumb"></div>
            <div class="queue-pane__skeleton-lines">
              <div class="queue-pane__skeleton-line"></div>
              <div
                class="queue-pane__skeleton-line queue-pane__skeleton-line--sub"
              ></div>
            </div>
          </div>
        </div>
        <div
          v-if="isDragging && draggedItem"
          class="queue-pane__ghost"
          :style="{ transform: `translateY(${ghostY}px)` }"
        >
          <QueueListItem
            :item="draggedItem"
            state="upcoming"
            ghost
            :request-badge-color="requestBadgeColor"
            :boost-badge-color="boostBadgeColor"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ListX, LocateFixed } from "@lucide/vue";
import { computed, nextTick, ref, toRef, watch } from "vue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import QueueListItem from "@/layouts/default/PlayerOSD/QueueListItem.vue";
import QueueModeBanner from "@/layouts/default/PlayerOSD/QueueModeBanner.vue";
import { useFullscreenQueue } from "@/layouts/default/PlayerOSD/useFullscreenQueue";
import { useUserPreferences } from "@/composables/userPreferences";
import { currentQueueIndex } from "@/helpers/queue_position";
import { api } from "@/plugins/api";
import { store } from "@/plugins/store";

const props = defineProps<{ visible: boolean }>();

// the pane never shows lyrics; the queue list is the whole pane
const {
  queueScrollRef,
  itemAt,
  focusCurrent,
  followCurrent,
  virtualRows,
  totalItems,
  upNextCount,
  queueEnded,
  totalSize,
  measureRow,
  remeasureRows,
  playerActive,
  hoveredMarqueeSync,
  requestBadgeColor,
  boostBadgeColor,
  openQueueItemMenu,
  startItemDrag,
  draggingIndex,
  isDragging,
  draggedItem,
  ghostY,
  rowOffset,
} = useFullscreenQueue(ref(false), { visible: toRef(props, "visible") });

// the "Up next" row holds the queue mode banner; collapsing it shrinks the
// row, so the rows below it move up once the change has rendered
const { getPreference } = useUserPreferences();
const bannerCollapsed = getPreference<boolean>(
  "queueModeBannerCollapsed",
  false,
);
watch(bannerCollapsed, () => void nextTick(remeasureRows));

const positionLabel = computed(() => {
  const queue = store.activePlayerQueue;
  if (!queue || !queue.items) return "";
  // a queue that played through points past its last item
  const current = Math.min(currentQueueIndex(queue), queue.items - 1);
  return `${(current + 1).toLocaleString()} / ${queue.items.toLocaleString()}`;
});

function locate() {
  followCurrent.value = true;
  focusCurrent("smooth");
}

function clearQueue() {
  const queue = store.activePlayerQueue;
  if (queue) api.queueCommandClear(queue.queue_id);
}

// ---- keyboard: walk the rows, play one, drop one -----------------------------

const focusIndex = ref(-1);

function onRowClick(index: number) {
  focusIndex.value = index;
  queueScrollRef.value?.focus({ preventScroll: true });
}

function playIndex(index: number) {
  const queue = store.activePlayerQueue;
  if (queue && index >= 0 && index < (queue.items ?? 0)) {
    api.queueCommandPlayIndex(queue.queue_id, index);
  }
}

function removeIndex(index: number) {
  const queue = store.activePlayerQueue;
  const item = itemAt(index);
  if (!queue || !item) return;
  api.queueCommandDelete(queue.queue_id, item.queue_item_id);
}

function onKeydown(event: KeyboardEvent) {
  if (store.dialogActive || store.showPlayersMenu) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const last = (totalItems.value ?? 0) - 1;
  if (last < 0) return;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      focusIndex.value = Math.min(last, focusIndex.value + 1);
      break;
    case "ArrowUp":
      event.preventDefault();
      focusIndex.value = Math.max(0, focusIndex.value - 1);
      break;
    case "Home":
      event.preventDefault();
      focusIndex.value = 0;
      break;
    case "End":
      event.preventDefault();
      focusIndex.value = last;
      break;
    case "Enter":
      event.preventDefault();
      playIndex(focusIndex.value);
      return;
    case "Delete":
    case "Backspace":
      event.preventDefault();
      removeIndex(focusIndex.value);
      return;
    default:
      return;
  }
  followCurrent.value = false;
  queueScrollRef.value
    ?.querySelector<HTMLElement>(`[data-index="${focusIndex.value}"]`)
    ?.scrollIntoView?.({ block: "nearest" });
}
</script>

<style scoped>
.queue-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: rgb(var(--v-theme-panel));
  --queue-title-size: 12.5px;
  --queue-subtitle-size: 11px;
}

.queue-pane__head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 6px 0 10px;
  flex: none;
  border-bottom: 1px solid rgba(var(--v-theme-fg), 0.08);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.62);
}

.queue-pane__count {
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  color: rgba(var(--v-theme-fg), 0.45);
  font-variant-numeric: tabular-nums;
  margin-right: auto;
}

.queue-pane__button {
  color: rgba(var(--v-theme-fg), 0.6);
}

.queue-pane__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  outline: none;
  overscroll-behavior-y: contain;
}

.queue-pane__virt {
  position: relative;
  width: 100%;
}

.queue-pane__row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

.queue-pane__scroll:focus-visible .queue-pane__row--focused {
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.queue-pane__virt--dragging .queue-pane__row {
  transition: transform 0.18s cubic-bezier(0.2, 0, 0, 1);
}

.queue-pane__ghost {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 3;
  pointer-events: none;
}

.queue-pane__divider {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 8px 4px;
}

.queue-pane__divider-label {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-fg), 0.6);
}

.queue-pane__divider-count {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-fg), 0.4);
}

.queue-pane__divider-line {
  flex: 1;
  height: 1px;
  background: rgba(var(--v-theme-fg), 0.12);
}

.queue-pane__skeleton {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 60px;
  padding: 6px 8px;
}

.queue-pane__skeleton-thumb {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background: rgba(var(--v-theme-fg), 0.08);
}

.queue-pane__skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.queue-pane__skeleton-line {
  width: 55%;
  height: 12px;
  border-radius: 4px;
  background: rgba(var(--v-theme-fg), 0.08);
}

.queue-pane__skeleton-line--sub {
  width: 38%;
  height: 10px;
}

.queue-pane__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 24px;
  font-size: 12px;
  text-align: center;
  color: rgba(var(--v-theme-fg), 0.5);
}

.queue-pane__ended {
  padding: 8px 4px;
  font-size: 12px;
  text-align: center;
  color: rgba(var(--v-theme-fg), 0.5);
}
</style>
