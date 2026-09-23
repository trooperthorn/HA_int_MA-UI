import { vi } from "vitest";

// Vite's PWA virtual module resolves to a non-filesystem URL on Windows.
// Layout tests only need the inactive state; service-worker registration is
// covered by the production build.
vi.mock("virtual:pwa-register/vue", async () => {
  const { ref } = await import("vue");
  return {
    useRegisterSW: () => ({
      offlineReady: ref(false),
      needRefresh: ref(false),
      updateServiceWorker: vi.fn(),
    }),
  };
});
