import {
  ALL_SETTINGS_SECTIONS,
  useSettingsSections,
} from "@/views/settings/settingsSections";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: true,
  scopes: new Set<string>(),
  serverOk: true,
}));

vi.mock("@/plugins/auth", () => ({
  authManager: {
    isAdmin: () => mocks.isAdmin,
    hasScope: (scope: string) => mocks.scopes.has(scope),
  },
}));

vi.mock("@/plugins/api/helpers", () => ({
  requireServerVersion: () => mocks.serverOk,
}));

describe("settingsSections", () => {
  beforeEach(() => {
    mocks.isAdmin = true;
    mocks.scopes = new Set();
    mocks.serverOk = true;
  });

  it("gives an admin with the provider scope every section", () => {
    mocks.scopes.add("config.providers.own");
    expect(useSettingsSections().value.map((s) => s.name)).toEqual(
      ALL_SETTINGS_SECTIONS.map((s) => s.name),
    );
  });

  it("gates by admin, scope and server version", () => {
    mocks.isAdmin = false;
    mocks.serverOk = false;
    const names = useSettingsSections().value.map((s) => s.name);
    expect(names).toEqual(["profile", "frontend", "about"]);

    mocks.scopes.add("config.providers.own");
    expect(useSettingsSections().value.map((s) => s.name)).toContain(
      "music_providers",
    );
  });
});
