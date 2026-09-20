// Candidate copies ranked by format for review, not proof of byte identity.
// Everything comes from the
// track listing the server already returns (every copy is a provider
// mapping with its own audio format) and from
// the sync task log (orphaned CUE sheets). Nothing here writes; the page
// does that through the existing library commands.
import { api } from "@/plugins/api";
import {
  ExternalID,
  type ProviderMapping,
  type Track,
  type TrashEntry,
} from "@/plugins/api/interfaces";
import { collectSyncIssues, type SyncIssue } from "./syncIssues";

export type GroupKind = "copies" | "probable" | "cue";

/** Library summaries may omit IDs; omission is not an empty full record. */
export type DiagnosticTrack = Omit<Track, "external_ids"> & {
  external_ids?: Track["external_ids"] | null;
};

export interface FormatSummary {
  codec: string;
  lossless: boolean;
  sampleRate: number;
  bitDepth: number;
  bitRate: number;
  label: string;
  // higher is better
  score: number;
}

export interface CopyRow {
  id: string;
  trackId: string;
  trackName: string;
  artists: string;
  album: string;
  duration: number;
  mapping: ProviderMapping;
  // a file on a filesystem provider (the only kind the page removes)
  local: boolean;
  available: boolean;
  sourceInstance: string;
  sourceName: string;
  path: string;
  format: FormatSummary;
  // Reserved CSV field; no byte hashes are supplied by the listing contract.
  checksum: null;
  tagScore: number;
  tagsMissing: string[];
  tagsUnknown: string[];
}

export interface DuplicateGroup {
  id: string;
  kind: GroupKind;
  title: string;
  reason: string;
  rows: CopyRow[];
  // index into rows of the copy to keep
  keep: number;
}

/** One Filesystem source's trash folder, as the page shows it. */
export interface TrashBin {
  instance: string;
  name: string;
  entries: TrashEntry[];
}

export interface CueRow {
  path: string;
  providerInstance: string;
  providerName: string;
  message: string;
}

export const TAG_CHECKS = 5;
export const PAGE_SIZE = 500;
// the server's own tolerance when two ids disagree on a recording
export const DURATION_TOLERANCE_S = 8;

const LOSSLESS = new Set([
  "flac",
  "alac",
  "wav",
  "aiff",
  "aif",
  "pcm",
  "pcm_s16le",
  "pcm_s24le",
  "pcm_s32le",
  "pcm_f32le",
  "dsf",
  "dff",
  "ape",
  "wv",
  "wavpack",
  "tta",
]);
// at equal bit rate these encode better than mp3
const EFFICIENT_LOSSY = new Set(["aac", "m4a", "opus", "ogg", "vorbis"]);

export function summarizeFormat(mapping: ProviderMapping): FormatSummary {
  const format = mapping.audio_format;
  const codec = String(format?.content_type ?? "?").toLowerCase();
  const lossless = LOSSLESS.has(codec);
  const sampleRate = Number(format?.sample_rate ?? 0);
  const bitDepth = Number(format?.bit_depth ?? 0);
  const bitRate = Number(format?.bit_rate ?? 0);
  const parts = [codec.toUpperCase()];
  if (lossless) {
    if (sampleRate) parts.push(`${sampleRate / 1000} kHz`);
    if (bitDepth) parts.push(`${bitDepth}-bit`);
  } else if (bitRate) {
    parts.push(`${bitRate} kb/s`);
  }
  const score =
    (lossless ? 1_000_000_000 : 0) +
    (lossless ? bitDepth * 1_000_000 + sampleRate * 10 : bitRate * 10) +
    (EFFICIENT_LOSSY.has(codec) ? 1 : 0);
  return {
    codec,
    lossless,
    sampleRate,
    bitDepth,
    bitRate,
    label: parts.join(" "),
    score,
  };
}

function artistNames(track: DiagnosticTrack): string {
  return (track.artists ?? [])
    .map((artist) => artist.name)
    .filter(Boolean)
    .join(", ");
}

/** What the listing shows of a track's tags; missing ones by name. */
export function tagHealth(track: DiagnosticTrack): {
  score: number;
  missing: string[];
  unknown: string[];
} {
  const missing: string[] = [];
  const unknown: string[] = [];
  if (!track.album) missing.push("album");
  if (!track.track_number) missing.push("track_number");
  if (track.album && !track.album.year) missing.push("year");
  if (!Array.isArray(track.external_ids)) unknown.push("ids");
  else if (!track.external_ids.length) missing.push("ids");
  const albumImage =
    track.album && "image" in track.album ? track.album.image : null;
  const hasImage = !!track.metadata?.images?.length || !!albumImage;
  if (!hasImage) missing.push("cover");
  return {
    score: TAG_CHECKS - missing.length - unknown.length,
    missing,
    unknown,
  };
}

export function isLocalMapping(mapping: ProviderMapping): boolean {
  return mapping.provider_domain.startsWith("filesystem");
}

function sourceName(mapping: ProviderMapping): string {
  return (
    api.getProvider(mapping.provider_instance)?.name ??
    mapping.provider_instance
  );
}

export function rowsOf(track: DiagnosticTrack): CopyRow[] {
  const tags = tagHealth(track);
  return (track.provider_mappings ?? []).map((mapping) => {
    const local = isLocalMapping(mapping);
    return {
      id: `${track.item_id}|${mapping.provider_instance}|${mapping.item_id}`,
      trackId: String(track.item_id),
      trackName: track.name,
      artists: artistNames(track),
      album: track.album?.name ?? "",
      duration: track.duration ?? 0,
      mapping,
      local,
      available: mapping.available,
      sourceInstance: mapping.provider_instance,
      sourceName: sourceName(mapping),
      path: mapping.item_id,
      format: summarizeFormat(mapping),
      // Provider details are opaque change tokens (filesystem uses mtime).
      // Byte hashes need a separate algorithm-qualified backend contract.
      checksum: null,
      tagScore: tags.score,
      tagsMissing: tags.missing,
      tagsUnknown: tags.unknown,
    };
  });
}

/** The copy to keep: best format, then best tags, then the older row. */
export function keepIndex(rows: CopyRow[]): number {
  let best = 0;
  for (let index = 1; index < rows.length; index++) {
    const a = rows[best];
    const b = rows[index];
    if (
      b.format.score > a.format.score ||
      (b.format.score === a.format.score &&
        (b.tagScore > a.tagScore ||
          (b.tagScore === a.tagScore && Number(b.trackId) < Number(a.trackId))))
    ) {
      best = index;
    }
  }
  return best;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function recordingIds(track: DiagnosticTrack): string[] {
  return (track.external_ids ?? [])
    .filter(
      ([kind]) => kind === ExternalID.ISRC || kind === ExternalID.MB_RECORDING,
    )
    .map(([kind, value]) => `${kind}:${value}`);
}

/** Group the library's tracks into the kinds the page reports. */
export function buildGroups(tracks: DiagnosticTrack[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const rowsByTrack = new Map<string, CopyRow[]>();
  for (const track of tracks)
    rowsByTrack.set(String(track.item_id), rowsOf(track));

  // A: one track, several local copies
  for (const track of tracks) {
    const rows = rowsByTrack.get(String(track.item_id)) ?? [];
    const local = rows.filter((row) => row.local);
    if (local.length < 2) continue;
    groups.push({
      id: `copies:${track.item_id}`,
      kind: "copies",
      title: `${artistNames(track)} · ${track.name}`,
      reason: "merged at import",
      rows: [
        ...rows.filter((row) => row.local),
        ...rows.filter((row) => !row.local),
      ],
      keep: keepIndex(local),
    });
  }

  // Provider details cannot establish byte identity. Only review candidates
  // based on names and durations/recording IDs are built across tracks.
  const byKey = new Map<string, DiagnosticTrack[]>();
  for (const track of tracks) {
    const first = track.artists?.[0]?.name ?? "";
    const key = `${normalizeName(track.name)}|${normalizeName(first)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), track]);
  }
  for (const [key, candidates] of byKey) {
    if (candidates.length < 2) continue;
    const remaining = [...candidates];
    while (remaining.length > 1) {
      const seed = remaining.shift() as DiagnosticTrack;
      const seedIds = new Set(recordingIds(seed));
      const cluster = [seed];
      for (const other of remaining.slice()) {
        const sameRecording = recordingIds(other).some((id) => seedIds.has(id));
        const closeEnough =
          Math.abs((other.duration ?? 0) - (seed.duration ?? 0)) <=
          DURATION_TOLERANCE_S;
        if (sameRecording || closeEnough) {
          cluster.push(other);
          remaining.splice(remaining.indexOf(other), 1);
        }
      }
      if (cluster.length < 2) continue;
      const rows = cluster.flatMap(
        (track) => rowsByTrack.get(String(track.item_id)) ?? [],
      );
      groups.push({
        id: `probable:${key}:${cluster.map((track) => track.item_id).join(",")}`,
        kind: "probable",
        title: `${artistNames(seed)} · ${seed.name}`,
        reason: "name and duration",
        rows,
        keep: keepIndex(rows),
      });
    }
  }
  return groups;
}

/** Orphaned CUE sheets, from the sync task log. */
export function cueRowsFrom(issues: SyncIssue[]): CueRow[] {
  return issues
    .filter((issue) => issue.kind === "cue_audio_missing")
    .map((issue) => ({
      path: issue.path,
      providerInstance: issue.providerInstance,
      providerName: issue.providerName,
      message: issue.message,
    }));
}

/** Every library track, 500 at a time. */
export async function scanLibrary(
  onProgress?: (count: number) => void,
): Promise<DiagnosticTrack[]> {
  const tracks: DiagnosticTrack[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await api.getLibraryTracks(
      undefined,
      undefined,
      PAGE_SIZE,
      offset,
      "sort_name",
    );
    tracks.push(...page);
    onProgress?.(tracks.length);
    if (page.length < PAGE_SIZE) break;
  }
  return tracks;
}

/**
 * The trash folders of the given Filesystem sources. The commands are an
 * app-side edit of the server; a server without them answers "unknown
 * command" on the first source, and null says so (the page then hides
 * every trash action).
 */
export async function loadTrashBins(
  sources: { id: string; name: string }[],
): Promise<TrashBin[] | null> {
  const bins: TrashBin[] = [];
  for (const source of sources) {
    try {
      const entries = await api.trashList(source.id, {
        suppressGlobalError: true,
      });
      bins.push({ instance: source.id, name: source.name, entries });
    } catch (error) {
      if (bins.length === 0) {
        console.info("duplicates: trash commands unavailable", error);
        return null;
      }
      // this source's folder could not be read; the others still count
      bins.push({ instance: source.id, name: source.name, entries: [] });
    }
  }
  return bins;
}

export async function loadCueRows(): Promise<CueRow[]> {
  const tasks = await api.getTasks();
  return cueRowsFrom(collectSyncIssues(tasks));
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(groups: DuplicateGroup[], cues: CueRow[]): string {
  const lines = [
    [
      "kind",
      "group",
      "keep",
      "track",
      "artists",
      "album",
      "source",
      "path",
      "format",
      "checksum",
      "tags_missing",
      "tags_unknown",
    ].join(","),
  ];
  for (const group of groups) {
    group.rows.forEach((row, index) => {
      lines.push(
        [
          group.kind,
          group.title,
          index === group.keep ? "keep" : "",
          row.trackName,
          row.artists,
          row.album,
          row.sourceName,
          row.path,
          row.format.label,
          row.checksum ?? "",
          row.tagsMissing.join(" "),
          row.tagsUnknown.join(" "),
        ]
          .map(csvCell)
          .join(","),
      );
    });
  }
  for (const cue of cues) {
    lines.push(
      [
        "cue",
        "orphaned CUE sheet",
        "",
        "",
        "",
        "",
        cue.providerName,
        cue.path,
        "",
        "",
        "",
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
