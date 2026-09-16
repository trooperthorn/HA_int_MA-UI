<template>
  <v-app>
    <!-- a single view across both modes, so toggling fullscreen swaps the
         chrome without tearing down the view behind it -->
    <MainView />
    <Footer v-if="!store.frameless" />
  </v-app>
  <reload-prompt />
</template>

<script lang="ts" setup>
import MainView from "./View.vue";
import Footer from "./Footer.vue";
import ReloadPrompt from "./ReloadPrompt.vue";
import { store } from "@/plugins/store";
import { watch } from "vue";
import api from "@/plugins/api";
import { isSelectablePlayer } from "@/helpers/players";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();
watch(
  // make sure it's retriggered when players array is populated
  [() => route.query.player, () => Object.keys(api.players).length],
  ([newActivePlayer]) => {
    if (!newActivePlayer) return;
    const newPlayerString = newActivePlayer.toString().toLowerCase();
    // newActivePlayer can be either player id or player name
    const newPlayerId = Object.values(api.players).find((p) => {
      return (
        (p.player_id.toLowerCase() === newPlayerString ||
          p.name.toLowerCase() === newPlayerString) &&
        isSelectablePlayer(p)
      );
    })?.player_id;

    if (newPlayerId) {
      store.activePlayerId = newPlayerId;
    }
  },
  { immediate: true },
);
watch(
  () => route.query.showFullscreenPlayer,
  (showFullscreenPlayer) => {
    store.showFullscreenPlayer = !!showFullscreenPlayer;
  },
  { immediate: true },
);
// Mobile only: the fullscreen player is a Vuetify dialog, not a routed page,
// so opening it left no history entry - the OS back button fell straight
// through to whatever's behind the app (exiting the panel) instead of just
// closing the dialog. Push a history entry while it's open so back closes it
// first; `guarding` breaks the loop with the read-side watcher above, since
// that one reacts to the same query param this one writes.
let guardingFullscreenPlayerNav = false;
watch(
  () => store.showFullscreenPlayer,
  (open) => {
    if (!store.mobileLayout || guardingFullscreenPlayerNav) return;
    const hasQueryFlag = !!route.query.showFullscreenPlayer;
    if (open === hasQueryFlag) return;
    guardingFullscreenPlayerNav = true;
    const done = () => {
      guardingFullscreenPlayerNav = false;
    };
    if (open) {
      router
        .push({ query: { ...route.query, showFullscreenPlayer: "1" } })
        .then(done, done);
    } else if (hasQueryFlag) {
      router.back();
      done();
    } else {
      done();
    }
  },
);
watch(
  () => route.query.frameless,
  (frameless) => {
    if (frameless !== undefined) {
      store.frameless = true;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.centeredoverlay :deep(.v-overlay__content) {
  left: 50%;
  right: 50%;
  top: 50%;
  bottom: 50%;
}
</style>
