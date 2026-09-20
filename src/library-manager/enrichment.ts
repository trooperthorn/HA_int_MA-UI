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
  max_items: number;
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
