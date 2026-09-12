import ShortcutHelp from "@/library-manager/panes/ShortcutHelp.vue";
import { KEY_BINDINGS, LOCAL_KEY_ROWS } from "@/library-manager/keymap";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: { props: ["open"], template: "<div v-if='open'><slot /></div>" },
  DialogContent: { template: "<div><slot /></div>" },
  DialogHeader: { template: "<div><slot /></div>" },
  DialogTitle: { template: "<h2><slot /></h2>" },
  DialogDescription: { template: "<p><slot /></p>" },
}));

vi.mock("@/components/ui/kbd", () => ({
  Kbd: { template: "<kbd><slot /></kbd>" },
}));

enableAutoUnmount(afterEach);

describe("ShortcutHelp", () => {
  it("lists every binding and local key by scope", () => {
    const wrapper = mount(ShortcutHelp, {
      props: { open: true },
      global: { mocks: { $t: (key: string) => key } },
    });
    const text = wrapper.text();
    for (const binding of KEY_BINDINGS)
      expect(text).toContain(binding.labelKey);
    for (const local of LOCAL_KEY_ROWS) expect(text).toContain(local.labelKey);
    expect(text).toContain("settings.keyboard.scope_global");
    expect(text).toContain("settings.keyboard.scope_grid");
    expect(text).toContain("settings.keyboard.scope_queue");
    // a chord shows its two keys with "then" between
    const chord = wrapper
      .findAll(".shortcut-help__combo")
      .find(
        (el) =>
          el.text().replace(/\s+/g, "") === "Glibrary_manager.shortcuts.thenN",
      );
    expect(chord).toBeDefined();
  });

  it("renders nothing while closed", () => {
    const wrapper = mount(ShortcutHelp, {
      props: { open: false },
      global: { mocks: { $t: (key: string) => key } },
    });
    expect(wrapper.text()).toBe("");
  });
});
