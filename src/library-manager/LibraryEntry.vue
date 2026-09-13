<template>
  <!-- the desktop manager needs the screen; a phone gets the library as
       one list, chips over it (see mobile/MobileLibraryView.vue) -->
  <MobileLibraryView v-if="store.mobileLayout" />
  <LibraryManagerView v-else />
</template>

<script setup lang="ts">
import { store } from "@/plugins/store";
import LibraryManagerView from "./LibraryManagerView.vue";
import MobileLibraryView from "./mobile/MobileLibraryView.vue";

defineOptions({ name: "LibraryEntry" });
</script>
