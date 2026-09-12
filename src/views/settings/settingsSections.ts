import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import { requireServerVersion } from "@/plugins/api/helpers";
import { Scope } from "@/plugins/api/interfaces";
import { authManager } from "@/plugins/auth";

export interface SettingsSection {
  name: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  route: RouteLocationRaw;
  adminOnly: boolean;
  requiresScope?: Scope;
  minServerVersion?: string;
}

// every top-level settings area, in the order the overview and the tree show
// them; gating (admin, scope, server version) is applied by useSettingsSections
export const ALL_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    name: "music_providers",
    label: "settings.music_sources",
    description: "settings.music_providers_description",
    icon: "mdi-music",
    color: "blue",
    route: { name: "providersettings", query: { types: "music" } },
    // a member holding the scope manages the music sources it owns here
    adminOnly: false,
    requiresScope: Scope.CONFIG_PROVIDERS_OWN,
  },
  {
    name: "player_providers",
    label: "settings.playerproviders",
    description: "settings.player_providers_description",
    icon: "mdi-speaker-multiple",
    color: "green",
    route: { name: "providersettings", query: { types: "player" } },
    adminOnly: true,
  },
  {
    name: "metadata_providers",
    label: "settings.metadataproviders",
    description: "settings.metadata_providers_description",
    icon: "mdi-file-code",
    color: "indigo",
    route: { name: "providersettings", query: { types: "metadata" } },
    adminOnly: true,
  },
  {
    name: "plugin_providers",
    label: "settings.plugins",
    description: "settings.plugin_providers_description",
    icon: "mdi-puzzle",
    color: "deep-purple",
    route: { name: "providersettings", query: { types: "plugin" } },
    adminOnly: true,
  },
  {
    name: "players",
    label: "settings.players",
    description: "settings.players_description",
    icon: "mdi-tune",
    color: "teal",
    route: { name: "playersettings" },
    adminOnly: true,
  },
  {
    name: "audio_analysis_providers",
    label: "settings.audio_analysis_providers",
    description: "settings.audio_analysis_providers_description",
    icon: "mdi-waveform",
    color: "blue",
    route: { name: "providersettings", query: { types: "audio_analysis" } },
    adminOnly: true,
    minServerVersion: "2.9.0",
  },
  {
    name: "profile",
    label: "auth.profile",
    description: "settings.profile_description",
    icon: "mdi-account-cog",
    color: "indigo",
    route: { name: "profile" },
    adminOnly: false,
  },
  {
    name: "frontend",
    label: "settings.frontend",
    description: "settings.frontend_description",
    icon: "mdi-palette",
    color: "orange",
    route: { name: "frontendsettings" },
    adminOnly: false,
  },
  {
    name: "users",
    label: "auth.user_management",
    description: "settings.users_description",
    icon: "mdi-account-multiple",
    color: "teal",
    route: { name: "usersettings" },
    adminOnly: true,
  },
  {
    name: "remote_access",
    label: "settings.remote_access",
    description: "settings.remote_access_description",
    icon: "mdi-cloud-lock",
    color: "deep-purple",
    route: { name: "remoteaccesssettings" },
    adminOnly: true,
  },
  {
    name: "system",
    label: "settings.system",
    description: "settings.system_description",
    icon: "mdi-server",
    color: "purple",
    route: { name: "systemsettings" },
    adminOnly: true,
  },
  {
    name: "about",
    label: "settings.about",
    description: "settings.about_description",
    icon: "mdi-information-outline",
    color: "grey-darken-1",
    route: { name: "aboutsettings" },
    adminOnly: false,
  },
];

export function isSectionAvailable(section: SettingsSection): boolean {
  const isAdmin = authManager.isAdmin();
  return (
    (!section.adminOnly || isAdmin) &&
    (!section.requiresScope || authManager.hasScope(section.requiresScope)) &&
    (!section.minServerVersion ||
      requireServerVersion(section.minServerVersion))
  );
}

// the sections this user may open
export function useSettingsSections() {
  return computed(() => ALL_SETTINGS_SECTIONS.filter(isSectionAvailable));
}
