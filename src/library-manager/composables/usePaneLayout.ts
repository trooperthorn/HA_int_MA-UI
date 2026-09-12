import { computed } from "vue";
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
}

export const PANE_DEFAULTS = {
  treeSize: 18,
  treeMinSize: 10,
  stripSize: 24,
  stripMinSize: 8,
} as const;

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
      void setUserPreference(PANE_LAYOUT_PREFERENCE_KEY, {
        ...preference.value,
        groups: { ...preference.value.groups, [name]: value },
      });
    },
  };

  const showTree = computed(() => preference.value.showTree !== false);
  const showStrip = computed(() => preference.value.showStrip !== false);

  async function setShowTree(value: boolean) {
    await setUserPreference(PANE_LAYOUT_PREFERENCE_KEY, {
      ...preference.value,
      showTree: value,
    });
  }

  async function setShowStrip(value: boolean) {
    await setUserPreference(PANE_LAYOUT_PREFERENCE_KEY, {
      ...preference.value,
      showStrip: value,
    });
  }

  async function reset() {
    for (const key of Object.keys(pending)) delete pending[key];
    await setUserPreference(PANE_LAYOUT_PREFERENCE_KEY, {});
  }

  return { storage, showTree, showStrip, setShowTree, setShowStrip, reset };
}
