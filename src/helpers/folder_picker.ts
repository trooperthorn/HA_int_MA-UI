// Whether the server offers the folder listing the picker needs. The
// command is an app-side edit of the server (ha_app_music_assistant's
// browse_path patch); an image without it answers "unknown command", and
// the picker then stays a plain text field. Asked once per page load.
import { api } from "@/plugins/api";

// the provider whose path entry gets the picker
export const FILESYSTEM_DOMAIN = "filesystem_local";
export const FOLDER_PATH_KEY = "path";

let probe: Promise<boolean> | null = null;

export function folderBrowseAvailable(): Promise<boolean> {
  probe ??= api
    .browseProviderPath(undefined, { suppressGlobalError: true })
    .then(() => true)
    .catch(() => false);
  return probe;
}

/** For tests: forget the answer so the next call asks again. */
export function resetFolderBrowseProbe() {
  probe = null;
}

export function isFolderPathEntry(
  providerDomain: string | undefined,
  key: string,
): boolean {
  return providerDomain === FILESYSTEM_DOMAIN && key === FOLDER_PATH_KEY;
}
