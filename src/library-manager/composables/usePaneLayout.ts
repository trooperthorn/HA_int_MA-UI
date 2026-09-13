import { computed } from "vue";

// a splitter drag reports every frame; the preference write waits for the
// drag to settle
const SAVE_DELAY_MS = 300;
import {
  setUserPreference,
  useUserPreferences,
} from "@/composables/userPreferences";

export const PANE_LAYOUT_PREFERENCE_KEY = "libraryManager.panes";

export interface PaneLayoutPreference {
  // reka-ui splitter groups persist their layout as a JSON string keyed by
  // the group's autoSaveId; keeping that string per group is all we need
  groups?: Record<string, string>;
  showTree?: boolean;
  showStrip?: boolean;
  showQueue?: boolean;
  showSelected?: boolean;
}

export const PANE_DEFAULTS = {
  treeSize: 18,
  treeMinSize: 10,
  stripSize: 24,
  stripMinSize: 8,
  rightSize: 24,
  rightMinSize: 14,
  queueSize: 55,
  queueMinSize: 15,
} as const;

type PaneFlag = "showTree" | "showStrip" | "showQueue" | "showSelected";

/**
 * Splitter sizes and pane visibility, stored in the user's preferences so
 * they follow the user between browsers instead of living in localStorage.
 */
export function usePaneLayout() {
  const { getPreference } = useUserPreferences();
  const preference = getPreference<PaneLayoutPreference>(
    PANE_LAYOUT_PREFERENCE_KEY,
    {},
  );

  // a synchronous cache lets the splitter read a size before the async
  // preference write has round-tripped
  const pending: Record<string, string> = {};

  const storage = {
    getItem(name: string): string | null {
      return pending[name] ?? preference.value.groups?.[name] ?? null;
    },
    setItem(name: string, value: string): void {
      if (storage.getItem(name) === value) return;
      pending[name] = value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSizes, SAVE_DELAY_MS);
    },
  };

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function flushSizes() {
    saveTimer = undefined;
    void setUserPreference(PANE_LAYOUT_PREFERENCE_KEY, {
      ...preference.value,
      groups: { ...preference.value.groups, ...pending },
    });
  }

  const flag = (key: PaneFlag) =>
    computed(() => preference.value[key] !== false);
  const showTree = flag("showTree");
  const showStrip = flag("showStrip");
  const showQueue = flag("showQueue");
  const showSelected = flag("showSelected");

  async function setFlag(key: PaneFlag, value: boolean) {
    await setUserPreference(PANE_LAYOUT_PREFERENCE_KEY, {
      ...preference.value,
      [key]: value,
    });
  }
  const setShowTree = (value: boolean) => setFlag("showTree", value);
  const setShowStrip = (value: boolean) => setFlag("showStrip", value);
  const setShowQueue = (value: boolean) => setFlag("showQueue", value);
  const setShowSelected = (value: boolean) => setFlag("showSelected", value);

  async function reset() {
    for (const key of Object.keys(pending)) delete pending[key];
    await setUserPreference(PANE_LAYOUT_PREFERENCE_KEY, {});
  }

  return {
    storage,
    showTree,
    showStrip,
    showQueue,
    showSelected,
    setShowTree,
    setShowStrip,
    setShowQueue,
    setShowSelected,
    reset,
  };
}
