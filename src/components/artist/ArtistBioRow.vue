<template>
  <section
    v-hold="onHold"
    class="artist-bio"
    @touchstart.passive="onTouchStart"
    @click.capture="swallowClickAfterHold"
  >
    <MarkdownText
      class="artist-bio__text"
      :text="description"
      @click="onTextClick"
    />
    <button type="button" class="artist-bio__more" @click="showFullInfo = true">
      {{ $t("read_more") }}
    </button>

    <Dialog v-model:open="showFullInfo">
      <DialogContent class="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{{ item.name }}</DialogTitle>
        </DialogHeader>
        <MarkdownText
          :text="description"
          class="max-w-none text-sm leading-relaxed"
          style="max-height: 60vh; overflow-y: auto"
        />
        <p class="text-muted-foreground text-xs">
          {{ $t("artist_bio_source_unknown") }} ·
          {{
            $t("artist_bio_language", {
              language:
                item.metadata?.description_language ||
                $t("artist_bio_language_unknown"),
            })
          }}
          ·
          {{ $t("artist_bio_freshness_unknown") }}
        </p>
        <p v-if="metadataCheckedAt" class="text-muted-foreground text-xs">
          {{ $t("artist_bio_metadata_checked", { date: metadataCheckedAt }) }}
        </p>
        <DialogFooter>
          <Button @click="showFullInfo = false">{{ $t("close") }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import MarkdownText from "@/components/MarkdownText.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHoldToOpenMenu } from "@/composables/useHoldToOpenMenu";
import type { Artist } from "@/plugins/api/interfaces";
import { computed, ref } from "vue";

export interface Props {
  item: Artist;
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "edit-rows"): void;
}>();

const showFullInfo = ref(false);

const description = computed(() => props.item.metadata?.description || "");
const metadataCheckedAt = computed(() => {
  const seconds = props.item.metadata?.last_refresh;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0)
    return undefined;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
});

const { onHold, onTouchStart, swallowClickAfterHold } = useHoldToOpenMenu(() =>
  emit("edit-rows"),
);

const onTextClick = (event: MouseEvent) => {
  // a link in the description opens on its own; don't also expand the text
  if ((event.target as HTMLElement).closest("a")) return;
  showFullInfo.value = true;
};
</script>

<style scoped>
.artist-bio {
  padding: 20px 28px 8px;
  max-width: 900px;
}
.artist-bio__text {
  font-size: 15px;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.artist-bio__more {
  margin-top: 4px;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  color: rgb(var(--v-theme-primary));
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

@media (max-width: 768px) {
  .artist-bio {
    padding: 16px 16px 4px;
  }
  .artist-bio__text {
    font-size: 14px;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
  .artist-bio__more {
    margin-top: 2px;
  }
}
</style>
