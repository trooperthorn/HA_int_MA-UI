/** Version 1 of the optional Library Enrichment provider API. */
export interface ArchiveCapabilities {
  api_version: number;
  selected_capture: boolean;
  source_listing?: boolean;
  preview_preconditions?: boolean;
  version_listing?: boolean;
  archive_apply?: boolean;
  subscription_sync?: boolean;
  sync_policy_api_version?: number;
  interval_bounds?: { min: number; max: number };
  local_matching?: boolean;
  match_review_api_version?: number;
  max_match_review_page?: number;
  playback_policy?: boolean;
  playback_policy_api_version?: number;
  playback_policy_modes?: ArchivePlaybackPolicyMode[];
  playback_strict_signal?: string;
  item_provenance?: boolean;
  item_provenance_api_version?: number;
  itunes_import?: boolean;
  itunes_import_api_version?: number;
  max_itunes_preview_page?: number;
  max_items: number;
}

export interface ItunesPathMapping {
  source_root: string;
  target_root: string;
}

export interface ItunesImportPlaylist {
  id: string;
  name: string;
  track_count: number;
  kind: string;
  selectable: boolean;
  reason?: string | null;
}

export interface ItunesImportInspection {
  api_version: number;
  inspection_id: string;
  source_digest: string;
  library_path: string;
  tracks_total: number;
  playlists_total: number;
  roots: { source_root: string; suggested_target?: string | null }[];
  playlists: ItunesImportPlaylist[];
  warnings?: string[];
}

export interface ItunesImportPreview {
  api_version: number;
  inspection_id: string;
  source_digest: string;
  preview_digest: string;
  selected_playlists: number;
  source_tracks: number;
  matched: number;
  unresolved: number;
  ambiguous: number;
  unsupported: number;
}

export type ItemProvenanceState =
  | "current"
  | "source_changed"
  | "capture_pending"
  | "capture_failed"
  | "unknown";

/** Version 1 of the read-only provenance summary for a library item. */
export interface ItemProvenance {
  api_version: number;
  linked: boolean;
  media_type: "playlist";
  library_item_id: string;
  state: ItemProvenanceState;
  destination: {
    kind: "archive" | "playback";
    item_id: string;
    provider_instance_id: string;
    version_id: string | null;
    updated_at: string | null;
  } | null;
  subscription: {
    id: string;
    provider_domain: string;
    account_id: string;
    source_playlist_id: string;
    name: string;
  } | null;
  snapshots: {
    observed: { id: string; at: string | null } | null;
    attempted: { id: string; at: string | null } | null;
    committed: {
      id: string;
      at: string | null;
      version_id: string | null;
    } | null;
  } | null;
  check: {
    state: string;
    last_check_at: string | null;
    last_success_at: string | null;
    next_check_at: string | null;
    access_state: string | null;
    error_code: string | null;
  } | null;
}

export type ArchivePlaybackPolicyMode =
  | "prefer_local"
  | "local_only"
  | "prefer_spotify";

export interface ArchivePlaybackPolicy {
  subscription_id: string;
  mode: ArchivePlaybackPolicyMode;
  revision: number;
  actor_id?: string | null;
  updated_at?: string | null;
}

export interface ArchivePlaybackPreviewRow {
  position: number;
  selected_source: "local" | "spotify";
  uri: string;
  fallback: "spotify" | "local" | null;
  strict_provider: string | null;
}

export interface ArchivePlaybackPreviewGap {
  position: number;
  reason: "missing" | "ambiguous" | "rejected" | "unsupported" | string;
  omitted: boolean;
  fallback: "spotify" | "local" | null;
}

export interface ArchivePlaybackPreview {
  subscription_id: string;
  version_id: string;
  mode: ArchivePlaybackPolicyMode;
  name: string;
  policy_revision: number;
  source_count: number;
  projected_count: number;
  omitted_count: number;
  rows: ArchivePlaybackPreviewRow[];
  gaps: ArchivePlaybackPreviewGap[];
  projection_digest: string;
  requires_partial_consent: boolean;
  destination:
    | (ArchiveDestination & { builtin_provider_instance?: string })
    | null;
}

export interface ArchivePlaybackStatus {
  policy: ArchivePlaybackPolicy;
  projection: ArchivePlaybackProjectionStatus;
}

export interface ArchivePlaybackProjectionStatus {
  state:
    | "not_applied"
    | "pending"
    | "applying"
    | "applied"
    | "failed"
    | "uncertain"
    | "conflict";
  mode?: ArchivePlaybackPolicyMode;
  policy_revision?: number;
  source_count?: number;
  projected_count?: number;
  omitted_count?: number;
  projection_digest?: string;
  version_id?: string;
  gaps?: ArchivePlaybackPreviewGap[];
  destination?: ArchiveDestination | null;
  retryable?: boolean;
  error?: string | null;
}

export interface ArchiveSelection {
  provider_instance_id: string;
  source_playlist_id: string;
  max_items: number;
}

export interface ArchivePreview {
  provider_instance_id: string;
  source_playlist_id: string;
  account_id: string;
  snapshot_id: string;
  name: string;
  total: number;
  eligibility_reasons?: string[];
}

export interface ArchiveSourcePage {
  items: {
    source_playlist_id: string;
    name: string;
    library_item_id: string;
  }[];
  limit: number;
  offset: number;
  has_more: boolean;
  excluded?: { name: string; library_item_id: string; reason: string }[];
}

export interface ArchiveSubscription {
  id: string;
  account_id: string;
  provider_instance_id: string;
  source_playlist_id: string;
  name: string;
  observed_snapshot: string | null;
  committed_snapshot: string | null;
  committed_at: string | null;
  committed_version_id: string | null;
}

export interface ArchiveJob {
  id: string;
  subscription_id: string;
  state: "pending" | "committed" | "failed";
  received: number;
  total: number | null;
  error: string | null;
  created_at: string;
}

export interface ArchiveStatus {
  subscriptions: ArchiveSubscription[];
  jobs: ArchiveJob[];
}

export interface ArchiveVersion {
  id: string;
  snapshot_id: string;
  total: number;
  created_at: string;
}

export interface ArchiveDestination {
  item_id: string;
  provider_instance: string;
  uri: string;
  name: string;
}

export interface ArchiveApplyPreview {
  version_id: string;
  name: string;
  source_count: number;
  projected_count: number;
  omitted: { position: number; state: string }[];
  projection_digest: string;
  requires_partial_consent: boolean;
  already_applied: boolean;
  destination?: ArchiveDestination | null;
}

export interface ArchiveApplyStatus {
  state:
    | "not_applied"
    | "pending"
    | "prepared"
    | "applying"
    | "applied"
    | "partial"
    | "failed"
    | "uncertain"
    | "conflict";
  source_count?: number;
  projected_count?: number;
  omitted_count?: number;
  retryable?: boolean;
  destination?: ArchiveDestination | null;
  error?: string | null;
}

export interface ArchiveSyncPolicy {
  subscription_id: string;
  mode: "manual" | "scheduled";
  interval_seconds: number;
  initiating_user_id: string | null;
  revision: number;
  updated_at: string | null;
}

export interface ArchiveSyncJob {
  id: string;
  subscription_id: string;
  trigger: "manual" | "scheduled";
  state:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted";
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  observed_snapshot: string | null;
  version_id: string | null;
  error: string | null;
}

export interface ArchiveSyncStatus {
  policy: ArchiveSyncPolicy;
  state: {
    subscription_id: string;
    next_check_at: string | null;
    last_check_at: string | null;
    last_success_at: string | null;
    consecutive_failures: number;
    access_state:
      | "unknown"
      | "accessible"
      | "authentication_required"
      | "access_denied"
      | "temporarily_unavailable"
      | "provider_offline";
    last_error_code: string | null;
    last_error: string | null;
  };
  jobs: ArchiveSyncJob[];
  latest_job?: ArchiveSyncJob | null;
}

export type ArchiveMatchClassification =
  | "unmatched"
  | "candidate"
  | "ambiguous"
  | "approved"
  | "rejected";

export interface ArchiveMatchLocation {
  id: string;
  asset_id: string;
  provider_instance_id: string;
  item_id: string;
  evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ArchiveMatchAsset {
  id: string;
  media_type: "track";
  provider_instance_id: string;
  item_id: string;
  metadata: Record<string, unknown>;
  evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  locations: ArchiveMatchLocation[];
}

export interface ArchiveMatchCandidate {
  id: string;
  asset_id: string;
  score: number;
  evidence: Record<string, unknown>;
  algorithm_version: string;
  observed_at: string;
  rejected: boolean;
  approved: boolean;
  asset: ArchiveMatchAsset;
}

export interface ArchiveMatchDecision {
  id: string;
  source_id: string;
  asset_id: string | null;
  action: "approve" | "reject" | "clear";
  revision: number;
  actor_id: string;
  evidence: Record<string, unknown>;
  algorithm_version: string | null;
  created_at: string;
}

export interface ArchiveMatchOverlay {
  source: {
    id?: string;
    provider_domain: string;
    account_id: string;
    media_type: "track";
    source_item_id: string;
  };
  revision: number;
  decision: ArchiveMatchDecision | null;
  decision_history: ArchiveMatchDecision[];
  approved_asset_id: string | null;
  candidates: ArchiveMatchCandidate[];
}

export interface ArchiveMatchReviewItem {
  position: number;
  state: string;
  source_item_id: string;
  match: ArchiveMatchOverlay;
  classification: ArchiveMatchClassification;
}

export interface ArchiveMatchReviewPage {
  version_id: string;
  subscription_id: string;
  source: {
    provider_domain: string;
    provider_instance_id: string;
    account_id: string;
  };
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
  candidate_freshness: "fresh" | "stale";
  candidate_error: "library_read_failed" | null;
  items: ArchiveMatchReviewItem[];
}

export interface ArchiveMatchDecisionResult {
  match: ArchiveMatchOverlay;
  classification: ArchiveMatchClassification;
}
