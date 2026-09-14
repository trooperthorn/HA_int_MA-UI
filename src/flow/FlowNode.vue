<template>
  <div
    class="flow-node"
    :class="{
      'flow-node--in-path': node.inPath,
      'flow-node--off-path': node.offPath,
      'flow-node--unavailable': !node.available,
      'flow-node--takeover': node.kind === 'master',
      'flow-node--dimmed': dimmed,
      'flow-node--selected': selected,
    }"
    role="button"
    tabindex="0"
    :data-node-id="node.id"
    :data-kind="node.kind"
    :aria-pressed="selected"
    @click="emit('tap', node)"
    @keydown.enter.prevent="emit('tap', node)"
    @keydown.space.prevent="emit('tap', node)"
  >
    <div class="flow-node__icon">
      <img v-if="node.artwork" :src="node.artwork" alt="" />
      <component :is="icon" v-else :size="18" />
    </div>
    <div class="flow-node__text">
      <div class="flow-node__title">{{ node.name }}</div>
      <div class="flow-node__subtitle">
        {{ $t(node.subtitle.key, node.subtitle.args ?? {}) }}
      </div>
    </div>
    <span
      v-if="!node.found"
      class="flow-node__badge flow-node__badge--warn"
      :title="$t('flow.player_not_found')"
    >
      !
    </span>
    <span
      v-if="node.kind === 'group' && node.memberTotal"
      class="flow-node__badge"
    >
      {{ node.memberActive }}/{{ node.memberTotal }}
    </span>
    <span
      v-if="node.pending"
      class="flow-node__pending"
      :title="$t('flow.pending')"
    ></span>
  </div>
</template>

<script setup lang="ts">
import { Cast, Layers, Music, Speaker, Volume2 } from "@lucide/vue";
import { computed, type Component } from "vue";
import type { GraphNode } from "./derive";

const props = defineProps<{
  node: GraphNode;
  dimmed?: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{ tap: [node: GraphNode] }>();

const ICONS: Record<GraphNode["kind"], Component> = {
  input: Music,
  channel: Cast,
  zone: Speaker,
  group: Volume2,
  master: Layers,
};

const icon = computed(() => ICONS[props.node.kind]);
</script>

<style scoped>
.flow-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(var(--v-theme-fg), 0.07);
  color: rgb(var(--v-theme-fg));
  cursor: pointer;
  user-select: none;
  outline: none;
  transition:
    opacity 0.2s ease,
    background 0.2s ease;
}

.flow-node:hover,
.flow-node--in-path {
  background: rgba(var(--v-theme-fg), 0.13);
}

.flow-node:focus-visible {
  border-color: rgb(var(--v-theme-primary));
}

.flow-node--selected {
  border-color: rgba(var(--v-theme-fg), 0.45);
}

.flow-node--dimmed {
  opacity: 0.32;
}

.flow-node--off-path {
  opacity: 0.65;
}

.flow-node--unavailable {
  cursor: default;
  opacity: 0.45;
}

.flow-node--takeover {
  border-style: dashed;
  border-color: rgba(var(--v-theme-fg), 0.35);
}

.flow-node__icon {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  overflow: hidden;
  background: rgba(var(--v-theme-fg), 0.1);
  color: rgba(var(--v-theme-fg), 0.6);
}

.flow-node--in-path .flow-node__icon {
  color: rgb(var(--v-theme-primary));
}

.flow-node__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.flow-node__text {
  flex: 1;
  min-width: 0;
}

.flow-node__title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-node__subtitle {
  font-size: 11.5px;
  color: rgba(var(--v-theme-fg), 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-node__badge {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-fg), 0.14);
  color: rgba(var(--v-theme-fg), 0.6);
  font-size: 10px;
  font-weight: 700;
}

.flow-node__badge--warn {
  color: rgb(var(--v-theme-warning, 245, 158, 11));
}

.flow-node__pending {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(var(--v-theme-fg), 0.6);
  border-top-color: transparent;
  animation: flow-spin 0.9s linear infinite;
}

@keyframes flow-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-node__pending {
    animation: none;
  }
}
</style>
