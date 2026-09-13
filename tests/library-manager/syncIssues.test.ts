import {
  collectSyncIssues,
  groupSyncIssues,
  loadSyncIssueRows,
  syncIssueLabel,
  syncIssuesKey,
} from "@/library-manager/syncIssues";
import type { MusicAssistantApi } from "@/plugins/api";
import { TaskStatus, type BackgroundTask } from "@/plugins/api/interfaces";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../fixtures/track";

const { mockGetTrack } = vi.hoisted(() => ({
  mockGetTrack: vi.fn<MusicAssistantApi["getTrack"]>(),
}));

vi.mock("@/plugins/api", () => {
  const api = { getTrack: mockGetTrack };
  return { api, default: api };
});

const LOG = "2026-09-12 20:52:37";

function syncTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: "music_sync_filesystem_local--fY5pwggS_track",
    name: "Sync Tracks for Filesystem (local disk)",
    status: TaskStatus.PARTIAL_SUCCESS,
    report: null,
    logs: [],
    schedule: null,
    last_run: null,
    next_run: null,
    user_id: null,
    last_run_user_id: null,
    created_at: "",
    updated_at: "",
    started_at: null,
    finished_at: null,
    last_error: null,
    failure_count: 0,
    failure_messages: [],
    metadata: {
      task_domain: "music_sync",
      media_type: "track",
      provider_domain: "filesystem_local",
      provider_instance: "filesystem_local--fY5pwggS",
      provider_name: "Filesystem (local disk)",
    },
    progress: null,
    progress_text: null,
    allow_retry: false,
    allow_cancel: false,
    ...overrides,
  };
}

const fs = "[music_assistant.Filesystem (local disk)]";
const tags = "[music_assistant.tags]";

const SAMPLE = syncTask({
  logs: [
    `${LOG} WARNING ${fs} Lorde/Melodrama/01 - Green Light.flac is missing ID3 tag [albumartist], using Various Artists as fallback`,
    `${LOG} WARNING ${fs} Lorde/Pure Heroine/01 - Tennis Court.flac is missing ID3 tag [albumartist], using Various Artists as fallback`,
    `${LOG} WARNING ${tags} Invalid replaygaintrackgain tag value: 'eplaygai' — could not convert string to float: 'eplaygai'`,
    `${LOG} WARNING ${tags} Ignoring invalid MusicBrainz identifier 'MusicBrainz Album Artist Id' in tags of artist T.I.`,
    `${LOG} WARNING ${tags} Ignoring invalid MusicBrainz identifier 'MusicBrainz Album Artist Id' in T.I/T.I. Vs. T.I.P/album.nfo`,
    `${LOG} WARNING ${fs} CUE sheet Taylor Swift/1989/Taylor Swift - 1989.cue track 1 has non-positive duration (0.00s); skipping`,
    `${LOG} WARNING ${fs} CUE sheet Taylor Swift/1989/Taylor Swift - 1989.cue track 2 has non-positive duration (0.00s); skipping`,
    `${LOG} WARNING ${fs} CUE sheet Taylor Swift/1989/Taylor Swift - 1989.cue track 13 has no TITLE; skipping`,
    `${LOG} INFO [music_assistant.tasks] Task completed with 7 issue(s)`,
  ],
  failure_messages: [
    "Failed to process Aaron Lewis/Town Line/Town Line.cue: Audio file not found for CUE sheet: Aaron Lewis/Town Line/Town Line.cue",
    "Failed to process Broken/file.mp3: Something else went wrong",
  ],
});

describe("collectSyncIssues", () => {
  it("turns the sync task's log and failures into one issue per file", () => {
    const issues = collectSyncIssues([SAMPLE]);
    expect(
      issues.map((issue) => [issue.type, issue.path, issue.occurrences]),
    ).toEqual([
      ["missing_tag:albumartist", "Lorde/Melodrama/01 - Green Light.flac", 1],
      [
        "missing_tag:albumartist",
        "Lorde/Pure Heroine/01 - Tennis Court.flac",
        1,
      ],
      ["invalid_musicbrainz_id", "T.I/T.I. Vs. T.I.P/album.nfo", 1],
      ["cue_track_skipped", "Taylor Swift/1989/Taylor Swift - 1989.cue", 3],
      ["cue_audio_missing", "Aaron Lewis/Town Line/Town Line.cue", 1],
      ["failed_to_process", "Broken/file.mp3", 1],
    ]);
    expect(issues[0]).toMatchObject({
      kind: "missing_tag",
      detail: "albumartist",
      providerInstance: "filesystem_local--fY5pwggS",
      providerDomain: "filesystem_local",
      providerName: "Filesystem (local disk)",
      taskId: SAMPLE.id,
    });
  });

  it("ignores tasks outside the music sync and lines naming no file", () => {
    const other = syncTask({
      id: "something_else",
      metadata: { task_domain: "maintenance" },
      logs: [
        `${LOG} WARNING ${fs} Lorde/Melodrama/01 - Green Light.flac is missing ID3 tag [albumartist], using Various Artists as fallback`,
      ],
    });
    expect(collectSyncIssues([other])).toEqual([]);
    expect(collectSyncIssues([syncTask()])).toEqual([]);
  });

  it("groups by type in first-seen order and labels each", () => {
    const groups = groupSyncIssues(collectSyncIssues([SAMPLE]));
    expect(groups.map((group) => [group.type, group.count])).toEqual([
      ["missing_tag:albumartist", 2],
      ["invalid_musicbrainz_id", 1],
      ["cue_track_skipped", 1],
      ["cue_audio_missing", 1],
      ["failed_to_process", 1],
    ]);
    const t = (key: string, params?: Record<string, string>) =>
      params ? `${key}:${params.tag}` : key;
    expect(syncIssueLabel(groups[0], t)).toBe(
      "library_manager.sync_issues.missing_tag:albumartist",
    );
    expect(syncIssueLabel(groups[2], t)).toBe(
      "library_manager.sync_issues.cue_track_skipped",
    );
  });

  it("keys the issue list by content", () => {
    expect(syncIssuesKey([SAMPLE])).toBe(syncIssuesKey([{ ...SAMPLE }]));
    expect(syncIssuesKey([SAMPLE])).not.toBe(syncIssuesKey([syncTask()]));
  });
});

describe("loadSyncIssueRows", () => {
  beforeEach(() => {
    mockGetTrack.mockReset();
  });

  it("looks audio files up on their provider and gives the rest a placeholder", async () => {
    mockGetTrack.mockImplementation(async (itemId) => {
      if (itemId.endsWith("Green Light.flac")) {
        return track({ item_id: "42", name: "Green Light" });
      }
      throw new Error("not found");
    });

    const rows = await loadSyncIssueRows(collectSyncIssues([SAMPLE]));

    expect(mockGetTrack).toHaveBeenCalledWith(
      "Lorde/Melodrama/01 - Green Light.flac",
      "filesystem_local--fY5pwggS",
    );
    // the nfo and cue sheets are never asked for
    expect(mockGetTrack).toHaveBeenCalledTimes(3);

    expect(rows[0]).toMatchObject({
      item_id: "42",
      name: "Green Light",
      sync_issue: {
        type: "missing_tag:albumartist",
        path: "Lorde/Melodrama/01 - Green Light.flac",
        occurrences: 1,
      },
    });
    // a lookup that fails still lists the file
    expect(rows[1]).toMatchObject({
      name: "01 - Tennis Court.flac",
      is_playable: false,
      provider: "filesystem_local--fY5pwggS",
    });
    expect(rows[3]).toMatchObject({
      name: "Taylor Swift - 1989.cue",
      is_playable: false,
      provider_mappings: [
        {
          item_id: "Taylor Swift/1989/Taylor Swift - 1989.cue",
          provider_instance: "filesystem_local--fY5pwggS",
          available: false,
        },
      ],
      sync_issue: { type: "cue_track_skipped", occurrences: 3 },
    });
  });
});
