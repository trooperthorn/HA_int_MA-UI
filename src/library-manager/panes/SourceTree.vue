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
      :aria-expanded="row.expandable ? row.expanded : undefined"
      :aria-selected="row.node.id === activeNode"
      :aria-level="row.depth + 1"
      @click="onRowClick(row.node)"
      @dblclick="row.expandable && toggle(row.node)"
      @contextmenu.prevent="onRowContextMenu($event, row.node)"
    >
      <button
        v-if="row.expandable"
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
  FolderTree,
  LibraryBig,
  ListMusic,
  Play,
  Speaker,
  Tag,
  TriangleAlert,
  Users,
} from "@lucide/vue";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Component,
} from "vue";
import { useI18n } from "vue-i18n";
import ProviderIcon from "@/components/ProviderIcon.vue";
import { Spinner } from "@/components/ui/spinner";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import { onLibrarySyncCompleted } from "@/composables/useLibrarySync";
import { useBackgroundTasks } from "@/composables/background-tasks/useBackgroundTasks";
import type { ContextMenuItem } from "@/helpers/context_menu_item";
import { isSelectablePlayer } from "@/helpers/players";
import { togglePlayerQueue } from "@/helpers/player_queue";
import { api, ConnectionState } from "@/plugins/api";
import {
  MediaType,
  ProviderFeature,
  ProviderType,
  type BrowseFolder,
  type ProviderInstance,
} from "@/plugins/api/interfaces";
import { eventbus } from "@/plugins/eventbus";
import { store } from "@/plugins/store";
import type { NodeFilter } from "../composables/useLibraryFilter";
import { countSourceItems, type CountableKey } from "../sourceCounts";
import {
  collectSyncIssues,
  groupSyncIssues,
  syncIssueLabel,
} from "../syncIssues";

export interface TreeNode {
  id: string;
  label: string;
  icon?: Component;
  providerDomain?: string;
  count?: number;
  // may have children; a node whose load turns up none loses its chevron
  expandable: boolean;
  // what selecting the node lists; nodes without a filter run an action
  filter?: NodeFilter;
  action?: () => void;
  children?: TreeNode[];
  loadChildren?: () => Promise<TreeNode[]>;
  // right-click menu, when the node has one
  contextMenu?: () => ContextMenuItem[];
}

const props = defineProps<{ activeNode: string }>();
const emit = defineEmits<{ select: [filter: NodeFilter] }>();

const { t } = useI18n();
const { getPreference } = useUserPreferences();
const { tasks } = useBackgroundTasks();

const EXPANDED_PREFERENCE_KEY = "libraryManager.tree";
const storedExpanded = getPreference<string[]>(EXPANDED_PREFERENCE_KEY, [
  "library",
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

// ---- per-source counts -----------------------------------------------------

// there is no count endpoint that takes a provider; these are found by
// probing the listings (see sourceCounts.ts), one kind at a time, on demand
const sourceCounts = ref<Record<string, Partial<Record<CountableKey, number>>>>(
  {},
);
const sourceCountsInFlight = new Set<string>();

const SOURCE_COUNT_KEYS: readonly CountableKey[] = [
  "tracks",
  "playlists",
  "artists",
  "album_artists",
  "albums",
  "genres",
];

async function ensureSourceCount(instanceId: string, key: CountableKey) {
  const token = `${instanceId}:${key}`;
  if (sourceCounts.value[instanceId]?.[key] !== undefined) return;
  if (sourceCountsInFlight.has(token)) return;
  sourceCountsInFlight.add(token);
  try {
    const value = await countSourceItems(key, instanceId, counts.value[key]);
    sourceCounts.value = {
      ...sourceCounts.value,
      [instanceId]: { ...sourceCounts.value[instanceId], [key]: value },
    };
  } catch (err) {
    console.error("[SourceTree] source count failed for %s", token, err);
  } finally {
    sourceCountsInFlight.delete(token);
  }
}

function ensureSourceCounts(instanceId: string) {
  for (const key of SOURCE_COUNT_KEYS) void ensureSourceCount(instanceId, key);
}

// a sync changes the counts; the probed ones are dropped and found again
function resetSourceCounts() {
  sourceCounts.value = {};
  for (const instanceId of Object.keys(providerFolders.value)) {
    void ensureSourceCount(instanceId, "tracks");
  }
}

const unsubscribers: Array<() => void> = [];
onMounted(() => {
  for (const [key, mediaType, load] of COUNT_LOADERS) {
    unsubscribers.push(
      onLibrarySyncCompleted(mediaType, () => void refreshCount(key, load)),
    );
  }
  unsubscribers.push(
    onLibrarySyncCompleted(MediaType.TRACK, resetSourceCounts),
  );
});
onBeforeUnmount(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));

// ---- the library's source ----------------------------------------------------

// the Library node lists every source or, chosen from its right-click menu,
// one of them; the choice is remembered per user
const LIBRARY_SOURCE_PREFERENCE_KEY = "libraryManager.librarySource";
const LIBRARY_SOURCE_ALL = "all";
const storedLibrarySource = getPreference<string>(
  LIBRARY_SOURCE_PREFERENCE_KEY,
  LIBRARY_SOURCE_ALL,
);

const musicProviders = computed<ProviderInstance[]>(() =>
  Object.values(api.providers)
    .filter((provider) => provider.type === ProviderType.MUSIC)
    .sort((left, right) => left.name.localeCompare(right.name)),
);

// a source that has gone away falls back to every source
const librarySource = computed<string | undefined>(() => {
  const value = storedLibrarySource.value;
  if (!value || value === LIBRARY_SOURCE_ALL) return undefined;
  return api.getProvider(value) ? value : undefined;
});

function setLibrarySource(value: string) {
  if (value === (librarySource.value ?? LIBRARY_SOURCE_ALL)) return;
  void setUserPreference(LIBRARY_SOURCE_PREFERENCE_KEY, value);
  if (value !== LIBRARY_SOURCE_ALL) ensureSourceCounts(value);
}

function librarySourceMenu(): ContextMenuItem[] {
  const current = librarySource.value ?? LIBRARY_SOURCE_ALL;
  return [
    {
      label: "library_manager.tree.source_all",
      icon: LibraryBig,
      selected: current === LIBRARY_SOURCE_ALL,
      action: () => setLibrarySource(LIBRARY_SOURCE_ALL),
    },
    ...musicProviders.value.map<ContextMenuItem>((provider) => ({
      label: provider.name,
      selected: current === provider.instance_id,
      action: () => setLibrarySource(provider.instance_id),
    })),
  ];
}

// ---- nodes -----------------------------------------------------------------

// the listings every source offers, in the order they appear under a source;
// the library gets them all, a provider only the ones its features back.
// Each puts its facet in the browser's first column and lists tracks below
// it; the grid always shows songs.
const SOURCE_LISTINGS: Array<{
  id: string;
  labelKey: string;
  icon: Component;
  countKey: string;
  feature: ProviderFeature;
  filter: Partial<NodeFilter> & { mediaType: MediaType };
}> = [
  {
    id: "playlists",
    labelKey: "playlists",
    icon: ListMusic,
    countKey: "playlists",
    feature: ProviderFeature.LIBRARY_PLAYLISTS,
    filter: { mediaType: MediaType.TRACK, leadFacet: "playlist" },
  },
  {
    id: "artists",
    labelKey: "artists",
    icon: Users,
    countKey: "artists",
    feature: ProviderFeature.LIBRARY_ARTISTS,
    filter: { mediaType: MediaType.TRACK, leadFacet: "artist" },
  },
  {
    id: "album_artists",
    labelKey: "library_manager.tree.album_artists",
    icon: Users,
    countKey: "album_artists",
    feature: ProviderFeature.LIBRARY_ARTISTS,
    filter: { mediaType: MediaType.TRACK, leadFacet: "album_artist" },
  },
  {
    id: "genres",
    labelKey: "genres",
    icon: Tag,
    countKey: "genres",
    feature: ProviderFeature.LIBRARY_ARTISTS,
    filter: { mediaType: MediaType.TRACK, leadFacet: "genre" },
  },
  {
    id: "albums",
    labelKey: "albums",
    icon: Disc3,
    countKey: "albums",
    feature: ProviderFeature.LIBRARY_ALBUMS,
    filter: { mediaType: MediaType.TRACK, leadFacet: "album" },
  },
];

const isCountable = (key: string): key is CountableKey =>
  SOURCE_COUNT_KEYS.includes(key as CountableKey);

// the count shown for a listing: the library's, or the source's when the
// listing is narrowed to one
function countFor(
  countKey: string | undefined,
  instanceId: string | undefined,
): number | undefined {
  if (!countKey) return undefined;
  if (!instanceId) return counts.value[countKey];
  return isCountable(countKey)
    ? sourceCounts.value[instanceId]?.[countKey]
    : undefined;
}

// a listing with nothing in it (no playlists on a filesystem, say) is left
// out once that is known
function listingsFor(
  instanceId: string | undefined,
  provider: ProviderInstance | undefined,
) {
  return SOURCE_LISTINGS.filter((listing) => {
    if (provider && !offersListing(provider, listing.feature)) return false;
    return countFor(listing.countKey, instanceId) !== 0;
  });
}

const libraryNode = (
  id: string,
  label: string,
  icon: Component,
  countKey: string | undefined,
  filter: Partial<NodeFilter> & { mediaType: MediaType },
): TreeNode => {
  const source = librarySource.value;
  return {
    id: `library.${id}`,
    label,
    icon,
    count: countFor(countKey, source),
    expandable: false,
    filter: {
      scope: "library",
      node: `library.${id}`,
      ...(source ? { provider: [source] } : {}),
      ...filter,
    },
  };
};

const libraryChildren = computed<TreeNode[]>(() => {
  const source = librarySource.value;
  const provider = source ? api.getProvider(source) : undefined;
  return [
    ...listingsFor(source, provider).map((listing) =>
      libraryNode(
        listing.id,
        t(listing.labelKey),
        listing.icon,
        listing.countKey,
        listing.filter,
      ),
    ),
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
  ];
});

const libraryLabel = computed(() => {
  const source = librarySource.value;
  const provider = source ? api.getProvider(source) : undefined;
  return `${t("library_manager.tree.library")} (${
    provider ? provider.name : t("library_manager.tree.source_all")
  })`;
});

// ---- sources -----------------------------------------------------------------

// the provider root listing is the same one the Browse page shows; each
// folder there stands for a provider and carries the path to browse it
const providerRoots = ref<BrowseFolder[]>([]);
// the folders a provider's own listing offers beyond the standard ones (a
// filesystem's directories, a streaming provider's extras)
const providerFolders = ref<Record<string, BrowseFolder[]>>({});
const providerRootsLoaded = ref(false);

async function loadProviderRoots() {
  if (providerRootsLoaded.value) return;
  providerRootsLoaded.value = true;
  try {
    const items = await api.browse(undefined, store.activePlayerId);
    providerRoots.value = items.filter(isChildFolder);
  } catch (err) {
    providerRootsLoaded.value = false;
    console.error("[SourceTree] failed to list the sources", err);
    return;
  }
  for (const folder of providerRoots.value) {
    const instanceId = instanceIdOf(folder);
    void ensureSourceCount(instanceId, "tracks");
    void loadProviderFolders(folder);
  }
}

async function loadProviderFolders(folder: BrowseFolder) {
  const instanceId = instanceIdOf(folder);
  try {
    const items = await api.browse(folder.path, store.activePlayerId);
    providerFolders.value = {
      ...providerFolders.value,
      [instanceId]: items
        .filter(isChildFolder)
        .filter((item) => !STANDARD_FOLDERS.has(item.item_id)),
    };
  } catch (err) {
    console.error("[SourceTree] failed to browse %s", folder.path, err);
    providerFolders.value = { ...providerFolders.value, [instanceId]: [] };
  }
}

// providers list a ".." entry that browses back up; the tree already has a parent
const isChildFolder = (item: {
  media_type: MediaType;
  name: string;
}): item is BrowseFolder =>
  item.media_type === MediaType.FOLDER && item.name !== "..";

// the root folder names its provider by domain; the path carries the instance
const instanceIdOf = (folder: BrowseFolder) => folder.path.split("://")[0];

// the folders a provider's default listing offers; the tree replaces them
// with its own listing nodes (or drops the ones with nothing behind them)
const STANDARD_FOLDERS = new Set([
  "artists",
  "albums",
  "tracks",
  "playlists",
  "podcasts",
  "audiobooks",
  "radios",
  "sound_effects",
  "recommendations",
  "new-releases",
  "categories",
]);

const isFilesystem = (provider: ProviderInstance) =>
  provider.domain.startsWith("filesystem_");

// what of the library a provider can be listed by; filesystem providers do
// not declare library features but their files are synced into it
function offersListing(provider: ProviderInstance, feature: ProviderFeature) {
  if (provider.type !== ProviderType.MUSIC) return false;
  return (
    isFilesystem(provider) || provider.supported_features.includes(feature)
  );
}

function sourceListingNode(
  instanceId: string,
  listing: (typeof SOURCE_LISTINGS)[number],
): TreeNode {
  const id = `source:${instanceId}.${listing.id}`;
  return {
    id,
    label: t(listing.labelKey),
    icon: listing.icon,
    count: countFor(listing.countKey, instanceId),
    expandable: false,
    filter: {
      scope: "library",
      node: id,
      provider: [instanceId],
      ...listing.filter,
    },
  };
}

// a music provider lists like the library, narrowed to itself, with its
// folders grouped under one node; anything else (radio) browses
function providerNode(folder: BrowseFolder): TreeNode {
  const instanceId = instanceIdOf(folder);
  const provider =
    api.getProvider(instanceId) ?? api.getProvider(folder.provider);
  const listsTracks =
    !!provider && offersListing(provider, ProviderFeature.LIBRARY_TRACKS);
  const node = folderNode(folder);
  const browseFilter: NodeFilter = {
    scope: "browse",
    node: `source:${instanceId}`,
    mediaType: MediaType.FOLDER,
    browsePath: folder.path,
    provider: [instanceId],
  };
  const folders = providerFolders.value[instanceId];
  const listings = provider
    ? listingsFor(instanceId, provider).map((listing) =>
        sourceListingNode(instanceId, listing),
      )
    : [];
  const children: TreeNode[] = [...listings];
  if (folders === undefined) {
    // still browsing; the group appears once the folders are known
  } else if (folders.length > 0) {
    children.push({
      id: `source:${instanceId}.folders`,
      label: t("library_manager.tree.folders"),
      icon: FolderTree,
      expandable: true,
      children: folders.map(folderNode),
      filter: node.filter,
    });
  }
  return {
    ...node,
    id: `source:${instanceId}`,
    providerDomain:
      provider?.type === ProviderType.MUSIC ? provider.domain : undefined,
    count: listsTracks ? sourceCounts.value[instanceId]?.tracks : undefined,
    // while the folders are still being browsed the node may yet have some
    expandable: folders === undefined || children.length > 0,
    children,
    filter: listsTracks
      ? {
          scope: "library",
          node: `source:${instanceId}`,
          mediaType: MediaType.TRACK,
          provider: [instanceId],
        }
      : browseFilter,
    loadChildren: undefined,
  };
}

function folderNode(folder: BrowseFolder): TreeNode {
  const id = `browse:${folder.path}`;
  return {
    id,
    label: folder.name,
    icon: Folder,
    expandable: true,
    filter: {
      scope: "browse",
      node: id,
      mediaType: MediaType.FOLDER,
      browsePath: folder.path,
      provider: [instanceIdOf(folder)],
    },
    loadChildren: async () => {
      const items = await api.browse(folder.path, store.activePlayerId);
      return items.filter(isChildFolder).map(folderNode);
    },
  };
}

const sourceNodes = computed<TreeNode[]>(() =>
  providerRoots.value.map(providerNode),
);

const loadedChildren = ref(new Map<string, TreeNode[]>());
// expandable nodes whose load turned up nothing to expand
const leafIds = ref(new Set<string>());

// players update every second (elapsed time); the tree only cares whether
// the set of usable ones changed
const selectablePlayerIds = computed(() =>
  Object.values(api.players)
    .filter(isSelectablePlayer)
    .map((player) => player.player_id)
    .sort()
    .join(","),
);
const selectablePlayerCount = computed(() =>
  selectablePlayerIds.value ? selectablePlayerIds.value.split(",").length : 0,
);

// ---- sync issues -------------------------------------------------------------

// one folder per kind of failure the sync tasks logged; the whole node is
// gone while there is nothing to fix
const syncIssueNodes = computed<TreeNode[]>(() => {
  const issues = collectSyncIssues(tasks.value);
  if (issues.length === 0) return [];
  const children = groupSyncIssues(issues).map<TreeNode>((group) => {
    const id = `sync_issues.${group.type}`;
    return {
      id,
      label: syncIssueLabel(group, t),
      icon: FileWarning,
      count: group.count,
      expandable: false,
      filter: {
        scope: "issues",
        node: id,
        mediaType: MediaType.TRACK,
        issueType: group.type,
      },
    };
  });
  return [
    {
      id: "sync_issues",
      label: t("library_manager.tree.sync_issues"),
      icon: TriangleAlert,
      count: issues.length,
      expandable: true,
      children,
      filter: {
        scope: "issues",
        node: "sync_issues",
        mediaType: MediaType.TRACK,
      },
    },
  ];
});

// the library and every source sit side by side at the top level
const roots = computed<TreeNode[]>(() => {
  const source = librarySource.value;
  return [
    {
      id: "now_playing",
      label: t("now_playing"),
      icon: Play,
      expandable: false,
      action: togglePlayerQueue,
    },
    {
      id: "library",
      label: libraryLabel.value,
      icon: LibraryBig,
      count: source ? sourceCounts.value[source]?.tracks : counts.value.tracks,
      expandable: true,
      children: libraryChildren.value,
      filter: {
        scope: "library",
        node: "library",
        mediaType: MediaType.TRACK,
        ...(source ? { provider: [source] } : {}),
      },
      contextMenu: librarySourceMenu,
    },
    ...sourceNodes.value,
    ...syncIssueNodes.value,
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
  ];
});

interface VisibleRow {
  node: TreeNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  loading: boolean;
}

function childrenOf(node: TreeNode): TreeNode[] {
  return node.children ?? loadedChildren.value.get(node.id) ?? [];
}

const isExpandable = (node: TreeNode) =>
  node.expandable && !leafIds.value.has(node.id);

const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      const isExpanded = expanded.value.has(node.id);
      const expandable = isExpandable(node);
      rows.push({
        node,
        depth,
        expandable,
        expanded: isExpanded,
        loading: loadingIds.value.has(node.id),
      });
      if (expandable && isExpanded) walk(childrenOf(node), depth + 1);
    }
  };
  walk(roots.value, 0);
  return rows;
});

function findNode(id: string): TreeNode | undefined {
  return visibleRows.value.find((row) => row.node.id === id)?.node;
}

// the listing the grid shows follows a change of library source when it
// is a library node. Immediate, so a stored source also narrows the
// listing the view starts on (the view begins on the library's tracks,
// which has no row of its own, so the library root stands in); nothing
// is emitted while no source was ever set, the unnarrowed listing is
// already what shows. Sits below the rows it reads.
watch(
  librarySource,
  (source, previous) => {
    if (source === undefined && previous === undefined) return;
    if (!props.activeNode.startsWith("library")) return;
    const active = findNode(props.activeNode) ?? findNode("library");
    if (active?.filter) emit("select", active.filter);
  },
  { immediate: true },
);

// ---- expand / select --------------------------------------------------------

async function ensureChildren(node: TreeNode) {
  if (node.children || loadedChildren.value.has(node.id) || !node.loadChildren)
    return;
  if (loadingIds.value.has(node.id)) return;
  loadingIds.value = new Set(loadingIds.value).add(node.id);
  try {
    const children = await node.loadChildren();
    loadedChildren.value = new Map(loadedChildren.value).set(node.id, children);
    if (children.length === 0) {
      leafIds.value = new Set(leafIds.value).add(node.id);
    }
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
  if (!isExpandable(node) || expanded.value.has(node.id)) return;
  expanded.value = new Set(expanded.value).add(node.id);
  persistExpanded();
  onExpanded(node);
  void ensureChildren(node);
}

// opening a source shows its listing counts, which are only probed then
function onExpanded(node: TreeNode) {
  const match = /^source:([^.]+)$/.exec(node.id);
  if (match) ensureSourceCounts(match[1]);
  for (const child of childrenOf(node)) {
    if (expanded.value.has(child.id)) {
      onExpanded(child);
      void ensureChildren(child);
    }
  }
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
  else if (isExpandable(node)) toggle(node);
}

function onRowClick(node: TreeNode) {
  treeRef.value?.focus({ preventScroll: true });
  activate(node);
}

function onRowContextMenu(event: MouseEvent, node: TreeNode) {
  if (!node.contextMenu) return;
  focusedId.value = node.id;
  eventbus.emit("contextmenu", {
    items: node.contextMenu(),
    posX: event.clientX,
    posY: event.clientY,
  });
}

// a reload lands here before the server connection is up; counts, the
// sources and lazy branches the user left open are (re)fetched whenever it
// becomes usable
const connected = computed(
  () => api.state.value === ConnectionState.INITIALIZED,
);
watch(
  connected,
  (ready) => {
    if (!ready) return;
    for (const [key, , load] of COUNT_LOADERS) void refreshCount(key, load);
    void loadProviderRoots();
    if (librarySource.value) ensureSourceCounts(librarySource.value);
  },
  { immediate: true },
);

// sources arrive after the connection; the branches left open under them
// (and their counts) load once they are in the tree
watch(sourceNodes, (nodes) => {
  for (const node of nodes) {
    if (expanded.value.has(node.id)) onExpanded(node);
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
      if (row.expandable && !row.expanded) expand(row.node);
      else moveFocus(1);
      return;
    case "ArrowLeft": {
      if (!row) return;
      event.preventDefault();
      if (row.expandable && row.expanded) {
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
