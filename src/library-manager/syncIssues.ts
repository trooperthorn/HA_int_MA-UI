// The sync tasks keep a log of every file the import could not file
// properly (a missing album artist tag, a CUE sheet without its audio, an
// invalid MusicBrainz id). This turns those logs into rows the manager can
// list under "Sync issues", one folder per kind of failure, so the files can
// be fixed instead of read out of a log download.
import { runWithConcurrency } from "@/helpers/concurrency";
import { api } from "@/plugins/api";
import {
  MediaType,
  type AudioFormat,
  type BackgroundTask,
  type Track,
} from "@/plugins/api/interfaces";
import type { GridItem } from "./columns";

const MUSIC_SYNC_TASK_DOMAIN = "music_sync";

export type SyncIssueKind =
  | "missing_tag"
  | "cue_track_skipped"
  | "cue_audio_missing"
  | "invalid_musicbrainz_id"
  | "failed_to_process";

export interface SyncIssue {
  // kind plus detail, the folder the issue files under: "missing_tag:albumartist"
  type: string;
  kind: SyncIssueKind;
  // the tag for a missing-tag issue
  detail?: string;
  // the file, relative to the provider root (its item id for filesystem
  // providers)
  path: string;
  message: string;
  // how many log lines were merged into this one (a CUE sheet skips a line
  // per track)
  occurrences: number;
  providerInstance: string;
  providerDomain: string;
  providerName: string;
  taskId: string;
}

export interface SyncIssueGroup {
  type: string;
  kind: SyncIssueKind;
  detail?: string;
  count: number;
}

// "2026-09-12 20:52:37 WARNING [music_assistant.Filesystem (local disk)] message"
const LOG_LINE = /^\S+ \S+ (WARNING|ERROR|CRITICAL) \[[^\]]*\] (.*)$/;
const MISSING_TAG = /^(.+?) is missing ID3 tag \[(\w+)\]/;
const CUE_SKIPPED = /^CUE sheet (.+?\.cue) track \d+ (.+?); skipping$/i;
const MUSICBRAINZ = /^Ignoring invalid MusicBrainz identifier '[^']*' in (.+)$/;
const FAILED = /^Failed to process (.+?): (.+)$/;
const CUE_AUDIO_MISSING = /^Audio file not found for CUE sheet/i;

const metadataString = (task: BackgroundTask, key: string) => {
  const value = task.metadata[key];
  return typeof value === "string" ? value : "";
};

function parseMessage(
  message: string,
): Pick<SyncIssue, "kind" | "detail" | "path" | "type"> | undefined {
  let match = MISSING_TAG.exec(message);
  if (match) {
    const tag = match[2].toLowerCase();
    return {
      kind: "missing_tag",
      detail: tag,
      path: match[1],
      type: `missing_tag:${tag}`,
    };
  }
  match = CUE_SKIPPED.exec(message);
  if (match) {
    return {
      kind: "cue_track_skipped",
      path: match[1],
      type: "cue_track_skipped",
    };
  }
  match = MUSICBRAINZ.exec(message);
  if (match) {
    const where = match[1];
    // "in tags of artist X" names no file; only a path can be listed
    if (!where.includes("/") || where.startsWith("tags of ")) return undefined;
    return {
      kind: "invalid_musicbrainz_id",
      path: where,
      type: "invalid_musicbrainz_id",
    };
  }
  match = FAILED.exec(message);
  if (match) {
    const kind: SyncIssueKind = CUE_AUDIO_MISSING.test(match[2])
      ? "cue_audio_missing"
      : "failed_to_process";
    return { kind, path: match[1], type: kind };
  }
  return undefined;
}

/** Every issue the music sync tasks logged, in log order, merged per file. */
export function collectSyncIssues(tasks: BackgroundTask[]): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const seen = new Map<string, SyncIssue>();
  for (const task of tasks) {
    if (task.metadata.task_domain !== MUSIC_SYNC_TASK_DOMAIN) continue;
    const providerInstance = metadataString(task, "provider_instance");
    const providerDomain = metadataString(task, "provider_domain");
    const providerName = metadataString(task, "provider_name");
    const messages: string[] = [];
    for (const line of task.logs ?? []) {
      const match = LOG_LINE.exec(line);
      if (match) messages.push(match[2]);
    }
    messages.push(...(task.failure_messages ?? []));
    for (const message of messages) {
      const parsed = parseMessage(message);
      if (!parsed) continue;
      // a path never holds a newline, so it separates the parts safely
      const key = `${providerInstance}
${parsed.type}
${parsed.path}`;
      const existing = seen.get(key);
      if (existing) {
        existing.occurrences += 1;
        continue;
      }
      const issue: SyncIssue = {
        ...parsed,
        message,
        occurrences: 1,
        providerInstance,
        providerDomain,
        providerName,
        taskId: task.id,
      };
      seen.set(key, issue);
      issues.push(issue);
    }
  }
  return issues;
}

/** The issues folded into one folder per type, in first-seen order. */
export function groupSyncIssues(issues: SyncIssue[]): SyncIssueGroup[] {
  const groups = new Map<string, SyncIssueGroup>();
  for (const issue of issues) {
    const group = groups.get(issue.type);
    if (group) group.count += 1;
    else
      groups.set(issue.type, {
        type: issue.type,
        kind: issue.kind,
        detail: issue.detail,
        count: 1,
      });
  }
  return [...groups.values()];
}

/** Stable identity of the issue list, to notice when a sync changed it. */
export function syncIssuesKey(tasks: BackgroundTask[]): string {
  return collectSyncIssues(tasks)
    .map((issue) => `${issue.type}|${issue.providerInstance}|${issue.path}`)
    .join("\n");
}

export function syncIssueLabel(
  group: Pick<SyncIssueGroup, "kind" | "detail">,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (group.kind === "missing_tag") {
    return t("library_manager.sync_issues.missing_tag", {
      tag: group.detail ?? "",
    });
  }
  return t(`library_manager.sync_issues.${group.kind}`);
}

const AUDIO_FILE =
  /\.(flac|mp3|m4a|aac|ogg|oga|opus|wav|wma|aiff?|ape|wv|dsf|dff|mp4)$/i;

// a file the library never took in (a CUE sheet, an album.nfo, a file that
// failed to import) still gets a row, so it can be found and fixed
function placeholderRow(issue: SyncIssue): Track {
  const name = issue.path.split("/").pop() ?? issue.path;
  const extension = name.includes(".") ? (name.split(".").pop() ?? "") : "";
  return {
    item_id: issue.path,
    provider: issue.providerInstance,
    name,
    version: "",
    uri: `${issue.providerInstance}://track/${issue.path}`,
    external_ids: [],
    is_playable: false,
    media_type: MediaType.TRACK,
    provider_mappings: [
      {
        item_id: issue.path,
        provider_domain: issue.providerDomain,
        provider_instance: issue.providerInstance,
        available: false,
        in_library: false,
        audio_format: {
          content_type: extension.toLowerCase(),
        } as unknown as AudioFormat,
        details: null,
        url: null,
      },
    ],
    metadata: {},
    favorite: false,
    duration: 0,
    artists: [],
    album: null,
    disc_number: 0,
    track_number: 0,
  };
}

/**
 * Rows for the issues: the library's track for every audio file it holds
 * (looked up by path on its provider), a placeholder for anything else. The
 * issue rides along on the row for the grid's Issue column.
 */
export async function loadSyncIssueRows(
  issues: SyncIssue[],
): Promise<GridItem[]> {
  return runWithConcurrency(issues, async (issue) => {
    let row: Track | undefined;
    if (AUDIO_FILE.test(issue.path) && issue.providerInstance) {
      try {
        row = await api.getTrack(issue.path, issue.providerInstance);
      } catch {
        row = undefined;
      }
    }
    return {
      ...(row ?? placeholderRow(issue)),
      sync_issue: {
        type: issue.type,
        message: issue.message,
        path: issue.path,
        occurrences: issue.occurrences,
      },
    } as GridItem;
  });
}
