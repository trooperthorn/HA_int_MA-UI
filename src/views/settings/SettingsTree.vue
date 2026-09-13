<template>
  <nav
    ref="treeRef"
    class="settings-tree"
    role="tree"
    tabindex="0"
    :aria-label="$t('settings.settings')"
    @keydown="onKeydown"
  >
    <div
      v-for="row in visibleRows"
      :id="`settings-tree-${row.node.id}`"
      :key="row.node.id"
      role="treeitem"
      class="settings-tree__row"
      :class="{
        'settings-tree__row--active': row.node.id === activeId,
        'settings-tree__row--focused': row.node.id === focusedId,
        'settings-tree__row--section': row.depth === 0,
      }"
      :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
      :aria-expanded="row.node.children ? row.expanded : undefined"
      :aria-selected="row.node.id === activeId"
      :aria-level="row.depth + 1"
      :data-node="row.node.id"
      @click="onRowClick(row.node)"
    >
      <button
        v-if="row.node.children"
        type="button"
        class="settings-tree__chevron"
        tabindex="-1"
        :aria-label="row.expanded ? $t('collapse') : $t('expand')"
        @click.stop="toggle(row.node)"
      >
        <ChevronDown v-if="row.expanded" :size="12" />
        <ChevronRight v-else :size="12" />
      </button>
      <span v-else class="settings-tree__chevron"></span>
      <!-- fixed-size box: Icon's container otherwise stretches to fill the
           row and pushes the label to the far right -->
      <span class="settings-tree__icon">
        <ProviderIcon
          v-if="row.node.providerDomain"
          :domain="row.node.providerDomain"
          :size="14"
        />
        <Icon v-else-if="row.node.icon" :icon="row.node.icon" size="14" />
      </span>
      <span class="settings-tree__label">{{ row.node.label }}</span>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronRight } from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import Icon from "@/components/Icon.vue";
import ProviderIcon from "@/components/ProviderIcon.vue";
import { api, ConnectionState } from "@/plugins/api";
import {
  ProviderType,
  type CoreConfig,
  type ProviderConfig,
  Scope,
} from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";
import { requireServerVersion } from "@/plugins/api/helpers";
import { availableSettingsSections } from "@/helpers/settings_sections";

export interface SettingsTreeNode {
  id: string;
  label: string;
  icon?: string;
  providerDomain?: string;
  route: RouteLocationRaw;
  children?: SettingsTreeNode[];
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
// upstream's helpers/settings_sections.ts carries the same section list this
// fork used to keep its own copy of, with a scope per section instead of an
// admin flag; the fork copy is gone
const sections = computed(() =>
  availableSettingsSections(
    (scope) => authManager.hasScope(scope),
    requireServerVersion,
  ),
);

const treeRef = ref<HTMLElement | null>(null);
const focusedId = ref<string | null>(null);
const expanded = ref(new Set<string>());

// ---- dynamic children --------------------------------------------------------

const musicProviders = ref<ProviderConfig[]>([]);
const coreConfigs = ref<CoreConfig[]>([]);

async function loadChildren() {
  try {
    const configs = await api.getProviderConfigs(ProviderType.MUSIC);
    musicProviders.value = configs
      .filter((config) => config.enabled)
      .sort((a, b) => providerName(a).localeCompare(providerName(b)));
  } catch (err) {
    console.error("[SettingsTree] provider configs failed", err);
  }
  if (!authManager.hasScope(Scope.CONFIG_CORE_WRITE)) return;
  try {
    const configs = await api.getCoreConfigs();
    coreConfigs.value = configs
      // the task list node below stands in for the background tasks module
      .filter((config) => config.domain !== "background_tasks")
      .sort((a, b) => coreName(a.domain).localeCompare(coreName(b.domain)));
  } catch (err) {
    console.error("[SettingsTree] core configs failed", err);
  }
}

const providerName = (config: ProviderConfig) =>
  config.name ||
  config.default_name ||
  api.providerManifests[config.domain]?.name ||
  config.domain;

function coreName(domain: string) {
  const key = `settings.core_module.${domain}.name`;
  const translated = t(key);
  return translated !== key
    ? translated
    : api.providerManifests[domain]?.name || domain;
}

// ---- nodes -------------------------------------------------------------------

const CORE_ICONS: Record<string, string> = {
  cache: "mdi-database",
  metadata: "mdi-tag",
  music: "mdi-music",
  players: "mdi-speaker",
  player_queues: "mdi-playlist-play",
  streams: "mdi-waveform",
  webserver: "mdi-web",
};

const nodes = computed<SettingsTreeNode[]>(() =>
  sections.value.map((section) => {
    const node: SettingsTreeNode = {
      id: section.name,
      label: t(section.label),
      icon: section.icon,
      route: section.route,
    };
    if (section.name === "music_providers") {
      node.children = musicProviders.value.map((config) => ({
        id: `provider:${config.instance_id}`,
        label: providerName(config),
        providerDomain: config.domain,
        route: {
          name: "editprovider",
          params: { instanceId: config.instance_id },
        },
      }));
    } else if (section.name === "system") {
      node.children = [
        ...coreConfigs.value.map((config) => ({
          id: `core:${config.domain}`,
          label: coreName(config.domain),
          icon: CORE_ICONS[config.domain] ?? "mdi-cog",
          route: { name: "editcore", params: { domain: config.domain } },
        })),
        {
          id: "backgroundtasks",
          label: t("background_tasks.title"),
          icon: "mdi-progress-clock",
          route: { name: "backgroundtasks" },
        },
        {
          id: "diagnostics",
          label: t("settings.diagnostics"),
          icon: "mdi-stethoscope",
          route: { name: "diagnostics" },
        },
        {
          id: "genremanagement",
          label: t("settings.genre_management"),
          icon: "mdi-tag-multiple",
          route: { name: "genremanagement" },
        },
      ];
    } else if (section.name === "frontend") {
      node.children = [
        {
          id: "frontendsettings",
          label: t("settings.appearance"),
          icon: "mdi-palette",
          route: { name: "frontendsettings" },
        },
        {
          id: "frontendlibraryview",
          label: t("settings.library_view.title"),
          icon: "mdi-view-list",
          route: { name: "frontendlibraryview" },
        },
        {
          id: "frontendkeyboard",
          label: t("settings.keyboard.title"),
          icon: "mdi-keyboard",
          route: { name: "frontendkeyboard" },
        },
      ];
    }
    return node;
  }),
);

// ---- which node the route is on ----------------------------------------------

const activeId = computed(() => {
  const name = route.name?.toString() ?? "";
  const params = route.params;
  const types = (route.query.types as string | undefined)?.split(",")[0];
  if (name === "editprovider") {
    const instanceId = params.instanceId as string;
    const domain = instanceId.split("--")[0];
    const type =
      api.getProvider(instanceId)?.type ?? api.providerManifests[domain]?.type;
    if (type === ProviderType.MUSIC) return `provider:${instanceId}`;
    if (type === ProviderType.PLAYER) return "player_providers";
    if (type === ProviderType.METADATA) return "metadata_providers";
    if (type === ProviderType.PLUGIN) return "plugin_providers";
    return "audio_analysis_providers";
  }
  if (name === "editcore") return `core:${params.domain as string}`;
  if (name === "providersettings") {
    if (types === "player") return "player_providers";
    if (types === "metadata") return "metadata_providers";
    if (types === "plugin") return "plugin_providers";
    if (types === "audio_analysis") return "audio_analysis_providers";
    return "music_providers";
  }
  if (["backgroundtasks", "diagnostics", "genremanagement"].includes(name)) {
    return name;
  }
  if (name === "audioanalysissettings") return "system";
  if (
    name.startsWith("editplayer") ||
    name === "editqueue" ||
    name === "addgroup" ||
    name === "playersettings"
  ) {
    return "players";
  }
  if (name === "frontendsettings") return "frontendsettings";
  if (name.startsWith("frontend")) return name;
  if (name === "systemsettings") return "system";
  if (name === "profile") return "profile";
  if (name === "usersettings") return "users";
  if (name === "remoteaccesssettings") return "remote_access";
  if (name === "aboutsettings") return "about";
  return "";
});

// the branch holding the active node is always open
watch(
  activeId,
  (id) => {
    for (const node of nodes.value) {
      if (node.children?.some((child) => child.id === id)) {
        expanded.value = new Set(expanded.value).add(node.id);
      }
    }
  },
  { immediate: true },
);
watch(nodes, () => {
  const id = activeId.value;
  for (const node of nodes.value) {
    if (node.children?.some((child) => child.id === id)) {
      expanded.value = new Set(expanded.value).add(node.id);
    }
  }
});

interface VisibleRow {
  node: SettingsTreeNode;
  depth: number;
  expanded: boolean;
}

const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = [];
  for (const node of nodes.value) {
    const isExpanded = expanded.value.has(node.id);
    rows.push({ node, depth: 0, expanded: isExpanded });
    if (node.children && isExpanded) {
      for (const child of node.children) {
        rows.push({ node: child, depth: 1, expanded: false });
      }
    }
  }
  return rows;
});

// ---- interaction -------------------------------------------------------------

function toggle(node: SettingsTreeNode) {
  const next = new Set(expanded.value);
  if (next.has(node.id)) next.delete(node.id);
  else next.add(node.id);
  expanded.value = next;
}

function open(node: SettingsTreeNode) {
  focusedId.value = node.id;
  if (node.children && !expanded.value.has(node.id)) {
    expanded.value = new Set(expanded.value).add(node.id);
  }
  void router.push(node.route);
}

function onRowClick(node: SettingsTreeNode) {
  treeRef.value?.focus({ preventScroll: true });
  open(node);
}

function moveFocus(delta: number) {
  const rows = visibleRows.value;
  if (rows.length === 0) return;
  const index = rows.findIndex((row) => row.node.id === focusedId.value);
  const next = Math.max(0, Math.min(rows.length - 1, index + delta));
  focusedId.value = rows[next].node.id;
}

function onKeydown(event: KeyboardEvent) {
  const row = visibleRows.value.find((r) => r.node.id === focusedId.value);
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
      if (row.node.children && !row.expanded) toggle(row.node);
      else moveFocus(1);
      return;
    case "ArrowLeft":
      if (!row) return;
      event.preventDefault();
      if (row.node.children && row.expanded) toggle(row.node);
      else if (row.depth > 0) {
        const parent = nodes.value.find((node) =>
          node.children?.includes(row.node),
        );
        if (parent) focusedId.value = parent.id;
      }
      return;
    case "Enter":
    case " ":
      if (!row) return;
      event.preventDefault();
      open(row.node);
      return;
  }
}

onMounted(() => {
  focusedId.value = activeId.value || null;
});

// a hard reload lands here before the socket is up; load once it is (and
// again after a reconnect)
watch(
  () => api.state.value === ConnectionState.INITIALIZED,
  (ready) => {
    if (ready) void loadChildren();
  },
  { immediate: true },
);
</script>

<style scoped>
.settings-tree {
  height: 100%;
  overflow: auto;
  padding: 6px 0;
  outline: none;
  font-size: 13px;
  user-select: none;
}

.settings-tree__row {
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

.settings-tree__row:hover {
  background: rgba(var(--v-theme-fg), 0.06);
}

.settings-tree__row--section {
  color: rgb(var(--v-theme-fg));
  font-weight: 500;
}

.settings-tree__row--active {
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-fg));
}

.settings-tree:focus-visible .settings-tree__row--focused {
  box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));
}

.settings-tree__chevron {
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

.settings-tree__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: none;
  color: rgba(var(--v-theme-fg), 0.6);
}

.settings-tree__row--active .settings-tree__icon {
  color: rgb(var(--v-theme-primary));
}

.settings-tree__label {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
