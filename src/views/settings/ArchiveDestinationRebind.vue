<template>
  <div
    class="mt-3 space-y-2 rounded-lg border p-3"
    data-testid="archive-destination-rebind"
  >
    <p class="font-medium">{{ $t("settings.archives.rebind_title") }}</p>
    <p class="text-sm text-muted-foreground">
      {{ $t("settings.archives.rebind_description") }}
    </p>
    <p class="break-all text-sm">
      {{ $t("settings.archives.rebind_old", { id: oldItemId }) }}
    </p>
    <label class="block space-y-1">
      <span>{{ $t("settings.archives.mirror_candidate_id") }}</span>
      <input
        v-model.trim="candidateId"
        class="archive-input"
        type="text"
        maxlength="128"
        data-testid="archive-rebind-candidate"
        :disabled="busy"
        @input="review = undefined"
      />
    </label>
    <Button
      variant="outline"
      data-testid="archive-rebind-inspect"
      :disabled="busy || !candidateId || candidateId === oldItemId"
      @click="inspect"
      >{{ $t("settings.archives.rebind_inspect") }}</Button
    >
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="review" data-testid="archive-rebind-review" role="status">
      {{ $t(`settings.archives.rebind_${review.classification}`) }}
    </p>
    <Button
      v-if="review?.classification === 'exact_content'"
      data-testid="archive-rebind-apply"
      :disabled="busy"
      @click="apply"
      >{{ $t("settings.archives.rebind_apply") }}</Button
    >
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import type { ArchiveDestinationRebindReview } from "@/library-manager/enrichment";
import { api } from "@/plugins/api";
import { $t } from "@/plugins/i18n";

const props = defineProps<{
  kind: "mirror" | "playback";
  subscriptionId: string;
  oldItemId: string;
  contentDigest: string;
  revision?: number | null;
}>();
const emit = defineEmits<{ rebound: [] }>();
const candidateId = ref("");
const review = ref<ArchiveDestinationRebindReview>();
const error = ref("");
const busy = ref(false);
let generation = 0;
let alive = true;
const request = <T,>(command: string, args: Record<string, unknown>) =>
  api.sendCommand<T>(`library_enrichment/${command}`, args, {
    suppressGlobalError: true,
  });
const errorText = (err: unknown) =>
  err && typeof err === "object" && "message" in err
    ? String(err.message)
    : String(err);
const current = (token: number) => alive && token === generation;

function validate(value: ArchiveDestinationRebindReview) {
  if (
    value.kind !== props.kind ||
    value.subscription_id !== props.subscriptionId ||
    value.old_item_id !== props.oldItemId ||
    value.candidate_item_id !== candidateId.value ||
    value.expected_content_digest !== props.contentDigest ||
    !/^[a-f0-9]{64}$/.test(value.observed_content_digest) ||
    !["exact_content", "mismatch"].includes(value.classification) ||
    (props.kind === "mirror" && value.revision !== props.revision)
  )
    throw new Error($t("settings.archives.rebind_invalid_response"));
}

async function inspect() {
  if (busy.value || !candidateId.value || candidateId.value === props.oldItemId)
    return;
  const token = ++generation;
  busy.value = true;
  error.value = "";
  review.value = undefined;
  try {
    const result = await request<ArchiveDestinationRebindReview>(
      "destination_rebind_inspect",
      {
        kind: props.kind,
        subscription_id: props.subscriptionId,
        candidate_item_id: candidateId.value,
      },
    );
    if (!current(token)) return;
    validate(result);
    review.value = result;
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) busy.value = false;
  }
}

async function apply() {
  const saved = review.value;
  if (busy.value || !saved || saved.classification !== "exact_content") return;
  const token = ++generation;
  busy.value = true;
  error.value = "";
  review.value = undefined;
  try {
    const result = await request<
      ArchiveDestinationRebindReview & {
        destination: { destination_item_id: string };
      }
    >("destination_rebind_apply", {
      kind: saved.kind,
      subscription_id: saved.subscription_id,
      candidate_item_id: saved.candidate_item_id,
      expected_old_item_id: saved.old_item_id,
      expected_content_digest: saved.expected_content_digest,
      expected_observed_digest: saved.observed_content_digest,
      expected_revision: saved.revision,
    });
    if (!current(token)) return;
    if (
      result.destination?.destination_item_id !== saved.candidate_item_id ||
      result.classification !== "exact_content"
    )
      throw new Error($t("settings.archives.rebind_invalid_response"));
    emit("rebound");
  } catch (err) {
    if (current(token)) error.value = errorText(err);
  } finally {
    if (current(token)) busy.value = false;
  }
}

watch(
  () => [
    props.kind,
    props.subscriptionId,
    props.oldItemId,
    props.contentDigest,
    props.revision,
  ],
  () => {
    generation++;
    candidateId.value = "";
    review.value = undefined;
    error.value = "";
    busy.value = false;
  },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
</script>
