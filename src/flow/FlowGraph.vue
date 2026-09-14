<template>
  <div ref="wrapRef" class="flow-graph">
    <svg class="flow-graph__links" aria-hidden="true">
      <g
        v-for="measured in measuredLinks"
        :key="`${measured.link.fromId}>${measured.link.toId}`"
        :opacity="emphasis(measured) === 'faded' ? 0.35 : 1"
      >
        <path
          :d="pathOf(measured)"
          fill="none"
          :stroke="strokeOf(measured)"
          :stroke-width="emphasis(measured) === 'path' ? 3 : 1.25"
          stroke-linecap="round"
          :stroke-dasharray="
            measured.link.muted && emphasis(measured) === 'path' ? '6 6' : ''
          "
        />
        <template v-if="emphasis(measured) === 'path'">
          <circle
            :cx="measured.x1"
            :cy="measured.y1"
            r="4"
            :fill="strokeOf(measured)"
          />
          <circle
            :cx="measured.x2"
            :cy="measured.y2"
            r="4"
            :fill="strokeOf(measured)"
          />
        </template>
      </g>
    </svg>
    <div class="flow-graph__grid">
      <div class="flow-graph__col">
        <div class="flow-graph__head">
          <span class="flow-graph__pill">{{ $t("flow.column_inputs") }}</span>
        </div>
        <FlowNode
          :node="model.input"
          :dimmed="dimmed(model.input.id)"
          :selected="selection === model.input.id"
          @tap="emit('tap', $event)"
        />
      </div>
      <div class="flow-graph__col">
        <div class="flow-graph__head">
          <span class="flow-graph__pill">{{ $t("flow.column_channels") }}</span>
        </div>
        <FlowNode
          :node="model.channel"
          :dimmed="dimmed(model.channel.id)"
          :selected="selection === model.channel.id"
          @tap="emit('tap', $event)"
        />
      </div>
      <div class="flow-graph__col">
        <div class="flow-graph__head">
          <span class="flow-graph__pill">{{ $t("flow.column_mixes") }}</span>
        </div>
        <FlowNode
          v-for="node in model.mixes"
          :key="node.id"
          :node="node"
          :dimmed="dimmed(node.id)"
          :selected="selection === node.id"
          @tap="emit('tap', $event)"
        />
      </div>
      <div class="flow-graph__col">
        <div class="flow-graph__head">
          <span class="flow-graph__pill">{{ $t("flow.column_outputs") }}</span>
        </div>
        <div v-if="model.outputs.length === 0" class="flow-graph__empty">
          {{ $t("flow.no_outputs") }}
        </div>
        <FlowOutput
          v-for="row in model.outputs"
          :key="row.id"
          :row="row"
          :dimmed="dimmed(row.id)"
          :selected="selection === row.id"
          @select="emit('select', $event)"
          @volume="(playerId, level) => emit('volume', playerId, level)"
          @mute="(playerId, muted) => emit('mute', playerId, muted)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
  shallowRef,
} from "vue";
import type { GraphLink, GraphModel, GraphNode } from "./derive";
import FlowNode from "./FlowNode.vue";
import FlowOutput from "./FlowOutput.vue";
import { IDLE_LINK_COLOR, LINK_COLORS } from "./linkColors";

const props = defineProps<{
  model: GraphModel;
  // the ids that stay bright while a node is selected; null when none is
  closure: Set<string> | null;
  selection: string | null;
}>();

const emit = defineEmits<{
  tap: [node: GraphNode];
  select: [id: string];
  volume: [playerId: string, level: number];
  mute: [playerId: string, currentlyMuted: boolean];
}>();

interface MeasuredLink {
  link: GraphLink;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type Point = [number, number];

// the link anchors are measured from the rendered tiles (after every
// update, on resize, and once fonts are in), so the curves meet tile edges
const wrapRef = ref<HTMLElement | null>(null);
const anchors = shallowRef<{
  right: Map<string, Point>;
  left: Map<string, Point>;
} | null>(null);
let resizeObserver: ResizeObserver | undefined;
let measureQueued = false;

function measure() {
  const wrap = wrapRef.value;
  if (!wrap) return;
  const base = wrap.getBoundingClientRect();
  const right = new Map<string, Point>();
  const left = new Map<string, Point>();
  for (const el of wrap.querySelectorAll<HTMLElement>("[data-node-id]")) {
    const id = el.dataset.nodeId;
    if (!id) continue;
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2 - base.top;
    right.set(id, [rect.right - base.left, midY]);
    left.set(id, [rect.left - base.left, midY]);
  }
  const previous = anchors.value;
  if (
    previous &&
    sameAnchors(previous.right, right) &&
    sameAnchors(previous.left, left)
  ) {
    return;
  }
  anchors.value = { right, left };
}

function sameAnchors(a: Map<string, Point>, b: Map<string, Point>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, [x, y]] of b) {
    const prev = a.get(id);
    if (!prev || Math.abs(prev[0] - x) > 0.5 || Math.abs(prev[1] - y) > 0.5) {
      return false;
    }
  }
  return true;
}

function queueMeasure() {
  if (measureQueued) return;
  measureQueued = true;
  requestAnimationFrame(() => {
    measureQueued = false;
    measure();
  });
}

onMounted(() => {
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(queueMeasure);
    if (wrapRef.value) resizeObserver.observe(wrapRef.value);
  }
  void document.fonts?.ready?.then(queueMeasure);
  queueMeasure();
});
onUpdated(queueMeasure);
onBeforeUnmount(() => resizeObserver?.disconnect());

const measuredLinks = computed<MeasuredLink[]>(() => {
  const current = anchors.value;
  if (!current) return [];
  const out: MeasuredLink[] = [];
  for (const link of props.model.links) {
    const from = current.right.get(link.fromId);
    const to = current.left.get(link.toId);
    if (from && to) {
      out.push({ link, x1: from[0], y1: from[1], x2: to[0], y2: to[1] });
    }
  }
  return out;
});

type Emphasis = "path" | "idle" | "faded";

function emphasis(measured: MeasuredLink): Emphasis {
  if (props.closure) {
    return props.closure.has(measured.link.fromId) &&
      props.closure.has(measured.link.toId)
      ? "path"
      : "faded";
  }
  return measured.link.active ? "path" : "idle";
}

const strokeOf = (measured: MeasuredLink) =>
  emphasis(measured) === "path"
    ? LINK_COLORS[measured.link.kind]
    : IDLE_LINK_COLOR;

function pathOf(measured: MeasuredLink): string {
  const { x1, y1, x2, y2 } = measured;
  const dx = Math.max(24, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

const dimmed = (id: string) => props.closure !== null && !props.closure.has(id);
</script>

<style scoped>
.flow-graph {
  position: relative;
}

.flow-graph__links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.flow-graph__grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 56px;
  z-index: 1;
}

.flow-graph__col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.flow-graph__head {
  display: flex;
  justify-content: center;
  margin-bottom: 2px;
}

.flow-graph__pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-fg), 0.07);
  color: rgba(var(--v-theme-fg), 0.6);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  user-select: none;
}

.flow-graph__empty {
  padding: 10px 4px;
  font-size: 11.5px;
  color: rgba(var(--v-theme-fg), 0.6);
  text-align: center;
}

@media (max-width: 760px) {
  .flow-graph__grid {
    gap: 12px 20px;
  }
}

/* a phone stacks the stages; the curves have no room to say anything */
@media (max-width: 520px) {
  .flow-graph__links {
    display: none;
  }

  .flow-graph__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
