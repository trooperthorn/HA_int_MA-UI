<template>
  <main class="display-page">
    <header class="display-page__header">
      <h1>{{ $t("sendspin_display.title") }}</h1>
      <p>{{ $t("sendspin_display.description") }}</p>
    </header>

    <div class="display-page__controls">
      <span role="status">{{
        $t(`sendspin_display.status_${snapshot.status}`)
      }}</span>
      <button
        v-if="snapshot.status === 'failed'"
        type="button"
        @click="retryPairing"
      >
        {{ $t("sendspin_display.retry_pairing") }}
      </button>
      <p v-if="snapshot.error" class="display-page__error">
        {{ snapshot.error }}
      </p>
      <template v-if="displayPlayer">
        <label for="display-source">{{
          $t("sendspin_display.follow_player")
        }}</label>
        <select id="display-source" v-model="targetPlayerId">
          <option value="">{{ $t("sendspin_display.choose_player") }}</option>
          <option
            v-for="player in groupTargets"
            :key="player.player_id"
            :value="player.player_id"
          >
            {{ player.name }}
          </option>
        </select>
        <button
          type="button"
          :disabled="!targetPlayerId || grouping"
          @click="joinPlayer"
        >
          {{ $t("sendspin_display.follow") }}
        </button>
        <button
          type="button"
          :disabled="!displayPlayer.active_group || grouping"
          @click="leavePlayer"
        >
          {{ $t("sendspin_display.leave") }}
        </button>
      </template>
    </div>

    <section class="display-page__now-playing" aria-live="polite">
      <img
        v-if="snapshot.metadata?.artwork_url"
        class="display-page__artwork"
        :src="snapshot.metadata.artwork_url"
        :alt="$t('sendspin_display.artwork_alt')"
      />
      <div class="display-page__track">
        <h2>
          {{ snapshot.metadata?.title || $t("sendspin_display.waiting") }}
        </h2>
        <p>{{ snapshot.metadata?.artist || "" }}</p>
        <p v-if="snapshot.metadata?.album">{{ snapshot.metadata.album }}</p>
        <progress
          v-if="progress && progress.durationMs > 0"
          :value="progress.positionMs"
          :max="progress.durationMs"
          :aria-label="$t('sendspin_display.progress')"
        ></progress>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import {
  SendspinDisplaySession,
  type DisplaySnapshot,
} from "@/plugins/sendspin-display";
import { api } from "@/plugins/api";
import { PlayerFeature, PlayerType } from "@/plugins/api/interfaces";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const snapshot = ref<DisplaySnapshot>({
  status: "disconnected",
  clientId: null,
  metadata: null,
  error: null,
});
const session = new SendspinDisplaySession((next) => (snapshot.value = next));
const targetPlayerId = ref("");
const grouping = ref(false);
const serverNowUs = ref<number | null>(null);
let clockTimer: ReturnType<typeof setInterval> | null = null;

const displayPlayer = computed(() =>
  snapshot.value.clientId ? api.players[snapshot.value.clientId] : undefined,
);
const groupTargets = computed(() => {
  const display = displayPlayer.value;
  if (!display) return [];
  return Object.values(api.players)
    .filter(
      (player) =>
        player.player_id !== display.player_id &&
        player.enabled &&
        player.available &&
        player.type !== PlayerType.DISPLAY &&
        player.type !== PlayerType.VISUALIZER &&
        player.supported_features.includes(PlayerFeature.SET_MEMBERS) &&
        (display.can_group_with.includes(player.player_id) ||
          display.can_group_with.includes(player.provider)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
});
const progress = computed(() => {
  const metadata = snapshot.value.metadata;
  if (
    !metadata?.progress ||
    metadata.timestamp === undefined ||
    serverNowUs.value === null
  )
    return null;
  const elapsedMs = (serverNowUs.value - metadata.timestamp) / 1000;
  const positionMs = Math.max(
    0,
    metadata.progress.track_progress +
      (elapsedMs * metadata.progress.playback_speed) / 1000,
  );
  return {
    positionMs: metadata.progress.track_duration
      ? Math.min(positionMs, metadata.progress.track_duration)
      : positionMs,
    durationMs: metadata.progress.track_duration,
  };
});

async function joinPlayer() {
  if (!snapshot.value.clientId || !targetPlayerId.value) return;
  grouping.value = true;
  try {
    await api.playerCommandGroup(snapshot.value.clientId, targetPlayerId.value);
  } catch (error) {
    snapshot.value = { ...snapshot.value, error: String(error) };
  } finally {
    grouping.value = false;
  }
}

async function leavePlayer() {
  if (!snapshot.value.clientId) return;
  grouping.value = true;
  try {
    await api.playerCommandUnGroup(snapshot.value.clientId);
  } catch (error) {
    snapshot.value = { ...snapshot.value, error: String(error) };
  } finally {
    grouping.value = false;
  }
}

function retryPairing() {
  void session.retryPairing();
}

onMounted(() => {
  serverNowUs.value = session.getCurrentServerTimeUs();
  clockTimer = setInterval(
    () => (serverNowUs.value = session.getCurrentServerTimeUs()),
    1000,
  );
  void session.start();
});
onBeforeUnmount(() => {
  if (clockTimer !== null) clearInterval(clockTimer);
  session.stop();
});
</script>

<style scoped>
.display-page {
  display: grid;
  gap: 2rem;
  max-width: 980px;
  margin: 0 auto;
  padding: 2rem;
}
.display-page__header h1 {
  font-size: 2rem;
  font-weight: 700;
}
.display-page__header p {
  color: rgb(var(--v-theme-on-surface-variant));
}
.display-page__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.display-page__controls select,
.display-page__controls button {
  border: 1px solid currentColor;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
}
.display-page__controls button:disabled {
  opacity: 0.45;
}
.display-page__error {
  width: 100%;
  color: rgb(var(--v-theme-error));
}
.display-page__now-playing {
  display: grid;
  grid-template-columns: minmax(160px, 40%) 1fr;
  gap: 2rem;
  align-items: center;
}
.display-page__artwork {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 1rem;
}
.display-page__track h2 {
  font-size: clamp(1.75rem, 4vw, 3rem);
  font-weight: 700;
}
.display-page__track p {
  font-size: 1.25rem;
}
.display-page__track progress {
  width: 100%;
  margin-top: 1rem;
}
@media (max-width: 600px) {
  .display-page {
    padding: 1rem;
  }
  .display-page__now-playing {
    grid-template-columns: 1fr;
  }
}
</style>
