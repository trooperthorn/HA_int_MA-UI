import Default from "@/layouts/default/Default.vue";
import View from "@/layouts/default/View.vue";
import Footer from "@/layouts/default/Footer.vue";
import { store } from "@/plugins/store";
import { type VueWrapper, flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/plugins/store", async () => {
  const { reactive } = await vi.importActual<typeof import("vue")>("vue");
  return {
    store: reactive({
      frameless: false,
      activePlayerId: undefined,
      showFullscreenPlayer: false,
    }),
  };
});

const vuetify = createVuetify({ components, directives });

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: { template: "<div />" } }],
});

let wrapper: VueWrapper | undefined;

async function mountLayout(location = "/") {
  await router.push(location);
  await router.isReady();
  wrapper = mount(Default, {
    shallow: true,
    global: {
      plugins: [vuetify, router],
      // v-app hosts the whole tree, so it has to render its slot
      stubs: { VApp: { template: "<div><slot /></div>" } },
    },
  });
  return wrapper;
}

describe("Default layout", () => {
  beforeEach(() => {
    store.frameless = false;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("drops the player chrome in frameless mode", async () => {
    const layout = await mountLayout();
    expect(layout.findComponent(Footer).exists()).toBe(true);

    store.frameless = true;
    await nextTick();

    expect(layout.findComponent(Footer).exists()).toBe(false);
  });

  it("keeps the view mounted across a frameless toggle", async () => {
    const layout = await mountLayout();
    // the party dashboard lives in here and holds a wake lock, a burn-in timer
    // and fetched config, so going fullscreen must not restart it
    const view = layout.findComponent(View).element;

    store.frameless = true;
    await nextTick();

    expect(layout.findComponent(View).element).toBe(view);
  });
});

describe("Default layout fullscreen player query", () => {
  beforeEach(() => {
    store.showFullscreenPlayer = false;
    (store as { mobileLayout?: boolean }).mobileLayout = true;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("ignores a stale query flag on load and takes it out of the URL", async () => {
    await mountLayout("/?showFullscreenPlayer=1");
    await flushPromises();

    // a restored/bookmarked URL must not pop the player open ...
    expect(store.showFullscreenPlayer).toBe(false);
    // ... and must not leave the URL claiming it is open, or the history
    // guard below would see the two already agreeing and do nothing
    expect(
      router.currentRoute.value.query.showFullscreenPlayer,
    ).toBeUndefined();
  });

  it("still guards the back button for the rest of the session", async () => {
    await mountLayout("/?showFullscreenPlayer=1");
    await flushPromises();

    store.showFullscreenPlayer = true;
    await nextTick();
    await flushPromises();
    // an entry to go back to, so the OS back button closes the dialog instead
    // of leaving the app
    expect(router.currentRoute.value.query.showFullscreenPlayer).toBe("1");

    store.showFullscreenPlayer = false;
    await nextTick();
    await flushPromises();
    expect(
      router.currentRoute.value.query.showFullscreenPlayer,
    ).toBeUndefined();
  });
});
