<template>
  <div class="map-view">
    <div class="map-view__header">
      <h1 class="map-view__title">{{ $t("map.title") }}</h1>
      <div class="map-view__controls">
        <label class="map-view__control">
          {{ $t("map.limit") }}
          <select
            v-model.number="limit"
            data-testid="map-limit"
            @change="reload"
          >
            <option v-for="value in LIMITS" :key="value" :value="value">
              {{ value }}
            </option>
          </select>
        </label>
        <label class="map-view__control">
          <input v-model="includeTracks" type="checkbox" @change="reload" />
          {{ $t("map.include_tracks") }}
        </label>
        <label class="map-view__control">
          {{ $t("map.size") }}
          <input
            v-model.number="sizeScale"
            type="range"
            min="0.4"
            max="2.2"
            step="0.05"
            @input="rebuild(false)"
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          class="h-8"
          @click="showLabels = !showLabels"
        >
          {{ showLabels ? $t("map.hide_labels") : $t("map.show_labels") }}
        </Button>
        <Button variant="outline" size="sm" class="h-8" @click="fit">{{
          $t("map.fit")
        }}</Button>
        <Button variant="outline" size="sm" class="h-8" @click="exportPng">
          {{ $t("map.export") }}
        </Button>
        <Button
          size="sm"
          class="h-8"
          data-testid="map-toggle-view"
          @click="toggleView"
        >
          {{ view === "arc" ? $t("map.view_arc") : $t("map.view_web") }}
        </Button>
      </div>
    </div>

    <p v-if="error" class="map-view__empty">
      {{ error }}
      <Button variant="outline" size="sm" class="ml-2 h-8" @click="reload">
        {{ $t("map.retry") }}
      </Button>
    </p>
    <p v-else-if="loading" class="map-view__empty">{{ $t("map.loading") }}</p>

    <div v-show="!loading && !error" class="map-view__stage">
      <canvas
        ref="canvasEl"
        data-testid="map-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerLeave"
      ></canvas>

      <div v-if="dataset" class="map-view__panel map-view__legend">
        <h4>{{ $t("map.shown") }}</h4>
        <div
          v-for="group in dataset.groups"
          :key="group.id"
          class="map-view__row"
          :class="{ 'map-view__row--off': !activeGroups.has(group.id) }"
          @click="toggleGroup(group.id)"
        >
          <span
            class="map-view__swatch"
            :style="{ background: group.color }"
          ></span>
          <span>{{ group.label }}</span>
          <span class="map-view__count">{{ groupCounts[group.id] || 0 }}</span>
        </div>
        <template v-if="view === 'web'">
          <h4>{{ $t("map.links") }}</h4>
          <div
            v-for="kind in dataset.relationKinds"
            :key="kind.id"
            class="map-view__row"
            :class="{ 'map-view__row--off': !activeKinds.has(kind.id) }"
            @click="toggleKind(kind.id)"
          >
            <span
              class="map-view__line"
              :style="{ background: kind.color }"
            ></span>
            <span>{{ kind.label }}</span>
            <span class="map-view__count">{{ kindCounts[kind.id] || 0 }}</span>
          </div>
        </template>
      </div>

      <div v-if="selectedEntity" class="map-view__panel map-view__details">
        <h3>{{ selectedEntity.name }}</h3>
        <div class="map-view__muted">{{ selectedEntity.kind }}</div>
        <dl>
          <template
            v-for="(value, key) in selectedEntity.meta || {}"
            :key="key"
          >
            <dt>{{ key }}</dt>
            <dd>{{ value }}</dd>
          </template>
          <dt>{{ $t("map.links") }}</dt>
          <dd>{{ selectedLinks.length }}</dd>
        </dl>
        <div
          v-for="entry in selectedLinks.slice(0, 40)"
          :key="entry.relation.id"
          class="map-view__link"
        >
          <span class="map-view__muted">{{ entry.relation.label }}</span>
          <Button
            variant="ghost"
            size="sm"
            class="h-6"
            @click="select(entry.other.id)"
          >
            {{ entry.other.name }}
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="mt-2 h-7"
          @click="select(null)"
        >
          {{ $t("map.clear_selection") }}
        </Button>
      </div>

      <div v-if="dataset" class="map-view__panel map-view__hint">
        {{ view === "arc" ? dataset.arcHint : dataset.webHint }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { Button } from "@/components/ui/button";
import { api } from "@/plugins/api";
import { layoutArc } from "@/vendor/graph-core/arc";
import { layoutForce } from "@/vendor/graph-core/force";
import {
  fitCamera,
  pickNode,
  render,
  screenToWorld,
  type Camera,
} from "@/vendor/graph-core/renderer";
import type {
  Dataset,
  GraphEntity,
  Layout,
  ViewId,
} from "@/vendor/graph-core/types";
import {
  DEFAULT_BUILD_OPTIONS,
  loadLibrary,
  type LibrarySource,
} from "./buildDataset";

const LIMITS = [100, 250, 500, 1000];

const canvasEl = ref<HTMLCanvasElement | null>(null);
const dataset = shallowRef<Dataset | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const view = ref<ViewId>("web");
const limit = ref(DEFAULT_BUILD_OPTIONS.limit);
const includeTracks = ref(DEFAULT_BUILD_OPTIONS.includeTracks);
const sizeScale = ref(1);
const showLabels = ref(true);
const selected = ref<string | null>(null);
const hovered = ref<string | null>(null);
const activeGroups = ref(new Set<string>());
const activeKinds = ref(new Set<string>());

// Layout and camera are plain refs, not reactive state: they change on every frame of a
// drag and Vue does not need to track them.
let layout: Layout = { nodes: [], dots: [], links: [], axis: [] };
let camera: Camera = { x: 0, y: 0, k: 1 };
let size = { w: 800, h: 600 };
let drag: { x: number; y: number; cam: Camera; moved: number } | null = null;
let observer: ResizeObserver | null = null;

const groupCounts = computed(() => {
  const out: Record<string, number> = {};
  for (const entity of dataset.value?.entities ?? []) {
    out[entity.group] = (out[entity.group] ?? 0) + 1;
  }
  return out;
});

const kindCounts = computed(() => {
  const out: Record<string, number> = {};
  for (const relation of dataset.value?.relations ?? []) {
    out[relation.kind] = (out[relation.kind] ?? 0) + 1;
  }
  return out;
});

const selectedEntity = computed<GraphEntity | null>(() => {
  if (!selected.value || !dataset.value) return null;
  return (
    dataset.value.entities.find((entity) => entity.id === selected.value) ??
    null
  );
});

const selectedLinks = computed(() => {
  const entity = selectedEntity.value;
  const data = dataset.value;
  if (!entity || !data) return [];
  const byId = new Map(data.entities.map((e) => [e.id, e]));
  return data.relations
    .filter((r) => r.source === entity.id || r.target === entity.id)
    .flatMap((relation) => {
      const other = byId.get(
        relation.source === entity.id ? relation.target : relation.source,
      );
      return other ? [{ relation, other }] : [];
    });
});

async function reload() {
  loading.value = true;
  error.value = null;
  try {
    const data = await loadLibrary(api as unknown as LibrarySource, {
      ...DEFAULT_BUILD_OPTIONS,
      limit: limit.value,
      includeTracks: includeTracks.value,
    });
    dataset.value = data;
    activeGroups.value = new Set(data.groups.map((g) => g.id));
    activeKinds.value = new Set(data.relationKinds.map((k) => k.id));
    selected.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    measure();
    rebuild(true);
  }
}

function measure() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  size = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
}

function rebuild(refit: boolean) {
  const data = dataset.value;
  if (!data) return;
  const entities = data.entities.filter((entity) =>
    activeGroups.value.has(entity.group),
  );
  const ids = new Set(entities.map((entity) => entity.id));
  const relations = data.relations.filter(
    (relation) =>
      activeKinds.value.has(relation.kind) &&
      ids.has(relation.source) &&
      ids.has(relation.target),
  );

  if (view.value === "arc") {
    layout = layoutArc({
      entities,
      events: data.events,
      scopes: [...data.scopes].sort((a, b) => a.ordinal - b.ordinal),
      groups: data.groups,
      width: size.w,
      height: size.h,
      sizeScale: sizeScale.value,
      axis: data.axis,
    });
  } else {
    layout = layoutForce({
      entities,
      relations,
      groups: data.groups,
      relationKinds: data.relationKinds,
      width: size.w,
      height: size.h,
      sizeScale: sizeScale.value,
      anchors: entities
        .filter((entity) => entity.emphasis)
        .map((entity) => entity.id),
    });
  }
  if (refit) camera = fitCamera(layout, size.w, size.h);
  paint();
}

function paint() {
  const canvas = canvasEl.value;
  const data = dataset.value;
  if (!canvas || !data) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size.w * dpr);
  canvas.height = Math.round(size.h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let focus: Set<string> | null = null;
  if (selected.value) {
    focus = new Set([selected.value]);
    if (view.value === "web") {
      for (const relation of data.relations) {
        if (!activeKinds.value.has(relation.kind)) continue;
        if (relation.source === selected.value) focus.add(relation.target);
        if (relation.target === selected.value) focus.add(relation.source);
      }
    }
  }

  render(ctx, size.w, size.h, {
    layout,
    entities: new Map(data.entities.map((entity) => [entity.id, entity])),
    camera,
    showLabels: showLabels.value,
    hovered: hovered.value,
    selected: selected.value,
    focus,
    dpr,
  });
}

function toggleView() {
  view.value = view.value === "arc" ? "web" : "arc";
  rebuild(true);
}

function toggled(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function toggleGroup(id: string) {
  activeGroups.value = toggled(activeGroups.value, id);
  rebuild(true);
}

function toggleKind(id: string) {
  activeKinds.value = toggled(activeKinds.value, id);
  rebuild(true);
}

function select(id: string | null) {
  selected.value = id;
  paint();
}

function fit() {
  camera = fitCamera(layout, size.w, size.h);
  paint();
}

function exportPng() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = `library-map-${view.value}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const canvas = canvasEl.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const k = Math.min(
    12,
    Math.max(0.05, camera.k * Math.pow(0.999, event.deltaY)),
  );
  camera = {
    k,
    x: px - ((px - camera.x) / camera.k) * k,
    y: py - ((py - camera.y) / camera.k) * k,
  };
  paint();
}

function onPointerDown(event: PointerEvent) {
  (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  drag = { x: event.clientX, y: event.clientY, cam: camera, moved: 0 };
}

function onPointerMove(event: PointerEvent) {
  const canvas = event.currentTarget as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  if (drag) {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    camera = { k: drag.cam.k, x: drag.cam.x + dx, y: drag.cam.y + dy };
    paint();
    return;
  }
  const [wx, wy] = screenToWorld(
    camera,
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
  const hit = pickNode(layout, wx, wy);
  if (hit !== hovered.value) {
    hovered.value = hit;
    paint();
  }
}

function onPointerUp(event: PointerEvent) {
  const current = drag;
  drag = null;
  if (!current || current.moved > 4) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const rect = canvas.getBoundingClientRect();
  const [wx, wy] = screenToWorld(
    camera,
    event.clientX - rect.left,
    event.clientY - rect.top,
  );
  const hit = pickNode(layout, wx, wy);
  select(hit && hit !== selected.value ? hit : null);
}

function onPointerLeave() {
  hovered.value = null;
  paint();
}

onMounted(async () => {
  await reload();
  const canvas = canvasEl.value;
  if (!canvas) return;
  canvas.addEventListener("wheel", onWheel, { passive: false });
  observer = new ResizeObserver(() => {
    measure();
    rebuild(true);
  });
  observer.observe(canvas);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  canvasEl.value?.removeEventListener("wheel", onWheel);
});
</script>

<style scoped>
.map-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 10px;
}

.map-view__header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.map-view__title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
}

.map-view__controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.map-view__control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  opacity: 0.85;
}

.map-view__empty {
  opacity: 0.75;
  padding: 24px 0;
}

.map-view__stage {
  position: relative;
  flex: 1;
  min-height: 420px;
  border-radius: 8px;
  overflow: hidden;
  background: #05070a;
}

.map-view__stage canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.map-view__panel {
  position: absolute;
  background: rgba(19, 26, 36, 0.94);
  border: 1px solid #2a3442;
  border-radius: 8px;
  padding: 10px 12px;
  color: #e8eef6;
  font-size: 12px;
  max-height: calc(100% - 24px);
  overflow: auto;
}

.map-view__legend {
  top: 12px;
  left: 12px;
  min-width: 190px;
}

.map-view__details {
  top: 12px;
  right: 12px;
  width: 270px;
}

.map-view__hint {
  bottom: 12px;
  left: 12px;
  right: 12px;
  opacity: 0.8;
}

.map-view__panel h4 {
  margin: 0 0 6px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.65;
}

.map-view__panel h4 + h4 {
  margin-top: 12px;
}

.map-view__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-radius: 4px;
  cursor: pointer;
}

.map-view__row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.map-view__row--off {
  opacity: 0.38;
}

.map-view__swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: none;
}

.map-view__line {
  width: 16px;
  height: 3px;
  border-radius: 2px;
  flex: none;
}

.map-view__count {
  margin-left: auto;
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
}

.map-view__details dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  margin: 8px 0 0;
}

.map-view__details dt {
  opacity: 0.65;
}

.map-view__details dd {
  margin: 0;
  text-align: right;
  word-break: break-word;
}

.map-view__link {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 0;
}

.map-view__muted {
  opacity: 0.65;
}
</style>
