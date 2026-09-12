<template>
  <div
    ref="treeRef"
    class="source-tree"
    role="tree"
    tabindex="0"
    :aria-activedescendant="focusedId ? `tree-${focusedId}` : undefined"
    @keydown="onKeydown"
  >
    <div
      v-for="row in visibleRows"
      :id="`tree-${row.node.id}`"
      :key="row.node.id"
      role="treeitem"
      class="source-tree__row"
      :class="{
        'source-tree__row--active': row.node.id === activeNode,
        'source-tree__row--focused': row.node.id === focusedId,
        'source-tree__row--section': row.depth === 0,
      }"
      :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
      :aria-expanded="row.node.expandable ? row.expanded : undefined"
      :aria-selected="row.node.id === activeNode"
      :aria-level="row.depth + 1"
      @click="onRowClick(row.node)"
      @dblclick="row.node.expandable && toggle(row.node)"
    >
      <button
        v-if="row.node.expandable"
        type="button"
        class="source-tree__chevron"
        tabindex="-1"
        :aria-label="row.expanded ? $t('collapse') : $t('expand')"
        @click.stop="toggle(row.node)"
      >
        <Spinner v-if="row.loading" class="size-3" />
        <ChevronDown v-else-if="row.expanded" :size="12" />
        <ChevronRight v-else :size="12" />
      </button>
      <span
        v-else
        class="source-tree__chevron source-tree__chevron--empty"
      ></span>
      <ProviderIcon
        v-if="row.node.providerDomain"
        :domain="row.node.providerDomain"
        :size="14"
        class="source-tree__icon"
      />
      <component
        :is="row.node.icon"
        v-else-if="row.node.icon"
        :size="14"
        class="source-tree__icon"
      />
      <span class="source-tree__label">{{ row.node.label }}</span>
      <span v-if="row.node.count !== undefined" class="source-tree__count">
        {{ row.node.count.toLocaleString() }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Disc3,
  FileWarning,
  Folder,
  LibraryBig,
  ListMusic,
  Music2,
  Play,
  Speaker,
  Tag,
  Users,
} from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import { useI18n } from "vue-i18n";
import ProviderIcon from "@/components/ProviderIcon.vue";
import { Spinner } from "@/components/ui/spinner";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import { onLibrarySyncCompleted } from "@/composables/useLibrarySync";
import { isSelectablePlayer } from "@/helpers/players";
import { togglePlayerQueue } from "@/helpers/player_queue";
import { api } from "@/plugins/api";
import {
  MediaType,
  ProviderType,
  type BrowseFolder,
} from "@/plugins/api/interfaces";
import { store } from "@/plugins/store";
import type { NodeFilter } from "../composables/useLibraryFilter";

export interface TreeNode {
  id: string;
  label: string;
  icon?: Component;
  providerDomain?: string;
  count?: number;
  expandable: boolean;
  // what selecting the node lists; nodes without a filter run an action
  filter?: NodeFilter;
  action?: () => void;
  children?: TreeNode[];
  loadChildren?: () => Promise<TreeNode[]>;
}

const props = defineProps<{ activeNode: string }>();
const emit = defineEmits<{ select: [filter: NodeFilter] }>();

const { t } = useI18n();
const { getPreference } = useUserPreferences();

const EXPANDED_PREFERENCE_KEY = "libraryManager.tree";
const storedExpanded = getPreference<string[]>(EXPANDED_PREFERENCE_KEY, [
  "library",
  "sources",
]);
const expanded = ref(new Set(storedExpanded.value));
const loadingIds = ref(new Set<string>());
const focusedId = ref<string | null>(null);
const treeRef = ref<HTMLElement | null>(null);

// ---- library counts --------------------------------------------------------

const counts = ref<Partial<Record<string, number>>>({});

const COUNT_LOADERS: Array<[string, MediaType, () => Promise<number>]> = [
  ["artists", MediaType.ARTIST, () => api.getLibraryArtistsCount()],
  [
    "album_artists",
    MediaType.ARTIST,
    () => api.getLibraryArtistsCount(false, true),
  ],
  ["albums", MediaType.ALBUM, () => api.getLibraryAlbumsCount()],
  ["tracks", MediaType.TRACK, () => api.getLibraryTracksCount()],
  ["genres", MediaType.GENRE, () => api.getLibraryGenresCount()],
  ["playlists", MediaType.PLAYLIST, () => api.getLibraryPlaylistsCount()],
];

async function refreshCount(key: string, load: () => Promise<number>) {
  try {
    const value = await load();
    counts.value = { ...counts.value, [key]: value };
  } catch (err) {
    console.error("[SourceTree] count failed for %s", key, err);
  }
}

const unsubscribers: Array<() => void> = [];
onMounted(() => {
  for (const [key, mediaType, load] of COUNT_LOADERS) {
    void refreshCount(key, load);
    unsubscribers.push(
      onLibrarySyncCompleted(mediaType, () => void refreshCount(key, load)),
    );
  }
});
onBeforeUnmount(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));

// ---- nodes -----------------------------------------------------------------

const libraryNode = (
  id: string,
  label: string,
  icon: Component,
  countKey: string | undefined,
  filter: Partial<NodeFilter> & { mediaType: MediaType },
): TreeNode => ({
  id: `library.${id}`,
  label,
  icon,
  count: countKey ? counts.value[countKey] : undefined,
  expandable: false,
  filter: { scope: "library", node: `library.${id}`, ...filter },
});

const libraryChildren = computed<TreeNode[]>(() => [
  libraryNode("artists", t("artists"), Users, "artists", {
    mediaType: MediaType.ARTIST,
  }),
  libraryNode(
    "album_artists",
    t("library_manager.tree.album_artists"),
    Users,
    "album_artists",
    { mediaType: MediaType.ARTIST, albumArtistsOnly: true },
  ),
  libraryNode("albums", t("albums"), Disc3, "albums", {
    mediaType: MediaType.ALBUM,
  }),
  libraryNode("tracks", t("tracks"), Music2, "tracks", {
    mediaType: MediaType.TRACK,
  }),
  libraryNode("genres", t("genres"), Tag, "genres", {
    mediaType: MediaType.GENRE,
  }),
  libraryNode("playlists", t("playlists"), ListMusic, "playlists", {
    mediaType: MediaType.PLAYLIST,
  }),
  libraryNode(
    "recently_added",
    t("library_manager.tree.recently_added"),
    Clock,
    undefined,
    { mediaType: MediaType.TRACK, sortOverride: "timestamp_added_desc" },
  ),
  libraryNode(
    "files_to_edit",
    t("library_manager.tree.files_to_edit"),
    FileWarning,
    undefined,
    { mediaType: MediaType.TRACK, filesToEdit: true },
  ),
]);

// the provider root listing is the same one the Browse page shows; each
// folder there stands for a provider and carries the path to browse it
const providerRoots = ref<BrowseFolder[]>([]);
const providerRootsLoaded = ref(false);

async function loadProviderRoots(): Promise<TreeNode[]> {
  if (!providerRootsLoaded.value) {
    const items = await api.browse(undefined, store.activePlayerId);
    providerRoots.value = items.filter(isChildFolder);
    providerRootsLoaded.value = true;
  }
  return providerRoots.value.map(folderNode);
}

// providers list a ".." entry that browses back up; the tree already has a parent
const isChildFolder = (item: {
  media_type: MediaType;
  name: string;
}): item is BrowseFolder =>
  item.media_type === MediaType.FOLDER && item.name !== "..";

function providerDomainFor(folder: BrowseFolder): string {
  const provider = api.getProvider(folder.provider);
  return provider?.domain ?? folder.provider;
}

function folderNode(folder: BrowseFolder): TreeNode {
  const id = `browse:${folder.path}`;
  const provider = api.getProvider(folder.provider);
  const isMusicProvider = provider?.type === ProviderType.MUSIC;
  return {
    id,
    label: folder.name,
    icon: Folder,
    providerDomain:
      folder.path.endsWith("://") && isMusicProvider
        ? providerDomainFor(folder)
        : undefined,
    expandable: true,
    filter: {
      scope: "browse",
      node: id,
      mediaType: MediaType.FOLDER,
      browsePath: folder.path,
      provider: [folder.provider],
    },
    loadChildren: async () => {
      const items = await api.browse(folder.path, store.activePlayerId);
      return items.filter(isChildFolder).map(folderNode);
    },
  };
}

const loadedChildren = ref(new Map<string, TreeNode[]>());

const selectablePlayerCount = computed(
  () => Object.values(api.players).filter(isSelectablePlayer).length,
);

const roots = computed<TreeNode[]>(() => [
  {
    id: "now_playing",
    label: t("now_playing"),
    icon: Play,
    expandable: false,
    action: togglePlayerQueue,
  },
  {
    id: "library",
    label: t("library_manager.tree.library"),
    icon: LibraryBig,
    count: counts.value.tracks,
    expandable: true,
    children: libraryChildren.value,
    filter: {
      scope: "library",
      node: "library",
      mediaType: MediaType.TRACK,
    },
  },
  {
    id: "sources",
    label: t("library_manager.tree.sources"),
    icon: Folder,
    expandable: true,
    loadChildren: loadProviderRoots,
  },
  {
    id: "players",
    label: t("players"),
    icon: Speaker,
    count: selectablePlayerCount.value,
    expandable: false,
    action: () => {
      store.showPlayersMenu = true;
    },
  },
]);

interface VisibleRow {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  loading: boolean;
}

function childrenOf(node: TreeNode): TreeNode[] {
  return node.children ?? loadedChildren.value.get(node.id) ?? [];
}

const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      const isExpanded = expanded.value.has(node.id);
      rows.push({
        node,
        depth,
        expanded: isExpanded,
        loading: loadingIds.value.has(node.id),
      });
      if (node.expandable && isExpanded) walk(childrenOf(node), depth + 1);
    }
  };
  walk(roots.value, 0);
  return rows;
});

// ---- expand / select --------------------------------------------------------

async function ensureChildren(node: TreeNode) {
  if (node.children || loadedChildren.value.has(node.id) || !node.loadChildren)
    return;
  if (loadingIds.value.has(node.id)) return;
  loadingIds.value = new Set(loadingIds.value).add(node.id);
  try {
    const children = await node.loadChildren();
    loadedChildren.value = new Map(loadedChildren.value).set(node.id, children);
    // branches the user left open below this one come back with it
    for (const child of children) {
      if (expanded.value.has(child.id)) void ensureChildren(child);
    }
  } catch (err) {
    console.error("[SourceTree] failed to load %s", node.id, err);
  } finally {
    const next = new Set(loadingIds.value);
    next.delete(node.id);
    loadingIds.value = next;
  }
}

function persistExpanded() {
  void setUserPreference(EXPANDED_PREFERENCE_KEY, [...expanded.value]);
}

function expand(node: TreeNode) {
  if (!node.expandable || expanded.value.has(node.id)) return;
  expanded.value = new Set(expanded.value).add(node.id);
  persistExpanded();
  void ensureChildren(node);
}

function collapse(node: TreeNode) {
  if (!expanded.value.has(node.id)) return;
  const next = new Set(expanded.value);
  next.delete(node.id);
  expanded.value = next;
  persistExpanded();
}

function toggle(node: TreeNode) {
  if (expanded.value.has(node.id)) collapse(node);
  else expand(node);
}

function activate(node: TreeNode) {
  focusedId.value = node.id;
  if (node.filter) emit("select", node.filter);
  else if (node.action) node.action();
  else if (node.expandable) toggle(node);
}

function onRowClick(node: TreeNode) {
  treeRef.value?.focus({ preventScroll: true });
  activate(node);
}

onMounted(() => {
  // restore lazily loaded branches the user left open
  for (const node of roots.value) {
    if (expanded.value.has(node.id)) void ensureChildren(node);
  }
});

// ---- keyboard --------------------------------------------------------------

function focusedRow(): VisibleRow | undefined {
  return visibleRows.value.find((row) => row.node.id === focusedId.value);
}

function moveFocus(delta: number) {
  const rows = visibleRows.value;
  if (rows.length === 0) return;
  const index = rows.findIndex((row) => row.node.id === focusedId.value);
  const next = Math.max(0, Math.min(rows.length - 1, index + delta));
  focusedId.value = rows[next].node.id;
  document
    .getElementById(`tree-${focusedId.value}`)
    ?.scrollIntoView?.({ block: "nearest" });
}

function parentOf(nodeId: string): VisibleRow | undefined {
  const rows = visibleRows.value;
  const index = rows.findIndex((row) => row.node.id === nodeId);
  if (index < 0) return undefined;
  const depth = rows[index].depth;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].depth < depth) return rows[i];
  }
  return undefined;
}

function onKeydown(event: KeyboardEvent) {
  if (store.dialogActive || store.showPlayersMenu) return;
  const row = focusedRow();
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      if (!row) focusedId.value = visibleRows.value[0]?.node.id ?? null;
      else moveFocus(1);
      return;
    case "ArrowUp":
      event.preventDefault();
      moveFocus(-1);
      return;
    case "ArrowRight":
      if (!row) return;
      event.preventDefault();
      if (row.node.expandable && !row.expanded) expand(row.node);
      else moveFocus(1);
      return;
    case "ArrowLeft": {
      if (!row) return;
      event.preventDefault();
      if (row.node.expandable && row.expanded) {
        collapse(row.node);
        return;
      }
      const parent = parentOf(row.node.id);
      if (parent) focusedId.value = parent.node.id;
      return;
    }
    case "Home":
      event.preventDefault();
      focusedId.value = visibleRows.value[0]?.node.id ?? null;
      return;
    case "End":
      event.preventDefault();
      focusedId.value = visibleRows.value.at(-1)?.node.id ?? null;
      return;
    case "Enter":
    case " ":
      if (!row) return;
      event.preventDefault();
      activate(row.node);
      return;
  }
}

defineExpose({ focus: () => treeRef.value?.focus() });
</script>

<style scoped>
.source-tree {
  height: 100%;
  overflow: auto;
  padding: 6px 0;
  outline: none;
  font-size: 13px;
  user-select: none;
}

.source-tree__row {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  margin: 0 6px;
  padding-right: 8px;
  border-radius: 6px;
  color: rgba(var(--v-theme-fg), 0.72);
  white-space: nowrap;
  cursor: default;
}

.source-tree__row:hover {
  background: rgba(var(--v-theme-fg), 0.06);
}

.source-tree__row--section {
  color: rgb(var(--v-theme-fg));
  font-weight: 500;
}

.source-tree__row--active {
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-fg));
}

.source-tree:focus-visible .source-tree__row--focused {
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.source-tree__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: none;
  border: 0;
  padding: 0;
  background: transparent;
  color: rgba(var(--v-theme-fg), 0.4);
  cursor: pointer;
}

.source-tree__chevron--empty {
  cursor: default;
}

.source-tree__icon {
  flex: none;
  color: rgba(var(--v-theme-fg), 0.6);
}

.source-tree__row--active .source-tree__icon {
  color: rgb(var(--v-theme-primary));
}

.source-tree__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-tree__count {
  margin-left: auto;
  padding-left: 8px;
  font-size: 11px;
  color: rgba(var(--v-theme-fg), 0.4);
  font-variant-numeric: tabular-nums;
}
</style>
