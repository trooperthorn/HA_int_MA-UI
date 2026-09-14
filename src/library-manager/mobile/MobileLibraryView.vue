<template>
  <div class="mobile-library">
    <header class="mobile-library__header">
      <MediaItemThumb
        v-if="store.curQueueItem?.media_item"
        :item="store.curQueueItem.media_item"
        size="40"
        class="mobile-library__avatar"
      />
      <div v-else class="mobile-library__avatar mobile-library__avatar--empty">
        <LibraryBig :size="20" />
      </div>
      <h1 class="mobile-library__title">{{ t("library_manager.title") }}</h1>
      <button
        type="button"
        class="mobile-library__icon-button"
        :aria-label="t('search')"
        @click="openCommandCenter()"
      >
        <Search :size="26" />
      </button>
      <!-- create, and this browser's web player buffer and codec -->
      <button
        type="button"
        class="mobile-library__icon-button"
        :aria-label="t('library_manager.mobile.menu')"
        @click="openMainMenu($event)"
      >
        <Menu :size="26" />
      </button>
    </header>

    <!-- one chip per kind the source holds; tapping the picked one shows
         everything again. The first chip picks the source. -->
    <div class="mobile-library__chips" role="tablist">
      <button
        type="button"
        class="mobile-library__chip mobile-library__chip--icon"
        :class="{ 'mobile-library__chip--on': !!source }"
        :aria-label="t('library_manager.mobile.source')"
        @click="openSourceMenu($event)"
      >
        <ProviderIcon
          v-if="sourceDomain"
          :domain="sourceDomain"
          :size="18"
          monochrome
        />
        <SlidersHorizontal v-else :size="18" />
      </button>
      <button
        v-for="kind in visibleKinds"
        :key="kind.id"
        type="button"
        role="tab"
        class="mobile-library__chip"
        :class="{ 'mobile-library__chip--on': picked === kind.id }"
        :aria-selected="picked === kind.id"
        :data-kind="kind.id"
        @click="pick(kind.id)"
      >
        {{ t(kind.labelKey) }}
      </button>
    </div>

    <div class="mobile-library__bar">
      <button
        type="button"
        class="mobile-library__sort"
        :data-sort="sort"
        @click="cycleSort()"
      >
        <ArrowDownUp :size="16" />
        <span>{{ t(`library_manager.mobile.sort_${sort}`) }}</span>
      </button>
      <button
        type="button"
        class="mobile-library__icon-button mobile-library__icon-button--small"
        :aria-label="
          t(
            layout === 'list'
              ? 'library_manager.mobile.grid'
              : 'library_manager.mobile.list',
          )
        "
        :aria-pressed="layout === 'grid'"
        @click="toggleLayout()"
      >
        <LayoutGrid v-if="layout === 'list'" :size="20" />
        <List v-else :size="20" />
      </button>
    </div>

    <div v-if="loading && rows.length === 0" class="mobile-library__empty">
      <Spinner class="size-5" />
    </div>
    <div v-else-if="rows.length === 0" class="mobile-library__empty">
      {{ t("no_content") }}
    </div>

    <div
      v-else
      class="mobile-library__list"
      :class="{ 'mobile-library__list--grid': layout === 'grid' }"
    >
      <button
        v-for="row in rows"
        :key="row.item.uri"
        type="button"
        class="mobile-library__row"
        :data-uri="row.item.uri"
        @click="onTap($event, row.item)"
        @contextmenu.prevent="openMenu($event, row.item)"
        @pointerdown="startHold($event, row.item)"
        @pointerup="endHold"
        @pointercancel="endHold"
        @pointermove="onHoldMove"
      >
        <div
          class="mobile-library__thumb"
          :class="{
            'mobile-library__thumb--round':
              row.item.media_type === MediaType.ARTIST,
          }"
        >
          <MediaItemThumb :item="row.item" size="100%" />
        </div>
        <div class="mobile-library__text">
          <div class="mobile-library__name">{{ row.item.name }}</div>
          <div class="mobile-library__subtitle">
            <ProviderIcon
              :domain="row.sourceDomain"
              :size="12"
              class="mobile-library__source"
            />
            <span class="truncate">{{ row.subtitle }}</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowDownUp,
  AudioLines,
  ClipboardList,
  Gauge,
  LayoutGrid,
  LibraryBig,
  List,
  Menu,
  Plus,
  Search,
  SlidersHorizontal,
} from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import MediaItemThumb from "@/components/MediaItemThumb.vue";
import ProviderIcon from "@/components/ProviderIcon.vue";
import type { ContextMenuItem } from "@/helpers/context_menu_item";
import { Spinner } from "@/components/ui/spinner";
import { useCommandCenter } from "@/composables/useCommandCenter";
import { onLibrarySyncCompleted } from "@/composables/useLibrarySync";
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";
import {
  handleMediaItemClick,
  handleMenuBtnClick,
} from "@/helpers/media_item_actions";
import { getArtistsString } from "@/helpers/utils";
import { api, ConnectionState } from "@/plugins/api";
import { getListItemProviderIconDomain } from "@/plugins/api/helpers";
import {
  MediaType,
  ProviderType,
  type MediaItemType,
} from "@/plugins/api/interfaces";
import { eventbus } from "@/plugins/eventbus";
import { store } from "@/plugins/store";
import {
  clearWebPlayerLog,
  formatWebPlayerLog,
  webPlayerLog,
} from "@/plugins/web_player_log";
import {
  ADAPTIVE_CHOICES,
  BITRATE_CHOICES,
  BUFFER_AUTO,
  BUFFER_CHOICES_MS,
  CODEC_CHOICES,
  setWebPlayerAdaptive,
  setWebPlayerBitrate,
  setWebPlayerBuffer,
  setWebPlayerCodec,
  webPlayerStatus,
  webPlayerTuning,
} from "@/plugins/web_player_tuning";

defineOptions({ name: "MobileLibrary" });

// the library on a phone: one list over every kind of item, narrowed by a
// chip, sorted by recent use or by name; the desktop manager has no place
// on a screen this size
type Kind = "playlists" | "podcasts" | "audiobooks" | "albums" | "artists";
type Sort = "recents" | "alphabetical";
type Layout = "list" | "grid";

interface KindDef {
  id: Kind;
  labelKey: string;
  mediaType: MediaType;
}

const KINDS: readonly KindDef[] = [
  { id: "playlists", labelKey: "playlists", mediaType: MediaType.PLAYLIST },
  { id: "artists", labelKey: "artists", mediaType: MediaType.ARTIST },
  { id: "albums", labelKey: "albums", mediaType: MediaType.ALBUM },
  { id: "podcasts", labelKey: "podcasts", mediaType: MediaType.PODCAST },
  {
    id: "audiobooks",
    labelKey: "audiobooks",
    mediaType: MediaType.AUDIOBOOK,
  },
];

// artists and albums are always offered; the rest only while the source
// has some
const OPTIONAL_KINDS: ReadonlySet<Kind> = new Set([
  "playlists",
  "podcasts",
  "audiobooks",
]);

// how many of each kind the list holds; the chips narrow to one kind for
// the rest
const PER_KIND = 100;

// library listings carry these two stats the item interfaces leave out
type LibraryItem = MediaItemType & {
  last_played?: number | null;
  date_added?: string | null;
};

interface Row {
  item: LibraryItem;
  subtitle: string;
  sourceDomain: string;
}

const PREFERENCE_KEY = "libraryManager.mobile";
interface MobilePreference {
  sort?: Sort;
  layout?: Layout;
  // a provider instance id; every source when unset
  source?: string;
}

const { t } = useI18n();
const { open: openCommandCenter } = useCommandCenter();
const { getPreference } = useUserPreferences();
const preference = getPreference<MobilePreference>(PREFERENCE_KEY, {});

const picked = ref<Kind | undefined>(undefined);
const sort = computed<Sort>(() => preference.value.sort ?? "recents");
const layout = computed<Layout>(() => preference.value.layout ?? "list");
const loading = ref(false);
const items = ref<LibraryItem[]>([]);
// kinds the current source turned out to hold nothing of
const emptyKinds = ref(new Set<Kind>());

// a source that has gone away means every source
const source = computed<string | undefined>(() => {
  const value = preference.value.source;
  return value && api.getProvider(value) ? value : undefined;
});
const sourceDomain = computed(() =>
  source.value ? api.getProvider(source.value)?.domain : undefined,
);

const visibleKinds = computed(() =>
  KINDS.filter(
    (kind) => !OPTIONAL_KINDS.has(kind.id) || !emptyKinds.value.has(kind.id),
  ),
);

function pick(kind: Kind) {
  picked.value = picked.value === kind ? undefined : kind;
}

function setSource(value: string | undefined) {
  if (value === source.value) return;
  picked.value = undefined;
  void setUserPreference(PREFERENCE_KEY, {
    ...preference.value,
    source: value,
  });
}

function openSourceMenu(event: MouseEvent) {
  const providers = Object.values(api.providers)
    .filter((provider) => provider.type === ProviderType.MUSIC)
    .sort((left, right) => left.name.localeCompare(right.name));
  const menuItems: ContextMenuItem[] = [
    {
      label: "library_manager.tree.source_all",
      icon: LibraryBig,
      selected: !source.value,
      action: () => setSource(undefined),
    },
    ...providers.map<ContextMenuItem>((provider) => ({
      label: provider.name,
      selected: source.value === provider.instance_id,
      action: () => setSource(provider.instance_id),
    })),
  ];
  eventbus.emit("contextmenu", {
    items: menuItems,
    posX: event.clientX,
    posY: event.clientY,
  });
}

// ---- the header menu: create, and the web player's buffer and codec ------

function bufferLabel(ms: number): string {
  if (ms === BUFFER_AUTO)
    return t("library_manager.mobile.web_player.buffer_auto");
  return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
}

function webPlayerStatusLabel(): string {
  const status = webPlayerStatus;
  if (!status.connected) return t("library_manager.mobile.web_player.off");
  return t("library_manager.mobile.web_player.status", {
    codec: (status.codec ?? "?").toUpperCase(),
    rate: status.sampleRate ? `${status.sampleRate / 1000} kHz` : "",
    buffer: bufferLabel(status.minBufferMs ?? 0),
    link: t(
      status.direct
        ? "library_manager.mobile.web_player.direct"
        : "library_manager.mobile.web_player.remote",
    ),
  });
}

function openMainMenu(event: MouseEvent) {
  const items: ContextMenuItem[] = [
    {
      label: "library_manager.mobile.create",
      icon: Plus,
      action: () => eventbus.emit("createPlaylist", {}),
    },
    // what this browser's player runs with right now
    { label: webPlayerStatusLabel(), disabled: true },
    {
      label: "library_manager.mobile.web_player.buffer",
      icon: Gauge,
      subItems: BUFFER_CHOICES_MS.map<ContextMenuItem>((ms) => ({
        label: bufferLabel(ms),
        selected: webPlayerTuning.bufferMs === ms,
        action: () => setWebPlayerBuffer(ms),
      })),
    },
    {
      label: "library_manager.mobile.web_player.codec",
      icon: AudioLines,
      subItems: CODEC_CHOICES.map<ContextMenuItem>((codec) => ({
        label:
          codec === "auto"
            ? "library_manager.mobile.web_player.codec_auto"
            : codec.toUpperCase(),
        selected: webPlayerTuning.codec === codec,
        action: () => setWebPlayerCodec(codec),
      })),
    },
    {
      label: "library_manager.mobile.web_player.bitrate",
      icon: Gauge,
      subItems: BITRATE_CHOICES.map<ContextMenuItem>((bitrate) => ({
        label: bitrate
          ? `${bitrate / 1000} kb/s`
          : "library_manager.mobile.web_player.bitrate_default",
        selected: webPlayerTuning.bitrate === bitrate,
        action: () => setWebPlayerBitrate(bitrate),
      })),
    },
    {
      label: "library_manager.mobile.web_player.adaptive",
      icon: ArrowDownUp,
      subItems: ADAPTIVE_CHOICES.map<ContextMenuItem>((pref) => ({
        label: `library_manager.mobile.web_player.adaptive_${pref}`,
        selected: webPlayerTuning.adaptive === pref,
        action: () => setWebPlayerAdaptive(pref),
      })),
    },
    // what the player did: copy or share it after a test, then clear
    {
      label: "library_manager.mobile.web_player.log",
      icon: ClipboardList,
      subItems: [
        {
          label: "library_manager.mobile.web_player.log_copy",
          labelArgs: { count: webPlayerLog.entries.length },
          action: () => void copyWebPlayerLog(),
        },
        ...(typeof navigator !== "undefined" && "share" in navigator
          ? [
              {
                label: "library_manager.mobile.web_player.log_share",
                action: () => void shareWebPlayerLog(),
              },
            ]
          : []),
        {
          label: "library_manager.mobile.web_player.log_clear",
          action: () => clearWebPlayerLog(),
        },
      ],
    },
  ];
  if (webPlayerStatus.adaptive) {
    items.splice(2, 0, {
      label: "library_manager.mobile.web_player.rung",
      labelArgs: { rung: webPlayerStatus.rung },
      disabled: true,
    });
  }
  eventbus.emit("contextmenu", {
    items,
    posX: event.clientX,
    posY: event.clientY,
  });
}

async function copyWebPlayerLog() {
  const text = formatWebPlayerLog();
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("library_manager.mobile.web_player.log_copied"));
  } catch {
    // no clipboard (insecure context, or the app denies it): offer the
    // share sheet instead, which the Companion app does allow
    if ("share" in navigator) await shareWebPlayerLog();
    else toast.error(t("library_manager.mobile.web_player.log_copy_failed"));
  }
}

async function shareWebPlayerLog() {
  const text = formatWebPlayerLog();
  try {
    await navigator.share({ title: "Music Assistant web player log", text });
  } catch {
    // the user closed the sheet; nothing to say
  }
}

function cycleSort() {
  void setUserPreference(PREFERENCE_KEY, {
    ...preference.value,
    sort: sort.value === "recents" ? "alphabetical" : "recents",
  });
}

function toggleLayout() {
  void setUserPreference(PREFERENCE_KEY, {
    ...preference.value,
    layout: layout.value === "list" ? "grid" : "list",
  });
}

// ---- loading -----------------------------------------------------------------

function loadKind(kind: Kind): Promise<LibraryItem[]> {
  const order = "timestamp_added_desc";
  const provider = source.value;
  switch (kind) {
    case "playlists":
      return api.getLibraryPlaylists(
        undefined,
        undefined,
        PER_KIND,
        0,
        order,
        provider,
      );
    case "podcasts":
      return api.getLibraryPodcasts(
        undefined,
        undefined,
        PER_KIND,
        0,
        order,
        provider,
      );
    case "audiobooks":
      return api.getLibraryAudiobooks(
        undefined,
        undefined,
        PER_KIND,
        0,
        order,
        provider,
      ) as Promise<LibraryItem[]>;
    case "albums":
      return api.getLibraryAlbums(
        undefined,
        undefined,
        PER_KIND,
        0,
        order,
        undefined,
        provider,
      );
    case "artists":
      return api.getLibraryArtists(
        undefined,
        undefined,
        PER_KIND,
        0,
        order,
        true,
        provider,
      );
  }
}

let generation = 0;
async function load() {
  const forGeneration = ++generation;
  loading.value = true;
  const kinds = picked.value ? [picked.value] : KINDS.map((kind) => kind.id);
  try {
    const results = await Promise.all(
      kinds.map((kind) =>
        loadKind(kind).catch((err) => {
          console.error("[MobileLibrary] failed to load %s", kind, err);
          return [] as LibraryItem[];
        }),
      ),
    );
    if (forGeneration !== generation) return;
    items.value = results.flat();
    // a full load says which kinds the source has nothing of
    if (!picked.value) {
      emptyKinds.value = new Set(
        kinds.filter((kind, index) => results[index].length === 0),
      );
    }
  } finally {
    if (forGeneration === generation) loading.value = false;
  }
}

const connected = computed(
  () => api.state.value === ConnectionState.INITIALIZED,
);
watch(
  [connected, picked, source],
  ([ready]) => {
    if (ready) void load();
  },
  { immediate: true },
);

const unsubscribers: Array<() => void> = [];
onMounted(() => {
  for (const kind of KINDS) {
    unsubscribers.push(
      onLibrarySyncCompleted(kind.mediaType, () => void load()),
    );
  }
});
onBeforeUnmount(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));

// ---- rows --------------------------------------------------------------------

const recency = (item: LibraryItem) => {
  const played = item.last_played ? item.last_played * 1000 : 0;
  const added = item.date_added ? Date.parse(item.date_added) || 0 : 0;
  return Math.max(played, added);
};

const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: "base" });

function subtitleOf(item: LibraryItem): string {
  switch (item.media_type) {
    case MediaType.PLAYLIST: {
      const owner = "owner" in item ? item.owner : "";
      return owner ? `${t("playlist")} • ${owner}` : t("playlist");
    }
    case MediaType.ALBUM: {
      const artists =
        "artists" in item && Array.isArray(item.artists)
          ? getArtistsString(item.artists, 2)
          : "";
      return artists ? `${t("album")} • ${artists}` : t("album");
    }
    case MediaType.ARTIST:
      return t("artist");
    case MediaType.PODCAST: {
      const publisher = "publisher" in item ? item.publisher : "";
      return publisher ? `${t("podcast")} • ${publisher}` : t("podcast");
    }
    case MediaType.AUDIOBOOK: {
      const authors =
        "authors" in item && Array.isArray(item.authors)
          ? item.authors
              .map((author) =>
                typeof author === "string" ? author : author.name,
              )
              .join(", ")
          : "";
      return authors ? `${t("audiobook")} • ${authors}` : t("audiobook");
    }
    default:
      return item.media_type;
  }
}

const rows = computed<Row[]>(() => {
  const sorted = [...items.value].sort((left, right) =>
    sort.value === "recents"
      ? recency(right) - recency(left) ||
        NAME_COLLATOR.compare(left.name, right.name)
      : NAME_COLLATOR.compare(left.name, right.name),
  );
  return sorted.map((item) => ({
    item,
    subtitle: subtitleOf(item),
    sourceDomain: getListItemProviderIconDomain(item),
  }));
});

// ---- tap and hold ------------------------------------------------------------

const HOLD_MS = 500;
// a finger never holds perfectly still; only a real drag cancels the hold
const HOLD_SLOP_PX = 10;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let holdFired = false;
let holdStart: { x: number; y: number } | undefined;

function openMenu(event: MouseEvent | PointerEvent, item: LibraryItem) {
  handleMenuBtnClick(item, event.clientX, event.clientY, undefined, true);
}

function startHold(event: PointerEvent, item: LibraryItem) {
  holdFired = false;
  holdStart = { x: event.clientX, y: event.clientY };
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdFired = true;
    openMenu(event, item);
  }, HOLD_MS);
}

function endHold() {
  clearTimeout(holdTimer);
  holdTimer = undefined;
  holdStart = undefined;
}

function onHoldMove(event: PointerEvent) {
  if (!holdStart) return;
  if (
    Math.abs(event.clientX - holdStart.x) > HOLD_SLOP_PX ||
    Math.abs(event.clientY - holdStart.y) > HOLD_SLOP_PX
  ) {
    endHold();
  }
}

function onTap(event: MouseEvent, item: LibraryItem) {
  endHold();
  if (holdFired) {
    holdFired = false;
    return;
  }
  handleMediaItemClick(item, event.clientX, event.clientY);
}
</script>

<style scoped>
.mobile-library {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 16px;
  color: rgb(var(--v-theme-fg));
}

.mobile-library__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 8px;
}

.mobile-library__avatar {
  width: 40px;
  height: 40px;
  flex: none;
  border-radius: 50%;
  overflow: hidden;
}

.mobile-library__avatar--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--v-theme-fg), 0.1);
}

.mobile-library__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-library__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex: none;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: rgb(var(--v-theme-fg));
  padding: 0;
}

.mobile-library__icon-button--small {
  width: 32px;
  height: 32px;
  color: rgba(var(--v-theme-fg), 0.75);
}

.mobile-library__chips {
  display: flex;
  gap: 8px;
  padding: 8px 16px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.mobile-library__chips::-webkit-scrollbar {
  display: none;
}

.mobile-library__chip {
  flex: none;
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: 17px;
  background: rgba(var(--v-theme-fg), 0.1);
  color: rgb(var(--v-theme-fg));
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

.mobile-library__chip--on {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary, 0, 0, 0));
}

.mobile-library__chip--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  padding: 0;
}

.mobile-library__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px 8px;
}

.mobile-library__sort {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-fg));
  font-size: 14px;
  font-weight: 600;
  padding: 4px 0;
}

.mobile-library__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: rgba(var(--v-theme-fg), 0.5);
}

.mobile-library__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 8px;
}

.mobile-library__row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
}

.mobile-library__row:active {
  background: rgba(var(--v-theme-fg), 0.06);
}

.mobile-library__thumb {
  width: 64px;
  height: 64px;
  flex: none;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(var(--v-theme-fg), 0.08);
}

.mobile-library__thumb--round {
  border-radius: 50%;
}

.mobile-library__text {
  flex: 1;
  min-width: 0;
}

.mobile-library__name {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-library__subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  font-size: 13px;
  color: rgba(var(--v-theme-fg), 0.6);
  overflow: hidden;
  white-space: nowrap;
}

.mobile-library__source {
  flex: none;
  opacity: 0.8;
}

/* grid: two square tiles per row in portrait, four in landscape, text
   below; the tile is sized by the column and the image fills it, so no
   image is stretched */
.mobile-library__list--grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px;
  padding: 0 16px;
}

@media (orientation: landscape) {
  .mobile-library__list--grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.mobile-library__list--grid .mobile-library__row {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
  padding: 0;
}

.mobile-library__list--grid .mobile-library__thumb {
  position: relative;
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}

.mobile-library__list--grid .mobile-library__thumb > * {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
}

.mobile-library__list--grid .mobile-library__thumb--round {
  border-radius: 50%;
}
</style>
